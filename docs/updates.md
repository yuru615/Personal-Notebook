# 更新记录

本文档记录知栖桌面端的重要更新。后续每次提交前都应补充本文件：先写简要描述，再写详细描述，方便从 GitHub 上快速了解这次提交改了什么、为什么改、验证到什么程度。

## 维护规则

## 2026-07-15 Tauri 跨平台启动路径修复

提交：未提交

简要描述：

修复 macOS 执行 `npm run tauri:dev` 时因仓库绑定 Windows E 盘 Cargo 缓存路径导致无法启动的问题。

详细描述：

- 删除仓库中绑定单台 Windows 机器 `E:` 盘的 `.cargo/config.toml`，所有平台恢复使用 Cargo 标准项目构建目录 `src-tauri/target`。
- CI 或并行任务仍可通过 `CARGO_TARGET_DIR` 临时指定当前平台支持的缓存目录，但不再把机器专属绝对路径提交到仓库。
- macOS 不会再在仓库中误创建 `E:` 目录，也不会再把 Windows 盘符冒号写入 `DYLD_FALLBACK_LIBRARY_PATH`。

验证情况：

- 已通过 macOS `npm run tauri:dev` 完整启动验证：Vite、Rust 编译和 `target/debug/zhiqi` 均正常启动。
- 已验证 Tauri 窗口正常渲染登录页，并可从登录页切换到注册表单再返回；浏览器控制台无相关错误。

## 2026-07-15 强制账号登录门禁

提交：未提交

简要描述：

知栖桌面端现在必须注册并登录已验证的 QQ 邮箱后才能进入本地工作区。

详细描述：

- Tauri Rust 账号边界负责注册、登录、会话校验、退出和密码找回请求；Bearer Token 只保存在系统凭据管理器中，不进入 React、localStorage 或知识库 SQLite。
- 未认证时不初始化工作区、不启动本机 MCP；已登录 Token 在 24 小时有效期内遇到断网或服务端 5xx 可离线使用，过期、停用或撤销后立即回到登录页。
- 新增登录、注册、验证等待、重发验证邮件和忘记密码界面，侧边栏及设置中心显示账号、联网状态和会话到期时间。
- 发布构建强制账号服务使用 HTTPS；当前公网 IP 仅供 Debug 联调。

验证情况：

- 已通过完整前端测试：91 个测试文件、795 条测试；`npm run build` 与 `npm run lint` 通过（仅保留 5 条既有 Hooks 警告）。
- 已通过完整 Rust 测试：155 passed、0 failed，并通过 `cargo check`。
- 已完成 macOS Debug `.app` 打包验收：登录、注册和忘记密码页面均可正常渲染与切换，无内容重叠；浏览器单独运行时仅显示桌面版提示，不提前初始化工作区。

## 2026-07-13 Zhiqi 英文标识更新

提交：未提交

简要描述：

将应用英文标识统一更新为 `zhiqi`，作为新的本地应用身份。

详细描述：

- npm 包、Rust crate、Tauri bundle identifier、运行时事件、剪贴板 MIME 类型、页面包标识和图标元数据均切换为 `zhiqi`。
- SQLite 表和索引前缀、数据库文件、资源目录及浏览器 localStorage 键均采用新前缀，因此新版本不会自动读取旧版本的本地数据。

## 2026-07-13 macOS Tauri 开发启动修复

详细描述：

- 将仅供 Windows 剪贴板与系统通知功能使用的 `windows` crate 移至 Windows 目标专属依赖，避免 macOS 开发构建编译 Windows 依赖链。

## 2026-07-13 macOS 侧边栏菜单层级修复

详细描述：

- 页面操作菜单和顶部工具栏“更多”菜单通过 React Portal 渲染到 `document.body`，不再受侧边栏层叠上下文影响。

## 2026-07-13 macOS Tauri 开发告警清理

详细描述：

- Windows 专属剪贴板实现及辅助类型限定为 Windows；macOS 保留无操作调用契约，消除开发构建告警。

## 2026-07-12 欢迎手册重复创建修复

提交：未提交

简要描述：

修复桌面端重启后反复新增“知栖使用手册”的问题。

详细描述：

- 补齐 Rust 工作区设置的序列化字段：欢迎页 ID、欢迎手册版本、链接打开方式、页面默认显示和搜索偏好。
- 此前桌面端保存工作区时会丢弃未声明的欢迎页 ID 与版本号，导致下次启动误判为尚未安装手册，重复创建说明页及其示例资源。
- 修复后，已有工作区在下一次保存后会持久化当前手册标记；历史上已经多出的手册不会自动删除，避免误删用户编辑过的内容。

验证情况：

- 已通过 `cargo test preserves_extended_workspace_settings_fields_when_loading_and_saving --manifest-path src-tauri/Cargo.toml`。

## 2026-07-12 本机 MCP 启用状态修复

提交：未提交

简要描述：

修复已启用的本机 MCP 服务在设置中心仍显示为未启用、复选框点击看似无效的问题。

详细描述：

- 工作区启动时会归一化应用设置；此前该过程只保留关闭行为和主题，意外丢弃了已保存的 `mcp` 配置。
- 现在会保留端口和令牌均有效的 MCP 配置，设置中心可正确反映服务的启用状态。
- 新增回归测试，覆盖应用启动后保留已持久化的本机 MCP 设置。

验证情况：

- 已通过 `npm test`（89 个测试文件、762 条测试）和 `npm run build`。
- `npm run lint` 仍被既有的 `src/store/createWorkspaceStore.ts:4539` 未使用变量错误阻断；本次改动未触及该行。
- `cargo test mcp --manifest-path src-tauri/Cargo.toml` 在当前环境编译完成后因 Windows `STATUS_ENTRYPOINT_NOT_FOUND` 无法启动测试进程，未能完成 Rust 运行时验证。

## 2026-07-12 框选焦点轮廓修复

提交：未提交

简要描述：

修复正文框选完成后，编辑器外围出现黑色浏览器焦点边框的问题。

详细描述：

- 框选完成后编辑器表面会获得焦点，以便继续响应 Delete 等键盘操作；此前未覆盖浏览器默认的焦点轮廓，导致正文区域外侧显示一圈黑框。
- 现在仅关闭编辑器容器的默认 `outline`，已选块本身的主题色高亮、边框和删除交互保持不变。

验证情况：

- 已通过 `npm test -- src/styles/editorMultiSelectLayout.test.ts src/components/editor/BlockEditor.test.tsx`（76 项测试）。

## 2026-07-12 Word 表格混合内容粘贴

提交：未提交

简要描述：

修复 Word 内容同时包含标题、普通文本和表格时，全部回退为普通文本或编号列表的问题。

详细描述：

- 粘贴流程现在会优先尝试可解析的 HTML 结构；Word 的标题段落、普通段落和表格会一并转为对应的块。
- 只有 HTML 不包含可转换的结构时，才回退到 Markdown 或纯文本解析，因此保留了现有 Markdown 粘贴能力。
- 新增回归覆盖：当剪贴板纯文本带有类似 `1. 标题` 的内容、同时 HTML 里存在 Word 标题和表格时，仍保留标题层级和表格块。

验证情况：

- 已通过 `npm test -- src/components/editor/BlockEditor.test.tsx src/domain/clipboardCapture.test.ts`（87 项测试）。
- 已通过 `npm run build`。

## 2026-07-12 简单表格紧凑编辑

提交：未提交

简要描述：

简单表格改为正文内更清爽的紧凑显示，并补齐高频单元格键盘录入。

详细描述：

- 移除表格原先为行列控制条预留的上、下、左、右空白区域，表格默认只显示内容网格。
- 行、列、加行、加列的既有控制继续保留，但默认透明且不拦截点击；鼠标悬停表格后才显示在网格边缘。
- 单元格内按 `Tab` 按顺序进入下一格；位于表格最后一格时会自动新增一列并继续聚焦。按 `Enter` 进入下一行；在最后一行时会自动新增一行。
- 表格记录、单元格背景色、对齐方式、已保存的列宽/行高与行列菜单均复用原有数据契约，不进行迁移或重建。

验证情况：

- 已通过 `npm test -- src/components/editor/blocks/TableBlock.test.tsx src/styles/tableControlLayout.test.ts src/styles/tableBorders.test.ts`（27 项测试）。
- 已通过编辑器联动回归：`npm test -- src/components/editor/blocks/TableBlock.test.tsx src/components/editor/BlockEditor.test.tsx src/styles/tableControlLayout.test.ts src/styles/tableBorders.test.ts`（103 项测试）。
- 已通过 `npm run build`。

## 2026-07-11 Word 富文本粘贴

提交：未提交

简要描述：

从 Word 复制内容到知栖时，标题层级、简单表格和内嵌图片现在会分别转换为对应的标题块、表格块和图片块。

详细描述：

- Windows 桌面端会直接读取剪贴板的 `HTML Format`，并解析 CF_HTML 片段，不再仅依赖 WebView 是否把富文本 HTML 传给前端。
- Word 的 `Heading`、中文标题样式、`mso-outline-level` 和标题类样式会映射为知栖的三级标题；四级及更深层级会收敛为三级标题，这是当前编辑器的最大层级。
- Word 的 HTML 表格会保留单元格文本并插入为知栖简单表格；带 `data:` 或本地 `file:///` 来源的图片会先写入本地资源库，再创建可正常显示的图片块。
- 普通加大字号的文本不会被猜测为标题，避免破坏用户原来的正文结构。

验证情况：

- 已通过 Word 标题、表格、图片的前端定向回归：`npm test -- src/domain/clipboardCapture.test.ts src/components/editor/BlockEditor.test.tsx src/lib/desktopLifecycle.test.ts`。
- 已通过 Rust 定向回归：`cargo test extracts_the_fragment_from_windows_cf_html --manifest-path src-tauri/Cargo.toml`。
- 已通过 `npm run build`。
- 已通过隔离浏览器界面验证：模拟 Word HTML 实际渲染为标题块、简单表格和图片块。

## 2026-07-11 编辑器块操作、图标移除与列表富文本

提交：未提交

简要描述：

补齐正文块的上下插入入口；页面图标移除后不再恢复默认图标；列表文本现在可使用正文同款富文本浮窗。

详细描述：

- 有内容的块在手柄菜单中新增“在上方插入块”和“在下方插入块”，两者都会插入一个空段落并自动聚焦；首块同样可以在上方插入。
- 页面图标新增“已隐藏”状态：历史页面缺失图标会继续迁移为默认图标，而用户主动选择“移除图标”后，页面标题、侧边栏和子页面块不会再回退显示默认图标。
- 无序列表和有序列表改用既有富文本编辑器，选中文本后可使用加粗、斜体、颜色、链接等浮动操作；列表的回车、新建下一项、焦点和同步块编辑保持原有行为。

验证情况：

- 已通过块手柄、页面图标、侧边栏、列表、同步块和编辑器定向回归。
- 已通过 `npm run build`。

## 2026-07-11 页面属性、跨块复制与外链打开方式

提交：未提交

简要描述：

页面属性现在可以按工作区默认值和当前页面分别控制显示；正文跨块拖选可稳定复制多行内容；外链打开方式可在设置中心选择为直接点击或按 Ctrl 后点击。

详细描述：

