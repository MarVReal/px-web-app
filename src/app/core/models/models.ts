export type Role = 'admin' | 'section_head' | 'staff';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type StageKind = 'backlog' | 'active' | 'review' | 'done';

export interface Profile { id: string; email: string; full_name: string; avatar_url: string | null; telegram_username?: string | null; }

export interface Organization {
  id: string; name: string; logo_url: string | null; description: string | null; industry: string | null;
  timezone: string; reporting_period: string; plan: string; subscription_status: string; created_at: string;
}
export interface Membership { id: string; organization_id: string; user_id: string; role: Role; position_title: string | null; is_active: boolean; }
export interface Member extends Membership { profile: Profile; }

export interface Division { id: string; organization_id: string; name: string; description: string | null; }
export interface Team { id: string; organization_id: string; division_id: string | null; name: string; description: string | null; is_archived: boolean; }
export interface TeamMember { id: string; team_id: string; user_id: string; is_head: boolean; profile?: Profile; }

export interface Invitation {
  id: string; email: string; role: Role; team_id: string | null; position_title: string | null;
  token: string; status: string; expires_at: string; created_at: string;
}

export interface Pipeline { id: string; organization_id: string; team_id: string; name: string; description: string | null; is_archived: boolean; card_layout: { key: string; width: string }[] | null; }
export interface Stage { id: string; pipeline_id: string; name: string; position: number; kind: StageKind; color: string | null; }

export interface Task {
  id: string; organization_id: string; team_id: string; pipeline_id: string; stage_id: string;
  title: string; description: string | null; notes: string | null; priority: Priority; category_id: string | null;
  start_date: string | null; due_date: string | null; estimated_hours: number | null;
  progress: number; position: number; completed_at: string | null; created_by: string | null; created_at: string; last_activity_at: string;
  assignees?: { user_id: string; is_primary: boolean; profile: Profile }[];
  category?: Label | null; tags: Label[]; comment_count?: number; link_count?: number;
}

export interface Comment { id: string; task_id: string; body: string; created_by: string; created_at: string; author?: Profile; }
export interface Activity {
  id: string; user_id: string | null; team_id: string | null; pipeline_id: string | null; task_id: string | null;
  activity_type: string; description: string; previous_value: unknown; new_value: unknown; created_at: string;
  actor?: Profile;
}
export interface AppNotification { id: string; type: string; title: string; body: string | null; task_id: string | null; is_read: boolean; created_at: string; }

export interface ReportSummary {
  period_start: string; total: number; completed: number; in_progress: number; pending: number;
  carried_over: number; delayed: number; completion_rate: number; effort_hours: number;
  tasks: { id: string; title: string; assignees: string | null; status: string; stage: string;
    completed_on: string | null; due_date: string | null; delayed: boolean; carried_over: boolean }[];
}
export interface MonthlyReport {
  id: string; scope: 'individual' | 'team' | 'organization'; team_id: string | null; subject_user_id: string | null;
  period_start: string; period_end: string; status: 'draft' | 'final'; narrative: string | null; summary: ReportSummary | Record<string, never>;
  created_at: string; ai_generated?: boolean; ai_model?: string | null;
}

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', section_head: 'Section Head', staff: 'Staff' };


export interface Label { id: string; pipeline_id?: string; name: string; color: string; position?: number; }
export interface TaskLink { id: string; task_id: string; title: string | null; url: string; created_by: string | null; created_at: string; }

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' },
];
export const priorityLabel = (p: Priority) => PRIORITIES.find((x) => x.value === p)?.label ?? p;
