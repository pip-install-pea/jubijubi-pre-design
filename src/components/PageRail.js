'use client';

import React from 'react';

export default function PageRail({ children }) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (!items.length) return null;
  return <div className="page-rail">{items}</div>;
}
