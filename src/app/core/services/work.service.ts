import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Activity, AppNotification, Comment, Label, Pipeline, Priority, Stage, StageKind, Task, TaskLink } from '../models/models';
import { SupabaseService, unwrap } from './supabase.service';

export interface TaskFilter {
  pipelineId?: string; teamId?: string; assigneeId?: string; priority?: Priority; stageId?: string;
  dueBefore?: string; dueAfter?: string; createdAfter?: string; search?: string;
  overdue?: boolean; open?: boolean; limit?: number; offset?: number;
}

export interface TaskInput {
  pipeline_id: string; stage_id: string; title: string; description?: string | null; notes?: string | null;
  priority: Priority; category_id?: string | null; start_date?: string | null; due_date?: string | null;
  estimated_hours?: number | null; position?: number;
}

export interface DashRow {
  id: string; team_id: string; pipeline_id: string; due_date: string | null; completed_at: string | null; created_at: string;
  priority: Priority; stage: { name: string; kind: StageKind }; assignees: { user_id: string }[];
}

const TASK_SELECT = '*, category:pipeline_categories(id,name,color), task_tags(tag:pipeline_tags(id,name,color)), ' +
  'assignees:task_assignees(user_id,is_primary,profile:profiles!task_assignees_user_id_fkey(id,email,full_name,avatar_url)), ' +
  'comments:task_comments(count), links:task_links(count)';

type RawTask = Omit<Task, 'tags'> & { task_tags?: { tag: Label }[]; comments?: { count: number }[]; links?: { count: number }[] };
const shape = (t: RawTask): Task => {
  const { task_tags, comments, links, ...rest } = t;
  return { ...rest, tags: (task_tags ?? []).map((x) => x.tag).filter(Boolean), comment_count: comments?.[0]?.count ?? 0, link_count: links?.[0]?.count ?? 0 };
};

/** Pipelines, stages, tasks, comments, activity, notifications. */
@Injectable({ providedIn: 'root' })
export class WorkService {
  private sb = inject(SupabaseService).client;
  private auth = inject(AuthService);

  // ----- pipelines & stages -----
  async listPipelines(teamId?: string): Promise<Pipeline[]> {
    let q = this.sb.from('pipelines').select('*').eq('is_archived', false).order('name');
    if (teamId) q = q.eq('team_id', teamId);
    return unwrap(await q);
  }
  async getPipeline(id: string): Promise<Pipeline> { return unwrap(await this.sb.from('pipelines').select('*').eq('id', id).single()); }

  async createPipeline(p: { team_id: string; name: string; description?: string; stages?: { name: string; kind: StageKind }[] }) {
    const pipe = unwrap(await this.sb.from('pipelines')
      .insert({ team_id: p.team_id, name: p.name, description: p.description ?? null, organization_id: this.auth.orgId() })
      .select().single()) as Pipeline;
    const stages = p.stages ?? [
      { name: 'Backlog', kind: 'backlog' }, { name: 'Planning', kind: 'active' }, { name: 'In Progress', kind: 'active' },
      { name: 'For Review', kind: 'review' }, { name: 'Completed', kind: 'done' }];
    unwrap(await this.sb.from('pipeline_stages').insert(
      stages.map((s, i) => ({ pipeline_id: pipe.id, name: s.name, kind: s.kind, position: i, organization_id: pipe.organization_id }))));
    return pipe;
  }
  async updatePipeline(id: string, patch: Partial<Pipeline>) { unwrap(await this.sb.from('pipelines').update(patch).eq('id', id)); }

  async listStages(pipelineId: string): Promise<Stage[]> {
    return unwrap(await this.sb.from('pipeline_stages').select('*').eq('pipeline_id', pipelineId).order('position'));
  }
  async addStage(pipelineId: string, name: string, kind: StageKind, position: number) {
    unwrap(await this.sb.from('pipeline_stages').insert({ pipeline_id: pipelineId, name, kind, position, organization_id: this.auth.orgId() }));
  }
  async updateStage(id: string, patch: Partial<Stage>) { unwrap(await this.sb.from('pipeline_stages').update(patch).eq('id', id)); }
  async deleteStage(id: string) { unwrap(await this.sb.from('pipeline_stages').delete().eq('id', id)); }

  // ----- tasks -----
  async listTasks(f: TaskFilter = {}): Promise<{ tasks: Task[]; total: number }> {
    const needInner = !!f.assigneeId;
    const select = needInner ? TASK_SELECT.replace('assignees:task_assignees(', 'assignees:task_assignees!inner(') : TASK_SELECT;
    let q = this.sb.from('tasks').select(select, { count: 'exact' });
    if (f.pipelineId) q = q.eq('pipeline_id', f.pipelineId);
    if (f.teamId) q = q.eq('team_id', f.teamId);
    if (f.assigneeId) q = q.eq('assignees.user_id', f.assigneeId);
    if (f.priority) q = q.eq('priority', f.priority);
    if (f.stageId) q = q.eq('stage_id', f.stageId);
    if (f.dueBefore) q = q.lte('due_date', f.dueBefore);
    if (f.dueAfter) q = q.gte('due_date', f.dueAfter);
    if (f.createdAfter) q = q.gte('created_at', f.createdAfter);
    if (f.open) q = q.is('completed_at', null);
    if (f.overdue) q = q.is('completed_at', null).lt('due_date', new Date().toISOString().slice(0, 10));
    if (f.search) q = q.ilike('title', `%${f.search.replace(/[%,]/g, ' ')}%`);
    const limit = f.limit ?? 200, offset = f.offset ?? 0;
    const res = await q.order('position').range(offset, offset + limit - 1);
    if (res.error) throw new Error(res.error.message);
    return { tasks: (res.data as unknown as RawTask[]).map(shape), total: res.count ?? 0 };
  }

