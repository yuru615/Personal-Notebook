# Sidebar Sections Design

## Goal

Refactor the left sidebar tree into three clear sections that match the desired desktop information architecture:

- `星标置顶`
- `共享页面`
- `我的页面`

This round only changes sidebar structure and interaction. It does not introduce a real shared-page data model yet.

## Scope

In scope:

- Split the existing sidebar tree into sectioned groups.
- Let each section support expand/collapse.
- Keep existing page-level expand/collapse behavior inside each section.
- Hide `共享页面` when there is no shared data.
- Preserve current pinning behavior, including pinned parent-page subtrees.

Out of scope:

- Real shared-page storage, permissions, or sync.
- New backend schema or new persisted page ownership model.
- New bottom modules like trash or template center from the reference image.

## User-Facing Behavior

- The sidebar content area is organized into up to three stacked groups:
  - `星标置顶`: shown only when there are pinned entries.
  - `共享页面`: reserved for future shared entries and hidden when empty.
  - `我的页面`: always shown and contains the current main page tree.
- Each group header has its own expand/collapse control.
- Group collapse only hides the group body. It does not change page-level expanded state inside the group.
- Existing page-level collapse keeps working for nested pages and page-owned data tables.
- Pinned parent pages still show their descendants in the pinned group and can still collapse their own subtree there.

## Architecture

Keep this as a display-layer change inside the existing sidebar implementation.

- Reuse the current page tree building logic for `我的页面`.
- Reuse the current pinned-tree logic for `星标置顶`.
- Add one lightweight section-state layer for the three top-level groups.
- Represent `共享页面` as an empty reserved group for now; do not add new domain types.

This keeps risk low and avoids touching storage or page contracts before shared pages are real.

## State

Add a small local section-expanded state for:

- `pinned`
- `shared`
- `my_pages`

Recommended behavior for this round:

- Default all sections to expanded.
- Persist only these section expand/collapse preferences in workspace settings if the change stays small.
- If persistence adds noticeable complexity, keep the first version local to the session and upgrade later.

## Rendering Rules

### Starred Section

- Render only when pinned entries exist.
- Use the existing pinned entry list and subtree behavior.
- Wrap it in a section shell with title and section collapse.

### Shared Section

- Do not render when there are no entries.
- No placeholder empty state in this round.
- Keep the section label and rendering path ready so future shared-page data can plug in with minimal churn.

### My Pages Section

- Render the current visible page tree under a titled section.
- This becomes the new home for the existing root tree content.

## Styling

- Match the reference structure more than the full visual language.
- Section headers should be compact, understated, and visually distinct from page rows.
- Section header arrow and page row arrow are separate controls with separate meaning.
- Avoid large new visual chrome. Keep current spacing system and tree indentation where possible.

## Error Handling

- If a section has no content, hide it rather than showing a broken shell.
- If pinned items reference removed pages, existing cleanup behavior remains the source of truth.

## Testing

Add focused coverage for:

- `我的页面` section renders and can collapse/expand.
- `星标置顶` section renders only when pinned content exists and can collapse/expand.
- `共享页面` does not render when empty.
- Collapsing a section does not destroy existing page-level expanded state.
- Pinned parent-page subtree collapse still works inside the pinned section after sectioning.
