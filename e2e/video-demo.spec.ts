import { expect, test } from "../playwright-fixture";

test("creates a video job and shows the finished result", async ({ page }) => {
  await page.route("**/jobs", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ job_id: "job-demo" }),
    });
  });

  await page.route("**/jobs/job-demo**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/result")) {
      await route.fulfill({
        status: 200,
        contentType: "video/mp4",
        headers: url.searchParams.has("download")
          ? { "Content-Disposition": 'attachment; filename="my-tiny-cute-video.mp4"' }
          : undefined,
        body: Buffer.from("finished-video"),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: "job-demo",
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
  await expect(page.locator("main[data-hydrated='true']")).toBeVisible();
  await page.getByLabel("영상 파일").setInputFiles({
    name: "summer.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo-video"),
  });
  await page
    .getByLabel("영상에 담고 싶은 이야기")
    .fill("여름날 가족 여행의 따뜻한 순간을 모아줘");
  await page.getByRole("button", { name: "영상 만들기" }).click();

  await expect(page.getByText("영상이 완성됐어요")).toBeVisible();
  await expect(page.locator(".result-frame video")).toHaveAttribute(
    "src",
    /\/jobs\/job-demo\/result\?playback=0-\d+$/,
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "MP4 다운로드" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("my-tiny-cute-video.mp4");
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByText("영상이 완성됐어요")).toBeVisible();

  await page.reload();
  await expect(page.locator("main[data-hydrated='true']")).toBeVisible();
  await expect(page.getByText("영상이 완성됐어요")).toBeVisible();
});

test("retries a result that is temporarily unavailable without leaving the page", async ({
  page,
}) => {
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
      await route.fulfill({ status: 404, body: "not committed yet" });
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
  await expect(page.locator("main[data-hydrated='true']")).toBeVisible();
  await page.getByLabel("영상 파일").setInputFiles({
    name: "memory.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo-video"),
  });
  await page
    .getByLabel("영상에 담고 싶은 이야기")
    .fill("함께한 여름날의 따뜻한 추억 영상으로 만들어줘");
  await page.getByRole("button", { name: "영상 만들기" }).click();

  await expect(page.getByText("영상 불러오는 중...")).toBeVisible();
  await expect.poll(() => resultRequests).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".result-frame video")).toHaveAttribute(
    "src",
    /playback=0-1$/,
  );
  await expect(page).toHaveURL(/\/create$/);
});

test("offers an in-page retry after automatic playback retries fail", async ({
  page,
}) => {
  let resultRequests = 0;
  await page.route("**/jobs", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ job_id: "job-playback-failed" }),
    });
  });
  await page.route("**/jobs/job-playback-failed**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/result")) {
      resultRequests += 1;
      await route.fulfill({ status: 404, body: "not committed yet" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: "job-playback-failed",
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
  await expect(page.locator("main[data-hydrated='true']")).toBeVisible();
  await page.clock.install();
  await page.getByLabel("영상 파일").setInputFiles({
    name: "memory.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo-video"),
  });
  await page
    .getByLabel("영상에 담고 싶은 이야기")
    .fill("함께한 여름날의 따뜻한 추억 영상으로 만들어줘");
  await page.getByRole("button", { name: "영상 만들기" }).click();

  const video = page.locator(".result-frame video");
  const delays = [1000, 2000, 3000, 5000, 8000, 12000];
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    await expect.poll(() => resultRequests).toBe(attempt + 1);
    await page.clock.fastForward(delays[attempt]);
    await expect(video).toHaveAttribute(
      "src",
      new RegExp(`playback=0-${attempt + 1}$`),
    );
  }
  await expect.poll(() => resultRequests).toBe(delays.length + 1);
  await expect(page.getByText("영상을 불러오지 못했습니다.")).toBeVisible();

  await page.getByRole("button", { name: "영상 다시 불러오기" }).click();
  await expect(video).toHaveAttribute("src", /playback=1-0$/);
  await expect(page.getByText("영상 불러오는 중...")).toBeVisible();
  await expect(page).toHaveURL(/\/create$/);
});

