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

interface DraftStage { id: string | null; name: string; kind: StageKind; }
const toDraft = (s: Stage): DraftStage => ({ id: s.id, name: s.name, kind: s.kind });
const KIND_LABEL: Record<StageKind, string> = { backlog: 'Backlog', active: 'Active', review: 'Review', done: 'Done' };

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
                  <button role="menuitem" (click)="menu.set(false); openStages()">✎ Edit stages</button>
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
      <px-modal title="Edit stages" (closed)="closeStages()">
        <div class="modal-body stack">
          @for (s of draft(); track $index; let i = $index) {
            <div class="row">
              <button class="btn sm ghost" [disabled]="i === 0" (click)="moveDraft(i, -1)" title="Move up">↑</button>
              <button class="btn sm ghost" [disabled]="i === draft().length - 1" (click)="moveDraft(i, 1)" title="Move down">↓</button>
              <input [value]="s.name" (input)="renameDraft(i, $any($event.target).value)" maxlength="60" aria-label="Stage name" />
              <select style="width: 150px" [value]="s.kind" (change)="kindDraft(i, $any($event.target).value)" aria-label="Stage type">
                <option value="backlog">Backlog</option><option value="active">Active</option><option value="review">Review</option><option value="done">Done</option></select>
              <button class="btn sm danger" (click)="removeDraft(i)" title="Remove stage">🗑</button>
            </div>
          }
          <div class="row" style="border-top: 1px solid var(--border); padding-top: 12px">
            <input placeholder="New stage name" [value]="newStage()" (input)="newStage.set($any($event.target).value)" (keydown.enter)="addDraft()" maxlength="60" />
            <select style="width: 150px" [value]="newKind()" (change)="newKind.set($any($event.target).value)">
              <option value="active">Active</option><option value="backlog">Backlog</option><option value="review">Review</option><option value="done">Done</option></select>
            <button class="btn" (click)="addDraft()" [disabled]="!newStage().trim()">Add</button>
          </div>
          <p class="muted small">"Done" stages mark tasks as completed (used by reports). Stages with tasks can't be removed. Nothing changes until you save.</p>
        </div>
        <div class="modal-foot"><button class="btn" (click)="closeStages()">Cancel</button>
          <button class="btn primary" (click)="saveStages()" [disabled]="!stageDirty() || !stagesValid() || stageBusy()">{{ stageBusy() ? 'Saving…' : 'Save changes' }}</button></div>
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
    .opt { text-align: left; border: 0; background: none; padding: 5px 8px; border-radius: 6px; font: inherit; font-size: 12px; line-height: 1.3; overflow-wrap: anywhere; cursor: pointer; &:hover { background: var(--surface-2); } &.on { background: var(--primary-50); font-weight: 600; } }
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
  /** The stage editor works on a draft; nothing is saved until the person confirms the summary of changes. */
  draft = signal<DraftStage[]>([]); stageBusy = signal(false);
  stageDirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.stages().map(toDraft)));
  stagesValid = computed(() => this.draft().length > 0 && this.draft().every((d) => d.name.trim()));
  fPriority = signal(''); fAssignee = signal(''); fText = signal('');
  priorities = PRIORITIES; label = priorityLabel; bg = labelBg; fg = labelFg;

  layout = computed(() => sanitizeLayout(this.pipeline()?.card_layout));
  canManage = computed(() => this.auth.isAdmin() || this.members().some((m) => m.user_id === this.auth.userId() && m.is_head));
  /** Only org admins may delete a pipeline (mirrors the pipelines_delete RLS policy). */
  canDelete = computed(() => this.auth.isAdmin());
  /** Priority, category and tags are task details, which only managers (Admin / Section Head) can change. */
  canEdit = (_t: Task) => this.canManage();
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

  // ----- stage editor (draft, then confirm) -----
  private async reloadStages() { this.stages.set(await this.work.listStages(this.pipeline()!.id)); }

  openStages() { this.draft.set(this.stages().map(toDraft)); this.newStage.set(''); this.stageModal.set(true); }
  async closeStages() {
    if (this.stageDirty() && !(await this.confirm.ask('Discard your unsaved stage changes?', 'Discard'))) return;
    this.stageModal.set(false);
  }
  addDraft() {
    const name = this.newStage().trim();
    if (!name) return;
    this.draft.update((l) => [...l, { id: null, name, kind: this.newKind() }]); this.newStage.set('');
  }
  renameDraft(i: number, name: string) { this.draft.update((l) => l.map((d, j) => (j === i ? { ...d, name } : d))); }
  kindDraft(i: number, kind: StageKind) { this.draft.update((l) => l.map((d, j) => (j === i ? { ...d, kind } : d))); }
  moveDraft(i: number, dir: -1 | 1) {
    this.draft.update((l) => { const n = [...l]; [n[i], n[i + dir]] = [n[i + dir], n[i]]; return n; });
  }
  removeDraft(i: number) {
    const d = this.draft()[i];
    if (d.id && this.tasks().some((t) => t.stage_id === d.id)) { this.toast.info('Move or delete the tasks in this stage first.'); return; }
    this.draft.update((l) => l.filter((_, j) => j !== i));
  }

  /** Plain-language list of what saving would do, shown in the confirmation. */
  private stageChanges(): string[] {
    const orig = this.stages(), d = this.draft();
    const lines: string[] = [];
    const kind = (k: StageKind) => KIND_LABEL[k];
    for (const o of orig) if (!d.some((x) => x.id === o.id)) lines.push(`Remove the stage "${o.name}"`);
    for (const x of d) {
      const o = x.id ? orig.find((s) => s.id === x.id) : undefined;
      if (!o) { lines.push(`Add the stage "${x.name.trim()}" (${kind(x.kind)})`); continue; }
      if (x.name.trim() !== o.name) lines.push(`Rename "${o.name}" to "${x.name.trim()}"`);
      if (x.kind !== o.kind) lines.push(`Change the type of "${x.name.trim()}" from ${kind(o.kind)} to ${kind(x.kind)}`);
    }
    const kept = d.filter((x) => x.id).map((x) => x.id);
    const before = orig.filter((o) => kept.includes(o.id)).map((o) => o.id);
    if (kept.join() !== before.join()) lines.push('Change the order of the stages');
    return lines;
  }

  async saveStages() {
    const lines = this.stageChanges();
    if (!lines.length) { this.stageModal.set(false); return; }
    const ok = await this.confirm.ask(`Apply these changes to the stages of "${this.pipeline()?.name}"?\n\n${lines.map((l) => '• ' + l).join('\n')}`, 'Apply changes', 'primary');
    if (!ok) return;
    this.stageBusy.set(true);
    try {
      const pipeId = this.pipeline()!.id, orig = this.stages(), d = this.draft();
      await Promise.all(orig.filter((o) => !d.some((x) => x.id === o.id)).map((o) => this.work.deleteStage(o.id)));
      await Promise.all(d.flatMap((x, i) => {
        const o = x.id ? orig.find((s) => s.id === x.id) : undefined;
        if (!o) return [this.work.addStage(pipeId, x.name.trim(), x.kind, i)];
        const patch: Partial<Stage> = {};
        if (x.name.trim() !== o.name) patch.name = x.name.trim();
        if (x.kind !== o.kind) patch.kind = x.kind;
        if (i !== o.position) patch.position = i;
        return Object.keys(patch).length ? [this.work.updateStage(o.id, patch)] : [];
      }));
      await this.reloadStages();
      this.stageModal.set(false); this.toast.success('Stages updated');
    } catch (e) { this.toast.error(e); await this.reloadStages().catch(() => undefined); }
    finally { this.stageBusy.set(false); }
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
}
