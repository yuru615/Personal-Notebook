# Creatable Select Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let data-table and page-property single-select / multi-select editors accept typed input and create a new option on `Enter`, using one shared picker module.

**Architecture:** Keep floating-layer ownership in each host component, and extract only the reusable input + option-list behavior into a shared `CreatableOptionPicker`. Data table and page properties will each translate picker events into their own persistence calls so we do not entangle page-property logic with data-table store behavior.

**Tech Stack:** React 19, TypeScript, Testing Library, Vitest, existing local store/repository actions, existing CSS files.

---

### Task 1: Add focused failing tests for the shared picker

**Files:**
- Create: `E:\Workspace\个人知识库-桌面端\src\components\shared\CreatableOptionPicker.test.tsx`
- Create: `E:\Workspace\个人知识库-桌面端\src\components\shared\CreatableOptionPicker.tsx`

- [ ] **Step 1: Write the failing test for single-select create-on-enter**

```tsx
it('creates a new single-select option from the input on Enter', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  const onSelect = vi.fn()

  render(
    <CreatableOptionPicker
      mode="single"
      options={[{ id: 'todo', label: 'Todo', color: 'gray' }]}
      selectedLabels={[]}
      placeholder="输入后回车创建"
      emptyLabel="未选择"
      onSelect={onSelect}
      onCreate={onCreate}
    />,
  )

  const input = screen.getByRole('textbox')
  await user.type(input, 'Blocked{Enter}')

  expect(onCreate).toHaveBeenCalledWith('Blocked')
  expect(onSelect).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Write the failing test for multi-select toggling existing options**

```tsx
it('calls onDeselect when clicking an already-selected multi-select option', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  const onCreate = vi.fn()
  const onDeselect = vi.fn()

  render(
    <CreatableOptionPicker
      mode="multiple"
      options={[{ id: 'alpha', label: 'Alpha', color: 'blue' }]}
      selectedLabels={['Alpha']}
      placeholder="输入标签"
      emptyLabel="空"
      onSelect={onSelect}
      onDeselect={onDeselect}
      onCreate={onCreate}
    />,
  )

  await user.click(screen.getByRole('button', { name: /Alpha/ }))

  expect(onDeselect).toHaveBeenCalledWith('Alpha')
  expect(onSelect).not.toHaveBeenCalled()
  expect(onCreate).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Write the failing test for duplicate-label Enter behavior**

```tsx
it('selects an exact existing option instead of creating a duplicate on Enter', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  const onSelect = vi.fn()

  render(
    <CreatableOptionPicker
      mode="single"
      options={[{ id: 'doing', label: 'Doing', color: 'blue' }]}
      selectedLabels={[]}
      placeholder="输入后回车创建"
      emptyLabel="未选择"
      onSelect={onSelect}
      onCreate={onCreate}
    />,
  )

  await user.type(screen.getByRole('textbox'), 'Doing{Enter}')

  expect(onSelect).toHaveBeenCalledWith('Doing')
  expect(onCreate).not.toHaveBeenCalled()
})
```

- [ ] **Step 4: Run the shared-picker tests to verify they fail**

Run:

```bash
npm test -- src/components/shared/CreatableOptionPicker.test.tsx
```

Expected:

```text
FAIL  src/components/shared/CreatableOptionPicker.test.tsx
Error: Failed to resolve import "./CreatableOptionPicker"
```

- [ ] **Step 5: Commit the red test scaffold**

```bash
git add src/components/shared/CreatableOptionPicker.test.tsx
git commit -m "test: add failing creatable option picker specs"
```

### Task 2: Implement the shared creatable option picker

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\shared\CreatableOptionPicker.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\styles\index.css`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\dataTable\styles.css`

- [ ] **Step 1: Add the minimal shared component API**

```tsx
type CreatableOption = {
  id: string
  label: string
  color: string
}

type CreatableOptionPickerProps = {
  mode: 'single' | 'multiple'
  options: CreatableOption[]
  selectedLabels: string[]
  placeholder: string
  emptyLabel: string
  onSelect: (label: string) => void
  onCreate: (label: string) => void
  onDeselect?: (label: string) => void
}
```

- [ ] **Step 2: Implement draft input, exact-match detection, and Enter handling**

```tsx
const normalizedDraft = draft.trim()
const exactMatch = options.find(
  (option) => option.label.trim().toLowerCase() === normalizedDraft.toLowerCase(),
)

function handleSubmit() {
  if (!normalizedDraft) {
    return
  }

  if (exactMatch) {
    if (mode === 'multiple' && selectedLabels.includes(exactMatch.label)) {
      onDeselect?.(exactMatch.label)
    } else {
      onSelect(exactMatch.label)
    }
    setDraft('')
    return
  }

  onCreate(normalizedDraft)
  setDraft('')
}
```

- [ ] **Step 3: Render the input and filtered option list with minimal reusable classes**

```tsx
<div className="creatable-option-picker">
  <input
    autoFocus
    type="text"
    className="creatable-option-picker-input"
    value={draft}
    placeholder={placeholder}
    onChange={(event) => setDraft(event.currentTarget.value)}
    onKeyDown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        handleSubmit()
      }
    }}
  />
  <div className="creatable-option-picker-list" role="listbox">
    {canCreate ? (
      <button type="button" className="creatable-option-picker-create" onClick={handleSubmit}>
        创建 “{normalizedDraft}”
      </button>
    ) : null}
    {filteredOptions.map((option) => (
      <button key={option.id} type="button" onClick={() => handleOptionClick(option.label)}>
        {option.label}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Run the shared-picker tests to verify they pass**

Run:

```bash
npm test -- src/components/shared/CreatableOptionPicker.test.tsx
```

Expected:

```text
PASS  src/components/shared/CreatableOptionPicker.test.tsx
```

- [ ] **Step 5: Commit the shared picker**

```bash
git add src/components/shared/CreatableOptionPicker.tsx src/components/shared/CreatableOptionPicker.test.tsx src/styles/index.css src/components/dataTable/styles.css
git commit -m "feat: add shared creatable option picker"
```

### Task 3: Add failing integration tests for page properties

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\editor\PagePropertiesPanel.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\editor\PagePropertiesPanel.tsx`

- [ ] **Step 1: Write the failing test for page-property single-select creation**

```tsx
it('creates and saves a new page-property select option on Enter', async () => {
  const user = userEvent.setup()
  const onSetValue = vi.fn()
  const onSetOptions = vi.fn()

  render(
    <PagePropertiesPanel
      definitions={[{
        id: 'prop_status',
        key: 'status',
        name: 'Status',
        type: 'select',
        config: { options: [{ id: 'todo', label: 'Todo', color: 'gray' }] },
        createdAt: '',
        updatedAt: '',
      }]}
      values={{ prop_status: null }}
      onSetValue={onSetValue}
      onSetOptions={onSetOptions}
      onAddDefaultProperty={vi.fn()}
    />,
  )

  await user.click(screen.getByRole('button', { name: '空' }))
  await user.type(screen.getByRole('textbox'), 'Blocked{Enter}')

  expect(onSetOptions).toHaveBeenCalled()
  expect(onSetValue).toHaveBeenCalledWith('prop_status', 'Blocked')
})
```

- [ ] **Step 2: Write the failing test for page-property multi-select creation**

```tsx
it('creates and appends a new page-property multi-select option on Enter', async () => {
  const user = userEvent.setup()
  const onSetValue = vi.fn()
  const onSetOptions = vi.fn()

  render(
    <PagePropertiesPanel
      definitions={[{
        id: 'prop_tags',
        key: 'tags',
        name: 'Tags',
        type: 'multiSelect',
        config: { options: [{ id: 'alpha', label: 'Alpha', color: 'blue' }] },
        createdAt: '',
        updatedAt: '',
      }]}
      values={{ prop_tags: ['Alpha'] }}
      onSetValue={onSetValue}
      onSetOptions={onSetOptions}
      onAddDefaultProperty={vi.fn()}
    />,
  )

  await user.click(screen.getByRole('button', { name: 'Alpha' }))
  await user.type(screen.getByRole('textbox'), 'Beta{Enter}')

  expect(onSetOptions).toHaveBeenCalled()
  expect(onSetValue).toHaveBeenCalledWith('prop_tags', ['Alpha', 'Beta'])
})
```

- [ ] **Step 3: Run the page-properties tests to verify they fail**

Run:

```bash
npm test -- src/components/editor/PagePropertiesPanel.test.tsx
```

Expected:

```text
FAIL  src/components/editor/PagePropertiesPanel.test.tsx
TypeError: onSetOptions is not a function
```

- [ ] **Step 4: Extend the page-properties panel props and wire the shared picker**

```tsx
interface PagePropertiesPanelProps {
  definitions: PagePropertyDefinition[]
  values: PagePropertyValueMap
  onSetValue: (propertyId: string, value: PagePropertyValue) => void
  onSetOptions: (propertyId: string, options: PagePropertyOption[]) => void
  onAddDefaultProperty: (key: DefaultPagePropertyKey) => void
}
```

- [ ] **Step 5: Implement select / multi-select editing through the shared picker**

```tsx
<CreatableOptionPicker
  mode={definition.type === 'multiSelect' ? 'multiple' : 'single'}
  options={definition.config.options ?? []}
  selectedLabels={Array.isArray(currentValue) ? currentValue : currentValue ? [currentValue] : []}
  placeholder="输入后回车创建"
  emptyLabel={uiCopy.pageProperties.emptyValue}
  onSelect={(label) => {
    onSetValue(definition.id, definition.type === 'multiSelect'
      ? [...currentLabels, label]
      : label)
    if (definition.type === 'select') {
      setEditing(null)
    }
  }}
  onDeselect={(label) => {
    onSetValue(definition.id, currentLabels.filter((item) => item !== label))
  }}
  onCreate={(label) => {
    const nextOptions = [...(definition.config.options ?? []), { id: `option-${label}`, label, color: '#475569' }]
    onSetOptions(definition.id, nextOptions)
    onSetValue(definition.id, definition.type === 'multiSelect' ? [...currentLabels, label] : label)
    if (definition.type === 'select') {
      setEditing(null)
    }
  }}
/>
```

- [ ] **Step 6: Run the page-properties tests to verify they pass**

Run:

```bash
npm test -- src/components/editor/PagePropertiesPanel.test.tsx
```

Expected:

```text
PASS  src/components/editor/PagePropertiesPanel.test.tsx
```

- [ ] **Step 7: Commit the page-property integration**

```bash
git add src/components/editor/PagePropertiesPanel.tsx src/components/editor/PagePropertiesPanel.test.tsx src/app/App.tsx
git commit -m "feat: reuse creatable select picker in page properties"
```

### Task 4: Add failing integration tests for the data-table cell editor

**Files:**
- Create: `E:\Workspace\个人知识库-桌面端\src\components\dataTable\components\table\CellEditor.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\dataTable\components\table\CellEditor.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\dataTable\components\table\TablePage.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\dataTable\store\AppStore.tsx`

- [ ] **Step 1: Write the failing test for table single-select creation**

```tsx
it('creates a new data-table select option and selects it on Enter', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const onCreateOption = vi.fn()

  render(
    <CellEditor
      property={selectProperty}
      record={record}
      onChange={onChange}
      onCreateOption={onCreateOption}
    />,
  )

  await user.click(screen.getByRole('button', { name: /未选择/ }))
  await user.type(screen.getByRole('textbox'), 'Blocked{Enter}')

  expect(onCreateOption).toHaveBeenCalledWith(selectProperty.id, 'Blocked')
  expect(onChange).toHaveBeenCalledWith('Blocked')
})
```

- [ ] **Step 2: Write the failing test for table multi-select creation**

```tsx
it('creates a new data-table multi-select option and appends it on Enter', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const onCreateOption = vi.fn()

  render(
    <CellEditor
      property={multiSelectProperty}
      record={record}
      onChange={onChange}
      onCreateOption={onCreateOption}
    />,
  )

  await user.click(screen.getByRole('button', { name: /Alpha/ }))
  await user.type(screen.getByRole('textbox'), 'Beta{Enter}')

  expect(onCreateOption).toHaveBeenCalledWith(multiSelectProperty.id, 'Beta')
  expect(onChange).toHaveBeenCalledWith(['Alpha', 'Beta'])
})
```

- [ ] **Step 3: Run the cell-editor tests to verify they fail**

Run:

```bash
npm test -- src/components/dataTable/components/table/CellEditor.test.tsx
```

Expected:

```text
FAIL  src/components/dataTable/components/table/CellEditor.test.tsx
Property 'onCreateOption' does not exist on type 'CellEditorProps'
```

- [ ] **Step 4: Extend `CellEditor` with an `onCreateOption` callback and swap in the shared picker**

```tsx
type CellEditorProps = {
  property: Property
  record: DatabaseRecord
  onChange: (value: string | boolean | string[]) => void
  onCreateOption?: (propertyId: string, label: string) => string
}
```

- [ ] **Step 5: Add the create-option bridge in the data-table host**

```tsx
const createPropertyOption = (propertyId: string, label: string) => {
  const property = state.properties[propertyId]
  if (!property || (property.type !== 'select' && property.type !== 'multiSelect')) {
    return label
  }

  actions.updatePropertyOptions(propertyId, [
    ...(property.config.options ?? []),
    { id: makeId('option'), label, color: '#475569' },
  ])

  return label
}
```

- [ ] **Step 6: Run the cell-editor tests to verify they pass**

Run:

```bash
npm test -- src/components/dataTable/components/table/CellEditor.test.tsx
```

Expected:

```text
PASS  src/components/dataTable/components/table/CellEditor.test.tsx
```

- [ ] **Step 7: Commit the data-table integration**

```bash
git add src/components/dataTable/components/table/CellEditor.tsx src/components/dataTable/components/table/CellEditor.test.tsx src/components/dataTable/components/table/TablePage.tsx
git commit -m "feat: enable creatable select input in data table cells"
```

### Task 5: Wire the page-properties host from the app shell

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`

- [ ] **Step 1: Pass the existing page-property option persistence action into the panel**

```tsx
<PagePropertiesPanel
  definitions={pageProperties}
  values={page.properties ?? {}}
  onSetValue={(propertyId, value) => {
    void onSetPagePropertyValue(page.id, propertyId, value)
  }}
  onSetOptions={(propertyId, options) => {
    void onSetPagePropertyOptions(propertyId, options)
  }}
  onAddDefaultProperty={(key) => {
    void onAddDefaultPageProperty(key)
  }}
/>
```

- [ ] **Step 2: Run the app-facing page-property tests to verify the prop wiring is complete**

Run:

```bash
npm test -- src/components/editor/PagePropertiesPanel.test.tsx src/components/shared/CreatableOptionPicker.test.tsx
```

Expected:

```text
PASS  src/components/editor/PagePropertiesPanel.test.tsx
PASS  src/components/shared/CreatableOptionPicker.test.tsx
```

- [ ] **Step 3: Commit the host wiring**

```bash
git add src/app/App.tsx
git commit -m "refactor: wire page-property option updates through shared picker"
```

### Task 6: Verify, update changelog, and do the final safety pass

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\docs\updates.md`

- [ ] **Step 1: Run the targeted test suite**

Run:

```bash
npm test -- src/components/shared/CreatableOptionPicker.test.tsx src/components/editor/PagePropertiesPanel.test.tsx src/components/dataTable/components/table/CellEditor.test.tsx
```

Expected:

```text
PASS  src/components/shared/CreatableOptionPicker.test.tsx
PASS  src/components/editor/PagePropertiesPanel.test.tsx
PASS  src/components/dataTable/components/table/CellEditor.test.tsx
```

- [ ] **Step 2: Run a production build to catch type and bundling regressions**

Run:

```bash
npm run build
```

Expected:

```text
vite build
...built successfully
```

- [ ] **Step 3: Update the user-facing changelog**

```md
## 2026-07-05 选项输入创建优化

简要描述：
- 数据表和页面属性的单选、多选现在都支持直接输入并回车创建选项

详细描述：
- 新增共享的可创建选项选择器
- 数据表单元格支持输入新选项并即时写入
- 页面属性的单选、多选改为与数据表一致的输入交互

验证：
- `npm test -- src/components/shared/CreatableOptionPicker.test.tsx src/components/editor/PagePropertiesPanel.test.tsx src/components/dataTable/components/table/CellEditor.test.tsx`
- `npm run build`
```

- [ ] **Step 4: Commit the verification and changelog**

```bash
git add docs/updates.md
git commit -m "docs: record creatable select interaction updates"
```
