'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import GlobalFilters from './GlobalFilters';

const AppContent = ({ children }) => {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPath = pathname === '/login';

  useEffect(() => {
    if (!loading && !user && !isLoginPath) {
      router.push('/login');
    }
  }, [user, loading, isLoginPath, router]);

  if (loading) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', backgroundColor: 'var(--bg)' }}>
          <div className="spinner"></div>
          {/* <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Synchronizing Platform...</span> */}
        </div>
      </div>
    );
  }

  if (isLoginPath) {
    return <>{children}</>;
  }

  if (!user) {
    return null; // Redirecting via useEffect
  }

  const handleFilterApply = (filters) => {
    console.log('Filters Applied:', filters);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:filters:apply', { detail: filters }));
    }
  };

  return (
    <div className="app-layout">
      {/* ── Sidebar ── */}
      <Sidebar />

      {/* ── Main Area ── */}
      <div className="main-area" id="main-area">

        {/* ── Filter Bar ── */}
        <GlobalFilters onApply={handleFilterApply} />

        {/* ── Page Content ── */}
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
};

export default function ClientLayoutWrapper({ children }) {
  return (
    <AuthProvider>
      <AppContent>{children}</AppContent>
    </AuthProvider>
  );
}
