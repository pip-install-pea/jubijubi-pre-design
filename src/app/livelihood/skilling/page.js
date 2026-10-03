'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import RankingBar from '../../../components/charts/RankingBar';
import BrandDoughnut from '../../../components/charts/BrandDoughnut';
import ColumnBar from '../../../components/charts/ColumnBar';
import BenchmarkBar from '../../../components/charts/BenchmarkBar';
import EChart, {
  treemapOption,
  heatmapOption,
  roseOption,
  funnelOption,
  groupedBarOption
} from '../../../components/charts/EChart';
import DrilldownModal from '../../../components/DrilldownModal';
import ChartFocusBar from '../../../components/ChartFocusBar';
import PageRail from '../../../components/PageRail';
import { useChartFocus } from '../../../hooks/useChartFocus';

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
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Skilling field sheet</h3>
              </div>
              <div className="card-body">
                <p className="chart-caption">
                  Course, gender, placement, and income from the skilling sheet. This is not the skill roster below.
                </p>
                <div className="kpi-grid">
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-value">{fmt(data.mixSkilling.people)}</div>
                      <div className="kpi-label">People</div>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-value">{fmt(data.mixSkilling.courses)}</div>
                      <div className="kpi-label">Courses</div>
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
                      <div className="kpi-value">{fmtINR(data.mixSkilling.avg_pre)}</div>
                      <div className="kpi-label">Mean pre income</div>
                    </div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-body">
                      <div className="kpi-value">{fmtINR(data.mixSkilling.avg_post)}</div>
                      <div className="kpi-label">Mean post income</div>
                    </div>
                  </div>
                </div>
                <div className="card-row" style={{ marginTop: '16px' }}>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>By course</h3></div>
                    <div className="card-body">
                      <EChart
                        option={treemapOption(data.mixSkilling.by_course)}
                        focus={focus}
                        onPoint={(p) => p.name && handleDrilldown('mix_course', p.name, {}, p.nativeEvent)}
                      />
                    </div>
                  </div>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>Gender</h3></div>
                    <div className="card-body">
                      <EChart
                        option={roseOption(data.mixSkilling.by_gender)}
                        onPoint={(p) => p.name && handleDrilldown('mix_skill_gender', p.name)}
                      />
                    </div>
                  </div>
                </div>
                <div className="card-row" style={{ marginTop: '16px' }}>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>Placement status</h3></div>
                    <div className="card-body">
                      <EChart
                        option={funnelOption(data.mixSkilling.by_placement)}
                        caption="Status only. An employer name on the sheet is counted as Working."
                        onPoint={(p) => p.name && handleDrilldown('mix_placement', p.name)}
                      />
                    </div>
                  </div>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>Income change, pre to post</h3></div>
                    <div className="card-body">
                      <ColumnBar
                        labels={(data.mixSkilling.income_change || []).map((r) => r.label)}
                        values={(data.mixSkilling.income_change || []).map((r) => r.value)}
                        caption="People who have both a pre and a post income."
                        onBarClick={(label) => handleDrilldown('income_delta', label)}
                      />
                    </div>
                  </div>
                </div>
                {(data.mixSkilling.by_course_income || []).length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Mean pre vs post income by course</h3>
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
                {data.mixSkilling.heatmap?.x?.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>People by course and location</h3>
                    <EChart
                      option={heatmapOption(data.mixSkilling.heatmap.x, data.mixSkilling.heatmap.y, data.mixSkilling.heatmap.cells)}
                      height={380}
                      onPoint={(p) => {
                        const course = data.mixSkilling.heatmap.x?.[p.value?.[0]];
                        const loc = data.mixSkilling.heatmap.y?.[p.value?.[1]];
                        if (course) handleDrilldown('mix_skill_heat', course, loc ? { location: loc } : {});
                      }}
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
                  <div className="kpi-label">Women share</div>
                  <p className="kpi-caption">Of roster headcount. All years.</p>
                </div>
              </div>
            )}
          </div>

          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Work status</h3></div>
              <div className="card-body">
                <p className="chart-caption">All years</p>
                <BrandDoughnut
                  labels={data.beneficiaries?.status_breakdown?.map(r => r.status) || []}
                  values={data.beneficiaries?.status_breakdown?.map(r => r.count) || []}
                  onSliceClick={(label) => handleDrilldown('work_status', label)}
                />
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
              <div className="card-header"><h3>Gender · roster</h3></div>
              <div className="card-body">
                <p className="chart-caption">All years</p>
                <BrandDoughnut
                  labels={data.demographics?.gender_breakdown?.map(r => r.gender) || []}
                  values={data.demographics?.gender_breakdown?.map(r => r.count) || []}
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
                  items={(data.sessionsByTrade || []).map(r => ({ label: r.trade, value: r.batches }))}
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
