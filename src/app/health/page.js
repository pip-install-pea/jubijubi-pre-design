'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import RankingBar from '../../components/charts/RankingBar';
import BrandDoughnut from '../../components/charts/BrandDoughnut';
import GroupedBar from '../../components/charts/GroupedBar';
import DrilldownModal from '../../components/DrilldownModal';
import { NAVY, SKY } from '../../lib/chartTheme';

export default function HealthPage() {
  const [data, setData] = useState({
    reach: null,
    depth: null,
    inclusion: null
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
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ''))
    ).toString();
    try {
      const [reach, depth, inclusion] = await Promise.all([
        axios.get(`/api/health/reach?${query}`),
        axios.get(`/api/health/depth?${query}`),
        axios.get(`/api/health/inclusion?${query}`)
      ]);
      setData({ reach: reach.data, depth: depth.data, inclusion: inclusion.data });
    } catch (err) {
      console.error('Data load failed');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const fmt = (n) => (n || n === 0) ? Number(n).toLocaleString('en-IN') : '—';
  const fmtINR = (n) => (n || n === 0) ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

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
    </div>
  );

  const yearLabel = data.reach?.envelope_year || filters.year || new Date().getFullYear();

  return (
    <div>
      <div className="section-header">
        <h2 className="card-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>Health Programme</h2>
        <p className="section-sub">Year envelope reach, disease mix, and patient-table inclusion</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('patients', 'Direct Beneficiaries')}>
          <div className="kpi-body">
            <div className="kpi-value">{fmt(data.reach?.direct_beneficiaries)}</div>
            <div className="kpi-label">Direct beneficiaries</div>
            <p className="kpi-caption">{data.reach?.caption}</p>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-body">
            <div className="kpi-value">{fmt(data.reach?.villages_reached)}</div>
            <div className="kpi-label">Villages reached</div>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-body">
            <div className="kpi-value">{fmt(data.reach?.states_reached)}</div>
            <div className="kpi-label">States reached</div>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-body">
            <div className="kpi-value">{fmt(data.reach?.adolescents_10_19)}</div>
            <div className="kpi-label">Adolescents (10–19)</div>
            <p className="kpi-caption">Age band only — no Swasthya Prahari programme flag</p>
          </div>
        </div>
      </div>

      <div className="card-row">
        <div className="card" style={{ flex: 2 }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Patients by disease · calendar year {data.depth?.disease_mix_year || yearLabel}</h3>
          </div>
          <div className="card-body">
            <RankingBar
              items={(data.depth?.disease_mix || []).map(r => ({ label: r.disease, value: r.patients }))}
              color={NAVY}
              caption="From health_desease.php year summary, not appointment text."
              onBarClick={(label) => handleDrilldown('disease', label)}
            />
          </div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Depth of care</h3>
          </div>
          <div className="card-body">
            <div className="stat-row">
              <span className="stat-label">Repeat patient rate</span>
              <span className="stat-value">{data.depth?.repeat_patient_pct || '0'}%</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Appointments (synced window)</span>
              <span className="stat-value">{fmt(data.depth?.total_appointments)}</span>
            </div>
            <div className="stat-row stat-row--total">
              <span className="stat-label">Fees collected</span>
              <span className="stat-value">{fmtINR(data.depth?.fees_collected)}</span>
            </div>
            <p className="kpi-caption">Fees from paid_amount. Not tariff savings or wage-loss avoided.</p>
          </div>
        </div>
      </div>

      {data.depth?.disease_yoy?.length > 0 && (
        <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>
              Disease mix year-on-year · {data.depth.disease_yoy[0]?.last_year_label} vs {data.depth.disease_yoy[0]?.this_year_label}
            </h3>
          </div>
          <div className="card-body">
            <GroupedBar
              horizontal
              labels={data.depth.disease_yoy.map(r => r.disease)}
              datasets={[
                { label: data.depth.disease_yoy[0]?.last_year_label, data: data.depth.disease_yoy.map(r => r.last_year), color: SKY },
                { label: data.depth.disease_yoy[0]?.this_year_label, data: data.depth.disease_yoy.map(r => r.this_year), color: NAVY }
              ]}
              caption="Shown only when two years of disease summary exist."
              onBarClick={(label) => handleDrilldown('disease', label)}
            />
          </div>
        </div>
      )}

      <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Patients by symptom · calendar year {data.depth?.disease_mix_year || yearLabel}</h3>
        </div>
        <div className="card-body">
          <RankingBar
            items={(data.depth?.symptom_mix || []).map(r => ({ label: r.symptom, value: r.patients }))}
            color={SKY}
            caption="From health_symtoms.php year summary."
            onBarClick={(label) => handleDrilldown('symptom', label)}
          />
        </div>
      </div>

      <div className="card-row">
        <div className="card" style={{ flex: 2 }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Community (caste_id) · synced patients</h3>
          </div>
          <div className="card-body">
            <BrandDoughnut
              labels={(data.inclusion?.community_interventions || []).map(r => r.community)}
              values={(data.inclusion?.community_interventions || []).map(r => r.count)}
              caption="Raw caste_id values from the patient table."
              onSliceClick={(label) => handleDrilldown('community', label)}
            />
          </div>
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Inclusion (patient table)</h3>
          </div>
          <div className="card-body">
            <div className="stat-row">
              <span className="stat-label">Senior citizens (60+)</span>
              <span className="stat-value">{fmt(data.inclusion?.senior_citizens)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Persons with disability</span>
              <span className="stat-value">{fmt(data.inclusion?.people_with_disability)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Women (gender = F)</span>
              <span className="stat-value">{fmt(data.inclusion?.women_count)}</span>
            </div>
            <p className="kpi-caption">{data.inclusion?.caption}</p>
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
