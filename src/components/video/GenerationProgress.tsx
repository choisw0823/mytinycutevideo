import { Check, Clock3, LoaderCircle } from "lucide-react";
import { getJobAssetUrl } from "@/lib/modal-api";
import type { VideoJobEvent } from "@/types/video-job";

const STAGES = [
  ["extract", "압축을 풀고 있어요"],
  ["normalize", "영상을 고르게 다듬고 있어요"],
  ["scenes", "장면의 경계를 찾고 있어요"],
  ["caption", "순간마다 이야기를 읽고 있어요"],
  ["episode", "기억의 순서를 엮고 있어요"],
  ["assemble", "작은 장면들을 이어 붙이고 있어요"],
  ["render", "마지막 필름을 현상하고 있어요"],
] as const;




const STAGE_ALIASES: Record<string, string> = {
  unzip: "extract",
  prepare: "normalize",
  scene: "scenes",
  split: "scenes",
  captions: "caption",
  dialogue: "caption",
  episodes: "episode",
  compose: "assemble",
  final: "render",
  done: "render",
};

function normalizedStage(stage: string) {
  const lower = stage.toLowerCase();
  return STAGE_ALIASES[lower] || lower;
}

export function GenerationProgress({
  jobId,
  stage,
  events,
  uploadProgress,
  uploading,
}: {
  jobId: string | null;
  stage: string;
  events: VideoJobEvent[];
  uploadProgress: number;
  uploading: boolean;
}) {
  const currentStage = normalizedStage(stage);
  const currentIndex = Math.max(
    0,
    STAGES.findIndex(([stageName]) => stageName === currentStage),
  );
  const latestEvent = [...events].reverse().find((event) => event.stage === stage);
  const stagePercent = latestEvent?.total
    ? Math.min(100, Math.round(((latestEvent.progress ?? 0) / latestEvent.total) * 100))
    : null;
  const memories = events.filter(
    (event) => event.thumb || event.caption || event.dialogue,
  );

  return (
    <section className="progress-card" aria-live="polite">
      <div className="film-loader" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <p className="eyebrow">YOUR MEMORY IS DEVELOPING</p>
      <h1>{uploading ? "순간들을 옮기고 있어요" : STAGES[currentIndex][1]}</h1>
      <p className="progress-message">
        {uploading
          ? `업로드 ${uploadProgress}%`
          : latestEvent?.msg || "잠시만 기다려 주세요. 기억이 한 편의 이야기로 모이고 있어요."}
      </p>

      {uploading ? (
        <div className="upload-meter" aria-label={`업로드 ${uploadProgress}%`}>
          <span style={{ width: `${uploadProgress}%` }} />
        </div>
      ) : (
        <ol className="stage-list">
          {STAGES.map(([stageName, label], index) => {
            const complete = index < currentIndex;
            const active = index === currentIndex;
            return (
              <li className={active ? "is-active" : complete ? "is-complete" : ""} key={stageName}>
                <span className="stage-status" aria-hidden="true">
                  {complete ? <Check size={14} /> : active ? <LoaderCircle size={14} /> : <Clock3 size={13} />}
                </span>
                <span>{label}</span>
                {active && stagePercent !== null && <strong>{stagePercent}%</strong>}
              </li>
            );
          })}
        </ol>
      )}

      {memories.length > 0 && jobId && (
        <div className="memory-ribbon" aria-label="분석된 장면">
          {memories.slice(-8).map((event, index) => (
            <figure key={`${event.clip_id || event.thumb || "memory"}-${index}`}>
              {event.thumb ? (
                <img src={getJobAssetUrl(jobId, event.thumb)} alt="분석된 영상 장면" />
              ) : (
                <div className="caption-placeholder" aria-hidden="true" />
              )}
              <figcaption>{event.caption || event.dialogue || "기억 속 한 장면"}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
