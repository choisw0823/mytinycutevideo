# In-Page Result Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the completed video visible and playable while an MP4 download starts without navigating away from `/create`.

**Architecture:** Keep `/jobs/{jobId}/result` as the `<video>` source. Replace the cross-origin download anchor with an event-driven button that fetches `/result?download=1`, creates a temporary object URL, clicks a local download anchor, and cleans it up while preserving the current React route and completed state.

**Tech Stack:** React 19, TypeScript, Fetch/Blob/Object URL browser APIs, Playwright

## Global Constraints

- The completed result stays in the existing `/create` page and uses `<video controls playsInline>`.
- Clicking download must not change `window.location` or open a result page.
- The saved filename is exactly `my-tiny-cute-video.mp4`.
- The button is disabled and labeled `다운로드 중...` while the file is being fetched.
- Download failures keep the completed player visible and show `영상 다운로드에 실패했습니다.`.
- No backend endpoint change or Modal redeployment is required.
- Work directly on `main` as explicitly requested by the user.

---

### Task 1: Download Result Without Page Navigation

**Files:**
- Modify: `e2e/video-demo.spec.ts`
- Modify: `src/lib/modal-api.ts`
- Modify: `src/components/video/ResultPlayer.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `getJobDownloadUrl(jobId: string) -> string`
- Produces: `downloadJobResult(jobId: string) -> Promise<void>`
- Produces: a `button` named `MP4 다운로드` that keeps the completed result route mounted

- [ ] **Step 1: Write the failing successful-download browser test**

Extend `creates a video job and shows the finished result` so `/jobs/job-demo/result?download=1` returns MP4 bytes, then click the button and assert the download filename, unchanged `/create` URL, and visible completed heading:

```ts
const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "MP4 다운로드" }).click();
const download = await downloadPromise;
expect(download.suggestedFilename()).toBe("my-tiny-cute-video.mp4");
await expect(page).toHaveURL(/\/create$/);
await expect(page.getByText("영상이 완성됐어요")).toBeVisible();
```

- [ ] **Step 2: Write the failing failed-download browser test**

Add a completed-job scenario where `/result?download=1` returns HTTP 500, click `MP4 다운로드`, and assert `영상 다운로드에 실패했습니다.` while the result heading and `/create` URL remain:

```ts
await page.getByRole("button", { name: "MP4 다운로드" }).click();
await expect(page.getByText("영상 다운로드에 실패했습니다.")).toBeVisible();
await expect(page).toHaveURL(/\/create$/);
await expect(page.getByText("영상이 완성됐어요")).toBeVisible();
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `npx playwright test e2e/video-demo.spec.ts --grep "finished result|download failure"`

Expected: FAIL because the current control is a navigation link and there is no client-side download error state.

- [ ] **Step 4: Implement the browser download helper**

Add the following behavior to `src/lib/modal-api.ts`:

```ts
export async function downloadJobResult(jobId: string): Promise<void> {
  const response = await fetch(getJobDownloadUrl(jobId));
  if (!response.ok) {
    throw new Error("영상 다운로드에 실패했습니다.");
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = "my-tiny-cute-video.mp4";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
```

- [ ] **Step 5: Replace the result anchor with a stateful button**

In `src/components/video/ResultPlayer.tsx`, import `useState` and `downloadJobResult`, add `downloading` and `downloadError` state, and use this handler:

```ts
const handleDownload = async () => {
  setDownloading(true);
  setDownloadError(null);
  try {
    await downloadJobResult(jobId);
  } catch {
    setDownloadError("영상 다운로드에 실패했습니다.");
  } finally {
    setDownloading(false);
  }
};
```

Render the download control and error without an `href`:

```tsx
<button
  type="button"
  className="primary-action"
  onClick={() => void handleDownload()}
  disabled={downloading}
>
  <Download size={18} /> {downloading ? "다운로드 중..." : "MP4 다운로드"}
</button>
{downloadError && <p className="result-download-error" role="alert">{downloadError}</p>}
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npx playwright test e2e/video-demo.spec.ts --grep "finished result|download failure"`

Expected: 2 tests pass and the download test reports filename `my-tiny-cute-video.mp4`.

- [ ] **Step 7: Run full frontend verification**

Run: `npx tsc --noEmit && npm run lint && npm run build && npx playwright test`

Expected: TypeScript, lint, and build exit 0; all Playwright tests pass.

- [ ] **Step 8: Commit and push**

```bash
git add e2e/video-demo.spec.ts src/lib/modal-api.ts src/components/video/ResultPlayer.tsx src/styles.css docs/superpowers/plans/2026-08-10-in-page-result-download.md
git commit -m "fix: download results without leaving the page"
git push origin main
```
