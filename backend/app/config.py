from __future__ import annotations

from pydantic_settings import BaseSettings

DEFAULT_SECRET = "change-me-in-production"


class Settings(BaseSettings):
    # "dev" relaxes the startup safety checks. Anything else is treated as production.
    ENV: str = "dev"

    DATABASE_URL: str = "sqlite:///./app.db"
    SECRET_KEY: str = DEFAULT_SECRET
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 20
    REPORT_LINK_EXPIRE_DAYS: int = 30
    FRONTEND_PUBLIC_URL: str = "http://localhost:5173"

    # Report share links expose the project budget only when this is on.
    REPORT_SHOW_BUDGET: bool = False

    # ---- Feedback widget limits ----
    # Screenshots are far smaller than general attachments, so they get their own cap.
    WIDGET_MAX_SCREENSHOT_MB: int = 5
    WIDGET_RATE_PER_HOUR: int = 60       # per widget key
    WIDGET_RATE_PER_IP_PER_HOUR: int = 20

    # ---- Login protection ----
    LOGIN_MAX_ATTEMPTS: int = 8          # per username+IP before lockout
    LOGIN_WINDOW_MINUTES: int = 15
    LOGIN_LOCKOUT_MINUTES: int = 15

    # ---- Client magic links ----
    MAGIC_LINK_EXPIRE_DAYS: int = 30

    # ---- Email (optional; notifications are skipped when unset) ----
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_FROM_NAME: str = "Aurocode SyncUp"
    SMTP_STARTTLS: bool = True

    # ---- Error reporting (optional) ----
    SENTRY_DSN: str = ""

    class Config:
        env_file = ".env"

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() not in ("dev", "development", "local", "test")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def email_enabled(self) -> bool:
        return bool(self.SMTP_HOST and self.SMTP_FROM)

    def check_production_safety(self) -> list[str]:
        """Return a list of fatal misconfigurations. Empty list means safe to boot."""
        problems: list[str] = []
        if not self.is_production:
            return problems
        if self.SECRET_KEY == DEFAULT_SECRET or len(self.SECRET_KEY) < 32:
            problems.append(
                "SECRET_KEY is unset, default, or too short. "
                "Generate one with: openssl rand -hex 32"
            )
        if "REPLACE_WITH" in self.CORS_ORIGINS:
            problems.append("CORS_ORIGINS still contains a placeholder value.")
        if self.FRONTEND_PUBLIC_URL.startswith("http://") and "localhost" not in self.FRONTEND_PUBLIC_URL:
            problems.append("FRONTEND_PUBLIC_URL must use https:// outside local development.")
        return problems


settings = Settings()
