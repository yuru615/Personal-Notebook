use std::{
    fs::{self, OpenOptions},
    io::{self, Cursor, Read, Write},
    path::{Component, Path, PathBuf},
    process,
    time::{SystemTime, UNIX_EPOCH},
};

use rand::{distr::Alphanumeric, RngExt};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

use super::{
    error::{StorageError, StorageResult},
    models::{AssetMeta, TrackedAssetWrite, WriteAssetInput},
};

pub fn write_asset(
    connection: &Connection,
    assets_dir: &Path,
    input: WriteAssetInput,
) -> StorageResult<AssetMeta> {
    write_asset_tracked(connection, assets_dir, input).map(|written| written.meta)
}

pub fn write_asset_tracked(
    connection: &Connection,
    assets_dir: &Path,
    input: WriteAssetInput,
) -> StorageResult<TrackedAssetWrite> {
    let mut reader = Cursor::new(input.bytes);
    let mut ignore_progress = |_| {};
    write_asset_from_reader(
        connection,
        assets_dir,
        input.name,
        input.mime_type,
        &mut reader,
        &mut ignore_progress,
    )
}

pub fn write_asset_from_reader<R, F>(
    connection: &Connection,
    assets_dir: &Path,
    name: String,
    mime_type: String,
    reader: &mut R,
    progress: &mut F,
) -> StorageResult<TrackedAssetWrite>
where
    R: Read,
    F: FnMut(u64),
{
    if !connection.is_autocommit() {
        return Err(StorageError::new(
            "conflict",
            "asset writes require an autocommit connection",
        ));
    }

    fs::create_dir_all(assets_dir)?;
    let temp_dir = assets_dir.join(".tmp");
    fs::create_dir_all(&temp_dir)?;
    let (temp_path, mut temp_file) = create_temp_asset_file(&temp_dir)?;
    let (sha256, byte_size) = match stream_asset_to_temp(reader, &mut temp_file, progress) {
        Ok(streamed) => streamed,
        Err(error) => {
            drop(temp_file);
            return Err(cleanup_file_after_error(
                error,
                &temp_path,
                "temporary asset file",
            ));
        }
    };
    if let Err(error) = temp_file.flush() {
        drop(temp_file);
        return Err(cleanup_file_after_error(
            StorageError::new(
                "io_error",
                format!(
                    "failed to flush temporary asset file {}: {error}",
                    temp_path.display()
                ),
            ),
            &temp_path,
            "temporary asset file",
        ));
    }
    drop(temp_file);

    let mut temp_owned = true;
    let result = with_asset_write_transaction(connection, assets_dir, |connection| {
        if let Some(existing) = load_asset_by_sha(connection, &sha256)? {
            release_temp_ownership(&temp_path, &mut temp_owned)?;
            return Ok(TrackedAssetWrite {
                meta: existing,
                created: false,
            });
        }

        let extension = file_extension(&name);
        let relative_path = build_relative_asset_path(&sha256, extension.as_deref());
        let absolute_path = assets_dir.join(&relative_path);

        if let Some(parent) = absolute_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let meta = AssetMeta {
            id: new_asset_generation_id(&sha256),
            sha256,
            name,
            mime_type,
            byte_size: byte_size as i64,
            relative_path,
            created_at: now_iso_like(),
        };

        connection.execute(
            "INSERT INTO zhiqi_assets
              (id, sha256, name, mime_type, byte_size, relative_path, created_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                meta.id,
                meta.sha256,
                meta.name,
                meta.mime_type,
                meta.byte_size,
                meta.relative_path,
                meta.created_at
            ],
        )?;

        publish_temp_asset_exclusive(&temp_path, &absolute_path, &mut temp_owned)?;

        Ok(TrackedAssetWrite {
            meta,
            created: true,
        })
    });

    finish_temp_cleanup(result, &temp_path, temp_owned)
}

