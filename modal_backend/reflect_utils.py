"""Grounded, deterministic analysis helpers for the Reflect demo."""

from datetime import datetime, timedelta, timezone
from typing import Any


CATEGORY_ORDER = ("friends", "family", "outdoor", "travel", "food", "daily")
CATEGORY_LABELS = {
    "friends": "친구들과 함께한",
    "family": "가족과 함께한",
    "outdoor": "야외에서 보낸",
    "travel": "여행에서 남긴",
    "food": "음식을 나눈",
    "daily": "일상에서 발견한",
}


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _valid_memories(memories: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    window_start = now - timedelta(days=28)
    valid: list[dict[str, Any]] = []
    for memory in memories:
        occurred_at = _parse_datetime(memory.get("occurredAt"))
        if occurred_at is None or occurred_at < window_start or occurred_at > now:
            continue
        categories = [
            category
            for category in memory.get("categories", [])
            if category in CATEGORY_ORDER
        ]
        if not categories:
            continue
        normalized = dict(memory)
        normalized["_occurred_at"] = occurred_at
        normalized["categories"] = list(dict.fromkeys(categories))
        valid.append(normalized)
    return valid


def _featured_memory(memories: list[dict[str, Any]], category: str) -> dict[str, Any] | None:
    matching = [memory for memory in memories if category in memory["categories"]]
    if not matching:
        return None
    return max(
        matching,
        key=lambda memory: (
            int(memory.get("importance", 0)),
            memory["_occurred_at"],
        ),
    )


def analyze_memories(
    memories: list[dict[str, Any]],
    now: datetime | None = None,
) -> dict[str, Any]:
    """Compare the previous and recent 14-day windows without using an LLM."""
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    recent_start = current - timedelta(days=14)
    valid = _valid_memories(memories, current)
    previous_counts = {category: 0 for category in CATEGORY_ORDER}
    recent_counts = {category: 0 for category in CATEGORY_ORDER}

    for memory in valid:
        bucket = recent_counts if memory["_occurred_at"] >= recent_start else previous_counts
        for category in memory["categories"]:
            bucket[category] += 1

    decreases = [
        category
        for category in CATEGORY_ORDER
        if previous_counts[category] > recent_counts[category]
    ]
    if decreases:
        mode = "decrease"
        category = max(
            decreases,
            key=lambda item: previous_counts[item] - recent_counts[item],
        )
    else:
        category = max(CATEGORY_ORDER, key=lambda item: recent_counts[item])
        if recent_counts[category] == 0:
            return {
                "mode": "insufficient",
                "category": "",
                "category_label": "",
                "previous_count": 0,
                "recent_count": 0,
                "featured_memory_id": "",
                "featured_memory": None,
                "evidence": ["최근 28일 동안 분석할 기억이 충분하지 않아요."],
            }
        mode = "frequent"

    featured = _featured_memory(valid, category)
    previous_count = previous_counts[category]
    recent_count = recent_counts[category]
    evidence = (
        [f"이전 2주 {previous_count}회 · 최근 2주 {recent_count}회"]
        if mode == "decrease"
        else [f"최근 2주 {recent_count}회"]
    )
    return {
        "mode": mode,
        "category": category,
        "category_label": CATEGORY_LABELS[category],
        "previous_count": previous_count,
        "recent_count": recent_count,
        "featured_memory_id": str(featured.get("id", "")) if featured else "",
        "featured_memory": {
            "id": str(featured.get("id", "")),
            "title": str(featured.get("title", "")),
            "summary": str(featured.get("summary", "")),
        }
        if featured
        else None,
        "evidence": evidence,
    }


def fallback_reflection(analysis: dict[str, Any]) -> dict[str, Any]:
    """Create a presentation-safe response when the model is unavailable."""
    if analysis["mode"] == "insufficient":
        observation = "아직 변화를 살펴보기에는 기억이 충분하지 않아요."
        suggestion = "새로운 순간이 조금 더 쌓인 뒤 다시 돌아볼까요?"
    elif analysis["mode"] == "decrease":
        observation = f"최근 2주에는 {analysis['category_label']} 기억이 이전보다 조금 줄었어요."
        suggestion = "이번 주에는 그리운 순간을 다시 한번 만들어볼까요?"
    else:
        observation = f"최근 2주에는 {analysis['category_label']} 순간이 자주 기록됐어요."
        suggestion = "이번 주에도 마음에 남는 순간을 하나 더 만들어볼까요?"
    return {
        "observation": observation,
        "evidence": list(analysis["evidence"]),
        "suggestion": suggestion,
        "featuredMemoryId": analysis["featured_memory_id"],
        "source": "fallback",
    }


def _valid_short_text(value: Any) -> bool:
    return isinstance(value, str) and 1 <= len(value.strip()) <= 240


def merge_llm_reflection(
    analysis: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Accept model prose while retaining code-computed evidence and memory selection."""
    observation = payload.get("observation")
    suggestion = payload.get("suggestion")
    if not _valid_short_text(observation) or not _valid_short_text(suggestion):
        return fallback_reflection(analysis)
    return {
        "observation": observation.strip(),
        "evidence": list(analysis["evidence"]),
        "suggestion": suggestion.strip(),
        "featuredMemoryId": analysis["featured_memory_id"],
        "source": "llm",
    }

