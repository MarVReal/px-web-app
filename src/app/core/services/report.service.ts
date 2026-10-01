import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { MonthlyReport, ReportSummary } from '../models/models';
import { SupabaseService, unwrap } from './supabase.service';

export interface ReportDoc {
  title: string; organization: string; division?: string; team?: string; subject?: string; period: string;
  summary: ReportSummary; narrative: string;
  sections?: { team: string; summary: ReportSummary; narrative: string }[];
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private sb = inject(SupabaseService).client;
  private auth = inject(AuthService);

  async summary(scope: 'individual' | 'team' | 'organization', from: string, to: string, teamId?: string, userId?: string): Promise<ReportSummary> {
    return unwrap(await this.sb.rpc('report_summary', {
      p_scope: scope, p_team: teamId ?? null, p_user: userId ?? null, p_from: from, p_to: to,
    })) as ReportSummary;
  }

  /** Draft narrative generated from the numbers; the user edits it before finalizing. */
  draftNarrative(label: string, period: string, s: ReportSummary): string {
    const done = s.tasks.filter((t) => t.status === 'completed').map((t) => `• ${t.title}`);
    const lines = [
      `${label} — ${period}: ${s.completed} of ${s.total} tasks completed (${s.completion_rate}%).`,
      `${s.in_progress} in progress, ${s.pending} pending, ${s.carried_over} carried over${s.delayed ? `, ${s.delayed} delayed` : ''}.`,
    ];
    if (done.length) lines.push('', 'Accomplishments:', ...done);
    return lines.join('\n');
  }

  async list(): Promise<MonthlyReport[]> {
    return unwrap(await this.sb.from('monthly_reports').select('*').order('period_start', { ascending: false }).limit(100));
  }

  async save(r: { scope: MonthlyReport['scope']; team_id?: string | null; subject_user_id?: string | null; from: string; to: string;
      narrative: string; summary: ReportSummary; status: 'draft' | 'final' }) {
    const row = unwrap(await this.sb.from('monthly_reports').insert({
      organization_id: this.auth.orgId(), scope: r.scope, team_id: r.team_id ?? null, subject_user_id: r.subject_user_id ?? null,
      period_start: r.from, period_end: r.to, narrative: r.narrative, summary: r.summary, status: r.status,
      finalized_at: r.status === 'final' ? new Date().toISOString() : null,
    }).select('id').single()) as { id: string };
    unwrap(await this.sb.from('monthly_report_items').insert(r.summary.tasks.map((t, i) => ({
      report_id: row.id, task_id: t.id, title: t.title, assignee_name: t.assignees, status: t.status,
      completed_on: t.completed_on, position: i, organization_id: this.auth.orgId(),
    }))));
    return row.id;
  }
}
