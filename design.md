# DESIGN.md — OpenAI Platform–Style Product UI

> **Target:** Build an application UI with extremely close visual and interaction parity to the current OpenAI Platform / developer tooling aesthetic: quiet, utilitarian, precise, minimal, dense-but-readable, and intentionally understated.
>
> This document defines the design rules for the entire product. Treat it as a **hard design contract**, not loose inspiration. When a choice is not covered here, choose the option that is simpler, quieter, and more functional.
>
> Do not use OpenAI logos, trademarks, or imply official affiliation unless the product is actually authorized to do so. The goal is visual-system parity, not brand impersonation.

---

## 1. Design Character

The interface must feel like a serious developer/product platform rather than a generic SaaS dashboard.

Core traits:

- Minimal and work-focused.
- White / near-white surfaces with subtle neutral separation.
- Black or near-black text.
- Muted gray secondary text.
- One strong action color at most; default primary action is near-black.
- Almost no decorative color.
- No gradients.
- No glassmorphism.
- No oversized rounded cards.
- No floating dashboard-card mosaic.
- No decorative illustrations in routine product screens.
- No “AI-looking” purple / blue glow aesthetic.
- No unnecessary badges, pills, icons, or boxed sections.
- No giant hero heading inside product pages.
- No marketing language inside operational screens.

The UI should look calm even when it contains a lot of information.

---

## 2. Product Surface Philosophy

Product screens start with the **actual working surface**.

Preferred hierarchy:

1. Page title / current context
2. Compact supporting description only when useful
3. Primary action or filters
4. Main working content
5. Secondary detail / metadata

Do not add a hero section to an app/dashboard page.

Good product copy:

- `API keys`
- `Usage`
- `Projects`
- `Create project`
- `Last 30 days`
- `No API keys yet`

Bad product copy:

- `Unlock the future of AI`
- `Supercharge your workflow`
- `Everything you need, all in one place`
- Decorative eyebrow labels above every heading

Utility copy wins over marketing copy.

---

## 3. App Shell

### Desktop

Use a restrained application shell:

```text
┌───────────────────────────────────────────────────────────────┐
│ top / organization context                                    │
├──────────────┬────────────────────────────────────────────────┤
│              │                                                │
│ left nav     │ main workspace                                 │
│              │                                                │
│              │                                                │
└──────────────┴────────────────────────────────────────────────┘
```

Recommended dimensions:

- Top chrome: `52–56px`
- Sidebar: `220–248px`
- Main content horizontal padding: `24–32px`
- Main content vertical padding: `24–32px`
- Large readable content max-width: `1120–1280px`
- Detail/settings page readable max-width: `760–960px`

The main workspace should not look like a card floating inside the page. It is the page.

### Mobile

- Sidebar becomes a drawer/sheet.
- Keep the page title and primary action visible without excessive chrome.
- Use `16px` side padding.
- Tables may become horizontally scrollable rather than being redesigned into colorful cards.

---

## 4. Color System

Use neutral UI colors. These are implementation targets chosen to reproduce the OpenAI Platform visual character closely.

```css
:root {
  --background: #ffffff;
  --foreground: #111111;

  --surface: #ffffff;
  --surface-subtle: #f7f7f8;
  --surface-hover: #f3f3f3;
  --surface-active: #ededed;

  --muted: #6b6b6b;
  --muted-foreground: #737373;
  --faint-foreground: #9a9a9a;

  --border: #e5e5e5;
  --border-strong: #d4d4d4;

  --primary: #111111;
  --primary-foreground: #ffffff;
  --primary-hover: #2a2a2a;

  --destructive: #d92d20;
  --destructive-subtle: #fff4f2;

  --success: #198754;
  --warning: #9a6700;

  --focus: #111111;
  --code-bg: #f7f7f8;
}
```

Rules:

- Most screens should visually read as **white + grayscale**.
- Color communicates state, not decoration.
- Do not tint entire sections without a real semantic reason.
- Prefer a subtle border or spacing change before adding another background color.
- Avoid pure `#000` for large text blocks; near-black feels softer.

---

## 5. Typography

### Font family

If an authorized OpenAI Sans license/assets are already available in the project, use them. Otherwise use a clean system stack and do **not** bundle or copy proprietary font assets.

