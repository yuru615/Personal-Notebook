# Zhiqi 品牌标识迁移设计

## 目标

将仓库中英文产品标识从 `zhiqi`/`Zhiqi` 统一改为 `zhiqi`/`Zhiqi`，作为不兼容旧本地数据的新应用版本。

## 范围

- 更新前端与 Rust 的运行时标识：本地存储键、事件名称、剪贴板 MIME 类型、页面包 kind、数据库和资源目录名称。
- 更新 SQLite schema 的全部表与索引前缀，并同步所有查询、测试和迁移夹具。
- 更新 Tauri bundle identifier、Cargo crate 名称、npm 包名、图标 SVG 元数据，以及面向开发者的文档。
- 更新仓库内历史计划与规格中的品牌引用，确保全仓搜索不再留下旧英文名。

## 数据边界

不提供 `zhiqi` 到 `zhiqi` 的数据迁移或兼容读取。升级后的应用使用 `zhiqi.db`、`zhiqi-assets/` 及新的浏览器 localStorage 键；旧版本数据保留在原位置但不会由新版本访问。

## 验证

对 Rust 与 TypeScript 测试中的改名断言进行同步；完成后运行全仓大小写不敏感残留搜索、`npm test`、`npm run lint` 和 `npm run build`。
