"""A small in-process sliding-window rate limiter.

Deliberately dependency-free. Two caveats worth knowing:

1. State lives in the worker process, so with N uvicorn workers the effective
   limit is N x the configured value. That is fine as a backstop — nginx's
   `limit_req` is the real first line of defence and runs before we do.
2. State is lost on restart. Again fine: these limits exist to stop abuse and
   brute force, not to meter billing.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict

_lock = threading.Lock()
_hits: Dict[str, Deque[float]] = defaultdict(deque)
_last_sweep = 0.0
# Keys idle for longer than this are dropped so the dict can't grow unbounded.
_SWEEP_AFTER = 3600.0


def _sweep(now: float) -> None:
    global _last_sweep
    if now - _last_sweep < 300:
        return
    _last_sweep = now
    for key in [k for k, v in _hits.items() if not v or now - v[-1] > _SWEEP_AFTER]:
        _hits.pop(key, None)


def hit(key: str, limit: int, window_seconds: int) -> bool:
    """Record an attempt. Returns True if it is allowed, False if over the limit."""
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        _sweep(now)
        bucket = _hits[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True


def peek(key: str, limit: int, window_seconds: int) -> bool:
    """Check a limit without consuming an attempt."""
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        bucket = _hits[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        return len(bucket) < limit


def reset(key: str) -> None:
    """Clear a bucket — used to drop the failed-login count after a success."""
    with _lock:
        _hits.pop(key, None)


def retry_after(key: str, window_seconds: int) -> int:
    """Seconds until the oldest hit in the bucket falls out of the window."""
    now = time.monotonic()
    with _lock:
        bucket = _hits.get(key)
        if not bucket:
            return 0
        return max(1, int(window_seconds - (now - bucket[0])))


def client_ip(request) -> str:
    """Best-effort client IP. nginx sets X-Forwarded-For; fall back to the socket."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    return (request.client.host if request.client else "unknown")[:45]