- 在“编辑与页面默认”中新增“新页面默认显示页面属性”，只影响后续新建页面；已有页面保持原来的显示状态。
- 页面右上角“⋯”的视图设置新增“显示页面属性”，关闭仅隐藏属性面板，不删除标签、状态、日期和备注等已填写的数据。
- 当关闭“允许从正文区域直接框选”时，从一个正文块拖到相邻正文块会保持为文本选择，可直接复制多行文字；从左侧安全区或空白处拖动仍保持原有框选块行为。
- 在“编辑与页面默认”中新增正文外链打开方式：可选择“按 Ctrl 后打开外链”或“点击直接打开外链”。页面提及和页面链接仍保持原有的直接跳转行为。

验证情况：

- 已通过 `npm test`：87 个测试文件、691 条测试。
- 已通过 `npm run build`。

## 2026-07-10 Markdown 导入为页面

提交：未提交

简要描述：

支持选择单个 Markdown 文件，转换为新的顶层可编辑页面并自动打开。

详细描述：
- 导入会识别标题、段落、待办、无序/有序列表、代码块和 GFM 表格；首个一级标题作为页面标题，未识别语法保留为正文文本。
- 加粗、斜体、删除线和网页链接会转换为现有富文本；行内代码保留内容本身，不会丢失文本。
- Markdown 中的相对本地图片会复制进知栖资产库并生成图片块；无法读取、非图片或远程图片链接会保留原始 Markdown 文本。
- 页面更多菜单、侧边栏更多菜单、设置中心和数据表页面的导入菜单均新增“导入 Markdown”。
- 跨文件 Markdown 链接转页面关系、远程图片下载入库仍保留在 `docs/todo.md`，本次不产生无提示网络请求。

验证情况：
- 已通过 Markdown 解析、文件访问、资产、store、应用与导入入口定向回归。
- 已通过生产构建：`npm run build`。

## 2026-07-10 收件箱拖拽导入

提交：未提交

简要描述：

支持将操作系统文件直接拖入知栖窗口，自动保存到本地资产库并追加到收件箱。

详细描述：
- 外部文件拖入窗口时会显示“松开以导入到收件箱”提示；页面树、正文块和数据表内部拖拽不会触发该提示。
- 图片、音频、视频继续使用现有媒体块；PDF、文档、压缩包等其他文件使用新的轻量附件块显示文件名与类型，并可通过“打开文件”交给系统默认程序查看。
- 附件继续复用既有 `assetId` 与资产引用扫描，因此可随工作区备份和页面包导出，且不会被孤立资源清理误删。
- 本期不包含 Markdown 转页面或内嵌 PDF 预览；附件打开只接收应用管理的 `assetId`，不会暴露任意本地路径。

验证情况：
- 已通过块工厂、附件块、应用壳和编辑器定向回归：`npm run test -- src/utils/blockFactory.test.ts src/components/editor/blocks/FileBlock.test.tsx src/components/layout/AppShell.test.tsx src/components/editor/BlockEditor.test.tsx`
- 已通过 Rust 附件资产引用回归：`cargo test file_block_asset_reference_is_preserved`
- 已通过构建：`npm run build`

## 2026-07-08 工作区整包导入补回

提交：未提交

简要描述：

把“导入”这条链路从原来几乎只指向页面包，补成了真正可用的“工作区整包恢复 + 页面包导入并存”。

详细描述：
- 根因是当前多个入口只接了 `导入页面包`，而 `全部导出` 导出的却是整库 JSON 备份，所以用户拿工作区备份去走原导入入口时一定会失败。
- 现在新增了 `导入完整备份` 动作，直接读取工作区 JSON 备份，并在导入前明确提示“会覆盖当前工作区内容”。
- 导入完整备份前会先刷新待保存内容，避免把旧内存状态又写回去覆盖刚恢复的数据。
- 导入完成后会重新加载整个工作区，并回到备份里的当前页面或首页。
- 普通页面菜单现在同时保留四条动作：`导出当前页面`、`全部导出`、`导入完整备份`、`导入页面包`。
- 左侧顶部单独的 `导入` 按钮现在改为更符合语义的“导入完整备份”；页面包导入保留在左侧更多菜单和页面菜单里，避免“导入”到底是导整库还是导单页的歧义。
- 设置中心的“导入导出”分组也同步补上了 `导入完整备份`，和 `导入页面包` 并列显示。

验证情况：
- 已通过定向回归：`npm run test -- src/components/export/ExportImportPanel.test.tsx src/components/settings/SettingsCenter.test.tsx src/components/sidebar/SidebarTree.test.tsx src/app/App.test.tsx`
- 已通过构建：`npm run build`

## 2026-07-08 设置中心 Phase 2A

提交：未提交

简要描述：

把设置中心里原本占位的“搜索与知识组织”补成真实可用设置，同时补上“清理孤立资源文件”入口，并让这些搜索展示偏好立刻作用到全局搜索弹窗。

详细描述：
- 工作区设置新增搜索展示偏好：`按类型分组显示搜索结果`、`显示命中来源标签`、`搜索摘要长度`（短 / 标准 / 长）。
- 这些偏好继续复用现有 `WorkspaceSettings` 持久化，不再额外造第二套搜索配置来源，刷新后也会保留。
- 全局搜索弹窗已经接入这组设置：关闭分组后直接平铺结果，关闭来源标签后不再显示“正文 / 标签 / 白板内容”这类说明，摘要长度会按设置即时裁切。
- “数据与维护”新增 `清理孤立资源文件`，直接复用已有仓库清理能力，不新增桌面命令和额外后端逻辑。
- 这次只补搜索结果展示层和维护入口，没有顺手扩到搜索重建、工作区恢复或更高风险的数据修复动作。

验证情况：
- 已通过定向前端回归：`npm run test -- src/store/createWorkspaceStore.test.ts src/components/settings/SettingsCenter.test.tsx src/components/search/SearchDialog.test.tsx src/app/App.test.tsx`
- 已通过构建：`npm run build`

## 2026-07-08 设置中心 Phase 1

提交：未提交

简要描述：

把已经分散在侧边栏、页面显示和桌面端关闭行为里的低风险设置收进了第一版设置中心，同时补上了独立的应用级设置持久化。

详细描述：
- 新增应用级 `设置中心` 路由和页面壳体，固定为“左侧分类 + 右侧内容”，先接入通用、外观与侧边栏、编辑与页面默认、导入导出、桌面端、数据与维护几组可落地内容。
- 左侧侧边栏顶部“更多”菜单新增 `设置` 入口，可以直接从当前工作区跳进设置中心。
- 新增 `AppSettings` 持久化链路，和现有 `WorkspaceSettings` 分开保存；当前先落地一个真实应用级设置：关闭窗口时是“最小化到托盘”还是“直接退出”。
- 工作区设置补齐剪贴板捕获模式和新页面默认显示值，并让这些默认值只作用于后续新建页面，不改写已有页面。
- 设置中心里接入了现有的工作区导入导出、孤立白板清理、孤立数据表清理和收件箱快捷入口，没有重造第二套动作实现。
- 桌面端关闭事件现在会在冲刷待保存数据后，根据设置决定隐藏窗口还是直接退出。

验证情况：
- 已通过定向前端回归：`npm run test -- src/lib/appSettingsRepository.test.ts src/lib/storageClient.test.ts src/store/createWorkspaceStore.test.ts src/components/settings/SettingsCenter.test.tsx src/components/sidebar/SidebarTree.test.tsx src/lib/desktopLifecycle.test.ts src/app/App.test.tsx src/styles/settingsCenterLayout.test.ts`
- 已通过 Rust 存储回归：`cargo test --manifest-path src-tauri/Cargo.toml saves_and_loads_app_settings_independently_from_workspace_settings`
- 已通过构建：`npm run build`

## 2026-07-07 worktree 回退与桌面端数据修复

提交：未提交

简要描述：

这次把一次比较危险的“跑错代码副本”问题兜住了：桌面调试被拉到了旧 worktree，上面缺少后续尚未提交到 Git 的同步块、引用块、页面提及、空白行 `+` 菜单等实现；同时旧桌面端还会把工作区设置写残。现在主工作区重新接管桌面调试，并补上了同步块孤儿恢复、收件箱复用和桌面端设置完整持久化。

详细描述：
- 定位到根因是 `E:\Workspace\个人知识库-桌面端\.worktrees\clipboard-capture-v1` 这条旧 worktree 曾被当成桌面调试入口运行，而真正最新的页面关系、同步块、空白行体验等代码只存在于主工作区的当前改动里。
- 前端存储仓库加载工作区时，新增了“孤儿同步块组”兜底：如果本地库里还留着 `syncedBlockGroups`，但所有页面里一个 `synced_block` 容器都不剩，会自动创建一个顶层 `同步块恢复` 页面，把这些同步块集中恢复为可编辑主实例，避免共享内容彻底不可见。
- 这个恢复只在“全工作区同步块容器为 0”时触发，不会把正常应该清掉的脏组重新塞回来。
- Vite 开发监听增加了 `**/.worktrees/**` 忽略，避免主工作区调试时被嵌套 worktree 的文件变动反复触发整页重载。
- Vitest 也补上了 `**/.worktrees/**` 排除，避免跑主工作区测试时把旧 worktree 里的历史测试一起扫进来。
- `ensureInboxPageInSnapshot` 现在会先复用现有的 `收件箱` 页面，而不是在 `inboxPageId` 丢失时继续无限新建新的收件箱页面。
- Rust 侧 `WorkspaceSettings` 补回了完整字段：`inboxPageId`、`sidebarLayout`、`sidebarWidth`、`pinnedSidebarItems`、`clipboardCaptureMode`，桌面端再次保存工作区时不再把设置写回成只剩 `lastOpenedPageId`。

验证情况：
- 已通过前端仓库恢复回归：`npm run test -- src/lib/workspaceRepository.test.ts`
- 已通过收件箱复用回归：`npm run test -- src/store/createWorkspaceStore.test.ts -t "reuses an existing inbox page when inboxPageId is missing during bootstrap"`
- 已通过原有同步块 / 引用块 / 空白行 / 页面提及回归：
  `npm run test -- src/components/editor/BlockEditor.synced.test.tsx`
  `npm run test -- src/components/editor/EmptyBlockRow.test.tsx`
  `npm run test -- src/components/editor/RichTextEditable.test.tsx src/app/App.test.tsx`
- 已通过 Rust 设置持久化回归：`cargo test --manifest-path src-tauri/Cargo.toml preserves_extended_workspace_settings_fields_when_loading_and_saving`
- 已通过构建：`npm run build`
- 额外复核时发现 `src/store/createWorkspaceStore.test.ts` 里现有两条剪贴板捕获测试仍然失败，说明方向 2 的剪贴板功能在主工作区尚未完整并回；这两条不是本次修复引入，但后续合并桌面捕获能力时需要继续收口。

## 2026-07-07 方向 2 第一阶段桌面入口

提交：未提交

简要描述：

把方向 2 的第一段桌面端入口闭环先落到最小可用：工作区固定收件箱、左侧 `系统` 分组、以及托盘里的 `打开知栖 / 新建笔记 / 打开收件箱 / 退出` 已经串通。

详细描述：
- `收件箱` 继续复用普通页面模型，不引入第二套捕获数据结构，只在工作区设置里记录 `inboxPageId`。
- 新工作区会自动带上固定 `收件箱` 页面；旧工作区如果缺少收件箱，启动时会自动修复。
- 左侧页面树新增 `系统` 分组，`收件箱` 固定显示在这里，并且不再重复出现在 `我的页面` 里。
- 前端新增桌面托盘事件桥接：托盘 `新建笔记` 会直接创建顶层普通页面并打开；`打开收件箱` 会在必要时先补回收件箱，再直接跳转过去。
- Tauri 托盘菜单已切换成 `打开知栖 / 新建笔记 / 打开收件箱 / 退出`，动作仍然通过前端 store 和现有路由链路完成，没有在 Rust 侧再造一套页面写入逻辑。
- 顺手补齐了工作区整包导出测试，使其显式覆盖收件箱随工作区一起导出的新行为。

