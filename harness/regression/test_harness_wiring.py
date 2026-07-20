from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def test_agents_md() -> None:
    assert (ROOT / "AGENTS.md").is_file()


def test_makefile() -> None:
    text = (ROOT / "Makefile").read_text(encoding="utf-8")
    assert "harness-offline:" in text
    assert "harness-smoke:" in text


def test_n8n_smoke_script_exists() -> None:
    script = ROOT / "harness/smoke/consult_n8n.sh"
    assert script.is_file()
    assert script.stat().st_mode & 0o111


@pytest.mark.parametrize("name", ["mark-harness-dirty.sh", "auto-harness-stop.sh"])
def test_hooks(name: str) -> None:
    p = ROOT / ".cursor/hooks" / name
    assert p.is_file() and p.stat().st_mode & 0o111


def test_hooks_json() -> None:
    data = json.loads((ROOT / ".cursor/hooks.json").read_text(encoding="utf-8"))
    assert data["hooks"]["stop"][0].get("loop_limit", 0) >= 1
