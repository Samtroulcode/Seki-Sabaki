# Seki Interaction Primitives

Status: normative contract for incremental workspace redesign. This document
specializes the action hierarchy in
[`ux-architecture-audit.md`](./ux-architecture-audit.md); it does not redesign
any current screen.

## General action contract

- Use a native `<button>` for an in-app action. Set `type="button"` unless the
  action intentionally submits its containing form.
- Normally provide **one Primary action per decision area**. More than one means
  the area contains multiple decisions and should be regrouped.
- Communicate role and state through label, position, border/surface, and, where
  useful, an icon. Color alone is insufficient.
- Actions must never exist only on hover. Hover may reveal emphasis, not
  capability.
- Preserve a clearly visible `:focus-visible` ring. Do not substitute a hover
  fill for keyboard focus or restore generic `:focus` outlines for pointer use.
- Use the native `disabled` attribute when an action cannot run. Keep its label
  legible and provide nearby status/help when the reason is not self-evident;
  reduced opacity alone is insufficient.
- Enter and Space activate a focused native button. Do not duplicate that
  behavior with custom key handlers unless the control is not a native button.

The shared states below apply to every role unless its role section is more
specific:

- **Hover:** a restrained surface or semantic-color change; never movement,
  glow, or the only indication that an action exists.
- **Active/pressed:** a distinct, immediate pressed surface. Persistent toggled
  state uses `aria-pressed`, not the transient `:active` state.
- **Focus-visible:** the shared `--ui-focus` outline remains visible in addition
  to any role-specific surface change.
- **Disabled:** no hover/active response; semantic disabled text, border, and
  surface remain discernible; native activation is unavailable.
- **Accessible name:** visible action text is preferred. If visible text is
  absent, an explicit accessible name is mandatory.

## Action roles

### Primary

- **Use:** the action that advances the current task or decision: New Board,
  Find opponent, Start analysis, Creator Save, or Accept dead stones during that
  game phase.
- **Do not use:** for navigation, refresh, configuration, reveal, cancellation,
  destructive escape actions, or persistent selection state.
- **Priority:** highest normal priority; normally one per decision area.
- **Hover:** `--ui-accent-hover`; **active:** `--ui-accent-active`.
- **Focus-visible:** accent treatment plus the shared focus ring.
- **Disabled:** neutral disabled treatment, not a faded active-looking accent.
- **Keyboard/name:** native Enter/Space; use a concise visible verb-object
  label.

### Secondary

- **Use:** a common supporting alternative that should remain visible, such as
  Choose SGF before Start analysis or Test Problem beside Creator Save.
- **Do not use:** for incidental utilities, persistent selections, or an action
  that should lead the decision area.
- **Priority:** below Primary, above Ghost; neutral surface and visible border.
- **Hover:** one neutral surface step; **active:** a quieter/deeper neutral
  surface.
- **Focus-visible:** neutral surface plus the shared focus ring.
- **Disabled:** legible neutral disabled surface/border/text.
- **Keyboard/name:** native Enter/Space; visible descriptive text is expected.

### Ghost / subtle

- **Use:** low-risk navigation and utility actions such as Back, Up one folder,
  Refresh, Revert, or Show in folder.
- **Do not use:** for the only path forward, irreversible actions, or utilities
  whose discoverability is essential but whose context is unclear.
- **Priority:** lowest persistent action priority; transparent until
  interaction.
- **Hover:** restrained neutral surface; **active:** a deeper neutral surface.
- **Focus-visible:** the action becomes visually bounded while retaining the
  shared focus ring.
- **Disabled:** transparent, with disabled text still readable.
- **Keyboard/name:** native Enter/Space; label may be short but must state the
  action rather than rely on placement.

### Destructive

- **Use:** irreversible, session-ending, or work-stopping actions: Resign,
  Disconnect game, Cancel a running analysis, Delete Branch, remove an engine,
  or uninstall a theme.
- **Do not use:** for ordinary cancellation/back navigation, Pass, or a
  reversible selection. Do not make it the normal Primary solely because it is
  important.
- **Priority:** consequential but spatially separated from the normal Primary;
  never oversized or made to compete as a second primary.
- **Hover:** stronger danger emphasis; **active:** explicit `--ui-danger`
  pressed surface.
- **Focus-visible:** danger semantics plus the shared focus ring.
- **Disabled:** neutral disabled treatment, not a weak red that still looks
  live.
- **Keyboard/name:** native Enter/Space. Use explicit visible consequence text;
  never an icon alone. Confirm substantial irreversible consequences according
  to the owning workflow.

### Icon-only

- **Use:** conventional, repeated, space-constrained utilities such as tab close
  or established engine/editor toolbar controls.
- **Do not use:** for Save, Start analysis, Resign, Disconnect, Delete, or any
  consequential or ambiguous action.
- **Priority:** normally inherits Secondary or Ghost; it may use Primary only
  for a conventional, non-consequential action. It must not use Destructive
  because consequential actions require visible text. Icon-only is a
  shape/naming constraint, not an action priority.
- **Hover/active/disabled:** inherit the paired role while preserving a stable
  square target.
- **Focus-visible:** the complete square target receives the shared focus ring.
- **Keyboard/name:** native Enter/Space. Provide `aria-label` and a discoverable
  tooltip; use `title` where the native tooltip is appropriate or the app's
  established tooltip mechanism otherwise. Decorative image/SVG content is
  hidden from assistive technology.

