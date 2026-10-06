'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Briefcase, Users } from '@phosphor-icons/react';
import BrandDoughnut from '../../../components/charts/BrandDoughnut';
import ColumnBar from '../../../components/charts/ColumnBar';
import FunnelBars from '../../../components/charts/FunnelBars';
import EChart, { groupedBarOption } from '../../../components/charts/EChart';
import DrilldownModal from '../../../components/DrilldownModal';
import { formatCount, formatINR, formatINRFull, formatPercent } from '../../../lib/format';

const INCOME_COLORS = ['#1d4ed8', '#0f766e', '#f97316'];

function Indicator({ value, title, text, note, icon }) {
  return (
    <div className="kpi-card">
      <div className="kpi-body">
        <div className="kpi-value">{value}</div>
        <div className="kpi-label">{icon}{title}</div>
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
      const [status, incomeRange, yoy, distributions, indicators, placementRate, outcomeFunnel, incomeByYear] = await Promise.all([
        axios.get(`/api/livelihood/placement/status?${query}`),
        axios.get(`/api/livelihood/placement/income_range?${query}`),
        axios.get(`/api/livelihood/placement/yoy_income?${query}`),
        axios.get(`/api/livelihood/placement/distributions?${query}`),
        axios.get(`/api/livelihood/placement/indicators?${query}`),
        axios.get(`/api/livelihood/decisions/placement-rate?${query}`).catch(() => ({ data: { status: 'no_data' } })),
        axios.get(`/api/livelihood/decisions/funnel?${query}`).catch(() => ({ data: { status: 'no_data' } })),
        axios.get(`/api/livelihood/decisions/income-by-year?${query}`).catch(() => ({ data: { status: 'no_data' } }))
      ]);
      setData({
        status: status.data,
        incomeRange: incomeRange.data,
        yoy: yoy.data,
        distributions: distributions.data,
        indicators: indicators.data,
        placementRate: placementRate.data,
        outcomeFunnel: outcomeFunnel.data,
        incomeByYear: incomeByYear.data
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
                icon={<Users size={16} style={{ marginRight: 6 }} />}
                value={formatCount(data.indicators.trained)}
                title="Candidates Trained"
                text="Number of candidates who completed the training"
              />
              <Indicator
                icon={<Briefcase size={16} style={{ marginRight: 6 }} />}
                value={formatCount(data.indicators.placed)}
                title="Candidates Placed"
                text="Number of candidates who secured employment"
                note={`${formatPercent(data.indicators.placed_pct)} of all candidates`}
              />
              <Indicator
                value={formatPercent(data.placementRate?.eligible_pct)}
                title="Placement Rate"
                text={`Placed ÷ all candidates: ${formatPercent(data.placementRate?.overall_pct)}`}
                note={`Placement-eligible = completed training and available for or seeking employment (Working, Self employment, Job searching). Excludes ongoing course, further study and homemaker. n eligible = ${formatCount(data.placementRate?.eligible)}.`}
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
                value={formatPercent(data.placementRate?.female_pct)}
                title="Female Placement Rate"
                text="Placement rate among female candidates"
                note={`Male ${formatPercent(data.placementRate?.male_pct)} (${formatCount(data.placementRate?.men_placed)}/${formatCount(data.placementRate?.men_eligible)}) on the same placement-eligible basis.`}
              />
            </div>
          )}
          <div className="kpi-grid">
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('funnel', 'monitored')}>
              <div className="kpi-body">
                <div className="kpi-value">{fmt(data.status?.people)}</div>
                <div className="kpi-label">People monitored</div>
                <p className="kpi-caption">Distinct people with a follow-up. All years. {fmt(data.status?.total)} follow-up rows.</p>
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
                <div className="kpi-value">{formatINR(data.yoy?.[data.yoy.length - 1]?.median_income)}</div>
                <div className="kpi-label">Typical post income</div>
                <p className="kpi-caption">Median post income in the latest year on the chart. Zero and blank values are left out.</p>
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
              <div className="card-header"><h3>Post-training income of placed candidates</h3></div>
              <div className="card-body">
                <EChart
                  option={groupedBarOption(
                    ['Up to ₹5,000', '₹5,001–10,000', 'Above ₹10,000'],
                    [{ label: 'Candidates', data: [data.incomeRange?.['0_5000'], data.incomeRange?.['5001_10000'], data.incomeRange?.['10001_plus']] }],
                    { horizontal: true, showLabels: true, legend: false, withPercent: true, yName: 'No. of candidates', colors: INCOME_COLORS, gridLeft: 120 }
                  )}
                  caption={`Placed candidates with a recorded post income (n = ${formatCount(data.incomeRange?.n)}). Zero and blank values are left out.`}
                  onPoint={(point) => {
                    const labels = ['0_5000', '5001_10000', '10001_plus'];
                    handleDrilldown('income_range', labels[point.dataIndex], { placed_only: '1' });
                  }}
                />
              </div>
            </div>
          </div>

          {data.indicators?.employers && (
            <div className="card" style={{ marginTop: '24px' }}>
              <div className="card-header"><h3>Companies where candidates are placed</h3></div>
              <div className="card-body">
                <BrandDoughnut
                  pie
                  percent
                  labels={(() => {
                    const named = data.indicators.employers.employers || [];
                    const rest = named.slice(8);
                    return [
                      ...named.slice(0, 8).map((row) => row.name),
                      ...(rest.length ? [`Other employers (${rest.length})`] : [])
                    ];
                  })()}
                  values={(() => {
                    const named = data.indicators.employers.employers || [];
                    const rest = named.slice(8);
                    return [
                      ...named.slice(0, 8).map((row) => row.count),
                      ...(rest.length ? [rest.reduce((sum, row) => sum + row.count, 0)] : [])
                    ];
                  })()}
                  onSliceClick={(label) => {
                    const named = data.indicators.employers.employers || [];
                    const top = named.slice(0, 8);
                    const rest = named.slice(8);
                    const slice = label.startsWith('Other employers')
                      ? { sources: rest.flatMap((row) => row.sources) }
                      : top.find((row) => row.name === label);
                    handleDrilldown('mix_employer', label, { sources: (slice?.sources || []).join('\u001e') });
                  }}
                />
                <p className="chart-caption">
                  Employers named in the placement-status text. Placed with no employer named: {formatCount(
                    [...(data.indicators.employers.role_only || []), ...(data.indicators.employers.generic || [])]
                      .reduce((sum, row) => sum + (Number(row.count) || 0), 0)
                  )}.
                  {(data.indicators.employers.unmapped || []).length
                    ? ` Unmapped texts remain visible: ${data.indicators.employers.unmapped.map((row) => `${row.text} (${formatCount(row.count)})`).join(', ')}.`
                    : ''}
                </p>
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-header"><h3>Enrolled → Trained → Placed/Self-employed → Earning</h3></div>
            <div className="card-body">
              <FunnelBars
                stages={data.outcomeFunnel?.stages || []}
                caption="M&E field sheet. Earning = placed candidates with a recorded post-training income above zero."
                onBarClick={(stage) => setModal({
                  isOpen: true,
                  title: stage?.label || 'Funnel',
                  apiUrl: '/api/livelihood/decisions/funnel-rows',
                  params: { ...filters, stage: stage?.key || '' }
                })}
              />
              <div>
                {(data.outcomeFunnel?.stages || []).map((stage) => (
                  <p key={stage.key} className="chart-caption">
                    {stage.label}: {formatCount(stage.value)}
                    {stage.pct_of_enrolled == null ? '' : ` · ${formatPercent(stage.pct_of_enrolled)} of Enrolled`}
                    {stage.pct_of_previous == null ? '' : ` · ${formatPercent(stage.pct_of_previous)} of the previous stage`}
                  </p>
                ))}
              </div>
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
            <div className="card-header"><h3>Average Monthly Post-Training Income by Year</h3></div>
            <div className="card-body">
              <p className="chart-caption">All years. Average of candidates with a recorded post-training income (n per year shown). Zero and blank values are left out.</p>
              <EChart
                option={{
                  ...groupedBarOption(
                    (data.incomeByYear?.years || []).map((row) => row.year),
                    [{ label: 'Average monthly income', data: (data.incomeByYear?.years || []).map((row) => row.mean) }],
                    {
                      showLabels: true,
                      legend: false,
                      yName: 'Average monthly income (₹)',
                      labelTexts: (data.incomeByYear?.years || []).map((row) => `n = ${formatCount(row.n)}`)
                    }
                  ),
                  tooltip: {
                    trigger: 'axis',
                    renderMode: 'richText',
                    formatter: (items) => {
                      const item = Array.isArray(items) ? items[0] : items;
                      const row = (data.incomeByYear?.years || []).find((year) => year.year === item?.name) || {};
                      return [
                        item?.name,
                        `Average ${formatINRFull(row.mean)}`,
                        `Median ${formatINRFull(row.median)}`,
                        `n = ${formatCount(row.n)}`
                      ].join('\n');
                    }
                  }
                }}
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
