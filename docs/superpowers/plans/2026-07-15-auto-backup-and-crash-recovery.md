# 自动备份与崩溃恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在桌面版中创建完整工作区的本地自动备份，在异常退出后让用户选择恢复最新备份或正常打开，并在设置中心管理该能力。

**Architecture:** Rust 存储层直接复用现有 `.zhiqi` 完整归档并写入应用数据目录，避免大文件穿过 WebView。独立运行状态记录上一次是否正常结束；React 在 bootstrap 工作区前读取恢复状态并做出选择。应用设置保存用户可见的选项与状态，运行状态不随工作区导入导出覆盖。

**Tech Stack:** Rust、Tauri 2、rusqlite、React 19、TypeScript、Vitest、Testing Library。

---

## 文件结构

- `src-tauri/src/storage/models.rs`：Rust 端自动备份设置、状态与恢复回执。
- `src-tauri/src/storage/auto_backup.rs`：自动归档文件、原子发布、保留清理、运行标记与恢复。
- `src-tauri/src/storage/mod.rs`：持有自动备份目录与运行期变更基线。
- `src-tauri/src/storage/commands.rs`、`src-tauri/src/lib.rs`：暴露命令，并在真正退出前标记正常结束。
- `src/domain/types.ts`、`src/lib/appSettingsRepository.ts`、`src/lib/storageClient.ts`：前端设置及 Tauri 命令契约。
- `src/store/createWorkspaceStore.ts`、`src/app/App.tsx`：保存设置、启动恢复门与调度。
- `src/components/recovery/AutoBackupRecoveryDialog.tsx`、`src/components/settings/SettingsCenter.tsx`：恢复选择与设置卡片。
- `docs/todo.md`、`docs/updates.md`、`CHANGELOG.md`：待办和发布记录。

### Task 1: 建立自动备份设置契约与默认值

**Files:**
- Modify: `src/domain/types.ts:250-260`
- Modify: `src-tauri/src/storage/models.rs:63-90`
- Modify: `src/lib/appSettingsRepository.ts:18-33`
- Test: `src/lib/appSettingsRepository.test.ts`, `src/lib/storageClient.test.ts`

- [ ] **Step 1: 写入前端默认值的失败测试**

```ts
it('defaults automatic backup to 15 minutes and 14 copies', async () => {
  const repository = createAppSettingsRepository({ isDesktop: false })

  await expect(repository.load()).resolves.toMatchObject({
    autoBackup: { enabled: true, intervalMinutes: 15, retentionCount: 14 },
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `C:\Program Files\nodejs\npx.cmd vitest run src/lib/appSettingsRepository.test.ts`

Expected: FAIL，新设置中缺少 `autoBackup`。

- [ ] **Step 3: 加入两端一致的类型与归一化**

```ts
export interface AutoBackupSettings {
  enabled: boolean
  intervalMinutes: 15 | 30 | 60
  retentionCount: 7 | 14 | 30
}

const DEFAULT_AUTO_BACKUP_SETTINGS: AutoBackupSettings = {
  enabled: true,
  intervalMinutes: 15,
  retentionCount: 14,
}
```

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupSettings {
    pub enabled: bool,
    pub interval_minutes: u16,
    pub retention_count: u8,
}
```

`normalizeAppSettings` 只接受频率 `15 | 30 | 60` 和保留份数 `7 | 14 | 30`，其它旧数据回退默认值。Rust 的 `AppSettings` 使用 `#[serde(default = "default_auto_backup_settings")]`，使已有数据库读取时同样取得默认值。

- [ ] **Step 4: 补齐 storage client 的序列化断言**

```ts
await client.saveAppSettings({
  closeAction: 'hide_to_tray',
  accentTheme: 'blue_gray',
  autoBackup: { enabled: true, intervalMinutes: 15, retentionCount: 14 },
})

expect(eventApi.invoke).toHaveBeenLastCalledWith('save_app_settings', {
  settings: expect.objectContaining({
    autoBackup: { enabled: true, intervalMinutes: 15, retentionCount: 14 },
  }),
})
```

- [ ] **Step 5: 验证并提交**

Run: `C:\Program Files\nodejs\npx.cmd vitest run src/lib/appSettingsRepository.test.ts src/lib/storageClient.test.ts`

