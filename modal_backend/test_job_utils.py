import stat
import tempfile
import unittest
import zipfile
from pathlib import Path

from modal_backend.job_utils import (
    UploadValidationError,
    append_event,
    build_input_zip,
    safe_zip_members,
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


if __name__ == "__main__":
    unittest.main()
