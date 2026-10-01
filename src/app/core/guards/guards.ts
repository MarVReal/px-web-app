import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { Role } from '../models/models';

/** Requires a signed-in user who belongs to an organization. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService), router = inject(Router);
  await auth.init();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  if (!auth.membership()) return router.createUrlTree(['/onboarding']);
  return true;
};

/** Landing page: visitors see it, signed-in users go straight into the app. */
export const landingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService), router = inject(Router);
  await auth.init();
  if (!auth.isAuthenticated()) return true;
  return router.createUrlTree([auth.membership() ? '/dashboard' : '/onboarding']);
};

/** Login/register pages: bounce signed-in users into the app. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService), router = inject(Router);
  await auth.init();
  return auth.isAuthenticated() ? router.createUrlTree(['/']) : true;
};

/** Onboarding: signed-in users without an organization yet. */
export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService), router = inject(Router);
  await auth.init();
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  return auth.membership() ? router.createUrlTree(['/']) : true;
};

/** UX-level route restriction by role. Real enforcement is RLS in Postgres. */
export const roleGuard = (...roles: Role[]): CanActivateFn => async () => {
  const auth = inject(AuthService), router = inject(Router);
  await auth.init();
  const r = auth.role();
  return r && roles.includes(r) ? true : router.createUrlTree(['/']);
};

export const permissionGuard = (permission: string): CanActivateFn => async () => {
  const auth = inject(AuthService), router = inject(Router);
  await auth.init();
  return auth.can(permission) ? true : router.createUrlTree(['/']);
};
