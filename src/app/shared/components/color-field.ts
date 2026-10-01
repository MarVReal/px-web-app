import { Component, computed, input, output, signal } from '@angular/core';
import { LABEL_PRESETS, labelFg, normalizeHex, parseHex } from '../utils/label-colors';

/** Pick a label colour: curated swatches, a custom picker, or a typed hex. Emits #rrggbb. */
@Component({
  selector: 'px-color-field',
  template: `
    <div class="field">
      <div class="swatches" role="radiogroup" aria-label="Colour">
        @for (p of presets; track p.hex) {
          <label class="sw" [title]="p.name">
            <input type="radio" [name]="group()" [checked]="current() === p.hex" (change)="pick(p.hex)" [attr.aria-label]="p.name" />
            <span class="dot" [style.background]="p.hex" [style.color]="fg(p.hex)">
              @if (current() === p.hex) { <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg> }
            </span>
          </label>
        }
        <label class="sw" title="Custom colour">
          <input type="color" [value]="current()" (input)="pick($any($event.target).value)" aria-label="Custom colour" />
          <span class="dot custom" [class.on]="isCustom()" [style.background]="isCustom() ? current() : null" [style.color]="fg(current())">
            @if (isCustom()) { <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg> }
          </span>
        </label>
      </div>
      <input class="hex" [value]="current()" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Hex colour" [attr.aria-invalid]="invalid() || null"
        (input)="invalid.set(false)" (change)="commit($any($event.target))" />
    </div>
    @if (invalid()) { <div class="err" role="alert">Use a hex colour, like #2e90fa.</div> }`,
  styles: `
    :host { display: block; min-width: 0; }
    .field { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .swatches { display: flex; flex-wrap: wrap; gap: 5px; }
    .sw { position: relative; display: inline-flex; cursor: pointer; }
    .sw input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; opacity: 0; cursor: pointer; }
    .dot { width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; box-shadow: inset 0 0 0 1px rgba(16, 24, 40, .12); transition: transform .12s; }
    .sw:hover .dot { transform: scale(1.08); }
    .sw input:checked + .dot, .dot.on { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--text); }
    .sw input:focus-visible + .dot { outline: 2px solid var(--primary); outline-offset: 3px; }
    .dot.custom:not(.on) { background: conic-gradient(#f04438, #f79009, #eaaa08, #12b76a, #06aed4, #2e90fa, #7a5af8, #ee46bc, #f04438); box-shadow: none; }
    .hex { width: 88px; flex: none; font-family: ui-monospace, Consolas, monospace; }
    .hex[aria-invalid='true'] { border-color: var(--danger); }
    .err { margin-top: 6px; }
    @media (prefers-reduced-motion: reduce) { .dot { transition: none; } .sw:hover .dot { transform: none; } }`,
})
export class ColorField {
  value = input.required<string>();
  /** Unique per field on the page: radios in one group share a name. */
  group = input('colour');
  valueChange = output<string>();

  presets = LABEL_PRESETS;
  invalid = signal(false);
  fg = labelFg;
  current = computed(() => normalizeHex(this.value()));
  isCustom = computed(() => !LABEL_PRESETS.some((p) => p.hex === this.current()));

  pick(hex: string) { this.invalid.set(false); this.valueChange.emit(normalizeHex(hex)); }

  commit(el: HTMLInputElement) {
    const v = parseHex(el.value);
    if (!v) { this.invalid.set(true); el.value = this.current(); return; }
    this.pick(v); el.value = v;
  }
}
