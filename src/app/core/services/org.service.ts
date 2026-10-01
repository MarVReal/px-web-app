import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { Division, Invitation, Member, Organization, Role, Team, TeamMember } from '../models/models';
import { SupabaseService, unwrap } from './supabase.service';

/** Organization, divisions, teams, members and invitations. */
@Injectable({ providedIn: 'root' })
export class OrgService {
  private sb = inject(SupabaseService).client;
  private auth = inject(AuthService);

  // ----- organization -----
  async updateOrganization(patch: Partial<Organization>) {
    unwrap(await this.sb.from('organizations').update(patch).eq('id', this.auth.orgId()!));
    await this.auth.loadContext();
  }
  async getSettings() {
    return unwrap(await this.sb.from('organization_settings').select('*').eq('organization_id', this.auth.orgId()!).single()) as unknown as
      { section_heads_can_create_pipelines: boolean; ai_reports_enabled: boolean } | null;
  }
  async updateSettings(patch: Record<string, unknown>) {
    unwrap(await this.sb.from('organization_settings').update(patch).eq('organization_id', this.auth.orgId()!));
  }

  // ----- divisions -----
  async listDivisions(): Promise<Division[]> {
    return unwrap(await this.sb.from('divisions').select('*').order('name'));
  }
  async createDivision(name: string, description?: string) {
    unwrap(await this.sb.from('divisions').insert({ organization_id: this.auth.orgId(), name, description }));
  }
  async deleteDivision(id: string) { unwrap(await this.sb.from('divisions').delete().eq('id', id)); }

  // ----- teams -----
  async listTeams(includeArchived = false): Promise<Team[]> {
    let q = this.sb.from('teams').select('*').order('name');
    if (!includeArchived) q = q.eq('is_archived', false);
    return unwrap(await q);
  }
  async createTeam(t: { name: string; description?: string | null; division_id?: string | null }) {
    unwrap(await this.sb.from('teams').insert({ ...t, organization_id: this.auth.orgId() }));
  }
  async updateTeam(id: string, patch: Partial<Team>) { unwrap(await this.sb.from('teams').update(patch).eq('id', id)); }

  async listTeamMembers(teamId?: string): Promise<TeamMember[]> {
    let q = this.sb.from('team_members').select('id, team_id, user_id, is_head, profile:profiles!team_members_user_id_fkey(id,email,full_name,avatar_url)');
    if (teamId) q = q.eq('team_id', teamId);
    return unwrap(await q) as unknown as TeamMember[];
  }
  async addTeamMember(teamId: string, userId: string, isHead = false) {
    unwrap(await this.sb.from('team_members').insert({ team_id: teamId, user_id: userId, is_head: isHead }));
  }
  async removeTeamMember(id: string) { unwrap(await this.sb.from('team_members').delete().eq('id', id)); }
  async setTeamHead(teamId: string, userId: string) {
    // demote others, promote the chosen member (must already be on the team)
    unwrap(await this.sb.from('team_members').update({ is_head: false }).eq('team_id', teamId));
    unwrap(await this.sb.from('team_members').update({ is_head: true }).eq('team_id', teamId).eq('user_id', userId));
  }

  // ----- members -----
  async listMembers(): Promise<Member[]> {
    return unwrap(await this.sb.from('organization_members')
      .select('*, profile:profiles!organization_members_user_id_fkey(id,email,full_name,avatar_url,telegram_username)').order('created_at')) as unknown as Member[];
  }
  async updateMember(id: string, patch: { role?: Role; position_title?: string | null; is_active?: boolean }) {
    unwrap(await this.sb.from('organization_members').update(patch).eq('id', id));
  }

  // ----- invitations -----
  async listInvitations(): Promise<Invitation[]> {
    return unwrap(await this.sb.from('invitations').select('*').eq('status', 'pending').order('created_at', { ascending: false }));
  }
  async invite(i: { email: string; role: Role; team_id?: string | null; division_id?: string | null; position_title?: string | null }) {
    return unwrap(await this.sb.from('invitations')
      .insert({ ...i, email: i.email.trim().toLowerCase(), organization_id: this.auth.orgId() }).select().single()) as Invitation;
  }
  async revokeInvitation(id: string) { unwrap(await this.sb.from('invitations').update({ status: 'revoked' }).eq('id', id)); }
  async previewInvitation(token: string) {
    return unwrap(await this.sb.rpc('get_invitation_preview', { p_token: token })) as
      { email: string; role: Role; organization_name: string; team_name: string | null; valid: boolean } | null;
  }
}
