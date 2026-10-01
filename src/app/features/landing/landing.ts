import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

type TabKey = 'organize' | 'plan' | 'deliver' | 'report';

const PAGE_TITLE = 'Project-X | Task boards and accomplishment reports for teams';
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Figtree:wght@500;600;700;800&display=swap';

@Component({
  selector: 'px-landing',
  imports: [RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing {
  private doc = inject(DOCUMENT);

  readonly year = new Date().getFullYear();
  readonly tabs: { key: TabKey; label: string }[] = [
    { key: 'organize', label: 'Organize' },
    { key: 'plan', label: 'Plan' },
    { key: 'deliver', label: 'Deliver' },
    { key: 'report', label: 'Report' },
  ];
  readonly active = signal<TabKey>('organize');

  constructor() {
    const title = inject(Title);
    const previous = title.getTitle();
    title.setTitle(PAGE_TITLE);
    inject(Meta).updateTag({
      name: 'description',
      content: 'Project-X is a task board for teams and section heads. Assign tasks, drag them to done and export the accomplishment report as PDF, Excel or CSV.',
    });
    inject(DestroyRef).onDestroy(() => title.setTitle(previous));
    this.loadFont();
  }

  /** Scrolls to a section without touching the URL, so the route guard does not run again. */
  go(ev: Event, id: string) {
    ev.preventDefault();
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.doc.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  /** Arrow keys, Home and End move between tabs, as in the WAI-ARIA tabs pattern. */
  onTabKey(ev: KeyboardEvent, index: number) {
    const last = this.tabs.length - 1;
    const next = ev.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : ev.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : ev.key === 'Home' ? 0
      : ev.key === 'End' ? last : -1;
    if (next < 0) return;
    ev.preventDefault();
    this.active.set(this.tabs[next].key);
    this.doc.getElementById('lp-tab-' + this.tabs[next].key)?.focus();
  }

  /** Only the landing page uses Figtree, so it is requested here rather than for the whole app. */
  private loadFont() {
    if (this.doc.getElementById('px-landing-font')) return;
    const link = this.doc.createElement('link');
    link.id = 'px-landing-font';
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    this.doc.head.appendChild(link);
  }
}
