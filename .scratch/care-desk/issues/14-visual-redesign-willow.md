# 14: Visual redesign, "Willow"

**What to build:** CareDesk stops looking like an unstyled shadcn starter and reads as a clinical tool for Willowbrook Care. The whole signed-in frame, the login page, the dashboard, the resident list, and the resident page are redesigned around one rule: the screen is calm by default, and colour appears only where a nurse has something to do. No feature, query, or permission changes; the same data, laid out for a shift.

**Blocked by:** none (every feature ticket through 12 is done). Ticket 13's screenshots should be taken after this one.

**Status:** ready-for-human

**UI approach:** shadcn components stay (ADR 0004); this ticket changes their tokens and composes new clinical patterns from them. See ADR 0005 for the colour rules.

## Design plan

**Subject.** An elder-care operations desk used on shift by nurses (their own units) and admins (every facility). Its job is to show what needs doing now, and to keep a resident's safety facts in view while their record is open.

**Colour.** Brand from the operator's name: willow green and brook water.

| Token | Hex | Role |
|---|---|---|
| Willow 900 | `#1F3A34` | Sidebar, brand panel on login |
| Willow 600 | `#2F6B5E` | Primary actions, links, focus ring, first chart series |
| Brook 50 | `#F4F7F6` | Page background (cool, never cream) |
| Ink | `#1B2421` | Text |
| Line | `#DCE3E0` | Borders and dividers |

Status colours are reserved for things that need action: **critical** `#B42318` (overdue, allergy conflict, out of range) and **attention** `#A15C00` on `#FDF3E1` (due today or soon). "Up to date" and zero counts are muted text with a small check, never a coloured badge.

Resident **flags** use the US standardized wristband colours, which staff already know: **red** allergy, **yellow** fall risk, **purple** DNR (any code status other than full code). A flag always carries its word; colour is never the only signal.

**Type.** Atkinson Hyperlegible Next (Braille Institute, designed for low-vision readers) for all text, tabular figures for times, counts, and vitals. Replaces Geist. Monospace only for the demo password.

**Principles.**
1. Exceptions first. Anything that needs action sorts to the top and carries colour; everything else goes quiet.
2. Safety facts never scroll away. Code status and allergies sit in a sticky resident banner.
3. One bold element: the wristband flags. Everything around them is plain.
4. Structure is information. Cards only where content is a separate thing; facts that belong together share one surface.

## Layouts

Shell: willow sidebar with a shift card; header gains an "Ask the assistant" button.

```
┌──────────────┬───────────────────────────────────────────────────┐
│ ◆ CareDesk   │ Demonstration only… (slim note)                    │
│ Willowbrook  ├───────────────────────────────────────────────────┤
│              │ ☰ │ Residents › Harold Doe        [✦ Ask assistant] │
│ ┌──────────┐ │                                                    │
│ │Day shift │ │                                                    │
│ │▮▮▮▮▯▯ 3h │ │                                                    │
│ │Meadows A,B│ │                                                   │
│ └──────────┘ │                                                    │
│ ▣ Dashboard  │                                                    │
│ ▣ Residents  │                                                    │
│ ✦ Assistant  │                                                    │
│      ⋮       │                                                    │
│ (MA) Maria   │                                                    │
└──────────────┴───────────────────────────────────────────────────┘
```

Dashboard as a shift board: tiles with something to act on come first and carry status colour; zero tiles collapse into one "all clear" line; census moves into the occupancy card.

```
Good morning, Maria
Day shift, 7:00 AM to 3:00 PM. Unit A and Unit B at Willowbrook Meadows.

┌ Needs attention ─────────────────────────────┐ ┌ Activity ● Live ─┐
│ ┌───────────────┐ ┌──────────┐ ┌──────────┐  │ │                   │
│ │ 70 overdue    │ │ 30       │ │ 5        │  │ │                   │
│ │ doses         │ │ overdue  │ │ appts    │  │ │                   │
│ │ 69 due shift  │ │ assessm. │ │ 4 today  │  │ │                   │
│ └───────────────┘ └──────────┘ └──────────┘  │ │                   │
│ ✓ All clear: out-of-range vitals, incidents   │ │                   │
└──────────────────────────────────────────────┘ │                   │
┌ Census 76 of 80 beds, 95% ───────────────────┐ │                   │
│ Unit A ██████████████████▒  38 of 40          │ │                   │
└──────────────────────────────────────────────┘ └───────────────────┘
```

