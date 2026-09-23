'use client';

import React from 'react';
import { X } from 'lucide-react';

export default function ChartFocusBar({ focus, onClear, onRemove, hint }) {
  if (!focus?.length) return null;
  return (
    <div className="chart-focus-bar" title={hint || undefined}>
      <span className="chart-focus-bar__label">
        {focus.length > 1 ? 'Comparing' : 'Focused'}
      </span>
      {focus.map((name) => (
        <span key={name} className="filter-chip filter-chip--focus">
          <span className="filter-chip__text">{name}</span>
          {onRemove && (
            <button
              type="button"
              className="filter-chip__x"
              aria-label={`Remove ${name}`}
              onClick={() => onRemove(name)}
            >
              <X size={11} strokeWidth={2.4} />
            </button>
          )}
        </span>
      ))}
      <button type="button" className="chart-focus-bar__clear" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
