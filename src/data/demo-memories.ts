import landing2Asset from "@/assets/landing-2.jpeg.asset.json";
import landing5Asset from "@/assets/landing-5.jpeg.asset.json";
import landing8Asset from "@/assets/landing-8.jpeg.asset.json";
import landing11Asset from "@/assets/landing-11.jpeg.asset.json";
import type { MemoryRecord } from "@/types/reflection";

const daysAgo = (now: Date, days: number) => {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

export function createDemoMemories(now = new Date()): MemoryRecord[] {
  return [
    {
      id: "friends-river",
      occurredAt: daysAgo(now, 26),
      title: "강가에서 웃던 오후",
      summary: "친구들과 강바람을 맞으며 오래 웃었던 여름 오후",
      people: ["친구들"],
      places: ["강가"],
      activities: ["산책", "대화"],
      categories: ["friends", "outdoor"],
      mood: "joyful",
      importance: 5,
      thumbnail: landing5Asset.url,
    },
    {
      id: "friends-picnic",
      occurredAt: daysAgo(now, 23),
      title: "잔디밭의 작은 피크닉",
      summary: "간식을 나누며 느긋하게 보낸 주말",
      people: ["친구들"],
      places: ["공원"],
      activities: ["피크닉"],
      categories: ["friends", "outdoor", "food"],
      mood: "warm",
      importance: 4,
      thumbnail: landing2Asset.url,
    },
    {
      id: "friends-sunset",
      occurredAt: daysAgo(now, 20),
      title: "노을을 따라 걷던 길",
      summary: "친구와 해 질 무렵 동네를 천천히 걸었던 날",
      people: ["친구"],
      places: ["산책길"],
      activities: ["산책"],
      categories: ["friends", "outdoor"],
      mood: "nostalgic",
      importance: 4,
      thumbnail: landing8Asset.url,
    },
    {
      id: "friends-cafe",
      occurredAt: daysAgo(now, 16),
      title: "비 오는 날의 긴 이야기",
      summary: "창가에 앉아 친구와 밀린 이야기를 나눈 저녁",
      people: ["친구"],
      places: ["카페"],
      activities: ["대화"],
      categories: ["friends", "food"],
      mood: "calm",
      importance: 3,
      thumbnail: landing11Asset.url,
    },
    {
      id: "recent-breakfast",
      occurredAt: daysAgo(now, 12),
      title: "조용한 아침 식탁",
      summary: "천천히 차를 마시며 하루를 시작한 순간",
      people: [],
      places: ["집"],
      activities: ["아침 식사"],
      categories: ["daily", "food"],
      mood: "calm",
      importance: 2,
      thumbnail: landing2Asset.url,
    },
    {
      id: "recent-family",
      occurredAt: daysAgo(now, 8),
      title: "가족과 나눈 저녁",
      summary: "평범해서 더 따뜻했던 집에서의 저녁 식사",
      people: ["가족"],
      places: ["집"],
      activities: ["저녁 식사"],
      categories: ["family", "food", "daily"],
      mood: "warm",
      importance: 4,
      thumbnail: landing11Asset.url,
    },
    {
      id: "recent-window",
      occurredAt: daysAgo(now, 4),
      title: "창가에 머문 햇살",
      summary: "바쁜 하루 중 잠시 멈춰 바라본 오후의 빛",
      people: [],
      places: ["집"],
      activities: ["휴식"],
      categories: ["daily"],
      mood: "nostalgic",
      importance: 3,
      thumbnail: landing8Asset.url,
    },
  ];
}
