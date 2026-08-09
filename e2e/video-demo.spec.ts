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
