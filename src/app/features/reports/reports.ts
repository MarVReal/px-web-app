import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { Division, Member, MonthlyReport, ReportSummary, Team } from '../../core/models/models';
import { OrgService } from '../../core/services/org.service';
import { ReportDoc, ReportService } from '../../core/services/report.service';
import { ToastService } from '../../core/services/toast.service';
import { exportCsv, exportPdf, exportXlsx } from '../../shared/utils/export';
import { isoDate, rangeLabel } from '../../shared/utils/format';

type Kind = 'individual' | 'team' | 'organization';
interface Section { teamId: string; team: string; summary: ReportSummary; narrative: string; }

const sum = (list: ReportSummary[]): ReportSummary => {
  const total = list.reduce((n, s) => n + s.total, 0), completed = list.reduce((n, s) => n + s.completed, 0);
  return {
    period_start: list[0]?.period_start ?? '', total, completed,
    in_progress: list.reduce((n, s) => n + s.in_progress, 0), pending: list.reduce((n, s) => n + s.pending, 0),
    carried_over: list.reduce((n, s) => n + s.carried_over, 0), delayed: list.reduce((n, s) => n + s.delayed, 0),
    completion_rate: total ? Math.round((1000 * completed) / total) / 10 : 0,
    effort_hours: list.reduce((n, s) => n + s.effort_hours, 0), tasks: list.flatMap((s) => s.tasks),
  };
};

const today = () => new Date();
const monthStart = (offset = 0) => new Date(today().getFullYear(), today().getMonth() + offset, 1);
const monthEnd = (offset = 0) => new Date(today().getFullYear(), today().getMonth() + offset + 1, 0);

