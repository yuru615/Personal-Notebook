# Storage Engine Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace frontend-driven SQLite persistence with a desktop-first Rust storage engine that owns SQLite, file assets, transactions, and search.

**Architecture:** Rust/Tauri exposes typed storage commands backed by `rusqlite` and an app-managed asset directory. React talks to one TypeScript storage client and no longer sends business SQL through `@tauri-apps/plugin-sql`. The rewrite starts from a new `personal-notebook-v2.db` and does not migrate old data.

**Tech Stack:** Tauri 2, Rust, `rusqlite` with bundled SQLite, React 19, TypeScript, Vitest.

---

## Summary

Build a desktop-first storage engine for Personal Notebook: Rust owns SQLite, file assets, transactions, and search; React uses typed Tauri commands through one storage client. Do not migrate old data. Use a new database file, `personal-notebook-v2.db`, and leave the old `personal-notebook.db` untouched.

## Architecture Decisions

- Replace business use of `@tauri-apps/plugin-sql` with custom Rust commands backed by `rusqlite`.
- Use `rusqlite` with bundled SQLite, WAL mode, foreign keys, and FTS5.
- Store large files in an app-managed content-addressed asset directory; SQLite stores metadata and references only.
- Keep current UI behavior, routes, and editor interactions; change storage/loading/search internals.
- Make startup lazy: load settings + page tree first, then page contents/resources on demand.
- Use one Rust storage service: `StorageState { connection: Mutex<Connection>, assets_dir }`; all writes use transactions.
- Remove old full-workspace `repository.save(snapshot)` as the normal write path.

## Implementation Changes

- Add Rust storage modules under `src-tauri/src/storage/`: schema, models, commands, assets, search, and errors.
- Add Rust dependencies: `rusqlite`, `serde`, `serde_json`, `sha2`, and `hex`; remove `tauri-plugin-sql` once frontend SQL usage is gone.
- Add schema tables for settings, page metadata/content, block refs, boards, mindmaps, data tables, assets, and FTS search documents.
- Register typed Tauri commands for bootstrap, page/resource CRUD, assets, search, export, and replace.
- Add `src/lib/storageClient.ts` as the only frontend Tauri invoke wrapper.
- Refactor workspace persistence away from raw SQL and toward typed storage client calls.
- Change global search to call async backend search instead of scanning all in-memory workspace data.

## Test Plan

- Rust storage tests cover fresh schema initialization, WAL/foreign key settings, page save/load/delete, block refs, FTS search, data table independent record saves, asset deduplication/readback, and backup replace/export.
- Frontend tests cover storage client invoke mapping, workspace persistence through the client, async search dialog behavior, and backup round trip.
- Verification commands: targeted Rust tests, targeted Vitest files, `npm test`, `npm run lint`, `npm run build`, and current-platform Tauri/Rust checks where feasible.

## Assumptions

- No migration from old SQLite data is required.
- Desktop is the product target; browser mode may keep lightweight test fakes but is not a full storage target.
- New storage starts with `personal-notebook-v2.db`.
- File assets live under the app-managed data directory, not a user-visible workspace folder.
- Existing UI/UX remains functionally the same unless storage changes require loading/error states.