Expected: PASS。

```bash
git add src/domain/types.ts src-tauri/src/storage/models.rs src/lib/appSettingsRepository.ts src/lib/appSettingsRepository.test.ts src/lib/storageClient.ts src/lib/storageClient.test.ts
git commit -m "feat: add automatic backup settings"
```

### Task 2: 实现 Rust 自动归档与保留规则

**Files:**
- Create: `src-tauri/src/storage/auto_backup.rs`
- Modify: `src-tauri/src/storage/mod.rs:1-145,219-256`
- Modify: `src-tauri/src/storage/models.rs`
- Test: `src-tauri/src/storage/auto_backup.rs`

- [ ] **Step 1: 写入归档与保留的失败测试**

```rust
#[test]
fn auto_backup_writes_a_complete_archive_and_keeps_the_newest_fourteen() {
    let storage = Storage::open_in_test_data_dir().expect("storage opens");
    storage.replace_workspace_backup(sample_snapshot()).expect("seed workspace");

    for index in 0..15 {
        storage.create_auto_backup_at(test_time(index)).expect("backup succeeds");
    }

    let backups = storage.list_auto_backups().expect("backups list");
    assert_eq!(backups.len(), 14);
    assert!(backups.iter().all(|backup| backup.file_name.ends_with(".zhiqi")));
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cargo test auto_backup_writes_a_complete_archive_and_keeps_the_newest_fourteen`

Expected: FAIL，`Storage::create_auto_backup_at` 尚不存在。

- [ ] **Step 3: 添加原子发布与清理实现**

```rust
pub const AUTO_BACKUP_DIRECTORY_NAME: &str = "zhiqi-auto-backups";

pub fn publish_archive_atomically(directory: &Path, file_name: &str, bytes: &[u8]) -> StorageResult<PathBuf> {
    fs::create_dir_all(directory)?;
    let temporary = directory.join(format!(".{file_name}.tmp"));
    fs::write(&temporary, bytes)?;
    let published = directory.join(file_name);
    fs::rename(&temporary, &published)?;
    Ok(published)
}

pub fn prune_old_archives(directory: &Path, retention_count: usize) -> StorageResult<()> {
    let mut archives = list_archives_newest_first(directory)?;
    for archive in archives.drain(retention_count..) {
        fs::remove_file(archive.path)?;
    }
    Ok(())
}
```

`Storage` 新增 `auto_backup_dir: PathBuf`，在 `Storage::open` 中设置为应用数据目录下的 `zhiqi-auto-backups`。`create_auto_backup_at` 先复用 `export_workspace_archive()`，成功发布后才清理最旧文件；任何写入失败都不清理已有备份。

- [ ] **Step 4: 覆盖附件与失败回归**

```rust
#[test]
fn failed_auto_backup_keeps_previously_published_archives() {
    let storage = Storage::open_in_test_data_dir().expect("storage opens");
    let previous = storage.seed_published_auto_backup().expect("seed backup");

    storage.set_auto_backup_directory_for_test(PathBuf::from("NUL/invalid"));
    assert!(storage.create_auto_backup_at(test_time(1)).is_err());

    assert!(previous.exists());
}
```

另写一项测试，把含文件块的工作区归档后通过已有 `import_workspace_archive` 读回，并断言附件字节仍可读取。

- [ ] **Step 5: 验证并提交**

Run: `cargo test auto_backup`

Expected: PASS。

```bash
git add src-tauri/src/storage/auto_backup.rs src-tauri/src/storage/mod.rs src-tauri/src/storage/models.rs
git commit -m "feat: persist automatic workspace backups"
```

### Task 3: 添加异常退出标记、恢复命令与调度命令

**Files:**
- Modify: `src-tauri/src/storage/auto_backup.rs`
- Modify: `src-tauri/src/storage/commands.rs:1-70`
- Modify: `src-tauri/src/lib.rs:65-135`
- Test: `src-tauri/src/storage/auto_backup.rs`

- [ ] **Step 1: 写入恢复状态与失败恢复的测试**

