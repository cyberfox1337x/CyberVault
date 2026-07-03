"""
Helpers for MCP subprocess environments.
"""

import os
from typing import Dict, Optional


def _path_key(path: str) -> str:
    try:
        return os.path.normcase(os.path.abspath(path))
    except (OSError, TypeError, ValueError):
        return os.path.normcase(path)


def build_builtin_python_env(app_root: str, inherited_pythonpath: Optional[str] = None) -> Dict[str, str]:
    """Prepend the app root to PYTHONPATH while preserving inherited entries."""
    inherited = os.environ.get("PYTHONPATH", "") if inherited_pythonpath is None else inherited_pythonpath
    parts = []
    seen = set()

    def add_path(path: str) -> None:
        path = (path or "").strip()
        if not path:
            return
        key = _path_key(path)
        if key in seen:
            return
        seen.add(key)
        parts.append(path)

    add_path(app_root)
    for path in (inherited or "").split(os.pathsep):
        add_path(path)

    return {"PYTHONPATH": os.pathsep.join(parts)}
