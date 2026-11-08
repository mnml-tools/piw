"""Seeds a Piw database with neutral demo content for screenshots (run after a first launch)."""
import json
import sqlite3
import sys
import uuid
from datetime import date, timedelta

db = sqlite3.connect(sys.argv[1])
theme = sys.argv[2] if len(sys.argv) > 2 else "light"
ts = "2026-11-06T09:00:00.000Z"
today = date.today()
work = db.execute("SELECT id FROM spaces WHERE name = 'Work'").fetchone()[0]
personal = db.execute("SELECT id FROM spaces WHERE name = 'Personal'").fetchone()[0]
order = iter(range(0, 10_000_000, 1024))


def uid():
    return str(uuid.uuid4())


def note(space, body, title=""):
    nid = uid()
    db.execute(
        "INSERT INTO notes (id, space_id, kind, title, body, created_at, updated_at) VALUES (?, ?, 'quick_note', ?, ?, ?, ?)",
        (nid, space, title, body, ts, ts),
    )
    return nid


def task(space, title, due=None, document=None, parent=None, done=False, description=""):
    tid = uid()
    db.execute(
        "INSERT INTO tasks (id, space_id, document_id, parent_task_id, title, description, status, due_date, completed_at, sort_order, created_at, updated_at, triaged_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (tid, space, document, parent, title, description, "completed" if done else "open",
         due.isoformat() if due else None, ts if done else None, next(order), ts, ts, ts if document else None),
    )
    return tid


def text(t):
    return {"type": "text", "text": t}


def para(*parts):
    return {"type": "paragraph", "content": list(parts)} if parts else {"type": "paragraph"}


# Document "Refactor 2FA" with content and tasks tabs.
doc = uid()
db.execute(
    "INSERT INTO notes (id, space_id, kind, title, body, sidebar_order, created_at, updated_at) VALUES (?, ?, 'document', 'Refactor 2FA', NULL, 0, ?, ?)",
    (doc, work, ts, ts),
)
t1 = task(work, "Add unit tests for TOTP verification", today, doc)
task(work, "Cover clock drift", None, None, t1, True)
task(work, "Cover replayed codes", None, None, t1)
t2 = task(work, "Review the recovery-code flow", today + timedelta(days=2), doc)
task(work, "Remove the SMS fallback", None, doc, done=True)
overview = {"type": "doc", "content": [
    {"type": "heading", "attrs": {"level": 2}, "content": [text("Problem")]},
    para(text("SMS codes are being phased out. Move TOTP verification into the auth service and keep recovery codes working.")),
    {"type": "heading", "attrs": {"level": 2}, "content": [text("Plan")]},
    {"type": "checklist", "content": [
        {"type": "checklistItem", "attrs": {"checked": True}, "content": [para(text("Read RFC 6238"))]},
        {"type": "checklistItem", "attrs": {"checked": False}, "content": [para(text("Compare libraries"))]},
    ]},
    para({"type": "taskRef", "attrs": {"taskId": t1}}),
    para({"type": "taskRef", "attrs": {"taskId": t2}}),
    {"type": "codeBlock", "attrs": {"language": "ts"}, "content": [text("const valid = verifyTotp(secret, code, { window: 1 });")]},
]}
implementation = {"type": "doc", "content": [para(text("Endpoints, migrations and rollout notes."))]}
for i, (title, kind, content) in enumerate([
    ("Overview", "content", overview),
    ("Implementation", "content", implementation),
    ("To-dos", "tasks", None),
]):
    db.execute(
        "INSERT INTO document_tabs (id, document_id, title, kind, sort_order, content_json, plain_text, settings, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (uid(), doc, title, kind, i * 1024, json.dumps(content) if content else None, "",
         json.dumps({"show": "all", "sort": "manual"}) if kind == "tasks" else None, ts, ts),
    )

note(work, "Call the supplier\nAsk for the revised quote before Friday.")
note(personal, "Gift ideas\nBooks, a good coffee grinder, concert tickets.")
note(work, "Standup notes\nDeploy moved to Thursday. Pair on the search ranking.")
task(personal, "Buy coffee")
task(personal, "Book the dentist", today)
task(work, "Send the weekly update", today - timedelta(days=1))
task(work, "Prepare the demo", today + timedelta(days=1))
task(personal, "Renew passport", today + timedelta(days=9))
db.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('theme', ?, ?)", (json.dumps(theme), ts))
db.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('trayNoticeShown', 'true', ?)", (ts,))
db.commit()
print(doc)
