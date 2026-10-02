import { Injectable, inject } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { AuthService } from '../auth/auth.service';
import { MonthlyReport, ReportSummary } from '../models/models';
import { SupabaseService, unwrap } from './supabase.service';

export interface ReportDoc {
  title: string; organization: string; division?: string; team?: string; subject?: string; period: string;
  summary: ReportSummary; narrative: string;
  sections?: { team: string; summary: ReportSummary; narrative: string }[];
}

/** What the generate-report Edge Function accepts. */
export interface AiReportRequest {
  scope: 'individual' | 'team' | 'organization'; from: string; to: string;
  team_id?: string; team_ids?: string[]; user_id?: string;
  group_by: 'category' | 'none'; categories?: string[];
}
/** What it returns: an overview plus one section per category (individual, team) or per team (organization). */
export interface AiReportResult {
  empty: boolean; overview: string; sections: { key: string; title: string; narrative: string }[];
  task_count: number; omitted: number; model: string | null; message?: string;
}

/** Turns a failed Edge Function call into a sentence a person can act on. */
async function functionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    if (error.context.status === 401) return 'Your session has expired. Please sign in again.';
    try {
      const body = await error.context.json();
      if (body?.message) return String(body.message);
    } catch { /* not JSON */ }
    return 'The AI request failed. Try again.';
  }
  return 'Could not reach the AI service. Check your connection and try again.';
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private sb = inject(SupabaseService).client;
  private auth = inject(AuthService);

  async summary(scope: 'individual' | 'team' | 'organization', from: string, to: string, teamId?: string, userId?: string): Promise<ReportSummary> {
    return unwrap(await this.sb.rpc('report_summary', {
      // `||` rather than `??`: an unset dropdown is '' and the database cannot read '' as an id.
      p_scope: scope, p_team: teamId || null, p_user: userId || null, p_from: from, p_to: to,
    })) as ReportSummary;
  }

  /**
   * Draft narrative generated from the numbers; the user edits it before finalizing. Written in the first person
   * ("I" for an individual report, "we" for a section or the organization) and without due dates.
   */
  draftNarrative(period: string, s: ReportSummary, plural = false): string {
    const who = plural ? 'We' : 'I', be = plural ? 'are' : 'am';
    const titles = (status: string) => s.tasks.filter((t) => t.status === status).map((t) => `• ${t.title}`);
    const extra = [s.carried_over ? `${s.carried_over} carried over from an earlier period` : '', s.delayed ? `${s.delayed} delayed` : ''].filter(Boolean);
    const lines = [
      `${who} completed ${s.completed} of ${s.total} tasks in ${period} (${s.completion_rate}%).`
        + ` ${who} ${be} still working on ${s.in_progress} and have yet to start ${s.pending}${extra.length ? `, with ${extra.join(' and ')}` : ''}.`,
    ];
    const blocks: [string, string[]][] = [[`${who} completed the following:`, titles('completed')],
      [`${who} ${be} currently working on:`, titles('in_progress')], [`${who} have yet to start:`, titles('pending')]];
    for (const [heading, list] of blocks) if (list.length) lines.push('', heading, ...list);
    return lines.join('\n');
  }

  /** Asks Gemini (through the Edge Function, so the API key never reaches the browser) to write the narrative. */
  async aiNarrative(req: AiReportRequest): Promise<AiReportResult> {
    const { data, error } = await this.sb.functions.invoke('generate-report', { body: req });
    if (error) throw new Error(await functionErrorMessage(error));
    return data as AiReportResult;
  }

  /** Category names across the pipelines the user can see, for the "separate by category" choices. */
  async categoryNames(): Promise<string[]> {
    const rows = unwrap(await this.sb.from('pipeline_categories').select('name').order('name')) as { name: string }[];
    const seen = new Map<string, string>();
    for (const r of rows) if (!seen.has(r.name.toLowerCase())) seen.set(r.name.toLowerCase(), r.name);
    return [...seen.values()];
  }

  async list(): Promise<MonthlyReport[]> {
    return unwrap(await this.sb.from('monthly_reports').select('*').order('period_start', { ascending: false }).limit(100));
  }

  async save(r: { scope: MonthlyReport['scope']; team_id?: string | null; subject_user_id?: string | null; from: string; to: string;
      narrative: string; summary: ReportSummary; status: 'draft' | 'final'; ai_generated?: boolean; ai_model?: string | null }) {
    const row = unwrap(await this.sb.from('monthly_reports').insert({
      organization_id: this.auth.orgId(), scope: r.scope, team_id: r.team_id ?? null, subject_user_id: r.subject_user_id ?? null,
      period_start: r.from, period_end: r.to, narrative: r.narrative, summary: r.summary, status: r.status,
      ai_generated: r.ai_generated ?? false, ai_model: r.ai_generated ? r.ai_model ?? null : null,
      finalized_at: r.status === 'final' ? new Date().toISOString() : null,
    }).select('id').single()) as { id: string };
    unwrap(await this.sb.from('monthly_report_items').insert(r.summary.tasks.map((t, i) => ({
      report_id: row.id, task_id: t.id, title: t.title, assignee_name: t.assignees, status: t.status,
      completed_on: t.completed_on, position: i, organization_id: this.auth.orgId(),
    }))));
    return row.id;
  }
}
