#!/usr/bin/env python3
"""Create or update an admin account with a password you choose.

The safe replacement for seed.py on a production box.

    python scripts/create_admin.py                  # prompts for everything
    python scripts/create_admin.py --username kushal --email me@example.com

The password is read from a prompt, never from argv, so it doesn't land in
your shell history or the process list.
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402

MIN_PASSWORD_LENGTH = 12


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or update a SyncUp admin account.")
    parser.add_argument("--username")
    parser.add_argument("--full-name")
    parser.add_argument("--email", default="")
    parser.add_argument("--phone", default="")
    args = parser.parse_args()

    username = args.username or input("Username: ").strip()
    if not username:
        print("Username is required.", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.username == username))
        if existing is not None and existing.role != "admin":
            print(f"'{username}' already exists as a {existing.role} account.", file=sys.stderr)
            return 1

        full_name = args.full_name or (existing.full_name if existing else "") or input("Full name: ").strip()
        email = args.email or (existing.email if existing else "")
        phone = args.phone or (existing.phone if existing else "")

        password = getpass.getpass("Password: ")
        if len(password) < MIN_PASSWORD_LENGTH:
            print(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.", file=sys.stderr)
            return 1
        if password != getpass.getpass("Confirm password: "):
            print("Passwords do not match.", file=sys.stderr)
            return 1

        if existing is not None:
            existing.full_name = full_name or existing.full_name
            existing.email = email
            existing.phone = phone
            existing.hashed_password = hash_password(password)
            existing.is_active = True
            action = "updated"
        else:
            db.add(User(
                username=username,
                full_name=full_name or username,
                hashed_password=hash_password(password),
                role="admin",
                email=email,
                phone=phone,
            ))
            action = "created"
        db.commit()
        print(f"Admin '{username}' {action}.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
