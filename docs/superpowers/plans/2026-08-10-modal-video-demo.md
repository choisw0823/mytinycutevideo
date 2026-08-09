# My Tiny Cute Video Modal Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the authenticated mood-board app with a Lovable-hosted, nostalgic video-upload demo that runs the existing G-SULEE pipeline asynchronously on Modal and streams progress back to the browser.

**Architecture:** TanStack Start renders a public landing page and a `/create` workflow. The browser uploads ZIP or video files directly to a Modal FastAPI ASGI app, then polls a job endpoint while a background Modal Function runs `../G-SULEE/webapp/pipeline.py`; Modal Dict stores progress and Modal Volume stores job files. The Modal deployment uses the existing `samsung` Secret for `OPENAI_API_KEY`.

**Tech Stack:** React 19, TanStack Start/Router, Tailwind CSS 4, Framer Motion, Playwright, Python 3.11, FastAPI, Modal, FFmpeg, OpenAI SDK, Modal Dict and Volume.

## Global Constraints

- Lovable remains the website deployment target.
- Modal is the only video-processing backend; do not add Supabase, R2, or a persistent application database.
- Reuse `/Users/mlv_intern/Documents/samsung/G-SULEE/webapp/pipeline.py` as the canonical renderer.
- Use the existing Modal Secret named `samsung`; never commit `OPENAI_API_KEY`.
- Support one ZIP or multiple `.mp4`, `.mov`, `.m4v`, `.avi`, `.mkv` files.
- Limit Modal render concurrency to one container and the render timeout to one hour.
- Preserve the scattered-photo memory aesthetic on landing, upload, processing, and result states.
- Remove login, signup, authenticated routing, and user-facing Supabase dependencies.
- Poll job status once per second and stop on `completed` or `failed`.
- Respect `prefers-reduced-motion`.

---

## Planned File Structure

- `src/types/video-job.ts`: shared browser-side job/event API types.
- `src/lib/modal-api.ts`: upload, status polling, thumbnail, and result URL helpers.
- `src/components/video/MemoryCollage.tsx`: decorative nostalgic photo composition.
- `src/components/video/FileDropzone.tsx`: ZIP/multiple-video selection and validation.
- `src/components/video/GenerationProgress.tsx`: stage list, spinner, captions, and progress.
- `src/components/video/ResultPlayer.tsx`: final playback, download, and restart controls.
- `src/routes/index.tsx`: public nostalgic landing page.
- `src/routes/create.tsx`: state machine for input, upload, processing, failure, and completion.
- `src/routes/__root.tsx`: public root without auth context.
- `src/router.tsx`: router without auth context.
- `e2e/video-demo.spec.ts`: browser flow tests with a mocked Modal API.
- `modal_backend/job_utils.py`: pure-Python file validation, ZIP assembly, and state helpers.
- `modal_backend/modal_app.py`: Modal image, Volume, Dict, background renderer, and FastAPI routes.
- `modal_backend/test_job_utils.py`: standard-library unit tests for backend helpers.
- `modal_backend/README.md`: Modal setup, deploy, Lovable environment, and shutdown instructions.
- `.env.example`: `VITE_MODAL_API_URL` configuration without secrets.
- `README.md`: project-level demo runbook.

---

### Task 1: Define the Modal Browser Contract

**Files:**
- Create: `src/types/video-job.ts`
- Create: `src/lib/modal-api.ts`
- Create: `e2e/video-demo.spec.ts`

**Interfaces:**
- Produces: `VideoJobEvent`, `VideoJobStatus`, `uploadVideoJob`, `getVideoJobStatus`, `getJobAssetUrl`, and `getJobResultUrl`.
- Consumes: `VITE_MODAL_API_URL` and browser `XMLHttpRequest`/`fetch`.

- [ ] **Step 1: Write the failing Playwright contract test**

Create `e2e/video-demo.spec.ts` with a first test that mocks `POST **/jobs` and `GET **/jobs/job-demo*`, navigates to `/create`, and expects a visible completed result after the mocked status response:

```ts
import { test, expect } from "../playwright-fixture";

test("submits files and reaches the completed result", async ({ page }) => {
  await page.route("**/jobs", async (route) => {
    await route.fulfill({ json: { job_id: "job-demo" } });
  });
  await page.route("**/jobs/job-demo**", async (route) => {
    await route.fulfill({
      json: {
        job_id: "job-demo",
        state: "completed",
        stage: "done",
        events: [{ stage: "done", video: "result.mp4", duration: 12.4, size_mb: 4.2 }],
        next: 1,
        done: true,
        error: null,
      },
    });
  });

  await page.goto("/create");
  await page.getByLabel("영상 파일").setInputFiles({
    name: "memory.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo"),
  });
  await page.getByLabel("편집 요청").fill("따뜻한 여행의 추억으로 만들어줘");
  await page.getByRole("button", { name: "영상 만들기" }).click();
  await expect(page.getByText("영상이 완성됐어요")).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test e2e/video-demo.spec.ts --project=chromium`

Expected: FAIL because `/create` and the job client do not exist.

- [ ] **Step 3: Add exact API types**

Create `src/types/video-job.ts`:

```ts
export type VideoJobState = "queued" | "running" | "completed" | "failed";

export interface VideoJobEvent {
  stage: string;
  msg?: string;
  progress?: number;
  total?: number;
  clip_id?: string;
  thumb?: string;
  caption?: string;
  dialogue?: string;
  video?: string;
  duration?: number;
  size_mb?: number;
  done?: boolean;
}

export interface VideoJobStatus {
  job_id: string;
  state: VideoJobState;
  stage: string;
  events: VideoJobEvent[];
  next: number;
  done: boolean;
  error: string | null;
}
```

- [ ] **Step 4: Add the upload and polling client**

Create `src/lib/modal-api.ts` with:

```ts
import type { VideoJobStatus } from "@/types/video-job";

const baseUrl = () => (import.meta.env.VITE_MODAL_API_URL || "").replace(/\/$/, "");

export function uploadVideoJob(
  files: File[],
  prompt: string,
  onProgress: (percent: number) => void,
): Promise<{ job_id: string }> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    body.append("prompt", prompt);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${baseUrl()}/jobs`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new Error("영상 업로드에 실패했습니다."));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error("영상 작업을 시작하지 못했습니다."));
        return;
      }
      resolve(JSON.parse(xhr.responseText));
    };
    xhr.send(body);
  });
}

export async function getVideoJobStatus(jobId: string, since: number): Promise<VideoJobStatus> {
  const response = await fetch(`${baseUrl()}/jobs/${jobId}?since=${since}`, { cache: "no-store" });
  if (!response.ok) throw new Error("진행 상태를 확인하지 못했습니다.");
  return response.json();
}

export const getJobAssetUrl = (jobId: string, path: string) =>
  `${baseUrl()}/jobs/${jobId}/files/${path}`;