```css
font-family:
  ui-sans-serif,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  Helvetica,
  Arial,
  sans-serif;
```

For code:

```css
font-family:
  ui-monospace,
  SFMono-Regular,
  Menlo,
  Monaco,
  Consolas,
  "Liberation Mono",
  monospace;
```

### Type scale

Keep the scale tight.

| Role | Size | Weight | Line height |
|---|---:|---:|---:|
| Page title | 24–28px | 600 | 1.2 |
| Section title | 16–18px | 600 | 1.35 |
| Body | 14px | 400 | 1.5 |
| Body small | 13px | 400 | 1.45 |
| Label | 13px | 500 | 1.3 |
| Caption / metadata | 12px | 400–500 | 1.4 |
| Button | 13–14px | 500 | 1 |

Rules:

- Do not use huge typography in product UI.
- Avoid excessive bold.
- Letter spacing should normally be `0`.
- Use weight and spacing before adding color.
- Headings should be short and literal.

---

## 6. Spacing

Use a `4px` base grid.

Preferred spacing tokens:

```text
4   micro
8   compact
12  control/internal
16  standard
20  comfortable
24  section-small
32  section
40  section-large
48  rare large separation
```

Common patterns:

- Icon → text: `8px`
- Label → input: `6–8px`
- Title → description: `6–8px`
- Description → first content: `20–24px`
- Form fields: `18–20px`
- Section → section: `32–40px`
- Table cell horizontal padding: `12–16px`

Do not compensate for weak hierarchy by surrounding everything with cards.

---

## 7. Radius

OpenAI-style product UI should feel slightly softened, not bubbly.

```css
--radius-xs: 4px;
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 10px;
```

Usage:

- Button: `6–8px`
- Input/select: `6–8px`
- Menu/popover: `8px`
- Card when truly needed: `8px`
- Dialog: `10–12px` max
- Status pill: `999px` only when the semantic shape is genuinely a pill

Avoid defaulting everything to `12–24px` radius.

---

## 8. Borders and Shadows

Borders do most of the separation work.

Default border:

```css
border: 1px solid var(--border);
```

Shadows should be rare.

Recommended popover shadow:

```css
box-shadow:
  0 1px 2px rgba(0,0,0,.04),
  0 8px 24px rgba(0,0,0,.08);
```

Rules:

- Main page regions: usually no shadow.
- Cards: usually border only.
- Menus/dialogs/popovers: restrained shadow allowed.
- Never create a page made from floating shadowed rectangles.

---

## 9. Navigation

### Sidebar

Sidebar should feel quiet and compact.

Nav item target:

- Height: `32–36px`
- Radius: `6px`
- Horizontal padding: `8–10px`
- Icon: `16px`
- Gap: `8px`
- Label: `13–14px`

States:

```text
default    transparent
hover      #f3f3f3
active     #ededed
text       #444 / #111 when active
```

Do not use a colored vertical bar, bright selected state, or heavy border unless the existing application requires it.

Section labels inside nav may use muted `11–12px` text, but keep them sparse.

### Top context switcher

Organization / project switchers should look like compact text controls rather than giant selectors.

Use chevrons and lightweight menus.

---

## 10. Icons

Use a consistent outline icon library such as **Lucide** when available.

Rules:

- Default size: `16px`
- Large action icons: `18px`
- Stroke weight should remain visually consistent.
- Icons are monochrome by default.
- Use familiar icon-only actions where clear.
- Add tooltips to unfamiliar icon-only controls.
- Do not manually draw SVG icons when a matching library icon exists.
- Do not use icons decoratively beside every heading.

---

## 11. Buttons

Button height:

- Small: `32px`
- Default: `36px`
- Large is rarely needed: `40px`

### Primary

```text
background: near-black
text: white
border: near-black
```

Use for the single most important action in a local context.

Example:

`Create project`

### Secondary

```text
background: white
text: near-black
border: neutral
```

### Ghost

```text
background: transparent
border: transparent
hover: subtle gray
```

### Destructive

Do not make destructive buttons bright red everywhere by default. Prefer neutral button styling until the confirmation step, then use semantic destructive color when needed.

Rules:

- One dominant primary button per action group.
- Avoid pill-shaped buttons.
- Avoid gradient buttons.
- Avoid buttons with marketing copy.
- Avoid oversized CTA buttons on app screens.

