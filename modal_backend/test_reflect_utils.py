import unittest
from datetime import datetime, timezone

from modal_backend.reflect_utils import (
    analyze_memories,
    build_llm_prompt,
    fallback_reflection,
    generate_reflection,
    merge_llm_reflection,
    validate_reflection_memories,
)


class ReflectionAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 8, 17, 12, 0, tzinfo=timezone.utc)

    def memory(
        self,
        memory_id: str,
        occurred_at: str,
        categories: list[str],
        importance: int = 3,
    ) -> dict:
        return {
            "id": memory_id,
            "occurredAt": occurred_at,
            "title": f"memory {memory_id}",
            "summary": f"summary {memory_id}",
            "people": [],
            "places": [],
            "activities": [],
            "categories": categories,
            "mood": "warm",
            "importance": importance,
        }

    def test_selects_largest_decrease_and_highest_importance_memory(self):
        memories = [
            self.memory("friends-old", "2026-07-24T12:00:00+00:00", ["friends"]),
            self.memory(
                "friends-best",
                "2026-07-28T12:00:00+00:00",
                ["friends", "outdoor"],
                importance=5,
            ),
            self.memory("friends-third", "2026-08-01T12:00:00+00:00", ["friends"]),
            self.memory("outdoor-recent", "2026-08-10T12:00:00+00:00", ["outdoor"]),
        ]

        analysis = analyze_memories(memories, now=self.now)

        self.assertEqual(analysis["mode"], "decrease")
        self.assertEqual(analysis["category"], "friends")
        self.assertEqual(analysis["previous_count"], 3)
        self.assertEqual(analysis["recent_count"], 0)
        self.assertEqual(analysis["featured_memory_id"], "friends-best")
        self.assertEqual(analysis["evidence"], ["이전 2주 3회 · 최근 2주 0회"])

    def test_uses_most_frequent_recent_category_when_nothing_decreased(self):
        memories = [
            self.memory("daily-one", "2026-08-05T12:00:00+00:00", ["daily"]),
            self.memory("daily-two", "2026-08-12T12:00:00+00:00", ["daily"]),
            self.memory("food-one", "2026-08-14T12:00:00+00:00", ["food"]),
        ]

        analysis = analyze_memories(memories, now=self.now)

        self.assertEqual(analysis["mode"], "frequent")
        self.assertEqual(analysis["category"], "daily")
        self.assertEqual(analysis["previous_count"], 0)
        self.assertEqual(analysis["recent_count"], 2)
        self.assertEqual(analysis["evidence"], ["최근 2주 2회"])

    def test_uses_recent_side_for_fourteen_day_boundary_and_excludes_future(self):
        memories = [
            self.memory("boundary", "2026-08-03T12:00:00+00:00", ["family"]),
            self.memory("future", "2026-08-18T12:00:00+00:00", ["friends"]),
        ]

        analysis = analyze_memories(memories, now=self.now)

        self.assertEqual(analysis["category"], "family")
        self.assertEqual(analysis["previous_count"], 0)
        self.assertEqual(analysis["recent_count"], 1)
        self.assertEqual(analysis["featured_memory_id"], "boundary")

    def test_featured_memory_breaks_importance_tie_with_newer_date(self):
        memories = [
            self.memory("older", "2026-08-05T12:00:00+00:00", ["travel"], importance=4),
            self.memory("newer", "2026-08-15T12:00:00+00:00", ["travel"], importance=4),
        ]

        analysis = analyze_memories(memories, now=self.now)

        self.assertEqual(analysis["featured_memory_id"], "newer")

    def test_empty_input_returns_an_insufficient_fallback(self):
        analysis = analyze_memories([], now=self.now)

        result = fallback_reflection(analysis)

        self.assertEqual(analysis["mode"], "insufficient")
        self.assertEqual(result["source"], "fallback")
        self.assertEqual(result["featuredMemoryId"], "")
        self.assertIn("충분하지", result["observation"])

    def test_llm_cannot_replace_computed_evidence_or_featured_memory(self):
        analysis = analyze_memories(
            [
                self.memory("featured", "2026-08-08T12:00:00+00:00", ["outdoor"]),
                self.memory("old", "2026-07-25T12:00:00+00:00", ["outdoor"]),
            ],
            now=self.now,
        )

        result = merge_llm_reflection(
            analysis,
            {
                "observation": "최근에는 야외에서 보낸 순간이 조금 줄었어요.",
                "suggestion": "이번 주에는 잠시 산책을 나가볼까요?",
                "evidence": ["근거를 바꾼 문장"],
                "featuredMemoryId": "invented",
            },
        )

        self.assertEqual(result["source"], "llm")
        self.assertEqual(result["evidence"], analysis["evidence"])
        self.assertEqual(result["featuredMemoryId"], "featured")

    def test_invalid_llm_payload_uses_deterministic_fallback(self):
        analysis = analyze_memories(
            [self.memory("daily", "2026-08-12T12:00:00+00:00", ["daily"])],
            now=self.now,
        )

        self.assertEqual(merge_llm_reflection(analysis, {}), fallback_reflection(analysis))

    def test_prompt_contains_aggregated_evidence_without_people_or_places(self):
        memory = self.memory("private", "2026-08-12T12:00:00+00:00", ["daily"])
        memory["people"] = ["홍길동"]
        memory["places"] = ["비밀 장소"]
        analysis = analyze_memories([memory], now=self.now)

        prompt = build_llm_prompt(analysis)

        self.assertIn('"recent_count": 1', prompt)
        self.assertNotIn("홍길동", prompt)
        self.assertNotIn("비밀 장소", prompt)

    def test_model_exception_returns_fallback_instead_of_failing_request(self):
        memories = [self.memory("daily", "2026-08-12T12:00:00+00:00", ["daily"])]

        def unavailable(_analysis):
            raise RuntimeError("model unavailable")

        result = generate_reflection(memories, unavailable, now=self.now)

        self.assertEqual(result["source"], "fallback")
        self.assertIn("최근 2주", result["observation"])

    def test_request_validation_rejects_more_than_sixty_memories(self):
        memories = [
            self.memory(f"memory-{index}", "2026-08-12T12:00:00+00:00", ["daily"])
            for index in range(61)
        ]

        with self.assertRaisesRegex(ValueError, "60개"):
            validate_reflection_memories(memories)

    def test_request_validation_rejects_empty_input(self):
        with self.assertRaisesRegex(ValueError, "하나"):
            validate_reflection_memories([])

    def test_request_validation_rejects_out_of_range_importance(self):
        memory = self.memory("invalid", "2026-08-12T12:00:00+00:00", ["daily"])
        memory["importance"] = 8

        with self.assertRaisesRegex(ValueError, "중요도"):
            validate_reflection_memories([memory])

    def test_request_validation_trims_text_and_limits_private_arrays(self):
        memory = self.memory(" valid ", "2026-08-12T12:00:00+00:00", ["daily"])
        memory["title"] = "  작은 하루  "
        memory["people"] = [f"person-{index}" for index in range(20)]

        validated = validate_reflection_memories([memory])

        self.assertEqual(validated[0]["id"], "valid")
        self.assertEqual(validated[0]["title"], "작은 하루")
        self.assertEqual(len(validated[0]["people"]), 10)


if __name__ == "__main__":
    unittest.main()
