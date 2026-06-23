'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Link from 'next/link';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, PointElement, LineElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import DrilldownModal from '../../../components/DrilldownModal';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, PointElement, LineElement);

const PALETTE = ['#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fff1f2'];

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
    const query = new URLSearchParams(filters).toString();
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

  const fmt = (n) => n?.toLocaleString() || '—';

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
    
    // Group by trade_name
    const tradesMap = {};
    data.prePost.forEach(r => {
      if (!tradesMap[r.trade_name]) {
        tradesMap[r.trade_name] = { pre: 0, post: 0 };
      }
      if (r.assessment_type === 'PRE') {
        tradesMap[r.trade_name].pre += r.trained || 0;
      } else if (r.assessment_type === 'POST') {
        tradesMap[r.trade_name].post += r.trained || 0;
      }
    });

    const labels = Object.keys(tradesMap);
    const preTrained = labels.map(l => tradesMap[l].pre);
    const postTrained = labels.map(l => tradesMap[l].post);

    return {
      labels,
      datasets: [
        {
          label: 'Pre-Assessment Trained',
          data: preTrained,
          backgroundColor: '#fda4af',
          borderRadius: 4
        },
        {
          label: 'Post-Assessment Trained',
          data: postTrained,
          backgroundColor: '#e11d48',
          borderRadius: 4
        }
      ]
    };
  })();

  return (
    <div>
      {/* Header */}
      <div className="section-header">
        <h2 className="card-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>Livelihood — Skilling</h2>
        <p className="section-sub">Empowerment through skilling, placement and enterprise support</p>
      </div>

      {/* Tabs */}
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
                <div className="kpi-value">{fmt(data.beneficiaries?.total_trained)}</div>
                <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Total Trained</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{data.demographics?.sroi?.toFixed(2) || '—'}x</div>
                <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>SROI</div>
                <div className="kpi-sub" style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>income ÷ programme cost</div>
              </div>
            </div>
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('gender', 'Female')}>
              <div className="kpi-body">
                <div className="kpi-value">
                  {fmt(data.demographics?.gender_breakdown?.find(g => g.gender === 'Female' || g.gender === 'F')?.count)}
                </div>
                <div className="kpi-label" style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Women Impacted</div>
              </div>
            </div>
          </div>

          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Work Status Breakdown</h3></div>
              <div className="card-body">
                <div className="h-[280px]">
                  <Doughnut
                    data={{
                      labels: data.beneficiaries?.status_breakdown?.map(r => r.status) || [],
                      datasets: [{ data: data.beneficiaries?.status_breakdown?.map(r => r.count) || [], backgroundColor: PALETTE }]
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'bottom' } },
                      onClick: (e, els) => els.length && handleDrilldown('work_status', data.beneficiaries?.status_breakdown?.[els[0].index]?.status)
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Income Distribution</h3></div>
              <div className="card-body">
                <div className="h-[280px]">
                  <Bar
                    data={{
                      labels: ['₹0–5K', '₹5K–10K', '₹10K+'],
                      datasets: [{ data: [data.income?.['0_5000'], data.income?.['5001_10000'], data.income?.['10001_plus']], backgroundColor: PALETTE }]
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      onClick: (e, els) => {
                        const labels = ['0_5000', '5001_10000', '10001_plus'];
                        if (els.length) handleDrilldown('income_range', labels[els[0].index]);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Gender Breakdown</h3></div>
              <div className="card-body">
                <div className="h-[280px]">
                  <Doughnut
                    data={{
                      labels: data.demographics?.gender_breakdown?.map(r => r.gender) || [],
                      datasets: [{ data: data.demographics?.gender_breakdown?.map(r => r.count) || [], backgroundColor: PALETTE }]
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'bottom' } },
                      onClick: (e, els) => els.length && handleDrilldown('gender', data.demographics?.gender_breakdown?.[els[0].index]?.gender)
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Age Brackets</h3></div>
              <div className="card-body">
                <div className="h-[280px]">
                  <Bar
                    data={{
                      labels: data.demographics?.age_brackets ? Object.keys(data.demographics.age_brackets) : [],
                      datasets: [{ data: data.demographics?.age_brackets ? Object.values(data.demographics.age_brackets) : [], backgroundColor: PALETTE[2] }]
                    }}
                    options={{
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      onClick: (e, els) => {
                        const labels = Object.keys(data.demographics.age_brackets);
                        if (els.length) handleDrilldown('age', labels[els[0].index]);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="card-row">
            <div className="card">
              <div className="card-header"><h3>Beneficiaries by Trade</h3></div>
              <div className="card-body">
                <div className="h-[300px]">
                  <Bar
                    data={{
                      labels: data.byTrade?.map(r => r.trade) || [],
                      datasets: [{ data: data.byTrade?.map(r => r.count) || [], backgroundColor: PALETTE[0] }]
                    }}
                    options={{
                      maintainAspectRatio: false,
                      indexAxis: 'y',
                      plugins: { legend: { display: false } },
                      onClick: (e, els) => els.length && handleDrilldown('trade', data.byTrade?.[els[0].index]?.trade)
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Batches by Trade</h3></div>
              <div className="card-body">
                <div className="h-[300px]">
                  <Bar
                    data={{
                      labels: data.sessionsByTrade?.map(r => r.trade) || [],
                      datasets: [{ data: data.sessionsByTrade?.map(r => r.batches) || [], backgroundColor: PALETTE[3] }]
                    }}
                    options={{
                      maintainAspectRatio: false,
                      indexAxis: 'y',
                      plugins: { legend: { display: false } },
                      onClick: (e, els) => els.length && handleDrilldown('trade', data.sessionsByTrade?.[els[0].index]?.trade)
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {prePostData && (
            <div className="card" style={{ marginTop: '24px' }}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Pre vs Post Assessment Outcomes</h3>
                <span className="badge badge--success" style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', background: '#e11d48', color: 'white' }} onClick={() => handleDrilldown('pre_post')}>
                  View Raw Data
                </span>
              </div>
              <div className="card-body">
                <div className="h-[320px]">
                  <Bar
                    data={prePostData}
                    options={{
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'bottom' }
                      },
                      onClick: (e, els) => {
                        if (els.length) {
                          const assessmentType = els[0].datasetIndex === 0 ? 'PRE' : 'POST';
                          handleDrilldown('pre_post', assessmentType);
                        }
                      }
                    }}
                  />
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
