'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Handshake, Storefront } from '@phosphor-icons/react';
import RankingBar from '../../../components/charts/RankingBar';
import BrandLine from '../../../components/charts/BrandLine';
import ColumnBar from '../../../components/charts/ColumnBar';
import { formatCount, formatINR, formatINRFull } from '../../../lib/format';
import EChart, {
  roseOption,
  groupedBarOption
} from '../../../components/charts/EChart';
import FarmerGrowth from '../../../components/charts/FarmerGrowth';
import DrilldownModal from '../../../components/DrilldownModal';

function phaseIncomeOption(rows) {
  const list = rows || [];
  const option = groupedBarOption(
    list.map((row) => row.label),
    [
      { label: 'Mean pre individual', data: list.map((row) => (row.n_pre ? row.avg_pre : null)), color: '#1d4ed8' },
      { label: 'Mean post individual', data: list.map((row) => (row.n_post ? row.avg_post : null)), color: '#f97316' }
    ],
    { showLabels: true }
  );
  option.series.forEach((series, seriesIndex) => {
    series.label = {
      show: true,
      position: 'top',
      formatter: (point) => {
        const row = list[point.dataIndex] || {};
        const n = seriesIndex === 0 ? row.n_pre : row.n_post;
        const raw = point.value && typeof point.value === 'object' ? point.value.value : point.value;
        if (!Number.isFinite(Number(raw))) return '';
        return `${formatINR(raw)} (n=${formatCount(n)})`;
      }
    };
  });
  return option;
}

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
      let farmers = { data: { status: 'no_data', farmers: 0, by_location: [] } };
      let didi = { data: { status: 'no_data' } };
      try {
        farmers = await axios.get(`/api/livelihood/mixprogram/farmers?${query}`);
      } catch {
        farmers = { data: { status: 'no_data', farmers: 0, by_location: [] } };
      }
      try {
        didi = await axios.get(`/api/livelihood/mixprogram/didi?${query}`);
      } catch {
        didi = { data: { status: 'no_data' } };
      }
      setData({
        mentorship: mentorship.data,
        market: market.data,
        funding: funding.data,
        farmers: farmers.data,
        didi: didi.data
      });
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
  const monthGap = filters.month
    ? <p className="chart-caption">Month filter not available for this data</p>
    : null;

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

      {data && (
        <>
          {data.farmers?.status === 'ok' && ((data.farmers.by_year || []).length > 0 || data.farmers.farmers > 0) && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Jubifarm farmers</h3>
              </div>
              <div className="card-body">
                {monthGap}
                <p className="chart-caption">Each year is a running total of farmers on the field sheet, not new farmers only.</p>
                <FarmerGrowth
                  byYear={data.farmers.by_year || []}
                  locationsByYear={data.farmers.locations_by_year || {}}
                  onYearClick={(year) => handleDrilldown('mix_farmer_year', year)}
                  showIcon
                />
              </div>
            </div>
          )}

          {data.didi?.status === 'ok' && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Didi ki dukan</h3>
              </div>
              <div className="card-body">
                {monthGap}
                <p className="chart-caption">No outside funding – completely by JBF</p>
                <div className="kpi-grid">
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-value">{fmt(data.didi.people)}</div>
                      <div className="kpi-label">Women</div>
                      <p className="kpi-caption">Counted per phase; a woman in more than one phase is counted in each.</p>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-label">Training duration (days)</div>
                      {(data.didi.by_duration || []).map((row) => (
                        <p key={row.label} className="kpi-caption">{row.label}: {fmt(row.value)}</p>
                      ))}
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-value">{formatINR(data.didi.avg_pre_ind)}</div>
                      <div className="kpi-label">Mean pre individual</div>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-value">{formatINR(data.didi.avg_post_ind)}</div>
                      <div className="kpi-label">Mean post individual</div>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-value">{formatINR(data.didi.avg_post)}</div>
                      <div className="kpi-label">Mean post household</div>
                    </div>
                  </div>
                </div>
                <div className="card-row" style={{ marginTop: '16px' }}>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>Women in each phase</h3></div>
                    <div className="card-body">
                      <EChart
                        option={groupedBarOption(
                          (data.didi.by_phase || []).map((r) => r.label),
                          [{ label: 'Women', data: (data.didi.by_phase || []).map((r) => Number(r.value) || 0) }],
                          { showLabels: true, legend: false }
                        )}
                        height={360}
                        caption="Counted per phase; a woman in more than one phase is counted in each."
                        onPoint={(p) => p.name && handleDrilldown('mix_didi_phase', p.name)}
                      />
                      <EChart
                        option={phaseIncomeOption(data.didi.by_phase_income)}
                        height={320}
                        caption="Mean individual income by phase. A phase with no recorded pre income shows no pre bar (no pre data). Values are not labelled monthly or annual."
                      />
                    </div>
                  </div>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>Individual income change, pre to post</h3></div>
                    <div className="card-body">
                      <ColumnBar
                        labels={(data.didi.income_change || []).map((r) => r.label)}
                        series={[
                          { label: 'Female', data: (data.didi.income_change || []).map((r) => Number(r.female) || 0) },
                          { label: 'Male', data: (data.didi.income_change || []).map((r) => Number(r.male) || 0) }
                        ]}
                        axisTitle="No. of candidates"
                        caption={`Women with both a recorded individual pre and post income (n = ${fmt((data.didi.income_change || []).reduce((sum, row) => sum + (Number(row.value) || 0), 0))}). Zero and blank values are left out. Household post income stays in the KPI above.`}
                      />
                    </div>
                  </div>
                </div>
                <div className="card-row" style={{ marginTop: '16px' }}>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>Women entrepreneurs location-wise</h3></div>
                    <div className="card-body">
                      <EChart
                        option={groupedBarOption(
                          (data.didi.by_location || []).map((row) => row.label),
                          [{ label: 'Women', data: (data.didi.by_location || []).map((row) => Number(row.value) || 0) }],
                          { horizontal: true, showLabels: true, legend: false, withPercent: true, gridLeft: 120 }
                        )}
                        height={Math.max(220, (data.didi.by_location || []).length * 36)}
                        onPoint={(p) => p.name && handleDrilldown('mix_didi_location', p.name)}
                      />
                    </div>
                  </div>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>Gender</h3></div>
                    <div className="card-body">
                      <EChart
                        option={roseOption(data.didi.by_gender)}
                        onPoint={(p) => p.name && handleDrilldown('mix_didi_gender', p.name)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(data.farmers?.other || []).map((prog) => (
            <div className="card" style={{ marginBottom: '24px' }} key={prog.program_id}>
              <div className="card-header">
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>{prog.label}</h3>
              </div>
              <div className="card-body">
                <div className="kpi-grid">
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-value">{fmt(prog.rows)}</div>
                      <div className="kpi-label">Rows</div>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-value">{fmt(prog.locations)}</div>
                      <div className="kpi-label">Locations</div>
                    </div>
                  </div>
                </div>
                {(prog.by_location || []).length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <RankingBar items={prog.by_location} />
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-header"><h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Enterprise members</h3></div>
            <div className="card-body">
              {monthGap}
              <p className="chart-caption">Members recorded in enterprise support. Active means status 1.</p>
              <div className="kpi-grid">
                <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('enterprise_total')}>
                  <div className="kpi-body">
                    <div className="kpi-value">{fmt(data.mentorship?.total_members)}</div>
                    <div className="kpi-label">Total members</div>
                  </div>
                </div>
                <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('enterprise_active')}>
                  <div className="kpi-body">
                    <div className="kpi-value">{fmt(data.mentorship?.active_members)}</div>
                    <div className="kpi-label">Active members</div>
                  </div>
                </div>
                <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('enterprise_active')}>
                  <div className="kpi-body">
                    <div className="kpi-value">{
                      data.mentorship?.total_members
                        ? `${(((Number(data.mentorship.active_members) || 0) / Number(data.mentorship.total_members)) * 100).toFixed(1)}%`
                        : '—'
                    }</div>
                    <div className="kpi-label">Active share</div>
                    <p className="kpi-caption">Active members / total</p>
                  </div>
                </div>
                <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('enterprise_districts')}>
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
              {monthGap}
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{fmt(data.market?.total_records)}</div>
                    <div className="kpi-label"><Storefront size={16} style={{ marginRight: 6 }} />Market access records</div>
                    <p className="kpi-caption">Rows in the market-access list.</p>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{fmt(data.market?.agency_count)}</div>
                    <div className="kpi-label"><Handshake size={16} style={{ marginRight: 6 }} />Unique agencies</div>
                    <p className="kpi-caption">Distinct agency names on those rows.</p>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{formatINR(data.market?.total_sales_generated)}</div>
                    <div className="kpi-label">Sales estimate</div>
                    <p className="kpi-caption">Sum of the agencies' reported average sales.</p>
                  </div>
                </div>
              </div>
              <EChart
                option={{
                  ...groupedBarOption(
                    (data.market?.sales_by_agency || []).map((row) => row.name),
                    [{ label: 'Reported sales', data: (data.market?.sales_by_agency || []).map((row) => row.sales) }],
                    { horizontal: true, showLabels: true, legend: false, gridLeft: 140 }
                  ),
                  tooltip: {
                    trigger: 'axis',
                    renderMode: 'richText',
                    formatter: (items) => {
                      const item = Array.isArray(items) ? items[0] : items;
                      const row = (data.market?.sales_by_agency || []).find((agency) => agency.name === item?.name) || {};
                      return [item?.name, formatINRFull(row.sales), row.band, row.access_type].filter(Boolean).join('\n');
                    }
                  }
                }}
                height={220}
                caption="Sales as reported (text bands), FY 2025-26"
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>FY profit</h3></div>
            <div className="card-body">
              {monthGap}
              <p className="chart-caption">Profit recorded on enterprise monitoring, by financial year.</p>
              <div className="kpi-grid" style={{ marginBottom: '20px' }}>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{data.funding?.fy_covered || '—'}</div>
                    <div className="kpi-label">Financial years</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-body">
                    <div className="kpi-value">{formatINR(data.funding?.latest_fy_profit)}</div>
                    <div className="kpi-label">Latest FY profit</div>
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
                  View details
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
