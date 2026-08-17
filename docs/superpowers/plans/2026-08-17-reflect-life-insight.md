# Reflect Life Insight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 완성된 영상 아래에서 최근 28일의 데모 기억을 근거로 회고 문장과 다음 행동 제안을 같은 화면에 보여준다.

**Architecture:** 기존 `/jobs` 업로드·폴링·렌더링·결과 API와 작업 상태는 변경하지 않는다. Reflect는 브라우저 로컬 기억 저장소, 독립적인 `/reflect` API, 순수 통계 분석 모듈, 완료 카드 안의 독립 UI로 추가한다. LLM은 통계 결과를 문장으로 바꾸는 역할만 하며 실패하면 같은 통계에서 만든 기본 응답을 반환한다.

**Tech Stack:** React 19, TypeScript, browser localStorage, FastAPI, Python 3.11, OpenAI Python SDK, unittest, Playwright

## Global Constraints

- 기존 업로드→생성→저장→재생 파이프라인의 함수, API 계약, 작업 상태 전환을 변경하지 않는다.
- Reflect 요청은 기존 렌더 워커와 별개이며 영상 파일이나 썸네일을 LLM에 전송하지 않는다.
- 최근 28일을 이전 14일과 최근 14일로 비교한다.
- 브라우저에는 최대 60개 기억만 저장하고 서버도 최대 60개만 받는다.
- 로그인, 서버 영구 저장소, 얼굴 인식, 벡터 검색은 추가하지 않는다.
- Reflect 로딩·결과·실패는 `/create` 안에 표시하고 완성 영상은 계속 재생 가능해야 한다.
- LLM 오류는 통계 기반 대체 응답으로 처리한다.
- Git 원격 반영과 실제 배포는 별도 승인 없이 실행하지 않는다.

---

### Task 1: Deterministic Reflection Analysis

**Files:**
- Create: `modal_backend/test_reflect_utils.py`
- Create: `modal_backend/reflect_utils.py`

**Interfaces:**
- Consumes: camelCase `MemoryRecord` dictionaries and optional timezone-aware `now`.
- Produces: `analyze_memories(memories, now)`, `fallback_reflection(analysis)`, `merge_llm_reflection(analysis, payload)`, and `build_llm_prompt(analysis)`.

- [ ] **Step 1: Write failing period and category tests**

```python
def test_selects_largest_decrease_and_featured_memory(self):
    analysis = analyze_memories(self.memories, now=self.now)
    self.assertEqual(analysis["category"], "friends")
    self.assertEqual(analysis["previous_count"], 3)
    self.assertEqual(analysis["recent_count"], 0)
    self.assertEqual(analysis["featured_memory_id"], "friends-best")

def test_uses_recent_category_when_nothing_decreased(self):
    analysis = analyze_memories(self.recent_only, now=self.now)
    self.assertEqual(analysis["mode"], "frequent")
```

- [ ] **Step 2: Run tests and verify RED**

Run: `python3 -m unittest modal_backend.test_reflect_utils -v`

Expected: FAIL because `modal_backend.reflect_utils` does not exist.

- [ ] **Step 3: Implement the minimal deterministic analyzer**

```python
def analyze_memories(memories, now=None):
    current = now or datetime.now(timezone.utc)
    previous_start = current - timedelta(days=28)
    recent_start = current - timedelta(days=14)
    # Parse valid in-window records, count known categories in each period,
    # choose the largest decrease or most frequent recent category, then
    # choose importance-desc/date-desc featured memory.
```

- [ ] **Step 4: Add failing fallback and LLM-normalization tests**

```python
def test_llm_cannot_replace_computed_evidence_or_featured_memory(self):
    result = merge_llm_reflection(self.analysis, {
        "observation": "따뜻한 관찰",
        "suggestion": "이번 주에 다시 만나볼까요?",
        "evidence": ["invented"],
        "featuredMemoryId": "invented",
    })
    self.assertEqual(result["evidence"], self.analysis["evidence"])
    self.assertEqual(result["featuredMemoryId"], "friends-best")

def test_invalid_llm_text_uses_fallback(self):
    self.assertEqual(merge_llm_reflection(self.analysis, {}), fallback_reflection(self.analysis))
```

- [ ] **Step 5: Implement fallback, prompt, and normalization**

```python
def merge_llm_reflection(analysis, payload):
    observation = payload.get("observation")
    suggestion = payload.get("suggestion")
    if not valid_short_text(observation) or not valid_short_text(suggestion):
        return fallback_reflection(analysis)
    return {
        "observation": observation.strip(),
        "evidence": analysis["evidence"],
        "suggestion": suggestion.strip(),
        "featuredMemoryId": analysis["featured_memory_id"],
        "source": "llm",
    }
```

