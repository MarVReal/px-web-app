/** A pipeline's Kanban card is an ordered list of fields. Consecutive `half` items share one row (left grows, right hugs the edge). */
export type CardFieldKey =
  | 'title' | 'assignees' | 'priority' | 'category' | 'tags' | 'created_at' | 'last_activity' | 'start_date' | 'due_date'
  | 'completed_at' | 'estimated_hours' | 'progress' | 'counts' | 'description' | 'divider';

export interface CardItem { key: CardFieldKey; width: 'full' | 'half'; }

export interface CardFieldDef { key: CardFieldKey; label: string; icon: string; hint: string; required?: boolean; repeatable?: boolean; }

export const CARD_FIELDS: CardFieldDef[] = [
  { key: 'title', label: 'Task name', icon: 'Aa', hint: 'The task title', required: true },
  { key: 'assignees', label: 'Assignees', icon: '☺', hint: 'Initials of assigned people' },
  { key: 'priority', label: 'Priority', icon: '●', hint: 'Low / Medium / High / Urgent' },
  { key: 'category', label: 'Category', icon: '▣', hint: 'The task category' },
  { key: 'tags', label: 'Tags', icon: '#', hint: 'All tags on the task' },
  { key: 'created_at', label: 'Task created', icon: '＋', hint: 'Date the task was created' },
  { key: 'last_activity', label: 'Last activity', icon: '↻', hint: 'Date of the latest change or comment' },
  { key: 'start_date', label: 'Start date', icon: '▶', hint: 'Planned start' },
  { key: 'due_date', label: 'Due date', icon: '⚑', hint: 'Deadline (red when overdue)' },
  { key: 'completed_at', label: 'Completed on', icon: '✓', hint: 'Date the task was completed' },
  { key: 'estimated_hours', label: 'Estimated effort', icon: '⏱', hint: 'Estimated hours' },
  { key: 'progress', label: 'Progress bar', icon: '▰', hint: 'Completion percentage' },
  { key: 'counts', label: 'Counts', icon: '💬', hint: 'Comments, links and progress %' },
  { key: 'description', label: 'Description', icon: '≡', hint: 'First lines of the description' },
  { key: 'divider', label: 'Horizontal divider', icon: '—', hint: 'A dashed separator line', repeatable: true },
];

export const FIELD_BY_KEY = new Map<CardFieldKey, CardFieldDef>(CARD_FIELDS.map((f) => [f.key, f]));

/** Matches the current board: title | assignees, priority | created, category | last activity, tags, divider, due date | counts. */
export const DEFAULT_CARD_LAYOUT: CardItem[] = [
  { key: 'title', width: 'half' }, { key: 'assignees', width: 'half' },
  { key: 'priority', width: 'half' }, { key: 'created_at', width: 'half' },
  { key: 'category', width: 'half' }, { key: 'last_activity', width: 'half' },
  { key: 'tags', width: 'full' },
  { key: 'divider', width: 'full' },
  { key: 'due_date', width: 'half' }, { key: 'counts', width: 'half' },
];

/** Defensive parse of stored JSON: drops unknown keys and duplicates, guarantees the required title. */
export function sanitizeLayout(raw: unknown): CardItem[] {
  if (!Array.isArray(raw)) return DEFAULT_CARD_LAYOUT.map((i) => ({ ...i }));
  const seen = new Set<CardFieldKey>();
  const out: CardItem[] = [];
  for (const it of raw as { key?: unknown; width?: unknown }[]) {
    const def = typeof it?.key === 'string' ? FIELD_BY_KEY.get(it.key as CardFieldKey) : undefined;
    if (!def || (!def.repeatable && seen.has(def.key))) continue;
    seen.add(def.key);
    out.push({ key: def.key, width: it.width === 'half' ? 'half' : 'full' });
  }
  if (!seen.has('title')) out.unshift({ key: 'title', width: 'full' });
  return out;
}

/** Groups items into display rows: two consecutive `half` items (neither a divider) share a row. */
export function toRows(items: CardItem[]): CardItem[][] {
  const rows: CardItem[][] = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i], b = items[i + 1];
    if (a.width === 'half' && a.key !== 'divider' && b && b.width === 'half' && b.key !== 'divider') { rows.push([a, b]); i++; }
    else rows.push([a]);
  }
  return rows;
}