验证情况：
- 已通过定向前端回归：`npm run test -- src/store/createWorkspaceStore.test.ts src/components/sidebar/SidebarTree.test.tsx src/lib/desktopLifecycle.test.ts src/app/App.test.tsx`
- 已通过 Rust 托盘映射回归：`cargo test --manifest-path src-tauri/Cargo.toml maps_tray_menu_ids_to_actions`
- 已通过构建：`npm run build`

## 2026-07-07 同步块 / 引用块用户层收口第一轮

提交：未提交

简要描述：

把“同步组已丢失”这类异常同步块收回到和正常同步块一致的轻量块样式里，同时补上键盘删除与焦点回落，避免缺失态块单独长成一张卡片、手柄位置和删除体验都跑偏。

详细描述：
- 缺失同步组时，块容器不再走独立卡片样式，改为复用同步块现有的左侧竖条 callout 结构，和正常同步块 / 引用块保持同一套对齐逻辑。
- 新增 `synced-block-container-missing` 状态，给缺失态补上单独的左侧强调色和聚焦反馈，但整体仍保持清爽的正文内嵌形式。
- 缺失态同步块现在也可以像引用块一样先聚焦、再用 `Backspace / Delete` 直接删除容器，不需要先绕到更多菜单。
- 删除缺失态同步块后，编辑焦点会回到前一个正文块，保持和现有引用块删除一致的编辑节奏。
- 顺手收紧了同步块容器的键盘删除触发条件：只有块容器本身处于焦点时才响应删除键，避免嵌套按钮拿到焦点时误删整个同步块。
- 复杂块的同步壳层现在和手柄菜单规则保持一致：主同步实例不再显示“前往原位置”，只有引用实例或非主同步实例才保留这个跳转动作。

验证情况：
- 已按 red -> green 运行定向回归：`npm run test -- src/components/editor/blocks/SyncedBlockContainer.test.tsx src/components/editor/BlockEditor.synced.test.tsx src/styles/pageOutlineLayout.test.ts`

## 2026-07-07 同步块 / 引用块数据收口第一轮

提交：未提交

简要描述：

补上了同步块 / 引用块最危险的一段数据完整性收口：同步组里的白板、数据表、导图资源现在会被正确计入引用；加载快照时也会修复脏的 `syncedBlockGroups`，避免主实例丢失或空组残留把本地数据带坏。

详细描述：

- `createWorkspaceStore` 里的资源引用扫描从只看 `pages[].blocks`，补成同时覆盖 `pages[].blocks` 和 `syncedBlockGroups[].blocks`。
- 这次一起修正了三条关键路径：`cleanupOrphanBoards`、`cleanupOrphanDataTables`、以及删页面时的 `filterResourcesReferencedByPages` 资源过滤。
- 新增回归测试，锁定“同步组内 whiteboard / data_table / mindmap 仍然被引用时，不会被误清理”的行为。
- 把同步组修复逻辑抽成纯函数 `reconcileSyncedBlockGroups`，统一用于 store 侧和仓库加载侧。
- 仓库加载快照时，若 `primaryInstanceId` 已失效，会自动迁移到当前还存在的实例；如果某个同步组已经没有任何页面实例，会在加载后被安全丢弃。
- 现有“复制页面会保留 `groupId`、只重写副本 `blockId / instanceId`”的语义也补强了断言，顺手锁住原页面实例和原同步组元数据不会被误改。
- 顺手补上了 `getNextPrimaryInstanceId(..., []) -> null` 的纯函数回归测试，避免后面再把空实例边界改坏。
- 已复核当前同步块编辑器和搜索相关回归集，现有行为保持稳定，没有额外扩 UI 和交互规则。

验证情况：

- 已通过数据层定向测试：`npm run test -- src/domain/syncedBlocks.test.ts src/lib/workspaceRepository.test.ts src/store/createWorkspaceStore.test.ts`。
- 已通过 Rust 定向回归：`cargo test --manifest-path src-tauri/Cargo.toml workspace_backup_and_bootstrap_include_synced_block_groups`。
- 已通过 Rust 定向回归：`cargo test --manifest-path src-tauri/Cargo.toml page_package_export_includes_referenced_synced_groups_resources_and_assets`。
- 已通过 Rust 定向回归：`cargo test --manifest-path src-tauri/Cargo.toml page_package_import_rewrites_synced_group_and_instance_ids`。
- 已通过同步块编辑器与搜索回归：`npm run test -- src/components/editor/BlockEditor.synced.test.tsx src/components/editor/blocks/SyncedBlockContainer.test.tsx src/styles/pageOutlineLayout.test.ts src/domain/search.test.ts src/components/search/SearchDialog.test.tsx`。
- 已通过合并后的聚焦回归：`npm run test -- src/domain/syncedBlocks.test.ts src/lib/workspaceRepository.test.ts src/store/createWorkspaceStore.test.ts src/components/editor/BlockEditor.synced.test.tsx src/components/editor/blocks/SyncedBlockContainer.test.tsx src/styles/pageOutlineLayout.test.ts src/domain/search.test.ts src/components/search/SearchDialog.test.tsx`，结果 8 个文件、135 个测试全部通过。
- 已通过构建：`npm run build`。

## 2026-07-06 页面关系网络 v1

提交：未提交

简要描述：

普通页面正文现在支持 `[[页面]]` 和 `@页面` 关系引用，页面底部新增 backlinks / mentions 区块，搜索也能区分页面链接与页面提及；页面包导入时会同步重写包内 relation target，并把包外 target 安全降级为普通文本。

详细描述：

- 段落、标题、待办等普通页面富文本现在支持创建内部页面链接和页面提及，relation 元数据直接挂在现有 rich text segment 上，不额外引入独立关系表。
- 页面底部新增“链接到此页面”和“提及此页面”两个关系区，能展示来源页面、来源块上下文，并支持直接跳回来源位置。
- 页面重命名后，正文中的 relation 显示文本会自动同步；删除目标页面后，正文会保留可见文字，但 relation 元数据会安全降级，避免留下坏链接。
- 搜索新增“页面链接”“页面提及”两类命中来源，桌面端与前端搜索结果都保留来源块信息，便于直接打开到对应上下文。
- 页面包导入现在会重写 `richText[].pageId`：若 relation 指向包内页面，则映射到新导入后的 page id；若指向包外页面，则保留文本并移除 `pageId / relationKind`，避免导入后残留失效关系。
- relation 插入后的异步光标恢复现在只会作用于仍挂在文档中的编辑器，避免编辑器卸载后再改动全局 selection，减少切页或异步创建场景下的串扰。

验证情况：

- 已通过 Rust 回归：`cargo test import_page_package_rewrites_rich_text_page_relations`（使用临时 `CARGO_TARGET_DIR` 运行），结果 1 passed、0 failed。
- 已通过 Rust 回归：`cargo test search_workspace_returns_relation_hits_with_block_ids`（使用临时 `CARGO_TARGET_DIR` 运行），结果 1 passed、0 failed。
- 已通过前端定向验证：`npm run test -- src/domain/search.test.ts src/components/search/SearchDialog.test.tsx src/lib/storageClient.test.ts src/components/editor/PageRelationsPanel.test.tsx src/app/App.test.tsx`，结果 5 个文件、61 个测试全部通过。
- 已通过关系编辑器回归：`npm run test -- src/components/editor/PageRelationsPanel.test.tsx src/app/App.test.tsx src/components/editor/RichTextEditable.test.tsx src/components/editor/PageRelationAutocomplete.test.tsx src/store/createWorkspaceStore.test.ts src/domain/search.test.ts src/components/search/SearchDialog.test.tsx src/lib/storageClient.test.ts`，结果 8 个文件、111 个测试全部通过。
- 已通过前端全量测试：`npm test`，结果 71 个文件、486 个测试全部通过。
- 已通过 Rust 全量测试：`cargo test`（使用临时 `CARGO_TARGET_DIR` 运行），结果 48 passed、0 failed。
- 已通过构建：`npm run build`。

## 2026-07-05 页面属性与搜索升级

提交：未提交

简要描述：

为普通页面增加轻量页面属性，并让搜索支持属性命中、结果分组、标签/状态筛选和同页多命中展示。

详细描述：

- 普通页面新增标签、状态、日期、备注四类共享页面属性。
- 页面属性显示在标题下方、正文上方，保持紧凑元信息层。
- 搜索支持标题、正文、媒体文件名和页面属性命中来源展示。
- 搜索结果支持按页面、白板、数据表分组，并增加标签、状态筛选入口。
- 同一页面的多个命中片段现在会直接显示出来，不再只保留单条摘要。
- SQLite 和页面备份结构已兼容页面属性定义与页面属性值。
- 应用层补充普通页面路径集成回归，明确约束标题下属性展示和属性命中搜索入口保持连通。

验证情况：

- Task 5 集成回归按 red -> green 执行：先运行 `npx vitest run src/app/App.test.tsx src/components/editor/PageHeader.test.tsx`，新增用例 `shows page properties below the title and lets search surface property hits on normal pages` 首次失败；修正测试后再次运行同命令通过，结果为 2 个文件、36 个测试全部通过
- 已通过 focused vitest：`npx vitest run src/domain/pageProperties.test.ts src/store/createWorkspaceStore.test.ts src/domain/search.test.ts src/components/editor/PagePropertiesPanel.test.tsx src/components/search/SearchDialog.test.tsx src/app/App.test.tsx src/components/editor/PageHeader.test.tsx src/lib/workspaceRepository.test.ts src/lib/storageClient.test.ts`
- 已通过全量测试的本机等价命令：`C:/Program Files/nodejs/npm.cmd run test`（本机 `npm test` 入口解析异常，直接 `npm.cmd` 可正常执行）
- 已通过构建：`C:/Program Files/nodejs/npm.cmd run build`
- 已通过完整 Rust 测试：`cargo test --manifest-path E:\Workspace\个人知识库-桌面端\src-tauri\Cargo.toml`，结果为 46 passed、0 failed

## 2026-07-05 左侧页面结构区分组折叠

提交：未提交

简要描述：

把左侧页面结构区整理成更清晰的分组结构，先落地 `星标置顶` 和 `我的页面` 两个可折叠区域，并预留 `共享页面` 分组入口。

详细描述：

- 左侧页面结构区改为分组显示，当前已按 `星标置顶 / 我的页面` 两段组织页面内容。
- `星标置顶` 分组保留现有置顶树和子树缩进逻辑，并支持整组展开/收起。
- `我的页面` 分组承接原来的主页面树，也支持整组展开/收起。
- `共享页面` 先按预留分组处理，当前没有共享数据时不显示，不提前引入新的共享数据模型。
- 分组折叠只控制整组内容显示，不会重置组内页面自己的展开/收起状态；重新展开后，原来的页面层级状态会保留。
- 保持现有页面级折叠、置顶父页面带出子树、数据表跟随页面显示等行为不变，只在侧边栏结构层增加分组壳。

验证情况：

- 已通过 `npm test -- src/components/sidebar/SidebarTree.test.tsx`

