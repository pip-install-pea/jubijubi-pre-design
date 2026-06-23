'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, PointElement, LineElement
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import DrilldownModal from '../../../components/DrilldownModal';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, PointElement, LineElement);

const PALETTE = ['#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fff1f2'];

export default function EnterprisePage() {
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
      const [mentorship, market, funding] = await Promise.all([
        axios.get(`/api/livelihood/enterprise/mentorship?${query}`),
        axios.get(`/api/livelihood/enterprise/market_access?${query}`),
        axios.get(`/api/livelihood/enterprise/funding?${query}`)
      ]);
      setData({ mentorship: mentorship.data, market: market.data, funding: funding.data });
    } catch (err) {
      console.error('Enterprise data load failed', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fmt = (n) => n?.toLocaleString() || '—';
  const fmtINR = (n) => n ? `₹${(n / 100000).toFixed(2)}L` : '—';

  const handleDrilldown = (type, value = null) => {
    setModal({
      isOpen: true,
      title: `Detail View: ${value || type}`,
      apiUrl: '/api/livelihood/drilldown',
      params: { ...filters, type, value: value || '' }
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
        <h2 className="card-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>Livelihood — Enterprise</h2>
        <p className="section-sub">Empowerment through skilling, placement and enterprise support</p>
      </div>

      {/* Tabs */}
      <div className="page-tabs" style={{ marginBottom: '24px' }}>
        <Link href="/livelihood/skilling" className="tab">Skilling</Link>
        <Link href="/livelihood/placement" className="tab">Placement</Link>
        <Link href="/livelihood/enterprise" className="tab tab--active">Enterprise</Link>
      </div>

      {data && (
        <>
          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-header"><h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Enterprise Members</h3></div>
            <div className="card-body">
              <div className="kpi-grid">
                <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('enterprise_total')}>
                  <div className="kpi-body">
                    <div className="kpi-value">{fmt(data.mentorship?.total_members)}</div>
                    <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Total Members</div>
                  </div>
                </div>
                <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('enterprise_active')}>
                  <div className="kpi-body">
                    <div className="kpi-value">{fmt(data.mentorship?.active_members)}</div>
                    <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Active Members</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{data.mentorship?.districts_covered || '—'}</div>
                    <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Districts Covered</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-header"><h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Market Access Overview</h3></div>
            <div className="card-body">
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{fmt(data.market?.total_records)}</div>
                    <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Total Market Access Records</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{fmt(data.market?.agency_count)}</div>
                    <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Unique Agencies</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{fmtINR(data.market?.total_sales_generated)}</div>
                    <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Total Sales Generated</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{fmtINR(data.market?.avg_sales_generated)}</div>
                    <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Avg Sales Generated</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '24px' }}>
                <div className="kpi-card" style={{ padding: '16px' }}>
                  <div className="kpi-label" style={{ fontSize: '14px', fontWeight: 600 }}>Sales Generated Average Breakdown</div>
                  <ul style={{ marginTop: '12px', paddingLeft: '18px' }}>
                    {data.market?.sales_generated_average_breakdown?.map((item) => (
                      <li key={item.sales_generated_average} style={{ marginBottom: '8px', fontSize: '13px' }}>
                        <strong>{item.count}</strong> x {item.sales_generated_average}
                      </li>
                    ))}
                    {!data.market?.sales_generated_average_breakdown?.length && (
                      <li style={{ color: '#64748b', fontSize: '13px' }}>No sales categories available</li>
                    )}
                  </ul>
                </div>
                <div className="kpi-card" style={{ padding: '16px' }}>
                  <div className="kpi-label" style={{ fontSize: '14px', fontWeight: 600 }}>Market Access Type Breakdown</div>
                  <ul style={{ marginTop: '12px', paddingLeft: '18px' }}>
                    {data.market?.market_access_type_breakdown?.map((item) => (
                      <li key={item.market_access_type} style={{ marginBottom: '8px', fontSize: '13px' }}>
                        <strong>{item.count}</strong> x {item.market_access_type}
                      </li>
                    ))}
                    {!data.market?.market_access_type_breakdown?.length && (
                      <li style={{ color: '#64748b', fontSize: '13px' }}>No market access types available</li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="kpi-card" style={{ marginTop: '24px', padding: '16px' }}>
                <div className="kpi-label" style={{ fontSize: '14px', fontWeight: 600 }}>Top Agencies</div>
                <ul style={{ marginTop: '12px', paddingLeft: '18px' }}>
                  {data.market?.top_agencies?.slice(0, 10).map((item) => (
                    <li key={item.name} style={{ marginBottom: '8px', fontSize: '13px' }}>
                      <strong>{item.count}</strong> x {item.name}
                    </li>
                  ))}
                  {!data.market?.top_agencies?.length && (
                    <li style={{ color: '#64748b', fontSize: '13px' }}>No agency names available</li>
                  )}
                </ul>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Year-over-Year Profit</h3></div>
            <div className="card-body">
              <div className="kpi-grid" style={{ marginBottom: '20px' }}>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{data.funding?.fy_covered || '—'}</div>
                    <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Financial Years</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{fmtINR(data.funding?.latest_fy_profit)}</div>
                    <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Latest FY Profit</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{data.funding?.yoy_growth_pct || '0'}%</div>
                    <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>YoY Growth</div>
                  </div>
                </div>
              </div>
              <div className="h-[220px]">
                <Bar
                  data={{
                    labels: data.funding?.fy_breakdown?.map(r => 'FY ' + r.fy) || [],
                    datasets: [{ label: 'Profit (₹)', data: data.funding?.fy_breakdown?.map(r => r.profit) || [], backgroundColor: PALETTE[0], borderRadius: 6 }]
                  }}
                  options={{
                    maintainAspectRatio: false,
                    onClick: (e, els) => {
                      if (els.length) {
                        const fy = data.funding?.fy_breakdown?.[els[0].index]?.fy;
                        handleDrilldown('enterprise_fy_profit', fy);
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {data.market?.agencies && data.market.agencies.length > 0 && (
            <div className="card" style={{ marginTop: '24px', marginBottom: '24px' }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Market Access & Agency Partnerships</h3>
                <span className="badge badge--success" style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', background: '#e11d48', color: 'white' }} onClick={() => handleDrilldown('market_access')}>
                  View Raw Data
                </span>
              </div>
              <div className="card-body">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                        <th style={{ padding: '12px 8px', fontWeight: '600' }}>Agency Name</th>
                        <th style={{ padding: '12px 8px', fontWeight: '600' }}>Market Access Type</th>
                        <th style={{ padding: '12px 8px', fontWeight: '600' }}>Avg Sales Generated</th>
                        <th style={{ padding: '12px 8px', fontWeight: '600' }}>Financial Year</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.market.agencies.map(agency => (
                        <tr key={agency.access_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 8px', fontWeight: '500', color: '#0f172a' }}>{agency.agency_name}</td>
                          <td style={{ padding: '12px 8px', color: '#475569' }}>{agency.market_access_type}</td>
                          <td style={{ padding: '12px 8px', fontWeight: '600', color: '#e11d48' }}>{agency.sales_generated_average}</td>
                          <td style={{ padding: '12px 8px', color: '#64748b' }}>{agency.financial_year}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
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
