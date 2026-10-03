'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import BrandDoughnut from '../../../components/charts/BrandDoughnut';
import ColumnBar from '../../../components/charts/ColumnBar';
import FunnelBars from '../../../components/charts/FunnelBars';
import EChart, { comboLineBarOption } from '../../../components/charts/EChart';
import DrilldownModal from '../../../components/DrilldownModal';
import { formatCount, formatINR, formatPercent } from '../../../lib/format';

function Indicator({ value, title, text, note }) {
  return (
    <div className="kpi-card">
      <div className="kpi-body">
        <div className="kpi-value">{value}</div>
        <div className="kpi-label">{title}</div>
        <p className="kpi-caption">{text}</p>
        {note && <p className="kpi-caption">{note}</p>}
      </div>
    </div>
  );
}

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
      const [status, incomeRange, yoy, funnel, distributions, indicators] = await Promise.all([
        axios.get(`/api/livelihood/placement/status?${query}`),
        axios.get(`/api/livelihood/placement/income_range?${query}`),
        axios.get(`/api/livelihood/placement/yoy_income?${query}`),
        axios.get(`/api/livelihood/placement/funnel?${query}`),
        axios.get(`/api/livelihood/placement/distributions?${query}`),
        axios.get(`/api/livelihood/placement/indicators?${query}`)
      ]);
      setData({
        status: status.data,
        incomeRange: incomeRange.data,
        yoy: yoy.data,
        funnel: funnel.data,
        distributions: distributions.data,
        indicators: indicators.data
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
          {data.indicators?.status === 'ok' && (
            <div className="kpi-grid">
              <Indicator
                value={formatCount(data.indicators.trained)}
                title="Candidates Trained"
                text="Number of candidates who completed the training"
              />
              <Indicator
                value={formatCount(data.indicators.placed)}
                title="Candidates Placed"
                text="Number of candidates who secured employment"
                note={`${formatPercent(data.indicators.placed_pct)} of all candidates`}
              />
              <Indicator
                value={formatPercent(data.indicators.placed_pct)}
                title="Placement Rate"
                text="Placed candidates ÷ placement-eligible candidates × 100"
                note="Placed ÷ all candidates on the M&E sheet. Not yet adjusted for placement eligibility."
              />
              <Indicator
                value={formatPercent(data.indicators.self_pct)}
                title="Self-Employment Rate"
                text="Candidates starting their own income-generating activity"
              />
              <Indicator
                value={formatINR(data.indicators.avg_placed_post)}
                title="Average Starting Salary (proxy)"
                text="Average salary at the time of placement"
                note={`Post-training income of placed candidates; the sheet has no salary-at-placement field. n = ${formatCount(data.indicators.n_placed_post)}.`}
              />
              <Indicator
                value={formatINR(data.indicators.median_placed_post)}
                title="Median Starting Salary (proxy)"
                text="Median salary, useful when salaries vary significantly"
                note={`Post-training income of placed candidates; the sheet has no salary-at-placement field. n = ${formatCount(data.indicators.n_placed_post)}.`}
              />
              <Indicator
                value={formatINR(data.indicators.avg_post)}
                title="Post-Training Income"
                text="Income earned after completing the program"
                note={`Average of candidates with a recorded income (n = ${formatCount(data.indicators.n_post)}). Zero and blank values are left out.`}
              />
              <Indicator
                value={formatINR(data.indicators.avg_delta)}
                title="Income Increase"
                text="Change in income compared with the pre-training level"
                note={`Based on n = ${formatCount(data.indicators.n_pairs)} candidates with both pre and post income.`}
              />
              <Indicator
                value={formatCount(data.indicators.employers?.employer_count)}
                title="Employer Linkages"
                text="Number of employers/companies engaged for recruitment"
                note="Employers named in the placement-status field; there is no separate employer field yet."
              />
              <Indicator
                value={formatPercent(data.indicators.female_rate)}
                title="Female Placement Rate"
                text="Placement rate among female candidates"
                note={`Male ${formatPercent(data.indicators.male_rate)} (${formatCount(data.indicators.men_placed)}/${formatCount(data.indicators.men)})`}
              />
            </div>
          )}
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
                <p className="chart-caption">All years. Skill-tracking follow-ups, split by gender. The slices add up to {formatCount(data.status?.total)}.</p>
                <div className="card-row">
                  {(data.status?.by_gender || []).map((group) => (
                    <BrandDoughnut
                      key={group.gender}
                      title={`${group.gender} (n = ${formatCount(group.total)})`}
                      labels={group.breakdown.map((row) => row.status)}
                      values={group.breakdown.map((row) => row.count)}
                      percents={group.breakdown.map((row) => row.percent)}
                      percent
                      onSliceClick={(label) => handleDrilldown('placement_status', label, {
                        slice_gender: group.gender === 'Gender not recorded' ? 'Not recorded' : group.gender
                      })}
                    />
                  ))}
                </div>
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
              <div className="card-header"><h3>Median time to first employment</h3></div>
              <div className="card-body">
                <p className="kpi-value">{data.distributions?.median_days == null ? '—' : `${formatCount(data.distributions.median_days)} days`}</p>
                <p className="chart-caption">
                  All years. Skill-tracking follow-ups only (n = {formatCount(data.distributions?.n)}). The M&E sheet has no placement date.
                  {(data.distributions?.excluded_bad_date || 0) + (data.distributions?.excluded_negative || 0) > 0
                    ? ` Left out: ${formatCount(data.distributions?.excluded_bad_date)} with a 1970 or blank-era date, ${formatCount(data.distributions?.excluded_negative)} with a negative gap.`
                    : ''}
                </p>
                <ColumnBar
                  labels={(data.distributions?.time_to_placement || []).map((r) => r.label)}
                  values={(data.distributions?.time_to_placement || []).map((r) => r.value)}
                  axisTitle="No. of candidates"
                  onBarClick={(label) => handleDrilldown('time_to_placement', label)}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Income change (field-sheet pre to post)</h3></div>
              <div className="card-body">
                <ColumnBar
                  labels={(data.distributions?.income_delta || []).map((r) => r.label)}
                  series={[
                    { label: 'Female', data: (data.distributions?.income_delta || []).map((r) => Number(r.female) || 0) },
                    { label: 'Male', data: (data.distributions?.income_delta || []).map((r) => Number(r.male) || 0) }
                  ]}
                  axisTitle="No. of candidates"
                  caption={`Candidates with both a recorded pre and post income (n = ${formatCount((data.distributions?.income_delta || []).reduce((sum, row) => sum + (Number(row.value) || 0), 0))}). Zero and blank values are left out.`}
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
