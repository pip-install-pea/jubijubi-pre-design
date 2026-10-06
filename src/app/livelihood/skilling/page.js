'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Briefcase, GraduationCap, Users } from '@phosphor-icons/react';
import RankingBar from '../../../components/charts/RankingBar';
import BrandDoughnut from '../../../components/charts/BrandDoughnut';
import ColumnBar from '../../../components/charts/ColumnBar';
import BenchmarkBar from '../../../components/charts/BenchmarkBar';
import EChart, {
  funnelOption,
  groupedBarOption,
  stackedBarOption
} from '../../../components/charts/EChart';

const CAREER_STAGES = [
  { key: 'Further study', label: 'Higher Education / Further Study', color: '#1d4ed8' },
  { key: 'Self employment', label: 'Self-Employment', color: '#7dd3fc' },
  { key: 'Ongoing course', label: 'Continuing Training', color: '#eab308' },
  { key: 'Working', label: 'Employment', color: '#16a34a' },
  { key: 'Not reported', label: 'Status Not Reported', color: '#7c3aed' },
  { key: 'Job searching', label: 'Job Seeking', color: '#f97316' },
  { key: 'Homemaker', label: 'Homemaker', color: '#0f766e' }
];

const SHEET_GENDER_COLORS = {
  Female: '#be185d',
  Male: '#1d4ed8',
  'Not recorded': '#94a3b8',
  Others: '#0f766e'
};
import DrilldownModal from '../../../components/DrilldownModal';
import ChartFocusBar from '../../../components/ChartFocusBar';
import PageRail from '../../../components/PageRail';
import { useChartFocus } from '../../../hooks/useChartFocus';
import { formatCount, formatINR, formatINRFull } from '../../../lib/format';
import { groupBelowShare } from '../../../lib/chartTheme';

const MIN_SHARE = 0.02;

function memberParams(row) {
  return row?.members?.length ? { members: row.members.join('\u001e') } : {};
}

const BAR_COLORS = ['#1d4ed8', '#0f766e', '#f97316', '#be185d', '#7c3aed', '#0891b2', '#ca8a04', '#16a34a', '#9333ea', '#dc2626'];
const INCOME_COLORS = ['#1d4ed8', '#0f766e', '#f97316'];

function courseIncomeOption(rows) {
  const list = rows || [];
  const option = groupedBarOption(
    list.map((row) => row.label),
    [
      { label: 'Mean pre', data: list.map((row) => (Number(row.n_pre) ? Number(row.avg_pre) : null)), color: '#1d4ed8' },
      { label: 'Mean post', data: list.map((row) => (Number(row.n_post) ? Number(row.avg_post) : null)), color: '#f97316' }
    ],
    { horizontal: true, showLabels: true, gridLeft: 160 }
  );
  option.tooltip = {
    trigger: 'axis',
    renderMode: 'richText',
    formatter: (items) => {
      const point = Array.isArray(items) ? items[0] : items;
      const row = list[point?.dataIndex] || {};
      return [
        row.label,
        Number(row.n_pre) ? `Mean pre ${formatINR(row.avg_pre)} (n = ${formatCount(row.n_pre)})` : 'no pre data',
        Number(row.n_post) ? `Mean post ${formatINR(row.avg_post)} (n = ${formatCount(row.n_post)})` : 'No post income'
      ].join('\n');
    }
  };
  return option;
}

function locationIncomeOption(rows) {
  const list = rows || [];
  const option = groupedBarOption(
    list.map((row) => row.label),
    [{ label: 'Mean post', data: list.map((row) => row.avg_post), color: '#f97316' }],
    { horizontal: true, showLabels: true, legend: false, gridLeft: 140 }
  );
  if (option.series[0]) {
    option.series[0].label = {
      show: true,
      position: 'right',
      formatter: (point) => {
        const row = list[point.dataIndex] || {};
        return `${formatINR(row.avg_post)} (n=${formatCount(row.n)})`;
      }
    };
  }
  option.tooltip = {
    trigger: 'axis',
    renderMode: 'richText',
    formatter: (items) => {
      const point = Array.isArray(items) ? items[0] : items;
      const row = list[point?.dataIndex] || {};
      return [
        row.label,
        `Mean ${formatINRFull(row.avg_post)}`,
        `Median ${formatINRFull(row.median_post)}`,
        `n = ${formatCount(row.n)}`
      ].join('\n');
    }
  };
  return option;
}

