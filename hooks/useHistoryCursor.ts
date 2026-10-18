import { useCallback, useState } from 'react';

/** Only cursor strings are retained, never previous transaction rows. */
export function useHistoryCursor(scope: string) {
  const [state, setState] = useState({ scope, cursors: [''], index: 0 });
  const current = state.scope === scope ? state : { scope, cursors: [''], index: 0 };
  const next = (cursor?: string | null) => {
    if (cursor) setState({ scope, cursors: [...current.cursors.slice(0, current.index + 1), cursor], index: current.index + 1 });
  };
  const previous = () => { if (current.index > 0) setState({ ...current, index: current.index - 1 }); };
  const reset = useCallback(() => setState({ scope, cursors: [''], index: 0 }), [scope]);
  return { before: current.cursors[current.index] || undefined, page: current.index + 1, next, previous, reset };
}
