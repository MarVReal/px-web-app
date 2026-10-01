import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Division, Member, Pipeline, Team, TeamMember } from '../../core/models/models';
import { ConfirmService } from '../../core/services/confirm.service';
import { OrgService } from '../../core/services/org.service';
import { ToastService } from '../../core/services/toast.service';
import { WorkService } from '../../core/services/work.service';
import { Avatar } from '../../shared/components/avatar';
import { Modal } from '../../shared/components/modal';

@Component({
  selector: 'px-teams',
  imports: [Modal, Avatar, RouterLink],
  template: `
    <div class="page">
      <div class="page-head"><h1>{{ auth.isAdmin() ? 'Teams' : 'My Team' }}</h1><span class="spacer"></span>
        @if (auth.isAdmin()) {
          <button class="btn" (click)="divModal.set(true)">+ Division</button>
          <button class="btn primary" (click)="openTeam(null)">+ New team</button> }</div>
      @if (loading()) { <div class="empty">Loading…</div> }
      @for (t of teams(); track t.id) {
        <div class="card" style="margin-bottom: 14px">
          <div class="row">
            <div><h2>{{ t.name }}</h2><div class="muted small">{{ divName(t.division_id) }}{{ t.description ? ' · ' + t.description : '' }}</div></div>
            <span class="spacer"></span>
            @if (auth.isAdmin()) {
              <button class="btn sm" (click)="openTeam(t)">Edit</button>
              <button class="btn sm danger" (click)="archive(t)">Archive</button> }
          </div>
          <div class="row wrap" style="margin-top: 12px">
            @for (m of membersOf(t.id); track m.id) {
              <span class="chip"><px-avatar [name]="m.profile?.full_name || m.profile?.email || ''" [size]="22" />
                {{ m.profile?.full_name || m.profile?.email }} @if (m.is_head) { <span class="badge ok">Head</span> }
                @if (auth.isAdmin()) {
                  @if (!m.is_head) { <button class="x" title="Make section head" (click)="makeHead(t, m)">★</button> }
                  <button class="x" title="Remove" (click)="removeMember(m)">✕</button> }
              </span>
            } @empty { <span class="muted small">No members.</span> }
            @if (auth.isAdmin()) {
              <select style="width: auto" (change)="addMember(t, $any($event.target))">
                <option value="">+ Add member…</option>
                @for (u of addable(t.id); track u.user_id) { <option [value]="u.user_id">{{ u.profile.full_name || u.profile.email }}</option> }</select> }
          </div>
          <div class="row wrap" style="margin-top: 12px">
            <span class="muted small">Pipelines:</span>
            @for (p of pipesOf(t.id); track p.id) { <a class="badge" [routerLink]="['/pipelines', p.id]">{{ p.name }}</a> } @empty { <span class="muted small">none</span> }
          </div>
        </div>
      } @empty { @if (!loading()) { <div class="empty card">No teams yet.</div> } }
    </div>

    @if (teamModal()) {
      <px-modal [title]="editing() ? 'Edit team' : 'New team'" (closed)="teamModal.set(false)">
        <div class="modal-body stack">
          <label class="field">Name<input [value]="tName()" (input)="tName.set($any($event.target).value)" /></label>
          <label class="field">Division<select [value]="tDiv()" (change)="tDiv.set($any($event.target).value)">
            <option value="" [selected]="!tDiv()">— None —</option>@for (d of divisions(); track d.id) { <option [value]="d.id" [selected]="d.id === tDiv()">{{ d.name }}</option> }</select></label>
          <label class="field">Description<textarea [value]="tDesc()" (input)="tDesc.set($any($event.target).value)"></textarea></label>
        </div>
        <div class="modal-foot"><button class="btn" (click)="teamModal.set(false)">Cancel</button>
          <button class="btn primary" (click)="saveTeam()" [disabled]="!tName().trim()">Save</button></div>
      </px-modal>
    }
    @if (divModal()) {
      <px-modal title="New division" (closed)="divModal.set(false)">
        <div class="modal-body"><label class="field">Name<input [value]="dName()" (input)="dName.set($any($event.target).value)" /></label></div>
        <div class="modal-foot"><button class="btn primary" (click)="saveDivision()" [disabled]="!dName().trim()">Create</button></div>
      </px-modal>
    }`,
  styles: `.chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px 2px 4px; }
    .x { border: 0; background: none; cursor: pointer; color: var(--muted); padding: 0 2px; &:hover { color: var(--danger); } }`,
})
export class Teams implements OnInit {
  protected auth = inject(AuthService);
  private org = inject(OrgService);
  private work = inject(WorkService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  teams = signal<Team[]>([]); divisions = signal<Division[]>([]); tm = signal<TeamMember[]>([]);
  pipes = signal<Pipeline[]>([]); orgMembers = signal<Member[]>([]); loading = signal(true);
  teamModal = signal(false); divModal = signal(false); editing = signal<Team | null>(null);
  tName = signal(''); tDesc = signal(''); tDiv = signal(''); dName = signal('');

  membersOf = (id: string) => this.tm().filter((m) => m.team_id === id);
  pipesOf = (id: string) => this.pipes().filter((p) => p.team_id === id);
  divName = (id: string | null) => this.divisions().find((d) => d.id === id)?.name ?? 'No division';
  addable = (teamId: string) => this.orgMembers().filter((m) => !this.membersOf(teamId).some((x) => x.user_id === m.user_id));
  isAdmin = computed(() => this.auth.isAdmin());

  ngOnInit() { this.load(); }

  async load() {
    try {
      const [teams, divs, tm, pipes] = await Promise.all([this.org.listTeams(), this.org.listDivisions(), this.org.listTeamMembers(), this.work.listPipelines()]);
      this.teams.set(teams); this.divisions.set(divs); this.tm.set(tm); this.pipes.set(pipes);
      if (this.auth.isAdmin()) this.orgMembers.set(await this.org.listMembers());
    } catch (e) { this.toast.error(e); } finally { this.loading.set(false); }
  }

  openTeam(t: Team | null) {
    this.editing.set(t); this.tName.set(t?.name ?? ''); this.tDesc.set(t?.description ?? ''); this.tDiv.set(t?.division_id ?? '');
    this.teamModal.set(true);
  }
  async saveTeam() {
    const body = { name: this.tName().trim(), description: this.tDesc().trim() || null, division_id: this.tDiv() || null };
    try {
      if (this.editing()) await this.org.updateTeam(this.editing()!.id, body); else await this.org.createTeam(body);
      this.teamModal.set(false); await this.load(); this.toast.success('Team saved');
    } catch (e) { this.toast.error(e); }
  }
  async saveDivision() {
    try { await this.org.createDivision(this.dName().trim()); this.divModal.set(false); this.dName.set(''); await this.load(); }
    catch (e) { this.toast.error(e); }
  }
  async archive(t: Team) {
    if (!(await this.confirm.ask(`Archive team "${t.name}"? It will be hidden from lists.`, 'Archive'))) return;
    try { await this.org.updateTeam(t.id, { is_archived: true }); await this.load(); } catch (e) { this.toast.error(e); }
  }
  async addMember(t: Team, sel: HTMLSelectElement) {
    const id = sel.value; sel.value = '';
    if (!id) return;
    try { await this.org.addTeamMember(t.id, id); await this.load(); } catch (e) { this.toast.error(e); }
  }
  async removeMember(m: TeamMember) {
    try { await this.org.removeTeamMember(m.id); await this.load(); } catch (e) { this.toast.error(e); }
  }
  async makeHead(t: Team, m: TeamMember) {
    const role = this.orgMembers().find((x) => x.user_id === m.user_id)?.role;
    try {
      if (role === 'staff') {
        const ok = await this.confirm.ask('Promote this user to Section Head?', 'Promote');
        if (!ok) return;
        await this.org.updateMember(this.orgMembers().find((x) => x.user_id === m.user_id)!.id, { role: 'section_head' });
      }
      await this.org.setTeamHead(t.id, m.user_id); await this.load(); this.toast.success('Section head assigned');
    } catch (e) { this.toast.error(e); }
  }
}