- 新提交如果包含功能、体验、数据、打包、架构或用户可感知变化，需要在本文档顶部新增一条记录。
- 每条记录固定包含：日期、提交、简要描述、详细描述、验证情况。
- 小型修复可以合并进同一天同一主题；跨模块或用户可感知的改动要单独成条。
- 历史大版本整理来自 Git 提交记录和现有设计文档，不等同于正式语义化版本号。

## 2026-07-05 桌面端页面布局、媒体与搜索体验优化

提交：`cf8ecfa 优化桌面端页面与媒体体验`

简要描述：

优化桌面端页面阅读与编辑体验，重点处理左侧目录、正文居中、顶部面包屑工具栏、右侧页面目录、媒体预览、搜索和本地数据稳定性。

详细描述：

- 左侧页面结构支持自由拖动宽度，并限制在窗口约 `1/8` 到 `1/4` 范围内。
- 增加紧凑模式，压缩左侧树的行距、缩进和占用空间，统一目录文字大小。
- 左侧页面名超长时改为单行省略，避免窄宽度下换行撑开布局。
- 优化页面树展开/收起按钮和更多按钮，仅在悬浮或选中时显示，减少视觉干扰。
- 去掉左侧“首页”块，顶部改为预留账号区和搜索、新建页面、导入、消息、更多等功能入口。
- 修复左侧更多菜单、顶部更多菜单在侧栏变窄时的弹出层位置和层级问题。
- 普通页面正文在左侧页面结构和右侧页面目录之间居中显示，避免被右侧目录影响而偏移。
- 顶部区域改为左侧面包屑、右侧封面/图标/更多按钮，并在滚动后吸附固定。
- 顶部吸附条只在滚动后显示轻微阴影，回到顶部时去掉线条和投影。
- 封面图从正文宽度中抽离，保持与顶部区域同宽；标题、图标与正文内容对齐。
- 右侧页面目录从正文开头位置出现，滚动到顶部区域后再吸附固定，并隐藏自身滚动条。
- 优化全局滚动条样式，使滚动条更细、颜色更淡。
- 图片预览窗口扩大到接近窗口 `90%`，支持滚轮缩放、按鼠标位置缩放、拖动查看、双击重置视图和缩放百分比显示。
- 优化图片拖动光标和拖动状态边框，避免拖动一次后图标边框色失效。
- 音频组件宽度适应正文区域。
- 修复图片、视频、音频相关文件名中文乱码和桌面端资源显示问题。
- 修复桌面端搜索异常，补强图片/音频文件名进入搜索结果，并支持同一页面多个匹配结果展示。
- 修复刷新后白板、数据库、导图入口消失的问题，避免空数据初始化覆盖已有本地数据。
- 修复 React StrictMode 下空仓库启动写入重复初始化数据的问题。
- 修复左侧目录最小宽度下出现横向滚动条的问题。

验证情况：

- 已通过 `npm test`，共 63 个测试文件、379 个测试。
- 已通过 `npm run build`。
- 已用浏览器检查侧栏最小宽度下不再出现横向滚动条。

## 2026-07-04 Windows 打包配置更新

提交：`8be50c0 chore: update Windows packaging config`

简要描述：

补充和调整 Windows 桌面端打包配置，为后续桌面安装包发布做准备。

详细描述：

- 更新 Tauri Windows 打包覆盖配置。
- 对 NSIS/MSI、WebView2、安装模式和平台配置做统一整理。
- 保持桌面端以本地优先方式运行，打包配置只影响发布流程，不改变用户数据结构。

验证情况：

- 该阶段以配置提交为主；发布前仍需要在 Windows runner 上执行桌面端打包验证。

## 2026-07-02 页面包导入导出与资源安全

代表提交：`67ad5ae`、`61786a8`、`68ce537`、`0e84173`、`25b7aa4`、`f2f57ae`

简要描述：

新增页面包导入导出能力，并对页面、子页面和资源引用做完整性校验，降低导入导出破坏本地数据的风险。

详细描述：

- 增加页面包导入导出设计文档和实施计划。
- 新增页面包 storage client，覆盖导入导出边界场景。
- 将菜单中的旧归档入口切换为页面包入口。
- 支持导出页面包，并携带页面树、页面内容和引用资源。
- 支持导入页面包，并重写子页面、资源、页面树关系。
- 拒绝缺失资源、额外根节点、断裂页面树、错误根父级等非法页面包。
- 在导出前检查被引用资源是否存在，避免生成不可恢复的包。
- 在导入失败时保护已去重资源，减少失败导入带来的资源损坏。

验证情况：

- 增加页面包客户端、进度文案、非法根节点、子页面导入重写等测试。
- 导入导出类改动已围绕资源完整性和页面树连通性补充回归覆盖。

## 2026-07-02 本地媒体资产、品牌命名与资源管理

代表提交：`7b73672`、`dcd274e`、`dbab0ed`、`305f50b`、`98a3d36`

简要描述：

完善桌面端本地媒体资源存储，更新知栖品牌命名和应用图标，并加入孤立资源清理能力。

详细描述：

- 新增文件系统媒体资产支持，让图片、视频、音频等资源由应用管理到本地资产目录。
- 将数据库和资源路径统一到知栖命名，例如 `zhiqi.db` 和 `zhiqi-assets/`。
- 更新知栖应用图标，并补充 logo/icon 设计与实施文档。
- 为 MediaBlock 增加单元测试和样式测试，覆盖媒体块基本显示和交互。
- 新增孤立资源清理能力，减少无引用文件长期占用本地空间。
- 整理过时的设计文档和计划文档，避免旧方案误导后续维护。

验证情况：

- 增加媒体块和资源管理相关测试。
- 涉及本地资源路径和清理逻辑，后续继续改动时需要同时验证浏览器路径和 Tauri 桌面路径。

## 2026-06-29 至 2026-06-30 Tauri 桌面端与 SQLite 本地持久化

代表提交：`6807db8`、`d5d5906`、`a12e04c`、`de36b32`、`258a0dc`

简要描述：

项目从 Web 端形态扩展为 Tauri 桌面应用，并将主要数据持久化迁移到本机 SQLite。

详细描述：

- 集成 Tauri 2 桌面端壳，保留 React 前端编辑体验。
- 将工作区持久化迁移到 SQLite，前端通过类型化 storage client 访问。
- 将部分持久化逻辑下沉到 Rust，减少前端直接处理本地存储的复杂度。
- 增加桌面生命周期支持，在退出请求前处理保存。
- 增加外部链接处理命令，在桌面端安全打开 `http`、`https` 和 `mailto` 链接。
- 隐藏 Windows 控制台窗口，改善桌面启动体验。
- 增加页面删除和确认对话框。
- 简化启动脚本，整理项目结构和维护文档。

验证情况：

- 增加和调整工作区仓库、持久化、桌面生命周期相关测试。
- 该阶段是桌面端基础能力变更，后续涉及数据结构时需要优先保护 SQLite 和 JSON 备份契约。

## 2026-06-24 托管思维导图静态包与块入口集成

代表提交：`0195557` 至 `521b09f`

简要描述：

将思维导图作为特殊块接入编辑器，并通过 `public/mindmap-web/` 静态包与宿主应用通信。

详细描述：

- 增加思维导图特殊块集成设计和实施计划。
- 新增思维导图工作区 schema、store 支持和快照测试。
- 将思维导图块接入编辑器路由，支持从页面块进入独立编辑体验。
- 托管思维导图静态 bundle，并建立 iframe bridge 生命周期管理。
- 限定 hosted mindmap 的 storage key 范围，避免不同导图互相污染。
- 打磨 hosted mindmap 菜单和入口体验。
- 修复构建和 lint 问题，合并思维导图特殊块集成分支。

验证情况：

- 增加 legacy save compatibility、snapshot、route wiring 等测试。
- 验证重点是块入口、独立页面入口、iframe bridge 生命周期和构建通过。

## 2026-06-23 至 2026-06-24 数据表块与编辑器体验打磨

代表提交：`2e83479`、`a4d2bf3`、`3bb455b`、`3f8b49c`

简要描述：

新增数据表块能力，并对编辑器块交互、页面 chrome 和数据表体验做集中打磨。

详细描述：

- 增加数据表块，让页面中可以插入数据库入口或内联数据表。
- 优化编辑器块交互，包括块选择、操作入口、页面结构和编辑表面。
- 打磨数据表页面与编辑器壳层的交互一致性。
- 优化页面 chrome，让普通页面和数据表页面在导航、标题、工具区上更接近统一体验。

验证情况：

- 该阶段主要是编辑器和数据表体验更新；后续修改数据表时需同时检查独立页面入口和块入口。

## 2026-06-20 至 2026-06-21 思维导图画布交互与运行时重建

代表提交：`deb66e8` 至 `7226368`

简要描述：

在思维导图 MVP 基础上补齐布局模式、画布交互、节点样式，并最终 fork 白板运行时形成独立思维导图运行时。

详细描述：

- 增加思维导图布局模式模型和多种布局模式。
- 修复布局边界、空操作持久化、标题无效持久化等稳定性问题。
- 增加画布缩放、平移、节点拖动等交互能力。
- 打磨思维导图入口、预览、节点外观和页面样式。
- 增加持久化兼容性测试，避免旧数据损坏。
- 记录运行时重建设计，并将白板运行时 fork 为思维导图运行时，解决持续补丁带来的底层能力限制。

验证情况：

- 增加 mindmap canvas interaction 和 persistence compatibility 测试。
- 验证重点是画布交互、布局边界、保存兼容和预览入口。

## 2026-06-18 思维导图 MVP

代表提交：`91cd224` 至 `6cc4471`

简要描述：

建立思维导图功能的第一版架构、数据模型、页面入口和最小编辑流。

详细描述：

- 增加思维导图架构基线和集成计划文档。
- 新增 mindmap 工作区 schema，并将 mindmap 数据从普通页面中拆分出来单独存储。
- 增加思维导图文档入口块和页面路由。
- 实现最小思维导图编辑器和基础编辑流程。
- 修复并发编辑保存问题。
- 抽取共享画布壳层、非页面资产持久化和画布样式 token。
- 增加进入思维导图的快捷入口。

验证情况：

- 该阶段形成 MVP，可用于后续画布交互、运行时和块入口集成迭代。

## 2026-06-14 至 2026-06-15 Web 端基础编辑器与工作区骨架

代表提交：`001f176` 至 `22a0f2e`

简要描述：

搭建类 Notion Web 端基础骨架，完成工作区领域模型、页面树、块编辑器、基础插入和导出能力。

详细描述：

- 初始化 notion-style web shell。
- 定义 workspace 领域模型和 bootstrap store。
- 对齐 workspace schema 和 repository 测试，保护空工作区快照。
- 修复代码块语言字段保存问题。
- 构建应用壳和种子页面渲染。
- 稳定应用路由状态。
- 增加页面树操作和标题编辑。
- 增加核心块编辑器组件。
- 增加空白行 slash-menu 插入流程。
- 增加块拖拽手柄和重排行为。
- 增加导出工具和保存状态提示。

验证情况：

- 建立早期 repository 和 schema 测试，为后续桌面端、本地持久化和复杂块能力提供基础。
# 2026-07-05 白板页面重命名入口补充

提交：未提交

简要描述：

在白板独立页面的“更多”菜单中补充“重命名”入口，解决进入白板后只能直接点标题、缺少明显命名入口的问题。

详细描述：

