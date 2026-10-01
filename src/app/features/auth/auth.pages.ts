import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Role, ROLE_LABEL } from '../../core/models/models';
import { OrgService } from '../../core/services/org.service';
import { AuthShell } from './auth-shell';

const roleName = (r: string) => ROLE_LABEL[r as Role] ?? r;

@Component({
  selector: 'px-login',
  imports: [ReactiveFormsModule, RouterLink, AuthShell],
  template: `
    <px-auth-shell title="Welcome back" subtitle="Sign in to your Project-X workspace.">
      <form class="au-form" [formGroup]="f" (ngSubmit)="submit()">
        <div class="au-field">
          <label for="login-email">Email</label>
          <input id="login-email" class="au-input" type="email" formControlName="email" autocomplete="email" placeholder="you@example.com" />
        </div>
        <div class="au-field">
          <div class="au-label-row"><label for="login-password">Password</label><a class="au-link" routerLink="/forgot-password">Forgot password?</a></div>
          <span class="au-pass">
            <input id="login-password" class="au-input" [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" />
            <button type="button" class="au-eye" (click)="show.set(!show())" [attr.aria-pressed]="show()">{{ show() ? 'Hide' : 'Show' }}</button>
          </span>
        </div>
        @if (error()) { <div class="au-alert au-alert-error" role="alert">{{ error() }}</div> }
        @if (info()) { <div class="au-alert au-alert-ok" role="status">{{ info() }}</div> }
        <button class="au-btn" [disabled]="f.invalid || busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
      </form>
      <p authAlt>New to Project-X? <a class="au-link" routerLink="/register" [queryParams]="invite ? { invite } : {}">Create account</a></p>
    </px-auth-shell>`,
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  f = inject(FormBuilder).nonNullable.group({ email: ['', [Validators.required, Validators.email]], password: ['', Validators.required] });
  busy = signal(false); error = signal(''); info = signal(''); show = signal(false);
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
  imports: [ReactiveFormsModule, RouterLink, AuthShell],
  template: `
    <px-auth-shell [title]="preview() ? 'Join ' + preview()!.organization_name : 'Create your account'"
      [subtitle]="preview() ? '' : 'Set up your Project-X login in a minute.'">
      @if (preview(); as p) {
        <p class="au-note">You were invited as <b>{{ roleName(p.role) }}</b>{{ p.team_name ? ' in ' + p.team_name : '' }}. Use <b>{{ p.email }}</b> to sign up.</p>
      }
      <form class="au-form" [formGroup]="f" (ngSubmit)="submit()">
        <div class="au-field">
          <label for="reg-name">Full name</label>
          <input id="reg-name" class="au-input" formControlName="name" autocomplete="name" />
        </div>
        <div class="au-field">
          <label for="reg-email">Email</label>
          <input id="reg-email" class="au-input" type="email" formControlName="email" autocomplete="email" placeholder="you@example.com" />
        </div>
        <div class="au-field">
          <label for="reg-password">Password</label>
          <span class="au-pass">
            <input id="reg-password" class="au-input" [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="new-password" />
            <button type="button" class="au-eye" (click)="show.set(!show())" [attr.aria-pressed]="show()">{{ show() ? 'Hide' : 'Show' }}</button>
          </span>
          <span class="au-hint" [class.au-hint-bad]="f.controls.password.touched && f.controls.password.invalid">At least 8 characters.</span>
        </div>
        @if (error()) { <div class="au-alert au-alert-error" role="alert">{{ error() }}</div> }
        <button class="au-btn" [disabled]="f.invalid || busy()">{{ busy() ? 'Creating…' : 'Create account' }}</button>
      </form>
      <p authAlt>Already registered? <a class="au-link" routerLink="/login" [queryParams]="invite ? { invite } : {}">Sign in</a></p>
    </px-auth-shell>`,
})
export class Register implements OnInit {
  private auth = inject(AuthService);
  private org = inject(OrgService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  protected roleName = roleName;
  f = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });
  busy = signal(false); error = signal(''); show = signal(false);
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
  imports: [ReactiveFormsModule, RouterLink, AuthShell],
  template: `
    <px-auth-shell title="Reset your password" subtitle="Enter your email and we will send you a link to choose a new one.">
      <form class="au-form" [formGroup]="f" (ngSubmit)="submit()">
        <div class="au-field">
          <label for="forgot-email">Email</label>
          <input id="forgot-email" class="au-input" type="email" formControlName="email" autocomplete="email" placeholder="you@example.com" />
        </div>
        @if (error()) { <div class="au-alert au-alert-error" role="alert">{{ error() }}</div> }
        @if (sent()) { <div class="au-alert au-alert-ok" role="status">If that account exists, a reset link is on its way.</div> }
        <button class="au-btn" [disabled]="f.invalid">Send reset link</button>
      </form>
      <p authAlt><a class="au-link" routerLink="/login">Back to sign in</a></p>
    </px-auth-shell>`,
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
  imports: [ReactiveFormsModule, AuthShell],
  template: `
    <px-auth-shell title="Choose a new password" subtitle="Use at least 8 characters.">
      <form class="au-form" [formGroup]="f" (ngSubmit)="submit()">
        <div class="au-field">
          <label for="reset-password">New password</label>
          <span class="au-pass">
            <input id="reset-password" class="au-input" [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="new-password" />
            <button type="button" class="au-eye" (click)="show.set(!show())" [attr.aria-pressed]="show()">{{ show() ? 'Hide' : 'Show' }}</button>
          </span>
        </div>
        @if (error()) { <div class="au-alert au-alert-error" role="alert">{{ error() }}</div> }
        <button class="au-btn" [disabled]="f.invalid">Update password</button>
      </form>
    </px-auth-shell>`,
})
export class ResetPassword {
  private auth = inject(AuthService);
  private router = inject(Router);
  f = inject(FormBuilder).nonNullable.group({ password: ['', [Validators.required, Validators.minLength(8)]] });
  error = signal(''); show = signal(false);
  async submit() {
    try { await this.auth.updatePassword(this.f.getRawValue().password); await this.router.navigateByUrl('/'); }
    catch (e) { this.error.set((e as Error).message); }
  }
}

