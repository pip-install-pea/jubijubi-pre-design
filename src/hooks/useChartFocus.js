'use client';

import { useCallback, useState } from 'react';

export function useChartFocus() {
  const [focus, setFocus] = useState([]);

  const select = useCallback((label, event) => {
    const name = String(label || '').trim();
    if (!name || name === 'Other') return focus;
    const additive = Boolean(event?.shiftKey || event?.metaKey);
    setFocus((prev) => {
      if (additive) {
        if (prev.includes(name)) return prev.filter((x) => x !== name);
        return [...prev, name].slice(-2);
      }
      return [name];
    });
    return [name];
  }, [focus]);

  const remove = useCallback((label) => {
    const name = String(label || '').trim();
    setFocus((prev) => prev.filter((x) => x !== name));
  }, []);

  const clear = useCallback(() => setFocus([]), []);

  return { focus, setFocus, select, remove, clear };
}

export function patchFilters(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('app:filters:patch', { detail }));
}
