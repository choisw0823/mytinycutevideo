import { createDemoMemories } from "@/data/demo-memories";
import type { MemoryCategory, MemoryRecord } from "@/types/reflection";

const STORAGE_KEY = "my-tiny-cute-video-memories-v1";

const isMemoryRecord = (value: unknown): value is MemoryRecord => {
  if (!value || typeof value !== "object") return false;
  const memory = value as Partial<MemoryRecord>;
  return (
    typeof memory.id === "string" &&
    typeof memory.occurredAt === "string" &&
    typeof memory.title === "string" &&
    typeof memory.summary === "string" &&
    Array.isArray(memory.categories) &&
    typeof memory.importance === "number"
  );
};

const saveMemories = (memories: MemoryRecord[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memories.slice(0, 60)));
};

export function getMemories(): MemoryRecord[] {
  const seeded = createDemoMemories();
  if (typeof window === "undefined") return seeded;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isMemoryRecord)) {
        return parsed.slice(0, 60);
      }
    } catch {
      // A broken demo cache is replaced with fresh relative-date memories.
    }
  }
  saveMemories(seeded);
  return seeded;
}

const categoriesFromPrompt = (prompt: string): MemoryCategory[] => {
  const categories: MemoryCategory[] = [];
  if (/친구|동료/.test(prompt)) categories.push("friends");
  if (/가족|엄마|아빠|부모|아이/.test(prompt)) categories.push("family");
  if (/야외|산책|공원|바다|산|강|캠핑/.test(prompt)) categories.push("outdoor");
  if (/여행|휴가|관광/.test(prompt)) categories.push("travel");
  if (/음식|식사|맛집|카페/.test(prompt)) categories.push("food");
  return categories.length ? categories : ["daily"];
};

export function rememberCompletedJob(jobId: string, prompt = ""): MemoryRecord[] {
  const memories = getMemories();
  if (memories.some((memory) => memory.sourceJobId === jobId)) return memories;

  const cleanPrompt = prompt.trim();
  const memory: MemoryRecord = {
    id: `job-${jobId}`,
    occurredAt: new Date().toISOString(),
    title: cleanPrompt ? cleanPrompt.slice(0, 28) : "새로 완성된 작은 기억",
    summary: cleanPrompt || "여러 순간을 한 편의 영상으로 엮어 남긴 오늘의 기억",
    people: [],
    places: [],
    activities: ["영상 만들기"],
    categories: categoriesFromPrompt(cleanPrompt),
    mood: "nostalgic",
    importance: 4,
    sourceJobId: jobId,
  };
  const updated = [memory, ...memories].slice(0, 60);
  saveMemories(updated);
  return updated;
}

export function findMemory(memories: MemoryRecord[], id: string) {
  return memories.find((memory) => memory.id === id);
}
