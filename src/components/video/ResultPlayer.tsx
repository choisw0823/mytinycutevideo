import { Download, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { downloadJobResult, getJobResultUrl } from "@/lib/modal-api";
import type { VideoJobEvent } from "@/types/video-job";

function formatDuration(seconds?: number) {
  if (!seconds) return null;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function ResultPlayer({
  jobId,
  events,
  onRestart,
}: {
  jobId: string;
  events: VideoJobEvent[];
  onRestart: () => void;
}) {
  const finalEvent = [...events]
    .reverse()
    .find((event) => event.video || event.duration || event.size_mb);
  const duration = formatDuration(finalEvent?.duration);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

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

  return (
    <section className="result-card" aria-labelledby="result-title">
      <span className="result-sparkle" aria-hidden="true"><Sparkles size={22} /></span>
      <p className="eyebrow">YOUR LITTLE FILM IS READY</p>
      <h1 id="result-title">영상이 완성됐어요</h1>
      <p>흩어져 있던 순간들이 이제 한 편의 기억이 되었어요.</p>

      <div className="result-frame">
        <video src={getJobResultUrl(jobId)} controls playsInline preload="metadata">
          브라우저에서 영상을 재생할 수 없습니다.
        </video>
      </div>

      {(duration || finalEvent?.size_mb) && (
        <p className="result-meta">
          {duration && <span>길이 {duration}</span>}
          {finalEvent?.size_mb && <span>{finalEvent.size_mb.toFixed(1)} MB</span>}
        </p>
      )}

      <div className="result-actions">
        <button
          type="button"
          className="primary-action"
          onClick={() => void handleDownload()}
          disabled={downloading}
        >
          <Download size={18} /> {downloading ? "다운로드 중..." : "MP4 다운로드"}
        </button>
        <button type="button" className="secondary-action" onClick={onRestart}>
          <RotateCcw size={17} /> 새 영상 만들기
        </button>
      </div>
      {downloadError && (
        <p className="result-download-error" role="alert">
          {downloadError}
        </p>
      )}
    </section>
  );
}