```rust
#[test]
fn startup_after_an_unfinished_session_offers_the_latest_valid_auto_backup() {
    let storage = Storage::open_in_test_data_dir().expect("storage opens");
    storage.create_auto_backup_at(test_time(1)).expect("backup succeeds");
    storage.begin_auto_backup_session().expect("first session begins");

    let recovery = storage.begin_auto_backup_session().expect("next session begins");

    assert!(recovery.should_offer_restore);
    assert!(recovery.latest_backup.is_some());
}

#[test]
fn failed_restore_leaves_the_current_workspace_unchanged() {
    let storage = Storage::open_in_test_data_dir().expect("storage opens");
    let original = sample_snapshot();
    storage.replace_workspace_backup(original.clone()).expect("seed workspace");
    storage.write_invalid_latest_auto_backup_for_test().expect("invalid backup");

    assert!(storage.restore_latest_auto_backup().is_err());
    assert_eq!(storage.export_workspace_backup().expect("workspace"), original);
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cargo test auto_backup`

Expected: FAIL，运行标记和恢复 API 尚不存在。

- [ ] **Step 3: 用独立 settings 记录运行状态并复用导入恢复**

```rust
const AUTO_BACKUP_RUNTIME_SETTINGS_ID: &str = "autoBackupRuntime";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutoBackupRuntimeState {
    session_running: bool,
}

pub fn begin_auto_backup_session(&self) -> StorageResult<AutoBackupRecoveryStatus> {
    let previous = self.load_auto_backup_runtime_state()?;
    let latest_backup = self.latest_valid_auto_backup()?;
    self.save_auto_backup_runtime_state(&AutoBackupRuntimeState { session_running: true })?;
    Ok(AutoBackupRecoveryStatus {
        should_offer_restore: previous.session_running && latest_backup.is_some(),
        latest_backup,
    })
}
```

`restore_latest_auto_backup` 先生成当前工作区保护归档，再验证并导入最新自动备份。若保护归档失败，回执返回 `protectionBackupWarning` 让前端明确提示；若自动备份无效或导入失败，保留当前工作区且返回错误。

新增命令：`begin_auto_backup_session`、`run_auto_backup`、`restore_latest_auto_backup`。调度命令比较 `connection.total_changes()` 与本次运行的已备份基线；每次保存应用设置后同步该基线，避免仅改开关生成归档。

- [ ] **Step 4: 在实际退出前写入正常结束标记**

```rust
#[tauri::command]
fn quit_app_after_pending_saves(
    app: tauri::AppHandle,
    state: tauri::State<'_, storage::StorageState>,
) -> Result<(), String> {
    state.with_storage(|storage| storage.mark_auto_backup_session_clean())?;
    app.exit(0);
    Ok(())
}
```

保留现有“窗口关闭时隐藏到托盘”的分支；它不调用该退出命令，因此不被标记为正常结束。

- [ ] **Step 5: 验证并提交**

Run: `cargo test auto_backup`

Expected: PASS。

```bash
git add src-tauri/src/storage/auto_backup.rs src-tauri/src/storage/commands.rs src-tauri/src/lib.rs
git commit -m "feat: recover from unfinished desktop sessions"
```

### Task 4: 公开前端命令并保存自动备份设置

**Files:**
- Modify: `src/lib/storageClient.ts`
- Modify: `src/lib/storageClient.test.ts`
- Modify: `src/store/createWorkspaceStore.ts`
- Modify: `src/store/createWorkspaceStore.test.ts`

- [ ] **Step 1: 写入 client 和 store 的失败测试**

