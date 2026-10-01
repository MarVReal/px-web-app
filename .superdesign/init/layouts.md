# Layouts

App shell = `Shell` (dark sidebar with role-based nav + sticky top search bar + router outlet). `App` hosts toast + confirm dialog overlays.

### `src/app/layout/shell.ts`

```ts
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { Role, ROLE_LABEL } from '../core/models/models';
import { WorkService } from '../core/services/work.service';
import { Avatar } from '../shared/components/avatar';

interface NavItem { label: string; path: string; icon: string; roles?: Role[]; }

// Navigation is role-driven. Route guards + RLS enforce access; this only controls what is shown.
const NAV: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: '▦' },
  { label: 'My Tasks', path: '/my-tasks', icon: '☑', roles: ['staff', 'section_head'] },
  { label: 'Pipelines', path: '/pipelines', icon: '☰' },
  { label: 'Teams', path: '/teams', icon: '⚑', roles: ['admin'] },
  { label: 'My Team', path: '/teams', icon: '⚑', roles: ['section_head'] },
  { label: 'Users', path: '/users', icon: '☺', roles: ['admin'] },
  { label: 'Categories & Tags', path: '/labels', icon: '#', roles: ['admin', 'section_head'] },
  { label: 'Reports', path: '/reports', icon: '▤' },
  { label: 'Activity', path: '/activity', icon: '↻' },
  { label: 'Notifications', path: '/notifications', icon: '🔔' },
  { label: 'Organization Settings', path: '/settings', icon: '⚙', roles: ['admin'] },
  { label: 'Settings', path: '/account', icon: '⚙', roles: ['section_head', 'staff'] },
];

@Component({
  selector: 'px-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Avatar],
  template: `
    <div class="layout" [class.open]="menu()">
      <aside class="sidebar">
        <div class="brand">PROJECT<b>-X</b></div>
        <div class="org small">{{ auth.organization()?.name }}</div>
        <nav>
          @for (n of items(); track n.label) {
            <a [routerLink]="n.path" routerLinkActive="active" (click)="menu.set(false)">
              <span class="ico">{{ n.icon }}</span>{{ n.label }}
              @if (n.path === '/notifications' && unread() > 0) { <span class="pill">{{ unread() }}</span> }
            </a>
          }
        </nav>
        <div class="me">
          <px-avatar [name]="auth.profile()?.full_name || auth.profile()?.email || ''" [size]="32" />
          <div class="who"><div>{{ auth.profile()?.full_name }}</div><div class="small">{{ roleLabel() }}</div></div>
          <button class="btn sm ghost out" (click)="auth.signOut()" title="Sign out">⏻</button>
        </div>
      </aside>
      <div class="main">
        <header>
          <button class="btn ghost burger" (click)="menu.set(!menu())">☰</button>
          <div class="search">
            <input placeholder="Search tasks, pipelines, teams, users…" [value]="q()" (input)="onSearch($any($event.target).value)" (blur)="close()" />
            @if (results(); as r) {
              <div class="results" (mousedown)="$event.preventDefault()">
                @for (t of r.tasks; track t.id) { <a (click)="go(['/pipelines', t.pipeline_id], t.id)">☑ {{ t.title }}</a> }
                @for (p of r.pipelines; track p.id) { <a (click)="go(['/pipelines', p.id])">☰ {{ p.name }}</a> }
                @for (t of r.teams; track t.id) { <a (click)="go(['/teams'])">⚑ {{ t.name }}</a> }
                @for (u of r.users; track u.id) { <a (click)="go(['/activity'])">☺ {{ u.full_name || u.email }}</a> }
                @if (!r.tasks.length && !r.pipelines.length && !r.teams.length && !r.users.length) { <div class="muted small pad">No results</div> }
              </div>
            }
          </div>
        </header>
        <router-outlet />
      </div>
    </div>`,
  styles: `
    .layout { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
    .sidebar { background: #101828; color: #d0d5dd; display: flex; flex-direction: column; padding: 16px 12px; position: sticky; top: 0; height: 100vh; }
    .brand { color: #fff; font-weight: 700; letter-spacing: .08em; padding: 4px 10px; font-size: 16px; b { color: #84caff; } }
    .org { padding: 0 10px 14px; color: #98a2b3; }
    nav { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow: auto; }
    nav a { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; color: #d0d5dd; cursor: pointer;
      &:hover { background: #1d2939; } &.active { background: #1d2939; color: #fff; box-shadow: inset 3px 0 0 #84caff; } }
    .ico { width: 18px; text-align: center; } .pill { margin-left: auto; background: var(--primary); color: #fff; border-radius: 999px; font-size: 11px; padding: 0 7px; }
    .me { display: flex; align-items: center; gap: 10px; padding: 10px; border-top: 1px solid #1d2939; .who { flex: 1; min-width: 0; color: #fff; line-height: 1.2; .small { color: #98a2b3; } } .out { color: #d0d5dd; } }
    .main { min-width: 0; }
    header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 10px 24px; display: flex; gap: 12px; position: sticky; top: 0; z-index: 20; }
    .burger { display: none; } .search { position: relative; flex: 1; max-width: 520px; }
    .results { position: absolute; top: 40px; left: 0; right: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow-lg);
      a { display: block; padding: 8px 12px; color: var(--text); cursor: pointer; &:hover { background: var(--surface-2); } } .pad { padding: 10px 12px; } }
    @media (max-width: 860px) {
      .layout { grid-template-columns: 1fr; }
      .sidebar { position: fixed; left: -260px; width: 240px; z-index: 50; transition: left .2s; }
      .layout.open .sidebar { left: 0; } .burger { display: inline-flex; } header { padding: 10px 14px; }
    }`,
})
export class Shell implements OnInit {
  protected auth = inject(AuthService);
  private work = inject(WorkService);
  private router = inject(Router);
  private destroy = inject(DestroyRef);

  menu = signal(false);
  unread = signal(0);
  q = signal('');
  results = signal<Awaited<ReturnType<WorkService['search']>> | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  items = computed(() => NAV.filter((n) => !n.roles || (this.auth.role() && n.roles.includes(this.auth.role()!))));
  roleLabel = computed(() => (this.auth.role() ? ROLE_LABEL[this.auth.role()!] : ''));

  ngOnInit() {
    const refresh = () => this.work.unreadCount().then((n) => this.unread.set(n)).catch(() => undefined);
    refresh();
    const off = this.work.subscribeNotifications(refresh);
    this.destroy.onDestroy(off);
  }

  onSearch(v: string) {
    this.q.set(v); clearTimeout(this.timer);
    if (v.trim().length < 2) { this.results.set(null); return; }
    this.timer = setTimeout(async () => this.results.set(await this.work.search(v.trim())), 250);
  }
  close() { setTimeout(() => this.results.set(null), 100); }
  go(path: unknown[], task?: string) {
    this.results.set(null); this.q.set('');
    this.router.navigate(path, task ? { queryParams: { task } } : {});
  }
}
```

### `src/app/app.ts`

```ts
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
          <div class="modal-body">{{ c.message }}</div>
          <div class="modal-foot">
            <button class="btn" (click)="confirm.answer(false)">Cancel</button>
            <button class="btn danger solid" (click)="confirm.answer(true)">{{ c.confirmLabel }}</button>
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
```
