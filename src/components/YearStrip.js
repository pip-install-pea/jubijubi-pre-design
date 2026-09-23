'use client';

import React from 'react';

export default function YearStrip({ years = [], value, onChange, label = 'Year' }) {
  if (!years.length) return null;
  return (
    <div className="year-strip">
      <span className="year-strip__label">{label}</span>
      <div className="year-strip__track" role="tablist" aria-label={label}>
        {years.map((year) => {
          const active = String(year) === String(value);
          return (
            <button
              key={year}
              type="button"
              role="tab"
              aria-selected={active}
              className={`year-strip__btn ${active ? 'is-active' : ''}`}
              onClick={() => onChange(year)}
            >
              {year}
            </button>
          );
        })}
      </div>
    </div>
  );
}
