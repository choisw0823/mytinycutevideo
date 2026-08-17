export type MemoryCategory =
  | "friends"
  | "family"
  | "outdoor"
  | "travel"
  | "food"
  | "daily";

export type MemoryMood = "warm" | "joyful" | "calm" | "nostalgic";

export interface MemoryRecord {
  id: string;
  occurredAt: string;
  title: string;
  summary: string;
  people: string[];
  places: string[];
  activities: string[];
  categories: MemoryCategory[];
  mood: MemoryMood;
  importance: number;
  thumbnail?: string;
  sourceJobId?: string;
}

export interface ReflectionResult {
  observation: string;
  evidence: string[];
  suggestion: string;
  featuredMemoryId: string;
  source: "llm" | "fallback";
}
