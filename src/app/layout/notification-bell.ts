import { Component, DestroyRef, OnInit, inject, output, signal } from '@angular/core';
import { AppNotification } from '../core/models/models';
import { ToastService } from '../core/services/toast.service';
import { WorkService } from '../core/services/work.service';
import { timeAgo } from '../shared/utils/format';

/** Bell in the top bar: unread badge, a dropdown of recent notifications, and click-through to the task as an overlay. */
@Component({
  selector: 'px-notification-bell',
  template: `
    <div class="bell-wrap">
      <button type="button" class="bell" (click)="toggle()" [attr.aria-expanded]="open()" aria-haspopup="true"
        [attr.aria-label]="unread() ? 'Notifications, ' + unread() + ' unread' : 'Notifications'" title="Notifications">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        @if (unread() > 0) { <span class="count">{{ unread() > 99 ? '99+' : unread() }}</span> }
      </button>
      @if (open()) {
        <div class="backdrop" (click)="open.set(false)"></div>
        <div class="panel" role="dialog" aria-label="Notifications">
          <div class="head"><b>Notifications</b><span class="spacer"></span>
            <button type="button" class="link" (click)="readAll()" [disabled]="!hasUnread()">Mark all read</button></div>
          <div class="list">
            @if (loading()) { <div class="empty muted">Loading…</div> }
            @else {
              @for (n of items(); track n.id) {
                <button type="button" class="n" [class.unread]="!n.is_read" (click)="pick(n)">
                  <span class="dot" aria-hidden="true"></span>
                  <span class="txt"><b>{{ n.title }}</b>@if (n.body) { <span class="body">{{ n.body }}</span> }</span>
                  <span class="when">{{ ago(n.created_at) }}</span>
                </button>
              } @empty { <div class="empty muted">You're all caught up.</div> }
            }
          </div>
        </div>
      }
    </div>`,
  styles: `
    :host { margin-left: auto; display: flex; align-items: center; }
    .bell-wrap { position: relative; }
    .bell { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 50%;
      border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; &:hover { background: var(--surface-2); } }
    .count { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--danger); color: #fff;
      font-size: 11px; font-weight: 600; line-height: 18px; text-align: center; box-shadow: 0 0 0 2px var(--surface); }
    .backdrop { position: fixed; inset: 0; z-index: 40; }
    .panel { position: absolute; right: 0; top: calc(100% + 8px); z-index: 50; width: 380px; max-width: calc(100vw - 24px); background: var(--surface);
      border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow-lg); overflow: hidden; }
    .head { display: flex; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--border); }
    .link { border: 0; background: none; padding: 0; font: inherit; font-size: 13px; color: var(--primary); cursor: pointer; &:disabled { color: var(--muted); cursor: default; } }
    .list { max-height: min(70vh, 460px); overflow-y: auto; }
    .n { display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 11px 14px; border: 0; border-bottom: 1px solid var(--border); background: none; text-align: left;
      font: inherit; color: var(--text); cursor: pointer; &:hover { background: var(--surface-2); } &:last-child { border-bottom: 0; } &.unread { background: var(--primary-50); } }
    .dot { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: transparent; .unread & { background: var(--primary); } }
    .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .body { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
    .when { flex: none; color: var(--muted); font-size: 12px; margin-top: 2px; }
    .empty { padding: 28px 14px; text-align: center; }`,
})
export class NotificationBell implements OnInit {
  private work = inject(WorkService);
  private toast = inject(ToastService);
  private destroy = inject(DestroyRef);

  /** Emitted with the task id when a notification about a task is clicked; the shell shows it as an overlay. */
  openTask = output<string>();

  open = signal(false); loading = signal(false);
  items = signal<AppNotification[]>([]); unread = signal(0);
  ago = timeAgo;
  hasUnread = () => this.items().some((n) => !n.is_read);

  ngOnInit() {
    this.refreshCount();
    const off = this.work.subscribeNotifications(() => { this.refreshCount(); if (this.open()) this.load(false); });
    this.destroy.onDestroy(off);
  }

  private refreshCount() { this.work.unreadCount().then((n) => this.unread.set(n)).catch(() => undefined); }
  private async load(showSpinner = true) {
    if (showSpinner) this.loading.set(true);
    try { this.items.set(await this.work.listNotifications(30)); } catch (e) { this.toast.error(e); } finally { this.loading.set(false); }
  }

  toggle() { const next = !this.open(); this.open.set(next); if (next) this.load(); }

  async readAll() {
    const ids = this.items().filter((n) => !n.is_read).map((n) => n.id);
    try {
      await this.work.markRead(ids);
      this.items.update((l) => l.map((n) => ({ ...n, is_read: true })));
      this.refreshCount();
    } catch (e) { this.toast.error(e); }
  }

  async pick(n: AppNotification) {
    this.open.set(false);
    if (!n.is_read) {
      this.items.update((l) => l.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      this.unread.update((c) => Math.max(0, c - 1));
      this.work.markRead([n.id]).catch(() => this.refreshCount());
    }
    if (n.task_id) this.openTask.emit(n.task_id);
  }
}
