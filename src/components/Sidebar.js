'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChartLineUp,
  FirstAid,
  Leaf,
  GraduationCap,
  UserGear,
  ArrowsClockwise,
  SignOut,
  CaretDown,
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
  const [livelihoodOpen, setLivelihoodOpen] = useState(pathname?.startsWith('/livelihood') || false);

  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin' || isSuperAdmin;

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
    // Trigger resize event for charts
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 400);
  };

  const checkActive = (path) => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname?.startsWith(path);
  };

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
          id="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar" 
          aria-expanded={!collapsed}
        >
          <SidebarSimple weight="bold" />
        </button>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-label">Dashboards</div>

        <Link
          href="/"
          className={`nav-item ${checkActive('/') ? 'active' : ''}`}
        >
          <ChartLineUp weight={checkActive('/') ? "bold" : "regular"} />
          <span className="sidebar-text-el">Dashboard</span>
        </Link>

        <div className="nav-label">Programmes</div>

        {/* Health */}
        {(isAdmin || user?.thematic === 'health') && (
          <Link
            href="/health"
            className={`nav-item ${checkActive('/health') ? 'active' : ''}`}
          >
            <FirstAid weight={checkActive('/health') ? "bold" : "regular"} />
            <span className="sidebar-text-el">Health</span>
          </Link>
        )}

        {/* Livelihood Nested Menu */}
        {(isAdmin || user?.thematic === 'livelihood') && (
          <div className="nav-group">
            <button
              onClick={() => setLivelihoodOpen(!livelihoodOpen)}
              className={`nav-item nav-tree-toggle ${pathname?.startsWith('/livelihood') ? 'active' : ''}`}
              aria-expanded={livelihoodOpen}
            >
              <Leaf weight={pathname?.startsWith('/livelihood') ? "bold" : "regular"} />
              <span className="sidebar-text-el">Livelihood</span>
              <CaretDown className="nav-caret sidebar-text-el" />
            </button>
            <div className={`nav-tree-children ${livelihoodOpen ? 'open' : ''}`}>
              <Link
                href="/livelihood/skilling"
                className={`nav-item nav-sub ${pathname === '/livelihood/skilling' ? 'active' : ''}`}
              >
                <BookOpen />
                <span className="sidebar-text-el">Skilling</span>
              </Link>
              <Link
                href="/livelihood/placement"
                className={`nav-item nav-sub ${pathname === '/livelihood/placement' ? 'active' : ''}`}
              >
                <Briefcase />
                <span className="sidebar-text-el">Placement</span>
              </Link>
              <Link
                href="/livelihood/enterprise"
                className={`nav-item nav-sub ${pathname === '/livelihood/enterprise' ? 'active' : ''}`}
              >
                <Buildings />
                <span className="sidebar-text-el">Enterprise</span>
              </Link>
            </div>
          </div>
        )}

        {/* Education */}
        {(isAdmin || user?.thematic === 'education') && (
          <Link
            href="/education"
            className={`nav-item ${checkActive('/education') ? 'active' : ''}`}
          >
            <GraduationCap weight={checkActive('/education') ? "bold" : "regular"} />
            <span className="sidebar-text-el">Education</span>
          </Link>
        )}

        {isAdmin && (
          <>
            <div className="nav-label">Administration</div>
            {isSuperAdmin && (
              <Link
                href="/admin/users"
                className={`nav-item ${checkActive('/admin/users') ? 'active' : ''}`}
              >
                <UserGear weight={checkActive('/admin/users') ? "bold" : "regular"} />
                <span className="sidebar-text-el">Users</span>
              </Link>
            )}
            <Link
              href="/admin/add-data"
              className={`nav-item ${checkActive('/admin/add-data') ? 'active' : ''}`}
            >
              <PlusCircle weight={checkActive('/admin/add-data') ? "bold" : "regular"} />
              <span className="sidebar-text-el">Add Data</span>
            </Link>
            <Link
              href="/admin/sync"
              className={`nav-item ${checkActive('/admin/sync') ? 'active' : ''}`}
            >
              <ArrowsClockwise weight={checkActive('/admin/sync') ? "bold" : "regular"} />
              <span className="sidebar-text-el">Sync Log</span>
            </Link>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar">{user?.username?.charAt(0).toUpperCase() || 'U'}</div>
          <div className="user-info sidebar-text-el">
            <span className="user-name">{user?.username || 'Guest'}</span>
            <span className="user-role">{user?.role?.replace('_', ' ') || 'User'}</span>
          </div>
        </div>
        <button onClick={logout} className="signout-link" style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}>
          <SignOut />
          <span className="sidebar-text-el">Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
