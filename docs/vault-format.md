# Vault format

Format version 1. This is the contract for the redesign in [redesign.md](redesign.md): what Piw
reads from a folder of Markdown files, and exactly what it writes back. The Rust indexer and the
TypeScript editor both follow it, and both are tested against the same fixtures
([`fixtures/`](../fixtures/README.md)).

The format is plain Markdown with a few common conventions, so the same folder can be opened
and edited in other Markdown apps.

## 1. The vault

A vault is a folder the user picks (default `~/Piw`). The files in it are the only source of
truth; everything Piw keeps elsewhere can be rebuilt from them or is state of this device only.

```text
~/Piw/
├── Work/                    a space
│   ├── Inbox.md             Quick Capture target for Work
│   ├── Stickies/            notes created by "Create sticky from selection"
│   └── Projects/Refactor 2FA.md
├── Personal/                a space
├── Loose note.md            no space: shown only under "All spaces"
└── .piw/                    Piw's own folder (not notes)
    └── trash/               deleted files, restorable
```

- **Notes** are the files ending in `.md` (case-insensitive). Every other file is ignored for
  now.
- **Hidden entries** are ignored, with everything under them: any file or folder whose name
  starts with `.` (`.piw`, `.git`, `.trash`). Symbolic links are not followed.
- **Spaces** are the folders at the vault root. A note belongs to the space of its first path
  segment; a note at the root belongs to none. Creating a space creates a folder, and moving a
  note between spaces moves the file. Piw creates `Work/` and `Personal/` in a new, empty vault.
- **Paths** are stored relative to the vault root, with `/` separators, in Unicode NFC (macOS may
  hand back NFD). Two names in one folder that differ only in case or normalisation are a
  conflict: Piw refuses to create the second one and reports it if found on disk.

## 2. Notes

- **Title** = the file name without `.md`. A `# Heading` in the text is content, not the title.
  Renaming a note renames the file.
- **Allowed names**: 1 to 120 characters; not `/ \ : * ? " < > |`, control characters, a leading
  `.` or space, or a trailing `.` or space; not a Windows reserved name (`CON`, `NUL`, `COM1`…).
  A clashing name gets ` 2`, ` 3`… (`Ideas 2.md`).
- **Text**: CommonMark with the GitHub extensions (tables, strikethrough, task lists,
  autolinks), UTF-8. Piw writes LF line endings and a final newline in files it creates. In
  existing files, it keeps the line endings it finds (LF or CRLF), a byte-order mark and a missing
  final newline as they are.
- **Front matter**: an optional YAML block at the very top, between two `---` lines. Piw reads
  `tags` from it and keeps the rest byte for byte. It never adds front matter to a note on its own.
- **Edits are minimal.** A change made outside the editor (ticking a task, setting a date,
  capturing to the Inbox) rewrites only the lines it changes. Piw never reformats, re-indents or
  normalises a note.

## 3. Tasks

A task is a GFM task list item that has text after the box:

```md
- [ ] Agree on the tolerance window 📅 2026-11-11
  - [x] Wrong secret ✅ 2026-11-09
```

- **Marker**: a `-`, `*`, `+` or `1.` / `1)` list item whose content starts with `[ ]` (open) or
  `[x]` / `[X]` (done), followed by a space or a tab and at least one character that is not
  whitespace. `- [ ]` alone, `-[ ] …` and `- [ ]text` are not tasks.
- **Other boxes** (`[-]`, `[/]`, `[>]`… used by some Markdown apps) are not tasks in format 1.
  Piw leaves them as they are.
- **Not tasks**: items inside fenced or indented code, HTML blocks or comments, front matter or a
  block quote (callouts included).
- **Subtasks** follow CommonMark list nesting: a task's parent is the list item that directly
  encloses it, when that item is a task. Under a plain bullet, the task has no parent.
- **Section**: the text of the closest heading above the task, of any level (`Plan`), or none.
- **Text**: only the item's first line, with the recognised dates removed and the result
  trimmed. Lines that continue the item belong to it but are not part of its text.
- **Identity** is not stored in the file. A task is addressed by its note path and its 1-based
  line number, guarded by the hash of the file and the line's exact text (§6).

### Dates

| Meaning   | Written as      | Rules                                                                                                             |
| --------- | --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Due       | `📅 2026-11-12` | `📅` (U+1F4C5, an optional U+FE0F after it), whitespace, a valid ISO date, then whitespace or the end of the line |
| Completed | `✅ 2026-11-10` | Same rules with `✅` (U+2705)                                                                                     |

- Dates are calendar days without a time or time zone. "Today" is the device's local date.
- A date that does not exist (`2026-02-30`) is not recognised and stays in the text.
- When a sign appears more than once, the last one counts and the earlier ones stay in the
  text.
