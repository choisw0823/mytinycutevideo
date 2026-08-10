# Curated demo BGM

This directory contains one presentation-safe background track for each mood supported by `G-SULEE/webapp/pipeline.py`.

The tracks come from the [SoundSafari CC0-1.0-Music archive](https://github.com/SoundSafari/CC0-1.0-Music/tree/main/freepd.com), which preserves music published by FreePD under CC0 1.0. The upstream license file is available at [LICENSE.txt](https://github.com/SoundSafari/CC0-1.0-Music/blob/main/LICENSE.txt). The files were retrieved on 2026-08-10.

| Mood | Track |
| --- | --- |
| comedy | Alls Fair In Love |
| electronic | 3 am West End |
| epic | Adventure |
| horror | Alien Invasion |
| misc | A Good Bass for Gambling |
| romantic | A Very Brady Special |
| scoring | Action Strike |
| upbeat | Advertime |
| world | Aquatic City Vanished |

Run `bash modal_backend/scripts/fetch_demo_bgm.sh modal_backend/bgm` from the web project root to restore the exact curated files. The Modal render image packages these files at `/root/bgm`; rendering never downloads music at runtime.
