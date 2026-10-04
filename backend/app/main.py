import logging
import re
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings
from app.database import SessionLocal
from app.routers import (
    activity, attachments, auth, chat, comments, dashboard, notifications, projects, reports, status, tasks, users,
    widget,
)
from app.services.widget_cache import allowed_origins_for

log = logging.getLogger("syncup")

# Refuse to boot a production instance with a default secret or placeholder
# config. Failing loudly at startup beats discovering it after a breach.
_problems = settings.check_production_safety()
if _problems:
    for problem in _problems:
        print(f"FATAL: {problem}", file=sys.stderr)
    print(
        "Refusing to start. Fix the above in your .env, or set ENV=dev for local work.",
        file=sys.stderr,
    )
    raise SystemExit(1)

app = FastAPI(title="Proposal Manager API", version="1.0.0")

if settings.SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENV,
            integrations=[FastApiIntegration()],
            traces_sample_rate=0.0,
            send_default_pii=False,
        )
        log.info("Sentry error reporting enabled")
    except Exception as exc:  # noqa: BLE001 - never block startup on telemetry
        log.warning("Sentry requested but could not start: %s", exc)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WIDGET_PATH = re.compile(r"^/api/public/widget/([A-Za-z0-9_-]{1,64})(/|$)")


class WidgetCORSMiddleware(BaseHTTPMiddleware):
    """Opens the public widget routes to the sites each key is allowed on.

    The widget script runs on a third-party domain (the agency's client site),
    so the usual origin allow-list can't cover it. Rather than a blanket `*`,
    the requesting origin is reflected back only when that project's allow-list
    permits it. An empty allow-list means the admin hasn't locked the key down
    yet, so any origin is accepted — matching the old behaviour until they do.
    """

    async def dispatch(self, request: Request, call_next):
        match = WIDGET_PATH.match(request.url.path)
        if not match:
            return await call_next(request)

        widget_key = match.group(1)
        origin = request.headers.get("origin", "")
        allowed = allowed_origins_for(widget_key)

        permitted = True
        if allowed is None:
            permitted = False  # unknown key
        elif allowed and origin:
            permitted = origin.rstrip("/").lower() in allowed

        if request.method == "OPTIONS":
            if not permitted:
                return Response(status_code=403)
            return Response(status_code=204, headers={
                "Access-Control-Allow-Origin": origin or "*",
                "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Max-Age": "600",
                "Vary": "Origin",
            })

        if not permitted:
            return JSONResponse(
                {"detail": "This origin is not allowed to use this widget"}, status_code=403
            )

        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = origin or "*"
        response.headers["Vary"] = "Origin"
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Defence-in-depth headers. nginx sets these too; duplicating is harmless
    and keeps them present when the app is reached directly."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        if settings.is_production:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


# Added after CORSMiddleware so it becomes the outermost layer and can
# intercept the widget's cross-origin preflight before the origin allow-list runs.
app.add_middleware(WidgetCORSMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

for router in (auth.router, users.router, dashboard.router, projects.router,
               tasks.router, comments.router, attachments.router, activity.router,
               notifications.router, chat.router, status.router, reports.router, widget.router):
    app.include_router(router)


@app.on_event("startup")
def ensure_upload_dir():
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok"}


@app.get("/healthz", tags=["health"])
def healthz():
    """Liveness + database reachability, for an external uptime monitor."""
    from sqlalchemy import text

    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "ok"}
    except Exception as exc:  # noqa: BLE001
        log.error("health check failed: %s", exc)
        return JSONResponse({"status": "degraded", "database": "error"}, status_code=503)
    finally:
        db.close()
