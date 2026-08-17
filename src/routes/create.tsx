import { FileDropzone } from "@/components/video/FileDropzone";
import { GenerationProgress } from "@/components/video/GenerationProgress";
import { MemoryCollage } from "@/components/video/MemoryCollage";
import { ResultPlayer } from "@/components/video/ResultPlayer";
import { getVideoJobStatus, uploadVideoJob } from "@/lib/modal-api";
import type { VideoJobEvent } from "@/types/video-job";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Film, RotateCcw, Sparkles } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type ScreenState = "input" | "uploading" | "processing" | "completed" | "failed";
const STORAGE_KEY = "my-tiny-cute-video-job";

export const Route = createFileRoute("/create")({
  component: CreatePage,
  head: () => ({
    meta: [
      { title: "새 영상 만들기 — My Tiny Cute Video" },
      { name: "description", content: "영상과 한 줄의 이야기로 작은 추억 영상을 만드세요." },
    ],
  }),
});

function CreatePage() {
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<ScreenState>("input");
  const [files, setFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [stage, setStage] = useState("extract");
  const [events, setEvents] = useState<VideoJobEvent[]>([]);
  const sinceRef = useRef(0);

  useEffect(() => {
    setHydrated(true);
    const savedJobId = window.localStorage.getItem(STORAGE_KEY);
    if (savedJobId) {
      setJobId(savedJobId);
      setScreen("processing");
    }
  }, []);

  useEffect(() => {
    if (!jobId || screen !== "processing") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const poll = async () => {
      try {
        const status = await getVideoJobStatus(jobId, sinceRef.current);
        if (cancelled) return;
        failures = 0;
        setStage(status.stage || "extract");
        if (status.events.length) {
          setEvents((current) => [...current, ...status.events]);
        }
        sinceRef.current = status.next;

        if (status.state === "completed") {
          setScreen("completed");
          return;
        }
        if (status.state === "failed") {
          setError(status.error || "영상 처리 중 문제가 생겼습니다.");
          setScreen("failed");
          return;
        }
      } catch (pollError) {
        if (cancelled) return;
        failures += 1;
        if (failures >= 3) {
          setError(pollError instanceof Error ? pollError.message : "진행 상태를 확인하지 못했습니다.");
          setScreen("failed");
          return;
        }
      }

      timer = setTimeout(poll, 1000);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, screen]);

  const restart = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    sinceRef.current = 0;
    setScreen("input");
    setFiles([]);
    setPrompt("");
    setFileError(null);
    setError(null);
    setUploadProgress(0);
    setJobId(null);
    setStage("extract");
    setEvents([]);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!files.length || !prompt.trim() || fileError) return;

    setError(null);
    setUploadProgress(0);
    setScreen("uploading");
    try {
      const response = await uploadVideoJob(files, prompt.trim(), setUploadProgress);
      window.localStorage.setItem(STORAGE_KEY, response.job_id);
      setJobId(response.job_id);
      setStage("extract");
      setScreen("processing");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "영상 업로드에 실패했습니다.");
      setScreen("failed");
    }
  };

  const working = screen === "uploading" || screen === "processing";

  return (
    <main
      className={`memory-page create-page create-page--${screen}`}
      data-hydrated={hydrated ? "true" : "false"}
    >
      <MemoryCollage variant={screen === "completed" ? "result" : "quiet"} />
      <header className="create-header">
        <Link to="/" className="back-link" aria-label="메인으로 돌아가기">
          <ArrowLeft size={17} />
          <span>My Tiny Cute Video</span>
        </Link>
        <span className="demo-badge"><Film size={14} /> DEMO</span>
      </header>

      {screen === "input" && (
        <section className="creator-card" aria-labelledby="create-title">
          <p className="eyebrow">MAKE A LITTLE MEMORY</p>
          <h1 id="create-title">어떤 순간을 기억할까요?</h1>
          <p className="creator-intro">영상들을 올리고, 만들고 싶은 이야기 한 줄을 들려주세요.</p>

          <form onSubmit={submit}>
            <FileDropzone
              files={files}
              onFilesChange={setFiles}
              error={fileError}
              onError={setFileError}
            />

            <div className="prompt-field">
              <label htmlFor="memory-prompt">영상에 담고 싶은 이야기</label>
              <textarea
                id="memory-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="예: 여름날 가족 여행의 따뜻한 순간을 한 편의 일기처럼 만들어줘"
                rows={4}
                maxLength={600}
              />
              <span>{prompt.length}/600</span>
            </div>

            <button
              type="submit"
              className="generate-action"
              disabled={!files.length || !prompt.trim() || Boolean(fileError)}
            >
              <Sparkles size={18} /> 영상 만들기
            </button>
          </form>
        </section>
      )}

      {working && (
        <GenerationProgress
          jobId={jobId}
          stage={stage}
          events={events}
          uploadProgress={uploadProgress}
          uploading={screen === "uploading"}
        />
      )}

      {screen === "completed" && jobId && (
        <ResultPlayer jobId={jobId} events={events} onRestart={restart} prompt={prompt} />
      )}

      {screen === "failed" && (
        <section className="failure-card" role="alert">
          <span aria-hidden="true">✦</span>
          <p className="eyebrow">LET'S TRY THAT MEMORY AGAIN</p>
          <h1>영상 생성에 실패했습니다</h1>
          <p>{error || "처리 중 예상하지 못한 문제가 생겼습니다."}</p>
          <button type="button" className="secondary-action" onClick={restart}>
            <RotateCcw size={17} /> 다시 시작
          </button>
        </section>
      )}
    </main>
  );
}
