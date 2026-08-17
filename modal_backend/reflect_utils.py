"""Grounded, deterministic analysis helpers for the Reflect demo."""

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Callable


CATEGORY_ORDER = ("friends", "family", "outdoor", "travel", "food", "daily")
CATEGORY_LABELS = {
    "friends": "친구들과 함께한",
    "family": "가족과 함께한",
    "outdoor": "야외에서 보낸",
    "travel": "여행에서 남긴",
    "food": "음식을 나눈",
    "daily": "일상에서 발견한",
}
MOODS = {"warm", "joyful", "calm", "nostalgic"}


def _clean_text(value: Any, field: str, max_length: int) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} 값이 필요합니다.")
    cleaned = value.strip()
    if len(cleaned) > max_length:
        raise ValueError(f"{field} 값이 너무 깁니다.")
    return cleaned


def _clean_text_list(value: Any, field: str) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"{field} 값은 목록이어야 합니다.")
    return [_clean_text(item, field, 80) for item in value[:10]]


def validate_reflection_memories(memories: Any) -> list[dict[str, Any]]:
    """Validate and bound the browser-provided demo memory records."""
    if not isinstance(memories, list) or not memories:
        raise ValueError("기억을 하나 이상 보내 주세요.")
    if len(memories) > 60:
        raise ValueError("기억은 최대 60개까지 분석할 수 있습니다.")

    validated: list[dict[str, Any]] = []
    for memory in memories:
        if not isinstance(memory, dict):
            raise ValueError("기억 형식이 올바르지 않습니다.")
        occurred_at = _clean_text(memory.get("occurredAt"), "날짜", 40)
        if _parse_datetime(occurred_at) is None:
            raise ValueError("기억 날짜가 올바르지 않습니다.")
        categories = memory.get("categories")
        if not isinstance(categories, list) or not categories:
            raise ValueError("기억 카테고리가 필요합니다.")
        clean_categories = list(dict.fromkeys(categories))
        if len(clean_categories) > len(CATEGORY_ORDER) or any(
            category not in CATEGORY_ORDER for category in clean_categories
        ):
            raise ValueError("기억 카테고리가 올바르지 않습니다.")
        importance = memory.get("importance")
        if not isinstance(importance, int) or isinstance(importance, bool) or not 1 <= importance <= 5:
            raise ValueError("기억 중요도는 1부터 5 사이여야 합니다.")
        mood = memory.get("mood")
        if mood not in MOODS:
            raise ValueError("기억 분위기가 올바르지 않습니다.")

        validated.append(
            {
                "id": _clean_text(memory.get("id"), "기억 ID", 100),
                "occurredAt": occurred_at,
                "title": _clean_text(memory.get("title"), "제목", 160),
                "summary": _clean_text(memory.get("summary"), "요약", 400),
                "people": _clean_text_list(memory.get("people", []), "인물"),
                "places": _clean_text_list(memory.get("places", []), "장소"),
                "activities": _clean_text_list(memory.get("activities", []), "활동"),
                "categories": clean_categories,
                "mood": mood,
                "importance": importance,
                "thumbnail": str(memory.get("thumbnail", ""))[:500],
                "sourceJobId": str(memory.get("sourceJobId", ""))[:100],
            }
        )
    return validated


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


def build_llm_prompt(analysis: dict[str, Any]) -> str:
    """Build a compact prompt containing only computed evidence and featured copy."""
    evidence = {
        "mode": analysis["mode"],
        "category": analysis["category"],
        "category_label": analysis["category_label"],
        "previous_count": analysis["previous_count"],
        "recent_count": analysis["recent_count"],
        "featured_memory": analysis["featured_memory"],
    }
    return (
        "다음 통계 근거만 사용해 한국어 회고를 작성하세요. 사실을 추가하거나 감정·건강·관계를 "
        "진단하지 마세요. observation은 따뜻한 관찰 한 문장, suggestion은 부담 없는 질문형 "
        "한 문장으로 작성하고 JSON 객체만 반환하세요.\n근거: "
        + json.dumps(evidence, ensure_ascii=False)
    )


def generate_reflection(
    memories: list[dict[str, Any]],
    llm_call: Callable[[dict[str, Any]], dict[str, Any]],
    now: datetime | None = None,
) -> dict[str, Any]:
    """Run grounded analysis and absorb model failures into a fallback response."""
    analysis = analyze_memories(memories, now=now)
    if analysis["mode"] == "insufficient":
        return fallback_reflection(analysis)
    try:
        return merge_llm_reflection(analysis, llm_call(analysis))
    except Exception:
        return fallback_reflection(analysis)
