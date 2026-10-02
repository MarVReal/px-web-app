import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Pipeline, Team, TeamMember } from '../../core/models/models';
import { OrgService } from '../../core/services/org.service';
import { ToastService } from '../../core/services/toast.service';
import { WorkService } from '../../core/services/work.service';
import { Modal } from '../../shared/components/modal';

@Component({
  selector: 'px-pipelines',
  imports: [RouterLink, Modal],
  template: `
    <div class="page">
      <div class="page-head"><h1>Pipelines</h1><span class="spacer"></span>
        @if (canCreate()) { <button class="btn primary" (click)="show.set(true)" [disabled]="!manageable().length">+ New pipeline</button> }</div>
      @if (loading()) { <div class="empty">Loading…</div> }
      @else {
        @for (t of teams(); track t.id) {
          <h3 style="margin: 18px 0 8px">{{ t.name }}</h3>
          <div class="grid cols-4">
            @for (p of byTeam(t.id); track p.id) {
              <a class="card pcard" [routerLink]="['/pipelines', p.id]"><b>{{ p.name }}</b><div class="muted small">{{ p.description || 'Kanban pipeline' }}</div></a>
            } @empty { <div class="muted small">No pipelines for this section yet.</div> }
          </div>
        } @empty { <div class="empty card">You aren't in a section yet. {{ auth.isAdmin() ? 'Create a section first.' : 'Ask an admin to add you to one.' }}</div> }
      }
    </div>
    @if (show()) {
      <px-modal title="New pipeline" (closed)="show.set(false)">
        <div class="modal-body stack">
          <label class="field">Section<select [value]="teamId()" (change)="teamId.set($any($event.target).value)">
            @for (t of manageable(); track t.id) { <option [value]="t.id" [selected]="t.id === teamId()">{{ t.name }}</option> }</select></label>
          <label class="field">Name<input [value]="name()" (input)="name.set($any($event.target).value)" placeholder="e.g. Monthly Data Quality Activities" /></label>
          <label class="field">Description<textarea [value]="desc()" (input)="desc.set($any($event.target).value)"></textarea></label>
          <p class="muted small">Starts with Backlog → Planning → In Progress → For Review → Completed. You can customize stages on the board.</p>
        </div>
        <div class="modal-foot"><button class="btn" (click)="show.set(false)">Cancel</button>
          <button class="btn primary" (click)="create()" [disabled]="!name().trim() || !teamId()">Create</button></div>
      </px-modal>
    }`,
  styles: `.pcard { color: var(--text); display: block; &:hover { border-color: var(--primary); } }`,
})
export class Pipelines implements OnInit {
  protected auth = inject(AuthService);
  private org = inject(OrgService);
  private work = inject(WorkService);
  private toast = inject(ToastService);

  teams = signal<Team[]>([]); pipelines = signal<Pipeline[]>([]); heads = signal<TeamMember[]>([]);
  loading = signal(true); show = signal(false);
  name = signal(''); desc = signal(''); teamId = signal('');

  /** Teams where the user may create pipelines (admins: all; section heads: their teams). */
  manageable = computed(() => this.auth.isAdmin() ? this.teams()
    : this.teams().filter((t) => this.heads().some((m) => m.team_id === t.id && m.user_id === this.auth.userId() && m.is_head)));
  canCreate = computed(() => this.auth.isAdmin() || this.auth.isHead());
  byTeam = (id: string) => this.pipelines().filter((p) => p.team_id === id);

  async ngOnInit() {
    try {
      const [teams, pipes, tm] = await Promise.all([this.org.listTeams(), this.work.listPipelines(), this.org.listTeamMembers()]);
      this.teams.set(teams); this.pipelines.set(pipes); this.heads.set(tm);
      this.teamId.set(this.manageable()[0]?.id ?? '');
    } catch (e) { this.toast.error(e); } finally { this.loading.set(false); }
  }

  async create() {
    try {
      await this.work.createPipeline({ team_id: this.teamId(), name: this.name().trim(), description: this.desc().trim() || undefined });
      this.show.set(false); this.name.set(''); this.desc.set('');
      this.pipelines.set(await this.work.listPipelines());
      this.toast.success('Pipeline created');
    } catch (e) { this.toast.error(e); }
  }
}