- [ ] **Step 6: Run analysis tests and verify GREEN**

Run: `python3 -m unittest modal_backend.test_reflect_utils -v`

Expected: all reflection analysis tests pass.

- [ ] **Step 7: Commit**

```bash
git add modal_backend/reflect_utils.py modal_backend/test_reflect_utils.py
git commit -m "feat: add grounded reflection analysis"
```

### Task 2: Independent Reflect API

**Files:**
- Modify: `modal_backend/test_reflect_utils.py`
- Modify: `modal_backend/modal_app.py`

**Interfaces:**
- Consumes: `POST /reflect` body `{ "memories": MemoryRecord[] }` with 1–60 items.
- Produces: `ReflectionResult` JSON with `observation`, computed `evidence`, `suggestion`, `featuredMemoryId`, and `source`.

- [ ] **Step 1: Add a failing deployment-boundary test**

```python
def test_reflect_dependency_is_only_added_to_api_image(self):
    source = Path("modal_backend/modal_app.py").read_text()
    api_section, render_section = source.split("render_image =", 1)
    self.assertIn('.pip_install("fastapi[standard]", "openai")', api_section)
    self.assertIn('@web.post("/reflect")', source)
```

- [ ] **Step 2: Run the boundary test and verify RED**

Run: `python3 -m unittest modal_backend.test_reflect_utils.ReflectApiBoundaryTests -v`

Expected: FAIL because the API image and route do not yet contain Reflect.

- [ ] **Step 3: Add validated request models and the endpoint without changing job routes**

```python
class ReflectRequest(BaseModel):
    memories: list[ReflectMemory] = Field(min_length=1, max_length=60)

@web.post("/reflect")
async def reflect(request: ReflectRequest):
    analysis = analyze_memories(
        [memory.model_dump(by_alias=True) for memory in request.memories]
    )
    fallback = fallback_reflection(analysis)
    try:
        payload = await run_in_threadpool(call_reflection_llm, analysis)
        return merge_llm_reflection(analysis, payload)
    except Exception:
        traceback.print_exc()
        return fallback
```

`call_reflection_llm`은 `OPENAI_API_KEY`, 선택적 `OPENAI_BASE_URL`, 기본 모델 `gpt-5-mini`를 사용하고 JSON 객체만 요청한다. 기존 `render_job`, `/jobs`, `/jobs/{job_id}`, 파일 및 결과 라우트는 수정하지 않는다.

- [ ] **Step 4: Run all Python tests and verify GREEN**

Run: `python3 -m unittest discover -s modal_backend -p 'test_*.py' -v`

Expected: 기존 19개 테스트와 새 Reflect 테스트가 모두 통과한다.

- [ ] **Step 5: Commit**

```bash
git add modal_backend/modal_app.py modal_backend/test_reflect_utils.py
git commit -m "feat: expose independent reflect api"
```

### Task 3: Browser Memory Store and Reflect Client

**Files:**
- Create: `src/types/reflection.ts`
- Create: `src/data/demo-memories.ts`
- Create: `src/lib/memory-store.ts`
- Modify: `src/lib/modal-api.ts`
- Modify: `e2e/video-demo.spec.ts`

**Interfaces:**
- Produces: `MemoryRecord`, `ReflectionResult`, `createDemoMemories(now)`, `getMemories()`, `rememberCompletedJob(jobId, prompt)`, and `generateReflection(memories)`.
- Storage key: `my-tiny-cute-video-memories-v1`.

- [ ] **Step 1: Add a failing browser test for the Reflect request**

```ts
test("reflects on memories without changing the completed video pipeline", async ({ page }) => {
  // Mock the existing job completion exactly as the regression test does.
  await page.route("**/reflect", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      observation: "최근에는 친구들과 야외에서 보낸 시간이 조금 줄었어요.",
      evidence: ["이전 2주 3회 · 최근 2주 0회"],
      suggestion: "이번 주에는 다시 함께 걸어볼까요?",
      featuredMemoryId: "friends-river",
      source: "llm",
    }),
  }));
  // Complete a job, click the future Reflect button, and assert URL remains /create.
});
```

- [ ] **Step 2: Run the new browser test and verify RED**

Run: `npx playwright test e2e/video-demo.spec.ts --grep "reflects on memories"`

Expected: FAIL because the Reflect button does not exist.

- [ ] **Step 3: Add types, relative-date demo records, safe local storage, and API client**

