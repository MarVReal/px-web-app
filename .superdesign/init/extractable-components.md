# Extractable components

## Sidebar
- Source: `src/app/layout/shell.ts` (the `<aside class="sidebar">` block)
- Category: layout
- Description: Dark role-based navigation with brand, org name, nav links, unread badge and user footer
- Extractable props: activeItem (string, default: "dashboard"), unreadCount (number, default: 0)
- Hardcoded: brand wordmark, nav labels/glyph icons, colours, user footer layout

## Header
- Source: `src/app/layout/shell.ts` (the `<header>` block)
- Category: layout
- Description: Sticky top bar with mobile menu button and global search box
- Extractable props: none
- Hardcoded: placeholder text, styles

## Avatar
- Source: `src/app/shared/components/avatar.ts`
- Category: basic
- Description: Round initials avatar with deterministic colour
- Extractable props: name (string), size (number, default: 26)
- Hardcoded: hash-to-hue colouring, border

## Modal
- Source: `src/app/shared/components/modal.ts`
- Category: basic
- Description: Centered dialog with header, close button, body/footer slots
- Extractable props: title (string), wide (boolean, default: false)
- Hardcoded: layout, backdrop