export const getJobResultUrl = (jobId: string) => `${baseUrl()}/jobs/${jobId}/result`;
```

- [ ] **Step 5: Run TypeScript and lint checks**

Run: `npx tsc --noEmit && npm run lint`

Expected: PASS for the new types/client; the Playwright test still fails only because the UI is not implemented.

- [ ] **Step 6: Commit**

```bash
git add src/types/video-job.ts src/lib/modal-api.ts e2e/video-demo.spec.ts
git commit -m "test: define Modal video job contract"
```

---

### Task 2: Replace Authentication with the Nostalgic Public Landing

**Files:**
- Create: `src/components/video/MemoryCollage.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/__root.tsx`
- Modify: `src/router.tsx`
- Delete: `src/routes/login.tsx`
- Delete: `src/routes/signup.tsx`
- Delete: `src/routes/_authenticated.tsx`
- Delete: `src/routes/_authenticated/dashboard.tsx`
- Delete: `src/routes/_authenticated/boards.$boardId.tsx`
- Modify: `e2e/video-demo.spec.ts`

**Interfaces:**
- Produces: public `/` route and reusable `MemoryCollage`.
- Consumes: existing landing asset JSON files and TanStack `Link`.

- [ ] **Step 1: Add a failing landing-page test**

Append:

```ts
test("landing is public and opens the video creator", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My Tiny Cute Video" })).toBeVisible();
  await expect(page.getByRole("link", { name: "시작하기" })).toHaveAttribute("href", "/create");
  await expect(page.getByText("로그인")).toHaveCount(0);
  await expect(page.getByText("회원가입")).toHaveCount(0);
});
```

- [ ] **Step 2: Run the landing test to verify it fails**

Run: `npx playwright test e2e/video-demo.spec.ts -g "landing" --project=chromium`

Expected: FAIL because the current heading is `Inspo` and the link points to `/signup`.

- [ ] **Step 3: Implement `MemoryCollage`**

Build a presentational component that accepts `variant: "landing" | "quiet" | "result"`, renders the 13 existing asset URLs as absolutely positioned photograph cards, uses deterministic placement/rotation, marks all decorative images with empty alt text, and disables drift under `prefers-reduced-motion`.

- [ ] **Step 4: Replace `src/routes/index.tsx`**

Render `MemoryCollage variant="landing"`, the heading `My Tiny Cute Video`, the copy `흩어진 순간을 한 편의 기억으로`, and a `Link` to `/create`. Remove Konva, canvas state, selection, resizing, and the development-only `Copy positions` button.

- [ ] **Step 5: Remove root auth initialization and route guards**

Change `__root.tsx` to expose an empty router context and remove `useAuth`, Supabase session reads, auth invalidation, and authentication metadata. Change `router.tsx` to pass `{}` as context. Delete the login/signup/authenticated route files so TanStack regenerates the route tree without them.

- [ ] **Step 6: Run the landing test and build**

Run: `npx playwright test e2e/video-demo.spec.ts -g "landing" --project=chromium && npm run build`

Expected: PASS; the generated route tree contains `/` and no login/signup/authenticated routes.

- [ ] **Step 7: Commit**

```bash
git add src/components/video/MemoryCollage.tsx src/routes src/router.tsx src/routeTree.gen.ts e2e/video-demo.spec.ts
git commit -m "feat: replace moodboard auth flow with public video landing"
```

---

### Task 3: Build the Upload, Processing, and Result Experience

**Files:**
- Create: `src/components/video/FileDropzone.tsx`
- Create: `src/components/video/GenerationProgress.tsx`
- Create: `src/components/video/ResultPlayer.tsx`
- Create: `src/routes/create.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/video-demo.spec.ts`

**Interfaces:**
- Consumes: Task 1 API functions and types; Task 2 `MemoryCollage`.
- Produces: complete `/create` state machine and local job restoration.

- [ ] **Step 1: Add validation and failure tests**

Append tests that verify an unsupported `.txt` file displays `지원하지 않는 파일 형식입니다`, an empty prompt disables `영상 만들기`, and a mocked failed status displays `영상 생성에 실패했습니다` with `다시 시작`.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx playwright test e2e/video-demo.spec.ts --project=chromium`

Expected: FAIL because `/create` is not implemented.

- [ ] **Step 3: Implement `FileDropzone`**

Accept one ZIP or multiple videos, reject mixing ZIP with videos, expose an accessible `<input aria-label="영상 파일" multiple>`, calculate total bytes, revoke all object URLs on removal/unmount, and render selected videos as small instant-photo previews.

- [ ] **Step 4: Implement `GenerationProgress`**

Map pipeline stage names to Korean labels, compute stage progress from `progress/total`, render a film-reel loader, append thumbnail cards via `getJobAssetUrl`, and animate new cards into a horizontal memory ribbon. Keep the step list readable without animation.

- [ ] **Step 5: Implement `ResultPlayer`**

Render `video controls` with `getJobResultUrl(jobId)`, duration/size from the final event, a download anchor, and a restart button.

- [ ] **Step 6: Implement the `/create` state machine**

Use these states:

```ts
type ScreenState = "input" | "uploading" | "processing" | "completed" | "failed";
```

Submit through `uploadVideoJob`, persist `job_id` to `localStorage`, poll `getVideoJobStatus(jobId, since)` every 1000 ms, append only returned events, stop on terminal state, retry status reads three times, and clear local state on restart.

- [ ] **Step 7: Add the nostalgic page styling**

Add warm ivory/ink/rose design tokens, paper grain using CSS gradients, photograph shadows/rotations, film-reel animation, responsive central panels, and reduced-motion rules. Keep all functional controls at WCAG-readable contrast.

- [ ] **Step 8: Run UI tests, lint, and build**

Run: `npx playwright test e2e/video-demo.spec.ts --project=chromium && npm run lint && npm run build`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/video src/routes/create.tsx src/styles.css src/routeTree.gen.ts e2e/video-demo.spec.ts
git commit -m "feat: add nostalgic video generation workflow"
```

---

### Task 4: Implement Testable Modal Job Utilities

**Files:**
- Create: `modal_backend/__init__.py`
- Create: `modal_backend/job_utils.py`
- Create: `modal_backend/test_job_utils.py`

**Interfaces:**
- Produces: `validate_uploads(files)`, `safe_zip_members(zip_path)`, `build_input_zip(paths, destination)`, `append_event(state, event)`, and constants for file/count/size limits.
- Consumes: standard-library `pathlib`, `zipfile`, `threading`, and `uuid` only.

- [ ] **Step 1: Write failing standard-library unit tests**

Cover: one ZIP accepted, multiple videos accepted, mixed ZIP/video rejected, unsupported extension rejected, traversal entry `../../escape.mp4` rejected, symlink-like ZIP entries rejected, and event append updates `stage`, `events`, `next`, and terminal state.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m unittest modal_backend.test_job_utils -v`

