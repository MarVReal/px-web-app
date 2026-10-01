export function initials(name: string): string {
  const parts = (name || '?').trim().split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => new Date().toISOString().slice(0, 7);
export function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' });
}
export function isOverdue(due: string | null, completedAt: string | null) { return !!due && !completedAt && due < today(); }
export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return new Date(iso).toLocaleDateString();
}

/** Local calendar date as YYYY-MM-DD (avoids the UTC shift of toISOString). */
export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
/** "September 2026" for a whole month, otherwise "Sep 1 – Sep 15, 2026" / "Dec 20, 2025 – Jan 5, 2026". */
export function rangeLabel(from: string, to: string) {
  if (!from || !to) return '';
  const a = parse(from), b = parse(to);
  const lastOfMonth = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
  if (a.getDate() === 1 && b.getFullYear() === a.getFullYear() && b.getMonth() === a.getMonth() && b.getDate() === lastOfMonth) return monthLabel(from.slice(0, 7));
  const md = (d: Date) => d.toLocaleString('en', { month: 'short', day: 'numeric' });
  if (a.getTime() === b.getTime()) return `${md(a)}, ${a.getFullYear()}`;
  return a.getFullYear() === b.getFullYear() ? `${md(a)} – ${md(b)}, ${b.getFullYear()}` : `${md(a)}, ${a.getFullYear()} – ${md(b)}, ${b.getFullYear()}`;
}
