# Insert Handle Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the insert handle visually stable when blank rows are created or removed at the bottom of the editor.

**Architecture:** Reuse the existing insert-mode empty paragraph behavior and give its block frame a dedicated class so the handle can follow the same always-visible rule as the trailing empty `+` row. Cover the change with one component test and one CSS rule test, then verify with targeted editor tests and a production build.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS

---

### Task 1: Lock the expected insert-mode structure in tests

**Files:**
- Modify: `src/components/editor/BlockEditor.test.tsx`
- Modify: `src/styles/pageOutlineLayout.test.ts`
- Test: `src/components/editor/BlockEditor.test.tsx`

- [ ] **Step 1: Extend the existing insert-handle test**

```tsx
expect(screen.getByRole('button', { name: '添加块' }).closest('.block-frame')).toHaveClass(
  'block-frame-insert-mode',
)
```

- [ ] **Step 2: Add a CSS rule expectation for the insert-mode handle**

```ts
expect(cssRule('.block-frame-insert-mode .block-handle')).toContain('opacity: 1;')
expect(cssRule('.block-frame-insert-mode .block-handle')).toContain('cursor: pointer;')
```

- [ ] **Step 3: Run the focused tests to verify they fail first**

Run: `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/BlockEditor.test.tsx src/styles/pageOutlineLayout.test.ts`
Expected: FAIL because `block-frame-insert-mode` and its CSS rule do not exist yet

### Task 2: Implement the minimal insert-mode handle stabilization

**Files:**
- Modify: `src/components/editor/BlockFrame.tsx`
- Modify: `src/styles/index.css`
- Test: `src/components/editor/BlockEditor.test.tsx`

- [ ] **Step 1: Mark insert-mode block frames with a dedicated class**

```tsx
<div className={`block-frame${isInsertMenu ? ' block-frame-insert-mode' : ''}`} ref={frameRef}>
```

- [ ] **Step 2: Keep insert-mode handles visible and clickable**

```css
.block-frame-insert-mode .block-handle {
  opacity: 1;
  cursor: pointer;
}
```

- [ ] **Step 3: Run the focused tests to verify they pass**

Run: `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/BlockEditor.test.tsx src/styles/pageOutlineLayout.test.ts`
Expected: PASS

### Task 3: Record and verify the user-visible fix

**Files:**
- Modify: `docs/updates.md`
- Test: `src/components/editor/BlockEditor.test.tsx`

- [ ] **Step 1: Add a short update log entry**

```md
## 2026-07-06 空白行手柄稳定性优化
```

- [ ] **Step 2: Run the relevant editor test set**

Run: `C:/Program Files/nodejs/npm.cmd test -- src/components/editor/BlockEditor.test.tsx src/components/editor/EmptyBlockRow.test.tsx src/components/editor/BlockFrame.test.tsx src/styles/pageOutlineLayout.test.ts`
Expected: PASS

- [ ] **Step 3: Run the build**

Run: `C:/Program Files/nodejs/npm.cmd run build`
Expected: PASS