  /** Lightweight rows for dashboard aggregation (RLS scopes to what the caller may see). */
  async dashboardRows(): Promise<DashRow[]> {
    const res = await this.sb.from('tasks')
      .select('id,team_id,pipeline_id,due_date,completed_at,created_at,priority,stage:pipeline_stages(name,kind),assignees:task_assignees(user_id)')
      .order('created_at', { ascending: false }).limit(5000);
    if (res.error) throw new Error(res.error.message);
    return res.data as unknown as DashRow[];
  }

  async getTask(id: string): Promise<Task> {
    return shape(unwrap(await this.sb.from('tasks').select(TASK_SELECT).eq('id', id).single()) as unknown as RawTask);
  }

  async createTask(input: TaskInput, assigneeIds: string[], tagIds: string[] = []): Promise<string> {
    const row = unwrap(await this.sb.from('tasks').insert(input).select('id').single()) as { id: string };
    if (assigneeIds.length) {
      unwrap(await this.sb.from('task_assignees').insert(assigneeIds.map((u, i) => ({ task_id: row.id, user_id: u, is_primary: i === 0 }))));
    }
    if (tagIds.length) unwrap(await this.sb.from('task_tags').insert(tagIds.map((t) => ({ task_id: row.id, tag_id: t }))));
    return row.id;
  }

  async updateTask(id: string, patch: Partial<TaskInput> & { progress?: number }) {
    unwrap(await this.sb.from('tasks').update(patch).eq('id', id));
  }

  /** Reconciles assignees to exactly `userIds` (first = primary). */
  async setAssignees(taskId: string, userIds: string[]) {
    const current = unwrap(await this.sb.from('task_assignees').select('user_id').eq('task_id', taskId)) as { user_id: string }[];
    const have = new Set(current.map((c) => c.user_id)), want = new Set(userIds);
    const remove = [...have].filter((u) => !want.has(u)), add = userIds.filter((u) => !have.has(u));
    if (remove.length) unwrap(await this.sb.from('task_assignees').delete().eq('task_id', taskId).in('user_id', remove));
    if (add.length) unwrap(await this.sb.from('task_assignees').insert(add.map((u) => ({ task_id: taskId, user_id: u }))));
  }

  async moveTask(taskId: string, stageId: string, position: number) {
    unwrap(await this.sb.rpc('move_task', { p_task: taskId, p_stage: stageId, p_position: position }));
  }
  async deleteTask(id: string) { unwrap(await this.sb.from('tasks').delete().eq('id', id)); }

  // ----- comments -----
  async listComments(taskId: string): Promise<Comment[]> {
    const rows = unwrap(await this.sb.from('task_comments')
      .select('*, author:profiles!task_comments_created_by_fkey(id,email,full_name,avatar_url)')
      .eq('task_id', taskId).order('created_at')) as unknown as Comment[];
    return rows;
  }
  async addComment(taskId: string, body: string, mentions: string[] = []) {
    unwrap(await this.sb.from('task_comments').insert({ task_id: taskId, body, mentions, created_by: this.auth.userId() }));
  }

  // ----- links -----
  async listLinks(taskId: string): Promise<TaskLink[]> {
    return unwrap(await this.sb.from('task_links').select('*').eq('task_id', taskId).order('created_at'));
  }
  async addLink(taskId: string, url: string, title: string) {
    unwrap(await this.sb.from('task_links').insert({ task_id: taskId, url: url.trim(), title: title.trim() || null, created_by: this.auth.userId() }));
  }
  async deleteLink(id: string) { unwrap(await this.sb.from('task_links').delete().eq('id', id)); }

