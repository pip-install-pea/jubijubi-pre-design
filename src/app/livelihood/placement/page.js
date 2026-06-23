'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, PointElement, LineElement
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import DrilldownModal from '../../../components/DrilldownModal';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, PointElement, LineElement);

const PALETTE = ['#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fff1f2'];

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
    const query = new URLSearchParams(filters).toString();
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

  const fmt = (n) => n?.toLocaleString() || '—';
  const fmtINR = (n) => n ? `₹${(n / 100000).toFixed(2)}L` : '—';

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
      {/* <span style={{ marginLeft: '12px', color: '#64748b', fontWeight: 500 }}>Synchronizing Livelihood Intelligence...</span> */}
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="section-header">
        <h2 className="card-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>Livelihood — Placement</h2>
        <p className="section-sub">Empowerment through skilling, placement and enterprise support</p>
      </div>

      {/* Tabs */}
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
                <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Total Monitored</div>
              </div>
            </div>
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('placement_status', 'Working')}>
              <div className="kpi-body">
                <div className="kpi-value">
                  {data.status?.breakdown?.find(r => r.status === 'Working')?.percent || '—'}%
                </div>
                <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Placement Rate</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{fmtINR(data.yoy?.[data.yoy.length - 1]?.avg_income)}</div>
                <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Latest Avg Monthly Income</div>
              </div>
            </div>
          </div>

          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Placement Status</h3></div>
              <div className="card-body">
                <div className="h-[280px]">
                  <Doughnut
                    data={{
                      labels: data.status?.breakdown?.map(r => r.status) || [],
                      datasets: [{ data: data.status?.breakdown?.map(r => r.count) || [], backgroundColor: PALETTE }]
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'bottom' } },
                      onClick: (e, els) => els.length && handleDrilldown('placement_status', data.status?.breakdown?.[els[0].index]?.status)
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Income Range (Placed Only)</h3></div>
              <div className="card-body">
                <div className="h-[280px]">
                  <Bar
                    data={{
                      labels: ['₹0–5K', '₹5K–10K', '₹10K+'],
                      datasets: [{ data: [data.incomeRange?.['0_5000'], data.incomeRange?.['5001_10000'], data.incomeRange?.['10001_plus']], backgroundColor: PALETTE }]
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      onClick: (e, els) => {
                        const labels = ['0_5000', '5001_10000', '10001_plus'];
                        if (els.length) handleDrilldown('income_range', labels[els[0].index], { placed_only: '1' });
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-header"><h3>Average Monthly Income Trend (Year-on-Year)</h3></div>
            <div className="card-body">
              <div className="h-[280px]">
                <Line
                  data={{
                    labels: data.yoy?.map(r => r.year) || [],
                    datasets: [{
                      label: 'Avg Monthly Income',
                      data: data.yoy?.map(r => r.avg_income) || [],
                      borderColor: PALETTE[0],
                      backgroundColor: PALETTE[0] + '33',
                      fill: true,
                      tension: 0.3
                    }]
                  }}
                  options={{
                    maintainAspectRatio: false,
                    onClick: (e, els) => els.length && handleDrilldown('placement_year', data.yoy?.[els[0].index]?.year)
                  }}
                />
              </div>
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
