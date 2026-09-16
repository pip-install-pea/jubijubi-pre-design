'use client';

import React from 'react';

export default function ChartEmpty({ caption }) {
  return (
    <div className="empty-state chart-empty">
      <strong>No data for this view</strong>
      {caption && <p className="chart-caption">{caption}</p>}
    </div>
  );
}
