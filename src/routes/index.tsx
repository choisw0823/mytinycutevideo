import { MemoryCollage } from "@/components/video/MemoryCollage";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Film } from "lucide-react";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "My Tiny Cute Video — 흩어진 순간을 한 편의 기억으로" },
      {
        name: "description",
        content: "여러 영상 속 소중한 순간을 한 편의 따뜻한 추억 영상으로 만들어 보세요.",
      },
    ],
  }),
});

function LandingPage() {
  return (
    <main className="memory-page memory-page--landing">
      <MemoryCollage variant="landing" />
      <section className="hero-card" aria-labelledby="landing-title">
        <div className="brand-mark" aria-hidden="true">
          <Film size={21} strokeWidth={1.8} />
        </div>
        <p className="eyebrow">MEMORIES, MADE MOVING</p>
        <h1 id="landing-title">My Tiny Cute Video</h1>
        <p className="hero-copy">
          흩어진 순간을
          <br />한 편의 기억으로
        </p>
        <Link to="/create" className="primary-action">
          시작하기
          <ArrowRight size={18} />
        </Link>
        <p className="hero-note">영상 몇 개와 한 줄의 이야기면 충분해요</p>
      </section>
    </main>
  );
}
