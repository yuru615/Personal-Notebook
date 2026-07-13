# Zhiqi Repository Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename every repository-owned `zhiqi` product identifier to `zhiqi` for a new, intentionally non-migrating application identity.

**Architecture:** The rename is lexical across maintained source, configuration, tests, and documentation. Storage namespaces deliberately change together, so the new application starts in a separate database, asset folder, and browser storage namespace rather than attempting to read legacy data.

**Tech Stack:** TypeScript, React, Rust, SQLite, Tauri 2, Vitest, ESLint, Vite.

## Global Constraints

- Replace both lowercase `zhiqi` and title-case `Zhiqi` with their `zhiqi` counterparts.
- Do not preserve legacy storage names or add data migration.
- Do not alter binary icon outputs or generated build artifacts except the tracked Tauri capability schema.
- Update `docs/updates.md` for this user-visible data and packaging change.

---

### Task 1: Rename runtime and persistence identifiers

**Files:**
- Modify: `src/lib/*.ts`, `src/components/**/*.ts*`, `src-tauri/src/**/*.rs`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`
- Test: existing TypeScript and Rust storage/configuration tests

- [ ] **Step 1: Update assertions that name the current persistence namespace**

Replace expected `zhiqi` localStorage keys, SQLite table names, database filenames, asset directory names, and runtime event values in the existing tests with `zhiqi` equivalents.

- [ ] **Step 2: Run the affected tests and verify the renamed assertions fail**

Run: `npm test -- src/lib/workspaceRepository.test.ts src/components/dataTable/storage/appStateRepo.test.ts src-tauri/tauriConfig.test.ts`

Expected: tests fail because production values still use the `zhiqi` namespace.

- [ ] **Step 3: Rename the corresponding production identifiers**

Change `zhiqi` to `zhiqi` in the TypeScript storage/event/MIME constants, Rust database/asset/package/event constants, all SQLite schema names and SQL statements, Cargo crate names, and Tauri identifier.

- [ ] **Step 4: Run the affected tests and verify they pass**

Run: `npm test -- src/lib/workspaceRepository.test.ts src/components/dataTable/storage/appStateRepo.test.ts src-tauri/tauriConfig.test.ts`

Expected: exit code 0.

### Task 2: Rename repository metadata, documentation, and visual metadata

**Files:**
- Modify: `package.json`, `package-lock.json`, `src-tauri/Cargo.lock`, `public/favicon.svg`, `src-tauri/icons/icon-source.svg`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/**/*.md`, `docs/updates.md`

- [ ] **Step 1: Apply case-preserving repository-wide replacement to tracked text files**

Replace every `zhiqi` and `Zhiqi` spelling in the listed source, metadata, test, and documentation files. Keep Chinese product copy unchanged unless it embeds the English identifier.

- [ ] **Step 2: Record the user-visible breaking data boundary**

Append a dated entry to `docs/updates.md` stating that Zhiqi uses new local persistence identifiers and does not automatically load Zhiqi data.

- [ ] **Step 3: Confirm no legacy brand identifier remains in tracked text**

Run: `rg -n -i 'zhiqi' -g '!node_modules' -g '!dist' -g '!src-tauri/target' -g '!*.png' -g '!*.ico' -g '!*.icns' .`

Expected: exit code 1 with no output.

### Task 3: Verify the full repository

**Files:**
- Verify: all modified files

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: exit code 0.

- [ ] **Step 2: Run static checks and production build**

Run: `npm run lint && npm run build`

Expected: both commands exit 0.

- [ ] **Step 3: Inspect the final diff and working-tree status**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; all changes limited to the product rename and its update record.
