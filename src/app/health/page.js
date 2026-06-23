'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import DrilldownModal from '../../components/DrilldownModal';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

const PALETTE = ['#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fff1f2'];

export default function HealthPage() {
  const [data, setData] = useState({
    reach: null,
    depth: null,
    inclusion: null,
    sustainability: null
  });
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, title: '', apiUrl: '', params: {} });

  useEffect(() => {
    const handleApply = (e) => setFilters(e.detail || {});
    window.addEventListener('app:filters:apply', handleApply);
    return () => window.removeEventListener('app:filters:apply', handleApply);
  }, []);

  const fetchAllData = React.useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams(filters).toString();
    try {
      const [reach, depth, inclusion, sustainability] = await Promise.all([
        axios.get(`/api/health/reach?${query}`),
        axios.get(`/api/health/depth?${query}`),
        axios.get(`/api/health/inclusion?${query}`),
        axios.get(`/api/health/sustainability?${query}`)
      ]);
      setData({ reach: reach.data, depth: depth.data, inclusion: inclusion.data, sustainability: sustainability.data });
    } catch (err) {
      console.error('Data load failed');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const fmt = (n) => n?.toLocaleString() || '—';
  const fmtINR = (n) => n ? `₹${(n / 100000).toFixed(2)}L` : '—';

  const handleDrilldown = (type, label) => {
    setModal({
      isOpen: true,
      title: `${type.charAt(0).toUpperCase() + type.slice(1)}: ${label}`,
      apiUrl: '/api/health/drilldown',
      params: { ...filters, type, value: label }
    });
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
      <div className="spinner"></div>
      {/* <span style={{ marginLeft: '12px', color: '#64748b', fontWeight: 500 }}>Synchronizing Health Data...</span> */}
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="section-header">
        <h2 className="card-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>Health Programme</h2>
        <p className="section-sub">Patient reach, depth of care, inclusion & sustainability</p>
      </div>

      {/* Reach KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('patients', 'Direct Beneficiaries')}>
          <div className="kpi-body">
            <div className="kpi-value">{fmt(data.reach?.direct_beneficiaries)}</div>
            <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Direct Beneficiaries</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-body">
            <div className="kpi-value">{fmt(data.reach?.villages_reached)}</div>
            <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Villages Reached</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-body">
            <div className="kpi-value">{fmt(data.reach?.states_reached)}</div>
            <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>States Reached</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-body">
            <div className="kpi-value">{fmt(data.reach?.adolescents_10_19)}</div>
            <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Adolescents (10–19)</div>
          </div>
        </div>
      </div>

      {/* Depth Row */}
      <div className="card-row">
        <div className="card" style={{ flex: 2 }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Disease Trends (Year-on-Year)</h3>
          </div>
          <div className="card-body">
            <div className="h-[300px]">
              <Bar
                data={{
                  labels: data.depth?.disease_yoy?.map(r => r.disease) || [],
                  datasets: [
                    { label: 'Last Year', data: data.depth?.disease_yoy?.map(r => r.last_year) || [], backgroundColor: '#94a3b8' },
                    { label: 'This Year', data: data.depth?.disease_yoy?.map(r => r.this_year) || [], backgroundColor: '#e11d48' }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: (e, elements) => {
                    if (elements.length > 0) {
                      const idx = elements[0].index;
                      handleDrilldown('disease', data.depth?.disease_yoy?.[idx]?.disease);
                    }
                  },
                  plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11, weight: '600' } } } }
                }}
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ flex: 1 }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Depth of Care</h3>
          </div>
          <div className="card-body">
            <div className="stat-row">
              <span className="stat-label">Repeat Patient Rate</span>
              <span className="stat-value">{data.depth?.repeat_patient_pct || '0'}%</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Money Saved (Tariff)</span>
              <span className="stat-value">{fmtINR(data.depth?.money_saved?.tariff_saved)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Money Saved (Wage Loss)</span>
              <span className="stat-value">{fmtINR(data.depth?.money_saved?.wage_loss_saved)}</span>
            </div>
            <div className="stat-row stat-row--total">
              <span className="stat-label">Total Money Saved</span>
              <span className="stat-value text-[#16a34a]">{fmtINR(data.depth?.money_saved?.total)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card-row">
        <div className="card" style={{ width: '100%' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Symptom Trends (Year-on-Year)</h3>
          </div>
          <div className="card-body">
            <div className="h-[300px]">
              <Bar
                data={{
                  labels: data.depth?.symptom_yoy?.map(r => r.symptom) || [],
                  datasets: [
                    { label: 'Last Year', data: data.depth?.symptom_yoy?.map(r => r.last_year) || [], backgroundColor: '#cbd5e1' },
                    { label: 'This Year', data: data.depth?.symptom_yoy?.map(r => r.this_year) || [], backgroundColor: '#fb7185' }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: (e, elements) => {
                    if (elements.length > 0) {
                      const idx = elements[0].index;
                      handleDrilldown('symptom', data.depth?.symptom_yoy?.[idx]?.symptom);
                    }
                  },
                  plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11, weight: '600' } } } }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Inclusion Row */}
      <div className="card-row">
        <div className="card" style={{ flex: 2 }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Community Interventions</h3>
          </div>
          <div className="card-body">
            <div className="h-[300px]">
              <Doughnut
                data={{
                  labels: data.inclusion?.community_interventions?.map(r => r.community) || [],
                  datasets: [{
                    data: data.inclusion?.community_interventions?.map(r => r.count) || [],
                    backgroundColor: PALETTE
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: (e, elements) => {
                    if (elements.length > 0) {
                      const idx = elements[0].index;
                      handleDrilldown('community', data.inclusion.community_interventions[idx].community);
                    }
                  },
                  plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } }
                }}
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ flex: 1 }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Inclusion Metrics</h3>
          </div>
          <div className="card-body">
            <div className="stat-row">
              <span className="stat-label">Senior Citizens (60+)</span>
              <span className="stat-value">{fmt(data.inclusion?.senior_citizens)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Persons with Disability</span>
              <span className="stat-value">{fmt(data.inclusion?.people_with_disability)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Women</span>
              <span className="stat-value">{fmt(data.inclusion?.women_count)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sustainability Card */}
      <div className="card" style={{ width: '100%' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Sustainability</h3>
        </div>
        <div className="card-body">
          <div className="stat-highlight">
            <div className="stat-highlight__value">{fmt(data.sustainability?.co2_saved)}</div>
            <div className="stat-highlight__label">CO₂ Saved (kg)</div>
            <div className="stat-highlight__formula">
              {data.sustainability?.co2_formula || 'Calculated based on logistical optimization and telemedicine impact.'}
            </div>
          </div>
        </div>
      </div>

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
