# Result Readiness and BGM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish completed jobs only after their MP4 is visible, recover inline playback from transient result failures, and package one CC0 BGM track for each G-SULEE mood in the Modal render image.

**Architecture:** A pure backend event publisher enforces `Volume.commit()` before the completed state is written. `ResultPlayer` keeps the video on the completed page and retries failed media URLs with cache-busting revisions while showing loading and retry states. Nine curated FreePD MP3 files live under the Modal backend and are mounted at `/root/bgm` with `BGM_DIR=/root/bgm`.

**Tech Stack:** React 19, TypeScript, Playwright, Python 3.11 unittest, FastAPI, Modal Volume/Dict, FFmpeg/ffprobe, FreePD CC0 MP3 assets

## Global Constraints

- Keep playback, downloads, errors, and manual retry on the existing `/create` completed screen.
- Never publish `state: completed` before the result MP4 has been committed to Modal Volume.
- Retry result playback for transient failures without requiring a page refresh.
- Package exactly one MP3 for each existing G-SULEE mood: `upbeat`, `epic`, `romantic`, `comedy`, `world`, `scoring`, `electronic`, `misc`, and `horror`.
- Do not download BGM at render runtime.
- Preserve G-SULEE's existing automatic mood choice and BGM mix volumes.
- Do not add Supabase, authentication, or another backend.

---

### Task 1: Publish Result Files Before Completed State

**Files:**
- Modify: `modal_backend/job_utils.py`
- Modify: `modal_backend/test_job_utils.py`
- Modify: `modal_backend/modal_app.py`

**Interfaces:**
- Consumes: existing `append_event(state, event) -> dict[str, Any]`
- Produces: `publish_pipeline_event(state, event, *, commit_files, publish_state) -> dict[str, Any]`

- [ ] **Step 1: Write failing ordering tests**

Add tests that capture observable side-effect order and normal-event behavior:

```python
def test_done_event_commits_files_before_publishing_completed_state(self):
    calls = []
    initial = {"state": "running", "stage": "render", "events": [], "next": 0}

    updated = publish_pipeline_event(
        initial,
        {"stage": "done", "video": "result.mp4"},
        commit_files=lambda: calls.append("commit"),
        publish_state=lambda state: calls.append(f"state:{state['state']}"),
    )

    self.assertEqual(calls, ["commit", "state:completed"])
    self.assertEqual(updated["state"], "completed")

def test_progress_event_does_not_commit_result_files(self):
    calls = []
    initial = {"state": "running", "stage": "render", "events": [], "next": 0}

    publish_pipeline_event(
        initial,
        {"stage": "render", "progress": 1, "total": 2},
        commit_files=lambda: calls.append("commit"),
        publish_state=lambda state: calls.append(f"state:{state['state']}"),
    )

    self.assertEqual(calls, ["state:running"])
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `python3 -m unittest modal_backend.test_job_utils.EventStateTests -v`

Expected: import or attribute failure because `publish_pipeline_event` does not exist.

- [ ] **Step 3: Implement the event publication boundary**

Add this focused helper to `job_utils.py`:

```python
def publish_pipeline_event(
    state: Mapping[str, Any],
    event: Mapping[str, Any],
    *,
    commit_files: Callable[[], None],
    publish_state: Callable[[dict[str, Any]], None],
) -> dict[str, Any]:
    if event.get("stage") == "done":
        commit_files()
    updated = append_event(state, event)
    publish_state(updated)
    return updated
