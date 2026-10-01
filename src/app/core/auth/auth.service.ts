import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Membership, Organization, Profile, Role } from '../models/models';
import { SupabaseService, unwrap } from '../services/supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private sb = inject(SupabaseService).client;
  private router = inject(Router);

  readonly userId = signal<string | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly membership = signal<Membership | null>(null);
  readonly organization = signal<Organization | null>(null);
  readonly permissions = signal<Set<string>>(new Set());
  readonly ready = signal(false);

  readonly role = computed<Role | null>(() => this.membership()?.role ?? null);
  readonly orgId = computed(() => this.organization()?.id ?? null);
  readonly isAdmin = computed(() => this.role() === 'admin');
  readonly isHead = computed(() => this.role() === 'section_head');
  readonly isAuthenticated = computed(() => !!this.userId());

  private initPromise?: Promise<void>;

  /** Restores the session and loads org/role. Safe to call repeatedly. */
  init(): Promise<void> {
    this.initPromise ??= (async () => {
      const { data } = await this.sb.auth.getSession();
      this.userId.set(data.session?.user.id ?? null);
      this.sb.auth.onAuthStateChange((event, session) => {
        const id = session?.user.id ?? null;
        if (id !== this.userId()) {
          this.userId.set(id);
          if (id) setTimeout(() => this.loadContext()); // avoid awaiting inside the auth callback
          else this.clear();
        }
        if (event === 'PASSWORD_RECOVERY') this.router.navigateByUrl('/reset-password');
      });
      if (this.userId()) await this.loadContext();
      this.ready.set(true);
    })();
    return this.initPromise;
  }

  /** Loads profile, active membership (first org) and its permissions. */
  async loadContext(): Promise<void> {
    const uid = this.userId();
    if (!uid) return;
    const profile = await this.sb.from('profiles').select('*').eq('id', uid).maybeSingle();
    this.profile.set(profile.data as Profile | null);
    const m = await this.sb.from('organization_members').select('*').eq('user_id', uid).eq('is_active', true)
      .order('created_at').limit(1).maybeSingle();
    this.membership.set((m.data as Membership) ?? null);
    if (m.data) {
      const org = await this.sb.from('organizations').select('*').eq('id', m.data.organization_id).single();
      this.organization.set(org.data as Organization);
      const perms = await this.sb.from('role_permissions').select('permission_key').eq('role', m.data.role);
      this.permissions.set(new Set((perms.data ?? []).map((p: { permission_key: string }) => p.permission_key)));
    } else {
      this.organization.set(null);
      this.permissions.set(new Set());
    }
  }

  can(permission: string): boolean { return this.permissions().has(permission); }

  async signUp(email: string, password: string, fullName: string) {
    const res = await this.sb.auth.signUp({
      email, password, options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin + '/login' },
    });
    if (res.error) throw new Error(res.error.message);
    return res.data; // session is null until the email is verified
  }

  async signIn(email: string, password: string) {
    const res = await this.sb.auth.signInWithPassword({ email, password });
    if (res.error) throw new Error(res.error.message);
    this.userId.set(res.data.user.id);
    await this.loadContext();
  }

  async sendPasswordReset(email: string) {
    const res = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' });
    if (res.error) throw new Error(res.error.message);
  }

  async updatePassword(password: string) {
    const res = await this.sb.auth.updateUser({ password });
    if (res.error) throw new Error(res.error.message);
  }

  async signOut() {
    await this.sb.auth.signOut();
    this.clear();
    await this.router.navigateByUrl('/login');
  }

  async createOrganization(name: string, description?: string, industry?: string, timezone?: string) {
    const id = unwrap(await this.sb.rpc('create_organization', {
      p_name: name, p_description: description ?? null, p_industry: industry ?? null, p_timezone: timezone ?? 'UTC',
    }));
    await this.loadContext();
    return id as string;
  }

  async acceptInvitation(token: string) {
    unwrap(await this.sb.rpc('accept_invitation', { p_token: token }));
    await this.loadContext();
  }

  private clear() {
    this.userId.set(null); this.profile.set(null); this.membership.set(null);
    this.organization.set(null); this.permissions.set(new Set());
  }
}
