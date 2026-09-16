'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import RankingBar from '../../../components/charts/RankingBar';
import BrandLine from '../../../components/charts/BrandLine';
import DrilldownModal from '../../../components/DrilldownModal';
import { NAVY, LIME } from '../../../lib/chartTheme';

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
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ''))
    ).toString();
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

  const fmt = (n) => (n || n === 0) ? Number(n).toLocaleString('en-IN') : '—';
  const fmtINR = (n) => (n || n === 0) ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

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
    </div>
  );

  return (
    <div>
      <div className="section-header">
        <h2 className="card-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>Livelihood — Enterprise</h2>
        <p className="section-sub">Members, market agencies, and FY profit — not mentorship hours or funding</p>
      </div>

      <div className="page-tabs" style={{ marginBottom: '24px' }}>
        <Link href="/livelihood/skilling" className="tab">Skilling</Link>
        <Link href="/livelihood/placement" className="tab">Placement</Link>
        <Link href="/livelihood/enterprise" className="tab tab--active">Enterprise</Link>
      </div>

      {data && (
        <>
          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-header"><h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Enterprise members</h3></div>
            <div className="card-body">
              <div className="kpi-grid">
                <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('enterprise_total')}>
                  <div className="kpi-body">
                    <div className="kpi-value">{fmt(data.mentorship?.total_members)}</div>
                    <div className="kpi-label">Total members</div>
                    <p className="kpi-caption">COUNT(enterprise_support.member_id). Not mentorship sessions or hours.</p>
                  </div>
                </div>
                <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('enterprise_active')}>
                  <div className="kpi-body">
                    <div className="kpi-value">{fmt(data.mentorship?.active_members)}</div>
                    <div className="kpi-label">Active members</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{data.mentorship?.districts_covered || '—'}</div>
                    <div className="kpi-label">Districts covered</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-header"><h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Market access</h3></div>
            <div className="card-body">
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{fmt(data.market?.total_records)}</div>
                    <div className="kpi-label">Market access records</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{fmt(data.market?.agency_count)}</div>
                    <div className="kpi-label">Unique agencies</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{fmtINR(data.market?.total_sales_generated)}</div>
                    <div className="kpi-label">Parsed sales estimate</div>
                    <p className="kpi-caption">{data.market?.sales_caption || 'Parsed from sales_generated_average text, not an audited total.'}</p>
                  </div>
                </div>
              </div>

              <div className="card-row" style={{ marginTop: '16px' }}>
                <div className="card" style={{ flex: 1 }}>
                  <div className="card-header"><h3>Agencies</h3></div>
                  <div className="card-body">
                    <RankingBar
                      items={(data.market?.top_agencies || []).map(r => ({ label: r.name, value: r.count }))}
                      color={NAVY}
                      caption="Record counts by agency_name."
                    />
                  </div>
                </div>
                <div className="card" style={{ flex: 1 }}>
                  <div className="card-header"><h3>Access types</h3></div>
                  <div className="card-body">
                    <RankingBar
                      items={(data.market?.market_access_type_breakdown || []).map(r => ({ label: r.market_access_type, value: r.count }))}
                      color={LIME}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>FY profit</h3></div>
            <div className="card-body">
              <div className="kpi-grid" style={{ marginBottom: '20px' }}>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{data.funding?.fy_covered || '—'}</div>
                    <div className="kpi-label">Financial years</div>
                    <p className="kpi-caption">FY strings are not the same as calendar year.</p>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{fmtINR(data.funding?.latest_fy_profit)}</div>
                    <div className="kpi-label">Latest FY profit</div>
                    <p className="kpi-caption">enterprise_support_monitoring.profit — not funding agency/amount/type.</p>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{data.funding?.yoy_growth_pct || '0'}%</div>
                    <div className="kpi-label">YoY profit change</div>
                  </div>
                </div>
              </div>
              <BrandLine
                labels={data.funding?.fy_breakdown?.map(r => 'FY ' + r.fy) || []}
                values={data.funding?.fy_breakdown?.map(r => r.profit) || []}
                rupee
                label="Profit (₹)"
                caption="Profit, not funding. MA_enterprise_support_monitoring is not synced (API error)."
                onPointClick={(_, __, idx) => {
                  const fy = data.funding?.fy_breakdown?.[idx]?.fy;
                  handleDrilldown('enterprise_fy_profit', fy);
                }}
              />
            </div>
          </div>

          {data.market?.agencies && data.market.agencies.length > 0 && (
            <div className="card" style={{ marginTop: '24px', marginBottom: '24px' }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Market access & agency partnerships</h3>
                <span className="badge badge--success" style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', background: 'var(--navy)', color: 'white' }} onClick={() => handleDrilldown('market_access')}>
                  View raw data
                </span>
              </div>
              <div className="card-body">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)' }}>
                        <th style={{ padding: '12px 8px', fontWeight: '600' }}>Agency Name</th>
                        <th style={{ padding: '12px 8px', fontWeight: '600' }}>Market Access Type</th>
                        <th style={{ padding: '12px 8px', fontWeight: '600' }}>Avg Sales (raw text)</th>
                        <th style={{ padding: '12px 8px', fontWeight: '600' }}>Financial Year</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.market.agencies.map(agency => (
                        <tr key={agency.access_id} style={{ borderBottom: '1px solid var(--surface2)' }}>
                          <td style={{ padding: '12px 8px', fontWeight: '500', color: 'var(--text)' }}>{agency.agency_name}</td>
                          <td style={{ padding: '12px 8px', color: 'var(--muted)' }}>{agency.market_access_type}</td>
                          <td style={{ padding: '12px 8px', fontWeight: '600', color: 'var(--navy)' }}>{agency.sales_generated_average}</td>
                          <td style={{ padding: '12px 8px', color: 'var(--muted)' }}>{agency.financial_year}</td>
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
