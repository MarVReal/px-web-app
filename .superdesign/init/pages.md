# Page dependency trees (Angular: component = one .ts file with inline template + styles)

## /pipelines/:id  (Kanban — core product screen)
Entry: src/app/features/pipelines/kanban.ts
- src/app/layout/shell.ts (sidebar + header)
- src/app/shared/components/avatar.ts
- src/app/shared/components/modal.ts
- src/app/shared/utils/format.ts, label-colors.ts
- src/app/features/tasks/task-dialog.ts (task create/detail modal: fields, tags, assignees, tabs Comments/Links/Activity)
  - avatar.ts, modal.ts
- src/styles.scss

## /dashboard
Entry: src/app/features/dashboard/dashboard.ts
- layout/shell.ts, styles.scss

## /reports
Entry: src/app/features/reports/reports.ts
- layout/shell.ts, styles.scss

## /labels
Entry: src/app/features/pipelines/pipeline-labels.ts
- layout/shell.ts, shared/utils/label-colors.ts, styles.scss

## /pipelines, /teams, /users, /my-tasks, /activity, /notifications, /settings
Entries: features/pipelines/pipelines.ts, features/teams/teams.ts, features/users/users.ts, features/tasks/my-tasks.ts, features/activity/activity.ts, features/notifications/notifications.ts, features/settings/settings.ts
- layout/shell.ts, shared/components/avatar.ts + modal.ts (where modals/avatars used), styles.scss

## /login /register (auth pages)
Entry: src/app/features/auth/auth.pages.ts — standalone, no shell, dark gradient background + white card.
