"""Modal deployment for the My Tiny Cute Video asynchronous rendering API."""

import os
import re
import shutil
import sys
import threading
import time
import traceback
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import modal
from modal_backend.job_utils import build_allowed_origins, resolve_source_paths

THIS_DIR, GSULEE_WEBAPP = resolve_source_paths(Path(__file__), modal.is_local())
DATA_ROOT = Path("/data/jobs")
CHUNK_SIZE = 8 * 1024 * 1024
JOB_ID_PATTERN = re.compile(r"^[a-f0-9]{24}$")

if modal.is_local() and not (GSULEE_WEBAPP / "pipeline.py").is_file():
    raise RuntimeError(f"G-SULEE pipeline.py를 찾을 수 없습니다: {GSULEE_WEBAPP}")

api_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("fastapi[standard]")
    .add_local_dir(str(THIS_DIR), "/root/modal_backend")
)

render_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git", "libsndfile1")
    .pip_install("openai", "soundfile", "numpy")
    .pip_install("torch", index_url="https://download.pytorch.org/whl/cpu")
    .add_local_dir(str(GSULEE_WEBAPP), "/root/gsulee")
    .add_local_dir(str(THIS_DIR), "/root/modal_backend")
)

app = modal.App("my-tiny-cute-video")
jobs_volume = modal.Volume.from_name("my-tiny-cute-video-jobs", create_if_missing=True)
job_states = modal.Dict.from_name("my-tiny-cute-video-state", create_if_missing=True)
samsung_secret = modal.Secret.from_name("samsung")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _state_for(job_id: str) -> dict[str, Any] | None:
    value = job_states.get(job_id)
    return dict(value) if value is not None else None


def _write_state(job_id: str, state: dict[str, Any]) -> None:
    state["updated_at"] = _now()
    job_states[job_id] = state


def _resolved_job_path(job_id: str, relative_path: str = "") -> Path:
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise ValueError("올바르지 않은 작업 ID입니다.")
    job_root = (DATA_ROOT / job_id).resolve()
    target = (job_root / relative_path).resolve()
    if target != job_root and job_root not in target.parents:
        raise ValueError("안전하지 않은 파일 경로입니다.")
    return target


