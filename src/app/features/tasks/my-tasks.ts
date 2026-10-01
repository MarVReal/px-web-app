import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { PRIORITIES, Task, priorityLabel } from '../../core/models/models';
import { ToastService } from '../../core/services/toast.service';
import { WorkService } from '../../core/services/work.service';
import { isOverdue } from '../../shared/utils/format';

@Component({
  selector: 'px-my-tasks',
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-head"><h1>My Tasks</h1><span class="spacer"></span>
        <select style="width:auto" (change)="status.set($any($event.target).value)"><option value="open">Open</option><option value="all">All</option><option value="done">Completed</option></select>
        <select style="width:auto" (change)="priority.set($any($event.target).value)"><option value="">Any priority</option>
          @for (p of priorities; track p.value) { <option [value]="p.value">{{ p.label }}</option> }</select>
        <input style="width:200px" placeholder="Search…" (input)="text.set($any($event.target).value)" /></div>
      <div class="card flush table-wrap"><table class="tbl">
        <thead><tr><th>Task</th><th>Priority</th><th>Due</th><th>Progress</th><th></th></tr></thead>
        <tbody>
          @for (t of shown(); track t.id) {
            <tr><td><b>{{ t.title }}</b>@if (t.category) { <div class="muted small">{{ t.category.name }}</div> }</td>
              <td><span class="badge" [class]="t.priority">{{ label(t.priority) }}</span></td>
              <td><span [class.err]="overdue(t)">{{ t.due_date || '—' }}</span></td>
              <td>{{ t.completed_at ? 'Done' : t.progress + '%' }}</td>
              <td class="right"><a class="btn sm" [routerLink]="['/pipelines', t.pipeline_id]" [queryParams]="{ task: t.id }">Open</a></td></tr>
          } @empty { <tr><td colspan="5" class="muted">{{ loading() ? 'Loading…' : 'Nothing here.' }}</td></tr> }
        </tbody></table></div>
    </div>`,
})
export class MyTasks implements OnInit {
  private work = inject(WorkService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  priorities = PRIORITIES; label = priorityLabel;
  tasks = signal<Task[]>([]); loading = signal(true);
  status = signal('open'); priority = signal(''); text = signal('');
  overdue = (t: Task) => isOverdue(t.due_date, t.completed_at);
  shown = computed(() => this.tasks().filter((t) =>
    (this.status() === 'all' || (this.status() === 'done') === !!t.completed_at)
    && (!this.priority() || t.priority === this.priority())
    && (!this.text() || t.title.toLowerCase().includes(this.text().toLowerCase()))));

  async ngOnInit() {
    try { this.tasks.set((await this.work.listTasks({ assigneeId: this.auth.userId()!, limit: 500 })).tasks); }
    catch (e) { this.toast.error(e); } finally { this.loading.set(false); }
  }
}
