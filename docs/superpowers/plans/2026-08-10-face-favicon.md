# Face Photo Favicon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display a face-centered crop of `/Users/mlv_intern/Documents/samsung/a.jpg` as the browser-tab favicon on every route.

**Architecture:** Create one 512×512 PNG asset from a fixed square crop of the original JPEG. Import the asset through Vite in the TanStack root route and register it once as the document icon so every page inherits it.

**Tech Stack:** macOS `sips`, PNG, React 19, TanStack Router, Vite, TypeScript, Playwright

## Global Constraints

- Preserve `/Users/mlv_intern/Documents/samsung/a.jpg` unchanged.
- Crop source coordinates `1600×1600` at `x=0`, `y=650`.
- Save the derived asset as `src/assets/favicon.png` at exactly 512×512.
- Do not use generative AI or alter facial features or colors.
- Register one global `rel="icon"` link with `type="image/png"`.
- Work directly on `main` as explicitly requested by the user.

---

### Task 1: Generate and Register the Face Favicon

**Files:**
- Create: `src/assets/favicon.png`
- Modify: `src/routes/__root.tsx`
- Modify: `e2e/video-demo.spec.ts`

**Interfaces:**
- Consumes: `/Users/mlv_intern/Documents/samsung/a.jpg`, 3024×4032 JPEG
- Produces: Vite asset URL imported as `faviconUrl: string`
- Produces: `<link rel="icon" type="image/png" href={faviconUrl}>` in the shared root head

- [ ] **Step 1: Write the failing browser test**

Add this assertion to the landing-page Playwright test:

```ts
const favicon = page.locator('link[rel="icon"][type="image/png"]');
await expect(favicon).toHaveAttribute("href", /favicon.*\.png$/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx playwright test e2e/video-demo.spec.ts --grep "landing is public"`

Expected: FAIL because no `link[rel="icon"]` exists.

- [ ] **Step 3: Generate the exact crop**

Run the crop and conversion as two commands so `sips` does not resample before cropping:

```bash
sips --cropOffset 650 0 --cropToHeightWidth 1600 1600 /Users/mlv_intern/Documents/samsung/a.jpg --out /private/tmp/mytinycutevideo-favicon-crop.jpg
sips -s format png --resampleHeightWidth 512 512 /private/tmp/mytinycutevideo-favicon-crop.jpg --out src/assets/favicon.png
```

Confirm dimensions:

```bash
sips -g pixelWidth -g pixelHeight -g format src/assets/favicon.png
```

Expected: `pixelWidth: 512`, `pixelHeight: 512`, `format: png`.

- [ ] **Step 4: Visually inspect the generated asset**

Open `src/assets/favicon.png` with the local image viewer and verify the face, eyes, nose, mouth, and surrounding hair are visible without distortion.

- [ ] **Step 5: Register the global favicon**

Add the asset import to `src/routes/__root.tsx`:

```ts
import faviconUrl from "../assets/favicon.png?url";
```

Add this entry first in `head().links`:

```ts
{ rel: "icon", type: "image/png", href: faviconUrl },
```

- [ ] **Step 6: Run focused test and verify GREEN**

Run: `npx playwright test e2e/video-demo.spec.ts --grep "landing is public"`

Expected: PASS and the favicon URL resolves to a hashed PNG asset.

- [ ] **Step 7: Run full verification**

Run: `npx tsc --noEmit && npm run build && npx playwright test`

Expected: TypeScript and build exit 0; all Playwright tests pass.

- [ ] **Step 8: Commit locally**

```bash
git add src/assets/favicon.png src/routes/__root.tsx e2e/video-demo.spec.ts docs/superpowers/plans/2026-08-10-face-favicon.md
git commit -m "feat: use face photo as site favicon"
```

Do not push `main` until the user explicitly approves that remote mutation.
