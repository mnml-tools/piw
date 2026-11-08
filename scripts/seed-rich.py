"""Fills a Piw database with a rich, realistic demo workspace (run after a first launch).

Usage: python3 scripts/seed-rich.py <path/to/piw.sqlite3> [light|dark|system]
Never point it at your real data: scripts/demo.sh uses a separate data directory.
"""
import json
import sqlite3
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

db = sqlite3.connect(sys.argv[1])
theme = sys.argv[2] if len(sys.argv) > 2 else "system"
today = date.today()
now = datetime.now(timezone.utc)
order = iter(range(1024, 100_000_000, 1024))


def uid():
    return str(uuid.uuid4())


def ts(days_ago=0, hours_ago=0):
    moment = now - timedelta(days=days_ago, hours=hours_ago)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def day(offset):
    return (today + timedelta(days=offset)).isoformat()


# ---- Spaces -------------------------------------------------------------------------------
def space(name, color):
    row = db.execute("SELECT id FROM spaces WHERE name = ?", (name,)).fetchone()
    if row:
        db.execute("UPDATE spaces SET color = ? WHERE id = ?", (color, row[0]))
        return row[0]
    sid = uid()
    position = db.execute("SELECT coalesce(max(sort_order), 0) + 1024 FROM spaces").fetchone()[0]
    db.execute(
        "INSERT INTO spaces (id, name, color, sort_order, is_default, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, 0, ?, ?)",
        (sid, name, color, position, ts(30), ts(30)),
    )
    return sid


work = space("Work", "sky")
personal = space("Personal", "mint")
piw = space("Piw", "lavender")
home = space("Home", "peach")

# ---- Tags ---------------------------------------------------------------------------------
tags = {}


def tag(name):
    if name not in tags:
        tid = uid()
        db.execute("INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)", (tid, name, ts(20)))
        tags[name] = tid
    return tags[name]


# ---- Notes --------------------------------------------------------------------------------
def note(space_id, body, days_ago=0, hours_ago=0, inbox=False, tag_names=(), archived=False):
    nid = uid()
    created = ts(days_ago, hours_ago)
    db.execute(
        "INSERT INTO notes (id, space_id, kind, title, body, triaged_at, created_at, updated_at, archived_at)"
        " VALUES (?, ?, 'quick_note', '', ?, ?, ?, ?, ?)",
        (nid, space_id, body, None if inbox else created, created, created, created if archived else None),
    )
    for name in tag_names:
        db.execute("INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)", (nid, tag(name)))
    return nid


# ---- Tasks --------------------------------------------------------------------------------
def task(space_id, title, due=None, document=None, parent=None, done=False, description="",
         days_ago=1, inbox=False, tag_names=()):
    tid = uid()
    created = ts(days_ago)
    db.execute(
        "INSERT INTO tasks (id, space_id, document_id, parent_task_id, title, description, status,"
        " due_date, completed_at, sort_order, triaged_at, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (tid, space_id, document, parent, title, description, "completed" if done else "open",
         day(due) if due is not None else None, ts(max(days_ago - 1, 0)) if done else None,
         next(order), None if (inbox and not document and not parent) else created, created, created),
    )
    for name in tag_names:
        db.execute("INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)", (tid, tag(name)))
    return tid


# ---- ProseMirror helpers ------------------------------------------------------------------
def text(t, *marks):
    node = {"type": "text", "text": t}
    if marks:
        node["marks"] = [{"type": m} if isinstance(m, str) else m for m in marks]
    return node


def link(t, href):
    return text(t, {"type": "link", "attrs": {"href": href}})


def p(*parts):
    return {"type": "paragraph", "content": list(parts)} if parts else {"type": "paragraph"}


def h(level, t):
    return {"type": "heading", "attrs": {"level": level}, "content": [text(t)]}


def bullets(*items):
    return {"type": "bulletList", "content": [{"type": "listItem", "content": [p(text(i))]} for i in items]}


