import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { CardFieldKey, CardItem, toRows } from '../../core/models/card-layout';
import { Task, priorityLabel } from '../../core/models/models';
import { isOverdue } from '../utils/format';
import { labelBg, labelFg } from '../utils/label-colors';
import { Avatar } from './avatar';

/** Renders the inside of a Kanban card from a pipeline's card layout. Used by the board and by the Card Designer preview. */
@Component({
  selector: 'px-task-card-view',
  imports: [DatePipe, Avatar],
  template: `
    @for (row of rows(); track $index) {
      @if (true) {
        <div class="row" [class.pair]="row.length === 2" [class.divider-row]="row[0].key === 'divider'">
          @for (cell of row; track cell.key + $index) {
            @if (cell.key === 'divider') { <hr class="divider" /> }
            @else {
              <div class="cell" [class.grow]="row.length === 2 && $first" [class.end]="row.length === 2 && !$first">
                @switch (cell.key) {
                  @case ('title') { <span class="title">{{ task().title }}</span> }
                  @case ('assignees') {
                    <span class="avs">@for (a of task().assignees ?? []; track a.user_id) { <px-avatar [name]="a.profile.full_name || a.profile.email" [size]="24" /> }</span> }
                  @case ('priority') {
                    <button type="button" class="priority-item" [disabled]="!editable()" (click)="edit.emit({ field: 'priority', event: $event })" title="Change priority">
                      <span class="priority-dot" [class]="task().priority"></span>{{ label(task().priority) }}</button> }
                  @case ('category') {
                    @if (task().category; as c) {
                      <button type="button" class="chip" [style.background]="bg(c.color)" [style.color]="fg(c.color)" [disabled]="!editable()" (click)="edit.emit({ field: 'category', event: $event })" title="Change category">{{ c.name }}</button>
                    } @else if (editable()) {
                      <button type="button" class="chip" (click)="edit.emit({ field: 'category', event: $event })" title="Set category">+ category</button> } }
                  @case ('tags') {
                    <span class="chips">
                      @for (g of task().tags; track g.id) { <button type="button" class="chip" [style.background]="bg(g.color)" [style.color]="fg(g.color)" [disabled]="!editable()" (click)="edit.emit({ field: 'tags', event: $event })">#{{ g.name }}</button> }
                      @if (!task().tags.length && editable()) { <button type="button" class="chip" (click)="edit.emit({ field: 'tags', event: $event })">+ tags</button> }
                    </span> }
                  @case ('created_at') { <span class="meta">Created {{ task().created_at | date: 'MMM d' }}</span> }
                  @case ('last_activity') { <span class="meta">Active {{ task().last_activity_at | date: 'MMM d' }}</span> }
                  @case ('start_date') { <span class="meta">Starts {{ task().start_date | date: 'MMM d' }}</span> }
                  @case ('due_date') { <span class="due" [class.overdue]="overdue()">{{ overdue() ? '⚠ Due ' : 'Due ' }}{{ task().due_date | date: 'MMM d' }}</span> }
                  @case ('completed_at') { <span class="meta done">✓ Completed {{ task().completed_at | date: 'MMM d' }}</span> }
                  @case ('estimated_hours') { <span class="meta">⏱ {{ task().estimated_hours }}h</span> }
                  @case ('progress') { <span class="progress"><span class="bar"><i [style.width.%]="task().progress"></i></span><span class="meta">{{ task().progress }}%</span></span> }
                  @case ('counts') {
                    <span class="meta counts">
                      @if (task().comment_count) { <span>💬 {{ task().comment_count }}</span> }
                      @if (task().link_count) { <span>🔗 {{ task().link_count }}</span> }
                      @if (task().progress > 0) { <span>{{ task().progress === 100 ? '✓ ' : '' }}{{ task().progress }}%</span> }
                    </span> }
                  @case ('description') { <span class="desc">{{ task().description }}</span> }
                }
              </div>
            }
          }
        </div>
      }
    }`,
  styles: `
    :host { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .row { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; }
    .row.divider-row { display: block; }
    .cell { min-width: 0; } .cell.grow { flex: 1 1 0; } .cell.end { margin-left: auto; display: flex; justify-content: flex-end; max-width: 65%; }
    .title { font-weight: 600; line-height: 1.35; word-break: break-word; display: block; }
    .avs { display: flex; flex-direction: row-reverse; } .avs px-avatar + px-avatar { margin-right: -8px; }
    .meta { font-size: 12px; color: var(--muted); } .meta.done { color: var(--success); }
    .counts { display: inline-flex; gap: 10px; }
    .due { font-size: 12px; font-weight: 500; color: var(--muted); &.overdue { color: var(--danger); } }
    .priority-item { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 12px; font-weight: 500; color: var(--muted); background: none; border: 0; padding: 0; cursor: pointer; border-radius: 4px;
      &:hover:not(:disabled) { color: var(--text); } &:disabled { cursor: default; } }
    .priority-dot { width: 7px; height: 7px; border-radius: 50%; background: #98a2b3; &.medium { background: #2e90fa; } &.high { background: var(--warn); } &.urgent { background: #7a5af8; } }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { border: 0; border-radius: 6px; padding: 2px 8px; font: inherit; font-size: 11px; font-weight: 600; background: #eef0f4; color: #475467; cursor: pointer;
      &:hover:not(:disabled) { filter: brightness(.96); } &:disabled { cursor: default; } }
    .divider { border: 0; border-top: 1px dashed var(--border); margin: 0; width: 100%; }
    .progress { display: flex; align-items: center; gap: 8px; width: 100%; } .bar { flex: 1; height: 4px; background: #e4e7ec; border-radius: 4px; i { display: block; height: 100%; background: var(--primary); border-radius: 4px; } }
    .desc { font-size: 12px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }`,
})
export class TaskCardView {
  task = input.required<Task>();
  items = input.required<CardItem[]>();
  /** Editable cards show "+ category" / "+ tags" placeholders and clickable chips. */
  editable = input(false);
  edit = output<{ field: 'priority' | 'category' | 'tags'; event: Event }>();

  /** Visible rows only; dividers are dropped when leading, trailing or repeated. */
  rows = computed(() => {
    const vis = toRows(this.items()).filter((r) => this.rowVisible(r));
    const out: CardItem[][] = [];
    for (const r of vis) {
      const isDiv = r[0].key === 'divider';
      if (isDiv && (!out.length || out[out.length - 1][0].key === 'divider')) continue;
      out.push(r);
    }
    while (out.length && out[out.length - 1][0].key === 'divider') out.pop();
    return out;
  });
  label = priorityLabel; bg = labelBg; fg = labelFg;
  overdue = () => isOverdue(this.task().due_date, this.task().completed_at);

  /** A field renders only when it has something to show (placeholders count when the card is editable). */
  private has(key: CardFieldKey): boolean {
    const t = this.task();
    switch (key) {
      case 'title': case 'priority': case 'created_at': case 'last_activity': case 'divider': return true;
      case 'assignees': return !!t.assignees?.length;
      case 'category': return !!t.category || this.editable();
      case 'tags': return t.tags.length > 0 || this.editable();
      case 'start_date': return !!t.start_date;
      case 'due_date': return !!t.due_date;
      case 'completed_at': return !!t.completed_at;
      case 'estimated_hours': return t.estimated_hours != null && t.estimated_hours > 0;
      case 'progress': return t.progress > 0;
      case 'counts': return !!(t.comment_count || t.link_count || t.progress > 0);
      case 'description': return !!t.description?.trim();
    }
  }
  rowVisible = (row: CardItem[]) => row.some((c) => this.has(c.key));
}
