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
    /\/jobs\/job-demo\/result$/,
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
