import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification } from '../../core/models/models';
import { ToastService } from '../../core/services/toast.service';
import { WorkService } from '../../core/services/work.service';
import { timeAgo } from '../../shared/utils/format';

@Component({
  selector: 'px-notifications',
  template: `
    <div class="page">
      <div class="page-head"><h1>Notifications</h1><span class="spacer"></span>
        <button class="btn" (click)="readAll()" [disabled]="!unread()">Mark all read</button></div>
      <div class="card flush">
        @for (n of items(); track n.id) {
          <div class="n" [class.unread]="!n.is_read" (click)="open(n)">
            <div><b>{{ n.title }}</b><div class="muted">{{ n.body }}</div></div><span class="spacer"></span><span class="muted small">{{ ago(n.created_at) }}</span></div>
        } @empty { <div class="empty">You're all caught up.</div> }
      </div>
    </div>`,
  styles: `.n { display: flex; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; &:hover { background: var(--surface-2); }
    &.unread { background: var(--primary-50); } &:last-child { border: 0; } }`,
})
export class Notifications implements OnInit {
  private work = inject(WorkService);
  private toast = inject(ToastService);
  private router = inject(Router);
  items = signal<AppNotification[]>([]);
  ago = timeAgo;
  unread = () => this.items().some((n) => !n.is_read);

  async ngOnInit() { try { this.items.set(await this.work.listNotifications()); } catch (e) { this.toast.error(e); } }
  async readAll() {
    await this.work.markRead(this.items().filter((n) => !n.is_read).map((n) => n.id));
    this.items.update((l) => l.map((n) => ({ ...n, is_read: true })));
  }
  async open(n: AppNotification) {
    if (!n.is_read) { await this.work.markRead([n.id]); n.is_read = true; }
    if (n.task_id) {
      const t = await this.work.getTask(n.task_id).catch(() => null);
      if (t) this.router.navigate(['/pipelines', t.pipeline_id], { queryParams: { task: t.id } });
    }
  }
}
