import { CalendarHeart, LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { rememberCompletedJob } from "@/lib/memory-store";

type ReflectState = "idle" | "loading" | "success";

const REFLECT_DELAY_MS = 800;

export function ReflectExperience({
  jobId,
  prompt,
}: {
  jobId: string;
  prompt?: string;
}) {
  const [state, setState] = useState<ReflectState>("idle");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    rememberCompletedJob(jobId, prompt);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [jobId, prompt]);

  const reflect = () => {
    setState("loading");
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setState("success");
    }, REFLECT_DELAY_MS);
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
          <button type="button" className="reflect-action" onClick={reflect}>
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

      {state === "success" && (
        <section
          className="reflect-panel reflect-panel--happy"
          aria-labelledby="reflect-title"
        >
          <div className="reflect-happy-copy">
            <p className="eyebrow">LIFE INSIGHT</p>
            <h2 id="reflect-title">
              최근 반려견 해피와 함께 하는 시간이 줄었네요
            </h2>
            <p className="reflect-happy-suggestion">
              “해피와 함께 나들이 하는 시간을 가져보면 어떨까요?”
            </p>
          </div>

          <ol className="reflect-journey" aria-label="기억에서 내일로 이어지는 흐름">
            <li>
              <strong>Remember</strong>
              <span>과거를 기억한다</span>
            </li>
            <li>
              <strong>Reflect</strong>
              <span>지금의 삶을 돌아본다</span>
            </li>
            <li>
              <strong>Tomorrow</strong>
              <span>더 나은 선택을 제안한다</span>
            </li>
          </ol>
        </section>
      )}
    </div>
  );
}