def numbered(*items):
    return {"type": "orderedList", "content": [{"type": "listItem", "content": [p(text(i))]} for i in items]}


def checklist(*items):
    return {"type": "checklist", "content": [
        {"type": "checklistItem", "attrs": {"checked": checked}, "content": [p(text(label))]}
        for label, checked in items
    ]}


def code(language, source):
    return {"type": "codeBlock", "attrs": {"language": language}, "content": [text(source)]}


def quote(t):
    return {"type": "blockquote", "content": [p(text(t))]}


def task_ref(task_id):
    return p({"type": "taskRef", "attrs": {"taskId": task_id}})


def plain(node):
    if node.get("type") == "text":
        return node["text"]
    return " ".join(plain(child) for child in node.get("content", []))


def document(space_id, title, tabs, favourite=None, days_ago=3):
    did = uid()
    db.execute(
        "INSERT INTO notes (id, space_id, kind, title, body, sidebar_order, triaged_at, created_at, updated_at)"
        " VALUES (?, ?, 'document', ?, NULL, ?, ?, ?, ?)",
        (did, space_id, title, favourite, ts(days_ago), ts(days_ago), ts(0, days_ago + 2)),
    )
    for i, (tab_title, kind, blocks) in enumerate(tabs(did)):
        content = {"type": "doc", "content": blocks} if kind == "content" else None
        db.execute(
            "INSERT INTO document_tabs (id, document_id, title, kind, sort_order, content_json, plain_text,"
            " settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (uid(), did, tab_title, kind, i * 1024, json.dumps(content) if content else None,
             plain(content) if content else "",
             json.dumps({"show": "all", "sort": "manual"}) if kind == "tasks" else None,
             ts(days_ago), ts(days_ago)),
        )
    return did


# ---- Documents ----------------------------------------------------------------------------
def refactor_tabs(doc):
    t1 = task(work, "Add unit tests for TOTP verification", 0, doc, days_ago=4, tag_names=["auth"])
    task(work, "Cover clock drift", None, None, t1, True)
    task(work, "Cover replayed codes", None, None, t1)
    t2 = task(work, "Review the recovery-code flow", 2, doc, days_ago=4,
              description="Check the copy on the download screen and the rate limit on reuse.")
    task(work, "Remove the SMS fallback", None, doc, done=True, days_ago=6)
    task(work, "Write the rollout note for support", 5, doc, days_ago=2)
    return [
        ("Overview", "content", [
            h(2, "Problem"),
            p(text("SMS codes are being phased out. Move "), text("TOTP", "bold"),
              text(" verification into the auth service and keep recovery codes working.")),
            h(2, "Plan"),
            checklist(("Read RFC 6238", True), ("Compare libraries", True), ("Agree on the drift window", False)),
            task_ref(t1),
            task_ref(t2),
            h(3, "Verification"),
            code("ts", "export function verify(secret: string, code: string): boolean {\n"
                       "  const window = 1; // ±30 s\n"
                       "  return verifyTotp(secret, code, { window });\n}"),
            quote("Recovery codes are shown once. Make that obvious before the user leaves the page."),
            p(text("Spec: "), link("RFC 6238", "https://datatracker.ietf.org/doc/html/rfc6238"),
              text(" · inline "), text("verifyTotp()", "code"), text(" lives in "), text("auth/totp.ts", "code"), text(".")),
        ]),
        ("Implementation", "content", [
            h(2, "Endpoints"),
            bullets("POST /2fa/enrol returns the otpauth URI", "POST /2fa/verify checks a code",
                    "POST /2fa/recovery consumes one recovery code"),
            h(2, "Migration"),
            numbered("Add the totp_secret column (nullable)", "Backfill nothing: users enrol again",
                     "Drop sms_number after 30 days"),
            code("sql", "ALTER TABLE users ADD COLUMN totp_secret TEXT;\n"
                        "CREATE INDEX users_totp ON users (id) WHERE totp_secret IS NOT NULL;"),
        ]),
        ("To-dos", "tasks", None),
    ]