Expected: FAIL because `job_utils` does not exist.

- [ ] **Step 3: Implement validation and ZIP helpers**

Use explicit limits:

```py
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".avi", ".mkv"}
MAX_FILES = 30
MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024
```

Resolve every ZIP member against a synthetic root and reject absolute paths, `..` escape, directories outside the root, and Unix symlink mode bits. Build multi-video ZIP files with sanitized sequential names while preserving extensions.

- [ ] **Step 4: Implement event state updates**

`append_event` must copy input values, add a timestamp if absent, set `state="failed"` for `stage="error"`, set `state="completed"` for `stage="done"`, and otherwise set `state="running"`.

- [ ] **Step 5: Run unit tests**

Run: `python3 -m unittest modal_backend.test_job_utils -v`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modal_backend/__init__.py modal_backend/job_utils.py modal_backend/test_job_utils.py
git commit -m "test: add safe Modal job utilities"
```

---

### Task 5: Package G-SULEE as a Modal Async API

**Files:**
- Create: `modal_backend/modal_app.py`
- Create: `modal_backend/README.md`
- Create: `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Task 4 helpers, `../G-SULEE/webapp`, Modal Secret `samsung`.
- Produces: `POST /jobs`, `GET /jobs/{job_id}`, `GET /jobs/{job_id}/files/{path}`, `GET /jobs/{job_id}/result`, and deployed Modal app `my-tiny-cute-video`.

- [ ] **Step 1: Add an import smoke test**

Extend `test_job_utils.py` to assert the sibling G-SULEE paths required for deployment exist and that `pipeline.py` and `static/NanumGothic-Bold.ttf` are present.

- [ ] **Step 2: Run the smoke test**

Run: `python3 -m unittest modal_backend.test_job_utils -v`

Expected: PASS on this workspace; fail with a clear path message elsewhere.

- [ ] **Step 3: Define the Modal image and resources**

Create an image equivalent to:

```py
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git", "libsndfile1")
    .pip_install("fastapi[standard]", "openai", "torch", "soundfile", "numpy")
    .add_local_dir(str(GSULEE_WEBAPP), "/root/gsulee")
    .add_local_dir(str(THIS_DIR), "/root/modal_backend")
)
```

Create `modal.App("my-tiny-cute-video")`, `modal.Volume.from_name("my-tiny-cute-video-jobs", create_if_missing=True)`, `modal.Dict.from_name("my-tiny-cute-video-state", create_if_missing=True)`, and `modal.Secret.from_name("samsung")`.

- [ ] **Step 4: Implement the background renderer**

Define `render_job(job_id, zip_relative_path, prompt)` with `cpu=4`, `memory=8192`, `timeout=3600`, `max_containers=1`, Volume mount `/data`, image, and `samsung` Secret. Import `/root/gsulee/pipeline.py`, call `pipeline.run_pipeline`, serialize all event updates through a local `threading.Lock`, persist updates to Modal Dict, and commit the Volume after thumbnail bursts and at termination.

- [ ] **Step 5: Implement the FastAPI ASGI routes**

`POST /jobs` validates `UploadFile` metadata and streamed byte counts, writes to `/data/jobs/{job_id}`, validates ZIP contents, builds a ZIP for multiple videos, initializes Dict state, commits the Volume, spawns `render_job`, stores the Modal FunctionCall ID, and returns HTTP 202.

`GET /jobs/{job_id}?since=N` returns only `events[N:]` with `next=len(events)`.

File/result routes normalize and resolve paths under the job directory, reload the Volume before reading, return 404 for missing/incomplete results, and use `FileResponse` with appropriate media type.

- [ ] **Step 6: Configure CORS and cleanup behavior**

Read optional `LOVABLE_ORIGIN` from the `samsung` Secret. Always allow `http://localhost:8080`; add the Lovable origin when set. Do not use credentialed CORS. Provide a cleanup function that deletes job directories older than 24 hours and removes their Dict entries; call it opportunistically when creating a new job.

