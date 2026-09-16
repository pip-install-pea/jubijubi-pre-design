'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import BrandDoughnut from '../../../components/charts/BrandDoughnut';
import ColumnBar from '../../../components/charts/ColumnBar';
import BrandLine from '../../../components/charts/BrandLine';
import DrilldownModal from '../../../components/DrilldownModal';
import { NAVY, SKY, GOLD } from '../../../lib/chartTheme';

export default function PlacementPage() {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, title: '', apiUrl: '', params: {} });

  useEffect(() => {
    const handleApply = (e) => setFilters(e.detail || {});
    window.addEventListener('app:filters:apply', handleApply);
    return () => window.removeEventListener('app:filters:apply', handleApply);
  }, []);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ''))
    ).toString();
    try {
      const [status, incomeRange, yoy] = await Promise.all([
        axios.get(`/api/livelihood/placement/status?${query}`),
        axios.get(`/api/livelihood/placement/income_range?${query}`),
        axios.get(`/api/livelihood/placement/yoy_income?${query}`)
      ]);
      setData({ status: status.data, incomeRange: incomeRange.data, yoy: yoy.data });
    } catch (err) {
      console.error('Placement data load failed', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fmt = (n) => (n || n === 0) ? Number(n).toLocaleString('en-IN') : '—';
  const fmtINR = (n) => (n || n === 0) ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

  const handleDrilldown = (type, value = null, extraParams = {}) => {
    setModal({
      isOpen: true,
      title: `Detail View: ${value || type}`,
      apiUrl: '/api/livelihood/drilldown',
      params: { ...filters, type, value: value || '', ...extraParams }
    });
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
      <div className="spinner"></div>
    </div>
  );

  return (
    <div>
      <div className="section-header">
        <h2 className="card-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>Livelihood — Placement</h2>
        <p className="section-sub">Monitored work status and current income — not a 4-way placement codebook</p>
      </div>

      <div className="page-tabs" style={{ marginBottom: '24px' }}>
        <Link href="/livelihood/skilling" className="tab">Skilling</Link>
        <Link href="/livelihood/placement" className="tab tab--active">Placement</Link>
        <Link href="/livelihood/enterprise" className="tab">Enterprise</Link>
      </div>

      {data && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('persons')}>
              <div className="kpi-body">
                <div className="kpi-value">{fmt(data.status?.total)}</div>
                <div className="kpi-label">Monitored people</div>
                <p className="kpi-caption">skilltracking_monitor rows. Not the full roster.</p>
              </div>
            </div>
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('placement_status', 'Working')}>
              <div className="kpi-body">
                <div className="kpi-value">
                  {data.status?.breakdown?.find(r => r.status === 'Working')?.percent || '—'}%
                </div>
                <div className="kpi-label">Share working (monitored)</div>
                <p className="kpi-caption">Working / Not Working only. Not employment / self-employment / study / not interested.</p>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{fmtINR(data.yoy?.[data.yoy.length - 1]?.avg_income)}</div>
                <div className="kpi-label">Latest avg monthly income</div>
                <p className="kpi-caption">Current income, not increase.</p>
              </div>
            </div>
          </div>

          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Work status doughnut</h3></div>
              <div className="card-body">
                <BrandDoughnut
                  labels={data.status?.breakdown?.map(r => r.status) || []}
                  values={data.status?.breakdown?.map(r => r.count) || []}
                  colors={[NAVY, SKY]}
                  caption="Monitored subset, not full roster."
                  onSliceClick={(label) => handleDrilldown('placement_status', label)}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Current income (working only)</h3></div>
              <div className="card-body">
                <ColumnBar
                  labels={['₹0–5K', '₹5K–10K', '₹10K+']}
                  values={[data.incomeRange?.['0_5000'], data.incomeRange?.['5001_10000'], data.incomeRange?.['10001_plus']]}
                  colors={[NAVY, SKY, GOLD]}
                  caption="Current monthly_income for work_status = Working. Not income increase."
                  onBarClick={(_, __, idx) => {
                    const labels = ['0_5000', '5001_10000', '10001_plus'];
                    handleDrilldown('income_range', labels[idx], { placed_only: '1' });
                  }}
                />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-header"><h3>Average monthly income by monitor year</h3></div>
            <div className="card-body">
              <BrandLine
                labels={data.yoy?.map(r => r.year) || []}
                values={data.yoy?.map(r => r.avg_income) || []}
                rupee
                label="Avg monthly income"
                caption="Sentinel dates (0000-00-00, 1970-01-01) are excluded."
                onPointClick={(label) => handleDrilldown('placement_year', label)}
              />
            </div>
          </div>
        </>
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
