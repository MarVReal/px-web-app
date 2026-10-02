import { DatePipe } from '@angular/common';
import { Component, ElementRef, OnInit, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Activity, Comment, Label, PRIORITIES, Priority, Stage, Task, TaskLink, TeamMember } from '../../core/models/models';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { WorkService } from '../../core/services/work.service';
import { Avatar } from '../../shared/components/avatar';
import { Modal } from '../../shared/components/modal';
import { labelBg, labelFg } from '../../shared/utils/label-colors';
import { isoDate, timeAgo } from '../../shared/utils/format';

/** Required text must contain something other than spaces. */
const notBlank: ValidatorFn = (c) => (String(c.value ?? '').trim() ? null : { required: true });

/** Create (taskId null) or view/edit a task, with comments, links and activity history. */
@Component({
  selector: 'px-task-dialog',
  imports: [ReactiveFormsModule, Modal, Avatar, DatePipe, RouterLink],
  template: `
    <px-modal [title]="taskId() ? 'Task details' : 'New task'" [wide]="true" (closed)="close()">
      <form [formGroup]="f" (ngSubmit)="save()">
        <div class="modal-body stack">
          @if (readOnly()) {
            <p class="ro-note">🔒 Only Admins and Section Heads can edit task details. You can still move the card, comment and add links.</p>
          } @else {
            <p class="muted small" style="margin: 0">Fields marked <b class="req">*</b> are required.</p>
          }
          <label class="field"><span class="lt">Task name<b class="req" aria-hidden="true">*</b></span>
            <input formControlName="title" maxlength="300" aria-required="true" />
            @if (bad('title')) { <span class="err">Enter a task name.</span> }</label>
          <div class="grid cols-2" style="gap: 12px">
            <label class="field"><span class="lt">Stage<b class="req" aria-hidden="true">*</b></span>
              @if (taskId()) {
                <select [value]="stageId()" [disabled]="!canMove() || moving()" (change)="moveTo($any($event.target).value)">
                  <option [value]="stageId()">{{ stageName(stageId()) }} (current)</option>
                  @for (s of otherStages(); track s.id) { <option [value]="s.id">Move to {{ s.name }}</option> }
                </select>
              } @else {
                <select formControlName="stage_id" aria-required="true">@for (s of stages(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }</select>
              }
            </label>
            <label class="field"><span class="lt">Priority<b class="req" aria-hidden="true">*</b></span>
              <select formControlName="priority" aria-required="true">
                @for (p of priorities; track p.value) { <option [value]="p.value">{{ p.label }}</option> }</select></label>
            <label class="field"><span class="lt">Start date<b class="req" aria-hidden="true">*</b></span>
              <input type="date" formControlName="start_date" aria-required="true" />
              @if (bad('start_date')) { <span class="err">Choose a start date.</span> }</label>
            <label class="field"><span class="lt">Due date</span><input type="date" formControlName="due_date" /></label>
            <label class="field"><span class="lt">Category<b class="req" aria-hidden="true">*</b></span>
              <select formControlName="category_id" aria-required="true">
                <option value="" disabled>Select a category…</option>
                @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select>
              @if (bad('category_id')) { <span class="err">Choose a category.</span> }
              @if (!categories().length) {
                <span class="muted small" style="font-weight: 400">This pipeline has no categories yet, and every task needs one.
                  @if (canManage()) { <a routerLink="/labels" [queryParams]="{ pipeline: pipelineId() }">Add a category</a> } @else { Ask a Section Head or Admin to add one. }</span>
              }
            </label>
            <label class="field">Estimated effort (hours)<input type="number" min="0" step="any" inputmode="decimal" formControlName="estimated_hours" placeholder="e.g. 4.5" /></label>
          </div>
          <div class="field"><span class="lbl">Tags</span>
            <div class="row wrap">
              @for (t of tags(); track t.id) {
                <button type="button" class="pill" [disabled]="readOnly()" [class.on]="selectedTags().has(t.id)" [style.background]="selectedTags().has(t.id) ? bg(t.color) : ''"
                  [style.color]="selectedTags().has(t.id) ? fg(t.color) : ''" (click)="toggleTag(t.id)">#{{ t.name }}</button>
              } @empty { <span class="muted small" style="font-weight: 400">No tags yet. @if (canManage()) { <a routerLink="/labels" [queryParams]="{ pipeline: pipelineId() }">Add some</a> }</span> }
            </div></div>
          <div class="field"><span class="lbl">Assignees</span>
            <div class="row wrap">
              @for (m of members(); track m.user_id) {
                <button type="button" class="pill" [class.on]="selected().has(m.user_id)" [disabled]="!canAssign(m.user_id)" (click)="toggle(m.user_id)">
                  <px-avatar [name]="m.profile?.full_name || m.profile?.email || ''" [size]="20" /> {{ m.profile?.full_name || m.profile?.email }}
                </button>
              } @empty { <span class="muted small">No section members yet.</span> }
            </div></div>
          <label class="field"><span class="lt">Description<b class="req" aria-hidden="true">*</b></span>
            <textarea formControlName="description" aria-required="true"></textarea>
            @if (bad('description')) { <span class="err">Add a short description of the work.</span> }</label>
          <label class="field"><span class="lt">Notes</span><textarea formControlName="notes"></textarea></label>
        </div>
        <div class="modal-foot">
          @if (taskId() && canManage()) { <button type="button" class="btn danger" (click)="remove()">Delete</button> }
          <span class="spacer"></span>
          <button type="button" class="btn" (click)="close()">Close</button>
          @if (!readOnly()) { <button class="btn primary" [disabled]="busy()">{{ taskId() ? 'Save changes' : 'Create task' }}</button> }
        </div>
      </form>

      @if (taskId()) {
        <div class="modal-body" style="border-top: 1px solid var(--border)">
          <div class="tabs"><button [class.active]="tab() === 'comments'" (click)="tab.set('comments')">Comments ({{ comments().length }})</button>
            <button [class.active]="tab() === 'links'" (click)="tab.set('links')">Links ({{ links().length }})</button>
            <button [class.active]="tab() === 'activity'" (click)="tab.set('activity')">Activity</button></div>
          @if (tab() === 'links') {
            <div class="stack">
              @for (l of links(); track l.id) {
                <div class="row">🔗 <a [href]="l.url" target="_blank" rel="noopener noreferrer">{{ l.title || l.url }}</a>
                  @if (l.title) { <span class="muted small">{{ host(l.url) }}</span> }
                  <span class="spacer"></span>
                  @if (canDeleteLink(l)) { <button class="btn sm danger" (click)="removeLink(l)" title="Delete this link">Delete</button> }</div>
              } @empty { <div class="muted">No links yet.</div> }
              <div class="row wrap">
                <input style="flex: 2; min-width: 200px" placeholder="https://…" [value]="linkUrl()" (input)="linkUrl.set($any($event.target).value)" (keydown.enter)="addLink()" />
                <input style="flex: 1; min-width: 140px" placeholder="Title (optional)" [value]="linkTitle()" (input)="linkTitle.set($any($event.target).value)" (keydown.enter)="addLink()" />
                <button class="btn primary" (click)="addLink()" [disabled]="!linkUrl().trim()">Add link</button></div>
            </div>
          }
          @if (tab() === 'comments') {
            <div class="stack">
              @for (c of comments(); track c.id) {
                <div class="row" style="align-items: flex-start">
                  <px-avatar [name]="c.author?.full_name || c.author?.email || ''" [size]="28" />
                  <div style="flex: 1; min-width: 0"><b>{{ c.author?.full_name || c.author?.email }}</b>&ngsp;<span class="muted small">{{ ago(c.created_at) }}</span><div style="white-space: pre-wrap">{{ c.body }}</div></div>
                  @if (canDeleteComment(c)) { <button class="btn sm ghost danger" (click)="removeComment(c)" title="Delete this comment" aria-label="Delete comment">🗑</button> }
                </div>
              } @empty { <div class="muted">No comments yet.</div> }
              <div class="row"><input [value]="draft()" (input)="draft.set($any($event.target).value)" (keydown.enter)="comment()" placeholder="Write a comment…" maxlength="5000" />
                <button class="btn primary" (click)="comment()" [disabled]="!draft().trim()">Send</button></div>
            </div>
          }
          @if (tab() === 'activity') {
            <div class="stack">
              @for (a of activity(); track a.id) {
                <div class="row small"><span class="muted" style="min-width: 150px">{{ a.created_at | date: 'MMM d, h:mm a' }}</span><span>{{ a.description }}</span></div>
              } @empty { <div class="muted">No activity yet.</div> }
            </div>
          }
        </div>
      }
    </px-modal>`,
  styles: `
    .lbl { font-weight: 550; font-size: 13px; }
    .req { color: var(--danger); margin-left: 3px; font-weight: 700; }
    .ro-note { margin: 0; padding: 8px 12px; border-radius: 8px; background: var(--surface-2); color: var(--muted); font-size: 13px; }
    .pill { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: var(--surface); border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12px; line-height: 1.3; text-align: left; overflow-wrap: anywhere; cursor: pointer;
      &.on { background: var(--primary-50); border-color: var(--primary); } &:disabled { opacity: .5; cursor: not-allowed; } }`,
})
export class TaskDialog implements OnInit {
  private work = inject(WorkService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  taskId = input<string | null>(null);
  pipelineId = input.required<string>();
  teamId = input.required<string>();
  stages = input.required<Stage[]>();
  defaultStageId = input<string | null>(null);
  members = input<TeamMember[]>([]);
  canManage = input(false);
  closed = output<boolean>(); // true when data changed

  priorities = PRIORITIES;
  f = inject(FormBuilder).nonNullable.group({
    title: ['', [notBlank, Validators.maxLength(300)]], stage_id: ['', Validators.required],
    priority: ['medium' as Priority, Validators.required], start_date: ['', Validators.required], due_date: [''],
    category_id: ['', Validators.required],
    estimated_hours: [null as number | null, [Validators.min(0)]], description: ['', notBlank], notes: [''],
  });
  submitted = signal(false);
  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Show a field's error once the person has been in it, or has tried to save. */
  bad = (name: string) => { const c = this.f.get(name); return !!c && c.invalid && (c.touched || this.submitted()); };
  categories = signal<Label[]>([]); tags = signal<Label[]>([]);
  selected = signal<Set<string>>(new Set());
  selectedTags = signal<Set<string>>(new Set());
  comments = signal<Comment[]>([]); activity = signal<Activity[]>([]); links = signal<TaskLink[]>([]);
  tab = signal<'comments' | 'links' | 'activity'>('comments');
  draft = signal(''); linkUrl = signal(''); linkTitle = signal('');
  busy = signal(false); moving = signal(false);
  /** Details are locked for staff once a task exists; they can still move it, comment and add links. */
  readOnly = signal(false);
  stageId = signal('');
  private dirty = false;
  private task?: Task;
  private original = new Set<string>();
  ago = timeAgo; bg = labelBg; fg = labelFg;

  otherStages = () => this.stages().filter((s) => s.id !== this.stageId());
  stageName = (id: string) => this.stages().find((s) => s.id === id)?.name ?? '';
  /** Mirrors the RLS rule for moving a card: managers, the creator, or an assignee. */
  canMove = () => !this.taskId() || this.canManage() || this.task?.created_by === this.auth.userId()
    || !!this.task?.assignees?.some((a) => a.user_id === this.auth.userId());
  /** Managers assign anyone. While publishing a new task, staff may only add themselves; after that assignees are locked. */
  canAssign = (userId: string) => this.canManage() || (!this.taskId() && userId === this.auth.userId());
  canDeleteComment = (c: Comment) => this.canManage() || c.created_by === this.auth.userId();
  canDeleteLink = (l: TaskLink) => this.canManage() || l.created_by === this.auth.userId();
  host = (u: string) => { try { return new URL(u).host; } catch { return ''; } };

  async ngOnInit() {
    const initial = this.defaultStageId() ?? this.stages()[0]?.id ?? '';
    this.f.controls.stage_id.setValue(initial);
    this.stageId.set(initial);
    if (!this.taskId()) this.f.controls.start_date.setValue(isoDate(new Date())); // new tasks start today unless changed
    try {
      const [c, t] = await Promise.all([this.work.listLabels('categories', this.pipelineId()), this.work.listLabels('tags', this.pipelineId())]);
      this.categories.set(c); this.tags.set(t);
      const id = this.taskId();
      if (!id) return;
      this.task = await this.work.getTask(id);
      const task = this.task;
      this.stageId.set(task.stage_id);
      this.f.patchValue({
        title: task.title, stage_id: task.stage_id, priority: task.priority, start_date: task.start_date ?? '', due_date: task.due_date ?? '',
        category_id: task.category_id ?? '', estimated_hours: task.estimated_hours, description: task.description ?? '', notes: task.notes ?? '',
      });
      this.original = new Set((task.assignees ?? []).map((a) => a.user_id));
      this.selected.set(new Set(this.original));
      this.selectedTags.set(new Set(task.tags.map((x) => x.id)));
      if (!this.canManage()) { this.readOnly.set(true); this.f.disable({ emitEvent: false }); }
      await this.reloadThread();
    } catch (e) { this.toast.error(e); }
  }

  close() { this.closed.emit(this.dirty); }

  toggle(userId: string) { this.selected.update((s) => { const n = new Set(s); n.has(userId) ? n.delete(userId) : n.add(userId); return n; }); }
  toggleTag(id: string) { this.selectedTags.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  /** Picking another stage in the dropdown moves the task right away (and is logged as a move). */
  async moveTo(stageId: string) {
    if (!this.taskId() || stageId === this.stageId()) return;
    this.moving.set(true);
    try {
      await this.work.moveTask(this.taskId()!, stageId, Date.now());
      this.stageId.set(stageId); this.dirty = true;
      this.toast.success(`Moved to ${this.stageName(stageId)}`);
      await this.reloadThread();
    } catch (e) { this.toast.error(e); } finally { this.moving.set(false); }
  }

  async save() {
    if (this.f.invalid) {
      // Explain what is missing instead of silently doing nothing: show every error and jump to the first one.
      this.submitted.set(true); this.f.markAllAsTouched();
      this.toast.info('Fill in the fields marked * before saving.');
      setTimeout(() => this.el.nativeElement.querySelector<HTMLElement>('input.ng-invalid, select.ng-invalid, textarea.ng-invalid')?.focus());
      return;
    }
    if (this.taskId() && !(await this.confirm.ask('Save your changes to this task?', 'Save changes', 'primary'))) return;
    this.busy.set(true);
    try {
      const v = this.f.getRawValue();
      const patch = {
        title: v.title.trim(), priority: v.priority, description: v.description || null, notes: v.notes || null,
        category_id: v.category_id || null, start_date: v.start_date || null, due_date: v.due_date || null,
        estimated_hours: v.estimated_hours === null || (v.estimated_hours as unknown) === '' ? null : Number(v.estimated_hours),
      };
      const me = this.auth.userId()!;
      const ids = this.canManage() ? [...this.selected()]
        : [...this.original].filter((u) => u !== me).concat(this.selected().has(me) ? [me] : []);
      if (this.taskId()) {
        await this.work.updateTask(this.taskId()!, patch);
        await this.work.setAssignees(this.taskId()!, ids);
        await this.work.setTaskTags(this.taskId()!, [...this.selectedTags()]);
        this.toast.success('Task updated');
      } else {
        await this.work.createTask({ ...patch, pipeline_id: this.pipelineId(), stage_id: v.stage_id, position: Date.now() }, ids, [...this.selectedTags()]);
        this.toast.success('Task created');
      }
      this.closed.emit(true);
    } catch (e) { this.toast.error(e); } finally { this.busy.set(false); }
  }

  async remove() {
    if (!(await this.confirm.ask('Delete this task permanently?', 'Delete'))) return;
    try { await this.work.deleteTask(this.taskId()!); this.toast.success('Task deleted'); this.closed.emit(true); }
    catch (e) { this.toast.error(e); }
  }

  async comment() {
    const body = this.draft().trim();
    if (!body) return;
    try { await this.work.addComment(this.taskId()!, body); this.draft.set(''); this.dirty = true; await this.reloadThread(); }
    catch (e) { this.toast.error(e); }
  }

  async addLink() {
    const url = this.linkUrl().trim();
    if (!/^https?:\/\/\S+$/i.test(url)) { this.toast.info('Enter a full link starting with http:// or https://'); return; }
    try { await this.work.addLink(this.taskId()!, url, this.linkTitle()); this.linkUrl.set(''); this.linkTitle.set(''); this.dirty = true; await this.reloadThread(); }
    catch (e) { this.toast.error(e); }
  }
  async removeLink(l: TaskLink) {
    if (!(await this.confirm.ask('Delete this link? The deletion will be recorded in the activity log.', 'Delete'))) return;
    try { await this.work.deleteLink(l.id); this.dirty = true; await this.reloadThread(); this.toast.success('Link deleted'); } catch (e) { this.toast.error(e); }
  }
  async removeComment(c: Comment) {
    if (!(await this.confirm.ask('Delete this comment? It will be removed for everyone and the deletion will be recorded in the activity log.', 'Delete'))) return;
    try { await this.work.deleteComment(c.id); this.dirty = true; await this.reloadThread(); this.toast.success('Comment deleted'); } catch (e) { this.toast.error(e); }
  }

  private async reloadThread() {
    const id = this.taskId()!;
    const [c, a, l] = await Promise.all([this.work.listComments(id), this.work.listActivity({ taskId: id, limit: 100 }), this.work.listLinks(id)]);
    this.comments.set(c); this.activity.set([...a].reverse()); this.links.set(l);
  }
}
