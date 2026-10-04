"""Short-lived cache of each widget key's allowed origins.

The CORS middleware needs the allow-list on every public widget request, well
before the route handler runs. Allow-lists change rarely, so a small TTL cache
keeps that off the database without making changes feel stale.
"""
from __future__ import annotations

import time
from typing import Dict, List, Optional, Tuple

_cache: Dict[str, Tuple[float, List[str]]] = {}
_TTL = 60.0


def allowed_origins_for(widget_key: str) -> Optional[List[str]]:
    """The allow-list for a key: [] means "any origin", None means "unknown key"."""
    cached = _cache.get(widget_key)
    now = time.monotonic()
    if cached and now - cached[0] < _TTL:
        return cached[1]

    from app.database import SessionLocal
    from app.models import Project

    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.widget_key == widget_key).first()
        if project is None:
            return None
        origins = [o.strip().rstrip("/").lower() for o in project.widget_origins.split(",") if o.strip()]
    finally:
        db.close()

    _cache[widget_key] = (now, origins)
    return origins


def invalidate(widget_key: Optional[str]) -> None:
    if widget_key:
        _cache.pop(widget_key, None)