fn with_asset_write_transaction<F>(
    connection: &Connection,
    assets_dir: &Path,
    task: F,
) -> StorageResult<TrackedAssetWrite>
where
    F: FnOnce(&Connection) -> StorageResult<TrackedAssetWrite>,
{
    if !connection.is_autocommit() {
        return Err(StorageError::new(
            "conflict",
            "asset writes require an autocommit connection",
        ));
    }

    connection.execute_batch("BEGIN IMMEDIATE")?;
    let result = task(connection);

    match result {
        Ok(written) => match connection.execute_batch("COMMIT") {
            Ok(()) => Ok(written),
            Err(commit_error) => {
                let mut error = StorageError::new(
                    "database_error",
                    format!("failed to commit asset write: {commit_error}"),
                );
                match connection.execute_batch("ROLLBACK") {
                    Ok(()) => {
                        if written.created {
                            match asset_path(assets_dir, &written.meta.relative_path) {
                                Ok(path) => {
                                    if let Err(cleanup_error) = fs::remove_file(&path) {
                                        error.message.push_str(&format!(
                                            "; failed to remove rolled-back final asset file {}: {cleanup_error}",
                                            path.display()
                                        ));
                                    }
                                }
                                Err(path_error) => error.message.push_str(&format!(
                                    "; failed to resolve rolled-back final asset path: {}",
                                    path_error.message
                                )),
                            }
                        }
                    }
                    Err(rollback_error) => {
                        error.message.push_str(&format!(
                            "; failed to roll back asset write: {rollback_error}"
                        ));
                        if written.created {
                            error.message.push_str(&format!(
                                "; retained final asset file pending recovery at {}",
                                assets_dir.join(&written.meta.relative_path).display()
                            ));
                        }
                    }
                }
                Err(error)
            }
        },
        Err(mut error) => {
            if let Err(rollback_error) = connection.execute_batch("ROLLBACK") {
                error.message.push_str(&format!(
                    "; failed to roll back asset write: {rollback_error}"
                ));
            }
            Err(error)
        }
    }
}

fn publish_temp_asset_exclusive(
    temp_path: &Path,
    final_path: &Path,
    temp_owned: &mut bool,
) -> StorageResult<()> {
    let mut source = OpenOptions::new()
        .read(true)
        .open(temp_path)
        .map_err(|error| {
            StorageError::new(
                "io_error",
                format!(
                    "failed to reopen temporary asset file {}: {error}",
                    temp_path.display()
                ),
            )
        })?;
    let mut final_file = match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(final_path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
            return Err(StorageError::new(
                "conflict",
                format!("final asset file already exists: {}", final_path.display()),
            ));
        }
        Err(error) => {
            return Err(StorageError::new(
                "io_error",
                format!(
                    "failed to create final asset file {}: {error}",
                    final_path.display()
                ),
            ));
        }
    };

    let publish_result = io::copy(&mut source, &mut final_file)
        .and_then(|_| final_file.flush())
        .map_err(|error| {
            StorageError::new(
                "io_error",
                format!(
                    "failed to publish final asset file {}: {error}",
                    final_path.display()
                ),
            )
        });
    drop(final_file);
    drop(source);
    if let Err(error) = publish_result {
        return Err(cleanup_file_after_error(
            error,
            final_path,
            "partial final asset file",
        ));
    }

    match fs::remove_file(temp_path) {
        Ok(()) => *temp_owned = false,
        Err(cleanup_error) => {
            if cleanup_error.kind() == io::ErrorKind::NotFound {
                *temp_owned = false;
            }
            let error = StorageError::new(
                "io_error",
                format!(
                    "failed to remove temporary asset file {} after publishing {}: {cleanup_error}",
                    temp_path.display(),
                    final_path.display()
                ),
            );
            return Err(cleanup_file_after_error(
                error,
                final_path,
                "published final asset file",
            ));
        }
    }

    Ok(())
}