test("keeps the result visible when download failure occurs", async ({ page }) => {
  await page.route("**/jobs", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ job_id: "job-download-failed" }),
    });
  });

  await page.route("**/jobs/job-download-failed**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/result") && url.searchParams.has("download")) {
      await route.fulfill({ status: 500, body: "download failed" });
      return;
    }
    if (url.pathname.endsWith("/result")) {
      await route.fulfill({
        status: 200,
        contentType: "video/mp4",
        body: Buffer.from("finished-video"),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: "job-download-failed",
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
  await expect(page.locator("main[data-hydrated='true']")).toBeVisible();
  await page.getByLabel("영상 파일").setInputFiles({
    name: "summer.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo-video"),
  });
  await page
    .getByLabel("영상에 담고 싶은 이야기")
    .fill("여름날 가족 여행의 따뜻한 순간을 모아줘");
  await page.getByRole("button", { name: "영상 만들기" }).click();

  await expect(page.getByText("영상이 완성됐어요")).toBeVisible();
  await page.getByRole("button", { name: "MP4 다운로드" }).click();
  await expect(page.getByText("영상 다운로드에 실패했습니다.")).toBeVisible();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByText("영상이 완성됐어요")).toBeVisible();
});

test("landing is public and opens the video creator", async ({ page }) => {
  await page.goto("/");

  const favicon = page.locator('link[rel="icon"][type="image/png"]');
  await expect(favicon).toHaveAttribute("href", /favicon.*\.png$/);
  await expect(
    page.getByRole("heading", { name: "My Tiny Cute Video" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "시작하기" })).toHaveAttribute(
    "href",
    "/create",
  );
  await expect(page.getByText("로그인")).toHaveCount(0);
  await expect(page.getByText("회원가입")).toHaveCount(0);
});

test("rejects unsupported files and keeps an empty prompt disabled", async ({
  page,
}) => {
  await page.goto("/create");
  await expect(page.locator("main[data-hydrated='true']")).toBeVisible();

  await page.getByLabel("영상 파일").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a video"),
  });
  await expect(page.getByText("지원하지 않는 파일 형식입니다")).toBeVisible();

  await page.getByLabel("영상 파일").setInputFiles({
    name: "memory.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo-video"),
  });
  await expect(page.getByRole("button", { name: "영상 만들기" })).toBeDisabled();
});

test("accepts sixty videos and rejects sixty one", async ({ page }) => {
  const videoFiles = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      name: `memory-${index.toString().padStart(2, "0")}.mp4`,
      mimeType: "video/mp4",
      buffer: Buffer.from("demo-video"),
    }));

  await page.goto("/create");
  await expect(page.locator("main[data-hydrated='true']")).toBeVisible();

  await page.getByLabel("영상 파일").setInputFiles(videoFiles(60));
  await expect(page.getByText("60개의 순간")).toBeVisible();
  await page
    .getByLabel("영상에 담고 싶은 이야기")
    .fill("여러 순간을 하나의 따뜻한 기억으로 만들어줘");
  await expect(page.getByRole("button", { name: "영상 만들기" })).toBeEnabled();

  await page.getByLabel("영상 파일").setInputFiles(videoFiles(61));
  await expect(page.getByText("영상은 최대 60개까지 선택할 수 있어요")).toBeVisible();
});

test("shows a restart action when video generation fails", async ({ page }) => {
  await page.route("**/jobs", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ job_id: "job-failed" }),
    });
  });
  await page.route("**/jobs/job-failed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: "job-failed",
        state: "failed",
        stage: "render",
        events: [],
        next: 0,
        done: true,
        error: "렌더링 중 문제가 생겼습니다.",
      }),
    });
  });

  await page.goto("/create");
  await expect(page.locator("main[data-hydrated='true']")).toBeVisible();
  await page.getByLabel("영상 파일").setInputFiles({
    name: "memory.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo-video"),
  });
  await page
    .getByLabel("영상에 담고 싶은 이야기")
    .fill("친구들과 함께한 하루를 경쾌하게 만들어줘");
  await page.getByRole("button", { name: "영상 만들기" }).click();

  await expect(page.getByText("영상 생성에 실패했습니다")).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시작" })).toBeVisible();
});

