import type { VideoJobStatus } from "@/types/video-job";

const baseUrl = () =>
  (import.meta.env.VITE_MODAL_API_URL || "").replace(/\/$/, "");

async function responseMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { detail?: string; error?: string };
    return body.detail || body.error || fallback;
  } catch {
    return fallback;
  }
}

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
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onerror = () => reject(new Error("영상 업로드에 실패했습니다."));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        try {
          const body = JSON.parse(xhr.responseText) as {
            detail?: string;
            error?: string;
          };
          reject(
            new Error(
              body.detail || body.error || "영상 작업을 시작하지 못했습니다.",
            ),
          );
        } catch {
          reject(new Error("영상 작업을 시작하지 못했습니다."));
        }
        return;
      }

      try {
        resolve(JSON.parse(xhr.responseText) as { job_id: string });
      } catch {
        reject(new Error("서버 응답을 읽지 못했습니다."));
      }
    };
    xhr.send(body);
  });
}

export async function getVideoJobStatus(
  jobId: string,
  since: number,
): Promise<VideoJobStatus> {
  const response = await fetch(`${baseUrl()}/jobs/${jobId}?since=${since}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await responseMessage(response, "진행 상태를 확인하지 못했습니다."),
    );
  }
  return response.json() as Promise<VideoJobStatus>;
}

export const getJobAssetUrl = (jobId: string, path: string) =>
  `${baseUrl()}/jobs/${jobId}/files/${path}`;

export const getJobResultUrl = (jobId: string) =>
  `${baseUrl()}/jobs/${jobId}/result`;

export const getJobDownloadUrl = (jobId: string) =>
  `${getJobResultUrl(jobId)}?download=1`;

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
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