function outcomeChart(rows) {
  const list = rows || [];
  const districts = [...new Set(list.map((row) => row.district))];
  const statuses = [...new Set(list.map((row) => row.status))];
  return {
    districts,
    series: statuses.map((status) => ({
      label: status,
      data: districts.map((district) => {
        const found = list.find((row) => row.district === district && row.status === status);
        return found ? Number(found.cnt) || 0 : 0;
      })
    }))
  };
}

function incomeSeries(rows) {
  const list = rows || [];
  const series = [
    { label: 'Female', data: list.map((row) => Number(row.female) || 0) },
    { label: 'Male', data: list.map((row) => Number(row.male) || 0) }
  ];
  if (list.some((row) => Number(row.not_recorded) > 0)) {
    series.push({ label: 'Not recorded', data: list.map((row) => Number(row.not_recorded) || 0) });
  }
  if (list.some((row) => Number(row.others) > 0)) {
    series.push({ label: 'Others', data: list.map((row) => Number(row.others) || 0) });
  }
  return series;
}

export default function SkillingPage() {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, title: '', apiUrl: '', params: {} });
  const { focus, select, remove, clear } = useChartFocus();

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
      const [beneficiaries, income, demographics, byTrade, sessions, benchmarks] = await Promise.all([
        axios.get(`/api/livelihood/skilling/beneficiaries?${query}`),
        axios.get(`/api/livelihood/skilling/income_distribution?${query}`),
        axios.get(`/api/livelihood/skilling/demographics?${query}`),
        axios.get(`/api/livelihood/skilling/by_trade?${query}`),
        axios.get(`/api/livelihood/skilling/sessions_by_trade?${query}`),
        axios.get(`/api/livelihood/skilling/benchmarks?${query}`)
      ]);
      let mixSkilling = { data: { status: 'no_data' } };
      try {
        mixSkilling = await axios.get(`/api/livelihood/mixprogram/skilling?${query}`);
      } catch {
        mixSkilling = { data: { status: 'no_data' } };
      }
      setData({
        beneficiaries: beneficiaries.data,
        income: income.data,
        demographics: demographics.data,
        byTrade: byTrade.data,
        sessionsByTrade: sessions.data,
        benchmarks: benchmarks.data,
        mixSkilling: mixSkilling.data
      });
    } catch (err) {
      console.error('Skilling data load failed', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fmt = (n) => (n || n === 0) ? Number(n).toLocaleString('en-IN') : '—';
  const sheetMonthNote = filters.month
    ? 'Rows with no month recorded are left out.'
    : null;
  const rosterMonthNote = filters.month
    ? 'Months use the record date. Unparseable dates are left out.'
    : null;
  const grain = data?.benchmarks?.grain === 'district' ? 'district' : 'state';

  const handleDrilldown = (type, value = null, extraParams = {}, event) => {
    if (type === 'mix_course') {
      select(value, event);
      if (event?.shiftKey || event?.metaKey) return;
    }
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

  const roster = Number(data?.beneficiaries?.roster_count ?? data?.beneficiaries?.total_trained) || 0;
  const outcomes = outcomeChart(data?.beneficiaries?.status_by_district);
  const courseShare = groupBelowShare((data?.mixSkilling?.by_course || []).map((row) => ({
    label: row.label,
    value: Number(row.value) || 0
  })), MIN_SHARE);
  const genderSheet = groupBelowShare((data?.mixSkilling?.by_gender || []).map((row) => ({
    label: row.label,
    value: Number(row.value) || 0,
    color: SHEET_GENDER_COLORS[row.label]
  })), MIN_SHARE);
  const genderRoster = groupBelowShare((data?.demographics?.gender_breakdown || []).map((row) => ({
    label: row.gender,
    value: Number(row.count) || 0
  })), MIN_SHARE);
  const careerShare = groupBelowShare(CAREER_STAGES.map((stage) => {
    const row = (data?.mixSkilling?.by_placement || []).find((item) => item.label === stage.key);
    return row && Number(row.value) > 0
      ? { label: stage.label, value: Number(row.value) || 0, key: stage.key, member: stage.key, color: stage.color }
      : null;
  }).filter(Boolean), MIN_SHARE, { keepOrder: true });
  const workShare = groupBelowShare((data?.beneficiaries?.status_breakdown || []).map((row) => ({
    label: row.status,
    value: Number(row.count) || 0
  })), MIN_SHARE);
  const ageShare = groupBelowShare(
    Object.entries(data?.demographics?.age_brackets || {}).map(([label, value]) => ({
      label,
      value: Number(value) || 0
    })),
    MIN_SHARE
  );
  const womenRow = data?.demographics?.gender_breakdown?.find(g => g.gender === 'Female' || g.gender === 'F');
  const womenCount = Number(womenRow?.count) || 0;
  const womenPct = roster > 0 ? ((womenCount / roster) * 100).toFixed(1) : null;

  return (
    <div>
      <PageRail>
        <ChartFocusBar
          focus={focus}
          onClear={clear}
          onRemove={remove}
          hint="Shift-click a second course to compare"
        />
      </PageRail>
      {data && (
        <>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0 16px' }}>Skill Development Stats</h1>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '8px 0 12px' }}>Training & Course Portfolio</h2>
          <p className="chart-caption">Course and location counts come from the M&E field sheet. Roster, batches, and trades come from the skill-tracking app. The two sources are not merged.</p>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{fmt(data.mixSkilling?.people)}</div>
                <div className="kpi-label"><Users size={16} style={{ marginRight: 6 }} />Total Candidates Enrolled</div>
                <p className="kpi-caption">Rows on the M&E field sheet (n = {fmt(data.mixSkilling?.people)}). {sheetMonthNote}</p>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-label"><GraduationCap size={16} style={{ marginRight: 6 }} />Skilling courses (batches)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <div>
                    <div className="kpi-value">{formatCount(data.sessionsByTrade?.batches?.ongoing)}</div>
                    <div className="kpi-label">Ongoing</div>
                  </div>
                  <div>
                    <div className="kpi-value">{formatCount(data.sessionsByTrade?.batches?.completed)}</div>
                    <div className="kpi-label">Completed</div>
                  </div>
                  <div>
                    <div className="kpi-value">{formatCount(data.sessionsByTrade?.batches?.total)}</div>
                    <div className="kpi-label">Total</div>
                  </div>
                </div>
                {(data.sessionsByTrade?.batches?.upcoming || 0) > 0 && (
                  <p className="kpi-caption">Upcoming: {formatCount(data.sessionsByTrade.batches.upcoming)}</p>
                )}
                <p className="kpi-caption">
                  Skill-tracking app batches, from start and end dates. {(data.sessionsByTrade?.batches?.no_dates || 0) > 0
                    ? `${formatCount(data.sessionsByTrade.batches.no_dates)} with no dates.`
                    : ''} {rosterMonthNote}
                </p>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{fmt(data.mixSkilling?.locations)}</div>
                <div className="kpi-label">Locations</div>
                <p className="kpi-caption">Distinct locations on the M&E field sheet. {sheetMonthNote}</p>
              </div>
            </div>
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('persons')}>
              <div className="kpi-body">
                <div className="kpi-value">{fmt(roster)}</div>
                <div className="kpi-label">Skill roster</div>
                <p className="kpi-caption">People on the skill-tracking app (n = {fmt(roster)}). {rosterMonthNote}</p>
              </div>
            </div>
          </div>

          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Course-wise enrolment</h3></div>
              <div className="card-body">
                <p className="kpi-caption">M&E field sheet</p>
                <p className="chart-caption">Share of candidates on the skilling sheet. Courses under 2% are grouped as Others. {sheetMonthNote}</p>
                <EChart
                  option={groupedBarOption(
                    courseShare.map((row) => row.label),
                    [{ label: 'Candidates', data: courseShare.map((row) => row.value) }],
                    { horizontal: true, showLabels: true, legend: false, withPercent: true, gridLeft: 180 }
                  )}
                  height={Math.max(280, courseShare.length * 28)}
                  focus={focus}
                  onPoint={(p) => {
                    if (!p.name) return;
                    const row = courseShare.find((item) => item.label === p.name);
                    handleDrilldown('mix_course', p.name, memberParams(row), p.nativeEvent);
                  }}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Trade-wise candidates</h3></div>
              <div className="card-body">
                <p className="kpi-caption">Skill-tracking app</p>
                <p className="chart-caption">Candidates on the skill roster, by trade. Trades under 2% are grouped as Others. {rosterMonthNote}</p>
                <RankingBar
                  items={(data.byTrade || []).map(r => ({ label: r.trade, value: r.count }))}
                  maxItems={0}
                  minShare={MIN_SHARE}
                  pareto={false}
                  percent
                  colors={BAR_COLORS}
                  onBarClick={(label, _value, _index, _event, row) => handleDrilldown('trade', label, memberParams(row))}
                />
              </div>
            </div>
          </div>

          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Trade-wise batches</h3></div>
              <div className="card-body">
                <p className="kpi-caption">Skill-tracking app</p>
                <p className="chart-caption">Each bar counts batches, not people. Trades under 2% are grouped as Others. {rosterMonthNote}</p>
                <RankingBar
                  items={(data.sessionsByTrade?.trades || []).map(r => ({ label: r.trade, value: r.batches }))}
                  maxItems={0}
                  minShare={MIN_SHARE}
                  percent
                  colors={BAR_COLORS}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <h3>Skill roster candidates by {grain}</h3>
                <span className="kpi-caption">
                  Average per {grain}: {formatCount(data.benchmarks?.programme_average)}
                </span>
              </div>
              <div className="card-body">
                <p className="kpi-caption">Skill-tracking app</p>
                <p className="chart-caption">
                  Candidates on the skill roster, compared with the mean of {grain}s that have a recorded {grain}.
                  {data.benchmarks?.unrecorded_n
                    ? ` ${data.benchmarks.unrecorded_label} (${formatCount(data.benchmarks.unrecorded_n)}) is shown and left out of the average.`
                    : ''}
                  {' '}{rosterMonthNote}
                </p>
                <BenchmarkBar
                  percent
                  payload={data.benchmarks}
                  onBarClick={(label, row) => handleDrilldown('geo', label, {
                    grain: data.benchmarks?.grain,
                    geo_id: row?.id || label
                  })}
                />
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '28px 0 12px' }}>Gender Inclusion</h2>
          <div className="kpi-grid">
            {womenPct != null && (
              <div className="kpi-card">
                <div className="kpi-body">
                  <div className="kpi-value">{womenPct}%</div>
                  <div className="kpi-label">Women participation</div>
                  <p className="kpi-caption">Women as a share of the skill-roster headcount (n = {fmt(roster)}). Skill-tracking app. {rosterMonthNote}</p>
                </div>
              </div>
            )}
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('gender', 'Female')}>
              <div className="kpi-body">
                <div className="kpi-value">{fmt(womenCount)}</div>
                <div className="kpi-label">Women on roster</div>
                <p className="kpi-caption">Female candidates on the skill roster. Skill-tracking app. {rosterMonthNote}</p>
              </div>
            </div>
          </div>
          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Gender-wise portfolio</h3></div>
              <div className="card-body">
                <p className="kpi-caption">M&E field sheet</p>
                <p className="chart-caption">Gender recorded on the skilling sheet. Slices under 2% are grouped as Others. {sheetMonthNote}</p>
                <BrandDoughnut
                  labels={genderSheet.map((row) => row.label)}
                  values={genderSheet.map((row) => row.value)}
                  colors={genderSheet.map((row) => row.color)}
                  percent
                  onSliceClick={(label) => {
                    const row = genderSheet.find((item) => item.label === label);
                    handleDrilldown('mix_skill_gender', label, memberParams(row));
                  }}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Gender ratio</h3></div>
              <div className="card-body">
                <p className="kpi-caption">Skill-tracking app</p>
                <p className="chart-caption">Gender on the skill roster. Blank gender is included. Slices under 2% are grouped as Others. {rosterMonthNote}</p>
                <BrandDoughnut
                  labels={genderRoster.map((row) => row.label)}
                  values={genderRoster.map((row) => row.value)}
                  percent
                  onSliceClick={(label) => {
                    const row = genderRoster.find((item) => item.label === label);
                    handleDrilldown('gender', label, memberParams(row));
                  }}
                />
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h3>Age brackets · roster</h3></div>
            <div className="card-body">
              <p className="kpi-caption">Skill-tracking app</p>
              <p className="chart-caption">Age brackets on the skill roster. Brackets under 2% are grouped as Others. {rosterMonthNote}</p>
              <ColumnBar
                labels={ageShare.map((row) => row.label)}
                values={ageShare.map((row) => row.value)}
                onBarClick={(label) => {
                  const row = ageShare.find((item) => item.label === label);
                  handleDrilldown('age', label, memberParams(row));
                }}
              />
            </div>
          </div>

          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '28px 0 12px' }}>Employment Outcomes</h2>
          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3><Briefcase size={16} style={{ marginRight: 6 }} />Post-Training Career Outcomes</h3></div>
              <div className="card-body">
                <p className="kpi-caption">M&E field sheet</p>
                <p className="chart-caption">Current status of skilling program participants. Statuses under 2% are grouped as Others. {sheetMonthNote}</p>
                <EChart
                  option={funnelOption(
                    careerShare.map((row) => ({
                      label: row.label,
                      value: row.value,
                      key: row.key || row.label,
                      color: row.color
                    })),
                    { percent: true, keepOrder: true }
                  )}
                  onPoint={(p) => {
                    const row = careerShare.find((item) => item.label === (p.name || p.data?.name));
                    handleDrilldown('mix_placement', row?.key || p.data?.key || p.name, memberParams(row));
                  }}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Employment outcomes of candidates</h3></div>
              <div className="card-body">
                <p className="kpi-caption">Skill-tracking app</p>
                <p className="chart-caption">Follow-up work status (n = {formatCount(data.beneficiaries?.monitored_people)} people). Slices under 2% are grouped as Others. {rosterMonthNote}</p>
                <BrandDoughnut
                  labels={workShare.map((row) => row.label)}
                  values={workShare.map((row) => row.value)}
                  percent
                  onSliceClick={(label) => {
                    const row = workShare.find((item) => item.label === label);
                    handleDrilldown('work_status', label, memberParams(row));
                  }}
                />
                {outcomes.districts.length > 0 && (
                  <EChart
                    option={stackedBarOption(outcomes.districts, outcomes.series)}
                    height={320}
                    caption="By monitor district"
                    onPoint={(point) => {
                      const row = (data.beneficiaries?.status_by_district || []).find((item) => item.district === point.name && item.status === point.seriesName);
                      if (!row) return;
                      handleDrilldown('work_status', row.status, {
                        outcome_district: row.district,
                        ...(row.district_id ? { district_id: row.district_id } : {})
                      });
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '28px 0 12px' }}>Income & Livelihood Outcomes</h2>
          <p className="chart-caption">Income figures use recorded values above zero and below ₹10,00,000. Zero and blank values are left out. {sheetMonthNote}</p>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{formatINR(data.mixSkilling?.avg_pre)}</div>
                <div className="kpi-label">Mean Pre Income</div>
                <p className="kpi-caption">Average income before training, among candidates with a recorded pre-training income (n = {formatCount(data.mixSkilling?.with_pre)}). M&E field sheet.</p>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{formatINR(data.mixSkilling?.avg_post)}</div>
                <div className="kpi-label">Post Income</div>
                <p className="kpi-caption">(Enhancement in income status post completion of course)</p>
                <p className="kpi-caption">Average of candidates with a recorded income (n = {formatCount(data.mixSkilling?.with_post)}). M&E field sheet. Zero and blank values are left out.</p>
              </div>
            </div>
          </div>
          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Income Mobility pre to post training</h3></div>
              <div className="card-body">
                <p className="kpi-caption">M&E field sheet</p>
                <p className="chart-caption">Change in Monthly income among participants with both pre and post training income data</p>
                <ColumnBar
                  labels={(data.mixSkilling?.income_change || []).filter((row) => row.label !== 'Income fell').map((row) => row.label)}
                  series={incomeSeries((data.mixSkilling?.income_change || []).filter((row) => row.label !== 'Income fell'))}
                  axisTitle="No. of candidates"
                  horizontal
                  height={320}
                  caption={`${formatCount((data.mixSkilling?.income_change || []).find((row) => row.label === 'Income fell')?.value)} of ${formatCount((data.mixSkilling?.income_change || []).reduce((sum, row) => sum + (Number(row.value) || 0), 0))} candidates reported a lower post income and are not shown.`}
                  onBarClick={(label) => handleDrilldown('income_delta', label)}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Post-program income ranges</h3></div>
              <div className="card-body">
                <p className="kpi-caption">M&E field sheet</p>
                <EChart
                  option={groupedBarOption(
                    ['Up to ₹5,000', '₹5,001–10,000', 'Above ₹10,000'],
                    [{ label: 'Candidates', data: [data.income?.['0_5000'], data.income?.['5001_10000'], data.income?.['10001_plus']] }],
                    { horizontal: true, showLabels: true, legend: false, withPercent: true, yName: 'No. of candidates', colors: INCOME_COLORS, gridLeft: 120 }
                  )}
                  caption={`Self-employed, working, or placed rows with a recorded post income (n = ${formatCount(data.income?.n)}). Further study and ongoing course are left out. Zero and blank values are left out.`}
                  onPoint={(point) => {
                    const labels = ['0_5000', '5001_10000', '10001_plus'];
                    handleDrilldown('income_range', labels[point.dataIndex]);
                  }}
                />
              </div>
            </div>
          </div>
          {(data.mixSkilling?.by_course_income || []).length > 0 && (
            <div className="card">
              <div className="card-header"><h3>Course-wise Mean Pre vs Post Income</h3></div>
              <div className="card-body">
                <p className="kpi-caption">M&E field sheet</p>
                <p className="chart-caption">Mean pre (blue) and post (orange) income by course, sorted by mean post. A course with no valid pre income has no pre bar. {sheetMonthNote}</p>
                <EChart
                  option={courseIncomeOption(data.mixSkilling.by_course_income)}
                  height={Math.max(280, data.mixSkilling.by_course_income.length * 36)}
                  focus={focus}
                  onPoint={(p) => p.name && handleDrilldown('mix_course', p.name, {}, p.nativeEvent)}
                />
              </div>
            </div>
          )}
          {(data.mixSkilling?.post_by_location || []).length > 0 && (
            <div className="card">
              <div className="card-header"><h3>Post income of candidates location-wise</h3></div>
              <div className="card-body">
                <p className="kpi-caption">M&E field sheet</p>
                <p className="chart-caption">Mean post income by location. The tooltip shows the median. Zero and blank values are left out. {sheetMonthNote}</p>
                <EChart
                  option={locationIncomeOption(data.mixSkilling.post_by_location)}
                  height={Math.max(280, data.mixSkilling.post_by_location.length * 36)}
                />
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