- 白板页面右上角“更多”菜单新增“重命名”操作。
- 点击“重命名”后弹出系统重命名对话框，和侧边栏页面重命名的交互保持一致。
- 输入新名称并确认后，白板标题会立刻更新到当前页面。
- 保持现有白板标题编辑与持久化链路不变，只补充更明确的入口，不额外引入新状态面板。
- 新增白板路由菜单交互测试，覆盖“菜单触发重命名对话框并更新标题”的完整行为。
- 左侧页面目录板块调整为“顶部账号区/功能区固定，目录内容区单独滚动”，避免滚动长目录时顶部入口一起滑走。
- 左侧固定区补上和正文顶部栏一致的滚动反馈：目录滚动后显示分隔边线与轻阴影，回到顶部后自动取消。
- 去掉左侧页面结构板块中的“最近白板”独立分组，避免与主页面树重复占位。

验证情况：

- 已通过 `npm test -- src/components/whiteboard/WhiteboardPage.test.tsx src/app/App.test.tsx`
## 2026-07-05 页面导出入口补强

提交：未提交

简要描述：

补上侧边栏单页导出入口，并在顶部页面菜单里增加全部导出，方便按页面导出分享，也方便一键导出整库备份。

详细描述：
- 左侧页面结构的“更多”菜单新增“导出页面”，可直接导出该页面对应的页面包，不再受当前打开页面限制。
- 顶部页面菜单新增“全部导出”，导出当前工作区的完整 JSON 备份，便于整库备份和迁移。
- 单页导出继续复用现有页面包导出链路，避免引入第二套导出实现。
- 全部导出直接基于当前工作区状态生成备份内容，并复用现有文本文件保存能力。
- 补充页面菜单、侧边栏菜单和应用级导出行为测试，覆盖“菜单入口出现”和“实际导出触发”两层验证。

验证情况：
- 已通过 `npm test -- src/components/export/ExportImportPanel.test.tsx src/components/sidebar/SidebarTree.test.tsx src/app/App.test.tsx`
## 2026-07-05 数据表页父页面高亮修正

提交：未提交

简要描述：

修正左侧目录在进入数据表页面后，父页面和数据表同时显示为选中态的问题。

详细描述：
- 左侧普通页面链接改为仅在精确页面路由下进入选中态，避免把数据表、白板等子路由也算作父页面命中。
- 页面行级高亮同步收紧为“当前页面 ID 命中且当前路由正好是该页面本身”，不再在数据表子路由下把父页面整行点亮。
- 补充侧边栏回归测试，覆盖“数据表页面选中时仅数据表高亮、父页面不高亮”的场景。

验证情况：
- 已通过 `npm test -- src/components/sidebar/SidebarTree.test.tsx`
## 2026-07-05 左侧更多菜单补全“全部导出”
提交：未提交

简要描述：

把左侧页面目录功能区“更多”菜单里缺失的“全部导出”补回，和顶部页面菜单保持一致。
详细描述：
- 侧边栏功能区“更多”菜单新增“全部导出”入口，直接复用现有工作区 JSON 备份导出能力。
- 保持原有“紧凑模式 / 经典模式”切换不变，只补齐缺失的导出入口，不引入新的导出链路。
- 应用层继续复用现有 `onExportWorkspace` 回调下传到侧边栏，避免出现顶部能导出、左侧不能导出的割裂体验。
- 补充侧边栏测试，覆盖“从左侧更多菜单触发全部导出”的行为。
验证情况：
- 已通过 `npm test -- src/components/sidebar/SidebarTree.test.tsx`
## 2026-07-05 左侧结构区滚动条贴边恢复

提交：未提交

简要描述：

把左侧页面结构区滚动条重新贴近侧边栏右边缘，恢复更接近之前的视觉位置。

详细描述：

- 调整左侧结构区滚动容器的右侧布局，让滚动条靠近侧边栏外沿，而不是缩在内容区里。
- 保留内容本身的右侧安全间距，避免为了贴边把目录文字和更多按钮挤到滚动条上。
- 只修改侧边栏滚动区域样式，不改页面树节点、按钮位置和宽度拖拽逻辑。
- 补充样式回归测试，覆盖左侧滚动区域贴边所需的边距规则。

验证情况：

- 待运行 `npm test -- src/styles/appShellLayout.test.ts`

## 2026-07-05 页面头部弹窗互斥补齐

提交：未提交

简要描述：

补齐页面右上角“更多”和封面、图标弹窗的互斥逻辑，避免两个弹窗同时显示。

详细描述：

- 保留封面弹窗和图标弹窗原有的互斥行为不变。
- 给页面头部外部操作区补了一层最小联动：只要点击右上角“更多”这类外部操作，先关闭当前打开的封面/图标弹窗。
- 不改现有更多菜单实现，也不额外抬升状态，尽量把修复范围压在页面头部工具栏内部。
- 补充页面头部回归测试，覆盖“先打开封面，再点更多，封面关闭且更多打开”的场景。

验证情况：

- 已通过 `npm test -- src/components/editor/PageHeader.test.tsx`

## 2026-07-05 左侧星标置顶扩展到全部可点击条目

提交：未提交

简要描述：

把左侧“星标置顶”从普通页面扩展到当前树里所有可点击条目，现已支持页面和数据表一起置顶。

详细描述：

- 侧边栏新增独立的“星标置顶”分组，用来集中展示已置顶条目。
- 普通页面和页面下的数据表都支持从各自“更多”菜单执行“星标置顶 / 取消置顶”。
- 置顶区中的条目同样保留“更多”入口，至少可以直接取消置顶；普通页面仍保留重命名、导出、复制、删除等原有操作。
- 置顶状态改为写入工作区设置并持久化，刷新后仍会保留。
- 删除页面分支时，会同步清理对应的置顶项，避免留下失效条目。
- 当置顶某个父页面时，置顶区会按原有层级顺序把它下面的子页面一起带出，并保持缩进层级；该子树下引用的数据表也会跟随显示，避免置顶区和主树结构割裂。
- 置顶区里的父页面现在也支持和主树一致的展开/收起交互，并复用同一套展开状态；在主树或置顶区折叠后，另一边会同步保持一致。

验证情况：

- 已通过 `npm test -- src/components/sidebar/SidebarTree.test.tsx src/store/createWorkspaceStore.test.ts`
- 已通过 `npm run build`
## 2026-07-05 侧边栏分组折叠留白修复

提交：未提交

简要描述：

修复左侧“星标置顶 / 我的页面 / 共享页面”这类分组在折叠后仍然保留异常底部留白的问题，让分组收起后的上下节奏恢复正常。

详细描述：
- 排查确认根因不是分组内容还在占位，而是分组外层同时吃到了滚动容器的分组间距和自身的底部外边距。
- 由于折叠后 `sidebar-section-body` 会移除，原本多出来的底部外边距就会变得非常显眼，形成“收起了但还空一大块”的视觉异常。
- 这次只做最小样式修复：为 `.sidebar-section-group` 去掉额外的 `margin-bottom`，继续统一使用滚动容器本身的 `gap` 控制分组间距。
- 补充样式回归测试，明确约束折叠分组不能继续保留额外底部留白，避免后续样式调整时回退。

验证情况：
- 已通过 `npm test -- src/styles/appShellLayout.test.ts`
- 已通过 `npm test -- src/components/sidebar/SidebarTree.test.tsx`
- 已通过 `npm run build`
## 2026-07-05 侧边栏分组折叠空白区修正

提交：未提交

简要描述：

修正左侧 `星标置顶 / 我的页面` 分组在条目较少时被自动拉伸撑开的异常空白，折叠和展开后的布局恢复紧凑。

详细描述：
- 这次确认根因不是单纯的分组外边距，而是侧边栏滚动区、分组容器、分组内容区都使用了 `grid` 布局，在有剩余高度时轨道被自动拉伸，导致条目之间出现大块空白。
- 为 `.sidebar-scroll-content`、`.sidebar-group`、`.sidebar-section-body`、`.sidebar-tree` 补上 `align-content: start;`，让内容始终贴顶排列，不再把剩余高度分摊成异常留白。
- 保留上一轮已经收掉的 `.sidebar-section-group` 额外底部外边距，避免分组收起后重复出现多余间距。
- 补充样式回归测试，锁定“侧边栏 grid 轨道不允许被自动拉伸成空白区”的约束。

验证情况：
- 已通过 `npm test -- src/styles/appShellLayout.test.ts`
- 已通过 `npm test -- src/components/sidebar/SidebarTree.test.tsx`
- 已通过 `npm run build`
## 2026-07-05 页面属性编辑体验优化

提交：未提交

简要描述：

将普通页面的属性编辑从 `prompt` 弹窗改为面板内直接编辑，优先补齐日期、状态、标签和备注四类属性的更顺手交互。

详细描述：

- 页面属性面板现在支持行内编辑，不再依赖系统 `prompt` 弹窗。
- 日期属性改为原生日期输入框，支持直接选择日期，并提供清空日期入口。
- 状态属性改为轻量选项列表，点击后先展开候选项，再选择保存。
- 标签属性改为逗号分隔的行内输入，保存时会自动整理成标签数组。
- 备注/文本属性改为行内输入框，支持 `Enter` 保存、`Escape` 取消。
- 本次改动保持现有 store 与持久化契约不变，只调整前端交互层。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/PagePropertiesPanel.test.tsx`
## 2026-07-05 页面属性与数据表日期选择器统一

提交：未提交

简要描述：

抽出共享日历面板，让普通页面属性和数据表日期字段使用同一套日期选择 UI。

详细描述：

- 新增共享日期日历面板组件，统一月份切换、日期网格、今天和清空操作。
- 页面属性里的日期编辑不再使用原生日期输入框，改为与数据表一致的日历面板交互。
- 数据表日期字段改为复用同一套共享日历面板，本身保留原有浮层定位和弹出方式。
- 这次只统一日期面板本体，没有顺手改动状态、标签或数据表其他编辑器逻辑，保持改动范围收敛。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/dataTable/styles.test.ts src/components/editor/PagePropertiesPanel.test.tsx`
- 已通过 `C:/Program Files/nodejs/npm.cmd run build`

## 2026-07-11 Git 提交清理

提交：待重新提交

简要描述：

移除误纳入提交的本地 Rust 构建缓存和临时文件，避免把数 GB 的开发产物推送到 GitHub。

详细描述：

- 将根目录 `.cargo-target/`、`.cargo-target-local/`、`.tmp/` 加入 Git 忽略规则。
- 这些目录仅从 Git 索引移除，保留本机构建缓存和调试文件，不影响桌面端开发与运行。

验证情况：

- 已核对最新未推送提交中的大文件均来自上述本地构建与临时目录。

## 2026-07-11 1.0.0 安装包与首次使用说明

提交：待提交

简要描述：

发布 Windows `1.0.0` 安装包，并为新建工作区补充完整的知栖产品介绍和操作说明页。

详细描述：

- 统一前端、Tauri 与 Rust 包版本为 `1.0.0`，生成 Windows x64 NSIS 安装程序。
- 将首次创建工作区原有的“快速开始”页升级为“欢迎使用知栖”，介绍本地优先定位、收件箱、页面树、搜索、数据表、白板和导图等常用工作流。
- 已有工作区首次升级到该版本时，也会一次性补入说明页；该页删除后不会再次自动创建。
- 说明页本身采用普通可编辑块，新用户可直接按自己的习惯继续修改或作为个人首页使用。

验证情况：

- 已通过 `npm.cmd test -- src/domain/seed.test.ts src/lib/workspaceRepository.test.ts`。
- 已通过 `npm.cmd test -- src/store/createWorkspaceStore.test.ts src/domain/seed.test.ts src/lib/workspaceRepository.test.ts`（86 个测试）。
- 已通过 `npm.cmd run build`。
- 已成功生成并核对 `知栖_1.0.0_x64-setup.exe` 的版本信息。
## 2026-07-11 数据表格块转换边界

