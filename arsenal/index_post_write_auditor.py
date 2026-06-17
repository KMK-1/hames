import json
import os
import subprocess
import sys


def _detect_workspace(normalized: str):
    """경로가 어떤 workspace 안에 있으면 'workspaces/<Name>' 반환, 아니면 None.
    기본 4개뿐 아니라 사용자가 추가한 임의 워크스페이스도 처리한다."""
    parts = normalized.split("/")
    if "workspaces" in parts:
        i = parts.index("workspaces")
        if i + 1 < len(parts):
            return "/".join(parts[: i + 2])
    return None


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    file_path = payload.get("tool_input", {}).get("file_path", "")
    if not file_path:
        return 0

    try:
        root = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

    normalized = file_path.replace("\\", "/")
    workspace = _detect_workspace(normalized)
    if not workspace:
        return 0

    subprocess.run(
        [sys.executable, "arsenal/manager.py", workspace],
        cwd=root,
        check=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
