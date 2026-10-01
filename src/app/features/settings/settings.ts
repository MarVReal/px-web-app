import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABEL } from '../../core/models/models';
import { OrgService } from '../../core/services/org.service';
import { ToastService } from '../../core/services/toast.service';
import { Avatar } from '../../shared/components/avatar';

/** Organization settings (admin). */
@Component({
  selector: 'px-org-settings',
  imports: [ReactiveFormsModule],
  template: `
    <div class="page" style="max-width: 720px">
      <div class="page-head"><h1>Organization Settings</h1></div>
      <form class="card stack" [formGroup]="f" (ngSubmit)="save()">
        <label class="field">Name<input formControlName="name" /></label>
        <label class="field">Industry<input formControlName="industry" /></label>
        <label class="field">Logo URL<input formControlName="logo_url" placeholder="https://…" /></label>
        <label class="field">Timezone<input formControlName="timezone" /></label>
        <label class="field">Description<textarea formControlName="description"></textarea></label>
        <label class="row"><input type="checkbox" style="width:auto" formControlName="section_heads_can_create_pipelines" /> Section Heads can create pipelines</label>
        <div class="stack" style="gap: 2px">
          <label class="row"><input type="checkbox" style="width:auto" formControlName="ai_reports_enabled" /> Allow AI report writing</label>
          <span class="muted small">When on, people can ask Google Gemini to write the narrative of an accomplishment report. The titles and descriptions of the tasks in that report are sent to Google to do this. Off by default.</span>
        </div>
        <div class="muted small">Plan: {{ auth.organization()?.plan }} · Status: {{ auth.organization()?.subscription_status }} · Created {{ auth.organization()?.created_at?.slice(0, 10) }}</div>
        <div><button class="btn primary" [disabled]="f.invalid">Save</button></div>
      </form>
    </div>`,
})
export class OrgSettings implements OnInit {
  protected auth = inject(AuthService);
  private org = inject(OrgService);
  private toast = inject(ToastService);
  f = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]], industry: [''], logo_url: [''], timezone: ['UTC'], description: [''],
    section_heads_can_create_pipelines: [true], ai_reports_enabled: [false],
  });

  async ngOnInit() {
    const o = this.auth.organization()!;
    const s = await this.org.getSettings().catch(() => null) as { section_heads_can_create_pipelines: boolean; ai_reports_enabled: boolean } | null;
    this.f.patchValue({ name: o.name, industry: o.industry ?? '', logo_url: o.logo_url ?? '', timezone: o.timezone, description: o.description ?? '',
      section_heads_can_create_pipelines: s?.section_heads_can_create_pipelines ?? true, ai_reports_enabled: s?.ai_reports_enabled ?? false });
  }
  async save() {
    const v = this.f.getRawValue();
    try {
      await this.org.updateOrganization({ name: v.name.trim(), industry: v.industry || null, logo_url: v.logo_url || null, timezone: v.timezone, description: v.description || null });
      await this.org.updateSettings({ section_heads_can_create_pipelines: v.section_heads_can_create_pipelines, ai_reports_enabled: v.ai_reports_enabled });
      this.toast.success('Settings saved');
    } catch (e) { this.toast.error(e); }
  }
}

/** Telegram handle as people type it: "@Name", "t.me/name" and "https://t.me/name" all become "name". */
export function normalizeTelegram(value: string): string {
  return value.trim().replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, '').replace(/^@+/, '').trim().toLowerCase();
}
const TELEGRAM_FORMAT = /^[a-z][a-z0-9_]{3,30}[a-z0-9]$/; // 5 to 32 characters, same rule as the database check
const telegramValidator: ValidatorFn = (c) => {
  const v = normalizeTelegram(String(c.value ?? ''));
  return !v || TELEGRAM_FORMAT.test(v) ? null : { telegram: true };
};

/** Personal profile and password (everyone). */
@Component({
  selector: 'px-account',
  imports: [ReactiveFormsModule, Avatar],
  template: `
    <div class="page" style="max-width: 640px">
      <div class="page-head"><h1>Profile</h1></div>
      <div class="card row" style="gap: 16px">
        <px-avatar [name]="auth.profile()?.full_name || auth.profile()?.email || ''" [size]="56" />
        <div>
          <b>{{ auth.profile()?.full_name }}</b>
          <div class="muted">{{ auth.profile()?.email }}</div>
          <div class="row" style="margin-top: 6px"><span class="badge">{{ roleLabel() }}</span><span class="muted small">{{ auth.organization()?.name }}</span></div>
        </div>
      </div>

      <form class="card stack" style="margin-top: 16px" [formGroup]="pf" (ngSubmit)="saveProfile()">
        <h3>Your details</h3>
        <label class="field">Full name<input formControlName="full_name" autocomplete="name" /></label>
        <label class="field">Telegram username
          <span class="tg"><span class="at">&#64;</span><input formControlName="telegram" placeholder="yourname" autocomplete="off" autocapitalize="off" spellcheck="false" /></span>
          @if (pf.controls.telegram.invalid && pf.controls.telegram.dirty) {
            <span class="err">5 to 32 characters: letters, numbers and underscores, starting with a letter.</span>
          } @else {
            <span class="muted small hint">Optional. Saved for upcoming Telegram notifications; nothing is sent yet. People in your organization can see it.</span>
          }
        </label>
        <div><button class="btn primary" [disabled]="pf.invalid || pf.pristine || saving()">{{ saving() ? 'Saving…' : 'Save changes' }}</button></div>
      </form>

      <form class="card stack" style="margin-top: 16px" [formGroup]="f" (ngSubmit)="save()">
        <h3>Change password</h3>
        <label class="field">New password<input type="password" formControlName="password" autocomplete="new-password" /></label>
        <div><button class="btn primary" [disabled]="f.invalid">Update password</button></div>
      </form>
    </div>`,
  styles: `
    .tg { position: relative; display: block; font-weight: 400; }
    .at { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--muted); }
    .tg input { padding-left: 26px; }
    .hint { font-weight: 400; }`,
})
export class Account implements OnInit {
  protected auth = inject(AuthService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder).nonNullable;
  roleLabel = computed(() => (this.auth.role() ? ROLE_LABEL[this.auth.role()!] : ''));
  saving = signal(false);
  pf = this.fb.group({ full_name: ['', [Validators.required, Validators.maxLength(100)]], telegram: ['', telegramValidator] });
  f = this.fb.group({ password: ['', [Validators.required, Validators.minLength(8)]] });

  ngOnInit() {
    const p = this.auth.profile();
    this.pf.reset({ full_name: p?.full_name ?? '', telegram: p?.telegram_username ?? '' });
  }
  async saveProfile() {
    const v = this.pf.getRawValue();
    const name = v.full_name.trim(), telegram = normalizeTelegram(v.telegram);
    this.saving.set(true);
    try {
      await this.auth.updateProfile({ full_name: name, telegram_username: telegram || null });
      this.pf.reset({ full_name: name, telegram });
      this.toast.success('Profile saved');
    } catch (e) { this.toast.error(e); } finally { this.saving.set(false); }
  }
  async save() {
    try { await this.auth.updatePassword(this.f.getRawValue().password); this.f.reset(); this.toast.success('Password updated'); }
    catch (e) { this.toast.error(e); }
  }
}
