'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChartLineUp,
  FirstAid,
  GraduationCap,
  UserGear,
  ArrowsClockwise,
  SignOut,
  BookOpen,
  Briefcase,
  Buildings,
  SidebarSimple,
  PlusCircle
} from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem('sidebar-collapsed') === '1') setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin' || isSuperAdmin;

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('sidebar-collapsed', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      setTimeout(() => window.dispatchEvent(new Event('resize')), 400);
      return next;
    });
  };

  const checkActive = (path) => {
    if (path === '/') return pathname === '/';
    return pathname?.startsWith(path);
  };

  const item = (href, label, Icon, active) => (
    <Link
      href={href}
      className={`nav-item ${active ? 'active' : ''}`}
      title={collapsed ? label : undefined}
    >
      <Icon weight={active ? 'bold' : 'regular'} />
      <span className="sidebar-text-el">{label}</span>
    </Link>
  );

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} id="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="Jubilant Logo" className="logo-img" />
          <div className="logo-info sidebar-text-el">
            <span className="logo-brand">JUBILANT BHARTIA</span>
            <span className="logo-foundation">Foundation</span>
            <span className="logo-subtitle">CSR Dashboard</span>
          </div>
        </div>
        <button
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <SidebarSimple weight="bold" />
        </button>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-label">Dashboards</div>
        {item('/', 'Overview', ChartLineUp, checkActive('/'))}

        {(isAdmin || user?.thematic === 'health') && (
          <>
            <div className="nav-label">Health</div>
            {item('/health', 'Health', FirstAid, checkActive('/health'))}
          </>
        )}

        {(isAdmin || user?.thematic === 'education') && (
          <>
            <div className="nav-label">Education</div>
            {item('/education', 'Education', GraduationCap, checkActive('/education'))}
          </>
        )}

        {(isAdmin || user?.thematic === 'livelihood') && (
          <>
            <div className="nav-label">Livelihood</div>
            {item('/livelihood/skilling', 'Skilling', BookOpen, pathname?.startsWith('/livelihood/skilling'))}
            {item('/livelihood/placement', 'Placement', Briefcase, pathname?.startsWith('/livelihood/placement'))}
            {item('/livelihood/enterprise', 'Enterprise', Buildings, pathname?.startsWith('/livelihood/enterprise'))}
          </>
        )}

        {isAdmin && (
          <>
            <div className="nav-label">Administration</div>
            {isSuperAdmin && item('/admin/users', 'Users', UserGear, checkActive('/admin/users'))}
            {item('/admin/add-data', 'Add data', PlusCircle, checkActive('/admin/add-data'))}
            {item('/admin/sync', 'Sync', ArrowsClockwise, checkActive('/admin/sync'))}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile" title={collapsed ? (user?.username || 'User') : undefined}>
          <div className="user-avatar">{user?.username?.charAt(0).toUpperCase() || 'U'}</div>
          <div className="user-info sidebar-text-el">
            <span className="user-name">{user?.username || 'Guest'}</span>
            <span className="user-role">{user?.role?.replace('_', ' ') || 'User'}</span>
          </div>
        </div>
        <button
          onClick={logout}
          className="signout-link"
          title={collapsed ? 'Sign out' : undefined}
          style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
        >
          <SignOut />
          <span className="sidebar-text-el">Sign out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
