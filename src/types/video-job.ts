export type VideoJobState = "queued" | "running" | "completed" | "failed";

export interface VideoJobEvent {
  stage: string;
  msg?: string;
  progress?: number;
  total?: number;
  clip_id?: string;
  thumb?: string;
  caption?: string;
  dialogue?: string;
  video?: string;
  duration?: number;
  size_mb?: number;
  done?: boolean;
}

export interface VideoJobStatus {
  job_id: string;
  state: VideoJobState;
  stage: string;
  events: VideoJobEvent[];
  next: number;
  done: boolean;
  error: string | null;
}
