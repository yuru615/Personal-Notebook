# Notion Web

一个本地优先的类 Notion 个人知识库。当前重点是页面编辑、层级页面、表格、白板和导入导出体验。

## 功能

- 块编辑器：正文、标题、列表、待办、代码、表格、子页面、白板入口
- 页面结构：左侧页面树、页面封面、页面目录、子页面跳转
- 富文本：加粗、斜体、下划线、删除线、链接、文字颜色
- 表格：行列增删、颜色、对齐、宽高拖拽
- 白板：独立白板页面、缩放、平移、选择、拖拽、连线、撤销重做
- 数据：浏览器本地 IndexedDB 存储，支持 JSON / Markdown 导出

## 开发

```powershell
npm install
npm run dev
```

## 检查

```powershell
npm test
npm run build
```

## 目录

- `src/app`：应用入口和路由
- `src/components/editor`：页面编辑器和块组件
- `src/components/whiteboard`：白板能力
- `src/domain`：数据类型、Markdown、搜索等领域逻辑
- `src/lib`：本地数据库和仓库层
- `src/store`：工作区状态管理
- `src/styles`：全局样式和样式回归测试