```ts
await expect(client.beginAutoBackupSession()).resolves.toEqual({
  shouldOfferRestore: true,
  latestBackup: expect.objectContaining({ fileName: 'auto-20260715.zhiqi' }),
})

await store.getState().setAutoBackupSettings({
  enabled: false,
  intervalMinutes: 30,
  retentionCount: 7,
})

expect(appSettingsRepository.save).toHaveBeenCalledWith(expect.objectContaining({
  autoBackup: { enabled: false, intervalMinutes: 30, retentionCount: 7 },
}))
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `C:\Program Files\nodejs\npx.cmd vitest run src/lib/storageClient.test.ts src/store/createWorkspaceStore.test.ts`

Expected: FAIL，命令方法和 store action 不存在。

- [ ] **Step 3: 添加最小类型化边界**

```ts
beginAutoBackupSession(): Promise<AutoBackupRecoveryStatus>
runAutoBackup(): Promise<AutoBackupRunResult>
restoreLatestAutoBackup(): Promise<AutoBackupRestoreResult>
```

```ts
async setAutoBackupSettings(autoBackup: AutoBackupSettings) {
  const appSettings = { ...get().appSettings, autoBackup }
  await appSettingsRepository.save(appSettings)
  set({ appSettings })
}
```

浏览器实现只返回 `shouldOfferRestore: false`，不在 localStorage 中模拟桌面归档或恢复。

- [ ] **Step 4: 验证并提交**

Run: `C:\Program Files\nodejs\npx.cmd vitest run src/lib/storageClient.test.ts src/store/createWorkspaceStore.test.ts`

Expected: PASS。

```bash
git add src/lib/storageClient.ts src/lib/storageClient.test.ts src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts
git commit -m "feat: expose automatic backup controls"
```

### Task 5: 实现恢复启动门和桌面自动调度

**Files:**
- Create: `src/components/recovery/AutoBackupRecoveryDialog.tsx`
- Create: `src/components/recovery/AutoBackupRecoveryDialog.test.tsx`
- Modify: `src/app/App.tsx:284-365,1041-1048`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles/index.css`

- [ ] **Step 1: 写入恢复弹窗的失败测试**

```tsx
it('does not bootstrap before the user chooses how to handle a pending recovery', async () => {
  render(<App store={storeWithRecovery({
    shouldOfferRestore: true,
    latestBackup: { fileName: 'auto-20260715-120000.zhiqi', createdAt: '2026-07-15T12:00:00.000Z' },
  })} />)

  expect(await screen.findByRole('dialog', { name: '检测到异常退出' })).toBeVisible()
  expect(store.getState().pages).toEqual([])
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `C:\Program Files\nodejs\npx.cmd vitest run src/app/App.test.tsx src/components/recovery/AutoBackupRecoveryDialog.test.tsx`

Expected: FAIL，当前 App 会直接 bootstrap。

- [ ] **Step 3: 创建弹窗并改变启动顺序**

```tsx
<AutoBackupRecoveryDialog
  backup={recovery.latestBackup}
  busy={recoveryAction !== 'idle'}
  onOpenNormally={startWorkspaceNormally}
  onRestore={restoreWorkspaceFromLatestBackup}