/** /invite/:token — previews the invitation and routes the invitee to sign up / sign in; accepts if already signed in. */
@Component({
  selector: 'px-accept-invite',
  imports: [RouterLink, AuthShell],
  template: `
    <px-auth-shell [title]="title()" [subtitle]="subtitle()">
      @if (!loading()) {
        @if (!p() || !p()!.valid) {
          <div class="au-actions"><a class="au-btn" routerLink="/login">Go to sign in</a></div>
        } @else if (auth.isAuthenticated()) {
          @if (error()) { <div class="au-alert au-alert-error" role="alert">{{ error() }}</div> }
          <div class="au-actions"><button class="au-btn" (click)="accept()">Accept invitation</button></div>
        } @else {
          <div class="au-actions">
            <a class="au-btn" routerLink="/register" [queryParams]="{ invite: token }">Create account</a>
            <a class="au-btn au-btn-line" routerLink="/login" [queryParams]="{ invite: token }">I already have an account</a>
          </div>
        }
      }
    </px-auth-shell>`,
})
export class AcceptInvite implements OnInit {
  protected auth = inject(AuthService);
  private org = inject(OrgService);
  private router = inject(Router);
  token = inject(ActivatedRoute).snapshot.paramMap.get('token')!;
  loading = signal(true); error = signal('');
  p = signal<Awaited<ReturnType<OrgService['previewInvitation']>>>(null);

  title() {
    if (this.loading()) return 'Checking your invitation';
    const p = this.p();
    return p?.valid ? 'Join ' + p.organization_name : 'Invitation unavailable';
  }
  subtitle() {
    if (this.loading()) return 'One moment…';
    const p = this.p();
    if (!p?.valid) return 'This invitation is invalid, expired, or has already been used.';
    return `You were invited as ${roleName(p.role)}${p.team_name ? ' in ' + p.team_name : ''} (${p.email}).`;
  }

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
