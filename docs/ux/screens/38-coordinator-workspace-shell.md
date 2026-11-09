# University Coordinator workspace shell

**Status:** Implemented shell contract; page redesign follows

The Coordinator is institution-scoped. The shell makes that scope visible
without presenting the role as a programme-wide administrator.

## Navigation

The rail groups operational work under **Coordinator workspace**: Overview,
Cohorts & students, and Placements. Reports and Activity provide the
institution view of performance and change history. Account & security is
available from both the rail footer and the header menu. Help remains absent
until a real support workflow exists.

## Header and responsive behavior

The dedicated header identifies Institution administration, shows the current
page title, provides notifications, and exposes account/security actions. The
desktop rail is persistent at 17rem. Smaller screens use an off-canvas rail,
a menu trigger, a dismissible scrim, and touch-sized controls. Account and
notification menus close on outside press and Escape.

## Boundary

This shell communicates navigation and scope; it does not grant permissions.
Ward allocation, mentor assignment, completion, and restricted narratives
remain governed by server capabilities and the placement read model.