提交：待提交

简要描述：

数据表格块现在只能在卡片入口与正文内嵌两种显示模式之间互相转换。

详细描述：

- 数据表格块的手柄菜单不再显示标题、待办、段落等普通块转换项；卡片模式仅显示“转换为嵌入式数据表”，内嵌模式仅显示“转换为数据表格卡片”。
- 转换只改变 `displayMode`，保留原有 `databaseId`，不会新建数据表、丢失记录或改变页面中的块 ID。
- store 层同步拒绝数据表格块转换到其他类型，避免未来其他入口绕过菜单约束。

验证情况：

- 已通过 `npm.cmd test -- src/components/editor/BlockHandleMenu.test.tsx src/store/createWorkspaceStore.test.ts`：78 个测试通过。
- 已通过 `npm.cmd run build`。

## 2026-07-11 完整首次使用手册与交互示例

提交：待提交

简要描述：

将“欢迎使用知栖”升级为完整操作手册，并在页面内提供可直接编辑的数据表、白板和思维导图示例。

详细描述：

- 手册按开始记录、页面与块、组织与搜索、媒体与导入、数据表、白板、思维导图、设置与备份逐项说明当前可用功能和常见操作。
- 新工作区会附带“任务数据表”“白板示例”“项目规划导图”三个真实资源，并作为内联块出现在说明页中；示例数据、便签、图形、连线和导图节点均可直接继续编辑。
- 旧版系统欢迎页会一次性原地升级；如检测到用户已经改写欢迎页，则保留该页并另建“知栖使用手册”，不会覆盖用户内容。用户主动删除手册后也不会再次自动创建。

验证情况：

- 已通过 `npm.cmd test`：89 个测试文件、720 个测试通过。
- 已通过 `npm.cmd run build`。

## 2026-07-05 页面属性日期弹窗优化

提交：未提交

简要描述：

将普通页面属性里的日期选择从行内展开改成锚点弹窗，避免展开日历时把整行高度撑开。

详细描述：

- 页面属性日期字段现在保持原按钮常驻，点击后在按钮下方弹出日历面板。
- 共享日期日历面板本体保持不变，这次只调整页面属性里的承载方式。
- 点击弹窗外部区域或按 `Escape` 会关闭日期弹窗。
- 这样既保留了和数据表一致的日期选择体验，也避免了属性行在展开时破坏排版节奏。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/PagePropertiesPanel.test.tsx`
- 已通过 `C:/Program Files/nodejs/npm.cmd run build`
## 2026-07-05 页面属性日期 portal 浮层

提交：未提交

简要描述：

将页面属性日期弹窗进一步改为挂载到 `body` 的 portal 浮层，并补上贴边与翻转定位。

详细描述：

- 页面属性日期弹窗不再依附在属性行内部渲染，而是通过 portal 挂到页面外层。
- 新增基于触发按钮的浮层定位逻辑，优先显示在按钮下方，空间不够时会翻转到上方。
- 浮层在靠近视口左右边缘时会自动收敛，避免超出窗口。
- 保持原有点击外部关闭、`Escape` 关闭、今天/清空/选中日期等交互不变。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/PagePropertiesPanel.test.tsx`
- 已通过 `C:/Program Files/nodejs/npm.cmd run build`
## 2026-07-05 选项输入回车创建与页面属性宿主接线

提交：未提交

简要描述：

数据表和页面属性里的单选、多选现在都支持直接输入内容并按回车创建新选项，同时补齐了页面属性宿主接线，让新选项可以真正写回本地数据。

详细描述：
- 新增共享 `CreatableOptionPicker` 交互，统一输入、匹配已有选项、回车创建、单选选择和多选追加/取消选择的行为。
- 数据表单元格编辑器 `CellEditor` 现在复用这套共享交互，表格页和记录页会在宿主层创建新选项，并沿用现有 `makeId('option')`、`#475569` 和 `updatePropertyOptions(...)` 持久化链路。
- 记录页元数据区域也一起接入了新选项创建流程，避免只有表格单元格可创建、记录详情页不可创建的割裂体验。
- 页面属性面板复用了同一套可创建选项交互，并在 `App.tsx` 中补上 `setPagePropertyOptions` 宿主接线，让页面属性中新建的状态/标签选项能真正保存。
- 顺手修正了 `PagePropertiesPanel` 里的联合类型收窄问题，消除了这次改动暴露出的 TypeScript 构建错误。
- 补充了共享组件测试、页面属性测试、表格单元格测试、表格页测试和记录页元数据测试，覆盖主要创建路径。

验证情况：
- `C:/Program Files/nodejs/npm.cmd test -- src/components/shared/CreatableOptionPicker.test.tsx src/components/editor/PagePropertiesPanel.test.tsx src/components/dataTable/components/table/CellEditor.test.tsx src/components/dataTable/components/table/TablePage.test.tsx src/components/dataTable/DataTablePage.test.tsx`
- `C:/Program Files/nodejs/npm.cmd run build`

## 2026-07-06 搜索媒体分组与说明补强

提交：未提交

简要描述：

全局搜索结果里新增了独立的“媒体”分组与筛选，同时媒体命中结果现在会把文件名和媒体说明文字一起显示出来。

详细描述：

- 搜索弹窗新增“媒体”筛选入口，媒体命中不再混在普通“页面”分组里。
- 媒体结果仍沿用现有页面结果类型，只按 `matchSource === 'media'` 单独分组，保持改动范围最小。
- 图片命中结果现在会显示“文件名 / caption / alt”，音频和视频命中结果会显示“文件名 / caption”。
- 前端内存搜索和桌面端 Rust 搜索索引都做了同样处理，避免网页端与桌面端显示不一致。
- 补充了搜索弹窗分组筛选回归测试，以及桌面端工作区搜索的媒体摘要回归测试。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/search/SearchDialog.test.tsx`
- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/domain/search.test.ts`
- 已通过 `cargo test search_workspace_keeps_media_file_names_and_descriptions_in_excerpts --manifest-path src-tauri/Cargo.toml`（使用项目内临时 `CARGO_TARGET_DIR`）
- 已通过 `C:/Program Files/nodejs/npm.cmd run build`

## 2026-07-06 页面属性选项颜色对齐数据表格

提交：未提交

简要描述：

页面属性里的标签和状态不再统一落成灰色占位色，改为沿用数据表格同样的选项配色逻辑。

详细描述：

- 页面属性选项新增与数据表格一致的颜色归一化规则，避免新建标签/状态后全部显示成灰色。
- 旧工作区里已经保存成占位灰色的页面属性选项，在加载时会自动重分配到共享调色板颜色。
- 页面属性面板新建选项时直接复用同一套配色规则，保证界面即时显示的颜色和最终保存结果一致。
- store 层更新页面属性选项时也会统一做颜色归一化，避免前端、持久化和再次打开后的表现不一致。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/domain/pageProperties.test.ts src/store/createWorkspaceStore.test.ts src/components/editor/PagePropertiesPanel.test.tsx`
- 已通过 `C:/Program Files/nodejs/npm.cmd run build`

## 2026-07-06 页面属性值外层灰框去除

提交：未提交

简要描述：

去掉了页面属性值外层持续显示的灰色底框，只保留真正的标签色块和更轻的悬浮反馈。

详细描述：

- 页面属性值按钮默认改为透明背景，不再整块包一层灰色底。
- 标签和状态内部的彩色色块保持不变，视觉焦点回到真正的属性值本身。
- “添加属性”按钮继续保留原来的浅灰底，避免和普通属性值入口混在一起。
- 悬浮到页面属性值上时，保留一层很轻的交互反馈，保证可点击性还在。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/styles/pageOutlineLayout.test.ts`
- 已通过 `C:/Program Files/nodejs/npm.cmd run build`

## 2026-07-06 页面属性备注宽编辑态

提交：未提交

简要描述：

把页面属性里的“备注”输入框改成“起点不变、向右拉宽”的编辑态，结束位置会贴到正文区域边缘。

详细描述：

- 这次只针对默认“备注”属性生效，不改动其他文本属性的现有紧凑编辑方式。
- 进入编辑态后，备注这一行仍保留原来的两列布局，属性名和输入框的起始位置都不变。
- 真正变宽的只有右侧输入框本身，它会沿着原来的属性值起点继续向右扩展，直到正文区域边缘。
- 因此普通宽度和自适应正文宽度两种页面模式下，备注输入框都会更好地贴合正文内容区，但不会把左侧标签区挤乱。
- 补了组件测试和样式回归测试，锁定“备注宽编辑态”这个交互，避免后面样式回归。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/PagePropertiesPanel.test.tsx src/styles/pageOutlineLayout.test.ts`
- 已通过 `C:/Program Files/nodejs/npm.cmd run build`

## 2026-07-06 左侧导入图标语义修正

提交：未提交

简要描述：

把左侧页面结构板块功能菜单里的“导入”图标从更像下载的样式换成更贴近导入语义的样式。

详细描述：

- 左侧功能菜单中的“导入”按钮原先使用了下载方向的图标，容易和“导出/下载”混淆。
- 这次只替换图标本身，不改按钮位置、交互和文案。
- 新图标改为上行导入语义，和当前“导入页面包”动作更一致。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/sidebar/SidebarTree.test.tsx`

## 2026-07-06 空白正文行插入态统一

提交：未提交

简要描述：

统一了正文里“没有任何内容的行”的交互：空白行现在会按插入态显示，左侧是 `+` 菜单，不再误显示成普通文本块的转换手柄。

详细描述：

- 底部空白插入行在没有输入任何文字时，按 `Enter` 现在也会直接创建一个新的空段落。
- 纯空、且没有任何样式属性的段落块，会按插入态渲染：左侧显示 `+`，点击后展开完整块菜单，而不是普通块的“拖动/转换”菜单。
- 当页面最后一个块已经是这种空白插入态段落时，会隐藏额外的底部空白插入行，避免出现两个连续空白入口。
- 这样从正文回车出来的下一行、以及页面底部的空白行，体验终于统一了。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/EmptyBlockRow.test.tsx src/components/editor/BlockEditor.test.tsx`

## 2026-07-06 空白插入态提示词对齐

提交：未提交

简要描述：

当光标落在空白插入态正文行时，现在会显示和底部 `+` 空白行一致的提示词“输入 / 打开命令菜单”，未聚焦的其他空白行不再持续显示提示词。

详细描述：

- 纯空、无样式的插入态段落块，现在会复用底部 `+` 空白行同一套提示词，不再沿用普通正文块的“输入正文”。
- 这类插入态正文行只有在当前获得焦点时才显示提示词，未聚焦时保持空白，避免页面里每个空行都挂着提示文字。
- 普通有内容段落、普通空段落以及其他类型块的提示词逻辑不受影响，只对插入态空白行生效。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/BlockEditor.test.tsx src/styles/pageOutlineLayout.test.ts`

## 2026-07-06 正文底部空白区点击聚焦优化

提交：未提交

简要描述：

点击正文最下方空白区时，光标现在会自动落到最后一条空白行里，不会再丢到页面空白处。

详细描述：

