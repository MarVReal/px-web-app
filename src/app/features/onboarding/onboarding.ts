import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'px-onboarding',
  imports: [ReactiveFormsModule],
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
    .box { width: 100%; max-width: 480px; } form { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }`,
  template: `
    <div class="wrap"><div class="card box">
      <h1>Set up your organization</h1>
      <p class="muted">You'll be the administrator. You can invite your team next.</p>
      <form [formGroup]="f" (ngSubmit)="submit()">
        <label class="field">Organization name<input formControlName="name" /></label>
        <label class="field">Industry<input formControlName="industry" placeholder="e.g. Public service, Software" /></label>
        <label class="field">Timezone<select formControlName="timezone">
          @for (z of zones; track z) { <option [value]="z">{{ z }}</option> }</select></label>
        <label class="field">Description<textarea formControlName="description"></textarea></label>
        @if (error()) { <div class="alert error">{{ error() }}</div> }
        <div class="row"><button class="btn primary" [disabled]="f.invalid || busy()">Create organization</button>
          <span class="spacer"></span><button type="button" class="btn ghost" (click)="auth.signOut()">Sign out</button></div>
      </form>
    </div></div>`,
})
export class Onboarding {
  protected auth = inject(AuthService);
  private router = inject(Router);
  zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? ['UTC', 'Asia/Manila'];
  f = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    industry: [''], description: [''], timezone: [Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'],
  });
  busy = signal(false); error = signal('');
  async submit() {
    this.busy.set(true); this.error.set('');
    try {
      const v = this.f.getRawValue();
      await this.auth.createOrganization(v.name, v.description, v.industry, v.timezone);
      await this.router.navigateByUrl('/dashboard');
    } catch (e) { this.error.set((e as Error).message); } finally { this.busy.set(false); }
  }
}
