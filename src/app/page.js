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
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ''))
    ).toString();
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
      <div className="section-header">
        <h2 className="card-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>Overview</h2>
        <p className="section-sub">Cross-programme counts. Location filters are not applied here — health and livelihood geographies do not share IDs.</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ backgroundColor: 'rgba(62, 181, 240, 0.15)', color: 'var(--navy)' }}>
              <Heart size={20} weight="fill" />
            </div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">{fmt(summary?.health_patients)}</div>
            <div className="kpi-label">Synced health patients</div>
            <p className="kpi-caption">Patient table, not the year envelope.</p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ backgroundColor: 'rgba(141, 198, 63, 0.18)', color: 'var(--lime)' }}>
              <Leaf size={20} weight="fill" />
            </div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">{fmt(summary?.livelihood_roster ?? summary?.livelihood_trained)}</div>
            <div className="kpi-label">Skill roster</div>
            <p className="kpi-caption">COUNT(skilltracking_persons), not “trained”.</p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ backgroundColor: 'rgba(240, 196, 25, 0.2)', color: 'var(--navy)' }}>
              <Buildings size={20} weight="fill" />
            </div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">{fmt(summary?.enterprise_members)}</div>
            <div className="kpi-label">Enterprise members</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <div className="kpi-icon-wrap" style={{ backgroundColor: 'rgba(30, 79, 163, 0.12)', color: 'var(--sky)' }}>
              <GraduationCap size={20} weight="fill" />
            </div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">{fmt(summary?.education_students ?? summary?.education_sessions)}</div>
            <div className="kpi-label">Education students</div>
            <p className="kpi-caption">SUM(student_count) with trimmed programme names.</p>
          </div>
        </div>
      </div>

      <div className="section-title">Programmes</div>
      <div className="programme-links">
        {(isAdmin || user?.thematic === 'health') && (
          <Link href="/health" className="prog-card prog-card--health">
            <h3>Health</h3>
            <p>Year envelope, disease mix, patient-table inclusion</p>
            <span className="prog-arrow">→</span>
          </Link>
        )}

        {(isAdmin || user?.thematic === 'livelihood') && (
          <Link href="/livelihood/skilling" className="prog-card prog-card--livelihood">
            <h3>Livelihood</h3>
            <p>Roster, placement monitor, enterprise members and profit</p>
            <span className="prog-arrow">→</span>
          </Link>
        )}

        {(isAdmin || user?.thematic === 'education') && (
          <Link href="/education" className="prog-card prog-card--education">
            <h3>Education</h3>
            <p>Students by programme. Assessments empty until live rows exist.</p>
            <span className="prog-arrow">→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