- 当点击 `editor-surface` 自身的底部空白区域时，编辑器会主动接管焦点。
- 如果页面底部显示的是默认 `+` 空白插入行，就自动把焦点落到这条空白行的输入框里。
- 如果页面最后一个块已经是插入态空白段落，就自动把焦点落到这条空白段落里。
- 这样用户在正文最下方继续输入时，不需要再费力找最后那条空白行的位置。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/BlockEditor.test.tsx src/components/editor/EmptyBlockRow.test.tsx src/components/editor/BlockFrame.test.tsx`
- 已通过 `C:/Program Files/nodejs/npm.cmd run build`

## 2026-07-06 空白行手柄稳定性优化

提交：未提交

简要描述：

新增或删除底部空白行时，插入态空段落的手柄现在会保持稳定显示，不再和底部 `+` 空白行之间来回闪跳。

详细描述：

- 给插入态空段落对应的块框架补了 `block-frame-insert-mode` 标记，明确区分它和普通正文块。
- 让插入态空段落的左侧手柄和底部 `+` 空白行采用一致的常显策略，避免从“默认隐藏”切到“默认显示”时产生视觉抖动。
- 保留普通正文块原有的悬浮/聚焦显示逻辑，只收敛空白插入态这条交互路径，影响范围更小。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/BlockEditor.test.tsx src/styles/pageOutlineLayout.test.ts`

## 2026-07-06 空白行手柄与底部吸附逻辑收紧

提交：未提交

简要描述：

把空白行左侧 `+` 的显示逻辑收回到悬浮/聚焦态，同时把正文底部的自动吸附聚焦限制为“点击最后一行下方空白区”才生效。

详细描述：

- 去掉了插入态空段落手柄的全局常显规则，避免页面里多个空白行同时把左侧 `+` 全部亮出来。
- 底部 `+` 空白行改为和普通块手柄一致，只在鼠标悬浮或该行获得焦点时显示，减少视觉噪音。
- `editor-surface` 的点击吸附逻辑增加了位置判断，只有点击位置已经低于最后一个正文子项底边时，才会自动把焦点送到最后的空白行。
- 这样中间空白行之间的留白区域不会再误跳到底部，底部继续输入的体验也还保留。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/BlockEditor.test.tsx src/styles/pageOutlineLayout.test.ts`

## 2026-07-06 搜索与页面属性弹窗滚动锁定

提交：未提交

简要描述：

搜索弹窗和页面属性值弹窗打开时，现在会锁住背景正文滚动，避免一边看弹窗一边把后面的页面带着滑走。

详细描述：

- 全局搜索打开时，会锁定文档根滚动，关闭搜索后恢复之前的滚动状态。
- 页面属性的单选、多选和日期弹窗打开时，也会锁定背景正文滚动，关闭后再恢复。
- 这次沿用了数据表工具栏弹窗同一类的滚动锁思路，只补了最小行为，不改原来的弹窗结构和定位逻辑。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/search/SearchDialog.test.tsx src/components/editor/PagePropertiesPanel.test.tsx`

## 2026-07-06 同步块与引用块设计文档

提交：未提交

简要描述：

补充了“同步块 / 引用块”第一版设计文档，明确以同步块为底座、引用块为只读实例的整体方案。

详细描述：

- 明确同步单位采用“一组连续块”，不是单块同步。
- 明确底层采用“共享组 + 实例容器”模型，不拆成两套引用 / 同步存储结构。
- 明确创建入口、混合编辑模式、删除与取消同步规则。
- 明确搜索按实例所在页面命中、页面包导入导出重写 `groupId / instanceId`、以及异常恢复边界。

验证情况：

- 已完成设计文档自检：范围、数据结构、导入导出、搜索联动与异常恢复规则已写入 spec
# 2026-07-08 设置中心设计定稿

提交：未提交

简要描述：

补了一份“全量完整设置中心”的正式设计文档，把知栖后续设置系统的分层、分类、页面形态、危险操作规则和分期实现顺序一次定清楚，避免后面桌面端、本地工作流和数据维护能力继续分散生长。

详细描述：

- 新增设计文档 `docs/superpowers/specs/2026-07-08-settings-center-design.md`。
- 明确设置中心是应用级页面，不进入页面树、不参与搜索、不进入页面包导出。
- 固定设置中心采用“左侧分类 + 右侧内容”，并收敛为 8 个一级分类：通用、外观与侧边栏、编辑与页面默认、搜索与知识组织、导入导出、桌面端、数据与维护、实验功能。
- 明确设置必须拆成 `AppSettings`、`WorkspaceSettings`、页面显式值三层，其中页面默认值归属于工作区设置。
- 明确普通偏好、系统级行为、危险维护动作三种不同的错误处理与交互规则。
- 明确第一期只先收口已有低风险设置与设置中心壳体，后续再逐步补齐搜索、备份恢复、桌面端本地工作流增强。

验证情况：

- 已完成设计文档自检，覆盖范围、分层边界、危险操作规则、导出备份边界和分期顺序已写明。

## 2026-07-08 桌面端剪贴板捕获首版打通

提交：未提交

简要描述：

桌面端“复制后提示收进收件箱”这条链路已经接通：现在能在后台轮询桌面剪贴板，识别文字、富文本、截图位图和复制出来的本地图片路径，并在确认后追加进收件箱。

详细描述：

- 新增 `src/app/useDesktopClipboardCapture.ts`，把桌面端剪贴板轮询、重复内容去重、站内复制抑制、待确认缓存和最终写入收件箱的逻辑收口到独立 hook。
- 剪贴板文字内容会复用现有 `clipboardCapture` / `richTextHtml` 解析逻辑，按“空行分段、段内换行保留”的规则落成正文块。
- 剪贴板图片支持两条路径：
  - 直接复制出来的位图字节会落成应用内图片资源，再插入图片块。
  - 复制出来的本地图片文件路径会通过现有资产导入管线入库，再插入图片块。
- 桌面端确认提示改为走系统通知点击确认：点击通知后，把当前待确认内容收进收件箱；如果资源导入失败，会补一条失败通知，不写入坏块。
- 收件箱里新增的“剪贴板捕获”标题时间现在按本机本地时间格式化，不再沿用 UTC 时间导致显示错位。
- 为避免误捕获站内正常复制，正文里的 `copy` 事件会短暂抑制下一轮桌面剪贴板检查；同一份内容在短时间内也不会重复弹通知。
- Rust 侧新增了一个 Windows 专用剪贴板读取桥，使用系统自带 PowerShell + Windows Forms 读取文本、HTML、位图和文件拖放列表，不额外引入新的 Rust 依赖。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/lib/assets.test.ts src/lib/desktopLifecycle.test.ts src/app/useDesktopClipboardCapture.test.tsx src/app/App.test.tsx src/store/createWorkspaceStore.test.ts src/domain/richTextHtml.test.ts src/domain/clipboardCapture.test.ts`
- 已通过 `$env:CARGO_TARGET_DIR='E:\\Workspace\\个人知识库-桌面端\\.cargo-target-local'; cargo test --manifest-path src-tauri/Cargo.toml clipboard_capture`
## 2026-07-09 编辑器多选块设计稿
提交：未提交

简要描述：

整理了“正文编辑器多选块 v1”的设计稿，并新增统一待做功能文档，先把第一版范围和后续暂缓项收口。

详细描述：
- 明确多选块第一版只做三件事：鼠标框选、批量删除、左侧手柄发起的整组拖动。
- 明确“浮动批量工具条”不进第一版，先记入统一待做文档，避免这轮把编辑器交互面铺得过大。
- 同时把 `Shift` 连选、`Ctrl / Cmd` 增减选也纳入待做文档，作为后续多选块补强项。
- 设计稿明确采用最小实现路线：多选 UI 状态留在 `BlockEditor` 本地，不提前升级成全局 selection 系统；只新增一个与框选起点范围相关的设置项。

验证情况：
- 已完成设计稿自检，当前无 `TODO`、`TBD` 或待补占位文案。

## 2026-07-09 编辑器多选块 v1
提交：未提交

简要描述：

正文编辑器现在已经补上多选块第一版闭环，支持鼠标框选、选中态、批量删除、左侧手柄发起的整组拖动，以及“框选起点”设置项。

详细描述：
- 新增正文块的鼠标框选能力，框选过程中会显示选区矩形，命中的块行会进入轻量高亮选中态。
- 新增“框选起点”工作区设置，支持“仅在块左侧或空白区开始”和“允许从正文区域直接开始”两种模式，并会持久化保存。
- 多选后按 `Delete / Backspace` 可以一次删除整组已选块，删除后焦点会回到前一个合适的块，或落回底部空白行。
- 多选后如果从已选块的左侧手柄发起拖动，会按原顺序整组移动；如果拖的是未选中块，仍然保持原有单块拖动逻辑。
- 为整组拖动和批量删除补上了对应的 store action 与重排工具函数，避免把多块操作拆成多次单块写入。

验证情况：
- 已通过 `C:/Program Files/nodejs/npm.cmd run test -- src/utils/reorder.test.ts src/store/createWorkspaceStore.test.ts src/components/settings/SettingsCenter.test.tsx src/components/editor/BlockEditor.test.tsx src/styles/editorMultiSelectLayout.test.ts`
- 已通过 `C:/Program Files/nodejs/npm.cmd run build`
# 2026-07-11 数据表卡片与嵌入模式兼容修复

提交：未提交

简要描述：

数据表卡片转换为正文嵌入模式后，旧数据表快照不再被误判为空表；嵌入式数据表也可通过块手柄菜单稳定转换回数据表卡片，两个显示模式始终复用同一个数据表与记录。

详细描述：

- 抽出统一的数据表初始状态兼容入口，为缺少版本字段的旧快照补齐当前运行所需的默认字段，同时保留原有数据库、字段、记录、记录页、块与资源。
- 正文内嵌数据表和独立数据表页统一使用该入口，避免卡片预览仍有内容、嵌入式却回退成空表的显示差异。
- 增加回归测试：旧快照内嵌后仍显示既有记录；嵌入式数据表的块手柄菜单可触发“转换为数据表格卡片”。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/BlockEditor.test.tsx src/components/editor/BlockHandleMenu.test.tsx src/store/createWorkspaceStore.test.ts`
# 2026-07-11 白板连线工具栏优化

提交：未提交

简要描述：

白板顶部工具栏移除独立的“连线”图标；新建白板和新建连接线默认使用曲线，已有白板中的连线样式保持不变。

详细描述：

- 移除顶部工具栏的连线工具按钮，减少高频工具区的视觉占用。
- 保留便签、文本、图形和图片对象现有的连接锚点交互，用户仍可从对象间创建连接线。
- 将新白板的默认连接线模式从直线调整为曲线；历史快照保留其已保存的直线或曲线设置，不做批量迁移。
- 同步更新白板内嵌画布的初始工具状态和曲线选中态，避免首次渲染与实际默认值不一致。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/whiteboard/whiteboardModel.test.ts src/components/whiteboard/legacyWhiteboardDocument.test.ts src/components/whiteboard/WhiteboardCanvas.test.tsx`
# 2026-07-11 白板端点默认与菜单状态优化

提交：未提交

简要描述：

新建连接线的起点和终点均默认选择端点列表第一项“无”；顶部端点按钮不再展示当前选项，选中状态只在展开列表中显示。

详细描述：

- 将新白板和内嵌白板画布的起止端点默认值统一为 `none`，新建连接线不再默认带圆点或箭头。
- 顶部起点、终点按钮固定显示中性线条图标，不再随当前端点选项替换图标或携带选中状态。
- 展开后的端点列表继续保留当前选项的高亮和 `aria-checked` 状态，方便确认和切换。
- 升级白板 iframe 文档版本，确保当前已打开的调试白板重建为新端点菜单。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/whiteboard/whiteboardModel.test.ts src/components/whiteboard/legacyWhiteboardDocument.test.ts src/components/whiteboard/WhiteboardCanvas.test.tsx`
# 2026-07-11 白板曲线连线删除修复

