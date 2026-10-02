import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { Role, ROLE_LABEL, Stage, TeamMember } from '../core/models/models';
import { OrgService } from '../core/services/org.service';
import { ToastService } from '../core/services/toast.service';
import { WorkService } from '../core/services/work.service';
import { Avatar } from '../shared/components/avatar';
import { TaskDialog } from '../features/tasks/task-dialog';
import { NotificationBell } from './notification-bell';

interface NavItem { label: string; path: string; icon: string; roles?: Role[]; }

// Navigation is role-driven. Route guards + RLS enforce access; this only controls what is shown.
const NAV: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: '▦' },
  { label: 'My Tasks', path: '/my-tasks', icon: '☑', roles: ['staff', 'section_head'] },
  { label: 'Pipelines', path: '/pipelines', icon: '☰' },
  { label: 'Sections', path: '/sections', icon: '⚑', roles: ['admin'] },
  { label: 'My Section', path: '/sections', icon: '⚑', roles: ['section_head'] },
  { label: 'Users', path: '/users', icon: '☺', roles: ['admin'] },
  { label: 'Categories & Tags', path: '/labels', icon: '#', roles: ['admin', 'section_head'] },
  { label: 'Card Designer', path: '/card-designer', icon: '▦', roles: ['admin', 'section_head'] },
  { label: 'Reports', path: '/reports', icon: '▤' },
  { label: 'Activity', path: '/activity', icon: '↻' },
  { label: 'Organization Settings', path: '/settings', icon: '⚙', roles: ['admin'] },
  { label: 'Profile', path: '/account', icon: '◉' },
];

const COLLAPSE_KEY = 'px.sidebar.collapsed';
function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}

