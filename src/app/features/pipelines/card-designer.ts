import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CARD_FIELDS, CardFieldDef, CardFieldKey, CardItem, DEFAULT_CARD_LAYOUT, FIELD_BY_KEY, sanitizeLayout } from '../../core/models/card-layout';
import { Pipeline, Task, Team } from '../../core/models/models';
import { ConfirmService } from '../../core/services/confirm.service';
import { OrgService } from '../../core/services/org.service';
import { ToastService } from '../../core/services/toast.service';
import { WorkService } from '../../core/services/work.service';
import { TaskCardView } from '../../shared/components/task-card-view';

const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * 864e5).toISOString();
const sample = (over: Partial<Task>): Task => ({
  id: 'sample', organization_id: '', team_id: '', pipeline_id: '', stage_id: '', title: '', description: null, notes: null, priority: 'medium', category_id: null,
  start_date: null, due_date: null, estimated_hours: null, progress: 0, position: 0, completed_at: null, created_by: null, created_at: iso(), last_activity_at: iso(),
  tags: [], assignees: [], comment_count: 0, link_count: 0, ...over,
});
const person = (name: string, id: string) => ({ user_id: id, is_primary: false, profile: { id, email: name.toLowerCase() + '@example.com', full_name: name, avatar_url: null } });

