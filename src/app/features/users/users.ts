import { Component, OnInit, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { Invitation, Member, Role, ROLE_LABEL, Team } from '../../core/models/models';
import { ConfirmService } from '../../core/services/confirm.service';
import { OrgService } from '../../core/services/org.service';
import { ToastService } from '../../core/services/toast.service';
import { Avatar } from '../../shared/components/avatar';
import { Modal } from '../../shared/components/modal';

@Component({
  selector: 'px-users',
  imports: [Modal, Avatar],
  template: `
    <div class="page">
      <div class="page-head"><h1>Users</h1><span class="spacer"></span><button class="btn primary" (click)="show.set(true)">+ Invite user</button></div>
      <div class="card flush table-wrap"><table class="tbl">
        <thead><tr><th>User</th><th>Role</th><th>Position</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (m of members(); track m.id) {
            <tr><td><div class="row"><px-avatar [name]="m.profile.full_name || m.profile.email" [size]="30" />
              <div>{{ m.profile.full_name }}<div class="muted small">{{ m.profile.email }}</div></div></div></td>
              <td><select style="width: auto" [value]="m.role" [disabled]="m.user_id === auth.userId()" (change)="setRole(m, $any($event.target).value)">
                @for (r of roles; track r) { <option [value]="r" [selected]="r === m.role">{{ label[r] }}</option> }</select></td>
              <td>{{ m.position_title || '—' }}</td>
              <td><span class="badge" [class.ok]="m.is_active" [class.bad]="!m.is_active">{{ m.is_active ? 'Active' : 'Deactivated' }}</span></td>
              <td class="right">@if (m.user_id !== auth.userId()) {
                <button class="btn sm" (click)="toggleActive(m)">{{ m.is_active ? 'Deactivate' : 'Reactivate' }}</button> }</td></tr>
          }</tbody></table></div>

      <h2 style="margin: 24px 0 10px">Pending invitations</h2>
      <div class="card flush table-wrap"><table class="tbl">
        <thead><tr><th>Email</th><th>Role</th><th>Expires</th><th></th></tr></thead>
        <tbody>
          @for (i of invites(); track i.id) {
            <tr><td>{{ i.email }}</td><td>{{ label[i.role] }}</td><td>{{ i.expires_at.slice(0, 10) }}</td>
              <td class="right"><button class="btn sm" (click)="copy(i.token)">Copy link</button> <button class="btn sm danger" (click)="revoke(i)">Revoke</button></td></tr>
          } @empty { <tr><td colspan="4" class="muted">No pending invitations.</td></tr> }</tbody></table></div>
    </div>

    @if (show()) {
      <px-modal title="Invite user" (closed)="closeInvite()">
        @if (link()) {
          <div class="modal-body stack"><div class="alert ok">Invitation created. Share this single-use link with the invitee (it expires in 7 days):</div>
            <input readonly [value]="link()" (focus)="$any($event.target).select()" />
            <button class="btn" (click)="copyLink()">Copy link</button></div>
        } @else {
          <div class="modal-body stack">
            <label class="field">Email<input type="email" [value]="email()" (input)="email.set($any($event.target).value)" /></label>
            <label class="field">Role<select [value]="role()" (change)="role.set($any($event.target).value)">
              @for (r of roles; track r) { <option [value]="r" [selected]="r === role()">{{ label[r] }}</option> }</select></label>
            <label class="field">Team<select [value]="teamId()" (change)="teamId.set($any($event.target).value)">
              <option value="" [selected]="!teamId()">— None —</option>@for (t of teams(); track t.id) { <option [value]="t.id" [selected]="t.id === teamId()">{{ t.name }}</option> }</select></label>
            <label class="field">Position / title (optional)<input [value]="position()" (input)="position.set($any($event.target).value)" /></label>
          </div>
          <div class="modal-foot"><button class="btn" (click)="closeInvite()">Cancel</button>
            <button class="btn primary" (click)="invite()" [disabled]="!email().includes('@')">Create invitation</button></div>
        }
      </px-modal>
    }`,
})
export class Users implements OnInit {
  protected auth = inject(AuthService);
  private org = inject(OrgService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  roles: Role[] = ['admin', 'section_head', 'staff'];
  label = ROLE_LABEL;
  members = signal<Member[]>([]); invites = signal<Invitation[]>([]); teams = signal<Team[]>([]);
  show = signal(false); link = signal('');
  email = signal(''); role = signal<Role>('staff'); teamId = signal(''); position = signal('');

  ngOnInit() { this.load(); }
  async load() {
    try {
      const [m, i, t] = await Promise.all([this.org.listMembers(), this.org.listInvitations(), this.org.listTeams()]);
      this.members.set(m); this.invites.set(i); this.teams.set(t);
    } catch (e) { this.toast.error(e); }
  }

  async setRole(m: Member, role: Role) {
    try { await this.org.updateMember(m.id, { role }); this.toast.success('Role updated'); } catch (e) { this.toast.error(e); }
    await this.load();
  }
  async toggleActive(m: Member) {
    if (m.is_active && !(await this.confirm.ask(`Deactivate ${m.profile.full_name || m.profile.email}? They will lose access.`, 'Deactivate'))) return;
    try { await this.org.updateMember(m.id, { is_active: !m.is_active }); await this.load(); } catch (e) { this.toast.error(e); }
  }
  async invite() {
    try {
      const inv = await this.org.invite({ email: this.email(), role: this.role(), team_id: this.teamId() || null, position_title: this.position() || null });
      this.link.set(this.url(inv.token)); await this.load();
    } catch (e) { this.toast.error(e); }
  }
  async revoke(i: Invitation) { try { await this.org.revokeInvitation(i.id); await this.load(); } catch (e) { this.toast.error(e); } }
  url(token: string) { return `${window.location.origin}/invite/${token}`; }
  async copy(token: string) { await navigator.clipboard.writeText(this.url(token)); this.toast.success('Link copied'); }
  async copyLink() { await navigator.clipboard.writeText(this.link()); this.toast.success('Link copied'); }
  closeInvite() { this.show.set(false); this.link.set(''); this.email.set(''); this.position.set(''); }
}
