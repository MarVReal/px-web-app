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