@Component({
  selector: 'px-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Avatar, NotificationBell, TaskDialog],
  template: `
    <div class="layout" [class.open]="menu()" [class.collapsed]="collapsed()">
      <aside class="sidebar">
        <div class="top">
          <button type="button" class="arrow" (click)="toggleCollapsed()" [attr.aria-pressed]="collapsed()"
            [attr.title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'" [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              @if (collapsed()) { <path d="m9 18 6-6-6-6" /> } @else { <path d="m15 18-6-6 6-6" /> }</svg>
          </button>
          <div class="brand"><span class="brand-full">PROJECT<b>-X</b></span><span class="brand-mini">P<b>X</b></span></div>
        </div>
        <div class="org small">{{ auth.organization()?.name }}</div>
        <nav>
          @for (n of items(); track n.label) {
            <a [routerLink]="n.path" routerLinkActive="active" (click)="menu.set(false)" [attr.title]="collapsed() ? n.label : null" [attr.aria-label]="n.label">
              <span class="ico">{{ n.icon }}</span><span class="lbl">{{ n.label }}</span>
            </a>
          }
        </nav>
        <div class="me">
          <a class="me-link" routerLink="/account" title="Your profile" (click)="menu.set(false)">
            <px-avatar [name]="auth.profile()?.full_name || auth.profile()?.email || ''" [size]="32" />
            <div class="who"><div>{{ auth.profile()?.full_name }}</div><div class="small">{{ roleLabel() }}</div></div>
          </a>
          <button class="btn sm ghost out" (click)="auth.signOut()" title="Sign out">⏻</button>
        </div>
      </aside>
      <div class="main">
        <header>
          <button class="btn ghost burger" (click)="menu.set(!menu())">☰</button>
          <div class="search">
            <input placeholder="Search tasks, pipelines, sections, users…" [value]="q()" (input)="onSearch($any($event.target).value)" (blur)="close()" />
            @if (results(); as r) {
              <div class="results" (mousedown)="$event.preventDefault()">
                @for (t of r.tasks; track t.id) { <a (click)="go(['/pipelines', t.pipeline_id], t.id)">☑ {{ t.title }}</a> }
                @for (p of r.pipelines; track p.id) { <a (click)="go(['/pipelines', p.id])">☰ {{ p.name }}</a> }
                @for (t of r.teams; track t.id) { <a (click)="go(['/sections'])">⚑ {{ t.name }}</a> }
                @for (u of r.users; track u.id) { <a (click)="go(['/activity'])">☺ {{ u.full_name || u.email }}</a> }
                @if (!r.tasks.length && !r.pipelines.length && !r.teams.length && !r.users.length) { <div class="muted small pad">No results</div> }
              </div>
            }
          </div>
          <px-notification-bell (openTask)="openTask($event)" />
        </header>
        <router-outlet />
      </div>
    </div>
    @if (overlay(); as o) {
      <px-task-dialog [taskId]="o.id" [pipelineId]="o.pipelineId" [teamId]="o.teamId" [stages]="o.stages" [members]="o.members"
        [canManage]="o.canManage" (closed)="overlay.set(null)" />
    }`,
  styles: `
    .layout { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; transition: grid-template-columns .15s ease; }
    .sidebar { background: #101828; color: #d0d5dd; display: flex; flex-direction: column; padding: 16px 12px; position: sticky; top: 0; height: 100vh; }
    .brand { color: #fff; font-weight: 700; letter-spacing: .08em; padding: 4px 10px; font-size: 16px; b { color: #84caff; } }
    .org { padding: 0 10px 14px; color: #98a2b3; }
    nav { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow: auto; }
    nav a { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; color: #d0d5dd; cursor: pointer;
      &:hover { background: #1d2939; } &.active { background: #1d2939; color: #fff; box-shadow: inset 3px 0 0 #84caff; } }
    .ico { width: 18px; text-align: center; flex: none; }
    .brand-mini { display: none; }
    .top { display: flex; align-items: center; gap: 6px; }
    .arrow { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 8px;
      background: none; color: #98a2b3; cursor: pointer; &:hover { background: #1d2939; color: #fff; } }
    .me { display: flex; align-items: center; gap: 10px; padding: 10px; border-top: 1px solid #1d2939; .out { color: #d0d5dd; } }
    .me-link { display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; padding: 4px; margin: -4px; border-radius: 8px; color: inherit; &:hover { background: #1d2939; }
      .who { flex: 1; min-width: 0; color: #fff; line-height: 1.2; .small { color: #98a2b3; } } }
    .main { min-width: 0; }
    header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 10px 24px; display: flex; gap: 12px; position: sticky; top: 0; z-index: 20; }
    .burger { display: none; } .search { position: relative; flex: 1; max-width: 520px; }
    .results { position: absolute; top: 40px; left: 0; right: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow-lg);
      a { display: block; padding: 8px 12px; color: var(--text); cursor: pointer; &:hover { background: var(--surface-2); } } .pad { padding: 10px 12px; } }
    /* Icon-only rail on wide screens; on phones the menu is an overlay and always shows labels. */
    @media (min-width: 861px) {
      .layout.collapsed { grid-template-columns: 68px 1fr; }
      .collapsed .sidebar { padding: 16px 8px; }
      .collapsed .brand-full, .collapsed .org, .collapsed .lbl, .collapsed .who, .collapsed .out { display: none; }
      .collapsed .brand-mini { display: block; text-align: center; }
      .collapsed .brand { padding: 4px 0; }
      .collapsed nav a { justify-content: center; padding: 10px 0; }
      .collapsed .top { flex-direction: column; gap: 8px; }
      .collapsed .me { flex-direction: column; padding: 10px 0; border-top: 1px solid #1d2939; }
      .collapsed .me-link { flex: none; justify-content: center; }
    }
    @media (max-width: 860px) {
      .arrow { display: none; }
      .layout { grid-template-columns: 1fr; }
      .sidebar { position: fixed; left: -260px; width: 240px; z-index: 50; transition: left .2s; }
      .layout.open .sidebar { left: 0; } .burger { display: inline-flex; } header { padding: 10px 14px; }
    }`,
})
export class Shell {
  protected auth = inject(AuthService);
  private work = inject(WorkService);
  private org = inject(OrgService);
  private toast = inject(ToastService);
  private router = inject(Router);

  menu = signal(false);
  /** Sidebar shrunk to icons to give pages more room; the choice is remembered per browser. */
  collapsed = signal(readCollapsed());
  overlay = signal<{ id: string; pipelineId: string; teamId: string; stages: Stage[]; members: TeamMember[]; canManage: boolean } | null>(null);
  q = signal('');
  results = signal<Awaited<ReturnType<WorkService['search']>> | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  items = computed(() => NAV.filter((n) => !n.roles || (this.auth.role() && n.roles.includes(this.auth.role()!))));
  roleLabel = computed(() => (this.auth.role() ? ROLE_LABEL[this.auth.role()!] : ''));

  toggleCollapsed() {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* storage unavailable: just don't remember it */ }
  }

  /** Opens a task from a notification as an overlay on the current page, with the context the dialog needs. */
  async openTask(id: string) {
    try {
      const t = await this.work.getTask(id);
      const [stages, members] = await Promise.all([this.work.listStages(t.pipeline_id), this.org.listTeamMembers(t.team_id)]);
      const me = this.auth.userId();
      this.overlay.set({ id: t.id, pipelineId: t.pipeline_id, teamId: t.team_id, stages, members,
        canManage: this.auth.isAdmin() || members.some((m) => m.user_id === me && m.is_head) });
    } catch { this.toast.info('That task is no longer available.'); }
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
