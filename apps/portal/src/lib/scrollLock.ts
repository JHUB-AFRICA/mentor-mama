/**
 * One shared, reference-counted page scroll lock.
 *
 * Each overlay used to save and restore `body.style.overflow` itself. When two overlapped or
 * closed out of order, the second restored "hidden" and the page stayed unscrollable for good.
 * Counting holders makes that impossible: the page unlocks exactly when the last holder releases.
 */
let holders = 0;

function apply() {
  const { body, documentElement } = document;
  if (holders > 0) {
    const scrollbar = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = "hidden";
    body.style.paddingRight = scrollbar > 0 ? `${scrollbar}px` : "";
  } else {
    body.style.removeProperty("overflow");
    body.style.removeProperty("padding-right");
  }
}

/** Lock page scroll; returns a release function that is safe to call more than once. */
export function lockScroll(): () => void {
  holders += 1;
  apply();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    apply();
  };
}

/** Safety net for route changes: nothing should be locked when no overlay is mounted. */
export function resetScrollLockIfIdle() {
  if (holders === 0) apply();
}
