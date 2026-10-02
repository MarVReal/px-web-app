import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmService } from './core/services/confirm.service';
import { ToastService } from './core/services/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    <div class="toasts">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="t.kind" (click)="toast.dismiss(t.id)">{{ t.text }}</div>
      }
    </div>
    @if (confirm.state(); as c) {
      <div class="modal-backdrop" style="z-index: 200">
        <div class="modal" style="max-width: 420px">
          <div class="modal-body" style="white-space: pre-line">{{ c.message }}</div>
          <div class="modal-foot">
            <button class="btn" (click)="confirm.answer(false)">Cancel</button>
            <button class="btn" [class.primary]="c.tone === 'primary'" [class.danger]="c.tone === 'danger'" [class.solid]="c.tone === 'danger'" (click)="confirm.answer(true)">{{ c.confirmLabel }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .toasts { position: fixed; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 300; }
    .toast { background: #101828; color: #fff; padding: 10px 16px; border-radius: 8px; box-shadow: var(--shadow-lg); max-width: 340px; cursor: pointer; }
    .toast.error { background: var(--danger); } .toast.success { background: var(--success); }
  `,
})
export class App {
  protected toast = inject(ToastService);
  protected confirm = inject(ConfirmService);
}
