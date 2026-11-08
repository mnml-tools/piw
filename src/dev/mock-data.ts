/**
 * Demo data for the dev-only mock backend. Mirrors `scripts/e2e/seed-demo.py` (the README
 * screenshots) plus a few extras for visual QA: a very long note title, a long task with a
 * description and subtasks, tags, archived and trashed items, and one sticky of each kind.
 * Due dates are relative to today so Overdue / Today / Upcoming always look right.
 */
import { addDays, todayString } from '@/lib/dates';
import type { Space } from '@/lib/ipc/bindings/Space';
import {
  DEFAULT_SETTINGS,
  DEFAULT_TASKS_TAB_SETTINGS,
  docPlainText,
  ORDER_STEP,
  type NoteRow,
  type StickyRow,
  type Store,
  type TabRow,
  type TaskRow,
} from './mock-store';

export type MockMode = 'demo' | 'empty';

/** Stable UUIDs, so sticky URLs and task references in documents never change. */
const uuid = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const DEMO_IDS = {
  work: uuid('5bace000', 1),
  personal: uuid('5bace000', 2),
  refactorDoc: uuid('d0c00000', 1),
  overviewTab: uuid('7ab00000', 1),
  implementationTab: uuid('7ab00000', 2),
  todosTab: uuid('7ab00000', 3),
  supplierNote: uuid('0e7e0000', 1),
  giftNote: uuid('0e7e0000', 2),
  standupNote: uuid('0e7e0000', 3),
  planningNote: uuid('0e7e0000', 4),
  readingNote: uuid('0e7e0000', 5),
  securityNote: uuid('0e7e0000', 6),
  movingNote: uuid('0e7e0000', 7),
  onboardingNote: uuid('0e7e0000', 8),
  totpTask: uuid('7a5c0000', 1),
  clockDriftTask: uuid('7a5c0000', 2),
  replayTask: uuid('7a5c0000', 3),
  recoveryTask: uuid('7a5c0000', 4),
  smsTask: uuid('7a5c0000', 5),
  coffeeTask: uuid('7a5c0000', 6),
  dentistTask: uuid('7a5c0000', 7),
  weeklyUpdateTask: uuid('7a5c0000', 8),
  demoTask: uuid('7a5c0000', 9),
  passportTask: uuid('7a5c0000', 10),
  webhooksTask: uuid('7a5c0000', 11),
  webhookMapTask: uuid('7a5c0000', 12),
  webhookLoadTask: uuid('7a5c0000', 13),
  landlordTask: uuid('7a5c0000', 14),
  billTask: uuid('7a5c0000', 15),
  gymTask: uuid('7a5c0000', 16),
} as const;

const ID = DEMO_IDS;

function spaces(created: string): Space[] {
  return [
    {
      id: ID.work,
      name: 'Work',
      color: 'sky',
      sortOrder: 0,
      isDefault: true,
      createdAt: created,
      updatedAt: created,
    },
    {
      id: ID.personal,
      name: 'Personal',
      color: 'mint',
      sortOrder: ORDER_STEP,
      isDefault: false,
      createdAt: created,
      updatedAt: created,
    },
  ];
}

// Editor JSON helpers (same shapes as seed-demo.py).
type Json = Record<string, unknown>;
const text = (t: string, marks?: Json[]): Json => ({
  type: 'text',
  text: t,
  ...(marks && { marks }),
});
const code = (t: string) => text(t, [{ type: 'code' }]);
const para = (...content: Json[]): Json =>
  content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
const heading = (level: number, t: string): Json => ({
  type: 'heading',
  attrs: { level },
  content: [text(t)],
});
const list = (type: 'bulletList' | 'orderedList', items: Json[][]): Json => ({
  type,
  content: items.map((content) => ({ type: 'listItem', content: [para(...content)] })),
});
const taskRef = (taskId: string): Json => ({ type: 'taskRef', attrs: { taskId } });

