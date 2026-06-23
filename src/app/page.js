'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { Heart, Leaf, Buildings, GraduationCap } from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const handleApply = (e) => setFilters(e.detail || {});
    window.addEventListener('app:filters:apply', handleApply);
    return () => window.removeEventListener('app:filters:apply', handleApply);
  }, []);

  const fetchSummary = React.useCallback(async () => {
    const query = new URLSearchParams(filters).toString();
    try {
      const response = await axios.get(`/api/summary?${query}`);
      setSummary(response.data);
    } catch (error) {
      console.error('Failed to fetch summary', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const fmt = (n) => {
    if (!n) return '0';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
  };

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="section-header">
        <h2 className="card-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>Overview</h2>
        <p className="section-sub">Cross-programme impact summary</p>
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ backgroundColor: '#fff1f2', color: '#e11d48' }}>
              <Heart size={20} weight="fill" />
            </div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">{fmt(summary?.health_patients)}</div>
            <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Health Patients</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
              <Leaf size={20} weight="fill" />
            </div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">{fmt(summary?.livelihood_trained)}</div>
            <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Persons Trained</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
              <Buildings size={20} weight="fill" />
            </div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">{fmt(summary?.enterprise_members)}</div>
            <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Enterprise Members</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ backgroundColor: '#fefce8', color: '#ca8a04' }}>
              <GraduationCap size={20} weight="fill" />
            </div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">{fmt(summary?.education_sessions)}</div>
            <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Education Sessions</div>
          </div>
        </div>
      </div>

      {/* Programme Links Section */}
      <div className="section-title">Programmes</div>
      <div className="programme-links">
        {(isAdmin || user?.thematic === 'health') && (
          <Link href="/health" className="prog-card prog-card--health">
            <h3>Health</h3>
            <p>Patient reach, disease trends, inclusion & sustainability</p>
            <span className="prog-arrow">→</span>
          </Link>
        )}

        {(isAdmin || user?.thematic === 'livelihood') && (
          <Link href="/livelihood/skilling" className="prog-card prog-card--livelihood">
            <h3>Livelihood</h3>
            <p>Skilling, placement, enterprise support outcomes</p>
            <span className="prog-arrow">→</span>
          </Link>
        )}

        {(isAdmin || user?.thematic === 'education') && (
          <Link href="/education" className="prog-card prog-card--education">
            <h3>Education</h3>
            <p>Programme activities, assessment scores, Muskaan outcomes</p>
            <span className="prog-arrow">→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
