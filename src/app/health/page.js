'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import RankingBar from '../../components/charts/RankingBar';
import BrandDoughnut from '../../components/charts/BrandDoughnut';
import BrandLine from '../../components/charts/BrandLine';
import GroupedBar from '../../components/charts/GroupedBar';
import ColumnBar from '../../components/charts/ColumnBar';
import BenchmarkBar from '../../components/charts/BenchmarkBar';
import DrilldownModal from '../../components/DrilldownModal';
import YearStrip from '../../components/YearStrip';
import ChartFocusBar from '../../components/ChartFocusBar';
import PageRail from '../../components/PageRail';
import { useChartFocus, patchFilters } from '../../hooks/useChartFocus';
import { NAVY, SKY } from '../../lib/chartTheme';
import IndiaMap from '../../components/charts/IndiaMap';

function settledData(result) {
  return result.status === 'fulfilled' ? result.value.data : null;
}

export default function HealthPage() {
  const [data, setData] = useState({
    reach: null,
    depth: null,
    inclusion: null,
    benchmarks: null,
    map: null
  });
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState({ isOpen: false, title: '', apiUrl: '', params: {} });
  const { focus, select, remove, clear } = useChartFocus();

  useEffect(() => {
    const handleApply = (e) => setFilters(e.detail || {});
    window.addEventListener('app:filters:apply', handleApply);
    return () => window.removeEventListener('app:filters:apply', handleApply);
  }, []);

  const fetchAllData = React.useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ''))
    ).toString();
    try {
      const [reach, depth, inclusion, benchmarks, map] = await Promise.allSettled([
        axios.get(`/api/health/reach?${query}`),
        axios.get(`/api/health/depth?${query}`),
        axios.get(`/api/health/inclusion?${query}`),
        axios.get(`/api/health/benchmarks?${query}`),
        axios.get(`/api/health/map?${query}`)
      ]);
      setData({
        reach: settledData(reach),
        depth: settledData(depth),
        inclusion: settledData(inclusion),
        benchmarks: settledData(benchmarks),
        map: settledData(map)
      });
      const failed = [reach, depth, inclusion].filter((r) => r.status === 'rejected');
      if (failed.length === 3) {
        setLoadError('Unable to load health data.');
      }
    } catch (err) {
      setLoadError('Unable to load health data.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const fmt = (n) => (n || n === 0) ? Number(n).toLocaleString('en-IN') : '—';
  const fmtINR = (n) => (n || n === 0) ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

  const handleDrilldown = (type, label, extraParams = {}, event) => {
    if (type === 'disease' || type === 'symptom') {
      select(label, event);
      if (event?.shiftKey || event?.metaKey) return;
    }
    setModal({
      isOpen: true,
      title: `${type.charAt(0).toUpperCase() + type.slice(1)}: ${label}`,
      apiUrl: '/api/health/drilldown',
      params: { ...filters, type, value: label, ...extraParams }
    });
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
      <div className="spinner"></div>
    </div>
  );

  const yearLabel = data.reach?.envelope_year || data.depth?.disease_mix_year || filters.year || '—';
  const selectedStateId = String(filters.state_id || '').split(',').filter(Boolean)[0] || '';
  const drillStateName = selectedStateId ? (data.map?.stateById?.[selectedStateId] || null) : null;
  const yearChoices = [...new Set([
    ...(data.reach?.beneficiary_yoy || []).map((r) => String(r.year)).filter(Boolean),
    yearLabel !== '—' ? String(yearLabel) : '',
    filters.year ? String(filters.year) : ''
  ].filter(Boolean))].sort();
  const showInclusion = data.inclusion?.available && (
    (data.inclusion.community_interventions || []).length > 0
    || data.inclusion.senior_citizens
    || data.inclusion.women_count
  );

  return (
    <div>
      {loadError && <p className="kpi-caption" style={{ color: '#b91c1c', marginBottom: '12px' }}>{loadError}</p>}

      <PageRail>
        <YearStrip
          label="Year"
          years={yearChoices}
          value={filters.year || yearLabel}
          onChange={(year) => patchFilters({ year })}
        />
        <ChartFocusBar
          focus={focus}
          onClear={clear}
          onRemove={remove}
          hint="Shift-click a second disease to compare"
        />
      </PageRail>

      <div className="kpi-grid">
        <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('patients', 'Direct Beneficiaries')}>
          <div className="kpi-body">
            <div className="kpi-value">{fmt(data.reach?.direct_beneficiaries)}</div>
            <div className="kpi-label">Direct beneficiaries</div>
          </div>
        </div>
        <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('envelope', yearLabel)}>
          <div className="kpi-body">
            <div className="kpi-value">{fmt(data.reach?.villages_reached)}</div>
            <div className="kpi-label">Villages reached</div>
          </div>
        </div>
        <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('age', 'Adolescents (10–19)')}>
          <div className="kpi-body">
            <div className="kpi-value">{fmt(data.reach?.adolescents_10_19)}</div>
            <div className="kpi-label">Adolescents (10–19)</div>
          </div>
        </div>
        {data.depth?.appointments_available && (
          <>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{data.depth?.repeat_patient_pct || '0'}%</div>
                <div className="kpi-label">Repeat patient rate</div>
              </div>
            </div>
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('appointments', yearLabel)}>
              <div className="kpi-body">
                <div className="kpi-value">{fmt(data.depth?.total_appointments)}</div>
                <div className="kpi-label">Appointments</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{fmtINR(data.depth?.fees_collected)}</div>
                <div className="kpi-label">Fees collected</div>
              </div>
            </div>
          </>
        )}
      </div>

      {data.reach?.beneficiary_yoy?.some((r) => Number(r.total_beneficiary) > 0) && (
        <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Direct beneficiaries · year on year</h3>
          </div>
          <div className="card-body">
            <BrandLine
              labels={data.reach.beneficiary_yoy.map((r) => r.year)}
              values={data.reach.beneficiary_yoy.map((r) => r.total_beneficiary)}
              label="Direct beneficiaries"
              onPointClick={(label) => {
                patchFilters({ year: label });
                handleDrilldown('envelope', label);
              }}
            />
          </div>
        </div>
      )}

      <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Patients by state</h3>
        </div>
        <div className="card-body">
          <IndiaMap
            stateMetrics={data.map?.stateMetrics}
            districtMetrics={data.map?.districtMetrics}
            metricLabel="Patients"
            districtBubbles
            enableDrilldown
            drillStateName={drillStateName}
            unmapped={data.map?.unmapped || []}
            onRegionSelect={({ level, stateId, districtId }) => {
              if (!stateId) return;
              if (level === 'district') patchFilters({ state_id: stateId, district_id: districtId || '' });
              else patchFilters({ state_id: stateId, district_id: '' });
            }}
            onBack={() => patchFilters({ state_id: '', district_id: '' })}
            caption="Patients by state and district for the selected year and gender. Choosing a state opens its districts. A region with no patients shows No data."
          />
        </div>
      </div>

      <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>
            {data.benchmarks?.grain === 'district' ? 'Districts vs state and programme averages' : 'States vs programme average'}
          </h3>
        </div>
        <div className="card-body">
          <BenchmarkBar
            payload={data.benchmarks}
            onBarClick={(label, row) => handleDrilldown('geo', label, {
              grain: data.benchmarks?.grain,
              geo_id: row?.id || label
            })}
          />
        </div>
      </div>

      <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Patients by disease · {yearLabel}</h3>
        </div>
        <div className="card-body">
          <RankingBar
            items={(data.depth?.disease_mix || []).map(r => ({ label: r.disease, value: r.patients }))}
            maxItems={15}
            pareto
            focus={focus}
            onBarClick={(label, _v, _i, ev) => handleDrilldown('disease', label, {}, ev)}
          />
        </div>
      </div>

      {(data.reach?.adolescent_share || []).length > 0 && (
        <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Age mix</h3>
          </div>
          <div className="card-body">
            {(data.reach.adolescent_share.length <= 5) ? (
              <BrandDoughnut
                labels={data.reach.adolescent_share.map(r => r.label)}
                values={data.reach.adolescent_share.map(r => r.value)}
                onSliceClick={(label) => handleDrilldown('age', label)}
              />
            ) : (
              <ColumnBar
                labels={data.reach.adolescent_share.map(r => r.label)}
                values={data.reach.adolescent_share.map(r => r.value)}
                onBarClick={(label) => handleDrilldown('age', label)}
              />
            )}
          </div>
        </div>
      )}

      {data.depth?.disease_yoy?.length > 0 && (
        <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>
              Disease mix · {data.depth.disease_yoy[0]?.last_year_label} vs {data.depth.disease_yoy[0]?.this_year_label}
            </h3>
          </div>
          <div className="card-body">
            <GroupedBar
              horizontal
              labels={data.depth.disease_yoy.map(r => r.disease)}
              datasets={[
                { label: data.depth.disease_yoy[0]?.last_year_label, data: data.depth.disease_yoy.map(r => r.last_year), color: SKY },
                { label: data.depth.disease_yoy[0]?.this_year_label, data: data.depth.disease_yoy.map(r => r.this_year), color: NAVY }
              ]}
              focus={focus}
              onBarClick={(label, _idx, datasetIndex, ev) => {
                const year = datasetIndex === 0
                  ? data.depth.disease_yoy[0]?.last_year_label
                  : data.depth.disease_yoy[0]?.this_year_label;
                handleDrilldown('disease', label, { year }, ev);
              }}
            />
          </div>
        </div>
      )}

      <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Patients by symptom · {yearLabel}</h3>
        </div>
        <div className="card-body">
          <RankingBar
            items={(data.depth?.symptom_mix || []).map(r => ({ label: r.symptom, value: r.patients }))}
            maxItems={15}
            focus={focus}
            onBarClick={(label, _v, _i, ev) => handleDrilldown('symptom', label, {}, ev)}
          />
        </div>
      </div>

      {showInclusion && (
        <div className="card-row">
          <div className="card" style={{ flex: 2 }}>
            <div className="card-header">
              <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Community</h3>
            </div>
            <div className="card-body">
              {(data.inclusion?.community_interventions || []).length <= 5 ? (
                <BrandDoughnut
                  labels={(data.inclusion?.community_interventions || []).map(r => r.community)}
                  values={(data.inclusion?.community_interventions || []).map(r => r.count)}
                  onSliceClick={(label) => handleDrilldown('community', label)}
                />
              ) : (
                <RankingBar
                  items={(data.inclusion?.community_interventions || []).map(r => ({ label: r.community, value: r.count }))}
                  onBarClick={(label) => handleDrilldown('community', label)}
                />
              )}
            </div>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <div className="card-header">
              <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Inclusion</h3>
            </div>
            <div className="card-body">
              <div className="stat-row" style={{ cursor: 'pointer' }} onClick={() => handleDrilldown('inclusion', 'seniors')}>
                <span className="stat-label">Senior citizens (60+)</span>
                <span className="stat-value">{fmt(data.inclusion?.senior_citizens)}</span>
              </div>
              <div className="stat-row" style={{ cursor: 'pointer' }} onClick={() => handleDrilldown('inclusion', 'disability')}>
                <span className="stat-label">Persons with disability</span>
                <span className="stat-value">{fmt(data.inclusion?.people_with_disability)}</span>
              </div>
              <div className="stat-row" style={{ cursor: 'pointer' }} onClick={() => handleDrilldown('inclusion', 'women')}>
                <span className="stat-label">Women</span>
                <span className="stat-value">{fmt(data.inclusion?.women_count)}</span>
              </div>
            </div>
          </div>
        </div>
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