---

## 12. Form Controls

### Input

Recommended:

```css
height: 36px;
border: 1px solid var(--border-strong);
border-radius: 6px;
padding: 0 10px;
font-size: 14px;
background: #fff;
```

Focus:

```css
outline: none;
border-color: #a3a3a3;
box-shadow: 0 0 0 2px rgba(17,17,17,.08);
```

Do not use heavy glowing focus rings.

### Labels

- `13px`
- Medium weight
- Above control
- Optional helper text below in muted `12–13px`

### Select / Combobox

Same geometry as input.

Use searchable combobox only when the option count justifies it.

### Textarea

- Same border/radius treatment
- `min-height: 96px`
- Resize vertically unless UX requires fixed size

### Checkbox / Switch

Use familiar controls, not custom pill buttons pretending to be binary toggles.

---

## 13. Tabs and Segmented Views

Tabs should be low-chrome.

Preferred tabs:

```text
Overview   Activity   Settings
────────
```

Use either:

- subtle underline active state, or
- compact muted container when the mode behaves like a segmented control.

Avoid large filled pills for standard navigation tabs.

Tab text: `13–14px`, medium active weight.

---

## 14. Tables

Tables are a first-class UI pattern. Do not convert structured data into cards unless mobile constraints make it necessary.

Style:

- White background
- Minimal horizontal lines
- Small muted header labels
- `40–44px` row height for compact operational data
- `48px` when rows contain secondary metadata
- Hover row: very subtle gray
- Numeric columns right-aligned
- Actions aligned right
- Long identifiers use monospace where appropriate

Example:

```text
Name                Key                      Created        ···
──────────────────────────────────────────────────────────────
Production          sk-...a8f                Sep 18, 2026   ···
Staging             sk-...91b                Sep 10, 2026   ···
```

Do not place borders around every cell.

---

## 15. Cards

Default rule: **do not use a card unless the boundary is meaningful**.

Good reasons for a card:

- A repeated interactive item
- A contained setup flow
- A tool surface
- Billing/payment instrument
- A grouped object whose boundary matters

Bad reasons:

- “It looks empty without cards”
- Wrapping every section
- Wrapping a heading and two lines of text
- Creating a 3-column dashboard mosaic for unrelated metrics

When a card is needed:

```css
border: 1px solid var(--border);
border-radius: 8px;
background: #fff;
padding: 16px;
box-shadow: none;
```

---

## 16. Settings Pages

Settings pages should feel especially close to OpenAI Platform.

Recommended structure:

```text
Page title
Description

Section title
Short explanation
[ control / rows ]

-----------------

Section title
Short explanation
[ control / rows ]
```

Prefer rows divided by borders over a collection of large cards.

A settings row can be:

```text
Label                         [value/control]
Short supporting description
```

Use destructive areas only at the bottom of a page/section.

---

## 17. Detail / Inspector Panels

For developer tools, prompts, logs, request details, or API objects, a split layout is preferred when useful:

```text
main list/editor        inspector/detail
```

Inspector width:

- `320–420px`

Separate with a subtle left border rather than a heavy floating card.

Use sticky inspector headers only if the content is long.

---

## 18. Code Blocks and Technical Data

Code is functional content, not decoration.

Code block:

```css
background: var(--code-bg);
border: 1px solid var(--border);
border-radius: 8px;
font-size: 12.5–13px;
line-height: 1.6;
```

Include copy action in the top-right only when useful.

JSON viewers:

- Monospace
- Neutral syntax highlighting
- Avoid neon colors
- Allow collapse for large structures

IDs, hashes, API keys, and paths can use monospace inline.

---

## 19. Badges and Status

Use badges sparingly.

Good:

- `Active`
- `Failed`
- `Pending`
- `Deprecated`

Bad:

- `Powerful`
- `New` on half the interface
- Category pills everywhere

Status badge:

- Height: `20–24px`
- Font: `11–12px`
- Subtle semantic background
- Do not oversaturate

---

## 20. Dropdowns / Menus / Popovers

Recommended:

- Width based on content, usually `180–260px`
- Padding: `4–6px`
- Item height: `32–36px`
- Radius: `8px`
- Border + restrained shadow
- Icon optional at `16px`

