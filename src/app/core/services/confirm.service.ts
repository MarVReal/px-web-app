import { Injectable, signal } from '@angular/core';

export interface ConfirmState { message: string; confirmLabel: string; resolve: (ok: boolean) => void; }

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly state = signal<ConfirmState | null>(null);

  ask(message: string, confirmLabel = 'Confirm'): Promise<boolean> {
    return new Promise((resolve) => this.state.set({ message, confirmLabel, resolve }));
  }

  answer(ok: boolean) { this.state()?.resolve(ok); this.state.set(null); }
}
