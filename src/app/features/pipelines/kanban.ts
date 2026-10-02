import { CdkDragDrop, CdkDrag, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { sanitizeLayout } from '../../core/models/card-layout';
import { Label, PRIORITIES, Pipeline, Priority, Stage, StageKind, Task, TeamMember, priorityLabel } from '../../core/models/models';
import { ConfirmService } from '../../core/services/confirm.service';
import { OrgService } from '../../core/services/org.service';
import { ToastService } from '../../core/services/toast.service';
import { WorkService } from '../../core/services/work.service';
import { TaskCardView } from '../../shared/components/task-card-view';
import { Modal } from '../../shared/components/modal';
import { isOverdue } from '../../shared/utils/format';
import { labelBg, labelFg } from '../../shared/utils/label-colors';
import { TaskDialog } from '../tasks/task-dialog';

type Field = 'priority' | 'category' | 'tags';

@Component({
  selector: 'px-kanban',
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, TaskCardView, TaskDialog, RouterLink, Modal],
  template: `
    <div class="wrap">
      <div class="head">
        <div class="head-top">
          <a routerLink="/pipelines" class="muted">← Pipelines</a>
          <h1>{{ pipeline()?.name }}</h1>
          <span class="spacer"></span>
          @if (canManage()) {
            <div class="menu-wrap">
              <button class="btn" (click)="menu.set(!menu())" [attr.aria-expanded]="menu()">⚙ Board settings</button>
              @if (menu()) {
                <div class="menu-backdrop" (click)="menu.set(false)"></div>
                <div class="menu" role="menu">
                  <button role="menuitem" (click)="menu.set(false); stageModal.set(true)">✎ Edit stages</button>
                  <a role="menuitem" routerLink="/labels" [queryParams]="{ pipeline: pipeline()?.id }" (click)="menu.set(false)">⚑ Categories &amp; tags</a>
                  <a role="menuitem" routerLink="/card-designer" [queryParams]="{ pipeline: pipeline()?.id }" (click)="menu.set(false)">▦ Card designer</a>
                  @if (canDelete()) {
                    <hr class="menu-sep" />
                    <button role="menuitem" class="menu-danger" (click)="menu.set(false); removePipeline()">🗑 Delete pipeline</button>
                  }
                </div>
              }
            </div>
          }
          <button class="btn primary" (click)="openNew(stages()[0]?.id)">+ New task</button>
        </div>
        <div class="filter-bar">
          <select [value]="fPriority()" (change)="fPriority.set($any($event.target).value)" aria-label="Priority">
            <option value="">All priorities</option>
            @for (p of priorities; track p.value) { <option [value]="p.value">{{ p.label }}</option> }</select>
          <span class="filter-divider"></span>
          <select [value]="fAssignee()" (change)="fAssignee.set($any($event.target).value)" aria-label="Assignee">
            <option value="">All assignees</option><option value="me">Assigned to me</option>
            @for (m of members(); track m.user_id) { <option [value]="m.user_id">{{ m.profile?.full_name || m.profile?.email }}</option> }</select>
          <span class="filter-divider"></span>
          <input placeholder="Filter tasks…" [value]="fText()" (input)="fText.set($any($event.target).value)" aria-label="Filter tasks" />
        </div>
      </div>

      @if (loading()) { <div class="empty">Loading board…</div> }
      @else {
        <div class="board" cdkDropListGroup (click)="pop.set(null)">
          @for (s of stages(); track s.id) {
            <section [class]="'col ' + s.kind">
              <header><b>{{ s.name }}</b><span class="count">{{ visible(s.id).length }}</span>
                <span class="spacer"></span><button class="btn ghost sm" (click)="openNew(s.id)" title="Add task" aria-label="Add task">＋</button></header>
              <div class="list" cdkDropList [id]="s.id" [cdkDropListData]="s.id" (cdkDropListDropped)="drop($event, s.id)">
                @for (t of visible(s.id); track t.id) {
                  <article class="task task-card" cdkDrag [cdkDragDisabled]="pop()?.id === t.id" [cdkDragData]="t" (click)="open(t.id)">
                    <px-task-card-view [task]="t" [items]="layout()" [editable]="canEdit(t)" (edit)="toggle(t, $event.field, $event.event)" />
                    @if (pop(); as p) { @if (p.id === t.id) {
                      <div class="pop" [style.top.px]="p.top" [style.bottom.px]="p.bottom" [style.left.px]="p.left" [style.width.px]="p.width" [style.max-height.px]="p.maxHeight"
                        (click)="$event.stopPropagation()" (mousedown)="$event.stopPropagation()">
                        @switch (p.field) {
                          @case ('priority') { @for (o of priorities; track o.value) { <button class="opt" [class.on]="t.priority === o.value" (click)="setPriority(t, o.value)">{{ o.label }}</button> } }
                          @case ('category') {
                            @for (c of categories(); track c.id) { <button class="opt" [class.on]="t.category?.id === c.id" (click)="setCategory(t, c)">{{ c.name }}</button> }
                            @if (!categories().length) { <span class="muted small pad">No categories yet.</span> } }
                          @case ('tags') {
                            @for (g of tags(); track g.id) { <button class="opt" [class.on]="hasTag(t, g.id)" (click)="toggleTag(t, g)">{{ hasTag(t, g.id) ? '☑' : '☐' }} #{{ g.name }}</button> }
                            @if (!tags().length) { <span class="muted small pad">No tags yet.</span> } }
                        }
                        @if (p.field !== 'priority' && canManage()) { <a class="small pad" routerLink="/labels" [queryParams]="{ pipeline: pipeline()?.id }">Manage {{ p.field === 'tags' ? 'tags' : 'categories' }}…</a> }
                      </div> } }
                  </article>
                } @empty { <div class="drop-hint muted small">Drop tasks here</div> }
              </div>
            </section>
          }
        </div>
      }
    </div>

    @if (dialog(); as d) {
      <px-task-dialog [taskId]="d.id" [pipelineId]="pipeline()!.id" [teamId]="pipeline()!.team_id" [stages]="stages()"
        [defaultStageId]="d.stage" [members]="members()" [canManage]="canManage()" (closed)="closeDialog($event)" />
    }

    @if (stageModal()) {
      <px-modal title="Edit stages" (closed)="stageModal.set(false)">
        <div class="modal-body stack">
          @for (s of stages(); track s.id; let i = $index) {
            <div class="row">
              <button class="btn sm ghost" [disabled]="i === 0" (click)="move(i, -1)" title="Move left">↑</button>
              <button class="btn sm ghost" [disabled]="i === stages().length - 1" (click)="move(i, 1)" title="Move right">↓</button>
              <input [value]="s.name" (change)="rename(s, $any($event.target).value)" maxlength="60" />
              <select style="width: 150px" [value]="s.kind" (change)="setKind(s, $any($event.target).value)">
                <option value="backlog">Backlog</option><option value="active">Active</option><option value="review">Review</option><option value="done">Done</option></select>
              <button class="btn sm danger" (click)="removeStage(s)" title="Delete stage">🗑</button>
            </div>
          }
          <div class="row" style="border-top: 1px solid var(--border); padding-top: 12px">
            <input placeholder="New stage name" [value]="newStage()" (input)="newStage.set($any($event.target).value)" (keydown.enter)="addStage()" maxlength="60" />
            <select style="width: 150px" [value]="newKind()" (change)="newKind.set($any($event.target).value)">
              <option value="active">Active</option><option value="backlog">Backlog</option><option value="review">Review</option><option value="done">Done</option></select>
            <button class="btn primary" (click)="addStage()" [disabled]="!newStage().trim()">Add</button>
          </div>
          <p class="muted small">"Done" stages mark tasks as completed (used by reports). Stages with tasks can't be deleted.</p>
        </div>
        <div class="modal-foot"><button class="btn" (click)="stageModal.set(false)">Close</button></div>
      </px-modal>
    }`,
  styles: `
    /* The board fills the screen below the top bar (58px), so every stage column runs the full height and
       any empty space in it is a drop target. Columns scroll on their own when they hold many cards. */
    .wrap { display: flex; flex-direction: column; height: calc(100vh - 58px); min-height: 460px; padding: 16px 20px; }
    .head { flex: none; display: flex; flex-direction: column; gap: 14px; margin-bottom: 18px; }
    .head-top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .filter-bar { align-self: flex-start; display: inline-flex; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 3px; max-width: 100%; flex-wrap: wrap; }
    .filter-bar select, .filter-bar input { border: 0; background: transparent; padding: 5px 8px; font-size: 13px; width: auto; outline: none; &:focus { outline: 0; box-shadow: none; } }
    .filter-bar select { cursor: pointer; } .filter-bar input { width: 170px; }
    .filter-divider { width: 1px; height: 16px; background: var(--border); margin: 0 4px; }
    .menu-wrap { position: relative; }
    .menu-backdrop { position: fixed; inset: 0; z-index: 40; }
    .menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 50; min-width: 200px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow-lg); padding: 4px; display: flex; flex-direction: column;
      button, a { text-align: left; border: 0; background: none; padding: 8px 12px; border-radius: 6px; font: inherit; color: var(--text); cursor: pointer; &:hover { background: var(--surface-2); } } }
    .menu-sep { border: 0; border-top: 1px solid var(--border); margin: 4px 0; }
    .menu .menu-danger { color: var(--danger); &:hover { background: var(--danger-50); } }
    .board { display: flex; gap: 12px; align-items: stretch; flex: 1; min-height: 0; overflow-x: auto; padding-bottom: 4px; }
    .col { display: flex; flex-direction: column; min-height: 0; background: #eceff3; border-radius: 12px; flex: 1 1 280px; min-width: 260px; max-width: 340px; padding: 0 8px 8px; border-top: 3px solid #98a2b3;
      &.active { border-top-color: #2e90fa; } &.review { border-top-color: #f79009; } &.done { border-top-color: var(--success); } }
    .col header { flex: none; display: flex; align-items: center; gap: 8px; padding: 10px 4px; }
    .count { background: #d0d5dd; border-radius: 999px; padding: 0 8px; font-size: 12px; font-weight: 500; color: #475467; }
    /* The list is the drop zone: it stretches to the bottom of the column. The small negative margin and padding
       keep card shadows from being clipped by the scrolling edge. */
    .list { display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 50px; overflow-y: auto; margin: 0 -4px; padding: 2px 4px 8px; }
    .task { position: relative; cursor: grab; border: 1px solid transparent; transition: border-color .15s, box-shadow .15s;
      &:hover { border-color: var(--border); box-shadow: 0 4px 6px -1px rgba(16, 24, 40, .06), 0 2px 4px -2px rgba(16, 24, 40, .06); } }
    /* position: fixed so the scrolling board and columns can never clip it; the place is set from the clicked chip. */
    .pop { position: fixed; z-index: 60; background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; box-shadow: var(--shadow-lg); padding: 6px; display: flex; flex-direction: column; gap: 2px; cursor: default; overflow: auto; }
    .opt { text-align: left; border: 0; background: none; padding: 5px 8px; border-radius: 6px; font: inherit; cursor: pointer; &:hover { background: var(--surface-2); } &.on { background: var(--primary-50); font-weight: 600; } }
    .pad { padding: 4px 8px; }
    .drop-hint { text-align: center; padding: 18px 0; border: 1px dashed #c4cad4; border-radius: 10px; }`,
})
export class Kanban implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private work = inject(WorkService);
  private org = inject(OrgService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private destroy = inject(DestroyRef);

  pipeline = signal<Pipeline | null>(null);
  stages = signal<Stage[]>([]);
  tasks = signal<Task[]>([]);
  members = signal<TeamMember[]>([]);
  categories = signal<Label[]>([]); tags = signal<Label[]>([]);
  loading = signal(true);
  dialog = signal<{ id: string | null; stage: string | null } | null>(null);
  pop = signal<{ id: string; field: Field; left: number; width: number; maxHeight: number; top?: number; bottom?: number } | null>(null);
  stageModal = signal(false);
  menu = signal(false);
  newStage = signal(''); newKind = signal<StageKind>('active');
  fPriority = signal(''); fAssignee = signal(''); fText = signal('');
  priorities = PRIORITIES; label = priorityLabel; bg = labelBg; fg = labelFg;

  layout = computed(() => sanitizeLayout(this.pipeline()?.card_layout));
  canManage = computed(() => this.auth.isAdmin() || this.members().some((m) => m.user_id === this.auth.userId() && m.is_head));
  /** Only org admins may delete a pipeline (mirrors the pipelines_delete RLS policy). */
  canDelete = computed(() => this.auth.isAdmin());
  /** Mirrors the RLS rule: managers, the creator, or an assignee may edit. */
  canEdit = (t: Task) => this.canManage() || t.created_by === this.auth.userId() || !!t.assignees?.some((a) => a.user_id === this.auth.userId());
  overdue = (t: Task) => isOverdue(t.due_date, t.completed_at);
  hasTag = (t: Task, id: string) => t.tags.some((g) => g.id === id);

  visible = (stageId: string) => {
    const me = this.auth.userId(), a = this.fAssignee(), p = this.fPriority(), q = this.fText().trim().toLowerCase();
    return this.tasks().filter((t) => t.stage_id === stageId
      && (!p || t.priority === p) && (!q || t.title.toLowerCase().includes(q))
      && (!a || t.assignees?.some((x) => x.user_id === (a === 'me' ? me : a)))).sort((x, y) => x.position - y.position);
  };

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    // The card popover is fixed to the screen, so close it when anything scrolls or the window resizes
    // (scrolling inside the popover itself is fine).
    const closePop = (e?: Event) => {
      if (e?.target instanceof Element && e.target.closest('.pop')) return;
      if (this.pop()) this.pop.set(null);
    };
    document.addEventListener('scroll', closePop, true);
    window.addEventListener('resize', closePop);
    this.destroy.onDestroy(() => { document.removeEventListener('scroll', closePop, true); window.removeEventListener('resize', closePop); });
    try {
      const pipe = await this.work.getPipeline(id);
      this.pipeline.set(pipe);
      const [stages, members, cats, tags] = await Promise.all([
        this.work.listStages(id), this.org.listTeamMembers(pipe.team_id), this.work.listLabels('categories', id), this.work.listLabels('tags', id)]);
      this.stages.set(stages); this.members.set(members); this.categories.set(cats); this.tags.set(tags);
      await this.reload();
      const open = this.route.snapshot.queryParamMap.get('task');
      if (open) this.open(open);
      this.destroy.onDestroy(this.work.subscribePipeline(id, () => { if (!this.dialog() && !this.pop()) this.reload(); }));
    } catch (e) { this.toast.error(e); } finally { this.loading.set(false); }
  }

  async reload() {
    try {
      const id = this.pipeline()!.id;
      const [res, cats, tags] = await Promise.all([this.work.listTasks({ pipelineId: id, limit: 500 }), this.work.listLabels('categories', id), this.work.listLabels('tags', id)]);
      this.tasks.set(res.tasks); this.categories.set(cats); this.tags.set(tags);
    } catch (e) { this.toast.error(e); }
  }

  // ----- drag & drop -----
  private positionIn(stageId: string, index: number, excludeId: string) {
    const target = this.visible(stageId).filter((t) => t.id !== excludeId);
    const i = Math.min(index, target.length);
    const before = target[i - 1]?.position, after = target[i]?.position;
    return before === undefined ? (after === undefined ? 1000 : after - 1000) : after === undefined ? before + 1000 : (before + after) / 2;
  }

  async drop(ev: CdkDragDrop<string>, stageId: string) {
    const task = ev.item.data as Task;
    if (task.stage_id === stageId && ev.previousIndex === ev.currentIndex) return;
    const position = this.positionIn(stageId, ev.currentIndex, task.id);
    await this.patchLocal(task, { stage_id: stageId, position }, () => this.work.moveTask(task.id, stageId, position));
  }

  // ----- inline card edits (optimistic; rolled back on failure) -----
  toggle(t: Task, field: Field, ev: Event) {
    ev.stopPropagation();
    const p = this.pop();
    if (p?.id === t.id && p.field === field) { this.pop.set(null); return; }
    // Open just below the clicked chip, or above it when there is not enough room underneath.
    const btn = (ev.target as HTMLElement).closest('button'), art = btn?.closest('article');
    if (!btn || !art) return;
    const b = btn.getBoundingClientRect(), a = art.getBoundingClientRect();
    const roomBelow = window.innerHeight - b.bottom - 12, roomAbove = b.top - 12;
    const above = roomBelow < 200 && roomAbove > roomBelow;
    const base = { id: t.id, field, left: a.left + 8, width: a.width - 16 };
    this.pop.set(above
      ? { ...base, bottom: window.innerHeight - b.top + 4, maxHeight: Math.min(260, roomAbove) }
      : { ...base, top: b.bottom + 4, maxHeight: Math.min(260, roomBelow) });
  }
  setPriority(t: Task, priority: Priority) { this.patchLocal(t, { priority }, () => this.work.updateTask(t.id, { priority })); }
  setCategory(t: Task, c: Label | null) {
    this.patchLocal(t, { category: c, category_id: c?.id ?? null }, () => this.work.updateTask(t.id, { category_id: c?.id ?? null }));
  }
  /** Tags is a multi-select, so the popover stays open while toggling. */
  async toggleTag(t: Task, g: Label) {
    const next = this.hasTag(t, g.id) ? t.tags.filter((x) => x.id !== g.id) : [...t.tags, g];
    const prev = this.tasks();
    this.tasks.set(prev.map((x) => (x.id === t.id ? { ...x, tags: next, last_activity_at: new Date().toISOString() } : x)));
    try { await this.work.setTaskTags(t.id, next.map((x) => x.id)); } catch (e) { this.tasks.set(prev); this.toast.error(e); }
  }

  private async patchLocal(t: Task, patch: Partial<Task>, save: () => Promise<void>) {
    this.pop.set(null);
    const prev = this.tasks();
    this.tasks.set(prev.map((x) => (x.id === t.id ? { ...x, ...patch, last_activity_at: new Date().toISOString() } : x)));
    try { await save(); } catch (e) { this.tasks.set(prev); this.toast.error(e); }
  }

  // ----- tasks dialog -----
  open(id: string) { this.pop.set(null); this.dialog.set({ id, stage: null }); }
  openNew(stage?: string) { this.dialog.set({ id: null, stage: stage ?? null }); }
  closeDialog(changed: boolean) { this.dialog.set(null); if (changed) this.reload(); }

  // ----- stage editor -----
  private async reloadStages() { this.stages.set(await this.work.listStages(this.pipeline()!.id)); }

  async addStage() {
    const name = this.newStage().trim();
    if (!name) return;
    try {
      await this.work.addStage(this.pipeline()!.id, name, this.newKind(), Math.max(-1, ...this.stages().map((s) => s.position)) + 1);
      this.newStage.set(''); await this.reloadStages(); this.toast.success('Stage added');
    } catch (e) { this.toast.error(e); }
  }
  async rename(s: Stage, name: string) {
    name = name.trim();
    if (!name || name === s.name) { await this.reloadStages(); return; }
    try { await this.work.updateStage(s.id, { name }); await this.reloadStages(); } catch (e) { this.toast.error(e); }
  }
  async setKind(s: Stage, kind: StageKind) {
    try { await this.work.updateStage(s.id, { kind }); await this.reloadStages(); } catch (e) { this.toast.error(e); }
  }
  async move(i: number, dir: -1 | 1) {
    const list = this.stages(), a = list[i], b = list[i + dir];
    if (!a || !b) return;
    try {
      await Promise.all([this.work.updateStage(a.id, { position: b.position }), this.work.updateStage(b.id, { position: a.position })]);
      await this.reloadStages();
    } catch (e) { this.toast.error(e); }
  }
  async removePipeline() {
    const pipe = this.pipeline();
    if (!pipe || !this.canDelete()) return;
    const n = this.tasks().length;
    const what = n ? `its ${n >= 500 ? 'tasks' : n === 1 ? '1 task' : n + ' tasks'}, stages and labels` : 'its stages and labels';
    if (!(await this.confirm.ask(`Permanently delete pipeline "${pipe.name}" and ${what}? This cannot be undone.`, 'Delete pipeline'))) return;
    try {
      await this.work.deletePipeline(pipe.id);
      this.toast.success('Pipeline deleted');
      await this.router.navigateByUrl('/pipelines');
    } catch (e) { this.toast.error(e); }
  }
  async removeStage(s: Stage) {
    if (this.tasks().some((t) => t.stage_id === s.id)) { this.toast.info('Move or delete the tasks in this stage first.'); return; }
    if (!(await this.confirm.ask(`Delete stage "${s.name}"?`, 'Delete'))) return;
    try { await this.work.deleteStage(s.id); await this.reloadStages(); } catch (e) { this.toast.error(e); }
  }
}
