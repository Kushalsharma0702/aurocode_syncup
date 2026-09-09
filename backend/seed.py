"""Idempotent seed script — creates demo accounts and a sample proposal.

Run after migrations: python seed.py
"""
from datetime import date, timedelta

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Comment, Message, Project, Task, User
from app.security import hash_password
from app.services.activity import log_activity
from app.services.notify import notify, notify_admins


def seed() -> None:
    db = SessionLocal()
    try:
        if db.scalar(select(User).where(User.username == "admin")):
            print("Database already seeded — skipping.")
            return

        admin = User(
            username="admin",
            full_name="Admin User",
            hashed_password=hash_password("admin123"),
            role="admin",
        )
        client1 = User(
            username="client1",
            full_name="Riya Sharma",
            hashed_password=hash_password("password123"),
            role="client",
        )
        client2 = User(
            username="client2",
            full_name="David Chen",
            hashed_password=hash_password("password123"),
            role="client",
        )
        db.add_all([admin, client1, client2])
        db.flush()

        project = Project(
            name="Aurocode SyncUp Platform",
            client_name="Riya Sharma",
            client_id=client1.id,
            description=(
                "A collaborative project workspace that keeps distributed teams aligned. "
                "SyncUp centralises proposals, tasks and client communication in one place."
            ),
            objective=(
                "Deliver a production-ready web platform that lets Aurocode share project "
                "proposals with clients, track task progress and collect structured feedback."
            ),
            scope=(
                "Discovery workshops, UX design, web application development (admin and client "
                "portals), REST API, deployment pipeline and a 30-day post-launch support window."
            ),
            deliverables=(
                "1. Responsive web application\n"
                "2. REST API with documentation\n"
                "3. Admin dashboard\n"
                "4. Client portal\n"
                "5. Deployment scripts and handover documentation"
            ),
            timeline="12 weeks (Kick-off to launch)",
            budget="$24,500",
            status="In Review",
        )
        db.add(project)
        db.flush()

        second = Project(
            name="Mobile Companion App",
            client_name="David Chen",
            client_id=client2.id,
            description="A lightweight mobile companion app for field teams.",
            objective="Give field engineers offline access to task lists and project updates.",
            scope="iOS and Android builds via a cross-platform framework, push notifications, offline sync.",
            deliverables="1. Mobile app (iOS + Android)\n2. Push notification service\n3. App store submission",
            timeline="8 weeks",
            budget="$15,000",
            status="Draft",
        )
        db.add(second)
        db.flush()

        today = date.today()
        tasks = [
            Task(project_id=project.id, title="Finalise UX wireframes", assigned_to="Priya Patel",
                 description="Complete high-fidelity wireframes for all client-facing screens.",
                 priority="High", status="Completed", due_date=today - timedelta(days=14)),
            Task(project_id=project.id, title="Set up CI/CD pipeline", assigned_to="Marco Rossi",
                 description="GitHub Actions pipeline with automated tests and staging deploys.",
                 priority="Medium", status="Completed", due_date=today - timedelta(days=7)),
            Task(project_id=project.id, title="Implement authentication", assigned_to="Sofia Lee",
                 description="JWT auth with role-based access for admin and client portals.",
                 priority="Critical", status="In Progress", due_date=today + timedelta(days=3)),
            Task(project_id=project.id, title="Build proposal module", assigned_to="Sofia Lee",
                 description="CRUD screens for proposals, including status workflow.",
                 priority="High", status="In Progress", due_date=today + timedelta(days=10)),
            Task(project_id=project.id, title="Client portal QA pass", assigned_to="QA Team",
                 description="Full regression across supported browsers.",
                 priority="Medium", status="Pending", due_date=today + timedelta(days=21)),
            Task(project_id=project.id, title="Load testing", assigned_to="Marco Rossi",
                 description="Blocked until staging environment is provisioned.",
                 priority="Low", status="Blocked", due_date=today + timedelta(days=28)),
            Task(project_id=second.id, title="Choose cross-platform framework", assigned_to="Tech Lead",
                 description="Evaluate React Native vs Flutter for the companion app.",
                 priority="High", status="Pending", due_date=today + timedelta(days=5)),
        ]
        db.add_all(tasks)

        db.add_all([
            Comment(project_id=project.id, user_id=admin.id,
                    message="Hi Riya — the proposal is ready for your review. The timeline section reflects our discussion from last week."),
            Comment(project_id=project.id, user_id=client1.id,
                    message="Thanks! The scope looks good overall. Could we clarify whether the 30-day support window includes minor feature tweaks?"),
            Comment(project_id=project.id, user_id=admin.id,
                    message="Good question — the support window covers bug fixes and small copy/style tweaks. New features would be scoped separately."),
        ])

        log_activity(db, admin, "Proposal Created", f"Proposal '{project.name}' created", project.id)
        log_activity(db, admin, "Task Added", "6 tasks added to 'Aurocode SyncUp Platform'", project.id)
        log_activity(db, admin, "Status Changed", f"Proposal '{project.name}' status: Draft → In Review", project.id)
        log_activity(db, client1, "Comment Added",
                     f"{client1.full_name} commented on '{project.name}'", project.id)
        log_activity(db, admin, "Proposal Created", f"Proposal '{second.name}' created", second.id)

        notify(db, client1.id, "Welcome to Aurocode SyncUp",
               "Your proposal 'Aurocode SyncUp Platform' is ready for review.", project.id)
        notify(db, client1.id, f"Proposal status updated: {project.name}",
               "Status changed from Draft to In Review", project.id)
        notify_admins(db, f"New client comment on {project.name}",
                      f"{client1.full_name}: Thanks! The scope looks good overall…", project.id)

        db.add_all([
            Message(thread_user_id=client1.id, sender_id=admin.id,
                    body="Hi Riya, welcome aboard! Feel free to message me here any time — this chat comes straight to me."),
            Message(thread_user_id=client1.id, sender_id=client1.id,
                    body="Thanks! Great to have a direct line. I'll drop questions here as they come up."),
        ])

        db.commit()
        print("Seed complete.")
        print("  Admin  → admin / admin123")
        print("  Client → client1 / password123")
        print("  Client → client2 / password123")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