@Component({
  selector: 'px-reports',
  template: `
    <div class="page">
      <div class="page-head"><h1>Accomplishment Reports</h1></div>
      <div class="card">
        <div class="row wrap">
          <label class="field">Report type<select (change)="kind.set($any($event.target).value); reset()">
            <option value="individual">Individual</option>
            @if (auth.role() !== 'staff') { <option value="team">Section</option> }
            @if (auth.isAdmin()) { <option value="organization">Organization (compile sections)</option> }</select></label>
          <label class="field">From<input type="date" [value]="from()" [max]="to()" (change)="from.set($any($event.target).value); reset()" /></label>
          <label class="field">To<input type="date" [value]="to()" [min]="from()" (change)="to.set($any($event.target).value); reset()" /></label>
          @if (kind() === 'team') {
            <label class="field">Section<select (change)="teamId.set($any($event.target).value); reset()">
              <option value="">Select…</option>@for (t of teams(); track t.id) { <option [value]="t.id" [selected]="t.id === teamId()">{{ t.name }}</option> }</select></label> }
          @if (kind() === 'individual' && auth.role() !== 'staff') {
            <label class="field">Staff<select (change)="userId.set($any($event.target).value); reset()">
              @for (m of members(); track m.user_id) { <option [value]="m.user_id" [selected]="m.user_id === userId()">{{ m.profile.full_name || m.profile.email }}</option> }</select></label> }
          @if (kind() === 'organization') {
            <div class="field">Sections to include<div class="row wrap">
              @for (t of teams(); track t.id) { <label class="row" style="font-weight:450"><input type="checkbox" style="width:auto" [checked]="picked().has(t.id)" (change)="pick(t.id)" /> {{ t.name }}</label> }</div></div> }
          <span class="spacer"></span>
          <button class="btn primary" (click)="generate()" [disabled]="busy() || !ready()">{{ busy() ? 'Generating…' : 'Generate preview' }}</button>
        </div>
        <div class="row wrap" style="margin-top: 10px">
          <span class="muted small">Quick range:</span>
          @for (p of presets; track p.label) { <button class="btn sm" (click)="preset(p)">{{ p.label }}</button> }
          <span class="spacer"></span><span class="small"><b>{{ label() }}</b></span>
        </div>
        @if (!validRange()) { <div class="err" style="margin-top: 8px">"To" must be on or after "From" (maximum range: one year).</div> }
      </div>

      @if (summary(); as s) {
        <div class="card" style="margin-top: 16px">
          <div class="row"><h2>{{ docTitle() }} — {{ label() }}</h2><span class="spacer"></span><span class="badge">{{ sections().length ? 'Compiled' : 'Preview' }}</span></div>
          <div class="grid cols-4" style="margin: 14px 0">
            <div class="stat"><div class="num">{{ s.total }}</div><div class="lbl">Total</div></div>
            <div class="stat"><div class="num">{{ s.completed }}</div><div class="lbl">Completed</div></div>
            <div class="stat"><div class="num">{{ s.in_progress }}</div><div class="lbl">In progress</div></div>
            <div class="stat"><div class="num">{{ s.pending }}</div><div class="lbl">Pending</div></div>
            <div class="stat"><div class="num">{{ s.carried_over }}</div><div class="lbl">Carried over</div></div>
            <div class="stat"><div class="num">{{ s.delayed }}</div><div class="lbl">Delayed</div></div>
            <div class="stat"><div class="num">{{ s.completion_rate }}%</div><div class="lbl">Completion</div></div>
          </div>

          <div class="ai">
            <div class="row wrap">
              <div><b>Write the narrative with AI</b>
                <div class="muted small">Reads the title and description of each task in this period.</div></div>
              <span class="spacer"></span>
              <button class="btn primary" (click)="writeWithAi()" [disabled]="aiBusy() || aiEnabled() === false || s.total === 0">
                {{ aiBusy() ? 'Writing…' : aiUsed() ? 'Write again' : 'Write with AI' }}</button>
            </div>
            @if (aiEnabled() === false) {
              <div class="muted small">AI writing is turned off for your organization. An admin can turn it on in Organization Settings.</div>
            } @else {
              @if (kind() === 'organization') {
                <div class="muted small">Each section gets its own part, plus a consolidated summary.</div>
              } @else {
                <label class="row small" style="font-weight: 500"><input type="checkbox" style="width: auto" [checked]="byCategory()" (change)="byCategory.set($any($event.target).checked)" /> Separate by category</label>
                @if (byCategory() && categoryNames().length) {
                  <div class="row wrap">
                    <span class="muted small">Categories:</span>
                    @for (c of categoryNames(); track c) {
                      <label class="row small" style="font-weight: 450"><input type="checkbox" style="width: auto" [checked]="pickedCats().has(c)" (change)="toggleCat(c)" /> {{ c }}</label>
                    }
                  </div>
                  <div class="muted small">Tick the categories that should get their own section; everything else goes under "Other work". Tick none to use every category.</div>
                }
              }
              <div class="muted small">Task titles and descriptions are sent to Google Gemini to write this. Review and edit the text before saving.</div>
            }
          </div>

          @if (sections().length) {
            @for (sec of sections(); track sec.teamId; let i = $index) {
              <h3>{{ sec.team }} <span class="muted small">({{ sec.summary.completed }}/{{ sec.summary.total }} completed)</span></h3>
              <textarea style="min-height: 110px; margin: 6px 0 14px" [value]="sec.narrative" (input)="setSectionNarrative(i, $any($event.target).value)"></textarea>
            }
            <label class="field">Consolidated organization summary<textarea style="min-height: 120px" [value]="narrative()" (input)="narrative.set($any($event.target).value)"></textarea></label>
          } @else {
            <label class="field">Accomplishment narrative (edit before finalizing)<textarea style="min-height: 150px" [value]="narrative()" (input)="narrative.set($any($event.target).value)"></textarea></label>
          }

          <h3 style="margin: 16px 0 6px">Task details</h3>
          <div class="table-wrap card flush"><table class="tbl"><thead><tr><th>Task</th><th>Assignee</th><th>Status</th><th>Date completed</th><th>Remarks</th></tr></thead><tbody>
            @for (t of s.tasks; track t.id) {
              <tr><td>{{ t.title }}</td><td>{{ t.assignees || '—' }}</td><td><span class="badge" [class.ok]="t.status === 'completed'">{{ t.status.replace('_', ' ') }}</span></td>
                <td>{{ t.completed_on || '—' }}</td><td class="small">{{ t.delayed ? 'Delayed ' : '' }}{{ t.carried_over ? 'Carried over' : '' }}</td></tr>
            } @empty { <tr><td colspan="5" class="muted">No tasks in this period.</td></tr> }</tbody></table></div>

          <div class="row wrap" style="margin-top: 16px">
            <button class="btn" (click)="save('draft')">Save draft</button>
            <button class="btn primary" (click)="save('final')">Finalize</button><span class="spacer"></span>
            <button class="btn" (click)="exp('pdf')">PDF</button><button class="btn" (click)="exp('xlsx')">Excel</button><button class="btn" (click)="exp('csv')">CSV</button>
          </div>
        </div>
      }

      <h2 style="margin: 24px 0 10px">Saved reports</h2>
      <div class="card flush table-wrap"><table class="tbl"><thead><tr><th>Period</th><th>Type</th><th>Scope</th><th>Status</th><th>Completion</th></tr></thead><tbody>
        @for (r of saved(); track r.id) {
          <tr><td>{{ range(r) }}</td><td>{{ r.scope }}</td><td>{{ scopeName(r) }}</td>
            <td><span class="badge" [class.ok]="r.status === 'final'">{{ r.status }}</span>
              @if (r.ai_generated) { <span class="badge" title="Narrative drafted with AI">AI-assisted</span> }</td><td>{{ $any(r.summary).completion_rate ?? 0 }}%</td></tr>
        } @empty { <tr><td colspan="5" class="muted">Nothing saved yet.</td></tr> }</tbody></table></div>
    </div>`,
  styles: `.ai { display: flex; flex-direction: column; gap: 8px; margin: 4px 0 16px; padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-2); }`,
})
export class Reports implements OnInit {
  protected auth = inject(AuthService);
  private svc = inject(ReportService);
  private org = inject(OrgService);
  private toast = inject(ToastService);

