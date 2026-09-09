from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import settings
from app.routers import (
    activity, attachments, auth, chat, comments, dashboard, notifications, projects, reports, status, tasks, users,
    widget,
)

app = FastAPI(title="Proposal Manager API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WidgetCORSMiddleware(BaseHTTPMiddleware):
    """Allows the embeddable feedback widget to post from any client website.

    The widget script runs on a third-party domain (the agency's client site),
    so the usual origin allow-list can't cover it. Only the public, write-only
    feedback route gets opened up — every other endpoint keeps the normal
    CORS policy above.
    """

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/api/public/widget/"):
            return await call_next(request)
        if request.method == "OPTIONS":
            return Response(status_code=204, headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Max-Age": "600",
            })
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response


# Added after CORSMiddleware so it becomes the outermost layer and can
# intercept the widget's cross-origin preflight before the origin allow-list runs.
app.add_middleware(WidgetCORSMiddleware)

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