/>
```

首次 effect 仅在桌面端先调用 `beginAutoBackupSession()`。没有恢复候选时走原有 `ensureBootstrap()`；选择“正常打开”后调用 `ensureBootstrap()`；恢复成功后调用 `store.getState().bootstrap()`。恢复失败保留弹窗并显示错误，不能触发前端覆盖写入。

已 bootstrap 且启用自动备份时，以 60 秒 tick 调用 `runAutoBackup()`；Rust 端负责变更与间隔判断。设置关闭、卸载或频率变化时清理计时器。

- [ ] **Step 4: 覆盖两种选择与调度条件**

```tsx
it('reloads the workspace only after restore succeeds', async () => {
  restoreLatestAutoBackup.mockResolvedValueOnce({ restored: true, protectionBackupWarning: null })
  render(<App store={storeWithRecovery(pendingRecovery)} />)

  await userEvent.click(await screen.findByRole('button', { name: '恢复最新自动备份' }))

  await waitFor(() => expect(store.getState().bootstrap).toHaveBeenCalled())
})
```

测试同时断言：选择“正常打开”不调用恢复命令；设置为 `enabled: false` 时不启动 timer；恢复失败时不 bootstrap 且显示错误。

- [ ] **Step 5: 验证并提交**

Run: `C:\Program Files\nodejs\npx.cmd vitest run src/app/App.test.tsx src/components/recovery/AutoBackupRecoveryDialog.test.tsx`

Expected: PASS。

```bash
git add src/app/App.tsx src/app/App.test.tsx src/components/recovery src/styles/index.css
git commit -m "feat: prompt for backup recovery after crashes"
```

### Task 6: 在设置中心提供控制并完成发布验证

**Files:**
- Modify: `src/components/settings/SettingsCenter.tsx`
- Modify: `src/components/settings/SettingsCenter.test.tsx`
- Modify: `src/app/App.tsx:1972-2060`
- Modify: `src/ui/copy.ts`
- Modify: `docs/todo.md`, `docs/updates.md`, `CHANGELOG.md`

- [ ] **Step 1: 写入设置卡片的失败测试**

```tsx
it('persists automatic backup options from the general settings card', async () => {
  render(<SettingsCenter {...props} appSettings={{
    autoBackup: { enabled: true, intervalMinutes: 15, retentionCount: 14 },
  }} />)

  await userEvent.click(screen.getByRole('switch', { name: '启用自动备份' }))
  await userEvent.selectOptions(screen.getByLabelText('备份频率'), '30')
  await userEvent.selectOptions(screen.getByLabelText('保留份数'), '7')

  expect(props.onSetAutoBackupSettings).toHaveBeenLastCalledWith({
    enabled: false,
    intervalMinutes: 30,
    retentionCount: 7,
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `C:\Program Files\nodejs\npx.cmd vitest run src/components/settings/SettingsCenter.test.tsx`

Expected: FAIL，尚无自动备份卡片和回调。

- [ ] **Step 3: 添加通用设置中的最小卡片**

```tsx
<section className="settings-card" aria-labelledby="auto-backup-heading">
  <h2 id="auto-backup-heading">自动备份与恢复</h2>
  <label><input type="checkbox" role="switch" aria-label="启用自动备份" checked={autoBackup.enabled} onChange={(event) => onSetAutoBackupSettings({ ...autoBackup, enabled: event.currentTarget.checked })} />启用自动备份</label>
  <label>备份频率<select aria-label="备份频率" value={autoBackup.intervalMinutes} onChange={(event) => onSetAutoBackupSettings({ ...autoBackup, intervalMinutes: Number(event.currentTarget.value) as 15 | 30 | 60 })}><option value={15}>每 15 分钟</option><option value={30}>每 30 分钟</option><option value={60}>每小时</option></select></label>
  <label>保留份数<select aria-label="保留份数" value={autoBackup.retentionCount} onChange={(event) => onSetAutoBackupSettings({ ...autoBackup, retentionCount: Number(event.currentTarget.value) as 7 | 14 | 30 })}><option value={7}>7 份</option><option value={14}>14 份</option><option value={30}>30 份</option></select></label>
  <p>最近成功备份：{autoBackup.lastSuccessAt ?? '尚无自动备份'}</p>
  {autoBackup.lastError ? <p role="status">最近失败：{autoBackup.lastError}</p> : null}
</section>
```

`SettingsRouteProps` 与 `SettingsCenterProps` 新增 `onSetAutoBackupSettings`，由 store action 提供。文案进入 `src/ui/copy.ts`；沿用现有 settings 卡片样式，不新增滚动容器。

- [ ] **Step 4: 维护待办与更新记录**

从 `docs/todo.md` 删除“自动备份与崩溃恢复”。`docs/updates.md` 写明归档格式复用、默认值、异常退出选择和验证；发布时在 `CHANGELOG.md` 写入用户可见的新增与数据保护说明。

- [ ] **Step 5: 完整验证、NSIS 发布验证并提交**

Run: `C:\Program Files\nodejs\npm.cmd test`

Expected: 所有前端测试通过。

Run: `C:\Program Files\nodejs\npm.cmd run lint`

Expected: 0 error；既有警告如实记录。

Run: `C:\Program Files\nodejs\npm.cmd run build`

Expected: production build 成功。

Run: `cargo test`

Expected: 所有 Rust 测试通过。

Run: `C:\Program Files\nodejs\npm.cmd run tauri:build:windows`

Expected: 仅生成 NSIS 安装包，不生成 MSI。

验收：修改页面并等待自动备份；强制结束调试进程后重启，分别验证“正常打开”和“恢复最新自动备份”。

```bash
git add src/components/settings/SettingsCenter.tsx src/components/settings/SettingsCenter.test.tsx src/app/App.tsx src/ui/copy.ts docs/todo.md docs/updates.md CHANGELOG.md
git commit -m "feat: configure automatic backup recovery"
```