Resident page: a sticky banner replaces the title and the four fact cards; timeline and assessments keep their split; tabs become an underlined strip.

```
┌──────────────────────────────────────────────────────────────────┐
│ (HD) Harold Doe                               [Edit details] [✦ Ask]│
│      84, male. Room 104, Unit A, Willowbrook Meadows               │
│      [DNR] [Allergy: Penicillin V] [Fall risk]                     │
├──────────────────────────────────────────────────────────────────┤
│ Born May 17, 1942 │ Admitted Jul 19, 2025 │ Diet Diabetic │ Walker  │
└──────────────────────────────────────────────────────────────────┘
[allergy conflict alert, when there is one]
┌ Clinical timeline ─────────────────┐ ┌ Assessments  1 overdue ────┐
│                                     │ │ Podiatry     Overdue 47 d │
│                                     │ │ Physician    ✓ Nov 12     │
└─────────────────────────────────────┘ └───────────────────────────┘
Conditions 4 │ Medications 6 │ Vitals … (underline tabs)
```

Resident list: initials, flags column, facility column only for an admin.

```
Resident              Room  Unit    Flags                  Age  Admitted
(SA) Auer, Shelby     107   Unit A  [Allergy] [Fall risk]   80  Nov 18, 2025
```

Login: split screen, willow brand panel on the left (what CareDesk is, the three roles), sign-in and demo accounts on the right; stacks on a phone.

## Acceptance

- [x] Tokens: willow palette, status and flag colours in `globals.css`; charts use willow and a neutral; every text/background pair used passes WCAG AA
- [x] Atkinson Hyperlegible Next replaces Geist; tabular figures on counts, times, vitals
- [x] Shell: willow sidebar, shift card with time left and scope, "Ask the assistant" in the header
- [x] Dashboard: needs-attention tiles first with status colour, zero tiles in an all-clear line, census in the occupancy card
- [x] Resident flags derived in `src/lib/clinical/flags.ts` with tests: allergy (any active allergy), fall risk (latest fall-risk Morse score of 45 or more, or a fall incident in the last 30 days), DNR (code status other than full code)
- [x] Resident page: sticky banner with flags and code status, facts strip, quiet "up to date" assessments, underline tabs
- [x] Resident list: initials, flags column, facility column hidden for a nurse
- [x] Login: split brand panel
- [x] Assistant drawer, sheets, dialogs, toasts pick up the tokens with no leftover greyscale
- [x] Screenshots at 1440 and 400 px before and after; no horizontal overflow at 400 px; visible keyboard focus
- [x] `pnpm check` and `pnpm test:e2e` green

## Comments

2026-09-23: Built in one pass. `pnpm check` green (262 tests, including five new flag tests) and `pnpm test:e2e` green. Checked by screenshot at 1440 and 400 px: login, dashboard, resident list, Harold Doe with the vitals tab, the assistant drawer; no horizontal overflow at 400 px. Chart series are willow `#1f8466`, brook blue `#3b6fd4`, ochre `#9a7a14`, passing the dataviz palette validator. The dashboard greeting is now "Good morning/afternoon/evening" (the smoke test matches it). The dark tokens in `globals.css` are untouched and unused: no theme toggle exists.

2026-09-23: At Andres's request the assistant's entry point is now a bubble fixed to the bottom right of every signed-in page (`src/components/assistant/assistant-bubble.tsx`), labelled "Ask about <first name>" on a resident's page and "Ask the assistant" elsewhere, icon-only on a phone, hidden while the drawer is open. It replaces the header button and the banner's "Ask about" button; the sidebar entry stays. Toasts sit above it, and page content has bottom padding so the bubble never covers the last row. Lint, typecheck, format, and the smoke test are green.
