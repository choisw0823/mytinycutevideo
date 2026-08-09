import type { CSSProperties } from "react";
import landing1Asset from "@/assets/landing-1.jpeg.asset.json";
import landing2Asset from "@/assets/landing-2.jpeg.asset.json";
import landing3Asset from "@/assets/landing-3.jpeg.asset.json";
import landing4Asset from "@/assets/landing-4.jpeg.asset.json";
import landing5Asset from "@/assets/landing-5.jpeg.asset.json";
import landing6Asset from "@/assets/landing-6.jpeg.asset.json";
import landing7Asset from "@/assets/landing-7.jpg.asset.json";
import landing8Asset from "@/assets/landing-8.jpeg.asset.json";
import landing9Asset from "@/assets/landing-9.jpeg.asset.json";
import landing10Asset from "@/assets/landing-10.jpeg.asset.json";
import landing11Asset from "@/assets/landing-11.jpeg.asset.json";
import landing12Asset from "@/assets/landing-12.jpeg.asset.json";
import landing13Asset from "@/assets/landing-13.jpeg.asset.json";

type MemoryCollageVariant = "landing" | "quiet" | "result";

const PHOTOS = [
  { url: landing1Asset.url, label: "우리의 작은 순간", x: 4, y: 7, size: 18, rotate: -7, delay: 0 },
  { url: landing2Asset.url, label: "오래 남은 햇살", x: 26, y: -9, size: 14, rotate: 5, delay: 0.7 },
  { url: landing3Asset.url, label: "그날의 공기", x: 66, y: -8, size: 16, rotate: -4, delay: 1.2 },
  { url: landing4Asset.url, label: "다시 만나고 싶은 장면", x: 82, y: 11, size: 16, rotate: 8, delay: 0.3 },
  { url: landing5Asset.url, label: "여름의 한 페이지", x: -5, y: 41, size: 16, rotate: 4, delay: 1.5 },
  { url: landing6Asset.url, label: "함께라서 좋았던", x: 87, y: 45, size: 16, rotate: -6, delay: 0.9 },
  { url: landing7Asset.url, label: "천천히 기억하기", x: 3, y: 75, size: 15, rotate: -3, delay: 1.8 },
  { url: landing8Asset.url, label: "마음에 담아 둔 날", x: 22, y: 86, size: 13, rotate: 7, delay: 0.5 },
  { url: landing9Asset.url, label: "작고 반짝이던", x: 66, y: 85, size: 15, rotate: 3, delay: 1.1 },
  { url: landing10Asset.url, label: "우리의 기록", x: 85, y: 76, size: 17, rotate: -8, delay: 1.6 },
  { url: landing11Asset.url, label: "잊고 있던 미소", x: 13, y: 25, size: 11, rotate: 9, delay: 0.2 },
  { url: landing12Asset.url, label: "한 편의 기억", x: 76, y: 27, size: 12, rotate: -9, delay: 1.3 },
  { url: landing13Asset.url, label: "그리고, 지금", x: 45, y: 92, size: 12, rotate: 4, delay: 0.8 },
] as const;

export function MemoryCollage({
  variant = "landing",
}: {
  variant?: MemoryCollageVariant;
}) {
  return (
    <div
      aria-hidden="true"
      className={`memory-collage memory-collage--${variant}`}
    >
      {PHOTOS.map((photo, index) => (
        <figure
          key={photo.url}
          className="memory-photo"
          style={
            {
              "--photo-x": `${photo.x}%`,
              "--photo-y": `${photo.y}%`,
              "--photo-size": `${photo.size}rem`,
              "--photo-rotate": `${photo.rotate}deg`,
              "--photo-delay": `${photo.delay}s`,
              "--photo-index": index,
            } as CSSProperties
          }
        >
          <img src={photo.url} alt="" draggable={false} />
          <figcaption>{photo.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