/** Admin / Section Head: arrange which fields appear on a pipeline's Kanban cards, with a live preview. */
@Component({
  selector: 'px-card-designer',
  imports: [CdkDropList, CdkDrag, TaskCardView],
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Card Designer</h1><span class="spacer"></span>
        @if (pipelines().length) {
          <label class="row" style="font-weight: 550">Pipeline
            <select style="width: auto; min-width: 220px" (change)="choose($any($event.target).value)">
              @for (p of pipelines(); track p.id) { <option [value]="p.id" [selected]="p.id === pipelineId()">{{ teamName(p.team_id) }} — {{ p.name }}</option> }
            </select></label>
          <select style="width: auto" (change)="cloneFrom($any($event.target))" aria-label="Clone layout from another pipeline">
            <option value="">Clone from…</option>
            @for (p of otherPipelines(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }</select>
          <button class="btn" (click)="reset()">Reset to default</button>
          <button class="btn" (click)="cancel()" [disabled]="!dirty()">Cancel</button>
          <button class="btn primary" (click)="save()" [disabled]="!dirty() || busy()">{{ busy() ? 'Saving…' : 'Save' }}</button>
        }
      </div>

      @if (loading()) { <div class="empty">Loading…</div> }
      @else if (!pipelines().length) { <div class="empty card">No pipelines to manage yet. Create a pipeline first (Pipelines → New pipeline).</div> }
      @else {
        <p class="muted">Choose which fields appear on task cards in <b>{{ pipeline()?.name }}</b>. Drag fields from the right into the layout, drag to reorder, and set a field to
          <b>Half</b> width to place two fields side by side. The preview updates as you go{{ dirty() ? ' — you have unsaved changes' : '' }}.</p>

        <div class="designer">
          <section class="card panel">
            <h2>Preview <span class="badge">live</span></h2>
            <div class="small muted">Full example</div>
            <div class="task-card"><px-task-card-view [task]="fullSample" [items]="items()" /></div>
            <div class="small muted" style="margin-top: 6px">Minimal example</div>
            <div class="task-card"><px-task-card-view [task]="minimalSample" [items]="items()" /></div>
          </section>

          <section class="card panel">
            <h2>Card layout <span class="badge">{{ items().length }}</span></h2>
            <div class="small muted">Drag &amp; drop the fields into this area</div>
            <div class="canvas" cdkDropList #canvas="cdkDropList" cdkDropListOrientation="mixed" [cdkDropListData]="items()"
              [cdkDropListConnectedTo]="['palette']" id="canvas" (cdkDropListDropped)="drop($event)">
              @for (it of items(); track it.key + $index; let i = $index) {
                <div class="slot" [class.half]="it.width === 'half'" cdkDrag [cdkDragData]="it">
                  <span class="grip" aria-hidden="true">⠿</span>
                  <span class="slot-icon">{{ def(it.key).icon }}</span>
                  <span class="slot-label">{{ def(it.key).label }}</span>
                  <button type="button" class="btn sm ghost" (click)="toggleWidth(i)" [title]="it.width === 'half' ? 'Half width: pairs with a neighbouring half field' : 'Full width'">
                    {{ it.width === 'half' ? '◧' : '▭' }}<span class="tt"> {{ it.width === 'half' ? 'Half' : 'Full' }}</span></button>
                  @if (!def(it.key).required) { <button type="button" class="btn sm ghost x" (click)="remove(i)" aria-label="Remove field" title="Remove">✕</button> }
                </div>
              }
              @if (items().length <= 1) { <div class="canvas-hint muted small">Drop fields here to build the card</div> }
            </div>
          </section>

          <section class="card panel">
            <h2>Fields</h2>
            <div class="small muted">Drag into the layout, or click to add</div>
            <div class="palette" cdkDropList id="palette" cdkDropListSortingDisabled [cdkDropListEnterPredicate]="noEnter" [cdkDropListConnectedTo]="[canvas]">
              @for (f of fields; track f.key) {
                <div class="field" cdkDrag [cdkDragData]="f.key" [cdkDragDisabled]="isUsed(f)" [class.used]="isUsed(f)" (click)="add(f.key)" [title]="f.hint">
                  <span class="slot-icon">{{ f.icon }}</span><span>{{ f.label }}</span>
                  @if (isUsed(f)) { <span class="used-tag">in card</span> }
                </div>
              }
            </div>
          </section>
        </div>
      }
    </div>`,
  styles: `
    .designer { display: grid; grid-template-columns: minmax(280px, 340px) minmax(340px, 1fr) minmax(240px, 300px); gap: 16px; align-items: start; }
    @media (max-width: 1100px) { .designer { grid-template-columns: 1fr; } }
    .panel { display: flex; flex-direction: column; gap: 10px; } .panel h2 { display: flex; align-items: center; gap: 8px; }
    .canvas { display: flex; flex-wrap: wrap; gap: 8px; min-height: 120px; padding: 12px; border: 2px dashed var(--border); border-radius: 10px; background: var(--surface-2); position: relative; align-content: flex-start; }
    .canvas-hint { position: absolute; inset: auto 0 12px 0; text-align: center; pointer-events: none; }
    .slot { flex: 0 0 100%; min-width: 0; display: flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 8px 8px 10px; cursor: grab; box-shadow: var(--shadow); }
    .slot.half { flex: 0 0 calc(50% - 4px); padding: 8px 4px 8px 8px; gap: 6px; }
    .slot.half .grip, .slot.half .tt { display: none; } .slot.half .btn.sm { padding: 3px 6px; }
    .slot-label { flex: 1; font-weight: 550; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .slot-icon { width: 18px; text-align: center; color: var(--muted); } .grip { color: #98a2b3; }
    .x { color: var(--muted); }
    .palette { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .field { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-radius: 8px; background: #eceff3; cursor: grab; font-weight: 500; position: relative; min-width: 0;
      &:hover:not(.used) { background: var(--primary-50); outline: 1px solid var(--primary); } &.used { opacity: .45; cursor: default; } }
    .used-tag { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-left: auto; }
    .cdk-drag-preview.slot, .cdk-drag-preview.field { box-shadow: var(--shadow-lg); }
    .canvas .cdk-drag-placeholder { opacity: .35; }
    @media (max-width: 1100px) { .palette { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); } }`,
})
export class CardDesigner implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private work = inject(WorkService);
  private org = inject(OrgService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  fields = CARD_FIELDS;
  pipelines = signal<Pipeline[]>([]);
  teams = signal<Team[]>([]);
  pipelineId = signal('');
  items = signal<CardItem[]>(DEFAULT_CARD_LAYOUT.map((i) => ({ ...i })));
  private saved = signal<CardItem[]>([]);
  loading = signal(true); busy = signal(false);

  pipeline = computed(() => this.pipelines().find((p) => p.id === this.pipelineId()) ?? null);
  otherPipelines = computed(() => this.pipelines().filter((p) => p.id !== this.pipelineId()));
  dirty = computed(() => JSON.stringify(this.items()) !== JSON.stringify(this.saved()));
  teamName = (id: string) => this.teams().find((t) => t.id === id)?.name ?? 'Team';
  def = (k: CardFieldKey): CardFieldDef => FIELD_BY_KEY.get(k)!;
  isUsed = (f: CardFieldDef) => !f.repeatable && this.items().some((i) => i.key === f.key);
  noEnter = () => false; // the palette never accepts drops

  fullSample = sample({
    title: 'Validate Beneficiary Masterlist', description: 'Cross-check the beneficiary list against the source registry and flag duplicate records.', priority: 'high',
    category: { id: 'c', name: 'Data Quality', color: '#12b76a' }, tags: [{ id: 't1', name: 'q4', color: '#2e90fa' }, { id: 't2', name: 'compliance', color: '#7a5af8' }],
    assignees: [person('Mar Villareal', 'a'), person('Juan Dela Cruz', 'b')], start_date: iso(-2).slice(0, 10), due_date: iso(3).slice(0, 10), completed_at: iso(),
    estimated_hours: 4.5, progress: 75, comment_count: 2, link_count: 1,
  });
  minimalSample = sample({ title: 'Draft data sharing agreement', priority: 'low' });

  async ngOnInit() {
    try {
      const [pipes, teams, members] = await Promise.all([this.work.listPipelines(), this.org.listTeams(), this.org.listTeamMembers()]);
      this.teams.set(teams);
      const heads = new Set(members.filter((m) => m.user_id === this.auth.userId() && m.is_head).map((m) => m.team_id));
      const manageable = this.auth.isAdmin() ? pipes : pipes.filter((p) => heads.has(p.team_id));
      this.pipelines.set(manageable);
      const wanted = this.route.snapshot.queryParamMap.get('pipeline');
      this.select(manageable.find((p) => p.id === wanted)?.id ?? manageable[0]?.id ?? '');
    } catch (e) { this.toast.error(e); } finally { this.loading.set(false); }
  }

  private select(id: string) {
    this.pipelineId.set(id);
    const layout = sanitizeLayout(this.pipelines().find((p) => p.id === id)?.card_layout);
    this.saved.set(layout.map((i) => ({ ...i })));
    this.items.set(layout.map((i) => ({ ...i })));
  }

  async choose(id: string) {
    if (this.dirty() && !(await this.confirm.ask('Discard your unsaved card changes?', 'Discard'))) { this.pipelineId.set(this.pipelineId()); return; }
    this.select(id);
    this.router.navigate([], { queryParams: { pipeline: id }, replaceUrl: true });
  }

  drop(ev: CdkDragDrop<CardItem[]>) {
    const list = [...this.items()];
    if (ev.previousContainer === ev.container) {
      moveItemInArray(list, ev.previousIndex, ev.currentIndex);
    } else {
      const key = ev.item.data as CardFieldKey;
      if (!FIELD_BY_KEY.has(key) || (this.isUsed(this.def(key)))) return;
      list.splice(ev.currentIndex, 0, { key, width: 'full' });
    }
    this.items.set(list);
  }

  add(key: CardFieldKey) {
    const d = this.def(key);
    if (this.isUsed(d)) return;
    if (this.items().length >= 30) { this.toast.info('A card can have at most 30 items.'); return; }
    this.items.update((l) => [...l, { key, width: 'full' }]);
  }
  remove(i: number) { this.items.update((l) => l.filter((_, j) => j !== i)); }
  toggleWidth(i: number) { this.items.update((l) => l.map((it, j) => (j === i ? { ...it, width: it.width === 'half' ? 'full' : 'half' } : it))); }

  reset() { this.items.set(DEFAULT_CARD_LAYOUT.map((i) => ({ ...i }))); }
  cancel() { this.items.set(this.saved().map((i) => ({ ...i }))); }
  async cloneFrom(el: HTMLSelectElement) {
    const id = el.value; el.value = '';
    const p = this.pipelines().find((x) => x.id === id);
    if (p) { this.items.set(sanitizeLayout(p.card_layout).map((i) => ({ ...i }))); this.toast.info(`Copied the layout from "${p.name}". Save to apply.`); }
  }

  async save() {
    if (!(await this.confirm.ask('Save these card layout changes?\n\nThey apply to every card in this pipeline.', 'Save layout', 'primary'))) return;
    this.busy.set(true);
    try {
      const layout = sanitizeLayout(this.items());
      await this.work.updatePipeline(this.pipelineId(), { card_layout: layout });
      this.pipelines.update((l) => l.map((p) => (p.id === this.pipelineId() ? { ...p, card_layout: layout } : p)));
      this.saved.set(layout.map((i) => ({ ...i }))); this.items.set(layout.map((i) => ({ ...i })));
      this.toast.success('Card layout saved');
    } catch (e) { this.toast.error(e); } finally { this.busy.set(false); }
  }
}