```

Import `Callable`, import the helper in `render_job`, and replace the direct `append_event`/`_write_state` pair in `emit()` with:

```python
publish_pipeline_event(
    state,
    event,
    commit_files=jobs_volume.commit,
    publish_state=lambda updated: _write_state(job_id, updated),
)
```

Keep the existing throttled thumbnail commit and final safety commit.

- [ ] **Step 4: Run backend tests and verify GREEN**

Run: `python3 -m unittest modal_backend.test_job_utils -v`

Expected: all backend tests pass, including exact call order `commit` then `state:completed`.

- [ ] **Step 5: Commit the backend ordering fix**

```bash
git add modal_backend/job_utils.py modal_backend/test_job_utils.py modal_backend/modal_app.py
git commit -m "fix: publish results after Modal volume commit"
```

---

### Task 2: Retry Inline Video Playback on the Completed Screen

**Files:**
- Create: `e2e/fixtures/tiny-result.mp4`
- Modify: `e2e/video-demo.spec.ts`
- Modify: `src/components/video/ResultPlayer.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `getJobResultUrl(jobId: string) -> string`
- Produces: a completed-page player with automatic URL revision retries and a manual `영상 다시 불러오기` action

- [ ] **Step 1: Write the failing browser regression test**

Generate a short valid H.264 fixture with FFmpeg:

```bash
mkdir -p e2e/fixtures
ffmpeg -y -f lavfi -i color=c=black:s=320x180:d=0.5 -c:v libx264 -pix_fmt yuv420p -an -movflags +faststart e2e/fixtures/tiny-result.mp4
```

Create a job route whose first result request returns 404. Count result requests, serve the valid fixture on subsequent requests, and verify the browser recovers without navigation:

```typescript
test("retries a result that is temporarily unavailable without leaving the page", async ({ page }) => {
  let resultRequests = 0;
  await page.route("**/jobs", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ job_id: "job-playback-retry" }),
    });
  });
  await page.route("**/jobs/job-playback-retry**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/result")) {
      resultRequests += 1;
      if (resultRequests === 1) {
        await route.fulfill({ status: 404, body: "not committed yet" });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "video/mp4",
        path: "e2e/fixtures/tiny-result.mp4",
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: "job-playback-retry",
        state: "completed",
        stage: "done",
        events: [],
        next: 0,
        done: true,
        error: null,
      }),
    });
  });

  await page.goto("/create");
  await page.getByLabel("영상 파일").setInputFiles({
    name: "memory.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo-video"),
  });
  await page.getByLabel("영상에 담고 싶은 이야기").fill("추억 영상으로 만들어줘");
  await page.getByRole("button", { name: "영상 만들기" }).click();

  await expect(page.getByText("영상 불러오는 중...")).toBeVisible();
  await expect.poll(() => resultRequests).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("영상 불러오는 중...")).toHaveCount(0);
  await expect(page).toHaveURL(/\/create$/);
});
```

Add a second test using the same completed-job setup but serving the valid fixture immediately. Install Playwright's clock, dispatch one `error` per attempt, and advance the exact retry delays:

```typescript
await page.clock.install();
const video = page.locator(".result-frame video");
const delays = [1000, 2000, 3000, 5000, 8000, 12000];
for (let attempt = 0; attempt < delays.length; attempt += 1) {
  await video.dispatchEvent("error");
  await page.clock.fastForward(delays[attempt]);
  await expect(video).toHaveAttribute("src", new RegExp(`playback=0-${attempt + 1}$`));
}
await video.dispatchEvent("error");
await expect(page.getByText("영상을 불러오지 못했습니다.")).toBeVisible();
await page.getByRole("button", { name: "영상 다시 불러오기" }).click();
await expect(video).toHaveAttribute("src", /playback=1-0$/);
await expect(page.getByText("영상 불러오는 중...")).toBeVisible();
await expect(page).toHaveURL(/\/create$/);
```

- [ ] **Step 2: Run the focused E2E test and verify RED**

Run: `npx playwright test --grep "temporarily unavailable"`

Expected: FAIL because the current `<video>` keeps the original URL and never retries.

- [ ] **Step 3: Implement bounded automatic retry state**

In `ResultPlayer.tsx`, add:

