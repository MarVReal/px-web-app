import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { OrgService } from '../../core/services/org.service';

const AUTH_STYLES = `
  .wrap { min-height: 100vh; display: grid; place-items: center; padding: 16px; background: linear-gradient(160deg, #101828, #1d2939 60%, #2f54eb); }
  .box { width: 100%; max-width: 400px; background: var(--surface); border-radius: 16px; padding: 28px; box-shadow: var(--shadow-lg); }
  .logo { font-weight: 700; letter-spacing: .08em; margin-bottom: 4px; b { color: var(--primary); } }
  form { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
`;

@Component({
  selector: 'px-login',
  imports: [ReactiveFormsModule, RouterLink],
  styles: AUTH_STYLES,
  template: `
    <div class="wrap"><div class="box">
      <div class="logo">PROJECT<b>-X</b></div><h1>Sign in</h1>
      <form [formGroup]="f" (ngSubmit)="submit()">
        <label class="field">Email<input type="email" formControlName="email" autocomplete="email" /></label>
        <label class="field">Password<input type="password" formControlName="password" autocomplete="current-password" /></label>
        @if (error()) { <div class="alert error">{{ error() }}</div> }
        @if (info()) { <div class="alert ok">{{ info() }}</div> }
        <button class="btn primary" [disabled]="f.invalid || busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
      </form>
      <p class="small"><a routerLink="/forgot-password">Forgot password?</a> · <a routerLink="/register" [queryParams]="invite ? { invite } : {}">Create account</a></p>
    </div></div>`,
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  f = inject(FormBuilder).nonNullable.group({ email: ['', [Validators.required, Validators.email]], password: ['', Validators.required] });
  busy = signal(false); error = signal(''); info = signal('');
  invite = this.route.snapshot.queryParamMap.get('invite');

  constructor() {
    if (this.route.snapshot.queryParamMap.get('registered')) this.info.set('Check your email to verify your account, then sign in.');
  }
  async submit() {
    this.busy.set(true); this.error.set('');
    try {
      const { email, password } = this.f.getRawValue();
      await this.auth.signIn(email, password);
      if (this.invite) await this.auth.acceptInvitation(this.invite);
      await this.router.navigateByUrl('/');
    } catch (e) { this.error.set((e as Error).message); } finally { this.busy.set(false); }
  }
}

@Component({
  selector: 'px-register',
  imports: [ReactiveFormsModule, RouterLink],
  styles: AUTH_STYLES,
  template: `
    <div class="wrap"><div class="box">
      <div class="logo">PROJECT<b>-X</b></div><h1>{{ preview() ? 'Join ' + preview()!.organization_name : 'Create your account' }}</h1>
      @if (preview(); as p) { <p class="muted small">You were invited as {{ p.role }}{{ p.team_name ? ' in ' + p.team_name : '' }}. Use {{ p.email }}.</p> }
      <form [formGroup]="f" (ngSubmit)="submit()">
        <label class="field">Full name<input formControlName="name" autocomplete="name" /></label>
        <label class="field">Email<input type="email" formControlName="email" autocomplete="email" /></label>
        <label class="field">Password<input type="password" formControlName="password" autocomplete="new-password" />
          @if (f.controls.password.touched && f.controls.password.invalid) { <span class="err">At least 8 characters.</span> }</label>
        @if (error()) { <div class="alert error">{{ error() }}</div> }
        <button class="btn primary" [disabled]="f.invalid || busy()">{{ busy() ? 'Creating…' : 'Create account' }}</button>
      </form>
      <p class="small">Already registered? <a routerLink="/login" [queryParams]="invite ? { invite } : {}">Sign in</a></p>
    </div></div>`,
})
export class Register implements OnInit {
  private auth = inject(AuthService);
  private org = inject(OrgService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  f = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });
  busy = signal(false); error = signal('');
  invite = this.route.snapshot.queryParamMap.get('invite');
  preview = signal<Awaited<ReturnType<OrgService['previewInvitation']>>>(null);

  async ngOnInit() {
    if (!this.invite) return;
    const p = await this.org.previewInvitation(this.invite).catch(() => null);
    this.preview.set(p);
    if (p) this.f.controls.email.setValue(p.email);
  }
  async submit() {
    this.busy.set(true); this.error.set('');
    try {
      const { name, email, password } = this.f.getRawValue();
      const res = await this.auth.signUp(email, password, name.trim());
      if (res.session) {
        if (this.invite) await this.auth.acceptInvitation(this.invite);
        await this.auth.loadContext();
        await this.router.navigateByUrl('/');
      } else {
        await this.router.navigate(['/login'], { queryParams: { registered: 1, ...(this.invite ? { invite: this.invite } : {}) } });
      }
    } catch (e) { this.error.set((e as Error).message); } finally { this.busy.set(false); }
  }
}