  // ----- per-pipeline categories & tags -----
  async listLabels(kind: 'categories' | 'tags', pipelineId: string): Promise<Label[]> {
    return unwrap(await this.sb.from(kind === 'categories' ? 'pipeline_categories' : 'pipeline_tags')
      .select('id,pipeline_id,name,color,position').eq('pipeline_id', pipelineId).order('position').order('name'));
  }
  async addLabel(kind: 'categories' | 'tags', pipelineId: string, name: string, color: string, position: number): Promise<Label> {
    return unwrap(await this.sb.from(kind === 'categories' ? 'pipeline_categories' : 'pipeline_tags')
      .insert({ pipeline_id: pipelineId, name: name.trim(), color, position, organization_id: this.auth.orgId() })
      .select('id,pipeline_id,name,color,position').single()) as Label;
  }
  async updateLabel(kind: 'categories' | 'tags', id: string, patch: { name?: string; color?: string }) {
    unwrap(await this.sb.from(kind === 'categories' ? 'pipeline_categories' : 'pipeline_tags').update(patch).eq('id', id));
  }
  async deleteLabel(kind: 'categories' | 'tags', id: string) {
    unwrap(await this.sb.from(kind === 'categories' ? 'pipeline_categories' : 'pipeline_tags').delete().eq('id', id));
  }
  /** Persists a new dropdown order; `rows` holds only the labels whose position changed. */
  async setLabelPositions(kind: 'categories' | 'tags', rows: { id: string; position: number }[]) {
    const table = kind === 'categories' ? 'pipeline_categories' : 'pipeline_tags';
    await Promise.all(rows.map(async (r) => unwrap(await this.sb.from(table).update({ position: r.position }).eq('id', r.id))));
  }
  /** How many tasks use each category and tag of a pipeline. Paged because a response is capped at 1,000 rows. */
  async labelUsage(pipelineId: string): Promise<{ categories: Record<string, number>; tags: Record<string, number> }> {
    const categories: Record<string, number> = {}, tags: Record<string, number> = {};
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const rows = unwrap(await this.sb.from('tasks').select('category_id, task_tags(tag_id)').eq('pipeline_id', pipelineId)
        .order('id').range(from, from + PAGE - 1)) as unknown as { category_id: string | null; task_tags: { tag_id: string }[] | null }[];
      for (const r of rows) {
        if (r.category_id) categories[r.category_id] = (categories[r.category_id] ?? 0) + 1;
        for (const t of r.task_tags ?? []) tags[t.tag_id] = (tags[t.tag_id] ?? 0) + 1;
      }
      if (rows.length < PAGE) break;
    }
    return { categories, tags };
  }
  /** Reconciles a task's tags to exactly `tagIds`. */
  async setTaskTags(taskId: string, tagIds: string[]) {
    const cur = unwrap(await this.sb.from('task_tags').select('tag_id').eq('task_id', taskId)) as { tag_id: string }[];
    const have = new Set(cur.map((c) => c.tag_id)), want = new Set(tagIds);
    const remove = [...have].filter((t) => !want.has(t)), add = tagIds.filter((t) => !have.has(t));
    if (remove.length) unwrap(await this.sb.from('task_tags').delete().eq('task_id', taskId).in('tag_id', remove));
    if (add.length) unwrap(await this.sb.from('task_tags').insert(add.map((t) => ({ task_id: taskId, tag_id: t }))));
  }

  // ----- activity -----
  async listActivity(f: { taskId?: string; teamId?: string; userId?: string; limit?: number; offset?: number } = {}): Promise<Activity[]> {
    let q = this.sb.from('task_activity_logs')
      .select('*, actor:profiles!task_activity_logs_user_id_fkey(id,email,full_name,avatar_url)').order('created_at', { ascending: false });
    if (f.taskId) q = q.eq('task_id', f.taskId);
    if (f.teamId) q = q.eq('team_id', f.teamId);
    if (f.userId) q = q.eq('user_id', f.userId);
    const limit = f.limit ?? 50, offset = f.offset ?? 0;
    return unwrap(await q.range(offset, offset + limit - 1)) as unknown as Activity[];
  }

  // ----- notifications -----
  async listNotifications(limit = 50): Promise<AppNotification[]> {
    return unwrap(await this.sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit));
  }
  async markRead(ids: string[]) { if (ids.length) unwrap(await this.sb.from('notifications').update({ is_read: true }).in('id', ids)); }
  async unreadCount(): Promise<number> {
    const r = await this.sb.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false);
    return r.count ?? 0;
  }
  subscribeNotifications(onChange: () => void) {
    const ch = this.sb.channel('notif-' + this.auth.userId())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${this.auth.userId()}` }, onChange)
      .subscribe();
    return () => { this.sb.removeChannel(ch); };
  }
  subscribePipeline(pipelineId: string, onChange: () => void) {
    const ch = this.sb.channel('pipe-' + pipelineId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `pipeline_id=eq.${pipelineId}` }, onChange)
      .subscribe();
    return () => { this.sb.removeChannel(ch); };
  }

  // ----- global search -----
  async search(term: string) {
    const like = `%${term.replace(/[%,]/g, ' ')}%`;
    const [tasks, pipelines, teams, users] = await Promise.all([
      this.sb.from('tasks').select('id,title,pipeline_id').ilike('title', like).limit(6),
      this.sb.from('pipelines').select('id,name').ilike('name', like).limit(4),
      this.sb.from('teams').select('id,name').ilike('name', like).limit(4),
      this.sb.from('profiles').select('id,full_name,email').or(`full_name.ilike.${like},email.ilike.${like}`).limit(4),
    ]);
    return {
      tasks: (tasks.data ?? []) as { id: string; title: string; pipeline_id: string }[],
      pipelines: (pipelines.data ?? []) as { id: string; name: string }[],
      teams: (teams.data ?? []) as { id: string; name: string }[],
      users: (users.data ?? []) as { id: string; full_name: string; email: string }[],
    };
  }
}