fn release_temp_ownership(temp_path: &Path, temp_owned: &mut bool) -> StorageResult<()> {
    match fs::remove_file(temp_path) {
        Ok(()) => {
            *temp_owned = false;
            Ok(())
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            *temp_owned = false;
            Err(StorageError::new(
                "io_error",
                format!(
                    "temporary asset file disappeared before release: {}",
                    temp_path.display()
                ),
            ))
        }
        Err(error) => Err(StorageError::new(
            "io_error",
            format!(
                "failed to release temporary asset file {}: {error}",
                temp_path.display()
            ),
        )),
    }
}

fn finish_temp_cleanup(
    result: StorageResult<TrackedAssetWrite>,
    temp_path: &Path,
    temp_owned: bool,
) -> StorageResult<TrackedAssetWrite> {
    if !temp_owned {
        return result;
    }

    match remove_file_if_exists(temp_path) {
        Ok(()) => result,
        Err(cleanup_error) => match result {
            Ok(_) => Err(StorageError::new(
                "io_error",
                format!(
                    "asset write completed but temporary file remains at {}: {cleanup_error}",
                    temp_path.display()
                ),
            )),
            Err(mut error) => {
                error.message.push_str(&format!(
                    "; failed to remove temporary asset file {}: {cleanup_error}",
                    temp_path.display()
                ));
                Err(error)
            }
        },
    }
}

fn cleanup_file_after_error(mut error: StorageError, path: &Path, label: &str) -> StorageError {
    if let Err(cleanup_error) = remove_file_if_exists(path) {
        error.message.push_str(&format!(
            "; failed to remove {label} {}: {cleanup_error}",
            path.display()
        ));
    }
    error
}

