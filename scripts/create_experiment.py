#!/usr/bin/env python3
"""Build an isolated draggable video-comparison experiment.

Private source paths are accepted only in the input spec. Generated public files
contain relative paths and probed media metadata, never the original paths.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from fractions import Fraction
from pathlib import Path


SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec", required=True, type=Path, help="Private JSON specification")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--update", action="store_true", help="Explicitly replace an existing slug")
    return parser.parse_args()


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def probe(path: Path) -> dict:
    if not path.is_file():
        raise FileNotFoundError(path)
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise RuntimeError("ffprobe is required and was not found in PATH")
    result = subprocess.run(
        [
            ffprobe,
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,nb_frames:format=duration,size",
            "-of", "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    stream = payload["streams"][0]
    fmt = payload["format"]
    fps = float(Fraction(stream["r_frame_rate"]))
    duration = float(fmt["duration"])
    frames = int(stream.get("nb_frames") or round(duration * fps))
    return {
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "fps": round(fps, 6),
        "frames": frames,
        "duration": round(duration, 6),
        "size": int(fmt["size"]),
        "sha256": sha256(path),
    }


def validate_pair(left: dict, right: dict, case_id: str) -> None:
    if abs(left["fps"] - right["fps"]) > 0.01:
        raise ValueError(f"{case_id}: frame rates differ: {left['fps']} vs {right['fps']}")
    if abs(left["duration"] - right["duration"]) > 0.10:
        raise ValueError(f"{case_id}: durations differ: {left['duration']} vs {right['duration']}")
    if abs(left["frames"] - right["frames"]) > 1:
        raise ValueError(f"{case_id}: frame counts differ: {left['frames']} vs {right['frames']}")


def copy_verified(source: Path, destination: Path, expected: dict) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    if destination.stat().st_size != expected["size"] or sha256(destination) != expected["sha256"]:
        raise RuntimeError(f"copy verification failed: {destination}")


def public_case(case: dict, left_meta: dict, right_meta: dict) -> dict:
    case_id = case["id"]
    return {
        "id": case_id,
        "title": case.get("title", case_id),
        "left": f"videos/{case_id}/before.mp4",
        "right": f"videos/{case_id}/after.mp4",
        "leftMeta": left_meta,
        "rightMeta": right_meta,
    }


def build_experiment(root: Path, spec: dict, update: bool) -> Path:
    slug = spec.get("slug", "")
    if not SLUG_RE.fullmatch(slug):
        raise ValueError("slug must contain lowercase letters, digits, and single hyphens only")
    cases = spec.get("cases")
    if not isinstance(cases, list) or not cases:
        raise ValueError("spec.cases must be a non-empty list")

    experiments_dir = root / "experiments"
    target = experiments_dir / slug
    if target.exists() and not update:
        raise FileExistsError(f"{target} already exists; use --update explicitly")

    temp_parent = experiments_dir
    temp_parent.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix=f".{slug}-", dir=temp_parent))
    try:
        template = root / "templates" / "experiment.html"
        shutil.copy2(template, temp / "index.html")
        public_cases = []
        seen_ids = set()
        for case in cases:
            case_id = case.get("id", "")
            if not SLUG_RE.fullmatch(case_id.replace("_", "-")):
                raise ValueError(f"invalid case id: {case_id!r}")
            if case_id in seen_ids:
                raise ValueError(f"duplicate case id: {case_id}")
            seen_ids.add(case_id)
            left_source = Path(case["left"]).expanduser().resolve()
            right_source = Path(case["right"]).expanduser().resolve()
            left_meta = probe(left_source)
            right_meta = probe(right_source)
            validate_pair(left_meta, right_meta, case_id)
            copy_verified(left_source, temp / "videos" / case_id / "before.mp4", left_meta)
            copy_verified(right_source, temp / "videos" / case_id / "after.mp4", right_meta)
            public_cases.append(public_case(case, left_meta, right_meta))

        manifest = {
            "schemaVersion": 1,
            "slug": slug,
            "title": spec["title"],
            "description": spec["description"],
            "leftLabel": spec.get("leftLabel", "Before"),
            "rightLabel": spec.get("rightLabel", "After"),
            "notes": spec.get("notes", []),
            "settings": spec.get("settings", []),
            "links": spec.get("links", []),
            "cases": public_cases,
        }
        (temp / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        if target.exists():
            backup_root = root / ".comparison-backups"
            backup_root.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            target.rename(backup_root / f"{slug}-{stamp}")
        temp.rename(target)
    except Exception:
        shutil.rmtree(temp, ignore_errors=True)
        raise

    registry_path = root / "experiments.json"
    registry = load_json(registry_path) if registry_path.exists() else {"experiments": []}
    entry = {
        "slug": slug,
        "title": spec["title"],
        "summary": spec["summary"],
        "href": f"experiments/{slug}/",
        "caseCount": len(cases),
        "leftLabel": spec.get("leftLabel", "Before"),
        "rightLabel": spec.get("rightLabel", "After"),
        "updated": spec.get("updated", datetime.now().date().isoformat()),
    }
    existing = [item for item in registry.get("experiments", []) if item.get("slug") != slug]
    existing.append(entry)
    registry["experiments"] = existing
    registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return target


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    spec = load_json(args.spec.resolve())
    target = build_experiment(root, spec, args.update)
    print(f"Built {target}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
