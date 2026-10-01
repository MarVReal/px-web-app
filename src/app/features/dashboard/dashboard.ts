import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Member, Pipeline, Team } from '../../core/models/models';
import { OrgService } from '../../core/services/org.service';
import { ToastService } from '../../core/services/toast.service';
import { DashRow, WorkService } from '../../core/services/work.service';
import { monthLabel, today } from '../../shared/utils/format';

interface Bar { label: string; value: number; }

@Component({
  selector: 'px-dashboard',
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-head"><h1>{{ title() }}</h1><span class="spacer"></span>
        @if (!auth.role() || auth.role() !== 'staff') {
          @if (auth.isAdmin()) {
            <select style="width:auto" (change)="fTeam.set($any($event.target).value)"><option value="">All teams</option>
              @for (t of teams(); track t.id) { <option [value]="t.id">{{ t.name }}</option> }</select>
            <select style="width:auto" (change)="fUser.set($any($event.target).value)"><option value="">All users</option>
              @for (m of members(); track m.user_id) { <option [value]="m.user_id">{{ m.profile.full_name || m.profile.email }}</option> }</select>
          }
          <select style="width:auto" (change)="fPipe.set($any($event.target).value)"><option value="">All pipelines</option>
            @for (p of pipes(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }</select>
        }
        <select style="width:auto" (change)="fStatus.set($any($event.target).value)"><option value="">Any status</option>
          <option value="backlog">Pending</option><option value="in_progress">In progress</option><option value="done">Completed</option></select>
        <input type="month" style="width:auto" [value]="fMonth()" (input)="fMonth.set($any($event.target).value)" />
      </div>

      @if (loading()) { <div class="empty">Loading…</div> } @else {
        <div class="grid cols-4">
          @if (auth.isAdmin()) { <div class="card stat"><div class="num">{{ teams().length }}</div><div class="lbl">Teams</div></div>
            <div class="card stat"><div class="num">{{ members().length }}</div><div class="lbl">Users</div></div>
            <div class="card stat"><div class="num">{{ pipes().length }}</div><div class="lbl">Active pipelines</div></div> }
          <div class="card stat"><div class="num">{{ s().total }}</div><div class="lbl">{{ auth.role() === 'staff' ? 'My tasks' : 'Total tasks' }}</div></div>
          <div class="card stat"><div class="num">{{ s().done }}</div><div class="lbl">Completed</div></div>
          <div class="card stat"><div class="num">{{ s().inProgress }}</div><div class="lbl">In progress</div></div>
          <div class="card stat"><div class="num" [style.color]="s().overdue ? 'var(--danger)' : ''">{{ s().overdue }}</div><div class="lbl">Overdue</div></div>
          <div class="card stat"><div class="num">{{ s().rate }}%</div><div class="lbl">Completion</div></div>
          @if (auth.role() === 'staff') {
            <div class="card stat"><div class="num">{{ s().dueToday }}</div><div class="lbl">Due today</div></div>
            <div class="card stat"><div class="num">{{ s().upcoming }}</div><div class="lbl">Upcoming (7 days)</div></div> }
        </div>

        <div class="grid cols-2" style="margin-top: 16px">
          @for (c of charts(); track c.title) {
            <div class="card"><h3 style="margin-bottom: 12px">{{ c.title }}</h3>
              @for (b of c.bars; track b.label) {
                <div class="bar-row"><span class="bl" [title]="b.label">{{ b.label }}</span>
                  <div class="track"><i [style.width.%]="c.max ? (b.value / c.max) * 100 : 0"></i></div><span class="bv">{{ b.value }}</span></div>
              } @empty { <div class="muted small">No data</div> }
            </div>
          }
        </div>
        <div class="row" style="margin-top: 16px"><a class="btn" routerLink="/pipelines">Open pipelines</a>
          <a class="btn" routerLink="/reports">{{ auth.role() === 'staff' ? 'My reports' : 'Reports' }}</a></div>
      }
    </div>`,
  styles: `
    .bar-row { display: grid; grid-template-columns: 120px 1fr 36px; gap: 10px; align-items: center; margin: 6px 0; }
    .bl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; } .bv { text-align: right; font-weight: 600; }
    .track { background: #eef0f4; border-radius: 6px; height: 12px; i { display: block; height: 100%; background: var(--primary); border-radius: 6px; } }`,
})
export class Dashboard implements OnInit {
  protected auth = inject(AuthService);
  private work = inject(WorkService);
  private org = inject(OrgService);
  private toast = inject(ToastService);

  rows = signal<DashRow[]>([]); teams = signal<Team[]>([]); pipes = signal<Pipeline[]>([]); members = signal<Member[]>([]);
  loading = signal(true);
  fTeam = signal(''); fPipe = signal(''); fUser = signal(''); fStatus = signal('');
  fMonth = signal(new Date().toISOString().slice(0, 7));

  title = computed(() => ({ admin: 'Admin dashboard', section_head: 'Team dashboard', staff: 'My dashboard' } as Record<string, string>)[this.auth.role() ?? 'staff']);

  private scoped = computed(() => {
    const me = this.auth.userId();
    return this.rows().filter((r) => (this.auth.role() !== 'staff' || r.assignees.some((a) => a.user_id === me))
      && (!this.fTeam() || r.team_id === this.fTeam()) && (!this.fPipe() || r.pipeline_id === this.fPipe())
      && (!this.fUser() || r.assignees.some((a) => a.user_id === this.fUser()))
      && (!this.fStatus() || (this.fStatus() === 'done' ? r.stage.kind === 'done' : this.fStatus() === 'backlog' ? r.stage.kind === 'backlog' : r.stage.kind === 'active' || r.stage.kind === 'review')));
  });

  s = computed(() => {
    const rows = this.scoped(), t = today(), week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const open = rows.filter((r) => !r.completed_at);
    const done = rows.length - open.length;
    return {
      total: rows.length, done, inProgress: rows.filter((r) => r.stage.kind === 'active' || r.stage.kind === 'review').length,
      overdue: open.filter((r) => r.due_date && r.due_date < t).length,
      dueToday: open.filter((r) => r.due_date === t).length,
      upcoming: open.filter((r) => r.due_date && r.due_date > t && r.due_date <= week).length,
      rate: rows.length ? Math.round((done / rows.length) * 100) : 0,
    };
  });

  charts = computed(() => {
    const rows = this.scoped();
    const tally = (keyOf: (r: DashRow) => string[]) => {
      const m = new Map<string, number>();
      rows.forEach((r) => keyOf(r).forEach((k) => m.set(k, (m.get(k) ?? 0) + 1)));
      return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    };
    const mk = (title: string, bars: Bar[]) => ({ title, bars: bars.slice(0, 8), max: Math.max(0, ...bars.map((b) => b.value)) });
    const teamName = (id: string) => this.teams().find((t) => t.id === id)?.name ?? 'Team';
    const person = (id: string) => { const p = this.members().find((m) => m.user_id === id)?.profile; return p?.full_name || p?.email || 'Me'; };

    const month = this.fMonth();
    const doneThisMonth = rows.filter((r) => r.completed_at?.startsWith(month)).length;
    const trend: Bar[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      trend.push({ label: monthLabel(key), value: rows.filter((r) => r.completed_at?.startsWith(key)).length });
    }
    const list = [
      mk('Tasks by status', tally((r) => [r.stage.name])),
      mk(`Completed in ${monthLabel(month)} (${doneThisMonth})`, trend),
    ];
    if (this.auth.role() !== 'staff') {
      list.splice(1, 0, mk('Tasks by team', tally((r) => [teamName(r.team_id)])));
      list.push(mk('Workload by staff (open tasks)', (() => {
        const m = new Map<string, number>();
        rows.filter((r) => !r.completed_at).forEach((r) => r.assignees.forEach((a) => m.set(person(a.user_id), (m.get(person(a.user_id)) ?? 0) + 1)));
        return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
      })()));
    }
    return list;
  });

  async ngOnInit() {
    try {
      const [rows, teams, pipes] = await Promise.all([this.work.dashboardRows(), this.org.listTeams(), this.work.listPipelines()]);
      this.rows.set(rows); this.teams.set(teams); this.pipes.set(pipes);
      if (this.auth.role() !== 'staff') this.members.set(await this.org.listMembers());
    } catch (e) { this.toast.error(e); } finally { this.loading.set(false); }
  }
}
