# 页面属性行内编辑实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把普通页面属性编辑从 `prompt` 改成统一的行内编辑交互，并优先把日期属性改成日期选择器。

**Architecture:** 保持现有 `PagePropertiesPanel` 作为唯一编辑入口，在组件内部增加单行编辑态，根据属性类型切换不同控件。沿用现有 `onSetValue` 数据流，不改后端和 store 契约。

**Tech Stack:** React 19、TypeScript、Testing Library、Vitest、原生 `<input type="date">`

---

### Task 1: 补页面属性行内编辑失败测试

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\editor\PagePropertiesPanel.test.tsx`

- [ ] **Step 1: 为日期属性补失败测试**
- [ ] **Step 2: 为文本属性补失败测试**
- [ ] **Step 3: 运行 `PagePropertiesPanel` 测试并确认先失败**

### Task 2: 实现页面属性行内编辑

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\editor\PagePropertiesPanel.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\ui\copy.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\styles\index.css`

- [ ] **Step 1: 为属性面板增加单行编辑态**
- [ ] **Step 2: 把日期属性改成原生日期选择器**
- [ ] **Step 3: 把文本和备注属性改成行内输入框**
- [ ] **Step 4: 把状态属性改成轻量选项列表**
- [ ] **Step 5: 把标签属性改成逗号分隔的行内输入**
- [ ] **Step 6: 补充必要文案和样式**

### Task 3: 验证并记录

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\docs\updates.md`

- [ ] **Step 1: 运行相关测试并确认通过**
- [ ] **Step 2: 更新 `docs/updates.md` 记录这次体验优化**
