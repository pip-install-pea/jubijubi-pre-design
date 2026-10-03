'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
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
import { formatCount, formatINR } from '../../../lib/format';

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
  const fmtINR = (n) => (n || n === 0) ? `₹${Math.round(Number(n)).toLocaleString('en-IN')}` : '—';

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
          {data.mixSkilling?.status === 'ok' && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Skill Development Stats</h3>
              </div>
              <div className="card-body">
                <p className="chart-caption">
                  Course, gender, placement, and income from the skilling sheet. This is not the skill roster below.
                </p>
                <div className="kpi-grid">
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-value">{fmt(data.mixSkilling.people)}</div>
                      <div className="kpi-label">Total Candidates Enrolled</div>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-label">Skilling courses (batches)</div>
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
                        From skill-tracking app batch start/end dates. All years.
                        {(data.sessionsByTrade?.batches?.no_dates || 0) > 0
                          ? ` ${formatCount(data.sessionsByTrade.batches.no_dates)} with no dates.`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-value">{fmt(data.mixSkilling.locations)}</div>
                      <div className="kpi-label">Locations</div>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-value">{formatINR(data.mixSkilling.avg_pre)}</div>
                      <div className="kpi-label">Mean Pre Income</div>
                      <p className="kpi-caption">Average income before training, among candidates with a recorded pre-training income (n = {formatCount(data.mixSkilling.with_pre)}).</p>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-value">{formatINR(data.mixSkilling.avg_post)}</div>
                      <div className="kpi-label">Post Income</div>
                      <p className="kpi-caption">(Enhancement in income status post completion of course)</p>
                      <p className="kpi-caption">Average of candidates with a recorded income (n = {formatCount(data.mixSkilling.with_post)}). Zero and blank values are left out.</p>
                    </div>
                  </div>
                </div>
                <div className="card-row" style={{ marginTop: '16px' }}>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>Course-wise enrolment</h3></div>
                    <div className="card-body">
                      <p className="chart-caption">Share of candidates on the skilling sheet. All courses are shown.</p>
                      <EChart
                        option={groupedBarOption(
                          (data.mixSkilling.by_course || []).map((row) => row.label),
                          [{ label: 'Candidates', data: (data.mixSkilling.by_course || []).map((row) => Number(row.value) || 0) }],
                          { horizontal: true, showLabels: true, legend: false, withPercent: true, gridLeft: 180 }
                        )}
                        height={Math.max(280, (data.mixSkilling.by_course || []).length * 28)}
                        focus={focus}
                        onPoint={(p) => p.name && handleDrilldown('mix_course', p.name, {}, p.nativeEvent)}
                      />
                    </div>
                  </div>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>Gender-wise portfolio</h3></div>
                    <div className="card-body">
                      <BrandDoughnut
                        labels={(data.mixSkilling.by_gender || []).map((row) => row.label)}
                        values={(data.mixSkilling.by_gender || []).map((row) => row.value)}
                        colors={(data.mixSkilling.by_gender || []).map((row) => SHEET_GENDER_COLORS[row.label])}
                        percent
                        onSliceClick={(label) => handleDrilldown('mix_skill_gender', label)}
                      />
                    </div>
                  </div>
                </div>
                <div className="card-row" style={{ marginTop: '16px' }}>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>Post-Training Career Outcomes</h3></div>
                    <div className="card-body">
                      <p className="chart-caption">Current status of skilling program participants.</p>
                      <EChart
                        option={funnelOption(
                          CAREER_STAGES.map((stage) => {
                            const row = (data.mixSkilling.by_placement || []).find((item) => item.label === stage.key);
                            return row ? { label: stage.label, value: row.value, key: stage.key, color: stage.color } : null;
                          }).filter(Boolean),
                          { percent: true, keepOrder: true }
                        )}
                        onPoint={(p) => handleDrilldown('mix_placement', p.data?.key || p.name)}
                      />
                    </div>
                  </div>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header">
                      <h3>Income Mobility pre to post training</h3>
                    </div>
                    <div className="card-body">
                      <p className="chart-caption">Change in Monthly income among participants with both pre and post training income data</p>
                      <ColumnBar
                        labels={(data.mixSkilling.income_change || []).filter((row) => row.label !== 'Income fell').map((row) => row.label)}
                        series={incomeSeries((data.mixSkilling.income_change || []).filter((row) => row.label !== 'Income fell'))}
                        axisTitle="No. of candidates"
                        horizontal
                        height={320}
                        caption={`${formatCount((data.mixSkilling.income_change || []).find((row) => row.label === 'Income fell')?.value)} of ${formatCount((data.mixSkilling.income_change || []).reduce((sum, row) => sum + (Number(row.value) || 0), 0))} candidates reported a lower post income and are not shown.`}
                        onBarClick={(label) => handleDrilldown('income_delta', label)}
                      />
                    </div>
                  </div>
                </div>
                {(data.mixSkilling.by_course_income || []).length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Course-wise Mean Pre vs Post Income</h3>
                    <EChart
                      option={groupedBarOption(
                        data.mixSkilling.by_course_income.map((r) => r.label),
                        [
                          { label: 'Mean pre', data: data.mixSkilling.by_course_income.map((r) => Number(r.avg_pre) || 0) },
                          { label: 'Mean post', data: data.mixSkilling.by_course_income.map((r) => Number(r.avg_post) || 0) }
                        ]
                      )}
                      focus={focus}
                      onPoint={(p) => p.name && handleDrilldown('mix_course', p.name, {}, p.nativeEvent)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '8px 0 16px' }}>Skill roster</h3>
          <div className="kpi-grid">
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('persons')}>
              <div className="kpi-body">
                <div className="kpi-value">{fmt(roster)}</div>
                <div className="kpi-label">Skill roster</div>
                <p className="kpi-caption">All years</p>
              </div>
            </div>
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('gender', 'Female')}>
              <div className="kpi-body">
                <div className="kpi-value">{fmt(womenCount)}</div>
                <div className="kpi-label">Women on roster</div>
                <p className="kpi-caption">All years</p>
              </div>
            </div>
            {womenPct != null && (
              <div className="kpi-card">
                <div className="kpi-body">
                  <div className="kpi-value">{womenPct}%</div>
                  <div className="kpi-label">Women participation</div>
                  <p className="kpi-caption">Of roster headcount. All years.</p>
                </div>
              </div>
            )}
          </div>

          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Employment outcomes of candidates</h3></div>
              <div className="card-body">
                <p className="chart-caption">Skill-tracking follow-ups (n = {formatCount(data.beneficiaries?.monitored_people)} people). All years.</p>
                <BrandDoughnut
                  labels={data.beneficiaries?.status_breakdown?.map(r => r.status) || []}
                  values={data.beneficiaries?.status_breakdown?.map(r => r.count) || []}
                  percent
                  onSliceClick={(label) => handleDrilldown('work_status', label)}
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
            <div className="card">
              <div className="card-header"><h3>Field-sheet post income buckets</h3></div>
              <div className="card-body">
                <ColumnBar
                  labels={['₹0–5K', '₹5K–10K', '₹10K+']}
                  values={[data.income?.['0_5000'], data.income?.['5001_10000'], data.income?.['10001_plus']]}
                  caption="Self-employed, working, or placed rows on the Skilling sheet. Further study and ongoing course are left out. Empty post income is omitted."
                  onBarClick={(_, __, idx) => {
                    const labels = ['0_5000', '5001_10000', '10001_plus'];
                    handleDrilldown('income_range', labels[idx]);
                  }}
                />
              </div>
            </div>
          </div>

          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Gender ratio</h3></div>
              <div className="card-body">
                <p className="chart-caption">All years. Blank gender is shown as Not recorded.</p>
                <BrandDoughnut
                  labels={data.demographics?.gender_breakdown?.map(r => r.gender) || []}
                  values={data.demographics?.gender_breakdown?.map(r => r.count) || []}
                  percent
                  onSliceClick={(label) => handleDrilldown('gender', label)}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Age brackets · roster</h3></div>
              <div className="card-body">
                <p className="chart-caption">All years</p>
                <ColumnBar
                  labels={data.demographics?.age_brackets ? Object.keys(data.demographics.age_brackets) : []}
                  values={data.demographics?.age_brackets ? Object.values(data.demographics.age_brackets) : []}
                  onBarClick={(label) => handleDrilldown('age', label)}
                />
              </div>
            </div>
          </div>

          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Roster by trade</h3></div>
              <div className="card-body">
                <p className="chart-caption">All years</p>
                <RankingBar
                  items={(data.byTrade || []).map(r => ({ label: r.trade, value: r.count }))}
                  pareto
                  onBarClick={(label) => handleDrilldown('trade', label)}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Batches by trade</h3></div>
              <div className="card-body">
                <p className="chart-caption">All years</p>
                <RankingBar
                  items={(data.sessionsByTrade?.trades || []).map(r => ({ label: r.trade, value: r.batches }))}
                  onBarClick={(label) => handleDrilldown('trade', label)}
                />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: '24px' }}>
            <div className="card-header">
              <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {data.benchmarks?.grain === 'district' ? 'Districts vs state and programme averages' : 'States vs programme average'}
              </h3>
            </div>
            <div className="card-body">
              <p className="chart-caption">All years. Roster geography only. Not the field sheet locations.</p>
              <BenchmarkBar
                payload={data.benchmarks}
                onBarClick={(label, row) => handleDrilldown('geo', label, {
                  grain: data.benchmarks?.grain,
                  geo_id: row?.id || label
                })}
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
