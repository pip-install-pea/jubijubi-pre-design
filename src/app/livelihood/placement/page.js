'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import BrandDoughnut from '../../../components/charts/BrandDoughnut';
import ColumnBar from '../../../components/charts/ColumnBar';
import FunnelBars from '../../../components/charts/FunnelBars';
import EChart, { comboLineBarOption } from '../../../components/charts/EChart';
import DrilldownModal from '../../../components/DrilldownModal';

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
      const [status, incomeRange, yoy, funnel, distributions] = await Promise.all([
        axios.get(`/api/livelihood/placement/status?${query}`),
        axios.get(`/api/livelihood/placement/income_range?${query}`),
        axios.get(`/api/livelihood/placement/yoy_income?${query}`),
        axios.get(`/api/livelihood/placement/funnel?${query}`),
        axios.get(`/api/livelihood/placement/distributions?${query}`)
      ]);
      setData({
        status: status.data,
        incomeRange: incomeRange.data,
        yoy: yoy.data,
        funnel: funnel.data,
        distributions: distributions.data
      });
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

      {data && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('persons')}>
              <div className="kpi-body">
                <div className="kpi-value">{fmt(data.status?.total)}</div>
                <div className="kpi-label">People monitored</div>
                <p className="kpi-caption">All years</p>
              </div>
            </div>
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('placement_status', 'Working')}>
              <div className="kpi-body">
                <div className="kpi-value">
                  {data.status?.breakdown?.find(r => r.status === 'Working')?.percent || '—'}%
                </div>
                <div className="kpi-label">Share working</div>
                <p className="kpi-caption">All years</p>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{fmtINR(data.yoy?.[data.yoy.length - 1]?.median_income)}</div>
                <div className="kpi-label">Typical post income</div>
              </div>
            </div>
          </div>

          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Work status</h3></div>
              <div className="card-body">
                <p className="chart-caption">All years</p>
                <BrandDoughnut
                  labels={data.status?.breakdown?.map(r => r.status) || []}
                  values={data.status?.breakdown?.map(r => r.count) || []}
                  onSliceClick={(label) => handleDrilldown('placement_status', label)}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Field-sheet post income</h3></div>
              <div className="card-body">
                <ColumnBar
                  labels={['₹0–5K', '₹5K–10K', '₹10K+']}
                  values={[data.incomeRange?.['0_5000'], data.incomeRange?.['5001_10000'], data.incomeRange?.['10001_plus']]}
                  onBarClick={(_, __, idx) => {
                    const labels = ['0_5000', '5001_10000', '10001_plus'];
                    handleDrilldown('income_range', labels[idx], { placed_only: '1' });
                  }}
                />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-header"><h3>Skilling → placement → income</h3></div>
            <div className="card-body">
              <FunnelBars
                stages={data.funnel?.stages || []}
                caption="Roster and working still come from skill tracking. The last bar is field-sheet rows with post_income > 0, not monitor income."
                onBarClick={(stage) => handleDrilldown('funnel', stage?.key)}
              />
            </div>
          </div>

          <div className="card-row" style={{ marginTop: '24px' }}>
            <div className="card">
              <div className="card-header"><h3>Time to first working status</h3></div>
              <div className="card-body">
                <p className="chart-caption">All years</p>
                <ColumnBar
                  labels={(data.distributions?.time_to_placement || []).map((r) => r.label)}
                  values={(data.distributions?.time_to_placement || []).map((r) => r.value)}
                  onBarClick={(label) => handleDrilldown('time_to_placement', label)}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Income change (field-sheet pre to post)</h3></div>
              <div className="card-body">
                <ColumnBar
                  labels={(data.distributions?.income_delta || []).map((r) => r.label)}
                  values={(data.distributions?.income_delta || []).map((r) => r.value)}
                  onBarClick={(label) => handleDrilldown('income_delta', label)}
                />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-header"><h3>Typical post income by field-sheet year</h3></div>
            <div className="card-body">
              <EChart
                option={comboLineBarOption((data.yoy || []).map((r) => r.year), {
                  bar: (data.yoy || []).map((r) => Number(r.count) || 0),
                  line: (data.yoy || []).map((r) => Number(r.median_income) || 0),
                  barName: 'Rows with post income',
                  lineName: 'Median post income (₹)',
                  dualAxis: true
                })}
                onPoint={(p) => p.name && handleDrilldown('placement_year', p.name)}
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