```ts
export async function generateReflection(
  memories: MemoryRecord[],
): Promise<ReflectionResult> {
  const response = await fetch(`${baseUrl()}/reflect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memories }),
  });
  if (!response.ok) {
    throw new Error(await responseMessage(response, "기억을 돌아보지 못했습니다."));
  }
  return response.json() as Promise<ReflectionResult>;
}
```

`rememberCompletedJob`은 같은 `sourceJobId`가 있으면 아무것도 추가하지 않고, 새 기억을 추가한 뒤 최신 60개만 보존한다. JSON 파싱이나 구조 검증이 실패하면 상대 날짜 데모 기록으로 초기화한다.

- [ ] **Step 4: Run type-aware build to catch contract errors**

Run: `npm run build`

Expected: build succeeds before UI wiring; unused exports are allowed by the current configuration.

- [ ] **Step 5: Commit**

```bash
git add src/types/reflection.ts src/data/demo-memories.ts src/lib/memory-store.ts src/lib/modal-api.ts e2e/video-demo.spec.ts
git commit -m "feat: add browser reflection data client"
```

### Task 4: In-Page Reflect Experience

**Files:**
- Create: `src/components/video/ReflectExperience.tsx`
- Modify: `src/components/video/ResultPlayer.tsx`
- Modify: `src/routes/create.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `jobId`, optional `prompt`, browser memories, and `generateReflection`.
- Produces: idle, loading, success, and network-error UI rendered below the completed video.

- [ ] **Step 1: Implement the smallest UI that satisfies the already-failing browser test**

```tsx
export function ReflectExperience({ jobId, prompt }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<ReflectionResult | null>(null);

  useEffect(() => {
    rememberCompletedJob(jobId, prompt);
  }, [jobId, prompt]);

  const reflect = async () => {
    setState("loading");
    try {
      setResult(await generateReflection(getMemories()));
      setState("success");
    } catch {
      setState("error");
    }
  };
  // Render button, spinner, insight/evidence/suggestion/featured card, and retry.
}
```

`ResultPlayer`에는 `<ReflectExperience jobId={jobId} prompt={prompt} />`만 추가한다. `create.tsx`는 기존 `ResultPlayer`에 현재 prompt를 전달하는 것 외에 화면 상태, 폴링, 업로드, 재시작 로직을 변경하지 않는다.

- [ ] **Step 2: Run the new browser test and verify GREEN**

Run: `npx playwright test e2e/video-demo.spec.ts --grep "reflects on memories"`

Expected: insight, evidence, suggestion, featured memory, completed video가 `/create`에 함께 보인다.

- [ ] **Step 3: Add a failing network retry test**

```ts
test("retries reflection failure while keeping the finished video visible", async ({ page }) => {
  // First /reflect response is 503, second is 200.
  // Assert error and retry button, then successful insight and existing video.
});
```

- [ ] **Step 4: Implement retry/error copy and memory-style presentation CSS**

로딩은 회전 아이콘과 `기억의 흐름을 살펴보고 있어요...`, 실패는 `기억을 돌아보지 못했습니다.`와 `다시 분석하기` 버튼을 표시한다. 성공 결과는 Life Insight, Evidence, Tomorrow, Favorite Memory 레이블을 갖는 반응형 카드로 표현한다.

- [ ] **Step 5: Run both Reflect browser tests and verify GREEN**

Run: `npx playwright test e2e/video-demo.spec.ts --grep "reflect|reflection"`

Expected: success and retry paths both pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/video/ReflectExperience.tsx src/components/video/ResultPlayer.tsx src/routes/create.tsx src/styles.css e2e/video-demo.spec.ts
git commit -m "feat: show reflect insight below completed video"
```

### Task 5: Regression and Release Verification

**Files:**
- Modify only if verification uncovers a defect in the files introduced above.

**Interfaces:**
- Confirms that all old job pipeline behavior and new Reflect behavior coexist.

- [ ] **Step 1: Run all Python tests**

Run: `python3 -m unittest discover -s modal_backend -p 'test_*.py' -v`

Expected: zero failures.

- [ ] **Step 2: Run all browser regression tests**

Run: `npx playwright test`

Expected: existing upload, 60-file limit, processing completion, playback retry, download, failure tests and new Reflect tests all pass.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: zero errors.

- [ ] **Step 4: Run production build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 5: Inspect the exact diff and pipeline boundary**

Run: `git diff HEAD~4 -- modal_backend/modal_app.py src/routes/create.tsx src/components/video/ResultPlayer.tsx`

Confirm that `render_job`, `create_job`, polling logic, completed-state transition, result playback, and download behavior are unchanged except for additive Reflect wiring.

- [ ] **Step 6: Stop before deployment**

Report verified commands and changed files. Do not push `main`, deploy the API, or trigger frontend deployment until the user explicitly requests it.
