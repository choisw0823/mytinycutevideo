import { CalendarHeart, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { generateReflection } from "@/lib/modal-api";
import {
  findMemory,
  rememberCompletedJob,
} from "@/lib/memory-store";
import type { MemoryRecord, ReflectionResult } from "@/types/reflection";

type ReflectState = "idle" | "loading" | "success" | "error";

const formatMemoryDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "기억 속 어느 날";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
  }).format(date);
};

export function ReflectExperience({
  jobId,
  prompt,
}: {
  jobId: string;
  prompt?: string;
}) {
  const [state, setState] = useState<ReflectState>("idle");
  const [result, setResult] = useState<ReflectionResult | null>(null);
  const [featuredMemory, setFeaturedMemory] = useState<MemoryRecord | null>(null);

  useEffect(() => {
    rememberCompletedJob(jobId, prompt);
  }, [jobId, prompt]);

  const reflect = async () => {
    setState("loading");
    const memories = rememberCompletedJob(jobId, prompt);
    try {
      const reflection = await generateReflection(memories);
      setResult(reflection);
      setFeaturedMemory(findMemory(memories, reflection.featuredMemoryId) || null);
      setState("success");
    } catch {
      setResult(null);
      setFeaturedMemory(null);
      setState("error");
    }
  };

  return (
    <div className="reflect-experience">
      {state === "idle" && (
        <div className="reflect-invitation">
          <span className="reflect-invitation-icon" aria-hidden="true">
            <CalendarHeart size={20} />
          </span>
          <div>
            <strong>영상 너머의 기억도 돌아보세요</strong>
            <p>최근 한 달의 순간들이 어떤 흐름을 만들었는지 살펴볼게요.</p>
          </div>
          <button type="button" className="reflect-action" onClick={() => void reflect()}>
            <Sparkles size={17} /> 한 달의 기억 돌아보기
          </button>
        </div>
      )}

      {state === "loading" && (
        <div className="reflect-loading" role="status">
          <LoaderCircle size={25} aria-hidden="true" />
          <div>
            <strong>기억의 흐름을 살펴보고 있어요...</strong>
            <p>최근의 순간들을 천천히 이어 보는 중이에요.</p>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="reflect-error" role="alert">
          <div>
            <strong>기억을 돌아보지 못했습니다.</strong>
            <p>완성된 영상은 그대로예요. 잠시 후 분석만 다시 시도해 주세요.</p>
          </div>
          <button type="button" className="secondary-action" onClick={() => void reflect()}>
            <RefreshCw size={16} /> 다시 분석하기
          </button>
        </div>
      )}

      {state === "success" && result && (
        <section className="reflect-panel" aria-labelledby="reflect-title">
          <div className="reflect-panel-heading">
            <span aria-hidden="true">✦</span>
            <div>
              <p className="eyebrow">REFLECT · YOUR RECENT MEMORY</p>
              <h2 id="reflect-title">Life Insight</h2>
            </div>
          </div>

          <div className="reflect-layout">
            <div className="reflect-copy">
              <blockquote>{result.observation}</blockquote>

              <div className="reflect-evidence">
                <span>Evidence</span>
                <ul>
                  {result.evidence.map((evidence) => (
                    <li key={evidence}>{evidence}</li>
                  ))}
                </ul>
              </div>

              <div className="reflect-tomorrow">
                <span>Tomorrow</span>
                <p>{result.suggestion}</p>
              </div>
            </div>

            <div className="reflect-favorite">
              <span>Favorite Memory</span>
              <figure>
                {featuredMemory?.thumbnail ? (
                  <img src={featuredMemory.thumbnail} alt="" />
                ) : (
                  <div className="reflect-photo-placeholder" aria-hidden="true">✦</div>
                )}
                <figcaption>
                  <strong>{featuredMemory?.title || "마음에 남은 작은 기억"}</strong>
                  <small>
                    {featuredMemory
                      ? formatMemoryDate(featuredMemory.occurredAt)
                      : "최근의 기억"}
                  </small>
                  <p>{featuredMemory?.summary || "다시 꺼내 보고 싶은 순간이에요."}</p>
                </figcaption>
              </figure>
            </div>
          </div>

        </section>
      )}
    </div>
  );
}
