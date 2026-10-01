# Routes

Config-based Angular routing. Auth pages are standalone (no shell); everything else renders inside Shell (sidebar + header).

### `src/app/app.routes.ts`

```ts
import { Routes } from '@angular/router';
import { authGuard, guestGuard, onboardingGuard, roleGuard } from './core/guards/guards';

export const routes: Routes = [
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
      { path: 'pipelines/:id/labels', redirectTo: 'labels' },
      { path: 'pipelines/:id', loadComponent: () => import('./features/pipelines/kanban').then((m) => m.Kanban) },
      { path: 'teams', canActivate: [roleGuard('admin', 'section_head')], loadComponent: () => import('./features/teams/teams').then((m) => m.Teams) },
      { path: 'users', canActivate: [roleGuard('admin')], loadComponent: () => import('./features/users/users').then((m) => m.Users) },
      { path: 'reports', loadComponent: () => import('./features/reports/reports').then((m) => m.Reports) },
      { path: 'activity', loadComponent: () => import('./features/activity/activity').then((m) => m.ActivityPage) },
      { path: 'notifications', loadComponent: () => import('./features/notifications/notifications').then((m) => m.Notifications) },
      { path: 'settings', canActivate: [roleGuard('admin')], loadComponent: () => import('./features/settings/settings').then((m) => m.OrgSettings) },
      { path: 'account', loadComponent: () => import('./features/settings/settings').then((m) => m.Account) },
    ],
  },
  { path: '**', redirectTo: '' },
];
```

## Route summary
| URL | Component | Roles | What it renders |
|---|---|---|---|
| /login /register /forgot-password /reset-password | features/auth/auth.pages.ts | public | Centered card on dark gradient |
| /invite/:token | AcceptInvite | public | Invitation preview + accept |
| /onboarding | features/onboarding/onboarding.ts | new user | Create organization form |
| /dashboard | features/dashboard/dashboard.ts | all | Stat cards + CSS bar charts + filters (admin/head/staff variants) |
| /my-tasks | features/tasks/my-tasks.ts | staff, head | Table of assigned tasks |
| /pipelines | features/pipelines/pipelines.ts | all | Pipelines grouped by team as cards |
| /pipelines/:id | features/pipelines/kanban.ts | all | CORE: Kanban board, task cards, inline chips, stage editor, task dialog |
| /labels | features/pipelines/pipeline-labels.ts | admin, head | Create categories & tags per pipeline (hex colours) |
| /teams | features/teams/teams.ts | admin, head | Team cards with member chips |
| /users | features/users/users.ts | admin | Members table + invitations |
| /reports | features/reports/reports.ts | all | Date-range report builder, preview, export |
| /activity | features/activity/activity.ts | all | Audit log table |
| /notifications | features/notifications/notifications.ts | all | Notification list |
| /settings, /account | features/settings/settings.ts | admin / all | Forms |
