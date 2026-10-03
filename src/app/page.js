'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import EChart, { groupedBarOption } from '../components/charts/EChart';
import RankingBar from '../components/charts/RankingBar';
import FarmerGrowth from '../components/charts/FarmerGrowth';
import DrilldownModal from '../components/DrilldownModal';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, title: '', apiUrl: '', params: {} });
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
    const v = Number(n) || 0;
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toLocaleString('en-IN');
  };

  const openDrill = (title, apiUrl, type, value, extra = {}) => {
    setModal({
      isOpen: true,
      title,
      apiUrl,
      params: { ...filters, type, value, ...extra }
    });
  };

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const showHealth = isAdmin || user?.thematic === 'health';
  const showLive = isAdmin || user?.thematic === 'livelihood';
  const showEdu = isAdmin || user?.thematic === 'education';

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  const schoolStudents = summary?.school_count ? summary.school_students : summary?.education_students;
  const liveLabels = (summary?.livelihood_counts || []).map((r) => r.label);
  const liveValues = (summary?.livelihood_counts || []).map((r) => r.value);

  return (
    <div>
      <div className="programme-links">
        {showHealth && (
          <Link href="/health" className="prog-card prog-card--health">
            <h3>Health</h3>
            <div className="prog-stat">{fmt(summary?.health_patients)}</div>
            <p>Patient records in the selected year</p>
            <span className="prog-arrow">Open Health →</span>
          </Link>
        )}
        {showLive && (
          <Link href="/livelihood/skilling" className="prog-card prog-card--livelihood">
            <h3>Livelihood</h3>
            <div className="prog-stat">{fmt(summary?.livelihood_roster)}</div>
            <p>People on the skill roster. Enterprise, Didi, and farmers are separate lists below.</p>
            <span className="prog-arrow">Open Livelihood →</span>
          </Link>
        )}
        {showEdu && (
          <Link href="/education" className="prog-card prog-card--education">
            <h3>Education</h3>
            <div className="prog-stat">{fmt(schoolStudents)}</div>
            <p>
              {summary?.school_count
                ? `${Number(summary.school_count).toLocaleString('en-IN')} schools from school sheets`
                : 'Programme rollup — school sheets empty for this filter'}
            </p>
            <span className="prog-arrow">Open Education →</span>
          </Link>
        )}
      </div>

      {showHealth && (summary?.health_diseases || []).length > 0 && (
        <div className="card" style={{ marginTop: '28px', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Largest disease counts</h3>
          </div>
          <div className="card-body">
            <RankingBar
              items={summary.health_diseases}
              maxItems={12}
              caption="Patient counts from the disease summary. Not unique people across diseases."
              onBarClick={(label) => label && openDrill(`Disease: ${label}`, '/api/health/drilldown', 'disease', label)}
            />
          </div>
        </div>
      )}

      {showLive && liveLabels.length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Livelihood lists</h3>
          </div>
          <div className="card-body">
            <EChart
              option={groupedBarOption(liveLabels, [{ label: 'Count', data: liveValues }])}
              caption="These are different lists. Do not add them into one headcount."
              onPoint={(p) => {
                if (p.name === 'Skill roster') openDrill(p.name, '/api/livelihood/drilldown', 'persons', '');
                else if (p.name === 'Skilling sheet') openDrill(p.name, '/api/livelihood/drilldown', 'mix_course', '');
                else if (p.name === 'Enterprise members') openDrill(p.name, '/api/livelihood/drilldown', 'enterprise_total', '');
                else if (p.name === 'Didi ki dukan') openDrill(p.name, '/api/livelihood/drilldown', 'mix_didi_location', '');
                else if (p.name === 'Jubifarm farmers') openDrill(p.name, '/api/livelihood/drilldown', 'mix_farmer_location', '');
              }}
            />
          </div>
        </div>
      )}

      {showLive && (summary?.farmers_by_year || []).length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Jubifarm farmers by year</h3>
          </div>
          <div className="card-body">
            <FarmerGrowth
              byYear={summary.farmers_by_year}
              locationsByYear={summary.farmer_locations_by_year}
              onLocationClick={(name) => openDrill(`Farmers: ${name}`, '/api/livelihood/drilldown', 'mix_farmer_location', name)}
            />
          </div>
        </div>
      )}

      {showEdu && (summary?.education_by_program || []).length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Students by school programme</h3>
          </div>
          <div className="card-body">
            <EChart
              option={groupedBarOption(
                summary.education_by_program.map((r) => r.label),
                [{ label: 'Students', data: summary.education_by_program.map((r) => r.value) }],
                { horizontal: true }
              )}
              height={Math.max(260, summary.education_by_program.length * 40)}
              onPoint={(p) => p.name && openDrill(p.name, '/api/education/drilldown', 'mix_program', p.name)}
            />
          </div>
        </div>
      )}

      <DrilldownModal
        key={modal.apiUrl + JSON.stringify(modal.params)}
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
        apiUrl={modal.apiUrl}
        params={modal.params}
      />
    </div>
  );
}