```typescript
const RETRY_DELAYS_MS = [1000, 2000, 3000, 5000, 8000, 12000];
type PlaybackState = "loading" | "ready" | "failed";

const [playbackState, setPlaybackState] = useState<PlaybackState>("loading");
const [playbackAttempt, setPlaybackAttempt] = useState(0);
const [playbackRevision, setPlaybackRevision] = useState(0);
const retryTimer = useRef<number | null>(null);
const resultUrl = `${getJobResultUrl(jobId)}?playback=${playbackRevision}-${playbackAttempt}`;
```

Clear pending timers on unmount. On `loadedmetadata`, mark the player ready. On `error`, show loading and schedule the next cache-busted attempt using `RETRY_DELAYS_MS`; after the final attempt mark it failed. Manual retry increments `playbackRevision`, resets attempt to zero, and returns to loading.

Render the status as an overlay inside `.result-frame` while keeping the `<video>` mounted:

```tsx
{playbackState === "loading" && <p className="result-video-status">영상 불러오는 중...</p>}
{playbackState === "failed" && (
  <div className="result-video-status" role="alert">
    <p>영상을 불러오지 못했습니다.</p>
    <button type="button" onClick={retryPlayback}>영상 다시 불러오기</button>
  </div>
)}
<video
  key={resultUrl}
  src={resultUrl}
  controls
  playsInline
  preload="metadata"
  onLoadedMetadata={() => setPlaybackState("ready")}
  onError={handlePlaybackError}
/>
```

Add CSS that centers the status over the existing black player frame and keeps controls usable when ready.

- [ ] **Step 4: Run focused and full frontend checks**

Run: `npx playwright test --grep "temporarily unavailable"`

Expected: PASS with at least two result requests and no route change.

Run: `npx playwright test`

Expected: all browser tests pass.

Run: `npx tsc --noEmit`

Run: `npm run build`

Expected: TypeScript and production build exit 0.

- [ ] **Step 5: Commit the player recovery fix**

```bash
git add e2e/fixtures/tiny-result.mp4 e2e/video-demo.spec.ts src/components/video/ResultPlayer.tsx src/styles.css
git commit -m "fix: retry inline result playback"
```

---

### Task 3: Package Curated BGM in the Modal Render Image

**Files:**
- Create: `modal_backend/bgm/README.md`
- Create: `modal_backend/bgm/{mood}/*.mp3` for all nine moods
- Create: `modal_backend/scripts/fetch_demo_bgm.sh`
- Modify: `modal_backend/test_job_utils.py`
- Modify: `modal_backend/modal_app.py`
- Modify: `modal_backend/README.md`

**Interfaces:**
- Consumes: G-SULEE `pick_bgm(mood)` and its existing `BGM_DIR/<mood>/*.mp3` contract
- Produces: Modal render environment variable `BGM_DIR=/root/bgm` and nine locally packaged MP3 assets

- [ ] **Step 1: Write the failing BGM packaging test**

Add a deployment test with a literal required mood set:

```python
def test_curated_bgm_has_one_playable_mp3_per_mood(self):
    backend = Path(__file__).resolve().parent
    bgm_root = backend / "bgm"
    moods = {"upbeat", "epic", "romantic", "comedy", "world", "scoring", "electronic", "misc", "horror"}

    self.assertEqual({path.name for path in bgm_root.iterdir() if path.is_dir()}, moods)
    for mood in moods:
        tracks = list((bgm_root / mood).glob("*.mp3"))
        self.assertEqual(len(tracks), 1, mood)
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(tracks[0])],
            capture_output=True,
            text=True,
        )
        self.assertEqual(probe.returncode, 0, f"{mood}: {probe.stderr}")
        self.assertGreater(float(probe.stdout.strip()), 10.0, mood)
```

- [ ] **Step 2: Run the focused BGM test and verify RED**

Run: `python3 -m unittest modal_backend.test_job_utils.DeploymentInputTests.test_curated_bgm_has_one_playable_mp3_per_mood -v`

Expected: FAIL because `modal_backend/bgm` does not exist.

- [ ] **Step 3: Add a reproducible curated downloader and license note**

Create `fetch_demo_bgm.sh` with explicit FreePD source filenames:

```bash
tracks=(
  "comedy|Alls Fair In Love"
  "electronic|3 am West End"
  "epic|Adventure"
  "horror|Alien Invasion"
  "misc|A Good Bass for Gambling"
  "romantic|A Very Brady Special"
  "scoring|Action Strike"
  "upbeat|Advertime"
  "world|Aquatic City Vanished"
)
```

The script downloads from `https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/freepd.com`, URL-encodes filenames, rejects empty downloads, and writes exactly one file beneath each mood directory. `README.md` records the upstream repository, FreePD origin, CC0-1.0 status, and the nine selected titles.

- [ ] **Step 4: Download and validate the nine assets**

Run: `bash modal_backend/scripts/fetch_demo_bgm.sh modal_backend/bgm`

Expected: nine non-empty MP3 files, one per mood.

Run: `python3 -m unittest modal_backend.test_job_utils.DeploymentInputTests.test_curated_bgm_has_one_playable_mp3_per_mood -v`

Expected: PASS; ffprobe reports a duration greater than 10 seconds for every file.

- [ ] **Step 5: Mount BGM and set the render environment**

In `modal_app.py`, define:

```python
BGM_ASSETS = THIS_DIR / "bgm"
```

Extend `render_image` before adding source directories:

```python
.env({"BGM_DIR": "/root/bgm"})
.add_local_dir(str(BGM_ASSETS), "/root/bgm")
```

Document that BGM selection is automatic and that the packaged demo corpus is used without runtime downloads.

- [ ] **Step 6: Run backend tests and verify GREEN**

Run: `python3 -m unittest modal_backend.test_job_utils -v`

Expected: all job utility, ordering, asset, and deployment tests pass.

- [ ] **Step 7: Commit the BGM package**

```bash
git add modal_backend/bgm modal_backend/scripts/fetch_demo_bgm.sh modal_backend/test_job_utils.py modal_backend/modal_app.py modal_backend/README.md
git commit -m "feat: package mood bgm for Modal renders"
```

---

### Task 4: Verify and Deploy the Combined Fix

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: frontend retry behavior, backend ordered event publication, and packaged BGM image
- Produces: deployed `my-tiny-cute-video` Modal API and Lovable-ready main branch

- [ ] **Step 1: Document final presentation behavior**

Update the root README troubleshooting section to state that completed results wait for Volume commit, the player retries temporary failures on the same page, and BGM is selected automatically from the packaged mood corpus.

- [ ] **Step 2: Run the complete local verification suite**

Run: `python3 -m unittest modal_backend.test_job_utils -v`

Run: `npx playwright test`

Run: `npx tsc --noEmit`

Run: `npm run build`

Run: `git diff --check`

Expected: every command exits 0, all tests pass, and no whitespace errors are reported.

- [ ] **Step 3: Deploy Modal**

Run: `.venv/bin/modal deploy modal_backend/modal_app.py`

Expected: Modal builds the render image with `/root/bgm`, updates `my-tiny-cute-video`, and prints the existing web API URL.

- [ ] **Step 4: Verify live backend readiness and BGM visibility**

Run the deployed health endpoint and expect `{"ok":true,"service":"my-tiny-cute-video"}`.

Run a Modal shell check that imports `pipeline`, confirms `pipeline.BGM_DIR == "/root/bgm"`, and confirms `pick_bgm("romantic")` returns an existing MP3.

For a newly completed smoke job, request `/jobs/{job_id}/result` with `Range: bytes=0-1` and expect HTTP 206, `Content-Type: video/mp4`, and `Content-Disposition: inline`. Inspect the MP4 with ffprobe and expect at least one audio stream using AAC.

- [ ] **Step 5: Commit documentation and inspect final state**

```bash
git add README.md
git commit -m "docs: document reliable playback and bgm"
git status --short --branch
git log --oneline -6
```

Expected: clean `main`; commits contain only the approved playback, BGM, tests, and documentation changes.
