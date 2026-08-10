# 60-Video Upload and Result Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow up to 60 source videos and preserve completed jobs so their MP4 result remains visible after refresh.

**Architecture:** Keep the existing client/server count guards synchronized at 60 while retaining the 4GB size cap. Persist the job ID until explicit restart so the existing polling flow reconstructs completed state and the result player after hydration.

**Tech Stack:** React, TypeScript, Playwright, Python unittest, FastAPI, Modal

## Global Constraints

- Direct video uploads and ZIP members allow exactly 60 and reject 61.
- The 4GB compressed/uploaded size limits remain unchanged.
- Existing completed result files are reused; no re-render is required.
- Work directly on `main` as explicitly requested by the user.

---

### Task 1: Backend 60-video boundary

**Files:**
- Modify: `modal_backend/test_job_utils.py`
- Modify: `modal_backend/job_utils.py`
- Modify: `modal_backend/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `validate_uploads(paths: Sequence[Path]) -> str`
- Produces: the same function with a 60-file boundary

- [ ] Add a unit test that accepts 60 `.mp4` paths and rejects 61.
- [ ] Run the focused test and confirm the 60-file case fails under the old limit.
- [ ] Change `MAX_FILES` from 30 to 60 and update the human documentation.
- [ ] Run all backend unit tests and Python compilation.

### Task 2: Frontend 60-video boundary

**Files:**
- Modify: `e2e/video-demo.spec.ts`
- Modify: `src/components/video/FileDropzone.tsx`

**Interfaces:**
- Consumes: browser `FileList`
- Produces: accepted state for 60 files and an error for 61 files

- [ ] Add a Playwright test selecting 60 tiny MP4 fixtures and then 61.
- [ ] Run the focused test and confirm it fails at 60 under the old limit.
- [ ] Change `MAX_FILE_COUNT` from 30 to 60.
- [ ] Run the focused Playwright test again.

### Task 3: Preserve and restore completed result

**Files:**
- Modify: `e2e/video-demo.spec.ts`
- Modify: `src/routes/create.tsx`

**Interfaces:**
- Consumes: local storage key `my-tiny-cute-video-job`
- Produces: completed result screen after reload until explicit restart

- [ ] Extend the completed-job E2E test to reload and expect the result heading and result video URL.
- [ ] Run the focused test and confirm reload loses the result under current behavior.
- [ ] Stop deleting the stored job ID on completed/failed poll responses; keep deletion in `restart` only.
- [ ] Run the focused test again.

### Task 4: Verification and deployment

**Files:**
- Modify: none beyond verified implementation files

**Interfaces:**
- Consumes: test and deployment commands
- Produces: deployed API and a clean `main` commit

- [ ] Run Python tests, TypeScript, lint, build, and all Playwright tests.
- [ ] Deploy `modal_backend/modal_app.py`.
- [ ] Verify the result endpoint returns `206`, `video/mp4`, CORS, and `Content-Disposition: inline`.
- [ ] Commit the implementation on `main` and confirm worktree status.

