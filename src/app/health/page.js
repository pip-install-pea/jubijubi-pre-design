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
import FilterTags from '../../components/FilterTag';
import { useChartFocus, patchFilters } from '../../hooks/useChartFocus';
import { NAVY, SKY } from '../../lib/chartTheme';
import { formatCount, formatINR } from '../../lib/format';
import { Users, MapPin, Baby, CalendarCheck, CurrencyInr, Stethoscope, House, Wheelchair } from '@phosphor-icons/react';

function settledData(result) {
  return result.status === 'fulfilled' ? result.value.data : null;
}

export default function HealthPage() {
  const [data, setData] = useState({
    reach: null,
    depth: null,
    inclusion: null,
    benchmarks: null
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
      const [reach, depth, inclusion, benchmarks] = await Promise.allSettled([
        axios.get(`/api/health/reach?${query}`),
        axios.get(`/api/health/depth?${query}`),
        axios.get(`/api/health/inclusion?${query}`),
        axios.get(`/api/health/benchmarks?${query}`)
      ]);
      setData({
        reach: settledData(reach),
        depth: settledData(depth),
        inclusion: settledData(inclusion),
        benchmarks: settledData(benchmarks)
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
            <FilterTags note={envelopeNote} />
          </div>
        </div>
        <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('patients', 'Indirect beneficiaries')}>
          <div className="kpi-body">
            <Users size={22} weight="duotone" />
            <div className="kpi-value">{formatCount(indirect)}</div>
            <div className="kpi-label">Indirect beneficiaries (estimate)</div>
            <p className="kpi-caption">Direct × 5</p>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
            <FilterTags note={envelopeNote} />
          </div>
        </div>
        <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('villages', yearLabel)}>
          <div className="kpi-body">
            <House size={22} weight="duotone" />
            <div className="kpi-value">{formatCount(data.reach?.villages_reached)}</div>
            <div className="kpi-label">Villages reached</div>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
            <FilterTags note={envelopeNote} />
          </div>
        </div>
        <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('age', 'Adolescents (10–19)')}>
          <div className="kpi-body">
            <Baby size={22} weight="duotone" />
            <div className="kpi-value">{formatCount(data.reach?.adolescents_10_19)}</div>
            <div className="kpi-label">Adolescents (10–19)</div>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
            <FilterTags note={envelopeNote} />
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-body">
            <MapPin size={22} weight="duotone" />
            <div className="kpi-value">{formatCount(data.reach?.states_reached)}</div>
            <div className="kpi-label">States</div>
            <p className="kpi-caption">States in the health envelope for this calendar year.</p>
            <p className="kpi-caption">Calendar year {yearLabel}</p>
            <FilterTags note={envelopeNote} />
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
            <FilterTags note={doctorNote} />
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
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>
            {data.benchmarks?.grain === 'district' ? 'Districts vs state and programme averages' : 'States vs programme average'}
          </h3>
          <p className="kpi-caption">Calendar year {yearLabel}</p>
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
          <p className="kpi-caption">Calendar year {data.depth?.disease_mix_year || yearLabel}</p>
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
          <p className="kpi-caption">Calendar year {yearLabel}. Envelope split; it ignores state, district, and month.</p>
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
            <p className="kpi-caption">Calendar years {data.depth.disease_yoy[0]?.last_year_label} and {data.depth.disease_yoy[0]?.this_year_label}</p>
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
          <p className="kpi-caption">Calendar year {data.depth?.disease_mix_year || yearLabel}</p>
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
              <p className="kpi-caption">Calendar year {data.inclusion?.effective_year || yearLabel}</p>
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
              <p className="kpi-caption">Calendar year {data.inclusion?.effective_year || yearLabel}</p>
            </div>
            <div className="card-body">
              <div className="stat-row" style={{ cursor: 'pointer' }} onClick={() => handleDrilldown('inclusion', 'seniors')}>
                <span className="stat-label"><Users size={18} weight="duotone" /> Senior citizens (60+)</span>
                <span className="stat-value">{formatCount(data.inclusion?.senior_citizens)}</span>
              </div>
              <div className="stat-row" style={{ cursor: 'pointer' }} onClick={() => handleDrilldown('inclusion', 'disability')}>
                <span className="stat-label"><Wheelchair size={18} weight="duotone" /> Persons with disability</span>
                <span className="stat-value">{formatCount(data.inclusion?.people_with_disability)}</span>
              </div>
              <div className="stat-row" style={{ cursor: 'pointer' }} onClick={() => handleDrilldown('inclusion', 'women')}>
                <span className="stat-label"><Users size={18} weight="duotone" /> Women</span>
                <span className="stat-value">{formatCount(data.inclusion?.women_count)}</span>
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