Menu item hover should be a light gray block.

Destructive menu item may use red text only when necessary.

---

## 21. Dialogs

Dialogs should be compact and task-focused.

Recommended width:

- Confirmation: `400–480px`
- Form dialog: `480–640px`

Structure:

```text
Title
Short explanation

Content / fields

                  Cancel   Primary action
```

No decorative icon circles unless the semantic warning genuinely benefits from one.

Do not put every workflow in a modal. Use a page for complex tasks.

---

## 22. Empty States

Empty states should be understated.

Preferred:

```text
No API keys yet
Create an API key to authenticate requests from this project.
[ Create API key ]
```

Avoid:

- giant illustration
- oversized icon bubble
- motivational copy
- huge empty-state card

A small monochrome icon is acceptable when it genuinely improves recognition.

---

## 23. Loading States

Prefer stability over spectacle.

Use:

- lightweight skeletons for known structured content
- small spinner for local button operations
- preserve layout dimensions during loading
- optimistic state only when failure handling is clear

Do not animate entire screens unnecessarily.

---

## 24. Error States

Error messages should be specific and actionable.

Inline field error:

```text
Project name is required.
```

Request failure:

```text
Couldn’t load usage data. Try again.
```

Use destructive color only for the message/indicator, not a huge red surface.

Technical details may be expandable.

---

## 25. Toasts

Use toasts for transient action feedback, not important content.

Examples:

- `API key copied`
- `Project updated`
- `Member removed`

Keep them small and neutral.

Do not display a toast for every background state change.

---

## 26. Charts / Usage Screens

Charts must look analytical, not decorative.

Rules:

- White or transparent plot background
- Thin neutral axes/grid lines
- Few series colors
- Compact legend
- Labels in muted gray
- No gradients under every line
- No 3D charts
- No oversized chart cards

Usage/billing layouts can use metric values at the top followed by the actual graph/table.

Do not create a dozen KPI tiles if 2–4 metrics plus a chart communicates the data better.

---

## 27. Motion

Motion should be almost invisible.

Default durations:

```text
hover/focus: 100–150ms
popover/menu: 120–180ms
sheet/dialog: 160–220ms
```

Use `ease-out` for entrances.

Animate opacity and small transforms only when it improves continuity.

No bouncing.
No glowing.
No ornamental looping animation.

Respect `prefers-reduced-motion`.

---

## 28. Responsive Behavior

Desktop-first developer surfaces must still work cleanly on mobile.

Rules:

- Collapse nav to drawer.
- Preserve information hierarchy.
- Tables may scroll horizontally.
- Stack header action groups when required.
- Do not make controls tiny to force a desktop layout onto mobile.
- Maintain at least ~`44px` touch targets for standalone mobile actions when practical.
- No text overlap or clipped labels.

---

## 29. Accessibility

Required:

- WCAG AA contrast minimum.
- Visible keyboard focus.
- Semantic HTML.
- Labels for all form controls.
- `aria-label` for icon-only controls.
- Tooltips for unfamiliar icons.
- Keyboard-operable menus/dialogs/comboboxes.
- Correct dialog focus trap and return focus.
- Never rely only on color for status.

---

## 30. shadcn/ui Mapping

If the project uses shadcn/ui, keep the primitives but restyle them to this system.

Recommended primitives:

- `Button`
- `Input`
- `Textarea`
- `Select`
- `Combobox`
- `Checkbox`
- `Switch`
- `Tabs`
- `Table`
- `Dialog`
- `Sheet`
- `DropdownMenu`
- `Popover`
- `Tooltip`
- `Command`
- `AlertDialog`
- `Separator`
- `Skeleton`
- `Sonner`

Avoid blindly using default shadcn visual styling if it creates too much radius, too many cards, or generic SaaS appearance.

---

## 31. Tailwind Token Direction

Recommended semantic mapping:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--surface);
  --color-card-foreground: var(--foreground);
  --color-popover: var(--surface);
  --color-popover-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--surface-subtle);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-input: var(--border-strong);
  --color-ring: var(--focus);
}
```

Prefer semantic tokens over hardcoded colors inside components.

---

## 32. Page Templates

### A. List Page

```text
[Page title]                         [Primary action]
Supporting description if needed