- [ ] **Step 7: Document setup and environment**

Document:

```bash
pip install modal
modal setup
modal serve modal_backend/modal_app.py
modal deploy modal_backend/modal_app.py
```

Document that `samsung` already contains `OPENAI_API_KEY`, that `LOVABLE_ORIGIN` should be added after Lovable provides the final URL, and that Lovable needs `VITE_MODAL_API_URL=<deployed-modal-url>`.

- [ ] **Step 8: Run local backend checks**

Run: `python3 -m unittest modal_backend.test_job_utils -v && python3 -m py_compile modal_backend/job_utils.py modal_backend/modal_app.py`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add modal_backend .env.example .gitignore
git commit -m "feat: run G-SULEE as an asynchronous Modal API"
```

---

### Task 6: Remove Dead Moodboard Dependencies and Document the Demo

**Files:**
- Delete: `src/components/canvas/`
- Delete: `src/hooks/use-auth.ts`
- Delete: `src/hooks/use-konva-image.ts`
- Delete: `src/hooks/use-undo-stack.ts`
- Delete: `src/integrations/lovable/`
- Delete: `src/integrations/supabase/`
- Delete: `src/utils/sign-urls.functions.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `bun.lockb`
- Modify: `README.md`

**Interfaces:**
- Consumes: working public routes and Modal backend from Tasks 2–5.
- Produces: a focused dependency graph and complete presenter runbook.

- [ ] **Step 1: Prove removed modules are unreachable**

Run:

```bash
rg -n "@/components/canvas|use-auth|use-konva-image|use-undo-stack|integrations/supabase|integrations/lovable|react-konva|konva|@supabase|cloud-auth" src
```

Expected: no imports from active landing/create/root/router files.

- [ ] **Step 2: Delete dead source and remove dependencies**

Remove the listed files/directories after `rg` confirms they are no longer referenced. Update dependency manifests and both lockfiles with:

```bash
npm uninstall @lovable.dev/cloud-auth-js @supabase/supabase-js konva react-konva colorthief @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
bun install
```

Never hand-edit lockfiles.

- [ ] **Step 3: Replace the generated moodboard README**

Document architecture, local frontend commands, Modal deployment, Lovable environment variables, supported formats, presentation checklist, shutdown command, troubleshooting, and the sibling `G-SULEE` dependency.

- [ ] **Step 4: Run the complete local verification**

Run:

```bash
python3 -m unittest modal_backend.test_job_utils -v
npm run lint
npm run build
npx playwright test e2e/video-demo.spec.ts --project=chromium
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove obsolete moodboard and auth code"
```

---

### Task 7: Visual QA and Live Modal Smoke Test

**Files:**
- Modify as findings require: `src/routes/index.tsx`, `src/routes/create.tsx`, `src/components/video/*.tsx`, `src/styles.css`, `modal_backend/modal_app.py`

**Interfaces:**
- Consumes: the complete application.
- Produces: verified Lovable-ready build and a deployable Modal endpoint.

- [ ] **Step 1: Start the frontend and inspect responsive states**

Run: `npm run dev`

Inspect landing and `/create` at 1440×900, 768×1024, and 390×844. Verify no photo overlaps primary controls, all text fits, focus indicators are visible, and reduced-motion keeps the experience usable.

- [ ] **Step 2: Run the mocked browser flow visually**

Use Playwright routing to pause each screen state and capture landing, input, uploading, processing, completed, and failed states. Fix clipping, contrast, overflow, or animation problems.

- [ ] **Step 3: Deploy or serve Modal with user authorization**

Run: `modal serve modal_backend/modal_app.py` for local integration or `modal deploy modal_backend/modal_app.py` for the presentation endpoint.

Expected: Modal recognizes Secret `samsung`, builds the FFmpeg image, mounts the existing G-SULEE code, and prints an HTTPS ASGI URL.

- [ ] **Step 4: Configure and smoke-test a small real job**

Set `VITE_MODAL_API_URL` to the Modal ASGI URL, submit two short H.264 MP4 files, verify real stage events, thumbnails, final playback, and download.

- [ ] **Step 5: Run final verification and commit fixes**

Run:

```bash
git diff --check
git status --short
python3 -m unittest modal_backend.test_job_utils -v
npm run lint
npm run build
npx playwright test e2e/video-demo.spec.ts --project=chromium
```

Expected: all checks pass; only intentional changes remain.

```bash
git add -A
git commit -m "fix: polish and verify Modal video demo"
```
