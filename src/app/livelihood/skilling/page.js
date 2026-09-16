'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import RankingBar from '../../../components/charts/RankingBar';
import BrandDoughnut from '../../../components/charts/BrandDoughnut';
import ColumnBar from '../../../components/charts/ColumnBar';
import GroupedBar from '../../../components/charts/GroupedBar';
import DrilldownModal from '../../../components/DrilldownModal';
import { NAVY, SKY, GOLD, LIME } from '../../../lib/chartTheme';

export default function SkillingPage() {
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
      const [beneficiaries, income, demographics, byTrade, sessions, prePost] = await Promise.all([
        axios.get(`/api/livelihood/skilling/beneficiaries?${query}`),
        axios.get(`/api/livelihood/skilling/income_distribution?${query}`),
        axios.get(`/api/livelihood/skilling/demographics?${query}`),
        axios.get(`/api/livelihood/skilling/by_trade?${query}`),
        axios.get(`/api/livelihood/skilling/sessions_by_trade?${query}`),
        axios.get(`/api/livelihood/skilling/pre_post?${query}`)
      ]);
      setData({
        beneficiaries: beneficiaries.data,
        income: income.data,
        demographics: demographics.data,
        byTrade: byTrade.data,
        sessionsByTrade: sessions.data,
        prePost: prePost.data
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

  const prePostData = (() => {
    if (!data?.prePost || data.prePost.length === 0) return null;
    const tradesMap = {};
    data.prePost.forEach(r => {
      if (!tradesMap[r.trade_name]) tradesMap[r.trade_name] = { pre: 0, post: 0 };
      if (r.assessment_type === 'PRE') tradesMap[r.trade_name].pre += r.trained || 0;
      else if (r.assessment_type === 'POST') tradesMap[r.trade_name].post += r.trained || 0;
    });
    return {
      labels: Object.keys(tradesMap),
      pre: Object.keys(tradesMap).map(l => tradesMap[l].pre),
      post: Object.keys(tradesMap).map(l => tradesMap[l].post)
    };
  })();

  return (
    <div>
      <div className="section-header">
        <h2 className="card-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>Livelihood — Skilling</h2>
        <p className="section-sub">Roster, monitored work status, current income, and batches by trade</p>
      </div>

      <div className="page-tabs" style={{ marginBottom: '24px' }}>
        <Link href="/livelihood/skilling" className="tab tab--active">Skilling</Link>
        <Link href="/livelihood/placement" className="tab">Placement</Link>
        <Link href="/livelihood/enterprise" className="tab">Enterprise</Link>
      </div>

      {data && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('persons')}>
              <div className="kpi-body">
                <div className="kpi-value">{fmt(data.beneficiaries?.roster_count ?? data.beneficiaries?.total_trained)}</div>
                <div className="kpi-label">Skill roster</div>
                <p className="kpi-caption">{data.beneficiaries?.caption}</p>
              </div>
            </div>
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('gender', 'Female')}>
              <div className="kpi-body">
                <div className="kpi-value">
                  {fmt(data.demographics?.gender_breakdown?.find(g => g.gender === 'Female' || g.gender === 'F')?.count)}
                </div>
                <div className="kpi-label">Women on roster</div>
                <p className="kpi-caption">Livelihood gender codes are Male/Female, not F/M.</p>
              </div>
            </div>
          </div>

          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Work status · monitored subset</h3></div>
              <div className="card-body">
                <BrandDoughnut
                  labels={data.beneficiaries?.status_breakdown?.map(r => r.status) || []}
                  values={data.beneficiaries?.status_breakdown?.map(r => r.count) || []}
                  colors={[NAVY, SKY, GOLD]}
                  caption="Monitored subset (skilltracking_monitor), not the full roster. Sample is Working / Not Working only."
                  onSliceClick={(label) => handleDrilldown('work_status', label)}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Current monthly income buckets</h3></div>
              <div className="card-body">
                <ColumnBar
                  labels={['₹0–5K', '₹5K–10K', '₹10K+']}
                  values={[data.income?.['0_5000'], data.income?.['5001_10000'], data.income?.['10001_plus']]}
                  colors={[NAVY, SKY, GOLD]}
                  caption="Current monthly_income stock, not income increase. No baseline in the schema."
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
                <BrandDoughnut
                  labels={data.demographics?.gender_breakdown?.map(r => r.gender) || []}
                  values={data.demographics?.gender_breakdown?.map(r => r.count) || []}
                  colors={[NAVY, SKY]}
                  onSliceClick={(label) => handleDrilldown('gender', label)}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Age brackets · roster</h3></div>
              <div className="card-body">
                <ColumnBar
                  labels={data.demographics?.age_brackets ? Object.keys(data.demographics.age_brackets) : []}
                  values={data.demographics?.age_brackets ? Object.values(data.demographics.age_brackets) : []}
                  colors={[NAVY, SKY, GOLD, LIME, '#5B7FCF']}
                  onBarClick={(label) => handleDrilldown('age', label)}
                />
              </div>
            </div>
          </div>

          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Roster by trade</h3></div>
              <div className="card-body">
                <RankingBar
                  items={(data.byTrade || []).map(r => ({ label: r.trade, value: r.count }))}
                  color={NAVY}
                  caption="training_stream_id → stream_name (API training_name)."
                  onBarClick={(label) => handleDrilldown('trade', label)}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Batches by trade</h3></div>
              <div className="card-body">
                <RankingBar
                  items={(data.sessionsByTrade || []).map(r => ({ label: r.trade, value: r.batches }))}
                  color={LIME}
                  caption="COUNT(skilltracking_batch_list), not mentorship sessions."
                  onBarClick={(label) => handleDrilldown('trade', label)}
                />
              </div>
            </div>
          </div>

          {prePostData && (
            <div className="card" style={{ marginTop: '24px' }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Pre vs post assessment headcount</h3>
                <span className="badge badge--success" style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', background: 'var(--navy)', color: 'white' }} onClick={() => handleDrilldown('pre_post')}>
                  View raw data
                </span>
              </div>
              <div className="card-body">
                <GroupedBar
                  labels={prePostData.labels}
                  datasets={[
                    { label: 'Pre-assessment trained', data: prePostData.pre, color: SKY },
                    { label: 'Post-assessment trained', data: prePostData.post, color: NAVY }
                  ]}
                  caption="placement_status is an integer with no codebook — not a 4-way employment status."
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
