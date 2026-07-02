# Zhixi Logo Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current purple lightning placeholder with the approved “栖页 / 温润青绿” logo across Tauri desktop icon assets and the browser favicon.

**Architecture:** Use `src-tauri/icons/icon-source.svg` as the editable source of truth, then generate all Tauri platform icon outputs with the local Tauri CLI. Keep `public/favicon.svg` in the same visual system, and add a lightweight config/source regression test so future placeholder icons do not silently return.

**Tech Stack:** SVG, Tauri CLI `npm run tauri -- icon`, Vitest, Node `fs`/`path` helpers, existing Tauri config.

---

## File Structure

- Modify `src-tauri/tauriConfig.test.ts`: add a regression test that bundle icon paths exist and the source SVG contains the approved Zhixi palette/marker.
- Modify `src-tauri/icons/icon-source.svg`: replace the lightning source with the approved editable SVG logo.
- Modify `public/favicon.svg`: replace the lightning favicon with a compact SVG version of the approved logo.
- Regenerate `src-tauri/icons/*.png`, `src-tauri/icons/icon.ico`, `src-tauri/icons/icon.icns`, `src-tauri/icons/ios/*.png`, and `src-tauri/icons/android/**/*.png` using Tauri CLI.
- Do not modify `src-tauri/tauri.conf.json`, product name, identifier, routes, app UI code, or existing unrelated `README.md` changes.

## Task 1: Add Icon Regression Test

**Files:**
- Modify: `src-tauri/tauriConfig.test.ts`

- [ ] **Step 1: Replace the test file with icon coverage**

```ts
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

type TauriConfig = {
  app?: {
    windows?: Array<{
      dragDropEnabled?: boolean
    }>
  }
  bundle?: {
    icon?: string[]
  }
}

const srcTauriDir = dirname(fileURLToPath(import.meta.url))
const configPath = join(srcTauriDir, 'tauri.conf.json')

const readConfig = () => JSON.parse(readFileSync(configPath, 'utf8')) as TauriConfig

describe('Tauri config', () => {
  it('keeps WebView file drag/drop interception disabled for HTML5 mindmap dragging', () => {
    const config = readConfig()

    expect(config.app?.windows?.[0]?.dragDropEnabled).toBe(false)
  })

  it('keeps bundle icon paths backed by the approved Zhixi source icon', () => {
    const config = readConfig()
    const iconPaths = config.bundle?.icon ?? []

    expect(iconPaths).toEqual([
      'icons/32x32.png',
      'icons/128x128.png',
      'icons/128x128@2x.png',
      'icons/icon.icns',
      'icons/icon.ico',
    ])

    iconPaths.forEach((iconPath) => {
      expect(existsSync(join(srcTauriDir, iconPath))).toBe(true)
    })

    const sourceIcon = readFileSync(join(srcTauriDir, 'icons/icon-source.svg'), 'utf8')

    expect(sourceIcon).toContain('data-zhixi-logo="perch-page"')
    expect(sourceIcon).toContain('#0E766E')
    expect(sourceIcon).toContain('#DDAE4E')
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails before the icon replacement**

Run:

```bash
npx vitest run src-tauri/tauriConfig.test.ts
```

Expected: FAIL on `data-zhixi-logo="perch-page"` because the current `icon-source.svg` is still the lightning placeholder.

## Task 2: Replace Editable SVG Sources

**Files:**
- Modify: `src-tauri/icons/icon-source.svg`
- Modify: `public/favicon.svg`
- Test: `src-tauri/tauriConfig.test.ts`

- [ ] **Step 1: Replace `src-tauri/icons/icon-source.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="zhixi-icon-title" data-zhixi-logo="perch-page">
  <title id="zhixi-icon-title">知栖栖页图标</title>
  <defs>
    <linearGradient id="zhixi-bg" x1="72" y1="64" x2="430" y2="438" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F9F4EA" />
      <stop offset="1" stop-color="#DCEFE6" />
    </linearGradient>
    <linearGradient id="zhixi-leaf" x1="154" y1="148" x2="354" y2="372" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0E766E" />
      <stop offset="1" stop-color="#378F5D" />
    </linearGradient>
    <linearGradient id="zhixi-page" x1="170" y1="164" x2="322" y2="324" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFFFFF" />
      <stop offset="1" stop-color="#E9F4EC" />
    </linearGradient>
  </defs>
  <rect x="32" y="32" width="448" height="448" rx="106" fill="url(#zhixi-bg)" />
  <path fill="url(#zhixi-leaf)" d="M154 316c62-70 132-110 214-122 13-2 23 11 17 23-34 72-92 123-172 157-18 8-38-9-28-27 7-13 18-24 32-31h-63Z" />
  <path fill="url(#zhixi-page)" d="M166 164c67 9 123 32 168 70-54 15-104 44-150 86-19-43-25-95-18-156Z" />
  <path fill="#D9ECE4" d="M178 182c41 7 77 22 109 43-34 12-66 31-96 57-12-30-16-63-13-100Z" />
  <path fill="none" stroke="#233630" stroke-width="26" stroke-linecap="round" d="M164 348h146" />
  <circle cx="352" cy="158" r="18" fill="#DDAE4E" />
