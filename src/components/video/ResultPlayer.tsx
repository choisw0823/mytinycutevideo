import { Download, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { downloadJobResult, getJobResultUrl } from "@/lib/modal-api";
import type { VideoJobEvent } from "@/types/video-job";
import { ReflectExperience } from "@/components/video/ReflectExperience";

const RETRY_DELAYS_MS = [1000, 2000, 3000, 5000, 8000, 12000];
type PlaybackState = "loading" | "ready" | "failed";

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
  prompt,
}: {
  jobId: string;
  events: VideoJobEvent[];
  onRestart: () => void;
  prompt?: string;
}) {
  const finalEvent = [...events]
    .reverse()
    .find((event) => event.video || event.duration || event.size_mb);
  const duration = formatDuration(finalEvent?.duration);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("loading");
  const [playbackAttempt, setPlaybackAttempt] = useState(0);
  const [playbackRevision, setPlaybackRevision] = useState(0);
  const retryTimer = useRef<number | null>(null);
  const resultUrl = `${getJobResultUrl(jobId)}?playback=${playbackRevision}-${playbackAttempt}`;

  const clearRetryTimer = () => {
    if (retryTimer.current !== null) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  };

  useEffect(() => {
    setPlaybackState("loading");
    setPlaybackAttempt(0);
    setPlaybackRevision(0);
    return clearRetryTimer;
  }, [jobId]);

  const handlePlaybackReady = () => {
    clearRetryTimer();
    setPlaybackState("ready");
  };

  const handlePlaybackError = () => {
    if (retryTimer.current !== null || playbackState === "failed") return;
    if (playbackAttempt >= RETRY_DELAYS_MS.length) {
      setPlaybackState("failed");
      return;
    }

    setPlaybackState("loading");
    retryTimer.current = window.setTimeout(() => {
      retryTimer.current = null;
      setPlaybackAttempt((current) => current + 1);
    }, RETRY_DELAYS_MS[playbackAttempt]);
  };

  const retryPlayback = () => {
    clearRetryTimer();
    setPlaybackState("loading");
    setPlaybackAttempt(0);
    setPlaybackRevision((current) => current + 1);
  };

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
        {playbackState === "loading" && (
          <p className="result-video-status" role="status">
            영상 불러오는 중...
          </p>
        )}
        {playbackState === "failed" && (
          <div className="result-video-status" role="alert">
            <p>영상을 불러오지 못했습니다.</p>
            <button type="button" onClick={retryPlayback}>
              영상 다시 불러오기
            </button>
          </div>
        )}
        <video
          key={resultUrl}
          src={resultUrl}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={handlePlaybackReady}
          onError={handlePlaybackError}
        >
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
      <ReflectExperience jobId={jobId} prompt={prompt} />
    </section>
  );
}