refactor = document(work, "Refactor 2FA", refactor_tabs, favourite=0, days_ago=5)


def roadmap_tabs(doc):
    task(piw, "Ship the top bar redesign", 1, doc, days_ago=3, tag_names=["design"])
    task(piw, "Record the 140% scale fix in the changelog", 0, doc, days_ago=1)
    task(piw, "Try the app on Windows 11", 6, doc, days_ago=2)
    task(piw, "Test on macOS 14 with SF Pro", 8, doc, days_ago=2)
    task(piw, "Reset sticky positions from Settings", None, doc, done=True, days_ago=9)
    return [
        ("0.2", "content", [
            h(1, "Piw 0.2"),
            p(text("Theme: "), text("calm, fast, desktop-first", "italic"), text(".")),
            h(2, "Must"),
            checklist(("Top bar instead of the sidebar", True), ("Favourites in Notes", True),
                      ("Rich demo data", False)),
            h(2, "Nice to have"),
            bullets("Serif option for the editor", "A comfortable density preference", "Sticky themes"),
        ]),
        ("Ideas", "content", [
            p(text("A Today view that mixes the notes written today with the tasks due today.")),
            p(text("Natural dates in Quick Capture: "), text("tomorrow 9am", "code"), text(", "),
              text("next friday", "code"), text(".")),
        ]),
        ("Tasks", "tasks", None),
    ]


roadmap = document(piw, "Roadmap", roadmap_tabs, favourite=1, days_ago=8)


def trip_tabs(doc):
    task(personal, "Book the train to Porto", -1, doc, days_ago=6)
    task(personal, "Reserve the guesthouse", 3, doc, days_ago=5)
    task(personal, "Buy a travel adapter", None, doc, done=True, days_ago=7)
    return [
        ("Plan", "content", [
            h(2, "Porto, long weekend"),
            p(text("Friday evening to Monday. Trains leave every hour from Santa Apolónia.")),
            h(3, "To see"),
            bullets("Livraria Lello (book ahead)", "Ribeira at sunset", "Serralves museum"),
            h(3, "Packing"),
            checklist(("Rain jacket", False), ("Charger and adapter", True), ("Book for the train", False)),
        ]),
        ("Bookings", "tasks", None),
    ]


trip = document(personal, "Weekend in Porto", trip_tabs, days_ago=10)

# ---- Quick notes --------------------------------------------------------------------------
note(work, "Standup notes\nDeploy moved to Thursday. Pair on the search ranking with Ana.", 0, 1)
note(work, "Call the supplier\nAsk for the revised quote before Friday, and confirm the delivery window.",
     0, 3, inbox=True)
note(personal, "Gift ideas\nBooks, a good coffee grinder, concert tickets, a plant for the office.", 1,
     tag_names=["ideas"])
note(work, "Questions for the security review\nDo we rate-limit TOTP attempts per account or per IP? "
     "How long do recovery codes stay valid? Who can reset 2FA for a user?", 2, tag_names=["auth"])
note(piw, "Design principles\nQuiet chrome. Typography carries the hierarchy. One grid. "
     "Soft selection. Nothing accidental.", 2, tag_names=["design"])
note(personal, "Reading list\nThe Design of Everyday Things — Don Norman\n"
     "A Philosophy of Software Design — John Ousterhout\nShape Up — Ryan Singer", 3, tag_names=["reading"])
note(home, "Kitchen tap\nThe hot side drips. Washer size is probably 1/2\". Ask the plumber on Tuesday.",
     4, inbox=True)
note(work, "1:1 with Marta\n- Wants more ownership of the billing work\n- Holiday 12–19 Dec\n"
     "- Follow up on the promotion case", 5)
note(piw, "Release checklist\nBump the version, regenerate THIRD_PARTY_LICENSES, run pnpm verify, "
     "build on all three platforms, write the changelog.", 6)
