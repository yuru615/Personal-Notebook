use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    sync::{atomic::Ordering, MutexGuard},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[cfg(not(test))]
use std::sync::atomic::AtomicU64;

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::{
    AppSettings, AssetMeta, ExchangeArchiveManifest, Storage, StorageError, StorageResult,
    WorkspaceArchivePayload, EXCHANGE_ARCHIVE_FORMAT, EXCHANGE_ARCHIVE_VERSION,
    EXCHANGE_ASSET_MANIFEST_ENTRY, EXCHANGE_MANIFEST_ENTRY, EXCHANGE_PAYLOAD_ENTRY,
    EXCHANGE_WORKSPACE_BACKUP_KIND,
};

pub const AUTO_BACKUP_DIR_NAME: &str = "zhiqi-auto-backups";

const AUTO_BACKUP_FILE_PREFIX: &str = "auto-";
const AUTO_BACKUP_FILE_EXTENSION: &str = "zhiqi";
const PROTECTION_BACKUP_FILE_PREFIX: &str = "protection-";
const AUTO_BACKUP_RUNTIME_SETTINGS_ID: &str = "autoBackupRuntime";
#[cfg(not(test))]
static AUTO_BACKUP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupRecord {
    pub file_name: String,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupRecoveryStatus {
    pub should_offer_restore: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_backup: Option<AutoBackupRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recovery_check_warning: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupRunResult {
    pub created: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_backup: Option<AutoBackupRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skipped_reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupRestoreResult {
    pub restored: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protection_backup_warning: Option<String>,
}

#[derive(Debug)]
pub(super) struct AutoBackupRuntime {
    workspace_change_baseline: u64,
    last_backup_at: SystemTime,
}

impl AutoBackupRuntime {
    pub(super) fn new(workspace_change_baseline: u64, last_backup_at: SystemTime) -> Self {
        Self {
            workspace_change_baseline,
            last_backup_at,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AutoBackupRuntimeState {
    pub session_running: bool,
}

impl Storage {
    pub fn create_auto_backup_at(
        &self,
        now: SystemTime,
        retention_count: usize,
    ) -> StorageResult<AutoBackupRecord> {
        let record = self.auto_backup_record(now)?;
        fs::create_dir_all(&self.auto_backup_dir)?;
        clean_up_abandoned_temporary_archives(&self.auto_backup_dir)?;
        let archive = self.export_workspace_archive()?;

        let final_path = self.auto_backup_dir.join(&record.file_name);
        let temporary_path = self.auto_backup_dir.join(format!(
            ".{}.tmp-{}",
            record.file_name,
            self.next_auto_backup_file_sequence()
        ));
        write_temporary_archive(&temporary_path, &archive)?;
        publish_temporary_archive(&temporary_path, &final_path)?;

        self.trim_auto_backups(retention_count.max(1))?;
        Ok(record)
    }

    pub fn list_auto_backups(&self) -> StorageResult<Vec<AutoBackupRecord>> {
        let entries = match fs::read_dir(&self.auto_backup_dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(error.into()),
        };
        let mut backups = Vec::new();
        for entry in entries {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                continue;
            }
            let Some(file_name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if let Some(backup) = parse_auto_backup_record(&file_name) {
                backups.push(backup);
            }
        }
        backups.sort_by(|left, right| right.file_name.cmp(&left.file_name));
        Ok(backups)
    }

    pub fn begin_auto_backup_session(&self) -> StorageResult<AutoBackupRecoveryStatus> {
        let previous = self.load_auto_backup_runtime_state()?.unwrap_or_default();
        let (latest_backup, recovery_check_warning) = match self.latest_valid_auto_backup() {
            Ok(latest_backup) => (latest_backup.map(|(backup, _)| backup), None),
            Err(error) => (None, Some(format!("检查自动备份时失败：{error}"))),
        };
        self.save_auto_backup_runtime_state(&AutoBackupRuntimeState {
            session_running: true,
        })?;
        Ok(AutoBackupRecoveryStatus {
            should_offer_restore: previous.session_running && latest_backup.is_some(),
            latest_backup,
            recovery_check_warning,
        })
    }

    pub fn mark_auto_backup_session_clean(&self) -> StorageResult<()> {
        self.save_auto_backup_runtime_state(&AutoBackupRuntimeState {
            session_running: false,
        })
    }

    pub fn run_auto_backup(&self) -> StorageResult<AutoBackupRunResult> {
        self.run_auto_backup_at(SystemTime::now())
    }

    pub fn run_auto_backup_at(&self, now: SystemTime) -> StorageResult<AutoBackupRunResult> {
        let settings = self.load_app_settings()?.unwrap_or_else(AppSettings::default);
        if !settings.auto_backup.enabled {
            return Ok(AutoBackupRunResult {
                created: false,
                latest_backup: None,
                skipped_reason: Some("disabled".to_string()),
            });
        }

        let current_changes = self.connection.total_changes();
        {
            let runtime = self.auto_backup_runtime()?;
            if current_changes <= runtime.workspace_change_baseline {
                return Ok(AutoBackupRunResult {
                    created: false,
                    latest_backup: None,
                    skipped_reason: Some("no_workspace_changes".to_string()),
                });
            }
            if now
                .duration_since(runtime.last_backup_at)
                .unwrap_or_default()
                < Duration::from_secs(u64::from(settings.auto_backup.interval_minutes) * 60)
            {
                return Ok(AutoBackupRunResult {
                    created: false,
                    latest_backup: None,
                    skipped_reason: Some("interval_not_elapsed".to_string()),
                });
            }
        }

        let backup = self.create_auto_backup_at(now, usize::from(settings.auto_backup.retention_count))?;
        self.mark_auto_backup_workspace_as_backed_up(now)?;
        Ok(AutoBackupRunResult {
            created: true,
            latest_backup: Some(backup),
            skipped_reason: None,
        })
    }

    pub fn restore_latest_auto_backup(&self) -> StorageResult<AutoBackupRestoreResult> {
        let protection_backup_warning = self
            .create_protection_backup_at(SystemTime::now())
            .err()
            .map(|error| format!("当前工作区的保护备份创建失败，已继续恢复：{error}"));

        let Some((_, archive)) = self.latest_valid_auto_backup()? else {
            return Err(StorageError::not_found("no readable automatic backup is available"));
        };

        self.import_workspace_archive(archive)?;
        self.mark_auto_backup_workspace_as_backed_up(SystemTime::now())?;
        Ok(AutoBackupRestoreResult {
            restored: true,
            protection_backup_warning,
        })
    }

    pub(super) fn load_auto_backup_runtime_state(
        &self,
    ) -> StorageResult<Option<AutoBackupRuntimeState>> {
        let record_json = self
            .connection
            .query_row(
                "SELECT record_json FROM zhiqi_settings WHERE id = ?1",
                [AUTO_BACKUP_RUNTIME_SETTINGS_ID],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        record_json
            .map(|record_json| serde_json::from_str(&record_json).map_err(Into::into))
            .transpose()
    }

    pub(super) fn save_auto_backup_runtime_state(
        &self,
        state: &AutoBackupRuntimeState,
    ) -> StorageResult<()> {
        let before = self.connection.total_changes();
        self.connection.execute(
            "INSERT INTO zhiqi_settings (id, record_json) VALUES (?1, ?2)
             ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json",
            params![AUTO_BACKUP_RUNTIME_SETTINGS_ID, serde_json::to_string(state)?],
        )?;
        self.ignore_non_workspace_database_changes_since(before)
    }

    pub(super) fn ignore_non_workspace_database_changes_since(
        &self,
        before: u64,
    ) -> StorageResult<()> {
        let ignored_changes = self.connection.total_changes().saturating_sub(before);
        if ignored_changes == 0 {
            return Ok(());
        }
        let mut runtime = self.auto_backup_runtime()?;
        runtime.workspace_change_baseline = runtime
            .workspace_change_baseline
            .saturating_add(ignored_changes);
        Ok(())
    }

    pub(super) fn mark_auto_backup_workspace_as_backed_up(
        &self,
        now: SystemTime,
    ) -> StorageResult<()> {
        let mut runtime = self.auto_backup_runtime()?;
        runtime.workspace_change_baseline = self.connection.total_changes();
        runtime.last_backup_at = now;
        Ok(())
    }

    #[cfg(test)]
    pub fn set_auto_backup_last_run_at_for_tests(&self, last_backup_at: SystemTime) {
        self.auto_backup_runtime
            .lock()
            .expect("automatic backup runtime lock")
            .last_backup_at = last_backup_at;
    }

    fn trim_auto_backups(&self, retention_count: usize) -> StorageResult<()> {
        for backup in self.list_auto_backups()?.into_iter().skip(retention_count) {
            fs::remove_file(self.auto_backup_dir.join(backup.file_name))?;
        }
        Ok(())
    }

    fn auto_backup_record(&self, now: SystemTime) -> StorageResult<AutoBackupRecord> {
        auto_backup_record(now, self.next_auto_backup_file_sequence())
    }

    fn latest_valid_auto_backup(&self) -> StorageResult<Option<(AutoBackupRecord, Vec<u8>)>> {
        for backup in self.list_auto_backups()? {
            let archive = match fs::read(self.auto_backup_dir.join(&backup.file_name)) {
                Ok(archive) => archive,
                Err(_) => continue,
            };
            if self.validate_workspace_archive(&archive).is_ok() {
                return Ok(Some((backup, archive)));
            }
        }
        Ok(None)
    }

    fn validate_workspace_archive(&self, bytes: &[u8]) -> StorageResult<()> {
        let mut archive = match zip::ZipArchive::new(std::io::Cursor::new(bytes)) {
            Ok(archive) => archive,
            Err(_) => {
                let _: super::WorkspaceSnapshot = serde_json::from_slice(bytes)?;
                return Ok(());
            }
        };
        let manifest: ExchangeArchiveManifest =
            super::read_archive_json(&mut archive, EXCHANGE_MANIFEST_ENTRY)?;
        if manifest.format != EXCHANGE_ARCHIVE_FORMAT
            || manifest.format_version != EXCHANGE_ARCHIVE_VERSION
        {
            return Err(StorageError::new(
                "archive_unsupported_version",
                "unsupported exchange archive version",
            ));
        }
        if manifest.kind != EXCHANGE_WORKSPACE_BACKUP_KIND {
            return Err(StorageError::new(
                "archive_wrong_kind",
                "page package cannot restore a workspace backup",
            ));
        }
        let payload: WorkspaceArchivePayload =
            super::read_archive_json(&mut archive, EXCHANGE_PAYLOAD_ENTRY)?;
        let assets: Vec<AssetMeta> =
            super::read_archive_json(&mut archive, EXCHANGE_ASSET_MANIFEST_ENTRY)?;
        self.ensure_workspace_archive_assets_are_complete(&payload.workspace, &assets)?;
        for asset in &assets {
            let path = format!("assets/{}", asset.relative_path);
            let mut entry = archive.by_name(&path).map_err(|_| {
                StorageError::new("archive_missing_asset", format!("archive asset is missing: {path}"))
            })?;
            std::io::copy(&mut entry, &mut std::io::sink())?;
        }
        Ok(())
    }

    fn create_protection_backup_at(&self, now: SystemTime) -> StorageResult<()> {
        fs::create_dir_all(&self.auto_backup_dir)?;
        let archive = self.export_workspace_archive()?;
        let timestamp_nanos = now
            .duration_since(UNIX_EPOCH)
            .map_err(|_| StorageError::invalid_payload("automatic backup timestamp is before Unix epoch"))?
            .as_nanos();
        let file_name = format!(
            "{PROTECTION_BACKUP_FILE_PREFIX}{timestamp_nanos:039}-{:020}.{AUTO_BACKUP_FILE_EXTENSION}",
            self.next_auto_backup_file_sequence()
        );
        let final_path = self.auto_backup_dir.join(&file_name);
        let temporary_path = self.auto_backup_dir.join(format!(
            ".{file_name}.tmp-{}",
            self.next_auto_backup_file_sequence()
        ));
        write_temporary_archive(&temporary_path, &archive)?;
        publish_temporary_archive(&temporary_path, &final_path)
    }

    fn auto_backup_runtime(&self) -> StorageResult<MutexGuard<'_, AutoBackupRuntime>> {
        self.auto_backup_runtime
            .lock()
            .map_err(|_| StorageError::new("conflict", "automatic backup runtime lock poisoned"))
    }

    fn next_auto_backup_file_sequence(&self) -> u64 {
        #[cfg(test)]
        {
            return self
                .auto_backup_file_sequence
                .fetch_add(1, Ordering::Relaxed);
        }
        #[cfg(not(test))]
        {
            AUTO_BACKUP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        }
    }

    #[cfg(test)]
    pub fn set_auto_backup_file_sequence_for_tests(&self, sequence: u64) {
        self.auto_backup_file_sequence
            .store(sequence, Ordering::Relaxed);
    }
}

fn auto_backup_record(now: SystemTime, sequence: u64) -> StorageResult<AutoBackupRecord> {
    let timestamp_nanos = now
        .duration_since(UNIX_EPOCH)
        .map_err(|_| {
            StorageError::invalid_payload("automatic backup timestamp is before Unix epoch")
        })?
        .as_nanos();
    Ok(AutoBackupRecord {
        file_name: format!(
            "{AUTO_BACKUP_FILE_PREFIX}{timestamp_nanos:039}-{sequence:020}.{AUTO_BACKUP_FILE_EXTENSION}"
        ),
        created_at: format!("unix-ms:{}", timestamp_nanos / 1_000_000),
    })
}

fn parse_auto_backup_record(file_name: &str) -> Option<AutoBackupRecord> {
    let stem = file_name
        .strip_prefix(AUTO_BACKUP_FILE_PREFIX)?
        .strip_suffix(&format!(".{AUTO_BACKUP_FILE_EXTENSION}"))?;
    let (timestamp_nanos, sequence) = stem.split_once('-')?;
    if timestamp_nanos.len() != 39
        || sequence.len() != 20
        || !timestamp_nanos.bytes().all(|byte| byte.is_ascii_digit())
        || !sequence.bytes().all(|byte| byte.is_ascii_digit())
    {
        return None;
    }
    let timestamp_nanos = timestamp_nanos.parse::<u128>().ok()?;
    sequence.parse::<u64>().ok()?;
    Some(AutoBackupRecord {
        file_name: file_name.to_string(),
        created_at: format!("unix-ms:{}", timestamp_nanos / 1_000_000),
    })
}

fn write_temporary_archive(path: &Path, archive: &[u8]) -> StorageResult<()> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    let result = file.write_all(archive).and_then(|_| file.sync_all());
    drop(file);
    match result {
        Ok(()) => Ok(()),
        Err(error) => Err(clean_up_temporary_archive(StorageError::io(error), path)),
    }
}

fn publish_temporary_archive(temporary_path: &Path, final_path: &Path) -> StorageResult<()> {
    if let Err(error) = fs::hard_link(temporary_path, final_path) {
        let error = if error.kind() == std::io::ErrorKind::AlreadyExists {
            StorageError::new(
                "conflict",
                format!(
                    "automatic backup target already exists: {}",
                    final_path.display()
                ),
            )
        } else {
            StorageError::io(error)
        };
        return Err(clean_up_temporary_archive(error, temporary_path));
    }
    if let Err(error) = fs::remove_file(temporary_path) {
        return Err(StorageError::new(
            "io_error",
            format!(
                "automatic backup published at {} but its temporary file could not be removed: {error}",
                final_path.display()
            ),
        ));
    }
    Ok(())
}

fn clean_up_abandoned_temporary_archives(directory: &Path) -> StorageResult<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let Some(file_name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if is_temporary_auto_backup_file_name(&file_name) {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

fn is_temporary_auto_backup_file_name(file_name: &str) -> bool {
    let Some(stem) = file_name.strip_prefix('.') else {
        return false;
    };
    let Some((archive_file_name, sequence)) = stem.rsplit_once(".tmp-") else {
        return false;
    };
    sequence.len() == 20
        && sequence.bytes().all(|byte| byte.is_ascii_digit())
        && sequence.parse::<u64>().is_ok()
        && parse_auto_backup_record(archive_file_name).is_some()
}

fn clean_up_temporary_archive(mut error: StorageError, path: &Path) -> StorageError {
    if let Err(cleanup_error) = fs::remove_file(path) {
        if cleanup_error.kind() != std::io::ErrorKind::NotFound {
            error.message.push_str(&format!(
                "; failed to remove temporary automatic backup {}: {cleanup_error}",
                path.display()
            ));
        }
    }
    error
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn publishing_a_conflicting_backup_never_replaces_the_existing_archive() {
        let directory = std::env::temp_dir().join(format!(
            "zhiqi-auto-backup-publish-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("current time after Unix epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&directory).expect("create test directory");
        let temporary_path = directory.join(".new-backup.tmp");
        let final_path = directory
            .join("auto-000000000000000000001700000000000000000-00000000000000000000.zhiqi");
        fs::write(&temporary_path, b"new archive").expect("write temporary archive");
        fs::write(&final_path, b"existing archive").expect("write existing archive");

        let error = publish_temporary_archive(&temporary_path, &final_path)
            .expect_err("existing archive must not be replaced");

        assert_eq!(error.code, "conflict");
        assert_eq!(
            fs::read(&final_path).expect("read existing archive"),
            b"existing archive"
        );
        assert!(!temporary_path.exists());

        fs::remove_dir_all(directory).expect("remove test directory");
    }
}