@Component({
  selector: 'px-forgot',
  imports: [ReactiveFormsModule, RouterLink],
  styles: AUTH_STYLES,
  template: `
    <div class="wrap"><div class="box"><h1>Reset password</h1>
      <form [formGroup]="f" (ngSubmit)="submit()">
        <label class="field">Email<input type="email" formControlName="email" /></label>
        @if (error()) { <div class="alert error">{{ error() }}</div> }
        @if (sent()) { <div class="alert ok">If that account exists, a reset link is on its way.</div> }
        <button class="btn primary" [disabled]="f.invalid">Send reset link</button>
      </form>
      <p class="small"><a routerLink="/login">Back to sign in</a></p></div></div>`,
})
export class ForgotPassword {
  private auth = inject(AuthService);
  f = inject(FormBuilder).nonNullable.group({ email: ['', [Validators.required, Validators.email]] });
  sent = signal(false); error = signal('');
  async submit() {
    try { await this.auth.sendPasswordReset(this.f.getRawValue().email); this.sent.set(true); }
    catch (e) { this.error.set((e as Error).message); }
  }
}

@Component({
  selector: 'px-reset',
  imports: [ReactiveFormsModule],
  styles: AUTH_STYLES,
  template: `
    <div class="wrap"><div class="box"><h1>Choose a new password</h1>
      <form [formGroup]="f" (ngSubmit)="submit()">
        <label class="field">New password<input type="password" formControlName="password" autocomplete="new-password" /></label>
        @if (error()) { <div class="alert error">{{ error() }}</div> }
        <button class="btn primary" [disabled]="f.invalid">Update password</button>
      </form></div></div>`,
})
export class ResetPassword {
  private auth = inject(AuthService);
  private router = inject(Router);
  f = inject(FormBuilder).nonNullable.group({ password: ['', [Validators.required, Validators.minLength(8)]] });
  error = signal('');
  async submit() {
    try { await this.auth.updatePassword(this.f.getRawValue().password); await this.router.navigateByUrl('/'); }
    catch (e) { this.error.set((e as Error).message); }
  }
}

/** /invite/:token — previews the invitation and routes the invitee to sign up / sign in; accepts if already signed in. */
@Component({
  selector: 'px-accept-invite',
  imports: [RouterLink],
  styles: AUTH_STYLES,
  template: `
    <div class="wrap"><div class="box">
      @if (loading()) { <p>Loading invitation…</p> }
      @else if (!p() || !p()!.valid) { <h1>Invitation unavailable</h1><p class="muted">This invitation is invalid, expired, or has already been used.</p><a routerLink="/login">Go to sign in</a> }
      @else {
        <h1>Join {{ p()!.organization_name }}</h1>
        <p class="muted">Invited as <b>{{ p()!.role }}</b>{{ p()!.team_name ? ' in ' + p()!.team_name : '' }} ({{ p()!.email }}).</p>
        @if (auth.isAuthenticated()) {
          @if (error()) { <div class="alert error">{{ error() }}</div> }
          <button class="btn primary" (click)="accept()">Accept invitation</button>
        } @else {
          <div class="row"><a class="btn primary" routerLink="/register" [queryParams]="{ invite: token }">Create account</a>
            <a class="btn" routerLink="/login" [queryParams]="{ invite: token }">I have an account</a></div>
        }
      }
    </div></div>`,
})
export class AcceptInvite implements OnInit {
  protected auth = inject(AuthService);
  private org = inject(OrgService);
  private router = inject(Router);
  token = inject(ActivatedRoute).snapshot.paramMap.get('token')!;
  loading = signal(true); error = signal('');
  p = signal<Awaited<ReturnType<OrgService['previewInvitation']>>>(null);

  async ngOnInit() {
    await this.auth.init();
    this.p.set(await this.org.previewInvitation(this.token).catch(() => null));
    this.loading.set(false);
  }
  async accept() {
    try { await this.auth.acceptInvitation(this.token); await this.router.navigateByUrl('/'); }
    catch (e) { this.error.set((e as Error).message); }
  }
}