const OVERVIEW = {
  type: 'doc',
  content: [
    heading(2, 'Problem'),
    para(
      text(
        'SMS codes are being phased out. Move TOTP verification into the auth service and keep recovery codes working.',
      ),
    ),
    heading(2, 'Plan'),
    {
      type: 'checklist',
      content: [
        {
          type: 'checklistItem',
          attrs: { checked: true },
          content: [para(text('Read RFC 6238'))],
        },
        {
          type: 'checklistItem',
          attrs: { checked: false },
          content: [para(text('Compare libraries'))],
        },
      ],
    },
    para(taskRef(ID.totpTask)),
    para(taskRef(ID.recoveryTask)),
    {
      type: 'codeBlock',
      attrs: { language: 'ts' },
      content: [text('const valid = verifyTotp(secret, code, { window: 1 });')],
    },
  ],
};

const IMPLEMENTATION = {
  type: 'doc',
  content: [
    para(text('Endpoints, migrations and rollout notes.')),
    heading(3, 'Endpoints'),
    list('bulletList', [
      [code('POST /auth/totp/verify'), text(' replaces '), code('/auth/sms/verify')],
      [code('POST /auth/recovery/redeem'), text(' accepts a single-use recovery code')],
    ]),
    heading(3, 'Rollout'),
    list('orderedList', [
      [text('Ship behind the '), code('totp_v2'), text(' flag')],
      [text('Enable for staff accounts and watch the error rate')],
      [text('Enable for everyone, then remove SMS')],
    ]),
    {
      type: 'blockquote',
      content: [
        para(text('Keep the SMS endpoint for one release so older clients can still sign in.')),
      ],
    },
    para(
      text('Test vectors: '),
      text('RFC 6238, appendix B', [
        { type: 'link', attrs: { href: 'https://www.rfc-editor.org/rfc/rfc6238#appendix-B' } },
      ]),
      text('.'),
    ),
  ],
};

