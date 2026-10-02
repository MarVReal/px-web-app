import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { MyInvitation, ROLE_LABEL } from '../../core/models/models';
import { OrgService } from '../../core/services/org.service';

@Component({
  selector: 'px-onboarding',
  imports: [ReactiveFormsModule],
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
    .box { width: 100%; max-width: 480px; } form { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
    .invites { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
    .invite { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--border); border-radius: 10px; }
    .invite .info { min-width: 0; }`,
  template: `
    <div class="wrap"><div class="card box">
      @if (loading()) { <p class="muted">Checking for invitations…</p> }
      @else {
        @if (invites().length) {
          <h1>You've been invited</h1>
          <p class="muted">Join the organization that invited you instead of creating a new one.</p>
          <div class="invites">
            @for (i of invites(); track i.token) {
              <div class="invite">
                <div class="info"><b>{{ i.organization_name }}</b>
                  <div class="muted small">{{ roleName(i.role) }}{{ i.team_name ? ' · ' + i.team_name : '' }}</div></div>
                <span class="spacer"></span>
                <button class="btn primary" (click)="accept(i)" [disabled]="busy()">Accept</button>
              </div>
            }
          </div>
          @if (error() && !showCreate()) { <div class="alert error" style="margin-top: 12px">{{ error() }}</div> }
          <div class="row" style="margin-top: 16px">
            @if (!showCreate()) { <button type="button" class="btn ghost" (click)="showCreate.set(true)">Create a new organization instead</button> }
            <span class="spacer"></span><button type="button" class="btn ghost" (click)="auth.signOut()">Sign out</button>
          </div>
        }
        @if (showCreate()) {
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
        }
      }
    </div></div>`,
})
export class Onboarding implements OnInit {
  protected auth = inject(AuthService);
  private org = inject(OrgService);
  private router = inject(Router);
  zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? ['UTC', 'Asia/Manila'];
  f = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    industry: [''], description: [''], timezone: [Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'],
  });
  busy = signal(false); error = signal('');
  loading = signal(true); invites = signal<MyInvitation[]>([]); showCreate = signal(false);
  protected roleName = (r: string) => ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r;

  /** Anyone who was invited should join that organization, not create a duplicate, so check before showing the form. */
  async ngOnInit() {
    try { this.invites.set(await this.org.myPendingInvitations()); }
    catch { this.invites.set([]); } // if the lookup fails, fall back to the plain create-organization form
    finally { this.showCreate.set(!this.invites().length); this.loading.set(false); }
  }

  async accept(i: MyInvitation) {
    this.busy.set(true); this.error.set('');
    try {
      await this.auth.acceptInvitation(i.token);
      await this.router.navigateByUrl('/dashboard');
    } catch (e) { this.error.set((e as Error).message); } finally { this.busy.set(false); }
  }

  async submit() {
    this.busy.set(true); this.error.set('');
    try {
      const v = this.f.getRawValue();
      await this.auth.createOrganization(v.name, v.description, v.industry, v.timezone);
      await this.router.navigateByUrl('/dashboard');
    } catch (e) { this.error.set((e as Error).message); } finally { this.busy.set(false); }
  }
}
