'use client';

import { useEffect, useState } from 'react';

export function isPrinting() {
  return typeof document !== 'undefined'
    && document.documentElement.classList.contains('is-printing');
}

export function usePrintMode() {
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const on = () => setPrinting(true);
    const off = () => setPrinting(false);
    window.addEventListener('app:print:prepare', on);
    window.addEventListener('app:print:done', off);
    window.addEventListener('afterprint', off);
    return () => {
      window.removeEventListener('app:print:prepare', on);
      window.removeEventListener('app:print:done', off);
      window.removeEventListener('afterprint', off);
    };
  }, []);

  return printing;
}

export function bindPrintLifecycle() {
  const done = () => {
    document.documentElement.classList.remove('is-printing');
    window.dispatchEvent(new Event('app:print:done'));
  };
  const prepare = () => {
    document.documentElement.classList.add('is-printing');
    window.dispatchEvent(new Event('app:print:prepare'));
  };
  window.addEventListener('beforeprint', prepare);
  window.addEventListener('afterprint', done);
  return () => {
    window.removeEventListener('beforeprint', prepare);
    window.removeEventListener('afterprint', done);
  };
}

export async function printDashboard() {
  if (typeof window === 'undefined') return;
  document.documentElement.classList.add('is-printing');
  window.dispatchEvent(new Event('app:print:prepare'));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise((resolve) => setTimeout(resolve, 160));
  window.dispatchEvent(new Event('app:print:prepare'));
  await new Promise((resolve) => setTimeout(resolve, 280));
  window.print();
}