提交：未提交

简要描述：

默认曲线连接线现在可从实际曲线路径或两端之间的直连区域选中，恢复稳定的删除体验。

详细描述：

- 定位到问题由默认曲线带来的选择盲区造成：用户按原先直线的习惯点击两端中间位置时，曲线未被选中，因此删除键没有目标可删。
- 曲线连接的命中检测现同时覆盖实际贝塞尔路径和两端之间的直连选择带；不改变连接线的绘制、端点、数据或原有曲线形状。
- 添加了几何回归测试，覆盖纵向距离较大的曲线从直连区域点击仍可选中并删除的场景。
- 升级白板 iframe 文档版本，已打开的调试白板会自动重载这项修复。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/whiteboard/legacyConnectionGeometry.test.ts src/components/whiteboard/legacyWhiteboardDocument.test.ts src/components/whiteboard/whiteboardModel.test.ts src/components/whiteboard/WhiteboardCanvas.test.tsx`

## 2026-07-11 白板中键平移对象误触修复

提交：未提交

简要描述：

修复了在便签、文本或图片对象上按住鼠标中键拖动时，误触发对象编辑、选中或移动的问题。

详细描述：

- 将白板平移统一收敛到同一个指针处理函数。
- 对象层优先识别鼠标中键，并直接进入画布平移状态，不再执行便签、文本或图片的对象交互逻辑。
- 升级白板 iframe 文档版本，使已打开的白板自动加载这项修复。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/whiteboard/legacyWhiteboardDocument.test.ts`。

## 2026-07-11 思维导图方向键节点导航

提交：未提交

简要描述：

思维导图选中节点后，可以使用方向键在画布上的相邻节点之间切换选择。

详细描述：

- 在导图画布获得焦点时，拦截四个方向键并按节点实际显示位置计算最近的左、右、上、下节点。
- 通过既有节点点击流程完成选择和焦点保持，不新增另一套节点选中状态。
- 编辑节点文本、工具栏输入和菜单操作不会被方向键导航拦截。
- 选中节点后，`Backspace` 会复用既有 `Delete` 删除流程，避免浏览器默认退回行为。
- 展开状态的节点收起按钮改为固定长度的居中横线图标，避免文本短横线偏短、偏离垂直中心。
- 横线颜色与收起圆环的边框颜色共用同一变量，普通、悬停和根节点状态保持一致。
- 修复树状图通用白色节点背景覆盖根节点主题色、导致白色根节点标题不可见的问题。
- 切换到树状图或组织图时，自动使用折线连接，避免曲线连接在层级布局中造成视觉干扰。
- 正文多选块支持复制后粘贴到空白行或空白块：会保留块类型与内容，并在粘贴时生成新块 ID，避免同页复制冲突。
- 优化 Word 富文本粘贴：识别 Word 行内样式中的加粗、斜体、下划线、删除线与文字颜色，并兼容 `o:p` 等 Word 包装标签，减少回退为纯文本的情况。
- 补充 Word 标题段落识别：`MsoHeading1`、`mso-style-name: Heading 2` 及中文“标题 1-3”会映射为知栖对应的标题块。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/mindmap/mindmapStaticBundle.test.ts`。

## 2026-07-12 简单表格行列菜单可见性优化

提交：未提交

简要描述：

简单表格的行、列更多菜单改为与添加行、添加列按钮同时清晰显示；行操作使用竖向三点，列操作使用横向三点。

详细描述：

- 行列菜单完整复用添加行、列按钮的状态样式：首次进入表格时均只显示淡色图标；单独悬停到按钮时，再使用一致的实色高亮、深色图标和细描边。
- 行操作入口使用竖向三点，列操作入口使用横向三点，使图标方向与对应操作维度一致。
- 保持既有行列菜单、尺寸调整和表格数据结构不变。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/blocks/TableBlock.test.tsx src/styles/tableControlLayout.test.ts`。
- 已通过 `C:/Program Files/nodejs/npm.cmd run build`。

## 2026-07-12 简单表格滚动与末边界拖拽修复

提交：未提交

简要描述：

移除简单表格无意义的纵向滚动条，并恢复末尾行、列尺寸边界的稳定拖拽。

详细描述：

- 表格横向滚动容器明确隐藏纵向溢出，避免 `overflow-x: auto` 与 `overflow-y: visible` 的浏览器计算规则额外生成纵向滚动条并挤占横向空间。
- 行列更多控制层高于新增行列入口，真实的行列尺寸手柄再高一层，最后一行和最后一列的边界不会再被新增入口遮住。
- 表格网格的边框计入自身 `100%` 宽度，避免正文宽度恰好铺满时，左侧一像素边框额外触发横向滚动条。
- 最后一列和最后一行的尺寸手柄收在表格边界内侧，保留 10 像素拖拽命中区，同时不再以透明的越界手柄制造滚动溢出。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/blocks/TableBlock.test.tsx src/styles/tableControlLayout.test.ts src/components/editor/BlockEditor.test.tsx`，共 119 项测试。
- 已通过 `C:/Program Files/nodejs/npm.cmd run build`。

## 2026-07-12 简单表格编辑完善

提交：未提交

简要描述：

简单表格补充首行表头开关、主题色单元格选中、多行自动增高及双击恢复行列尺寸；已有插入、删除、颜色、对齐和拖拽调整能力保持不变。

详细描述：

- 第一行的行菜单新增“设为表头行 / 取消表头行”，表头状态随页面块数据持久化，并以轻量底色和字重区分。
- 当前编辑单元格使用系统主题色的半透明高亮与一像素细边提示，不改变单元格或表格布局尺寸。
- 单元格改为支持自动换行的多行输入；长文本按内容增高，`Shift + Enter` 可输入换行，原有 `Enter` 行间移动与 `Tab` 单元格导航保持不变。
- 保留自由拖拽调整行高和列宽；双击任一尺寸手柄会清除该手动尺寸，恢复内容自适应。
- 控制菜单层直接读取首行和首列单元格的实际像素宽高，内容变化或手动调整后与单元格边界保持对齐，避免首列拖拽时控制边界覆盖真实表格边框；尺寸手柄提升层级并扩大命中范围，避免被菜单覆盖；点击表格外会清除单元格选中状态。
- 编辑器框选入口会忽略简单表格的行列尺寸手柄，拖拽调整尺寸不再触发块框选。
- 行列菜单进一步改为按每个真实单元格的 `left/top/width/height` 绝对定位，消除窄首列与宽内容列之间的菜单错位；表格内容默认垂直居中，表头使用更明显的底色且悬停时仍保留。
- 简单表格在拖窄某一列后仍至少铺满可用正文宽度，剩余列会分配可用空间；只有总宽度超出正文区域时才出现横向滚动，避免表格整体收缩导致内容和菜单压扁。
- 控制入口不再回退到固定最小列宽：首次测量真实单元格坐标前保持隐藏，并在下一帧重新测量后显示，避免首列菜单错误落到列边界。
- 数据网格、行列控制层和添加行/列区域现统一占满同一正文宽度基准，避免添加区域与实际表格宽度脱节；最后一列和最后一行也提供可拖拽、可双击恢复的尺寸手柄。
- 自由调整列宽的下限统一为单元格最小宽度 `120px`，行高下限统一为 `39px`，避免自由尺寸与单元格自身最小尺寸冲突导致边界、菜单和内容错位。
- 列宽拖拽起点改为当前实际渲染宽度，避免首次拖动从默认宽度重新计算而突然跳到最小值；首列菜单新增“适应正文宽度”表格级开关，关闭后按内容宽度收紧，超出正文区域时保留横向滚动。

验证情况：

- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/blocks/TableBlock.test.tsx src/styles/tableControlLayout.test.ts src/components/editor/BlockEditor.test.tsx`，共 107 项测试。
- 已通过 `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/blocks/TableBlock.test.tsx src/styles/tableControlLayout.test.ts`，共 32 项测试。
- 已通过 `C:/Program Files/nodejs/npm.cmd run build`。

# 2026-07-12 本机 MCP 通用写入与客户端回执完善

提交：待提交

版本：1.1.0

简要描述：

知栖桌面端新增受令牌保护的本机 MCP 服务，可供已授权的本机 AI 客户端搜索、读取和创建页面，并原子写入文本、表格、媒体与结构化创作内容；本次真实 Chatbox 验收后进一步补足逐项落库回执和精确错误定位。

详细描述：

- 服务仅绑定 `127.0.0.1`，要求精确 Bearer 令牌；设置中心可启用、关闭和复制连接配置。
- 新增 `search_pages`、`get_page`、`create_page`、`append_content` 工具；支持 Markdown、普通表格、图片、视频、音频、附件、数据表、白板和思维导图。
- 文件资产会复制进知栖管理的 `zhixi-assets/`，不保留原始本地路径；页面块、结构化对象、引用、搜索索引和 MCP 审计记录在同一 SQLite 事务内更新，失败时整批回滚。
- `append_content` 成功结果新增 `createdContent`，按输入下标列出真实保存的类型、块 ID 和对象 ID；外部 AI 可据此避免把部分重试误报为全部成功。
- 校验错误会指出 `content[index] (type)`；数据表说明明确要求使用 `records[].title`，禁止在自定义列中重复定义 `type: "title"`。
- MCP 成功写入后只增量刷新受影响页面和新增资源，避免外部写入被本机延迟保存覆盖，也不清空已有撤销历史。
- 支持重新生成令牌；新服务成功启动后旧令牌立即失效。服务仍不开放删除、覆盖、移动或远程访问工具。
- 工作区结构快照替换前会在同一 SQLite 事务中暂存应用级设置与 MCP 审计，重建后恢复 MCP 启用状态、端口和令牌；只恢复目标快照仍保留页面的审计记录。应用级设置不写入工作区 JSON。
- JSON 完整备份保存工作区结构并会在同一数据目录内重建资源引用；媒体文件字节不在 JSON 中，跨设备迁移仍应使用页面包或同时迁移 `zhixi-assets`。

验证情况：

- 已按 red → green 新增客户端回执测试：修改前因缺少 `createdContent` 失败，修改后通过并核对六种内容类型。
- 已按 red → green 新增错误定位测试：修改前错误不含内容项下标，修改后能返回 `content[1] (dataTable)`。
- 已按 red → green 新增工具说明测试：修改前遗漏资产、record title 与回执核验规则，修改后通过。
- 已通过 MCP 定向 Rust 测试：55 passed、0 failed。
- 已按 red → green 新增工作区替换回归：修复前 MCP 应用设置变为 `None`、审计查询无记录；修复后 2 passed、0 failed，并经规格与代码质量审查。
- 已通过完整前端测试：89 个测试文件、787 条测试；完整 Rust 测试：155 passed、0 failed；`npm run lint`：0 error、5 条既有 Hook warning；`npm run build` 通过。
- 已完成真实 Chatbox 六类内容写入与知栖页面、原生数据表、白板、思维导图打开验收；`scripts/mcp-smoke-test.mjs` 的完整隔离实例复跑、令牌轮换与真实重启验收仍待桌面解锁后执行。
- 采用新 `zhiqi` 应用标识的 Windows 1.1.0 release 可执行文件与 `知栖_1.1.0_x64-setup.exe`（NSIS）已重新构建并核对；MSI 在 NSIS 生成后超过本次打包时限，待后续单独补建。
