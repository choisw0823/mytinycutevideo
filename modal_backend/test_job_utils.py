import stat
import tempfile
import unittest
import zipfile
from pathlib import Path

import modal_backend.job_utils as job_utils
from modal_backend.job_utils import (
    UploadValidationError,
    append_event,
    build_input_zip,
    publish_pipeline_event,
    safe_zip_members,
    resolve_source_paths,
    validate_uploads,
)


class UploadValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def make_file(self, name: str, data: bytes = b"video") -> Path:
        path = self.root / name
        path.write_bytes(data)
        return path

    def test_accepts_one_zip(self):
        archive = self.root / "memories.zip"
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("clip.mp4", b"video")

        self.assertEqual(validate_uploads([archive]), "zip")

    def test_accepts_multiple_videos(self):
        uploads = [self.make_file("one.mp4"), self.make_file("two.mov")]

        self.assertEqual(validate_uploads(uploads), "videos")

    def test_accepts_sixty_videos(self):
        uploads = [self.make_file(f"clip-{index:02d}.mp4") for index in range(60)]

        try:
            mode = validate_uploads(uploads)
        except UploadValidationError as error:
            self.fail(f"60개 영상이 거절됐습니다: {error}")
        self.assertEqual(mode, "videos")

    def test_rejects_sixty_one_videos(self):
        uploads = [self.make_file(f"clip-{index:02d}.mp4") for index in range(61)]

        with self.assertRaisesRegex(UploadValidationError, "최대 60개"):
            validate_uploads(uploads)

    def test_rejects_mixed_zip_and_video(self):
        uploads = [self.make_file("clips.zip"), self.make_file("one.mp4")]

        with self.assertRaisesRegex(UploadValidationError, "ZIP"):
            validate_uploads(uploads)

    def test_rejects_unsupported_extension(self):
        with self.assertRaisesRegex(UploadValidationError, "지원하지"):
            validate_uploads([self.make_file("notes.txt")])

    def test_builds_sanitized_sequential_video_archive(self):
        uploads = [self.make_file("my trip.mp4"), self.make_file("odd name.mov")]
        destination = self.root / "input.zip"

        build_input_zip(uploads, destination)

        with zipfile.ZipFile(destination) as archive:
            self.assertEqual(archive.namelist(), ["video_001.mp4", "video_002.mov"])


class SafeZipTests(unittest.TestCase):
    def test_rejects_parent_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "bad.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("../../escape.mp4", b"video")

            with self.assertRaisesRegex(UploadValidationError, "안전하지"):
                safe_zip_members(archive_path)

    def test_rejects_symlink_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "link.zip"
            link = zipfile.ZipInfo("clip.mp4")
            link.create_system = 3
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr(link, "target.mp4")

            with self.assertRaisesRegex(UploadValidationError, "심볼릭 링크"):
                safe_zip_members(archive_path)

    def test_returns_only_supported_video_members(self):
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "good.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("folder/one.mp4", b"video")
                archive.writestr("folder/two.mov", b"video")

            members = safe_zip_members(archive_path)

            self.assertEqual([member.filename for member in members], ["folder/one.mp4", "folder/two.mov"])


