use std::{
    fs,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

use super::{
    error::{StorageError, StorageResult},
    models::{AssetMeta, WriteAssetInput},
};

pub fn write_asset(
    connection: &Connection,
    assets_dir: &Path,
    input: WriteAssetInput,
) -> StorageResult<AssetMeta> {
    fs::create_dir_all(assets_dir)?;

    let sha256 = hex::encode(Sha256::digest(&input.bytes));
    if let Some(existing) = load_asset_by_sha(connection, &sha256)? {
        return Ok(existing);
    }

    let extension = file_extension(&input.name);
    let relative_path = build_relative_asset_path(&sha256, extension.as_deref());
    let absolute_path = assets_dir.join(&relative_path);

    if let Some(parent) = absolute_path.parent() {
        fs::create_dir_all(parent)?;
    }

    fs::write(&absolute_path, &input.bytes)?;

    let meta = AssetMeta {
        id: format!("asset_{sha256}"),
        sha256,
        name: input.name,
        mime_type: input.mime_type,
        byte_size: input.bytes.len() as i64,
        relative_path,
        created_at: now_iso_like(),
    };

    connection.execute(
        "INSERT INTO assets
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

    Ok(meta)
}

pub fn read_asset(
    connection: &Connection,
    assets_dir: &Path,
    asset_id: &str,
) -> StorageResult<Vec<u8>> {
    let relative_path: String = connection
        .query_row(
            "SELECT relative_path FROM assets WHERE id = ?1",
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

pub fn cleanup_orphan_assets(connection: &Connection, assets_dir: &Path) -> StorageResult<usize> {
    let mut statement = connection.prepare(
        "SELECT id, relative_path FROM assets
          WHERE id NOT IN (SELECT asset_id FROM asset_refs)",
    )?;
    let assets = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    for (asset_id, relative_path) in &assets {
        let _ = fs::remove_file(asset_path(assets_dir, relative_path)?);
        connection.execute("DELETE FROM assets WHERE id = ?1", [asset_id])?;
    }

    Ok(assets.len())
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
          FROM assets WHERE sha256 = ?1",
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
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("unix-ms:{millis}")
}
