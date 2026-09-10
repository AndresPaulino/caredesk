---
status: accepted
---

# The UI is composed from shadcn registry blocks, not a third-party admin template

CareDesk needs a dashboard shell, data tables, forms, charts, and a login page, and the fifteen-hour human budget rewards not designing those from scratch. We considered adopting a community admin template (a v0 "CMS admin dashboard" was proposed) and rejected it: its concepts (posts, post types, CMS roles) would have to be stripped out, its styling reconciled with the shadcn theme already in the repo, and its code lifted out of a v0 workspace with no stated license. Instead every screen starts from an official shadcn registry block or component, added with the CLI (`pnpm dlx shadcn@latest add @shadcn/<name>`), which lands as MIT-licensed source in `src/components` under the base-nova style ticket 01 initialized, and is ours to edit.

## Consequences

- Blocks are a starting point, not a dependency. Once added they are project code, trimmed and renamed to the glossary's terms (resident, unit, facility, staff) before the ticket closes. Nothing called "document", "project", or "user" from a block should survive.
- The shell changes from the ticket 01 top bar to a sidebar block in ticket 02, when real navigation and a signed-in staff member exist.
- Tables use the shadcn data table pattern, forms use the shadcn form component with the same zod schemas the server validates with, charts use the shadcn chart wrapper. No second component library.
- Design effort goes where no block helps: the clinical timeline, the assessment summary, source chips, and the assistant drawer.
