# Fixed Happy Reflect Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 완성 영상 아래의 Reflect 결과를 새 발표 슬라이드와 동일한 반려견 해피 고정 데모로 변경한다.

**Architecture:** 기존 완료 화면 안의 `ReflectExperience`만 로컬 타이머 기반 상태로 바꾼다. 고정 문구와 세 단계 흐름을 전체 너비 카드로 표시하고 `/reflect` 네트워크 요청은 보내지 않는다. 기존 영상 작업 API, 서버 Reflect API, 브라우저 기억 기록은 보존한다.

**Tech Stack:** React 19, TypeScript, CSS, Playwright, Vite

## Global Constraints

- 기존 업로드→생성→저장→재생 파이프라인의 함수, API 계약, 작업 상태 전환을 변경하지 않는다.
- 기존 `render_job`, `/jobs`, 작업 폴링, 결과 재생, 다운로드 로직을 수정하지 않는다.
- 영상 완료 시 브라우저 기억 목록에 현재 작업을 중복 없이 기록하는 동작은 유지한다.
- Reflect 실행 시 `/reflect` 요청을 보내지 않는다.
- 로딩 시간은 800ms다.
- 관찰 문구는 `최근 반려견 해피와 함께 하는 시간이 줄었네요`로 고정한다.
- 제안 문구는 `해피와 함께 나들이 하는 시간을 가져보면 어떨까요?`로 고정한다.
- 숫자 기반 `Evidence` 영역을 표시하지 않는다.
- Reflect 결과에는 사진을 표시하지 않는다.
- Git 원격 반영과 실제 배포는 별도 승인 없이 실행하지 않는다.

---

### Task 1: Fixed Demo Browser Contract

**Files:**
- Modify: `e2e/video-demo.spec.ts`

**Interfaces:**
- Consumes: 기존 완료 영상 mock과 실제 `ReflectExperience` UI.
- Produces: 고정 문구, 해피 이미지, 세 단계 흐름, 무네트워크 동작을 보호하는 브라우저 테스트.

- [ ] **Step 1: Replace dynamic Reflect tests with one failing fixed-demo test**

```ts
test("shows the fixed Happy reflection without calling the reflection api", async ({ page }) => {
  let reflectRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/reflect")) reflectRequests += 1;
  });
  // Complete a video job using the existing job mocks.
  await page.getByRole("button", { name: "한 달의 기억 돌아보기" }).click();
  await expect(page.getByText("기억의 흐름을 살펴보고 있어요...")).toBeVisible();
  await expect(page.getByText("최근 반려견 해피와 함께 하는 시간이 줄었네요")).toBeVisible();
  await expect(page.getByText("해피와 함께 나들이 하는 시간을 가져보면 어떨까요?")).toBeVisible();
  await expect(page.getByText("Evidence", { exact: true })).toHaveCount(0);
  await expect(page.getByText("과거를 기억한다")).toBeVisible();
  await expect(page.getByText("지금의 삶을 돌아본다")).toBeVisible();
  await expect(page.getByText("더 나은 선택을 제안한다")).toBeVisible();
  expect(reflectRequests).toBe(0);
});
```

기존 네트워크 성공 테스트와 네트워크 재시도 테스트는 이 고정 데모 계약 테스트로 대체한다. 테스트는 완성 영상이 DOM에 남고 URL이 `/create`인 것도 확인한다.

- [ ] **Step 2: Run the fixed-demo test and verify RED**

Run: `PLAYWRIGHT_PORT=8081 npx playwright test e2e/video-demo.spec.ts --grep "fixed Happy"`

Expected: FAIL because the current UI still calls `/reflect` and renders dynamic Evidence/Favorite Memory content.

- [ ] **Step 3: Commit the RED contract test with the implementation task**

테스트는 다음 작업의 UI 변경과 함께 GREEN 상태로 커밋한다.

### Task 2: Local Fixed Reflect UI

**Files:**
- Modify: `src/components/video/ReflectExperience.tsx`
- Modify: `src/styles.css`
- Modify: `e2e/video-demo.spec.ts`

**Interfaces:**
- Consumes: `jobId`, optional `prompt`, `rememberCompletedJob`.
- Produces: `idle → loading → success` local state transition with fixed Reflect content.

- [ ] **Step 1: Replace network state with an 800ms local timer**

```tsx
type ReflectState = "idle" | "loading" | "success";

const timerRef = useRef<number | null>(null);

useEffect(() => {
  rememberCompletedJob(jobId, prompt);
  return () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  };
}, [jobId, prompt]);

const reflect = () => {
  setState("loading");
  timerRef.current = window.setTimeout(() => {
    timerRef.current = null;
    setState("success");
  }, 800);
};
```

Remove `generateReflection`, `findMemory`, `ReflectionResult`, network error, retry, Evidence, and dynamic Favorite Memory rendering from this component. Do not remove the underlying API or data modules.

- [ ] **Step 2: Render the fixed slide-aligned result**

```tsx
<section className="reflect-panel reflect-panel--happy" aria-labelledby="reflect-title">
  <div className="reflect-happy-copy">
    <p className="eyebrow">LIFE INSIGHT</p>
    <h2 id="reflect-title">최근 반려견 해피와 함께 하는 시간이 줄었네요</h2>
    <p className="reflect-happy-suggestion">
      “해피와 함께 나들이 하는 시간을 가져보면 어떨까요?”
    </p>
  </div>
  <ol className="reflect-journey">
    <li><strong>Remember</strong><span>과거를 기억한다</span></li>
    <li><strong>Reflect</strong><span>지금의 삶을 돌아본다</span></li>
    <li><strong>Tomorrow</strong><span>더 나은 선택을 제안한다</span></li>
  </ol>
</section>
```

- [ ] **Step 3: Replace dynamic Reflect CSS with fixed desktop/mobile layout**

Desktop uses a full-width insight card and a three-column journey row. Mobile keeps the insight full width and stacks the journey items. Preserve the existing cream/brown visual system and keep the finished video above the panel.

- [ ] **Step 4: Run the fixed-demo browser test and verify GREEN**

Run: `PLAYWRIGHT_PORT=8081 npx playwright test e2e/video-demo.spec.ts --grep "fixed Happy"`

Expected: PASS with the exact fixed copy, no Evidence, no `/reflect` request, completed video still attached, and URL unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/video/ReflectExperience.tsx src/styles.css e2e/video-demo.spec.ts
git commit -m "feat: align reflect demo with Happy story"
```

### Task 3: Regression Verification

**Files:**
- Modify only if verification uncovers a defect in files changed by Task 2.

**Interfaces:**
- Confirms the fixed Reflect demo and existing video pipeline coexist.

- [ ] **Step 1: Run all Python tests**

Run: `python3 -m unittest discover -s modal_backend -p 'test_*.py' -v`

Expected: 32 tests pass with zero failures.

- [ ] **Step 2: Run all browser tests**

Run: `PLAYWRIGHT_PORT=8081 npx playwright test`

Expected: existing upload, 60-video limit, job completion, playback retry, download, failure recovery, and fixed Happy Reflect tests all pass.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: zero errors; the six pre-existing Fast Refresh warnings may remain.

- [ ] **Step 4: Run production build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 5: Inspect repository boundary and stop before deployment**

Run: `git status --short --branch` and inspect the diff from the plan commit. Confirm that server files, `/jobs`, `create.tsx`, `ResultPlayer.tsx`, job polling, playback, and download were not changed. Do not push or deploy without a separate user request.