### Contextual / overflow

- **Use:** infrequent actions tied to one selected row/object when keeping all
  of them visible would flatten hierarchy or create repetitive noise.
- **Do not use:** for the row's normal activation, the sole Primary action,
  urgent status, or a frequently repeated two-step task. Do not introduce an
  overflow menu merely to conceal poor grouping.
- **Priority:** below the object's direct action; the trigger is normally Ghost
  or Icon-only Ghost.
- **Hover/active/focus/disabled:** the trigger follows its button role; open
  state is exposed with `aria-expanded="true"` and must not rely on color alone.
- **Keyboard/name:** trigger uses native Enter/Space and an accessible name such
  as “More actions for {item}.” Menu keyboard behavior follows the baseline
  below. Contextual actions remain reachable without hover.

## Action groups

Within one decision area, order normal actions by task flow:

```text
Primary  Secondary  Ghost
```

- Keep Primary adjacent to its supporting Secondary action.
- Place Ghost utilities after normal actions or at the opposite edge when they
  control the area rather than advance it.
- Separate a Destructive action with space, a divider, or a distinct trailing
  group. Do not place it between Primary and Secondary.
- Platform dialog order may follow the operating system; hierarchy and focus
  must remain equivalent.
- In repeated rows, make the row's normal Open/Select action direct and move
  genuinely infrequent alternatives to a labelled overflow trigger.

Current Seki examples establish the intended ownership without changing them in
this task:

- **OGS history:** Open is the direct row action; Analyze with OGS and Analyze
  with Seki are contextual alternatives (`OgsGameHistory.js`).
- **Analysis source:** Start analysis is Primary once ready; choosing the SGF is
  supporting, while KataGo/model/config/output setup belongs to a secondary
  settings surface (`AnalysisPanel.js`).
- **Analysis job:** Cancel is Destructive and separated from Ghost Show log.
- **Live game:** Pass is a normal phase action; Resign is Destructive. Accept
  dead stones becomes Primary only during stone removal
  (`OgsGameContextPanel.js`).
- **Creator:** Save is Primary, Test Problem is Secondary, and Delete Branch is
  a separated contextual Destructive action (`TsumegoCreator.js`).

## Keyboard baseline

### Native and icon buttons

- Tab enters the control in document order; Enter and Space activate it.
- Disabled buttons are not activatable. Focus is not moved merely because an
  action becomes disabled unless the focused element is removed.
- Icon buttons meet the same behavior and naming requirements as text buttons.

### Toggles

- Use a native checkbox for independent on/off settings or a native button with
  `aria-pressed` for action-like toggles.
- Enter/Space behavior follows the selected native control. The visible selected
  indicator must accompany, not replace, the semantic state.
- A group that allows one choice uses radio semantics or the appropriate tab
  pattern rather than several unrelated pressed buttons when practical.

### Menus and overflow triggers

- The trigger is a native button with `aria-haspopup="menu"` and synchronized
  `aria-expanded`.
- Enter/Space opens the menu and moves focus to an item. Arrow keys move among
  items; Home/End move to the first/last; Escape closes and returns focus to the
  trigger. Tab closes the menu and continues normal focus order.
- This is a future contract; this task adds no menu component.

### Top activity tabs

- The top tab strip contains only local board/SGF documents and live online
  games. Global sidebar destinations and Settings do not participate in this
  keyboard model.
- Current `AppTabs` provides labelled board/live-game buttons, accessible close
  names, and `aria-current`, but lacks a complete desktop tab keyboard model.
- Future behavior: Tab enters the top strip; Left/Right move focus among open
  board and live-game tabs; Home/End move to the first/last; Enter/Space
  activate; a documented close command closes the focused activity; focus moves
  deterministically after close.
- Roving focus versus activation-on-focus must be chosen and tested during the
  later navigation accessibility pass. No behavior changes in this task.

### Dialogs and drawers

- Future modal contract: an accessible dialog name, initial meaningful focus,
  contained Tab order while modal, Escape according to consequence, and focus
  restoration to the opener on close.
- Current technical debt: `Drawer` renders a styled `<section>` without a
  complete dialog role, naming, initial-focus, focus-containment, or restoration
  contract (`src/components/drawers/Drawer.js`). This task does not change it.

### Splitters

- Future contract: a focusable separator with orientation and value semantics;
  Arrow keys resize by a predictable step, a modifier provides a larger step,
  and a documented command restores the default. Pointer resizing remains.
- Current technical debt: `SplitContainer` resizers are pointer-only `<div>`
  elements without separator semantics or keyboard input
  (`src/components/helpers/SplitContainer.js`). This task does not change them.

## Incremental CSS adoption

The opt-in classes in `style/app.css` are:

- `.ui-button`
- `.ui-button-primary`
- `.ui-button-secondary`
- `.ui-button-ghost`
- `.ui-button-danger`
- `.ui-icon-button`

Apply `.ui-button` plus one priority class; add `.ui-icon-button` only for an
icon-only shape. Existing controls remain unchanged until explicitly migrated.
Feature-specific legacy rules, especially `!important`, ID selectors, or
positional selectors, must be removed locally when the corresponding control is
migrated rather than escalating the shared primitives into a global specificity
fight.
