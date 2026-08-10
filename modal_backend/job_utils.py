"""Pure-Python validation and state helpers shared by the Modal API."""

from __future__ import annotations

import stat
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping, Sequence

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".avi", ".mkv"}
DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "https://mytinycutevideo.lovable.app",
)
MAX_FILES = 60
MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024


class UploadValidationError(ValueError):
    """Raised when an uploaded file set is unsafe or unsupported."""


def build_allowed_origins(configured_origin: str) -> list[str]:
    """Return exact browser origins allowed to call the presentation API."""
    origins = list(DEFAULT_ALLOWED_ORIGINS)
    normalized = configured_origin.strip().rstrip("/")
    if normalized and normalized not in origins:
        origins.append(normalized)
    return origins


def resolve_source_paths(module_file: Path, is_local: bool) -> tuple[Path, Path]:
    """Resolve source inputs locally and their fixed mounts inside Modal."""
    if not is_local:
        return Path("/root/modal_backend"), Path("/root/gsulee")
    backend_dir = module_file.resolve().parent
    workspace_dir = backend_dir.parents[1]
    return backend_dir, workspace_dir / "G-SULEE" / "webapp"


def reload_volume_file(volume: Any, path: Path) -> Path:
    """Reload a reused Volume mount and require a committed file to be visible."""
    volume.reload()
    if not path.is_file():
        raise FileNotFoundError(f"Volume reload 후에도 파일을 찾을 수 없습니다: {path}")
    return path


def validate_uploads(paths: Sequence[Path]) -> str:
    """Validate uploaded paths and return either ``zip`` or ``videos``."""
    if not paths:
        raise UploadValidationError("파일을 한 개 이상 선택해 주세요.")
    if len(paths) > MAX_FILES:
        raise UploadValidationError(f"영상은 최대 {MAX_FILES}개까지 업로드할 수 있습니다.")

    total_bytes = sum(path.stat().st_size for path in paths)
    if total_bytes > MAX_TOTAL_BYTES:
        raise UploadValidationError("전체 업로드 크기는 4GB를 넘을 수 없습니다.")

    extensions = [path.suffix.lower() for path in paths]
    zip_count = extensions.count(".zip")
    if any(extension != ".zip" and extension not in VIDEO_EXTENSIONS for extension in extensions):
        raise UploadValidationError("지원하지 않는 파일 형식입니다.")
    if zip_count:
        if zip_count != 1 or len(paths) != 1:
            raise UploadValidationError("ZIP 파일은 다른 영상과 함께 업로드할 수 없습니다.")
        safe_zip_members(paths[0])
        return "zip"
    return "videos"


def safe_zip_members(zip_path: Path) -> list[zipfile.ZipInfo]:
    """Return validated video members without extracting the archive."""
    try:
        with zipfile.ZipFile(zip_path) as archive:
            members = list(archive.infolist())
    except (zipfile.BadZipFile, OSError) as error:
        raise UploadValidationError("올바른 ZIP 파일이 아닙니다.") from error

    safe_members: list[zipfile.ZipInfo] = []
    total_bytes = 0
    synthetic_root = Path("/safe-upload-root")

    for member in members:
        normalized_name = member.filename.replace("\\", "/")
        pure_path = PurePosixPath(normalized_name)
        if pure_path.is_absolute() or any(part == ".." for part in pure_path.parts):
            raise UploadValidationError("ZIP 안에 안전하지 않은 파일 경로가 있습니다.")

        resolved = (synthetic_root / Path(*pure_path.parts)).resolve()
        if resolved != synthetic_root and synthetic_root not in resolved.parents:
            raise UploadValidationError("ZIP 안에 안전하지 않은 파일 경로가 있습니다.")

        unix_mode = (member.external_attr >> 16) & 0xFFFF
        if stat.S_ISLNK(unix_mode):
            raise UploadValidationError("ZIP 안의 심볼릭 링크는 허용하지 않습니다.")
        if member.is_dir():
            continue
        if PurePosixPath(normalized_name).suffix.lower() not in VIDEO_EXTENSIONS:
            raise UploadValidationError("ZIP 안에는 지원하는 영상 파일만 넣어 주세요.")

        safe_members.append(member)
        total_bytes += member.file_size

    if not safe_members:
        raise UploadValidationError("ZIP 안에 영상 파일이 없습니다.")
    if len(safe_members) > MAX_FILES:
        raise UploadValidationError(f"ZIP 안의 영상은 최대 {MAX_FILES}개까지 처리할 수 있습니다.")
    if total_bytes > MAX_TOTAL_BYTES:
        raise UploadValidationError("ZIP 압축 해제 크기는 4GB를 넘을 수 없습니다.")
    return safe_members


def build_input_zip(paths: Iterable[Path], destination: Path) -> Path:
    """Build the pipeline input archive using sanitized sequential names."""
    path_list = list(paths)
    if validate_uploads(path_list) != "videos":
        raise UploadValidationError("여러 영상 파일만 새 ZIP으로 묶을 수 있습니다.")

    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_STORED) as archive:
        for index, path in enumerate(path_list, start=1):
            archive.write(path, arcname=f"video_{index:03d}{path.suffix.lower()}")
    return destination


def append_event(
    state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> dict[str, Any]:
    """Return a copied job state with one normalized pipeline event appended."""
    normalized_event = dict(event)
    normalized_event.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
    stage = str(normalized_event.get("stage") or "running")

    updated = dict(state)
    updated_events = [dict(existing) for existing in state.get("events", [])]
    updated_events.append(normalized_event)
    updated["events"] = updated_events
    updated["next"] = len(updated_events)
    updated["stage"] = stage

    if stage == "done":
        updated["state"] = "completed"
        updated["done"] = True
        updated["error"] = None
    elif stage == "error":
        updated["state"] = "failed"
        updated["done"] = True
        updated["error"] = str(
            normalized_event.get("error") or normalized_event.get("msg") or "영상 처리에 실패했습니다."
        )
    else:
        updated["state"] = "running"
        updated["done"] = False
        updated.setdefault("error", None)
    return updated