/** Builds the demo store (or just the default spaces with `empty`). */
export function seedStore(mode: MockMode, at: Date = new Date()): Store {
  const today = todayString(at);
  const day = (offset: number) => addDays(today, offset);
  const ago = (minutes: number) => new Date(at.getTime() - minutes * 60_000).toISOString();
  const H = 60;
  const D = 24 * H;

  const store: Store = {
    spaces: spaces(ago(30 * D)),
    notes: [],
    tabs: [],
    tasks: [],
    tags: [],
    stickies: [],
    settings: { ...DEFAULT_SETTINGS, trayNoticeShown: true },
    draft: null,
  };
  if (mode === 'empty') return store;

  const note = (
    id: string,
    spaceId: string,
    body: string | null,
    minutesAgo: number,
    extra: Partial<NoteRow> = {},
  ): NoteRow => ({
    id,
    spaceId,
    kind: 'quick_note',
    title: '',
    body,
    documentId: null,
    sidebarOrder: null,
    rev: 1,
    tags: [],
    triagedAt: null,
    createdAt: ago(minutesAgo),
    updatedAt: ago(minutesAgo),
    archivedAt: null,
    deletedAt: null,
    ...extra,
  });

  let order = 0;
  const task = (
    id: string,
    spaceId: string,
    title: string,
    minutesAgo: number,
    extra: Partial<TaskRow> = {},
  ): TaskRow => {
    const row: TaskRow = {
      id,
      spaceId,
      documentId: null,
      parentTaskId: null,
      title,
      description: '',
      status: 'open',
      dueDate: null,
      completedAt: null,
      sortOrder: order,
      rev: 1,
      tags: [],
      triagedAt: null,
      createdAt: ago(minutesAgo),
      updatedAt: ago(minutesAgo),
      deletedAt: null,
      ...extra,
    };
    order += ORDER_STEP;
    // Tasks linked to a document were organised when they were linked (as in seed-demo.py).
    if (row.documentId !== null) row.triagedAt ??= row.createdAt;
    return row;
  };
  const done = (minutesAgo: number): Partial<TaskRow> => ({
    status: 'completed',
    completedAt: ago(minutesAgo),
    updatedAt: ago(minutesAgo),
  });

  // Document "Refactor 2FA" with two content tabs and a Tasks tab.
  const doc = ID.refactorDoc;
  store.notes.push(
    note(ID.refactorDoc, ID.work, null, 5 * D, {
      kind: 'document',
      title: 'Refactor 2FA',
      sidebarOrder: 0,
      updatedAt: ago(40),
    }),
  );
  const tab = (
    id: string,
    title: string,
    sortOrder: number,
    content: object | null,
    minutesAgo: number,
  ): TabRow => {
    const contentJson = content === null ? null : JSON.stringify(content);
    return {
      id,
      documentId: doc,
      title,
      kind: content === null ? 'tasks' : 'content',
      sortOrder,
      contentJson,
      plainText: docPlainText(contentJson),
      settings: content === null ? { ...DEFAULT_TASKS_TAB_SETTINGS, show: 'all' } : null,
      rev: 1,
      createdAt: ago(5 * D),
      updatedAt: ago(minutesAgo),
      deletedAt: null,
    };
  };
  store.tabs.push(
    tab(ID.overviewTab, 'Overview', 0, OVERVIEW, 40),
    tab(ID.implementationTab, 'Implementation', ORDER_STEP, IMPLEMENTATION, 2 * D),
    tab(ID.todosTab, 'To-dos', 2 * ORDER_STEP, null, 5 * D),
  );

  const docTask = { documentId: doc };
  store.tasks.push(
    task(ID.totpTask, ID.work, 'Add unit tests for TOTP verification', 5 * D, {
      ...docTask,
      dueDate: day(0),
    }),
    task(ID.clockDriftTask, ID.work, 'Cover clock drift', 5 * D, {
      ...docTask,
      parentTaskId: ID.totpTask,
      ...done(1 * D),
    }),
    task(ID.replayTask, ID.work, 'Cover replayed codes', 5 * D, {
      ...docTask,
      parentTaskId: ID.totpTask,
    }),
    task(ID.recoveryTask, ID.work, 'Review the recovery-code flow', 4 * D, {
      ...docTask,
      dueDate: day(2),
    }),
    task(ID.smsTask, ID.work, 'Remove the SMS fallback', 4 * D, { ...docTask, ...done(3 * H) }),
  );

  // Quick notes from seed-demo.py, then extras.
  store.notes.push(
    note(
      ID.supplierNote,
      ID.work,
      'Call the supplier\nAsk for the revised quote before Friday.',
      3 * H,
      { updatedAt: ago(50) },
    ),
    note(
      ID.giftNote,
      ID.personal,
      'Gift ideas\nBooks, a good coffee grinder, concert tickets.',
      2 * D,
    ),
    note(
      ID.standupNote,
      ID.work,
      'Standup notes\nDeploy moved to Thursday. Pair on the search ranking.',
      20,
    ),
    note(
      ID.planningNote,
      ID.work,
      [
        // Longer than the 120-character display title, which ends in "…".
        'Notes from the quarterly planning offsite: hiring plan, roadmap for the next two releases and the open questions we still need to settle before the end of the year',
        'Hiring: two backend engineers and one designer by March.',
        'Roadmap: offline search in 0.3, document templates in 0.4.',
        'Open questions: pricing for teams, support hours over the holidays.',
      ].join('\n'),
      6 * D,
      {
        tags: ['q4'],
        triagedAt: ago(5 * D),
        updatedAt: ago(1 * D),
      },
    ),
    note(
      ID.readingNote,
      ID.personal,
      [
        'Reading list',
        'The Design of Everyday Things — Don Norman',
        'A Philosophy of Software Design — John Ousterhout',
        'Shape Up — Ryan Singer',
      ].join('\n'),
      9 * D,
      { tags: ['reading'], triagedAt: ago(8 * D), updatedAt: ago(3 * D) },
    ),
    note(
      ID.securityNote,
      ID.work,
      [
        'Questions for the security review',
        'Do we rate-limit TOTP attempts per account or per IP?',
        'How long do recovery codes stay valid?',
      ].join('\n'),
      4 * D,
      { documentId: doc },
    ),
    note(
      ID.movingNote,
      ID.personal,
      'Moving checklist\nTransfer the internet contract and update the address at the bank.',
      40 * D,
      { archivedAt: ago(12 * D), updatedAt: ago(12 * D) },
    ),
    note(
      ID.onboardingNote,
      ID.work,
      'Draft: onboarding email\nWelcome aboard! Here is everything you need for your first week.',
      7 * D,
      { deletedAt: ago(1 * D) },
    ),
  );

  store.tasks.push(
    task(ID.coffeeTask, ID.personal, 'Buy coffee', 2 * H, { tags: ['errands'] }),
    task(ID.dentistTask, ID.personal, 'Book the dentist', 1 * D, { dueDate: day(0) }),
    task(ID.weeklyUpdateTask, ID.work, 'Send the weekly update', 3 * D, {
      dueDate: day(-1),
      tags: ['urgent'],
    }),
    task(ID.demoTask, ID.work, 'Prepare the demo', 2 * D, { dueDate: day(1) }),
    task(ID.passportTask, ID.personal, 'Renew passport', 6 * D, { dueDate: day(9) }),
    task(
      ID.webhooksTask,
      ID.work,
      'Migrate the remaining billing webhooks to the new event bus and double-check retries, idempotency keys and dead-letter handling',
      8 * D,
      {
        dueDate: day(4),
        tags: ['q4', 'urgent'],
        triagedAt: ago(7 * D),
        description: [
          'The old webhook worker still handles invoice.paid and invoice.failed. Move both to the event bus, keep the payload format unchanged and add a dashboard for the dead-letter queue.',
          '',
          'Acceptance criteria:',
          '- No duplicate charges when a webhook is retried',
          '- Failed deliveries are visible within five minutes',
          '- The old worker can be switched off without a deploy',
        ].join('\n'),
      },
    ),
    task(ID.webhookMapTask, ID.work, 'Map every webhook to its event', 8 * D, {
      parentTaskId: ID.webhooksTask,
      ...done(5 * D),
    }),
    task(ID.webhookLoadTask, ID.work, 'Load-test retries with 10× traffic', 8 * D, {
      parentTaskId: ID.webhooksTask,
    }),
    task(ID.landlordTask, ID.personal, 'Reply to the landlord about the lease renewal', 5 * D, {
      dueDate: day(-3),
    }),
    task(ID.billTask, ID.personal, 'Pay the electricity bill', 4 * D, {
      dueDate: day(-1),
      ...done(1 * D),
    }),
    task(ID.gymTask, ID.personal, 'Cancel the gym trial', 10 * D, { deletedAt: ago(2 * D) }),
  );

  store.tags = ['errands', 'q4', 'reading', 'urgent'].map((name, i) => ({
    id: uuid('7a900000', i + 1),
    name,
  }));

  const sticky = (
    target: StickyRow['target'],
    color: StickyRow['color'],
    isOpen: boolean,
    minutesAgo: number,
  ): StickyRow => ({
    target,
    placement: { x: null, y: null, width: 300, height: 260, alwaysOnTop: isOpen },
    color,
    isOpen,
    createdAt: ago(minutesAgo),
    updatedAt: ago(minutesAgo),
  });
  store.stickies.push(
    sticky({ kind: 'note', id: ID.supplierNote }, 'yellow', true, 45),
    sticky({ kind: 'task', id: ID.demoTask }, null, false, 1 * D),
    sticky({ kind: 'tasks_tab', id: ID.todosTab }, 'mint', false, 2 * D),
  );

  store.settings.lastCaptureSpaceId = ID.work;
  return store;
}
