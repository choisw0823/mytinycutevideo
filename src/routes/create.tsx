import { MemoryCollage } from "@/components/video/MemoryCollage";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/create")({
  component: CreatePagePlaceholder,
});

function CreatePagePlaceholder() {
  return (
    <main className="memory-page">
      <MemoryCollage variant="quiet" />
      <section className="hero-card">
        <h1>새로운 기억 만들기</h1>
        <p>영상 생성 화면을 준비하고 있어요.</p>
        <Link to="/">돌아가기</Link>
      </section>
    </main>
  );
}
