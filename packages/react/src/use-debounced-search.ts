// Debounced two-way binding between the search box and `query.q`.
//
// The search input cannot be driven straight from `query.q`: every keystroke
// would be a server round-trip, and each one resets the grid to page 1. So the
// input keeps its own state and the committed value trails it by a beat.
//
// Two failure modes this hook exists to prevent, both of which are easy to
// write by accident:
//
//   * Committing on mount. `text` starts equal to `query.q`, and the timer is
//     only armed when the two differ, so a freshly mounted grid never fires a
//     query the host did not ask for — which would have thrown away a page
//     number restored from the URL.
//   * Restarting the timer on unrelated renders. The commit callback is held
//     in a ref instead of being an effect dependency, so a host that passes an
//     inline arrow (nearly all of them do) does not re-arm the 350 ms timer
//     every time its parent re-renders.

import * as React from "react";

/** How long typing must pause before the query is updated. */
export const SEARCH_DEBOUNCE_MS = 350;

/**
 * Bind a text input to an externally controlled search string.
 *
 * @param value    The committed search text (`query.q ?? ""`). An external
 *                 change — a URL restore, a "reset filters" button — is
 *                 detected and mirrored into the input.
 * @param commit   Called with the input text once typing has paused.
 * @param delayMs  Debounce interval. Defaults to {@link SEARCH_DEBOUNCE_MS}.
 * @returns The input's current text and its setter.
 */
export function useDebouncedSearch(
  value: string,
  commit: (text: string) => void,
  delayMs: number = SEARCH_DEBOUNCE_MS,
): readonly [string, (next: string) => void] {
  const [text, setText] = React.useState(value);

  const commitRef = React.useRef(commit);
  React.useEffect(() => {
    commitRef.current = commit;
  });

  // Distinguish "the host changed the search" from "the host echoed back what
  // we just committed": only the former should overwrite what the user typed.
  const lastExternal = React.useRef(value);
  React.useEffect(() => {
    if (lastExternal.current === value) return;
    lastExternal.current = value;
    setText(value);
  }, [value]);

  React.useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => commitRef.current(text), delayMs);
    return () => clearTimeout(timer);
  }, [text, value, delayMs]);

  return [text, setText] as const;
}