test("reflects on memories without changing the completed video pipeline", async ({
  page,
}) => {
  await page.route("**/jobs", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ job_id: "job-reflect" }),
    });
  });
  await page.route("**/jobs/job-reflect**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/result")) {
      await route.fulfill({
        status: 200,
        contentType: "video/mp4",
        body: Buffer.from("finished-video"),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: "job-reflect",
        state: "completed",
        stage: "done",
        events: [],
        next: 0,
        done: true,
        error: null,
      }),
    });
  });
  await page.route("**/reflect", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        observation: "최근에는 친구들과 야외에서 보낸 시간이 조금 줄었어요.",
        evidence: ["이전 2주 3회 · 최근 2주 0회"],
        suggestion: "이번 주에는 다시 함께 걸어볼까요?",
        featuredMemoryId: "friends-river",
        source: "llm",
      }),
    });
  });

  await page.goto("/create");
  await expect(page.locator("main[data-hydrated='true']")).toBeVisible();
  await page.getByLabel("영상 파일").setInputFiles({
    name: "friends.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo-video"),
  });
  await page
    .getByLabel("영상에 담고 싶은 이야기")
    .fill("친구들과 보낸 여름 오후를 따뜻하게 기억해줘");
  await page.getByRole("button", { name: "영상 만들기" }).click();

  await expect(page.getByText("영상이 완성됐어요")).toBeVisible();
  await page.getByRole("button", { name: "한 달의 기억 돌아보기" }).click();

  await expect(page.getByText("Life Insight")).toBeVisible();
  await expect(
    page.getByText("최근에는 친구들과 야외에서 보낸 시간이 조금 줄었어요."),
  ).toBeVisible();
  await expect(page.getByText("이전 2주 3회 · 최근 2주 0회")).toBeVisible();
  await expect(page.getByText("이번 주에는 다시 함께 걸어볼까요?")).toBeVisible();
  await expect(page.getByText("강가에서 웃던 오후")).toBeVisible();
  await expect(page.getByText("영상이 완성됐어요")).toBeVisible();
  await expect(page.locator(".result-frame video")).toBeAttached();
  await expect(page).toHaveURL(/\/create$/);
});

test("retries reflection failure while keeping the finished video visible", async ({
  page,
}) => {
  let reflectAttempts = 0;
  await page.route("**/jobs", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ job_id: "job-reflect-retry" }),
    });
  });
  await page.route("**/jobs/job-reflect-retry**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/result")) {
      await route.fulfill({
        status: 200,
        contentType: "video/mp4",
        body: Buffer.from("finished-video"),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        job_id: "job-reflect-retry",
        state: "completed",
        stage: "done",
        events: [],
        next: 0,
        done: true,
        error: null,
      }),
    });
  });
  await page.route("**/reflect", async (route) => {
    reflectAttempts += 1;
    if (reflectAttempts === 1) {
      await route.fulfill({ status: 503, body: "temporarily unavailable" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        observation: "최근 일상의 작은 순간들이 차분히 쌓이고 있어요.",
        evidence: ["최근 2주 3회"],
        suggestion: "내일도 한 장면을 천천히 남겨볼까요?",
        featuredMemoryId: "recent-window",
        source: "fallback",
      }),
    });
  });

  await page.goto("/create");
  await expect(page.locator("main[data-hydrated='true']")).toBeVisible();
  await page.getByLabel("영상 파일").setInputFiles({
    name: "daily.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo-video"),
  });
  await page
    .getByLabel("영상에 담고 싶은 이야기")
    .fill("평범한 하루의 작은 순간을 기억해줘");
  await page.getByRole("button", { name: "영상 만들기" }).click();
  await expect(page.getByText("영상이 완성됐어요")).toBeVisible();

  await page.getByRole("button", { name: "한 달의 기억 돌아보기" }).click();
  await expect(page.getByText("기억을 돌아보지 못했습니다.")).toBeVisible();
  await expect(page.getByText("영상이 완성됐어요")).toBeVisible();
  await page.getByRole("button", { name: "다시 분석하기" }).click();

  await expect(
    page.getByText("최근 일상의 작은 순간들이 차분히 쌓이고 있어요."),
  ).toBeVisible();
  await expect(page.locator(".result-frame video")).toBeAttached();
  await expect(page).toHaveURL(/\/create$/);
});
