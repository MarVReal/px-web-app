import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { OrgService } from '../../core/services/org.service';
import { ToastService } from '../../core/services/toast.service';

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
    section_heads_can_create_pipelines: [true],
  });

  async ngOnInit() {
    const o = this.auth.organization()!;
    const s = await this.org.getSettings().catch(() => null) as { section_heads_can_create_pipelines: boolean } | null;
    this.f.patchValue({ name: o.name, industry: o.industry ?? '', logo_url: o.logo_url ?? '', timezone: o.timezone, description: o.description ?? '',
      section_heads_can_create_pipelines: s?.section_heads_can_create_pipelines ?? true });
  }
  async save() {
    const v = this.f.getRawValue();
    try {
      await this.org.updateOrganization({ name: v.name.trim(), industry: v.industry || null, logo_url: v.logo_url || null, timezone: v.timezone, description: v.description || null });
      await this.org.updateSettings({ section_heads_can_create_pipelines: v.section_heads_can_create_pipelines });
      this.toast.success('Settings saved');
    } catch (e) { this.toast.error(e); }
  }
}

/** Personal account settings (everyone). */
@Component({
  selector: 'px-account',
  imports: [ReactiveFormsModule],
  template: `
    <div class="page" style="max-width: 520px">
      <div class="page-head"><h1>Settings</h1></div>
      <div class="card stack"><div><b>{{ auth.profile()?.full_name }}</b><div class="muted">{{ auth.profile()?.email }}</div></div></div>
      <form class="card stack" style="margin-top: 16px" [formGroup]="f" (ngSubmit)="save()">
        <h3>Change password</h3>
        <label class="field">New password<input type="password" formControlName="password" autocomplete="new-password" /></label>
        <div><button class="btn primary" [disabled]="f.invalid">Update password</button></div>
      </form>
    </div>`,
})
export class Account {
  protected auth = inject(AuthService);
  private toast = inject(ToastService);
  f = inject(FormBuilder).nonNullable.group({ password: ['', [Validators.required, Validators.minLength(8)]] });
  signal = signal(0);
  async save() {
    try { await this.auth.updatePassword(this.f.getRawValue().password); this.f.reset(); this.toast.success('Password updated'); }
    catch (e) { this.toast.error(e); }
  }
}
