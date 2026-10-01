import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Activity } from '../../core/models/models';
import { ToastService } from '../../core/services/toast.service';
import { WorkService } from '../../core/services/work.service';

@Component({
  selector: 'px-activity',
  imports: [DatePipe],
  template: `
    <div class="page">
      <div class="page-head"><h1>Activity</h1></div>
      <div class="card flush table-wrap"><table class="tbl">
        <thead><tr><th>When</th><th>Who</th><th>Type</th><th>Description</th></tr></thead>
        <tbody>
          @for (a of items(); track a.id) {
            <tr><td class="small" style="white-space: nowrap">{{ a.created_at | date: 'MMM d, y, h:mm a' }}</td>
              <td>{{ a.actor?.full_name || a.actor?.email || 'System' }}</td>
              <td><span class="badge">{{ a.activity_type.replace('_', ' ') }}</span></td><td>{{ a.description }}</td></tr>
          } @empty { <tr><td colspan="4" class="muted">{{ loading() ? 'Loading…' : 'No activity yet.' }}</td></tr> }
        </tbody></table></div>
      @if (more()) { <div style="text-align:center; margin-top: 14px"><button class="btn" (click)="load()">Load more</button></div> }
    </div>`,
})
export class ActivityPage implements OnInit {
  private work = inject(WorkService);
  private toast = inject(ToastService);
  items = signal<Activity[]>([]); loading = signal(true); more = signal(false);
  private page = 0; private size = 50;

  ngOnInit() { this.load(); }
  async load() {
    try {
      const rows = await this.work.listActivity({ limit: this.size, offset: this.page * this.size });
      this.items.update((l) => [...l, ...rows]); this.page++; this.more.set(rows.length === this.size);
    } catch (e) { this.toast.error(e); } finally { this.loading.set(false); }
  }
}