[Search] [Filter] [secondary action]

Table / object list
```

### B. Detail Page

```text
← Back

Object name                          [Actions]
Metadata / status

Tabs
────────────────────────────────────────
Working content
```

### C. Settings Page

```text
Settings
Manage configuration for this project.

General
Description
[settings rows]

────────────────────────────────────────
Limits
Description
[settings rows]
```

### D. Playground / Tool Page

```text
navigation | main editor/workspace | optional inspector
```

The tool itself should dominate the viewport.

---

## 33. Interaction Rules

Every interactive component must have:

- default
- hover
- focus-visible
- active/pressed when applicable
- disabled
- loading when async
- success/error response when applicable

Do not leave visual states undefined.

Prefer predictable interaction over clever interaction.

---

## 34. Content Rules

Use short, direct copy.

Preferred:

- `Save`
- `Cancel`
- `Delete project`
- `Create API key`
- `Copy`
- `View logs`
- `No results`

Avoid:

- `Let's get started!`
- `Awesome!`
- `Supercharge`
- `Unlock`
- `Magic`
- `AI-powered` unless necessary for factual clarity

Sentence case everywhere.

Do not title-case every button or heading.

---

## 35. Anti-AI-Slop Rules

These are hard bans unless explicitly requested:

- No purple gradients.
- No neon glow.
- No gradient borders.
- No glass panels.
- No giant radius cards.
- No random icon bubbles.
- No generic four-card KPI grid by default.
- No hero banner inside dashboard/app pages.
- No fake testimonials.
- No decorative sparkles.
- No excessive pills.
- No “modern SaaS” marketing composition inside product UI.
- No fake data when real data/state exists.
- No excessive whitespace that reduces operational density.
- No redundant description of obvious controls.
- No custom illustrations just to fill empty space.
- No ornamental motion.

If the UI feels generated from a generic template, simplify it.

---

## 36. Fidelity Rules for Coding Agents

When implementing a screen:

1. Study the existing application before changing layout or components.
2. Reuse existing primitives before introducing new ones.
3. Match spacing, font sizing, radius, borders, and density across pages.
4. Use shared tokens; do not invent per-page colors.
5. Keep business logic and visual styling separated.
6. Do not redesign flows that were not requested.
7. Do not create fake/mock product features merely to make the screen look full.
8. Preserve responsiveness and keyboard accessibility.
9. Use Lucide icons when an equivalent icon exists.
10. Before finishing, compare the screen against this document and remove anything that feels decorative rather than functional.

---

## 37. Visual QA Checklist

Before considering a page complete, verify:

- [ ] Does the page feel quiet and professional at first glance?
- [ ] Is white/neutral space doing more work than decorative containers?
- [ ] Is there only one clear primary action per action group?
- [ ] Are cards used only where boundaries matter?
- [ ] Are radii `8px` or less for normal product surfaces?
- [ ] Are borders subtle and shadows rare?
- [ ] Are headings compact rather than oversized?
- [ ] Are icons monochrome and consistent?
- [ ] Is copy short and operational?
- [ ] Are tables used for tabular data?
- [ ] Are form controls compact and aligned?
- [ ] Is the active nav state subtle gray rather than colorful?
- [ ] Are loading, empty, disabled, error, and success states handled?
- [ ] Does the layout remain stable while data loads?
- [ ] Does mobile preserve hierarchy without turning everything into cards?
- [ ] Is there zero unnecessary gradient/glow/glass decoration?
- [ ] Does the result look like a mature developer platform rather than a generated SaaS template?

---

## 38. Final Design Test

When unsure between two visual solutions, choose the one with:

- fewer containers,
- fewer colors,
- smaller radius,
- less shadow,
- clearer typography,
- more consistent alignment,
- denser but readable information,
- more direct wording,
- less decoration,
- stronger functional hierarchy.

The intended result is a UI that feels almost invisible around the work: precise, trustworthy, fast to scan, and highly polished.

---

## Reference Direction

This design contract is based on the publicly visible OpenAI developer/platform aesthetic and OpenAI's published frontend/UI guidance: restrained app surfaces, utility-first copy, system-level typography and colors, minimal chrome, accessible components, compact radii, and cards only where they create meaningful interaction boundaries.
