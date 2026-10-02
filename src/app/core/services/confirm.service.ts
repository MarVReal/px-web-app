import { Injectable, signal } from '@angular/core';

export interface ConfirmState { message: string; confirmLabel: string; tone: 'danger' | 'primary'; resolve: (ok: boolean) => void; }

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly state = signal<ConfirmState | null>(null);

  /** `tone` colors the confirm button: red for destructive actions (default), blue for "apply these changes". */
  ask(message: string, confirmLabel = 'Confirm', tone: 'danger' | 'primary' = 'danger'): Promise<boolean> {
    return new Promise((resolve) => this.state.set({ message, confirmLabel, tone, resolve }));
  }

  answer(ok: boolean) { this.state()?.resolve(ok); this.state.set(null); }
}
