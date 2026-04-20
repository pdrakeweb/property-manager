# UI Design System — Property Manager

**Scope:** This document is the authoritative catalog of the app's visual primitives. It defines the tokens, component classes, and the rules that govern how new UI is built. Together with `src/index.css` it is the single source of truth for the visual layer. It is the output of **Phase A — Design System Consolidation** from `ARCHITECTURAL-REWRITE-PLAN.md`.

**Location of canonical source:** `src/index.css`. This document describes what lives there.

---

## Guiding principles

1. **Prefer a component class over inline Tailwind.** If three screens reach for the same color/padding/border combination, that's a class. Inline utilities are for one-off layout — flex/gap/grid/spacing — not for colors or interactive states.
2. **Dark mode is implicit.** All component classes in this system bake in their `dark:` variants. Screens should not need to write `dark:bg-slate-800` on a card; they should write `card-surface`.
3. **Semantic names over color names.** `btn-primary` not `btn-green`; `badge-soft-warning` not `badge-soft-amber`. Buttons and badges should express intent, not hue, so a future theme refactor only touches the class definition.
4. **One obvious class per situation.** We don't ship `btn-secondary` and `btn-alt` — only one. If you find yourself asking "which of these should I use?", the catalog has failed; open an issue.
5. **Extend before you add.** If an existing class is 90% right, widen it via a modifier class (`.btn-sm`, `.chip-interactive`) rather than forking a new variant.

---

## Tokens

CSS variables in `src/index.css` (under `@layer base`) hold the palette. Light values live in `:root`; dark overrides live in `:root.dark`. They are referenced directly for the app background; component classes below use Tailwind `dark:` variants rather than the tokens directly, because `@apply` composes better with Tailwind utilities than with `rgb(var(...))`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--app-bg` | `#f8f7f4` | `#0f1117` | Page background |
| `--surface` | white | slate-800 | Cards, modals |
| `--surface-raised` | white | slate-800 | Raised panels |
| `--surface-muted` | slate-50 | slate-700 | Muted fills, table headers |
| `--surface-input` | white | slate-700 | Form inputs |
| `--ink-primary` | slate-900 | slate-100 | Body text |
| `--ink-secondary` | slate-800 | slate-200 | Headings |
| `--ink-muted` | slate-500 | slate-400 | Labels, captions |
| `--ink-subtle` | slate-400 | slate-500 | Placeholders, decorative |
| `--ink-inverse` | white | slate-900 | Text on solid buttons |
| `--border-default` | slate-200 | slate-700 | Card borders, dividers |
| `--border-strong` | slate-300 | slate-600 | Emphasis borders |
| `--border-subtle` | slate-100 | slate-700 | Internal dividers |
| `--accent-brand` | green-600 | green-600 | Primary actions |
| `--accent-danger` | red-600 | red-600 | Destructive actions |
| `--accent-success` | green-600 | green-600 | Success state |
| `--accent-warning` | amber-600 | amber-600 | Warning state |
| `--accent-info` | sky-600 | sky-600 | Informational state |

> **Note:** Phase A did not introduce token-backed Tailwind colors (e.g. `bg-surface`, `text-ink-primary`) because the migration cost would be far larger than the payoff. Dark mode is delivered through `dark:` variants inside component classes. If/when we need theme variants beyond light/dark, the tokens are ready to be wired into `tailwind.config.ts`.

---

## Class catalog

### Surfaces

| Class | Purpose |
|---|---|
| `card-surface` | Standard white/slate-800 panel with border |
| `modal-surface` | Modal/dialog container (no border, shadow) |
| `muted-surface` | Subtle fill (e.g. table headers, toggle backgrounds) |
| `input-surface` | Form input/select/textarea base — bg, border, text, placeholder, focus ring |
| `toggle-active` / `toggle-inactive` | Segmented-control pill states |
| `card-divider` | `divide-*` color that matches card borders |

```html
<div class="card-surface rounded-2xl p-4">…</div>
<input class="input-surface rounded-xl px-3 py-2.5 w-full text-sm" />
```

### Text tones

| Class | Purpose |
|---|---|
| `text-primary` | Headings, emphasized copy |
| `text-muted` | Secondary copy, labels |
| `text-subtle` | Tertiary copy, metadata |

### Buttons

Compose: `btn` + a variant (`btn-primary`, `btn-secondary`, …) + optional size/shape modifiers.

| Class | Purpose |
|---|---|
| `btn` | Shared base — inline-flex, px-4 py-2.5, rounded-xl, transition, disabled/focus |
| `btn-primary` | Green — main confirmation action (Save, Create) |
| `btn-secondary` | Slate fill — neutral alternative (Cancel when primary is present) |
| `btn-danger` | Red — destructive actions (Delete) |
| `btn-ghost` | Transparent — tertiary actions, toolbar buttons |
| `btn-muted` | Very low emphasis fill — list row CTAs |
| `btn-sm` / `btn-lg` | Size modifiers |
| `btn-icon` | Square icon button (p-1.5, rounded-lg) |
| `btn-pill` | `rounded-full` override for pill buttons |
| `btn-block` | `w-full` shortcut |

```html
<button class="btn btn-primary">Save</button>
<button class="btn btn-secondary">Cancel</button>
<button class="btn btn-ghost btn-icon" aria-label="Close">×</button>
<button class="btn btn-primary btn-block">Continue</button>
```

