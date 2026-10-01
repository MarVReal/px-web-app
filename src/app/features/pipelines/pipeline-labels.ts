import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, ElementRef, Injector, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { sanitizeLayout } from '../../core/models/card-layout';
import { Label, Pipeline, Task, Team, TeamMember } from '../../core/models/models';
import { ConfirmService } from '../../core/services/confirm.service';
import { OrgService } from '../../core/services/org.service';
import { ToastService } from '../../core/services/toast.service';
import { WorkService } from '../../core/services/work.service';
import { ColorField } from '../../shared/components/color-field';
import { TaskCardView } from '../../shared/components/task-card-view';
import { labelBg, labelFg, nextPresetColor, normalizeHex } from '../../shared/utils/label-colors';

type Kind = 'categories' | 'tags';
interface KindDef { kind: Kind; title: string; singular: string; rule: string; empty: string; placeholder: string; }
interface Usage { categories: Record<string, number>; tags: Record<string, number>; }

const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * 864e5).toISOString();
const person = (name: string, id: string) => ({ user_id: id, is_primary: false, profile: { id, email: name.toLowerCase().replace(/\s+/g, '.') + '@example.com', full_name: name, avatar_url: null } });
const dupMessage = (e: unknown, name: string) => (/duplicate|unique/i.test((e as Error).message) ? `"${name}" already exists.` : e);

/**
 * Sidebar page (Admin / Section Head): create, rename, recolour, reorder and delete the Categories and Tags of a pipeline.
 * These become the dropdown choices on every task card in that pipeline. A live card on the right shows how they will look.
 */
