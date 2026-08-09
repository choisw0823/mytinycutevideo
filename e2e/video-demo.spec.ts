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