Disabled styling is baked in (`disabled:opacity-50 disabled:cursor-not-allowed`). Do not add `disabled:bg-*` inline.

### Badges / pills

Compose: `badge` + a family + a color.

| Class | Purpose |
|---|---|
| `badge` | Base — rounded-full, text-xs, px-2 py-0.5, font-medium |
| `badge-soft-{brand,success,warning,danger,info,neutral,violet}` | Low-contrast tinted fill with colored text |
| `badge-solid-{brand,success,warning,danger,info,neutral}` | Solid colored fill with white text |
| `badge-outline-{brand,warning,danger,info,neutral}` | Tinted fill with matching border |

Intent mapping:
- **brand / success** → green/emerald (confirmed, done, active)
- **warning** → amber (due soon, pending attention)
- **danger** → red (overdue, failed, destructive)
- **info** → sky (neutral informational)
- **neutral** → slate (count chips, inactive)
- **violet** → violet (special categories — reserve)

```html
<span class="badge badge-soft-warning">Due in 3 days</span>
<span class="badge badge-solid-danger">Overdue</span>
<span class="badge badge-outline-info">Active</span>
```

### Chips

| Class | Purpose |
|---|---|
| `chip` | Neutral rounded-full label (e.g. tags) |
| `chip-interactive` | Hover-able chip — apply alongside `chip` |

### Modal scaffolding

| Class | Purpose |
|---|---|
| `modal-backdrop` | `fixed inset-0 z-50 flex … bg-black/40 px-4 pb-4` — the overlay |
| `modal-backdrop-elevated` | Add for stacked modals (z-70) |
| `modal-surface` | The modal box (bg, shadow; compose with `rounded-2xl max-w-sm p-5`) |
| `modal-header` / `modal-body` / `modal-footer` | Internal regions (optional; most modals are simpler) |

```html
<div class="modal-backdrop">
  <div class="modal-surface rounded-2xl w-full max-w-sm p-5">…</div>
</div>
```

### Forms

| Class | Purpose |
|---|---|
| `form-field` | Wrapper for a label + input + help (flex col, gap-1.5) |
| `form-label` | Field label (text-xs font-semibold, muted) |
| `form-help` | Helper text below input |
| `form-error` | Validation error text (red) |
| `form-row` | 2-column grid for paired fields |
| `form-grid` | Responsive 1→2 column grid |

```html
<label class="form-field">
  <span class="form-label">Name</span>
  <input class="input-surface rounded-xl px-3 py-2.5 w-full text-sm" />
  <span class="form-help">Visible to all properties.</span>
</label>
```

### Typography

| Class | Purpose |
|---|---|
| `section-title` | `text-xs uppercase tracking-wide` section header |
| `section-subtitle` | `text-sm` secondary heading text |
| `eyebrow` | `text-[11px] uppercase tracking-wider` metadata label |

### States

| Class | Purpose |
|---|---|
| `empty-state` | Centered muted placeholder for empty lists |
| `skeleton` | Shimmering placeholder surface |
| `loading-spinner` | 16px spinning ring |

### Layout helpers

| Class | Purpose |
|---|---|
| `stack-2` / `stack-3` / `stack-4` | Vertical flex with gap |
| `cluster-2` / `cluster-3` | Horizontal flex-wrap with gap |
| `card-grid` | Responsive card grid (1→2 columns) |

These are convenience wrappers; inline `flex gap-3` remains fine for one-off layout.

---

## Contribution rules

1. **New surface color?** Add a token first, then a class. Don't hardcode a new hex.
2. **New button look?** Confirm it can't be expressed by an existing variant + modifier. If truly new, add to `.btn-*` next to siblings.
3. **New badge color?** Add across all three families (`soft`, `solid`, `outline`) so future authors have the full set.
4. **Naming:** use intent (`btn-primary`, `badge-soft-warning`), never hue (`btn-green`).
5. **No dark-only classes.** Every new component class must bake in its `dark:` variant — don't ship a class that only works in light mode.
6. **Legacy fallback layer.** `src/index.css` still contains a `:where(.dark) .bg-white { … }` block. It is a migration aid for places still using raw `bg-white` / `text-slate-*`. New code should not rely on it; it will be removed once no callers remain.

---

## Live gallery (deferred)

A dev-only `/design-system` route that renders every class with sample markup is a Phase D deliverable. For now, the tables above and `src/index.css` are the catalog.

---

## Deviations from `ARCHITECTURAL-REWRITE-PLAN.md` Phase A

- **Token-backed Tailwind colors not introduced.** Plan §A.1 sketched `colors.surface.DEFAULT = rgb(var(--surface) / <alpha-value>)`. Skipped because adoption would require touching every raw `bg-slate-*` / `text-slate-*` in the codebase (thousands of call sites) for a payoff (theme swaps) we don't yet need. Tokens still exist as CSS variables and can be wired into Tailwind later with minimal disruption.
- **`:where()` fallback layer retained.** Plan §A.4 step 4 targets its removal as an exit criterion. The Phase A sweep replaces inputs, buttons, badges, modal backdrops, section titles, and form labels — but raw `bg-white` / `text-slate-700` / `border-slate-200` usages in body copy and layout remain throughout screens. Removing the fallback would require a second, larger sweep; it is flagged as a follow-up. The fallback is now documented as legacy in `src/index.css`.
