"""Outbound email.

Sending happens on a background thread so a slow or unreachable SMTP server
can never block an API response. Delivery is best-effort by design: an email
that fails to send is logged, never raised, because losing a notification must
not fail the action that triggered it.
"""
from __future__ import annotations

import logging
import smtplib
import threading
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
from typing import Optional

from app.config import settings

log = logging.getLogger("syncup.email")


def _send_blocking(to: str, subject: str, text: str, html: Optional[str]) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.SMTP_FROM_NAME, settings.SMTP_FROM))
    msg["To"] = to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            if settings.SMTP_STARTTLS:
                smtp.starttls()
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(msg)
        log.info("sent email to=%s subject=%r", to, subject)
    except Exception as exc:  # noqa: BLE001 - never surface to the caller
        log.warning("email send failed to=%s subject=%r error=%s", to, subject, exc)


def send_email(to: str, subject: str, text: str, html: Optional[str] = None) -> bool:
    """Queue an email. Returns False if email isn't configured or there's no address."""
    if not settings.email_enabled or not to:
        return False
    threading.Thread(
        target=_send_blocking, args=(to, subject, text, html), daemon=True
    ).start()
    return True


def render_email(heading: str, body_lines: list[str], cta_label: str = "", cta_url: str = "") -> tuple[str, str]:
    """Build matching plain-text and HTML bodies. Returns (text, html)."""
    text_parts = [heading, ""] + body_lines
    if cta_url:
        text_parts += ["", f"{cta_label}: {cta_url}" if cta_label else cta_url]
    text_parts += ["", "— Aurocode SyncUp"]
    text = "\n".join(text_parts)

    paragraphs = "".join(
        f'<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#39424e">{escape(line)}</p>'
        for line in body_lines
        if line
    )
    button = ""
    if cta_url:
        button = (
            f'<p style="margin:22px 0 0"><a href="{escape(cta_url)}" '
            'style="display:inline-block;background:#0e7c86;color:#ffffff;text-decoration:none;'
            'padding:11px 20px;border-radius:6px;font-size:15px;font-weight:600">'
            f'{escape(cta_label or "Open")}</a></p>'
        )
    html = (
        '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;'
        'max-width:520px;margin:0 auto;padding:28px 24px;background:#ffffff">'
        f'<h1 style="margin:0 0 16px;font-size:19px;font-weight:600;color:#141a22">{escape(heading)}</h1>'
        f"{paragraphs}{button}"
        '<p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #e7eaef;'
        'font-size:12px;color:#69737f">Aurocode SyncUp</p>'
        "</div>"
    )
    return text, html
