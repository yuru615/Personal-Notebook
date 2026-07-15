use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;

use super::{Storage, StorageError, StorageResult};

pub const AUTO_BACKUP_DIR_NAME: &str = "zhiqi-auto-backups";

const AUTO_BACKUP_FILE_PREFIX: &str = "auto-";
const AUTO_BACKUP_FILE_EXTENSION: &str = "zhiqi";
static AUTO_BACKUP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupRecord {
    pub file_name: String,
    pub created_at: String,
}

impl Storage {
    pub fn create_auto_backup_at(
        &self,
        now: SystemTime,
        retention_count: usize,
    ) -> StorageResult<AutoBackupRecord> {
        let archive = self.export_workspace_archive()?;
        let record = auto_backup_record(now)?;
        fs::create_dir_all(&self.auto_backup_dir)?;

        let final_path = self.auto_backup_dir.join(&record.file_name);
        let temporary_path = self.auto_backup_dir.join(format!(
            ".{}.tmp-{}",
            record.file_name,
            AUTO_BACKUP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        write_temporary_archive(&temporary_path, &archive)?;
        if let Err(error) = fs::rename(&temporary_path, &final_path) {
            return Err(clean_up_temporary_archive(
                StorageError::io(error),
                &temporary_path,
            ));
        }

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

    fn trim_auto_backups(&self, retention_count: usize) -> StorageResult<()> {
        for backup in self.list_auto_backups()?.into_iter().skip(retention_count) {
            fs::remove_file(self.auto_backup_dir.join(backup.file_name))?;
        }
        Ok(())
    }
}

fn auto_backup_record(now: SystemTime) -> StorageResult<AutoBackupRecord> {
    let timestamp_nanos = now
        .duration_since(UNIX_EPOCH)
        .map_err(|_| {
            StorageError::invalid_payload("automatic backup timestamp is before Unix epoch")
        })?
        .as_nanos();
    let sequence = AUTO_BACKUP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
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
