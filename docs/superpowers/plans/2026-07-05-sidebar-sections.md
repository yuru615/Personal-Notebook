# Sidebar Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the left sidebar tree into collapsible `星标置顶` and `我的页面` sections, while reserving `共享页面` as a hidden-empty section.

**Architecture:** Keep this as a display-layer change inside `SidebarTree`. Reuse the existing pinned tree and page tree builders, add a lightweight local section-expanded state, and wrap each rendered tree in a reusable section shell so page-level expand/collapse logic stays intact.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Testing Library, existing global CSS

---

### Task 1: Add failing section-behavior tests

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\sidebar\SidebarTree.test.tsx`
- Test: `E:\Workspace\个人知识库-桌面端\src\components\sidebar\SidebarTree.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add focused tests for:
- `我的页面` section can collapse and expand.
- `共享页面` does not render when empty.
- `星标置顶` section can collapse and expand.
- Collapsing a section does not reset existing page-level expanded state.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/sidebar/SidebarTree.test.tsx`
Expected: FAIL because section headers and section toggle behavior do not exist yet.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar/SidebarTree.test.tsx
git commit -m "test: cover sidebar sections"
```

### Task 2: Implement collapsible sidebar sections

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\sidebar\SidebarTree.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\ui\copy.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\styles\index.css`

- [ ] **Step 1: Write minimal implementation**

Implement:
- local section-expanded state for `pinned`, `shared`, and `my_pages`
- shared section labels in `uiCopy`
- a reusable section header button with chevron and title
- wrapping the current pinned tree in `星标置顶`
- wrapping the current main page tree in `我的页面`
- keeping `共享页面` hidden when empty

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -- src/components/sidebar/SidebarTree.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar/SidebarTree.tsx src/ui/copy.ts src/styles/index.css src/components/sidebar/SidebarTree.test.tsx
git commit -m "feat: add collapsible sidebar sections"
```

### Task 3: Update user-facing change log and verify build

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\docs\updates.md`

- [ ] **Step 1: Update change log**

Add a new note describing:
- sidebar now grouped into `星标置顶 / 我的页面`
- `共享页面` reserved and hidden when empty
- each section can collapse independently

- [ ] **Step 2: Run final verification**

Run: `npm test -- src/components/sidebar/SidebarTree.test.tsx`
Expected: PASS

Run: `npm run build`
Expected: build completes successfully

- [ ] **Step 3: Commit**

```bash
git add docs/updates.md
git commit -m "docs: record sidebar sections"
```