class EventStateTests(unittest.TestCase):
    def test_done_event_commits_files_before_publishing_completed_state(self):
        calls = []
        initial = {"state": "running", "stage": "render", "events": [], "next": 0}

        updated = publish_pipeline_event(
            initial,
            {"stage": "done", "video": "result.mp4"},
            commit_files=lambda: calls.append("commit"),
            publish_state=lambda state: calls.append(f"state:{state['state']}"),
        )

        self.assertEqual(calls, ["commit", "state:completed"])
        self.assertEqual(updated["state"], "completed")

    def test_progress_event_does_not_commit_result_files(self):
        calls = []
        initial = {"state": "running", "stage": "render", "events": [], "next": 0}

        publish_pipeline_event(
            initial,
            {"stage": "render", "progress": 1, "total": 2},
            commit_files=lambda: calls.append("commit"),
            publish_state=lambda state: calls.append(f"state:{state['state']}"),
        )

        self.assertEqual(calls, ["state:running"])

    def test_append_event_updates_progress_without_mutating_input(self):
        initial = {"state": "queued", "stage": "queued", "events": [], "next": 0}

        updated = append_event(initial, {"stage": "caption", "msg": "장면 분석"})

        self.assertEqual(initial["events"], [])
        self.assertEqual(updated["state"], "running")
        self.assertEqual(updated["stage"], "caption")
        self.assertEqual(updated["next"], 1)
        self.assertEqual(updated["events"][0]["msg"], "장면 분석")
        self.assertIn("timestamp", updated["events"][0])

    def test_terminal_events_update_state(self):
        initial = {"state": "running", "stage": "render", "events": [], "next": 0}

        completed = append_event(initial, {"stage": "done", "video": "result.mp4"})
        failed = append_event(initial, {"stage": "error", "msg": "render failed"})

        self.assertEqual(completed["state"], "completed")
        self.assertTrue(completed["done"])
        self.assertEqual(failed["state"], "failed")
        self.assertTrue(failed["done"])
        self.assertEqual(failed["error"], "render failed")


class DeploymentInputTests(unittest.TestCase):
    def test_curated_bgm_has_one_mp3_per_mood(self):
        bgm_root = Path(__file__).resolve().parent / "bgm"
        moods = {
            "upbeat",
            "epic",
            "romantic",
            "comedy",
            "world",
            "scoring",
            "electronic",
            "misc",
            "horror",
        }

        self.assertTrue(bgm_root.is_dir())
        self.assertEqual(
            {path.name for path in bgm_root.iterdir() if path.is_dir()}, moods
        )
        for mood in moods:
            tracks = list((bgm_root / mood).glob("*.mp3"))
            self.assertEqual(len(tracks), 1, mood)
            data = tracks[0].read_bytes()
            self.assertGreater(len(data), 100_000, mood)
            self.assertTrue(
                data.startswith(b"ID3")
                or any(
                    data[index] == 0xFF and data[index + 1] & 0xE0 == 0xE0
                    for index in range(min(len(data) - 1, 4096))
                ),
                f"{mood}: MPEG 오디오 프레임을 찾지 못했습니다.",
            )

    def test_sibling_gsulee_pipeline_assets_exist(self):
        workspace = Path(__file__).resolve().parents[2]
        webapp = workspace / "G-SULEE" / "webapp"

        self.assertTrue(
            (webapp / "pipeline.py").is_file(),
            f"G-SULEE pipeline.py가 필요합니다: {webapp / 'pipeline.py'}",
        )
        self.assertTrue(
            (webapp / "static" / "NanumGothic-Bold.ttf").is_file(),
            f"자막 폰트가 필요합니다: {webapp / 'static' / 'NanumGothic-Bold.ttf'}",
        )

    def test_modal_runtime_uses_mounted_source_paths(self):
        backend, gsulee = resolve_source_paths(Path("/root/modal_app.py"), is_local=False)

        self.assertEqual(backend, Path("/root/modal_backend"))
        self.assertEqual(gsulee, Path("/root/gsulee"))


class VolumeSyncTests(unittest.TestCase):
    def test_reload_makes_a_newly_committed_input_visible_to_a_reused_worker(self):
        with tempfile.TemporaryDirectory() as directory:
            input_zip = Path(directory) / "input.zip"

            class StaleVolumeMount:
                def reload(self):
                    input_zip.write_bytes(b"committed zip")

            visible_input = job_utils.reload_volume_file(StaleVolumeMount(), input_zip)

            self.assertTrue(visible_input.is_file())
            self.assertEqual(visible_input.read_bytes(), b"committed zip")


class CorsOriginTests(unittest.TestCase):
    def test_only_the_published_lovable_project_is_allowed_by_default(self):
        build_origins = getattr(job_utils, "build_allowed_origins", lambda _: [])

        origins = build_origins("")

        self.assertIn("https://mytinycutevideo.lovable.app", origins)
        self.assertNotIn("https://another-project.lovable.app", origins)


if __name__ == "__main__":
    unittest.main()