@Component({
  selector: 'px-pipeline-labels',
  imports: [CdkDropList, CdkDrag, CdkDragHandle, RouterLink, TaskCardView, ColorField],
  template: `
    <div class="page" style="max-width: 1120px">
      <div class="page-head">
        <h1>Categories &amp; Tags</h1><span class="spacer"></span>
        @if (pipelines().length) {
          <label class="row picker" for="pipeline-select">Pipeline
            <select id="pipeline-select" (change)="choose($any($event.target).value)">
              @for (p of pipelines(); track p.id) { <option [value]="p.id" [selected]="p.id === pipelineId()">{{ teamName(p.team_id) }} — {{ p.name }}</option> }
            </select></label>
        }
      </div>

      @if (loading()) {
        <div class="layout" aria-busy="true" aria-label="Loading categories and tags">
          <div class="groups">
            @for (n of [0, 1]; track n) {
              <div class="surface">
                @for (w of [112, 84, 140]; track w) { <div class="sk-row"><span class="sk-bar" [style.width.px]="w"></span></div> }
              </div>
            }
          </div>
        </div>
      }
      @else if (!pipelines().length) {
        <div class="empty card">No pipelines to manage yet. <a routerLink="/pipelines">Create one in Pipelines</a>, then come back to set up its categories and tags.</div>
      }
      @else {
        <p class="lede">Set the choices people can pick on task cards in this pipeline.</p>
        <div class="layout" [class.busy]="switching()" [attr.aria-busy]="switching()">
          <div class="groups">
            @for (k of kinds; track k.kind) {
              <section class="group" [attr.aria-labelledby]="'h-' + k.kind">
                <div class="group-head"><h2 [id]="'h-' + k.kind">{{ k.title }}</h2><span class="badge">{{ list(k.kind).length }}</span></div>
                <p class="rule">{{ k.rule }}</p>
                <div class="surface">
                  <div class="list" cdkDropList cdkDropListLockAxis="y" [cdkDropListData]="list(k.kind)" (cdkDropListDropped)="drop(k.kind, $event)">
                    @for (l of list(k.kind); track l.id) {
                      <div class="item" cdkDrag cdkDragLockAxis="y" [cdkDragDisabled]="isEditing(k.kind, l.id)" [class.editing]="isEditing(k.kind, l.id)" [class.fresh]="fresh() === l.id">
                        @if (isEditing(k.kind, l.id)) {
                          <form class="editor" (submit)="save($event)" (keydown.escape)="cancelEdit()">
                            <span class="chip" [style.background]="bg(editColor())" [style.color]="fg(editColor())">{{ prefix(k.kind) }}{{ editName().trim() || l.name }}</span>
                            <div class="frow"><label class="flabel" for="edit-name">Name</label>
                              <span class="fctl">
                                <input #nameInput id="edit-name" [value]="editName()" maxlength="40" autocomplete="off" [attr.aria-invalid]="editError() ? true : null"
                                  [attr.aria-describedby]="editError() ? 'edit-name-err' : null" (input)="editName.set($any($event.target).value)" />
                                @if (editError(); as err) { <span class="err" id="edit-name-err" role="alert">{{ err }}</span> }
                              </span></div>
                            <div class="frow colour"><span class="flabel">Colour</span>
                              <px-color-field class="fctl" [value]="editColor()" [group]="'colour-edit'" (valueChange)="editColor.set($event)" /></div>
                            <div class="actions">
                              <button type="button" class="btn" (click)="cancelEdit()">Cancel</button>
                              <button type="submit" class="btn primary" [disabled]="!canSave() || saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
                            </div>
                          </form>
                        } @else {
                          <button type="button" class="grip" cdkDragHandle [attr.data-grip]="l.id" [attr.aria-label]="'Reorder ' + l.name + '. Drag, or press Alt with Up or Down arrow.'"
                            (keydown.alt.arrowup)="move(k.kind, l.id, -1); $event.preventDefault()" (keydown.alt.arrowdown)="move(k.kind, l.id, 1); $event.preventDefault()">
                            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><circle cx="5.5" cy="3.5" r="1.3" /><circle cx="10.5" cy="3.5" r="1.3" /><circle cx="5.5" cy="8" r="1.3" /><circle cx="10.5" cy="8" r="1.3" /><circle cx="5.5" cy="12.5" r="1.3" /><circle cx="10.5" cy="12.5" r="1.3" /></svg>
                          </button>
                          <div class="item-main" (click)="startEdit(k.kind, l)">
                            <span class="chip" [style.background]="bg(l.color)" [style.color]="fg(l.color)">{{ prefix(k.kind) }}{{ l.name }}</span>
                            @if (usageLabel(k.kind, l.id); as u) { <span class="uses">{{ u }}</span> }
                          </div>
                          <button type="button" class="icon-btn" [attr.data-edit]="l.id" [attr.aria-label]="'Edit ' + k.singular + ' ' + l.name" title="Edit" (click)="startEdit(k.kind, l)">
                            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 2.5l3 3-8 8H2.5v-3l8-8z" /></svg>
                          </button>
                          <button type="button" class="icon-btn danger" [attr.aria-label]="'Delete ' + k.singular + ' ' + l.name" title="Delete" (click)="remove(k.kind, l)">
                            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5h11M6 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M4 4.5l.6 8.1a1 1 0 001 .9h4.8a1 1 0 001-.9l.6-8.1M6.7 7v4M9.3 7v4" /></svg>
                          </button>
                        }
                      </div>
                    } @empty { <div class="empty-row">{{ k.empty }}</div> }
                  </div>

                  <form class="composer" (submit)="add(k.kind, $event)" (keydown.escape)="setDraft(k.kind, '')">
                    <div class="composer-row">
                      <input [placeholder]="k.placeholder" maxlength="40" autocomplete="off" [value]="draft(k.kind)" [attr.aria-label]="'New ' + k.singular + ' name'"
                        (input)="setDraft(k.kind, $any($event.target).value)" />
                      <button type="submit" class="btn primary" [disabled]="!canAdd(k.kind)">Add {{ k.singular }}</button>
                    </div>
                    @if (draft(k.kind).trim()) {
                      <div class="composer-detail">
                        <span class="chip" [style.background]="bg(addColor(k.kind))" [style.color]="fg(addColor(k.kind))">{{ prefix(k.kind) }}{{ draft(k.kind).trim() }}</span>
                        <px-color-field [value]="addColor(k.kind)" [group]="'colour-add-' + k.kind" (valueChange)="setColor(k.kind, $event)" />
                      </div>
                      @if (addError(k.kind); as err) { <div class="err" role="alert">{{ err }}</div> }
                    }
                  </form>
                </div>
              </section>
            }
          </div>

          <aside class="aside" aria-labelledby="h-preview">
            <h2 id="h-preview">On the card</h2>
            <p class="aside-note">How {{ pipeline()?.name }} cards look with your first labels.</p>
            <div class="task-card" inert><px-task-card-view [task]="sample()" [items]="layout()" /></div>
            @if (!categories().length && !tags().length && !cardNote()) { <p class="aside-note">Add a category and a few tags and they will show up here.</p> }
            @if (cardNote(); as note) { <p class="notice">{{ note }}</p> }
            <p class="aside-note"><a routerLink="/card-designer" [queryParams]="{ pipeline: pipelineId() }">Change what shows on cards</a></p>
          </aside>
        </div>
        <div class="sr-only" aria-live="polite">{{ announce() }}</div>
      }
    </div>`,
  styles: `
    :host { display: block; }
    .picker { font-weight: 550; } .picker select { width: auto; min-width: 240px; }
    .lede { margin: 0 0 22px; color: var(--muted); max-width: 64ch; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 32px; align-items: start; transition: opacity .15s; }
    .layout.busy { opacity: .55; pointer-events: none; }
    .groups { display: flex; flex-direction: column; gap: 28px; min-width: 0; }
    .group-head { display: flex; align-items: center; gap: 8px; } .group-head h2 { font-size: 15px; font-weight: 650; }
    .rule { margin: 2px 0 10px; color: var(--muted); font-size: 13px; }
    .surface { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }

    .item { display: flex; align-items: center; gap: 2px; min-height: 52px; padding: 6px 8px 6px 4px; background: var(--surface); border-top: 1px solid var(--border); }
    .item:first-child { border-top: 0; }
    .item.editing { align-items: flex-start; padding: 14px 16px; background: var(--surface-2); }
    .item.fresh { animation: flash 1.4s ease-out; }
    .item.cdk-drag-preview { border: 1px solid var(--border); border-radius: 8px; }
    @keyframes flash { from { background: var(--primary-50); } to { background: var(--surface); } }
    .grip { width: 28px; height: 36px; flex: none; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 6px; background: none; color: #7a8497; cursor: grab; }
    .grip:hover { color: var(--text); background: var(--surface-2); }
    .item-main { flex: 1; min-width: 0; align-self: stretch; display: flex; align-items: center; gap: 12px; padding: 0 8px; cursor: pointer; }
    .chip { display: inline-block; max-width: 100%; padding: 3px 10px; border-radius: 6px; font-size: 13px; font-weight: 600; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .uses { margin-left: auto; flex: none; font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
    .icon-btn { width: 32px; height: 32px; flex: none; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 8px; background: none; color: var(--muted); cursor: pointer; }
    .icon-btn:hover { background: var(--surface-2); color: var(--text); }
    .icon-btn.danger:hover { background: var(--danger-50); color: var(--danger); }
    .grip:focus-visible, .icon-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
    .empty-row { padding: 18px 16px; color: var(--muted); }

    .editor { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
    .frow { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; align-items: start; width: 100%; }
    .flabel { padding-top: 8px; font-size: 13px; font-weight: 550; } .frow.colour .flabel { padding-top: 4px; }
    .fctl { display: flex; flex-direction: column; gap: 6px; min-width: 0; } .fctl input { max-width: 320px; }
    .fctl input[aria-invalid='true'] { border-color: var(--danger); }
    .actions { display: flex; gap: 8px; margin-left: 76px; }

    .composer { display: flex; flex-direction: column; gap: 12px; padding: 12px; background: var(--surface-2); border-top: 1px solid var(--border); }
    .composer-row { display: flex; gap: 8px; } .composer-row .btn { flex: none; }
    .composer-detail { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; }

    .aside { position: sticky; top: 80px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .aside h2 { font-size: 15px; font-weight: 650; }
    .aside-note { margin: 0; font-size: 13px; color: var(--muted); }
    .notice { margin: 0; padding: 8px 10px; border-radius: 8px; background: var(--warn-50); color: var(--warn); font-size: 13px; }

    .sk-row { display: flex; align-items: center; height: 52px; padding: 0 16px; border-top: 1px solid var(--border); } .sk-row:first-child { border-top: 0; }
    .sk-bar { height: 22px; border-radius: 6px; background: #eef0f4; }
    .sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

    @media (max-width: 1000px) { .layout { grid-template-columns: minmax(0, 1fr); } .aside { position: static; max-width: 380px; } }
    @media (max-width: 720px) {
      .picker { flex: 1 1 100%; } .picker select { flex: 1; min-width: 0; }
      .frow { grid-template-columns: minmax(0, 1fr); gap: 4px; } .flabel, .frow.colour .flabel { padding-top: 0; } .actions { margin-left: 0; }
      .item.editing { padding: 12px; }
    }
    @media (pointer: coarse) { .icon-btn { width: 40px; height: 40px; } .grip { width: 36px; height: 40px; } }
    @media (prefers-reduced-motion: reduce) { .item.fresh { animation: none; } .layout { transition: none; } }`,
})
export class PipelineLabels implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private work = inject(WorkService);
  private org = inject(OrgService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private injector = inject(Injector);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  pipelines = signal<Pipeline[]>([]);
  teams = signal<Team[]>([]);
  pipelineId = signal('');
  categories = signal<Label[]>([]); tags = signal<Label[]>([]);
  usage = signal<Usage | null>(null);
  loading = signal(true); switching = signal(false);
  bg = labelBg; fg = labelFg;
  kinds: KindDef[] = [
    { kind: 'categories', title: 'Categories', singular: 'category', rule: 'Each task has one category. Drag to set the order of the dropdown.',
      empty: 'No categories yet. Categories describe the kind of work, like Data Quality or Case Management.', placeholder: 'New category name' },
    { kind: 'tags', title: 'Tags', singular: 'tag', rule: 'A task can have any number of tags. Drag to set the order of the dropdown.',
      empty: 'No tags yet. Tags add extra detail, like q4 or compliance.', placeholder: 'New tag name' },
  ];

  // Editing one label at a time; adding is a draft per list.
  editing = signal<{ kind: Kind; id: string } | null>(null);
  editName = signal(''); editColor = signal('');
  saving = signal(false); adding = signal(false);
  fresh = signal<string | null>(null);
  announce = signal('');
  private drafts = signal<Record<Kind, string>>({ categories: '', tags: '' });
  private picked = signal<Record<Kind, string | null>>({ categories: null, tags: null });

  pipeline = computed(() => this.pipelines().find((p) => p.id === this.pipelineId()) ?? null);
  layout = computed(() => sanitizeLayout(this.pipeline()?.card_layout));
  teamName = (id: string) => this.teams().find((t) => t.id === id)?.name ?? 'Team';
  list = (k: Kind) => (k === 'categories' ? this.categories() : this.tags());
  prefix = (k: Kind) => (k === 'tags' ? '#' : '');
  draft = (k: Kind) => this.drafts()[k];
  addColor = (k: Kind) => this.picked()[k] ?? nextPresetColor(this.list(k).map((l) => l.color));
  isEditing = (k: Kind, id: string) => this.editing()?.kind === k && this.editing()?.id === id;

  private exists(k: Kind, name: string, exceptId?: string) {
    const n = name.trim().toLowerCase();
    return this.list(k).some((l) => l.id !== exceptId && l.name.trim().toLowerCase() === n);
  }
  addError = (k: Kind) => (this.draft(k).trim() && this.exists(k, this.draft(k)) ? `"${this.draft(k).trim()}" already exists.` : '');
  canAdd = (k: Kind) => !!this.draft(k).trim() && !this.addError(k) && !this.adding();
  editError = computed(() => {
    const ed = this.editing(); if (!ed) return '';
    const name = this.editName().trim();
    if (!name) return 'Enter a name.';
    return this.exists(ed.kind, name, ed.id) ? `"${name}" already exists.` : '';
  });
  canSave = computed(() => {
    const ed = this.editing();
    const l = ed && this.list(ed.kind).find((x) => x.id === ed.id);
    return !!l && !this.editError() && (this.editName().trim() !== l.name || this.editColor() !== normalizeHex(l.color));
  });

  usageLabel(k: Kind, id: string): string {
    const u = this.usage();
    if (!u) return '';
    const n = u[k][id] ?? 0;
    return n === 0 ? 'Not used' : n === 1 ? '1 task' : `${n} tasks`;
  }

  // ----- live card preview: first labels, with whatever is being edited or typed shown first -----
  private shown(k: Kind): Label[] {
    const base = this.list(k), ed = this.editing();
    if (ed?.kind === k) {
      const orig = base.find((l) => l.id === ed.id);
      return [{ id: ed.id, name: this.editName().trim() || orig?.name || '', color: this.editColor() }, ...base.filter((l) => l.id !== ed.id)];
    }
    const d = this.draft(k).trim();
    return d ? [{ id: 'draft', name: d, color: this.addColor(k) }, ...base] : base;
  }
  sample = computed<Task>(() => {
    const category = this.shown('categories')[0] ?? null;
    return {
      id: 'sample', organization_id: '', team_id: '', pipeline_id: '', stage_id: '', title: 'Validate beneficiary masterlist', description: 'Cross-check the list against the source registry and flag duplicate records.',
      notes: null, priority: 'high', category_id: category?.id ?? null, category, tags: this.shown('tags').slice(0, 3),
      assignees: [person('Mar Villareal', 'a'), person('Juan Dela Cruz', 'b')], start_date: iso(-2).slice(0, 10), due_date: iso(3).slice(0, 10), completed_at: null,
      estimated_hours: 4.5, progress: 60, position: 0, created_by: null, created_at: iso(-2), last_activity_at: iso(), comment_count: 2, link_count: 1,
    };
  });
  cardNote = computed(() => {
    const keys = new Set(this.layout().map((i) => i.key));
    const noCat = !keys.has('category'), noTag = !keys.has('tags');
    if (noCat && noTag) return "Category and tags aren't shown on this pipeline's cards.";
    if (noCat) return "Category isn't shown on this pipeline's cards.";
    if (noTag) return "Tags aren't shown on this pipeline's cards.";
    return '';
  });

  async ngOnInit() {
    try {
      const [pipes, teams, members] = await Promise.all([this.work.listPipelines(), this.org.listTeams(), this.org.listTeamMembers()]);
      this.teams.set(teams);
      // Admins manage every pipeline; section heads only the pipelines of teams they head.
      const heads = new Set((members as TeamMember[]).filter((m) => m.user_id === this.auth.userId() && m.is_head).map((m) => m.team_id));
      const manageable = this.auth.isAdmin() ? pipes : pipes.filter((p) => heads.has(p.team_id));
      this.pipelines.set(manageable);
      const wanted = this.route.snapshot.queryParamMap.get('pipeline');
      this.pipelineId.set(manageable.find((p) => p.id === wanted)?.id ?? manageable[0]?.id ?? '');
      if (this.pipelineId()) await this.reload();
    } catch (e) { this.toast.error(e); } finally { this.loading.set(false); }
  }

  async choose(id: string) {
    this.pipelineId.set(id);
    this.router.navigate([], { queryParams: { pipeline: id }, replaceUrl: true });
    this.editing.set(null); this.fresh.set(null);
    this.drafts.set({ categories: '', tags: '' }); this.picked.set({ categories: null, tags: null });
    this.categories.set([]); this.tags.set([]); this.usage.set(null);
    this.switching.set(true);
    try { await this.reload(); } catch (e) { this.toast.error(e); } finally { this.switching.set(false); }
  }

  private async reload() {
    const id = this.pipelineId();
    const [c, t] = await Promise.all([this.work.listLabels('categories', id), this.work.listLabels('tags', id)]);
    if (id !== this.pipelineId()) return; // the user switched pipeline while this was loading
    this.categories.set(c); this.tags.set(t);
    // Counts are a nicety: show the lists first and ignore a failure here.
    this.work.labelUsage(id).then((u) => { if (id === this.pipelineId()) this.usage.set(u); }).catch(() => undefined);
  }

  private setList(k: Kind, labels: Label[]) { (k === 'categories' ? this.categories : this.tags).set(labels); }
  private focusLater(selector: string) {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }

  // ----- add -----
  setDraft(k: Kind, v: string) {
    this.drafts.update((d) => ({ ...d, [k]: v }));
    if (!v.trim()) this.picked.update((p) => ({ ...p, [k]: null }));
  }
  setColor(k: Kind, v: string) { this.picked.update((p) => ({ ...p, [k]: normalizeHex(v) })); }

  async add(k: Kind, ev: Event) {
    ev.preventDefault();
    if (!this.canAdd(k)) return;
    const form = ev.currentTarget as HTMLFormElement;
    const name = this.draft(k).trim(), noun = k === 'tags' ? 'tag' : 'category';
    this.adding.set(true);
    try {
      const position = Math.max(-1, ...this.list(k).map((l) => l.position ?? 0)) + 1;
      const created = await this.work.addLabel(k, this.pipelineId(), name, this.addColor(k), position);
      this.setList(k, [...this.list(k), created]);
      this.setDraft(k, '');
      this.fresh.set(created.id); setTimeout(() => this.fresh() === created.id && this.fresh.set(null), 1500);
      this.toast.success(`Added ${noun} "${name}"`);
      form.querySelector<HTMLInputElement>('.composer-row input')?.focus();
    } catch (e) { this.toast.error(dupMessage(e, name)); } finally { this.adding.set(false); }
  }

  // ----- edit -----
  startEdit(k: Kind, l: Label) {
    this.editing.set({ kind: k, id: l.id });
    this.editName.set(l.name); this.editColor.set(normalizeHex(l.color));
    afterNextRender(() => { const el = this.nameInput()?.nativeElement; el?.focus(); el?.select(); }, { injector: this.injector });
  }
  cancelEdit() {
    const id = this.editing()?.id;
    this.editing.set(null);
    if (id) this.focusLater(`[data-edit="${id}"]`);
  }
  async save(ev: Event) {
    ev.preventDefault();
    const ed = this.editing(), l = ed && this.list(ed.kind).find((x) => x.id === ed.id);
    if (!ed || !l || !this.canSave() || this.saving()) return;
    const name = this.editName().trim(), color = this.editColor();
    const patch: { name?: string; color?: string } = {};
    if (name !== l.name) patch.name = name;
    if (color !== normalizeHex(l.color)) patch.color = color;
    this.saving.set(true);
    try {
      await this.work.updateLabel(ed.kind, ed.id, patch);
      this.setList(ed.kind, this.list(ed.kind).map((x) => (x.id === ed.id ? { ...x, ...patch } : x)));
      this.editing.set(null); this.focusLater(`[data-edit="${ed.id}"]`);
    } catch (e) { this.toast.error(dupMessage(e, name)); } finally { this.saving.set(false); }
  }

  // ----- delete -----
  async remove(k: Kind, l: Label) {
    const noun = k === 'tags' ? 'tag' : 'category', u = this.usage(), n = u ? (u[k][l.id] ?? 0) : null;
    const impact = n === null ? 'It will be removed from any tasks that use it.' : n === 0 ? 'No tasks use it.'
      : `It's on ${n} ${n === 1 ? 'task' : 'tasks'} and will be removed from ${n === 1 ? 'it' : 'them'}.`;
    if (!(await this.confirm.ask(`Delete the ${noun} "${l.name}"? ${impact}`, 'Delete'))) return;
    try {
      await this.work.deleteLabel(k, l.id);
      this.setList(k, this.list(k).filter((x) => x.id !== l.id));
      if (this.editing()?.id === l.id) this.editing.set(null);
      this.toast.success(`Deleted ${noun} "${l.name}"`);
    } catch (e) { this.toast.error(e); }
  }

  // ----- reorder (the position decides the order of the dropdowns) -----
  drop(k: Kind, ev: CdkDragDrop<Label[]>) {
    if (ev.previousIndex !== ev.currentIndex) void this.moveTo(k, ev.previousIndex, ev.currentIndex);
  }
  move(k: Kind, id: string, delta: -1 | 1) {
    const from = this.list(k).findIndex((l) => l.id === id), to = from + delta;
    if (from < 0 || to < 0 || to >= this.list(k).length) return;
    void this.moveTo(k, from, to).then(() => this.focusLater(`[data-grip="${id}"]`));
  }
  private async moveTo(k: Kind, from: number, to: number) {
    const before = this.list(k);
    const next = [...before]; moveItemInArray(next, from, to);
    const ordered = next.map((l, i) => ({ ...l, position: i }));
    const old = new Map(before.map((l) => [l.id, l.position ?? 0]));
    this.setList(k, ordered);
    this.announce.set(`${ordered[to].name} moved to position ${to + 1} of ${ordered.length}.`);
    try {
      await this.work.setLabelPositions(k, ordered.filter((l) => old.get(l.id) !== l.position).map((l) => ({ id: l.id, position: l.position! })));
    } catch (e) { this.toast.error(e); this.setList(k, before); }
  }
}
