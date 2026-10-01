# Project-X Design System

## Product context
Project-X is a multi-tenant project & task management SaaS (organizations → teams → pipelines → tasks) with a monthly/date-range accomplishment-report feature. Roles: Admin (org owner), Section Head (team lead), Staff. Primary workflow: Create Team → Create Pipeline → Create Stages → Create Task → Assign → Drag task → Complete → Generate report.
**The Kanban board is the core product screen** (`/pipelines/:id`). It must feel fast, clear and uncluttered. Cards stay clean; the board must use the full width.

## Visual identity (KEEP — refine, do not replace)
Clean, professional, minimal, business-oriented SaaS dashboard. Not colourful: neutrals + one blue accent. Dark navy sidebar, light grey canvas, white cards.

### Colour tokens (light theme only)
- Canvas `#f5f6f8`; surface/card `#ffffff`; subtle surface `#f9fafb`; border `#e4e7ec`; text `#101828`; muted text `#667085`
- Primary `#2f54eb` (hover `#2443c4`, tint `#eef2ff`)
- Danger `#d92d20` (tint `#fef3f2`), Success `#079455` (tint `#ecfdf3`), Warning `#b54708` (tint `#fffaeb`)
- Sidebar `#101828`, item text `#d0d5dd`, hover/active bg `#1d2939`, active indicator 3px `#84caff` on the left, brand wordmark "PROJECT-X" with the X in `#84caff`
- Kanban column background `#eceff3`; column count pill `#d0d5dd`
- Stage dots: backlog `#98a2b3`, active `#2e90fa`, review `#f79009`, done `#079455`
- Priority chips: Low `#eef0f4`/`#475467`, Medium `#eff8ff`/`#175cd3`, High `#fffaeb`/`#b54708`, Urgent `#f4ebff`/`#6941c6` (purple)
- Category & tag chips: user-chosen hex background (any colour) with automatically chosen dark or white text for contrast
- Overdue chip: `#fef3f2` background, `#d92d20` text

### Typography
Inter (fallback system-ui). Base 14px/1.5. Page title 22px/600, section title 16px, card title 14px/600, meta text 12px muted, chips 11px/600. Use sentence case; no decorative or serif fonts.

### Shape, elevation, spacing
Radius: 10px cards, 8px buttons/inputs, 999px chips/avatars, 14px modals. Shadow: `0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08)`; overlays `0 12px 32px rgba(16,24,40,.18)`. Spacing scale 4/6/8/10/12/16/24px.

## Components
- **Button**: 8px radius, 1px border, 7×14px padding, 14px/550. Variants: default (white), primary (blue fill), danger (red text), ghost, small.
- **Chip/badge**: pill, 11px/600, tinted background. Chips on cards are clickable (open a small popover) when the user may edit.
- **Avatar**: round initials, deterministic hue, 24–28px, white 2px ring; multiple assignees overlap by 8px.
- **Card**: white, 10px radius, soft shadow, 16px padding. **Task card**: title + assignee initials top-right, "Task Created" and "Last Activity" dates (12px muted), chip row (priority, category, tags, overdue), optional progress bar + comment/link counts.
- **Kanban column**: 240–360px wide, flexible, `#eceff3` background, header with stage dot, name, count pill and "+" add-task button; cards stacked with 8px gap; empty column shows a dashed "Drop tasks here" hint. Horizontal scroll when many stages.
- **Board toolbar**: back link "← Pipelines", pipeline title, "✎ Edit stages" and "⚑ Categories & tags" small buttons (Admin/Section Head only), spacer, filters (priority select, assignee select, text filter), primary "+ New task".
- **Modal**: centered, 14px radius, header with title and close, body, right-aligned footer actions; backdrop rgba(16,24,40,.5).
- **Sidebar** (240px): wordmark, organization name, role-based nav list with glyph icons and an unread badge, user footer with avatar, name, role and sign-out.
- **Header**: sticky white bar with global search (tasks, pipelines, teams, users).
- **Toast**: bottom-right dark pill. **Confirm dialog**: small modal with red confirm button.

## Layout & responsiveness
Desktop-first (≥1280px primary), usable on tablet and mobile: sidebar collapses to a slide-in drawer below 860px; page padding 24px → 14px on mobile; Kanban scrolls horizontally.

## Motion
Minimal: drag-and-drop uses 200ms transform; hover states are 1px outline / subtle brightness; no decorative animation.

## Constraints for design generation
Use ONLY the fonts, colours, spacing and component styles above. Keep the dark navy sidebar and blue accent. No gradients (except the auth screens), no extra brand colours, no illustrations. Prioritise clarity, scannability and minimal clicks.