def _cleanup_old_jobs(max_age_hours: int = 24) -> None:
    """Delete demo artifacts older than the retention window."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    changed = False
    for directory in DATA_ROOT.iterdir():
        if not directory.is_dir() or not JOB_ID_PATTERN.fullmatch(directory.name):
            continue
        modified = datetime.fromtimestamp(directory.stat().st_mtime, timezone.utc)
        if modified >= cutoff:
            continue
        shutil.rmtree(directory, ignore_errors=True)
        try:
            del job_states[directory.name]
        except KeyError:
            pass
        changed = True
    if changed:
        jobs_volume.commit()


@app.function(
    image=render_image,
    volumes={"/data": jobs_volume},
    secrets=[samsung_secret],
    cpu=4,
    memory=8192,
    timeout=3600,
    max_containers=1,
)
def render_job(job_id: str, zip_relative_path: str, prompt: str) -> None:
    """Run the existing G-SULEE renderer and persist its progress events."""
    sys.path.insert(0, "/root/gsulee")
    sys.path.insert(0, "/root")
    from modal_backend.job_utils import append_event
    import pipeline

    job_dir = _resolved_job_path(job_id)
    zip_path = _resolved_job_path(job_id, zip_relative_path)
    event_lock = threading.Lock()
    last_thumbnail_commit = [0.0]

    def emit(event: dict[str, Any]) -> None:
        with event_lock:
            state = _state_for(job_id)
            if state is None:
                return
            updated = append_event(state, event)
            _write_state(job_id, updated)

            now = time.monotonic()
            if event.get("thumb") and now - last_thumbnail_commit[0] >= 2.5:
                jobs_volume.commit()
                last_thumbnail_commit[0] = now

    try:
        pipeline.run_pipeline(str(job_dir), str(zip_path), prompt, emit)
    except Exception as error:
        traceback.print_exc()
        emit({"stage": "error", "msg": f"{type(error).__name__}: {error}"})
    finally:
        jobs_volume.commit()


@app.function(
    image=api_image,
    volumes={"/data": jobs_volume},
    secrets=[samsung_secret],
    timeout=150,
    max_containers=2,
)
@modal.asgi_app()
def web_api():
    """Expose browser upload, polling, thumbnail, and result routes."""
    from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse, JSONResponse
    from modal_backend.job_utils import (
        MAX_FILES,
        MAX_TOTAL_BYTES,
        UploadValidationError,
        build_input_zip,
        validate_uploads,
    )

    web = FastAPI(title="My Tiny Cute Video API", version="1.0.0")
    allowed_origins = build_allowed_origins(os.getenv("LOVABLE_ORIGIN", ""))
    web.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @web.get("/health")
    async def health():
        return {"ok": True, "service": "my-tiny-cute-video"}

    async def create_job(
        files=File(...),
        prompt=Form(...),
    ):
        clean_prompt = prompt.strip()
        if not clean_prompt:
            raise HTTPException(status_code=422, detail="편집 요청을 입력해 주세요.")
        if len(clean_prompt) > 600:
            raise HTTPException(status_code=422, detail="편집 요청은 600자 이내로 입력해 주세요.")
        if not files or len(files) > MAX_FILES:
            raise HTTPException(status_code=422, detail=f"파일은 1개 이상 {MAX_FILES}개 이하로 올려 주세요.")

        try:
            jobs_volume.reload()
            _cleanup_old_jobs()
        except Exception:
            # Cleanup must never prevent a presentation job from starting.
            traceback.print_exc()

        job_id = uuid.uuid4().hex[:24]
        job_dir = _resolved_job_path(job_id)
        job_dir.mkdir(parents=True, exist_ok=False)
        saved_paths: list[Path] = []
        total_bytes = 0

        try:
            for index, upload in enumerate(files, start=1):
                original_name = Path(upload.filename or f"upload-{index}").name
                extension = Path(original_name).suffix.lower()
                destination = job_dir / f"upload_{index:03d}{extension}"
                with destination.open("wb") as output:
                    while chunk := await upload.read(CHUNK_SIZE):
                        total_bytes += len(chunk)
                        if total_bytes > MAX_TOTAL_BYTES:
                            raise UploadValidationError("전체 업로드 크기는 4GB를 넘을 수 없습니다.")
                        output.write(chunk)
                saved_paths.append(destination)

            upload_mode = validate_uploads(saved_paths)
            input_zip = job_dir / "input.zip"
            if upload_mode == "zip":
                saved_paths[0].replace(input_zip)
            else:
                build_input_zip(saved_paths, input_zip)

            created_at = _now()
            state = {
                "job_id": job_id,
                "state": "queued",
                "stage": "queued",
                "events": [],
                "next": 0,
                "done": False,
                "error": None,
                "created_at": created_at,
                "updated_at": created_at,
            }
            _write_state(job_id, state)
            jobs_volume.commit()
            call = render_job.spawn(job_id, "input.zip", clean_prompt)
            latest_state = _state_for(job_id) or state
            latest_state["function_call_id"] = call.object_id
            _write_state(job_id, latest_state)
            return {"job_id": job_id}
        except UploadValidationError as error:
            shutil.rmtree(job_dir, ignore_errors=True)
            jobs_volume.commit()
            raise HTTPException(status_code=422, detail=str(error)) from error
        except Exception as error:
            shutil.rmtree(job_dir, ignore_errors=True)
            jobs_volume.commit()
            traceback.print_exc()
            raise HTTPException(status_code=500, detail="영상 작업을 시작하지 못했습니다.") from error
        finally:
            for upload in files:
                await upload.close()

    create_job.__annotations__ = {
        "files": list[UploadFile],
        "prompt": str,
    }
    web.add_api_route("/jobs", create_job, methods=["POST"], status_code=202)

    @web.get("/jobs/{job_id}")
    async def get_job(job_id: str, since: int = Query(default=0, ge=0)):
        state = _state_for(job_id)
        if state is None:
            raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
        events = list(state.get("events", []))
        response = dict(state)
        response["events"] = events[since:]
        response["next"] = len(events)
        return JSONResponse(response, headers={"Cache-Control": "no-store"})

    @web.get("/jobs/{job_id}/files/{asset_path:path}")
    async def get_job_file(job_id: str, asset_path: str):
        try:
            target = _resolved_job_path(job_id, asset_path)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        jobs_volume.reload()
        if not target.is_file():
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
        media_type = "image/jpeg" if target.suffix.lower() in {".jpg", ".jpeg"} else None
        return FileResponse(target, media_type=media_type, headers={"Cache-Control": "no-store"})

    @web.get("/jobs/{job_id}/result")
    async def get_result(job_id: str):
        state = _state_for(job_id)
        if state is None:
            raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
        if state.get("state") != "completed":
            raise HTTPException(status_code=409, detail="영상이 아직 완성되지 않았습니다.")
        jobs_volume.reload()
        result_path = _resolved_job_path(job_id, "result.mp4")
        if not result_path.is_file():
            raise HTTPException(status_code=404, detail="결과 영상을 찾을 수 없습니다.")
        return FileResponse(
            result_path,
            media_type="video/mp4",
            filename="my-tiny-cute-video.mp4",
            content_disposition_type="inline",
            headers={"Cache-Control": "no-store"},
        )

    return web
