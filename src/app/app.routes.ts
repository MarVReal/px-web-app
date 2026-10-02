import { Routes } from '@angular/router';
import { authGuard, guestGuard, landingGuard, onboardingGuard, roleGuard } from './core/guards/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [landingGuard], loadComponent: () => import('./features/landing/landing').then((m) => m.Landing) },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/auth.pages').then((m) => m.Login) },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./features/auth/auth.pages').then((m) => m.Register) },
  { path: 'forgot-password', loadComponent: () => import('./features/auth/auth.pages').then((m) => m.ForgotPassword) },
  { path: 'reset-password', loadComponent: () => import('./features/auth/auth.pages').then((m) => m.ResetPassword) },
  { path: 'invite/:token', loadComponent: () => import('./features/auth/auth.pages').then((m) => m.AcceptInvite) },
  { path: 'onboarding', canActivate: [onboardingGuard], loadComponent: () => import('./features/onboarding/onboarding').then((m) => m.Onboarding) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard) },
      { path: 'my-tasks', loadComponent: () => import('./features/tasks/my-tasks').then((m) => m.MyTasks) },
      { path: 'pipelines', loadComponent: () => import('./features/pipelines/pipelines').then((m) => m.Pipelines) },
      { path: 'labels', canActivate: [roleGuard('admin', 'section_head')], loadComponent: () => import('./features/pipelines/pipeline-labels').then((m) => m.PipelineLabels) },
      { path: 'card-designer', canActivate: [roleGuard('admin', 'section_head')], loadComponent: () => import('./features/pipelines/card-designer').then((m) => m.CardDesigner) },
      { path: 'pipelines/:id/labels', redirectTo: 'labels' },
      { path: 'pipelines/:id', loadComponent: () => import('./features/pipelines/kanban').then((m) => m.Kanban) },
      { path: 'sections', canActivate: [roleGuard('admin', 'section_head')], loadComponent: () => import('./features/teams/teams').then((m) => m.Teams) },
      { path: 'teams', redirectTo: 'sections' }, // old name, kept so existing links and bookmarks still work
      { path: 'users', canActivate: [roleGuard('admin')], loadComponent: () => import('./features/users/users').then((m) => m.Users) },
      { path: 'reports', loadComponent: () => import('./features/reports/reports').then((m) => m.Reports) },
      { path: 'activity', loadComponent: () => import('./features/activity/activity').then((m) => m.ActivityPage) },
      { path: 'notifications', redirectTo: 'dashboard' }, // notifications now live in the bell in the top bar
      { path: 'settings', canActivate: [roleGuard('admin')], loadComponent: () => import('./features/settings/settings').then((m) => m.OrgSettings) },
      { path: 'account', loadComponent: () => import('./features/settings/settings').then((m) => m.Account) },
    ],
  },
  { path: '**', redirectTo: '' },
];