note(personal, "Recipes to try\nShakshuka with feta. Miso aubergine. Lemon and ricotta pasta.", 7,
     tag_names=["ideas"])
note(work, "Notes from the quarterly planning offsite: hiring plan, roadmap for the next two releases "
     "and the open questions we parked\nHiring: two backend engineers and one designer by March. "
     "Roadmap: offline search in 0.3, document templates in 0.4. Parked: pricing for teams.", 9)
note(home, "Wi-Fi\nRouter admin is on the sticker under the box. Guest network: casa-visitas.", 12)
note(personal, "Running\n5 km in 27:40 on Sunday. Next: three runs a week, one long run.", 14,
     archived=True)

# ---- Tasks (outside documents) ------------------------------------------------------------
task(work, "Send the weekly update", -1, days_ago=3, inbox=True)
task(work, "Reply to the landlord about the lease renewal", -3, days_ago=8)
task(work, "Prepare the demo for Thursday", 1, days_ago=2,
     description="Use the staging data set. Keep it under ten minutes.")
task(work, "Review Ana's pull request on search ranking", 0, days_ago=1, tag_names=["review"])
task(work, "Migrate the remaining billing webhooks to the new event bus and double-check retries, "
     "idempotency keys and dead-letter handling", 4, days_ago=6,
     description="Start with invoice.paid and invoice.failed. Keep the old worker running until the "
                 "dashboards agree for a full week.")
billing = db.execute("SELECT id FROM tasks WHERE title LIKE 'Migrate the remaining billing%'").fetchone()[0]
task(work, "Map every webhook to its event", None, None, billing, True)
task(work, "Load-test retries with 10× traffic", None, None, billing)
task(work, "Book a room for the retro", 7, days_ago=1)
task(personal, "Book the dentist", 0, days_ago=2)
task(personal, "Renew passport", 9, days_ago=10, description="Photos from the shop on Rua Augusta.")
task(personal, "Buy coffee", None, days_ago=0, inbox=True)
task(personal, "Call grandma", 2, days_ago=1)
task(personal, "Pay the electricity bill", -2, days_ago=5)
task(home, "Fix the kitchen tap", 3, days_ago=4)
task(home, "Order a new filter for the purifier", None, days_ago=1, inbox=True)
task(home, "Take the old monitor to recycling", 12, days_ago=3)
task(piw, "Answer the GitHub issue about Wayland shortcuts", 1, days_ago=1, inbox=True)
task(piw, "Write the README section on HiDPI", None, days_ago=2)
task(work, "Expense report for October", None, done=True, days_ago=4)
task(personal, "Return the library books", None, done=True, days_ago=3)
task(home, "Change the smoke alarm battery", None, done=True, days_ago=6)

# ---- Stickies and settings ----------------------------------------------------------------
def first(sql, *args):
    return db.execute(sql, args).fetchone()[0]


stickies = [
    ("note", first("SELECT id FROM notes WHERE body LIKE 'Gift ideas%'"), "yellow"),
    ("task", first("SELECT id FROM tasks WHERE title = 'Add unit tests for TOTP verification'"), None),
    ("tasks_tab", first("SELECT id FROM document_tabs WHERE document_id = ? AND kind = 'tasks'", roadmap), "mint"),
]
for kind, target, color in stickies:
    db.execute(
        "INSERT OR REPLACE INTO sticky_windows (target_kind, target_id, width, height, always_on_top, color,"
        " is_open, created_at, updated_at) VALUES (?, ?, 300, 260, 0, ?, 0, ?, ?)",
        (kind, target, color, ts(1), ts(1)),
    )

for key, value in [("theme", theme), ("trayNoticeShown", True)]:
    db.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
               (key, json.dumps(value), ts()))
db.commit()
counts = {t: db.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
          for t in ("spaces", "notes", "document_tabs", "tasks", "tags", "sticky_windows")}
print("seeded:", ", ".join(f"{v} {k}" for k, v in counts.items()))