</svg>
```

- [ ] **Step 2: Replace `public/favicon.svg` with the same logo system**

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 512 512" role="img" aria-labelledby="zhixi-favicon-title" data-zhixi-logo="perch-page">
  <title id="zhixi-favicon-title">知栖</title>
  <defs>
    <linearGradient id="favicon-bg" x1="72" y1="64" x2="430" y2="438" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F9F4EA" />
      <stop offset="1" stop-color="#DCEFE6" />
    </linearGradient>
    <linearGradient id="favicon-leaf" x1="154" y1="148" x2="354" y2="372" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0E766E" />
      <stop offset="1" stop-color="#378F5D" />
    </linearGradient>
  </defs>
  <rect x="32" y="32" width="448" height="448" rx="106" fill="url(#favicon-bg)" />
  <path fill="url(#favicon-leaf)" d="M154 316c62-70 132-110 214-122 13-2 23 11 17 23-34 72-92 123-172 157-18 8-38-9-28-27 7-13 18-24 32-31h-63Z" />
  <path fill="#FFFFFF" d="M166 164c67 9 123 32 168 70-54 15-104 44-150 86-19-43-25-95-18-156Z" />
  <path fill="none" stroke="#233630" stroke-width="32" stroke-linecap="round" d="M164 348h146" />
  <circle cx="352" cy="158" r="21" fill="#DDAE4E" />
</svg>
```

- [ ] **Step 3: Run the focused test and verify it passes**

Run:

```bash
npx vitest run src-tauri/tauriConfig.test.ts
```

Expected: PASS. The source SVG now contains `data-zhixi-logo="perch-page"`, `#0E766E`, and `#DDAE4E`, and all configured bundle icon files still exist.

## Task 3: Generate Tauri Platform Icons

**Files:**
- Modify generated files in `src-tauri/icons/`

- [ ] **Step 1: Generate icons from the approved SVG source**

Run:

```bash
npm run tauri -- icon src-tauri/icons/icon-source.svg -o src-tauri/icons
```

Expected: Tauri CLI completes successfully and rewrites the platform icon set in `src-tauri/icons/`.

- [ ] **Step 2: Check generated file dimensions and container formats**

Run:

```bash
file src-tauri/icons/icon.png \
  src-tauri/icons/32x32.png \
  src-tauri/icons/64x64.png \
  src-tauri/icons/128x128.png \
  src-tauri/icons/128x128@2x.png \
  src-tauri/icons/icon.ico \
  src-tauri/icons/icon.icns
```

Expected: PNG outputs report the expected dimensions, `icon.ico` reports a Windows icon resource, and `icon.icns` reports a Mac OS X icon.

- [ ] **Step 3: Confirm no build artifacts were accidentally staged**

Run:

```bash
git status --short --untracked-files=all
```

Expected: icon files, `public/favicon.svg`, and `src-tauri/tauriConfig.test.ts` may be changed. `src-tauri/target/`, `.app`, `.dmg`, `.msi`, and installer files must not appear.

## Task 4: Verify and Commit

**Files:**
- Test: `src-tauri/tauriConfig.test.ts`
- Verify generated icon visuals in `src-tauri/icons/icon.png`, `src-tauri/icons/32x32.png`, and `src-tauri/icons/64x64.png`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx vitest run src-tauri/tauriConfig.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full frontend build**

Run:

```bash
npm run build
```

Expected: TypeScript build and Vite build complete successfully.

- [ ] **Step 3: Visually inspect generated PNGs**

Open these files:

```text
src-tauri/icons/icon.png
src-tauri/icons/64x64.png
src-tauri/icons/32x32.png
```

Expected: the 512px icon matches the approved “栖页 / 温润青绿” direction; 64px and 32px still show a clear page/leaf/branch silhouette.

- [ ] **Step 4: Commit the icon implementation**

Run:

```bash
git add src-tauri/tauriConfig.test.ts public/favicon.svg src-tauri/icons
git commit -m "feat: update zhixi app icon"
```

Expected: one commit containing only the icon source, generated icon assets, favicon, and icon regression test. The pre-existing `README.md` change remains unstaged unless it was already staged by the user.

## Self-Review

- Spec coverage: the plan updates the editable SVG source, all Tauri platform icon assets, favicon, small-size verification, and keeps `tauri.conf.json` paths unchanged.
- Placeholder scan: no `TBD`, `TODO`, vague “handle later” steps, or unspecified test commands remain.
- Type consistency: `TauriConfig`, `readConfig`, and `data-zhixi-logo="perch-page"` are defined before use and referenced consistently.
