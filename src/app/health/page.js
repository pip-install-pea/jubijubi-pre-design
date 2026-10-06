'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import RankingBar from '../../components/charts/RankingBar';
import BrandDoughnut from '../../components/charts/BrandDoughnut';
import BrandLine from '../../components/charts/BrandLine';
import EChart, { groupedBarOption, stackedBarOption } from '../../components/charts/EChart';
import DrilldownModal from '../../components/DrilldownModal';
import YearStrip from '../../components/YearStrip';
import ChartFocusBar from '../../components/ChartFocusBar';
import PageRail from '../../components/PageRail';
import FilterTags from '../../components/FilterTag';
import { useChartFocus, patchFilters } from '../../hooks/useChartFocus';
import { formatCount, formatINR } from '../../lib/format';
import { Users, MapPin, Baby, CalendarCheck, CurrencyInr, Stethoscope, House } from '@phosphor-icons/react';
import IndiaMap from '../../components/charts/IndiaMap';

const DISEASE_COLORS = ['#1d4ed8', '#0284c7', '#0f766e', '#15803d', '#a16207', '#c2410c', '#b91c1c', '#be185d', '#7e22ce', '#4338ca', '#0e7490', '#4d7c0f', '#b45309', '#9f1239', '#6d28d9', '#334155'];
const SYMPTOM_COLORS = {
  Respiratory: '#0284c7',
  'Pain-related': '#c2410c',
  'Infection-related': '#b91c1c',
  'Lifestyle-related': '#7e22ce',
  General: '#15803d',
  'Other/Unspecified': '#64748b'
};

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

  const yearLabel = data.depth?.effective_year || data.reach?.envelope_year || data.depth?.disease_mix_year || filters.year || '—';
  const selectedStateId = String(filters.state_id || '').split(',').filter(Boolean)[0] || '';
  const drillStateName = selectedStateId ? (data.map?.stateById?.[selectedStateId] || null) : null;
  const envelopeNote = (filters.state_id || filters.district_id || filters.month) ? 'All states · calendar year' : '';
  const direct = Number(data.reach?.direct_beneficiaries) || 0;
  const indirect = direct * 5;
  const villageItems = [
    ...(data.reach?.top_villages || []),
    ...((Number(data.reach?.other_villages) || 0) > 0
      ? [{ label: `Other villages (${data.reach.other_villages})`, value: data.reach.other_village_patients }]
      : [])
  ];
  const doctorNote = data.reach?.doctors_follow_geo ? 'Current roster' : 'Current roster · All states';
  const monthOn = Boolean(filters.month);
  const diseaseRows = data.depth?.disease_mix || [];
  const diseaseTail = diseaseRows.slice(15);
  const diseaseChart = [
    ...diseaseRows.slice(0, 15).map((row) => ({ label: row.disease, value: row.patients })),
    ...(diseaseTail.length ? [{
      label: `Other diseases (${diseaseTail.length})`,
      value: diseaseTail.reduce((sum, row) => sum + (Number(row.patients) || 0), 0)
    }] : [])
  ];
  const geoRows = data.benchmarks?.rows || [];
  const geoTitle = data.benchmarks?.grain === 'district' ? 'District wise patients' : 'State wise patients';
  const ageBands = data.depth?.age_bands || [];
  const h1Patients = data.depth?.h1_patients || [];
  const h1Base = Number(h1Patients[0]?.value) || 0;
  const h1Next = Number(h1Patients[1]?.value) || 0;
  const h1Change = h1Base ? ((h1Next - h1Base) / h1Base) * 100 : null;
  const inclusionTotal = Number(data.inclusion?.patient_total) || 0;
  const inclusionBars = [
    { label: 'Senior citizens (60+)', value: Number(data.inclusion?.senior_citizens) || 0 },
    { label: 'Persons with disability', value: Number(data.inclusion?.people_with_disability) || 0 },
    { label: 'Women', value: Number(data.inclusion?.women_count) || 0 }
  ];
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
            <Users size={22} weight="duotone" />
            <div className="kpi-value">{formatCount(data.reach?.direct_beneficiaries)}</div>
            <div className="kpi-label">Direct beneficiaries</div>
            <p className="kpi-caption">Patients reached in this calendar year.</p>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
            <FilterTags note={envelopeNote} monthIgnored={monthOn} />
          </div>
        </div>
        <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('patients', 'Indirect beneficiaries')}>
          <div className="kpi-body">
            <Users size={22} weight="duotone" />
            <div className="kpi-value">{formatCount(indirect)}</div>
            <div className="kpi-label">Indirect beneficiaries (estimate)</div>
            <p className="kpi-caption">Direct × 5</p>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
            <FilterTags note={envelopeNote} monthIgnored={monthOn} />
          </div>
        </div>
        <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('villages', yearLabel)}>
          <div className="kpi-body">
            <House size={22} weight="duotone" />
            <div className="kpi-value">{formatCount(data.reach?.villages_reached)}</div>
            <div className="kpi-label">Villages reached</div>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
            <FilterTags note={envelopeNote} monthIgnored={monthOn} />
          </div>
        </div>
        <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('age', 'Adolescents (10–19)')}>
          <div className="kpi-body">
            <Baby size={22} weight="duotone" />
            <div className="kpi-value">{formatCount(data.reach?.adolescents_10_19)}</div>
            <div className="kpi-label">Adolescents (10–19)</div>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
            <FilterTags note={envelopeNote} monthIgnored={monthOn} />
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-body">
            <MapPin size={22} weight="duotone" />
            <div className="kpi-value">{formatCount(data.reach?.states_reached)}</div>
            <div className="kpi-label">States</div>
            <p className="kpi-caption">States in the health envelope for this calendar year.</p>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
            <FilterTags note={envelopeNote} monthIgnored={monthOn} />
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-body">
            <MapPin size={22} weight="duotone" />
            <div className="kpi-value">{formatCount(data.reach?.districts)}</div>
            <div className="kpi-label">Districts</div>
            <p className="kpi-caption">Distinct districts on patient profiles for this year.</p>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
          </div>
        </div>
        {data.depth?.appointments_available && (
          <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('appointments', yearLabel)}>
            <div className="kpi-body">
              <CalendarCheck size={22} weight="duotone" />
              <div className="kpi-value">{formatCount(data.depth?.total_appointments)}</div>
              <div className="kpi-label">Appointments (visits)</div>
              <p className="kpi-caption">Each visit counts once; one patient can visit many times.</p>
              <p className="kpi-caption">Calendar year {yearLabel}</p>
            </div>
          </div>
        )}
        <div className="kpi-card">
          <div className="kpi-body">
            <Baby size={22} weight="duotone" />
            <div className="kpi-value">{formatCount(data.reach?.pregnant_women)}</div>
            <div className="kpi-label">Pregnant women</div>
            <p className="kpi-caption">Profiles with female_is_pregnant = Y.</p>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
          </div>
        </div>
        <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('doctors', 'Doctors')}>
          <div className="kpi-body">
            <Stethoscope size={22} weight="duotone" />
            <div className="kpi-value">{formatCount(data.reach?.doctors)}</div>
            <div className="kpi-label">Doctors</div>
            <p className="kpi-caption">Unique active doctors on Jubicare (all partners); deleted profiles excluded.</p>
            <FilterTags note={doctorNote} monthIgnored={monthOn} />
          </div>
        </div>
        {data.depth?.appointments_available && (
          <div className="kpi-card">
            <div className="kpi-body">
              <CurrencyInr size={22} weight="duotone" />
              <div className="kpi-value">{formatINR(data.depth?.fees_collected)}</div>
              <div className="kpi-label">Fee Revenue Generated</div>
              <p className="kpi-caption">Sum of fees paid at appointments</p>
              <p className="kpi-caption">Calendar year {yearLabel}</p>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Health impact</h3>
          <p className="kpi-caption">Calendar year {yearLabel}</p>
          <FilterTags monthIgnored={monthOn} />
        </div>
        <div className="card-body">
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-body">
                <Users size={22} weight="duotone" />
                <div className="kpi-value">{formatCount(direct)}</div>
                <div className="kpi-label">Patients reached</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-body">
                <Users size={22} weight="duotone" />
                <div className="kpi-value">{formatCount(indirect)}</div>
                <div className="kpi-label">Indirect beneficiaries (estimate)</div>
                <p className="kpi-caption">Direct × 5</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {villageItems.length > 0 && (
        <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Top villages by patients</h3>
            <p className="kpi-caption">Calendar year {yearLabel}. Names from the village master. The list total is patients under the year and geography filters.</p>
          </div>
          <div className="card-body">
            <RankingBar
              items={villageItems}
              maxItems={16}
              onBarClick={() => handleDrilldown('villages', yearLabel)}
            />
          </div>
        </div>
      )}

      {data.reach?.beneficiary_yoy?.some((r) => Number(r.total_beneficiary) > 0) && (
        <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Direct beneficiaries · year on year</h3>
            <p className="kpi-caption">Each point is that calendar year. Envelope totals ignore state, district, and month.</p>
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

      {(data.depth?.patients_by_month || []).some((row) => row.value > 0) && (
        <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Patients by month</h3>
            <p className="kpi-caption">New registrations in calendar year {yearLabel}. This chart shows every month. Other profile cards follow the month filter.</p>
          </div>
          <div className="card-body">
            <EChart
              option={groupedBarOption(
                data.depth.patients_by_month.map((row) => row.label),
                [{ label: 'Patients', data: data.depth.patients_by_month.map((row) => row.value) }],
                { showLabels: true, legend: false }
              )}
              height={320}
            />
          </div>
        </div>
      )}

      {geoRows.length > 0 && (
        <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>{geoTitle}</h3>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
          </div>
          <div className="card-body">
            <EChart
              option={groupedBarOption(
                geoRows.map((row) => row.label),
                [{ label: 'Patients', data: geoRows.map((row) => row.value) }],
                { horizontal: true, showLabels: true, withPercent: true, legend: false, gridLeft: 150 }
              )}
              height={Math.max(280, geoRows.length * 28)}
              onPoint={(point) => {
                const row = geoRows.find((item) => item.label === point.name);
                if (!point.name) return;
                handleDrilldown('geo', point.name, {
                  grain: data.benchmarks?.grain,
                  geo_id: row?.id || point.name
                });
              }}
            />
          </div>
        </div>
      )}

      {diseaseChart.length > 0 && (
        <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Disease wise patient</h3>
            <p className="kpi-caption">Calendar year {data.depth?.disease_mix_year || yearLabel}</p>
            <FilterTags monthIgnored={monthOn} />
          </div>
          <div className="card-body">
            <EChart
              option={groupedBarOption(
                diseaseChart.map((row) => row.label),
                [{ label: 'Patients', data: diseaseChart.map((row) => row.value) }],
                { showLabels: true, rotateLabels: true, legend: false, colors: diseaseChart.map((_, index) => DISEASE_COLORS[index % DISEASE_COLORS.length]) }
              )}
              height={420}
              focus={focus}
              onPoint={(point) => {
                if (!point.name) return;
                if (String(point.name).startsWith('Other diseases')) {
                  handleDrilldown('disease_other', point.name, {}, point.nativeEvent);
                  return;
                }
                handleDrilldown('disease', point.name, {}, point.nativeEvent);
              }}
            />
          </div>
        </div>
      )}

      {ageBands.length > 0 && (
        <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Age Wise Patient · N = {formatCount(data.depth?.age_total)}</h3>
            <p className="kpi-caption">Calendar year {yearLabel}. Non-numeric age is "Age not recorded".</p>
          </div>
          <div className="card-body">
            <EChart
              option={stackedBarOption(
                ageBands.map((row) => row.band),
                [
                  { label: 'Male', data: ageBands.map((row) => row.male) },
                  { label: 'Female', data: ageBands.map((row) => row.female) },
                  { label: 'Other', data: ageBands.map((row) => row.other) }
                ],
                { tooltipPercent: true }
              )}
              height={360}
            />
          </div>
        </div>
      )}

      {(data.depth?.gender_mix || []).length > 0 && (
        <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Gender Wise Patient · N = {formatCount((data.depth.gender_mix || []).reduce((sum, row) => sum + (Number(row.value) || 0), 0))}</h3>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
          </div>
          <div className="card-body">
            <BrandDoughnut
              percent
              labels={data.depth.gender_mix.map((row) => row.label)}
              values={data.depth.gender_mix.map((row) => row.value)}
            />
          </div>
        </div>
      )}

      {data.depth?.disease_yoy?.length > 0 && (
        <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>
              Year wise comparison on disease ({data.depth.disease_yoy[0]?.last_year_label} vs {data.depth.disease_yoy[0]?.this_year_label})
            </h3>
            <p className="kpi-caption">
              {String(data.depth.disease_yoy[0]?.this_year_label) === '2026' ? '2026 is year to date. ' : ''}
              Percent of that year's patients. Count is in the tooltip.
            </p>
            <FilterTags monthIgnored={monthOn} />
          </div>
          <div className="card-body">
            <EChart
              option={groupedBarOption(
                data.depth.disease_yoy.map((row) => row.disease),
                [
                  { label: data.depth.disease_yoy[0]?.last_year_label, data: data.depth.disease_yoy.map((row) => row.last_year), color: '#38bdf8', percentBase: data.depth.disease_yoy_last_total },
                  { label: data.depth.disease_yoy[0]?.this_year_label, data: data.depth.disease_yoy.map((row) => row.this_year), color: '#1e3a8a', percentBase: data.depth.disease_yoy_this_total }
                ],
                { showLabels: true, seriesPercent: true, rotateLabels: true }
              )}
              height={420}
              focus={focus}
              onPoint={(point) => {
                const year = point.seriesName;
                if (point.name) handleDrilldown('disease', point.name, { year }, point.nativeEvent);
              }}
            />
          </div>
        </div>
      )}

      {h1Patients.some((row) => row.value > 0) && (
        <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>H1 2025 vs H1 2026</h3>
            <p className="kpi-caption">
              Patients registered in calendar January–June.
              {h1Change == null ? '' : ` Change ${h1Change > 0 ? '+' : ''}${h1Change.toFixed(1)}%.`}
            </p>
          </div>
          <div className="card-body">
            <BrandDoughnut
              pie
              percent
              labels={h1Patients.map((row) => row.label)}
              values={h1Patients.map((row) => row.value)}
            />
          </div>
        </div>
      )}

      {(data.depth?.h1_diseases?.rows || []).length > 0 && (
        <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>H1 diseases</h3>
            <p className="kpi-caption">
              (proxy) appointments with a disease recorded, n = {formatCount(data.depth.h1_diseases.n_2025)} in H1 2025 and {formatCount(data.depth.h1_diseases.n_2026)} in H1 2026.
            </p>
          </div>
          <div className="card-body">
            <EChart
              option={groupedBarOption(
                data.depth.h1_diseases.rows.map((row) => row.label),
                [
                  { label: 'H1 2025', data: data.depth.h1_diseases.rows.map((row) => row.h1_2025), color: '#38bdf8' },
                  { label: 'H1 2026', data: data.depth.h1_diseases.rows.map((row) => row.h1_2026), color: '#1e3a8a' }
                ],
                { horizontal: true, showLabels: true, gridLeft: 160 }
              )}
              height={Math.max(280, data.depth.h1_diseases.rows.length * 36)}
            />
          </div>
        </div>
      )}

      <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Symptom mentions · {yearLabel}</h3>
          <p className="kpi-caption">Calendar year {data.depth?.disease_mix_year || yearLabel}. Counts are symptom mentions, not patients.</p>
          <FilterTags monthIgnored={monthOn} />
        </div>
        <div className="card-body">
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{formatCount(data.depth?.symptom_view?.total_mentions)}</div>
                <div className="kpi-label">Total symptom mentions</div>
              </div>
            </div>
            <p className="kpi-caption" style={{ width: '100%' }}>Top 3 health concerns</p>
            {(data.depth?.symptom_view?.top3 || []).map((row) => (
              <div key={row.label} className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('symptom', row.label)}>
                <div className="kpi-body">
                  <div className="kpi-value">{formatCount(row.value)}</div>
                  <div className="kpi-label">{row.label}</div>
                  <p className="kpi-caption">{row.category}</p>
                </div>
              </div>
            ))}
          </div>
          {(data.depth?.symptom_view?.bars || []).length > 0 && (
            <EChart
              option={groupedBarOption(
                data.depth.symptom_view.bars.map((row) => row.label),
                [{ label: 'Mentions', data: data.depth.symptom_view.bars.map((row) => row.value) }],
                {
                  horizontal: true,
                  showLabels: true,
                  legend: false,
                  gridLeft: 160,
                  colors: data.depth.symptom_view.bars.map((row) => SYMPTOM_COLORS[row.category] || '#64748b')
                }
              )}
              height={Math.max(280, data.depth.symptom_view.bars.length * 32)}
              onPoint={(point) => point.name && handleDrilldown('symptom', point.name)}
            />
          )}
          {(data.depth?.symptom_view?.categories || []).length > 0 && (
            <BrandDoughnut
              title="Symptom categories"
              percent
              labels={data.depth.symptom_view.categories.map((row) => row.label)}
              values={data.depth.symptom_view.categories.map((row) => row.value)}
              colors={data.depth.symptom_view.categories.map((row) => SYMPTOM_COLORS[row.label] || '#64748b')}
            />
          )}
        </div>
      </div>

      {showInclusion && (
        <div className="card-row">
          <div className="card" style={{ flex: 2 }}>
            <div className="card-header">
              <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Category wise patients</h3>
              <p className="kpi-caption">Calendar year {data.inclusion?.effective_year || yearLabel}. Blank category is "Not recorded". Numeric codes stay unmapped.</p>
            </div>
            <div className="card-body">
              <BrandDoughnut
                percent
                labels={(data.inclusion?.community_interventions || []).map((row) => row.community)}
                values={(data.inclusion?.community_interventions || []).map((row) => row.count)}
                onSliceClick={(label) => handleDrilldown('community', label)}
              />
            </div>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <div className="card-header">
              <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Inclusion</h3>
              <p className="kpi-caption">Calendar year {data.inclusion?.effective_year || yearLabel}. Senior citizens are age 60 or older. Disability is recorded as Yes. Women are gender F. Percents use all patients in this year and filter.</p>
            </div>
            <div className="card-body">
              <EChart
                option={groupedBarOption(
                  inclusionBars.map((row) => row.label),
                  [{ label: 'Patients', data: inclusionBars.map((row) => row.value) }],
                  { horizontal: true, showLabels: true, withPercent: true, percentBase: inclusionTotal, legend: false, gridLeft: 190 }
                )}
                height={220}
                onPoint={(point) => {
                  const type = point.name?.startsWith('Senior') ? 'seniors' : point.name?.startsWith('Persons') ? 'disability' : 'women';
                  handleDrilldown('inclusion', type);
                }}
              />
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
