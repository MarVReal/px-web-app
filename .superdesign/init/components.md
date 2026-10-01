# Shared UI components

Framework: Angular 21 (standalone components, signals, new control flow, inline templates). Component library: none (custom). CSS: global SCSS utility classes in `src/styles.scss` (no Tailwind) plus per-component inline styles. Icons: unicode glyphs / emoji (no icon library).

Shared primitives are small: Avatar, Modal. Buttons, inputs, cards, badges, tables, tabs and chips are global CSS classes (see theme.md / styles.scss).

### `src/app/shared/components/avatar.ts`

```ts
import { Component, input } from '@angular/core';
import { initials } from '../utils/format';

@Component({
  selector: 'px-avatar',
  template: `<span class="av" [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="size() * 0.4"
    [style.background]="color()" [title]="name()">{{ ini() }}</span>`,
  styles: `.av { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; color: #fff; font-weight: 650; flex: none; border: 2px solid #fff; }`,
})
export class Avatar {
  name = input<string>('');
  size = input(26);
  ini = () => initials(this.name());
  color = () => {
    let h = 0; for (const c of this.name()) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 45% 45%)`;
  };
}
```

### `src/app/shared/components/modal.ts`

```ts
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'px-modal',
  template: `
    <div class="modal-backdrop" (mousedown)="onBackdrop($event)">
      <div class="modal" [class.wide]="wide()">
        <div class="modal-head"><h2>{{ title() }}</h2><span class="spacer"></span>
          <button class="btn ghost sm" (click)="closed.emit()" aria-label="Close">✕</button></div>
        <ng-content />
      </div>
    </div>`,
})
export class Modal {
  title = input('');
  wide = input(false);
  closed = output<void>();

  /** Must return void: Angular calls preventDefault() on a handler expression that evaluates to `false`, which blocks input focus. */
  onBackdrop(ev: MouseEvent) {
    if (ev.target === ev.currentTarget) this.closed.emit();
  }
}
```

### `src/app/shared/utils/label-colors.ts`

```ts
/** Label colours are stored as #rrggbb. */
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Colours saved before hex support used preset names.
const LEGACY: Record<string, string> = {
  gray: '#667085', blue: '#2e90fa', green: '#12b76a', orange: '#f79009', red: '#f04438', purple: '#7a5af8', pink: '#ee46bc', teal: '#15b79e',
};

export const normalizeHex = (c: string | null | undefined): string =>
  c && HEX_RE.test(c) ? c.toLowerCase() : (c && LEGACY[c]) || '#667085';

/** Accepts "abc", "#abc", "aabbcc", "#AABBCC"; returns "#aabbcc" or null when invalid. */
export function parseHex(input: string): string | null {
  let v = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.split('').map((ch) => ch + ch).join('');
  return /^[0-9a-fA-F]{6}$/.test(v) ? '#' + v.toLowerCase() : null;
}

export const labelBg = (c: string | null | undefined) => normalizeHex(c);

/** Text colour (dark or white) with the better WCAG contrast against the given background. */
export function labelFg(c: string | null | undefined): string {
  const h = normalizeHex(c).slice(1);
  const lin = (i: number) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
  const DARK_L = 0.0095; // #101828
  return 1.05 / (L + 0.05) >= (L + 0.05) / (DARK_L + 0.05) ? '#ffffff' : '#101828';
}

/** A pleasant random colour: any hue, fairly saturated, mid lightness. */
export function randomColor(): string {
  const h = Math.random() * 360, s = 0.62 + Math.random() * 0.23, l = 0.42 + Math.random() * 0.13;
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
```

### `src/app/shared/utils/format.ts`

```ts
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
```
