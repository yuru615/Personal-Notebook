# 原生左右分区文件拖放 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Windows 安装版按左右落点稳定处理拖入文件，并避免全局收件箱遮罩和原始文件 IPC 导致的崩溃。

**Architecture:** Tauri 原生拖放事件提供文件路径和位置，`AppShell` 将位置映射为侧栏或正文目标并展示对应提示。应用层按目标处理路径：文档解析为页面，原始文件与普通附件通过原生路径导入资产，不再将整份被拖入文件通过 WebView IPC 发送给 Rust。

**Tech Stack:** Tauri 2、React 19、TypeScript、Vitest、Tauri FS/storage commands。

---

### Task 1: 原生拖放目标与视觉反馈

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/AppShell.test.tsx`
- Modify: `src/styles/index.css`
- Test: `src/styles/editorMultiSelectLayout.test.ts`

- [x] **Step 1: 写入失败测试**

为 `AppShell` 添加测试：原生拖放位置在侧栏宽度内时显示左侧目标文案；位置在侧栏外时显示右侧目标文案；drop 后调用目标感知回调并清除拖放状态。

- [x] **Step 2: 运行失败测试**

Run: `npm test -- src/components/layout/AppShell.test.tsx`

Expected: FAIL，因为组件尚未监听 Tauri 原生拖放事件，也没有目标感知回调。

- [x] **Step 3: 最小实现**

启用原生事件，映射位置到 `sidebar`/`content`，仅在桌面端使用该链路；渲染左右两个提示区并高亮当前目标。浏览器环境保留文件拖放回退，但不再显示“导入收件箱”的全局文案。

- [x] **Step 4: 运行通过测试**

Run: `npm test -- src/components/layout/AppShell.test.tsx src/styles/editorMultiSelectLayout.test.ts`

Expected: PASS。

### Task 2: 以本机路径导入拖入文件

**Files:**
- Modify: `src/lib/assets.ts`
- Modify: `src/lib/assets.test.ts`
- Modify: `src/lib/fileAccess.ts`
- Modify: `src/lib/fileAccess.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

- [x] **Step 1: 写入失败测试**

为资产库添加测试：桌面端传入本机路径时调用 `import_asset_file`，不调用 `write_asset`。为应用添加测试：侧栏路径投放的 DOCX 创建顶级页，正文路径投放的 DOCX 创建子页，普通附件分别进入收件箱和当前正文。

- [x] **Step 2: 运行失败测试**

Run: `npm test -- src/lib/assets.test.ts src/app/App.test.tsx`

Expected: FAIL，因为应用没有接收原生路径投放，也没有路径导入辅助函数。

- [x] **Step 3: 最小实现**

在文件访问边界提供本机二进制读取，在资产库提供路径导入。应用复用现有文件类型分类和页面创建规则，新增路径版本的 DOCX/PDF/Markdown/TXT 处理，并将原始附件和普通附件走路径资产导入。

- [x] **Step 4: 运行通过测试**

Run: `npm test -- src/lib/assets.test.ts src/lib/fileAccess.test.ts src/app/App.test.tsx`

Expected: PASS。

### Task 3: 桌面配置、回归与发布记录

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `CHANGELOG.md`
- Modify: `docs/updates.md`

- [x] **Step 1: 配置原生拖放**

将主窗口 `dragDropEnabled` 打开，使桌面端可收到带本机路径的 Tauri 拖放事件；保留现有安全边界和窗口配置。

- [x] **Step 2: 运行回归验证**

Run: `npm test`

Expected: PASS，所有前端测试通过。

- [x] **Step 3: 运行发布验证**

Run: `npm run lint`、`npm run build`、`npm run tauri:build:windows`

Expected: 前端检查、构建和 Windows NSIS/MSI 打包均成功。

- [x] **Step 4: 维护记录**

在 `docs/updates.md` 记录根因、左右分区与验证；在 `CHANGELOG.md` 记录下一补丁版本的用户可感知修复。