  kind = signal<Kind>('individual');
  from = signal(isoDate(monthStart())); to = signal(isoDate(today()));
  teamId = signal(''); userId = signal('');
  teams = signal<Team[]>([]); members = signal<Member[]>([]); divisions = signal<Division[]>([]); saved = signal<MonthlyReport[]>([]);
  picked = signal<Set<string>>(new Set());
  summary = signal<ReportSummary | null>(null); narrative = signal(''); sections = signal<Section[]>([]);
  busy = signal(false);
  // AI writing: null until the organization's setting has been read (the server enforces it either way).
  aiEnabled = signal<boolean | null>(null);
  aiBusy = signal(false); aiUsed = signal(false); aiModel = signal<string | null>(null);
  byCategory = signal(true); categoryNames = signal<string[]>([]); pickedCats = signal<Set<string>>(new Set());

  presets = [
    { label: 'This month', from: () => monthStart(), to: () => monthEnd() },
    { label: 'Last month', from: () => monthStart(-1), to: () => monthEnd(-1) },
    { label: '1st – 15th', from: () => monthStart(), to: () => new Date(today().getFullYear(), today().getMonth(), 15) },
    { label: '16th – end of month', from: () => new Date(today().getFullYear(), today().getMonth(), 16), to: () => monthEnd() },
    { label: 'Last 7 days', from: () => new Date(Date.now() - 6 * 864e5), to: () => today() },
    { label: 'Last 30 days', from: () => new Date(Date.now() - 29 * 864e5), to: () => today() },
  ];

  label = computed(() => rangeLabel(this.from(), this.to()));
  validRange = computed(() => !!this.from() && !!this.to() && this.to() >= this.from()
    && (new Date(this.to()).getTime() - new Date(this.from()).getTime()) / 864e5 <= 366);
  docTitle = computed(() => ({ individual: 'Individual Accomplishment Report', team: 'Section Accomplishment Report', organization: 'Organization Accomplishment Report' })[this.kind()]);
  ready = computed(() => this.validRange() && (this.kind() === 'team' ? !!this.teamId() : this.kind() === 'organization' ? this.picked().size > 0 : !!this.userId()));
  range = (r: MonthlyReport) => rangeLabel(r.period_start, r.period_end);
  scopeName = (r: MonthlyReport) => r.scope === 'team' ? this.teams().find((t) => t.id === r.team_id)?.name ?? 'Team'
    : r.scope === 'individual' ? this.members().find((m) => m.user_id === r.subject_user_id)?.profile.full_name ?? 'Me' : this.auth.organization()?.name ?? '';

  async ngOnInit() {
    this.userId.set(this.auth.userId()!);
    try {
      const [t, d, s] = await Promise.all([this.org.listTeams(), this.org.listDivisions(), this.svc.list()]);
      this.teams.set(t); this.divisions.set(d); this.saved.set(s);
      if (this.auth.role() !== 'staff') this.members.set(await this.org.listMembers());
      if (this.auth.role() === 'section_head') this.teamId.set(t[0]?.id ?? '');
    } catch (e) { this.toast.error(e); }
    this.svc.categoryNames().then((c) => this.categoryNames.set(c)).catch(() => { /* categories are optional */ });
    this.org.getSettings().then((s) => this.aiEnabled.set(s?.ai_reports_enabled === true)).catch(() => { /* the server decides */ });
  }

  preset(p: { from: () => Date; to: () => Date }) { this.from.set(isoDate(p.from())); this.to.set(isoDate(p.to())); this.reset(); }
  reset() { this.summary.set(null); this.sections.set([]); this.narrative.set(''); this.aiUsed.set(false); this.aiModel.set(null); }
  toggleCat(name: string) { this.pickedCats.update((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; }); }