fn remove_file_if_exists(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

struct AssetIsolation {
    directory: PathBuf,
    path: PathBuf,
    final_path: PathBuf,
}

pub fn remove_asset_if_unreferenced(
    connection: &Connection,
    assets_dir: &Path,
    asset_id: &str,
) -> StorageResult<bool> {
    if !connection.is_autocommit() {
        return Err(StorageError::new(
            "conflict",
            "asset removal requires an autocommit connection",
        ));
    }

    connection.execute_batch("BEGIN IMMEDIATE")?;
    let mut isolation = None;
    let result: StorageResult<bool> = (|| {
        let relative_path = connection
            .query_row(
                "SELECT relative_path FROM zhiqi_assets
                  WHERE id = ?1
                    AND NOT EXISTS (
                      SELECT 1 FROM zhiqi_asset_refs WHERE asset_id = zhiqi_assets.id
                    )",
                [asset_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let Some(relative_path) = relative_path else {
            return Ok(false);
        };
        let final_path = asset_path(assets_dir, &relative_path)?;
        let metadata = fs::symlink_metadata(&final_path).map_err(|error| {
            StorageError::new(
                "io_error",
                format!(
                    "failed to inspect final asset file {} before removal: {error}",
                    final_path.display()
                ),
            )
        })?;
        if !metadata.file_type().is_file() {
            return Err(StorageError::new(
                "io_error",
                format!(
                    "final asset path is not a regular file: {}",
                    final_path.display()
                ),
            ));
        }

        let (isolation_directory, isolation_path) = create_asset_isolation(assets_dir)?;
        if let Err(rename_error) = fs::rename(&final_path, &isolation_path) {
            let mut error = StorageError::new(
                "io_error",
                format!(
                    "failed to isolate final asset file {} at {}: {rename_error}",
                    final_path.display(),
                    isolation_path.display()
                ),
            );
            if let Err(cleanup_error) = fs::remove_dir(&isolation_directory) {
                error.message.push_str(&format!(
                    "; failed to remove unused isolation directory {}: {cleanup_error}",
                    isolation_directory.display()
                ));
            }
            return Err(error);
        }
        isolation = Some(AssetIsolation {
            directory: isolation_directory,
            path: isolation_path,
            final_path,
        });

        let deleted = connection.execute(
            "DELETE FROM zhiqi_assets
              WHERE id = ?1
                AND NOT EXISTS (
                  SELECT 1 FROM zhiqi_asset_refs WHERE asset_id = zhiqi_assets.id
                )",
            [asset_id],
        )?;

        if deleted == 0 {
            return Err(StorageError::new(
                "conflict",
                format!("asset became referenced during removal: {asset_id}"),
            ));
        }

        Ok(true)
    })();

    match result {
        Ok(false) => match connection.execute_batch("COMMIT") {
            Ok(()) => Ok(false),
            Err(commit_error) => {
                let mut error = StorageError::new(
                    "database_error",
                    format!("failed to commit empty asset removal: {commit_error}"),
                );
                if let Err(rollback_error) = connection.execute_batch("ROLLBACK") {
                    error.message.push_str(&format!(
                        "; failed to roll back empty asset removal: {rollback_error}"
                    ));
                }
                Err(error)
            }
        },
        Ok(true) => {
            let Some(isolated) = isolation else {
                let mut error = StorageError::new(
                    "database_error",
                    "asset removal lost its isolation path before commit",
                );
                if let Err(rollback_error) = connection.execute_batch("ROLLBACK") {
                    error.message.push_str(&format!(
                        "; failed to roll back asset removal: {rollback_error}"
                    ));
                }
                return Err(error);
            };
            match connection.execute_batch("COMMIT") {
                Ok(()) => {
                    cleanup_committed_isolation(&isolated)?;
                    Ok(true)
                }
                Err(commit_error) => {
                    let mut error = StorageError::new(
                        "database_error",
                        format!("failed to commit asset removal: {commit_error}"),
                    );
                    rollback_and_restore_asset_removal(connection, &isolated, &mut error);
                    Err(error)
                }
            }
        }
        Err(mut error) => {
            if let Some(isolated) = isolation.as_ref() {
                rollback_and_restore_asset_removal(connection, isolated, &mut error);
            } else if let Err(rollback_error) = connection.execute_batch("ROLLBACK") {
                error.message.push_str(&format!(
                    "; failed to roll back asset removal: {rollback_error}"
                ));
            }
            Err(error)
        }
    }
}

fn create_asset_isolation(assets_dir: &Path) -> StorageResult<(PathBuf, PathBuf)> {
    let isolation_root = assets_dir.join(".trash");
    fs::create_dir_all(&isolation_root)?;

    for attempt in 0..1000 {
        let directory = isolation_root.join(format!(
            "remove-{}-{}-{attempt}",
            process::id(),
            now_millis()
        ));
        match fs::create_dir(&directory) {
            Ok(()) => {
                let path = directory.join("asset");
                return Ok((directory, path));
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(StorageError::new(
                    "io_error",
                    format!(
                        "failed to create asset isolation directory {}: {error}",
                        directory.display()
                    ),
                ));
            }
        }
    }

    Err(StorageError::new(
        "conflict",
        format!(
            "could not create a unique asset isolation directory under {}",
            isolation_root.display()
        ),
    ))
}

fn cleanup_committed_isolation(isolation: &AssetIsolation) -> StorageResult<()> {
    fs::remove_file(&isolation.path).map_err(|error| {
        StorageError::new(
            "io_error",
            format!(
                "asset database row was removed but isolated file remains at {}: {error}",
                isolation.path.display()
            ),
        )
    })?;
    fs::remove_dir(&isolation.directory).map_err(|error| {
        StorageError::new(
            "io_error",
            format!(
                "asset was removed but isolation directory remains at {}: {error}",
                isolation.directory.display()
            ),
        )
    })?;
    Ok(())
}

fn rollback_and_restore_asset_removal(
    connection: &Connection,
    isolation: &AssetIsolation,
    error: &mut StorageError,
) {
    if let Err(rollback_error) = connection.execute_batch("ROLLBACK") {
        error.message.push_str(&format!(
            "; failed to roll back asset removal: {rollback_error}"
        ));
    }

    let mut isolation_owned = true;
    match publish_temp_asset_exclusive(&isolation.path, &isolation.final_path, &mut isolation_owned)
    {
        Ok(()) => {
            if let Err(cleanup_error) = fs::remove_dir(&isolation.directory) {
                error.message.push_str(&format!(
                    "; restored final asset file but isolation directory remains at {}: {cleanup_error}",
                    isolation.directory.display()
                ));
            }
        }
        Err(restore_error) => {
            error.message.push_str(&format!(
                "; failed to restore isolated asset {} to {}: {}; isolated file retained for recovery",
                isolation.path.display(),
                isolation.final_path.display(),
                restore_error.message
            ));
        }
    }
}

pub fn read_asset(
    connection: &Connection,
    assets_dir: &Path,
    asset_id: &str,
) -> StorageResult<Vec<u8>> {
    let relative_path: String = connection
        .query_row(
            "SELECT relative_path FROM zhiqi_assets WHERE id = ?1",
            [asset_id],
            |row| row.get(0),
        )
        .map_err(|error| {
            if matches!(error, rusqlite::Error::QueryReturnedNoRows) {
                StorageError::not_found(format!("asset not found: {asset_id}"))
            } else {
                StorageError::database(error)
            }
        })?;

    let path = asset_path(assets_dir, &relative_path)?;
    fs::read(path).map_err(Into::into)
}

pub fn asset_file_path(
    connection: &Connection,
    assets_dir: &Path,
    asset_id: &str,
) -> StorageResult<PathBuf> {
    let relative_path: String = connection
        .query_row(
            "SELECT relative_path FROM zhiqi_assets WHERE id = ?1",
            [asset_id],
            |row| row.get(0),
        )
        .map_err(|error| {
            if matches!(error, rusqlite::Error::QueryReturnedNoRows) {
                StorageError::not_found(format!("asset not found: {asset_id}"))
            } else {
                StorageError::database(error)
            }
        })?;

    asset_path(assets_dir, &relative_path)
}

pub fn load_assets_by_ids(
    connection: &Connection,
    asset_ids: &[String],
) -> StorageResult<Vec<AssetMeta>> {
    let mut assets = Vec::new();

    for asset_id in asset_ids {
        let asset = connection
            .query_row(
                "SELECT id, sha256, name, mime_type, byte_size, relative_path, created_at
                  FROM zhiqi_assets WHERE id = ?1",
                [asset_id],
                |row| {
                    Ok(AssetMeta {
                        id: row.get(0)?,
                        sha256: row.get(1)?,
                        name: row.get(2)?,
                        mime_type: row.get(3)?,
                        byte_size: row.get(4)?,
                        relative_path: row.get(5)?,
                        created_at: row.get(6)?,
                    })
                },
            )
            .optional()?;
        let asset =
            asset.ok_or_else(|| StorageError::not_found(format!("asset not found: {asset_id}")))?;
        assets.push(asset);
    }

    Ok(assets)
}

pub fn cleanup_orphan_assets(connection: &Connection, assets_dir: &Path) -> StorageResult<usize> {
    if !connection.is_autocommit() {
        return Err(StorageError::new(
            "conflict",
            "orphan asset cleanup requires an autocommit connection",
        ));
    }

    let mut statement = connection.prepare(
        "SELECT id FROM zhiqi_assets
          WHERE id NOT IN (SELECT asset_id FROM zhiqi_asset_refs)",
    )?;
    let asset_ids = statement
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(statement);

    let mut removed = 0;
    for asset_id in asset_ids {
        if remove_asset_if_unreferenced(connection, assets_dir, &asset_id)? {
            removed += 1;
        }
    }

    Ok(removed)
}

fn create_temp_asset_file(temp_dir: &Path) -> StorageResult<(PathBuf, fs::File)> {
    for attempt in 0..1000 {
        let path = temp_dir.join(format!(
            "asset-{}-{}-{attempt}.tmp",
            process::id(),
            now_millis()
        ));

        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }

    Err(StorageError::new(
        "conflict",
        "could not create a temporary asset file",
    ))
}

fn stream_asset_to_temp<R, W, F>(
    reader: &mut R,
    writer: &mut W,
    progress: &mut F,
) -> StorageResult<(String, u64)>
where
    R: Read,
    W: Write,
    F: FnMut(u64),
{
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    let mut byte_size = 0_u64;

    loop {
        let bytes_read = reader.read(&mut buffer)?;

        if bytes_read == 0 {
            break;
        }

        let chunk = &buffer[..bytes_read];
        hasher.update(chunk);
        writer.write_all(chunk)?;
        byte_size += bytes_read as u64;
        progress(byte_size);
    }

    Ok((hex::encode(hasher.finalize()), byte_size))
}

fn asset_path(assets_dir: &Path, relative_path: &str) -> StorageResult<PathBuf> {
    let relative = Path::new(relative_path);
    let mut has_component = false;

    if relative.is_absolute() {
        return Err(StorageError::invalid_payload("asset path must be relative"));
    }

    for component in relative.components() {
        match component {
            Component::Normal(_) => {
                has_component = true;
            }
            _ => {
                return Err(StorageError::invalid_payload(
                    "asset path contains unsafe components",
                ));
            }
        }
    }

    if !has_component {
        return Err(StorageError::invalid_payload("asset path cannot be empty"));
    }

    Ok(assets_dir.join(relative))
}

fn load_asset_by_sha(connection: &Connection, sha256: &str) -> StorageResult<Option<AssetMeta>> {
    let mut statement = connection.prepare(
        "SELECT id, sha256, name, mime_type, byte_size, relative_path, created_at
          FROM zhiqi_assets WHERE sha256 = ?1",
    )?;
    let mut rows = statement.query([sha256])?;

    if let Some(row) = rows.next()? {
        return Ok(Some(AssetMeta {
            id: row.get(0)?,
            sha256: row.get(1)?,
            name: row.get(2)?,
            mime_type: row.get(3)?,
            byte_size: row.get(4)?,
            relative_path: row.get(5)?,
            created_at: row.get(6)?,
        }));
    }

    Ok(None)
}

fn new_asset_generation_id(sha256: &str) -> String {
    let generation = rand::rng()
        .sample_iter(&Alphanumeric)
        .take(16)
        .map(char::from)
        .collect::<String>();
    format!("asset_{sha256}_{generation}")
}

fn build_relative_asset_path(sha256: &str, extension: Option<&str>) -> String {
    let prefix = &sha256[..2];
    match extension {
        Some(extension) if !extension.is_empty() => {
            format!("{prefix}/{sha256}.{extension}")
        }
        _ => format!("{prefix}/{sha256}"),
    }
}

fn file_extension(name: &str) -> Option<String> {
    PathBuf::from(name)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension
                .chars()
                .filter(|character| character.is_ascii_alphanumeric())
                .collect::<String>()
                .to_ascii_lowercase()
        })
        .filter(|extension| !extension.is_empty())
}

fn now_iso_like() -> String {
    format!("unix-ms:{}", now_millis())
}

fn now_millis() -> u128 {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    millis
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn released_temp_ownership_does_not_delete_path_reused_by_another_write() {
        let directory = std::env::temp_dir().join(format!(
            "zhiqi-asset-temp-ownership-{}-{}",
            process::id(),
            now_millis()
        ));
        fs::create_dir_all(&directory).expect("create temp ownership directory");
        let temp_path = directory.join("reused.tmp");
        fs::write(&temp_path, b"new owner bytes").expect("write reused temp path");
        let result: StorageResult<TrackedAssetWrite> =
            Err(StorageError::new("conflict", "original write failed"));

        let error = finish_temp_cleanup(result, &temp_path, false)
            .expect_err("original write still returns its error");

        assert_eq!(error.code, "conflict");
        assert_eq!(
            fs::read(&temp_path).expect("new owner temp remains"),
            b"new owner bytes"
        );
        fs::remove_file(&temp_path).expect("remove reused temp path");
        fs::remove_dir(directory).expect("remove temp ownership directory");
    }
}