- Other Tasks plugin signs (`⏳` scheduled, `🛫` start, `➕` created, `🔁` recurrence, the
  priority arrows) are not read in format 1. They stay in the text and are never removed.

### What Piw writes

- **Set a due date**: replaces the recognised `📅 date` (written without the variation selector),
  or appends ` 📅 YYYY-MM-DD` to the line,
  before a `✅` date if there is one. **Clear it**: removes the sign, the date and one space before
  them.
- **Tick**: `[ ]` becomes `[x]` and ` ✅ <today>` is appended. **Untick**: `[x]` or `[X]` becomes
  `[ ]` and the recognised `✅ date` is removed. The editor's `Mod+Enter` follows the same rule.
- **Edit the text** from a task view: replaces the text the views show, from the box up to the
  first recognised date, and keeps the dates and everything after them. Signs of other plugins
  before the first date are part of that text.
- **New task**: `- [ ] <text>`, with ` 📅 <date>` when one was given.

Every case is in `fixtures/task-edits.json`; the Rust and TypeScript edits are both tested
against it.

### Typing dates (never stored)

In the editor and in Quick Capture, `@` opens date suggestions, and the choice is written as
`📅 YYYY-MM-DD`. The words follow the interface language (English for now): `@today`,
`@tomorrow`, `@mon` … `@sun` (the next one, never today), `@nov 12` or `@12 nov` (the next one
from today), and `@2026-11-12`. `Mod+D` opens the date picker on the task under the caret. The
editor shows a recognised date as a chip and the raw text only on the line being edited.

## 4. Links and tags

- **Links**: `[[Note]]`, `[[Note|label]]`, `[[Note#Heading]]`. `Note` matches a note's title. A
  title that exists in several folders is written with its path (`[[Work/Projects/Onboarding]]`);
  otherwise the note with the shortest path wins. A link that matches nothing is kept and
  reported as unresolved. Renaming a note in Piw updates the links that point to it.
- **Tags**: `#tag` after the start of a line or whitespace, made of letters, digits, `_`, `-` and
  `/`, with at least one character that is not a digit. A heading (`# Title`), code and links are
  not tags. A `tags:` key in the front matter (a list or a comma-separated string) adds tags.
  Tags are compared in lowercase.

## 5. Files Piw manages

- **`<Space>/Inbox.md`** is created on the first capture. A captured note is appended as its own
  block, after a blank line. A captured task is appended as `- [ ] …` (with ` 📅 date` when given,
  and its description as lines indented two spaces under it): directly under the last line when
  the file ends with a task list, otherwise after a blank line. A capture without a space goes to
  `Inbox.md` at the vault root.
- **`<Space>/Stickies/<Title>.md`** is created by "Create sticky from selection": the selected
  text, a blank line, then `From [[<Original note>]]`. A note at the vault root uses `Stickies/`
  at the root. The folder is created when missing.
- **Imported from Piw 0.1**, once: one note per quick note, document and section, archived
  notes in `<Space>/Archive/`, and loose tasks appended to `<Space>/Inbox.md`, all in this
  format and under free names ([architecture](architecture.md#importing-piw-01)).
- **`.piw/trash/`**: a deleted note or folder moves to
  `.piw/trash/<YYYYMMDDTHHMMSS>/<original path>` (UTC, with `-2`, `-3`… when several go in the
  same second), next to a `.original` file holding that path. Restoring puts it back, recreating
  missing folders, under a free name if the old one is taken now. "Delete forever" removes the
  entry. Piw never deletes anything outside this folder on its own.

Everything else stays out of the vault, in Piw's data directory, so a synced vault never carries a
database or moves windows on another computer:

- **The index**, `vaults/<key>/index.sqlite3` (the key comes from the vault's path), holds the
  search index, tasks, links and tags of every note, with the size, modification time and hash
  it indexed. Piw rebuilds it when it is missing, unreadable or from another version.
- **State of this device**: settings, the vault path, open tabs, the Quick Capture draft, the last
  capture space, and every sticky's note path or task view, geometry, colour and on-top flag.

## 6. Writing safely

- **Atomic writes**: write to a temporary file in the same folder, flush it, then rename it over
  the note.
- **Conflict guard**: every write carries the hash of the content it was based on. If the file on
  disk no longer matches, the write is refused with `conflict`. An open note with no unsaved
  edits then reloads quietly; with unsaved edits, the editor shows the conflict.
- **Task commands** carry `{ path, line, lineText, fileHash }`. If the hash matches, the line is
  changed. If it does not but exactly one line still has `lineText`, that line is changed.
  Otherwise the command is refused and the views refetch.
- **External changes** (another editor, Syncthing) arrive through the file watcher. Piw
  also compares sizes and modification times on start and when the window gains focus, in case
  the watcher missed an event.