  /** Asks the AI to write the narrative from task titles and descriptions; the user edits it before saving. */
  async writeWithAi() {
    if (!this.summary()?.total) return;
    this.aiBusy.set(true);
    try {
      const kind = this.kind();
      const grouped = kind !== 'organization' && this.byCategory();
      const r = await this.svc.aiNarrative({
        scope: kind, from: this.from(), to: this.to(),
        team_id: kind === 'team' ? this.teamId() : undefined,
        team_ids: kind === 'organization' ? [...this.picked()] : undefined,
        user_id: kind === 'individual' ? this.userId() : undefined,
        group_by: grouped ? 'category' : 'none',
        categories: grouped && this.pickedCats().size ? [...this.pickedCats()] : undefined,
      });
      if (r.empty) { this.toast.info(r.message ?? 'There are no tasks in this period.'); return; }
      if (kind === 'organization') {
        this.sections.update((list) => list.map((s) => {
          const hit = r.sections.find((x) => x.key === s.teamId);
          return hit ? { ...s, narrative: hit.narrative } : s;
        }));
        this.narrative.set(r.overview);
      } else {
        this.narrative.set([r.overview, ...r.sections.map((s) => `${s.title}\n${s.narrative}`)].filter(Boolean).join('\n\n'));
      }
      this.aiUsed.set(true); this.aiModel.set(r.model);
      this.toast.success(r.omitted
        ? `Narrative written. ${r.omitted} tasks were left out of the text to keep it short; the numbers above still count them.`
        : 'Narrative written. Review it before saving.');
    } catch (e) { this.toast.error(e); } finally { this.aiBusy.set(false); }
  }
  pick(id: string) { this.picked.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); this.reset(); }
  setSectionNarrative(i: number, v: string) { this.sections.update((l) => l.map((s, j) => (j === i ? { ...s, narrative: v } : s))); }

  async generate() {
    this.busy.set(true); this.reset();
    try {
      const from = this.from(), to = this.to(), lbl = this.label();
      if (this.kind() === 'organization') {
        const secs: Section[] = [];
        for (const t of this.teams().filter((x) => this.picked().has(x.id))) {
          const summary = await this.svc.summary('team', from, to, t.id);
          secs.push({ teamId: t.id, team: t.name, summary, narrative: this.svc.draftNarrative(lbl, summary, true) });
        }
        const total = sum(secs.map((s) => s.summary));
        this.sections.set(secs); this.summary.set(total);
        this.narrative.set(this.svc.draftNarrative(lbl, total, true));
      } else {
        const kind = this.kind();
        const s = await this.svc.summary(kind, from, to, kind === 'team' ? this.teamId() : undefined, kind === 'individual' ? this.userId() : undefined);
        this.summary.set(s);
        this.narrative.set(this.svc.draftNarrative(lbl, s, kind !== 'individual'));
      }
    } catch (e) { this.toast.error(e); } finally { this.busy.set(false); }
  }

  private doc(): ReportDoc {
    const team = this.teams().find((t) => t.id === this.teamId());
    return {
      title: this.docTitle(), organization: this.auth.organization()!.name, period: this.label(),
      division: team ? this.divisions().find((d) => d.id === team.division_id)?.name : undefined,
      team: this.kind() === 'team' ? team?.name : undefined,
      subject: this.kind() === 'individual' ? (this.members().find((x) => x.user_id === this.userId())?.profile.full_name ?? this.auth.profile()?.full_name) : undefined,
      summary: this.summary()!, narrative: this.narrative(),
      sections: this.sections().length ? this.sections().map((s) => ({ team: s.team, summary: s.summary, narrative: s.narrative })) : undefined,
    };
  }

  async save(status: 'draft' | 'final') {
    try {
      const narrative = this.sections().length
        ? this.sections().map((s) => `${s.team}\n${s.narrative}`).join('\n\n') + '\n\n' + this.narrative() : this.narrative();
      await this.svc.save({ scope: this.kind(), team_id: this.kind() === 'team' ? this.teamId() : null,
        subject_user_id: this.kind() === 'individual' ? this.userId() : null, from: this.from(), to: this.to(), narrative, summary: this.summary()!, status,
        ai_generated: this.aiUsed(), ai_model: this.aiModel() });
      this.saved.set(await this.svc.list());
      this.toast.success(status === 'final' ? 'Report finalized' : 'Draft saved');
    } catch (e) { this.toast.error(e); }
  }

  async exp(f: 'pdf' | 'xlsx' | 'csv') {
    try { const d = this.doc(); if (f === 'pdf') await exportPdf(d); else if (f === 'xlsx') await exportXlsx(d); else exportCsv(d); }
    catch (e) { this.toast.error(e); }
  }
}
