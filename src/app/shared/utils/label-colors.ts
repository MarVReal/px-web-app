/** Label colours are stored as #rrggbb. */
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Colours saved before hex support used preset names.
const LEGACY: Record<string, string> = {
  gray: '#667085', blue: '#2e90fa', green: '#12b76a', orange: '#f79009', red: '#f04438', purple: '#7a5af8', pink: '#ee46bc', teal: '#15b79e',
};

/** Curated choices for the colour field; every one gets readable text from `labelFg`. */
export const LABEL_PRESETS: { name: string; hex: string }[] = [
  { name: 'Slate', hex: '#667085' }, { name: 'Blue', hex: '#2e90fa' }, { name: 'Indigo', hex: '#444ce7' }, { name: 'Purple', hex: '#7a5af8' },
  { name: 'Pink', hex: '#ee46bc' }, { name: 'Red', hex: '#f04438' }, { name: 'Orange', hex: '#f79009' }, { name: 'Yellow', hex: '#eaaa08' },
  { name: 'Lime', hex: '#66c61c' }, { name: 'Green', hex: '#12b76a' }, { name: 'Teal', hex: '#15b79e' }, { name: 'Cyan', hex: '#06aed4' },
];

// Order new labels are offered colours in: hues alternate so neighbours contrast, and neutral slate comes last.
const PICK_ORDER = ['Blue', 'Orange', 'Green', 'Purple', 'Red', 'Teal', 'Yellow', 'Pink', 'Indigo', 'Cyan', 'Lime', 'Slate'];

/** The first colour in PICK_ORDER not already taken, so new labels start out distinct; a random preset once all are used. */
export function nextPresetColor(taken: Iterable<string | null | undefined>): string {
  const used = new Set([...taken].map((c) => normalizeHex(c)));
  const order = PICK_ORDER.map((n) => LABEL_PRESETS.find((p) => p.name === n)!.hex);
  return order.find((hex) => !used.has(hex)) ?? order[Math.floor(Math.random() * order.length)];
}

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
