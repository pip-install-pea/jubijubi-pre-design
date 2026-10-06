'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import GroupedBar from '../../components/charts/GroupedBar';
import QuadrantScatter from '../../components/charts/QuadrantScatter';
import EChart, {
  treemapOption,
  stackedBarOption,
  groupedBarOption,
  roseOption
} from '../../components/charts/EChart';
import BrandDoughnut from '../../components/charts/BrandDoughnut';
import DrilldownModal from '../../components/DrilldownModal';
import FilterTags from '../../components/FilterTag';
import YearStrip from '../../components/YearStrip';
import ChartFocusBar from '../../components/ChartFocusBar';
import PageRail from '../../components/PageRail';
import { useChartFocus, patchFilters } from '../../hooks/useChartFocus';
import { financialYearList } from '../../lib/phpRegistry.js';
import { NAVY, SKY } from '../../lib/chartTheme';
import { GraduationCap, Sun } from '@phosphor-icons/react';

const STATE_COLORS = {
  Rajasthan: '#f97316',
  Gujarat: '#2563eb',
  'Uttar Pradesh': '#16a34a',
  Karnataka: '#dc2626',
  Maharashtra: '#7c3aed'
};
const MONTH_COLORS = ['#1d4ed8', '#0284c7', '#0d9488', '#16a34a', '#65a30d', '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#9333ea', '#4f46e5', '#475569'];

export default function EducationPage() {
  const [data, setData] = useState({
    activities: [],
    prePost: { data: [] },
    muskaan: { data: [] },
    mix: { data: [] },
    quadrant: null
  });
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, title: '', apiUrl: '', params: {} });
  const [kkpLocation, setKkpLocation] = useState('');
  const [opsPlace, setOpsPlace] = useState('');
  const [pickedInitiative, setPickedInitiative] = useState('');
  const [pickedState, setPickedState] = useState('');
  const [pickedPlace, setPickedPlace] = useState('');
  const [genderState, setGenderState] = useState('');
  const { focus, select, remove, clear } = useChartFocus();

  useEffect(() => {
    const handleApply = (e) => setFilters(e.detail || {});
    window.addEventListener('app:filters:apply', handleApply);
    return () => window.removeEventListener('app:filters:apply', handleApply);
  }, []);

  const fetchAllData = React.useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ''))
    ).toString();
    try {
      const [activities, prePost, muskaan, quadrant] = await Promise.all([
        axios.get(`/api/education/activities?${query}`),
        axios.get(`/api/education/pre_post_values?${query}`),
        axios.get(`/api/education/muskaan_performance?${query}`),
        axios.get(`/api/education/quadrant?${query}`)
      ]);
      let mix = { data: { status: 'no_data', data: [] } };
      try {
        mix = await axios.get(`/api/education/mixprogram?${query}`);
      } catch (e) {
        mix = { data: { status: 'no_data', data: [] } };
      }
      setData({
        activities: activities.data,
        prePost: prePost.data,
        muskaan: muskaan.data,
        mix: mix.data,
        quadrant: quadrant.data
      });
      setKkpLocation('');
      setOpsPlace('');
      setPickedInitiative('');
      setPickedState('');
      setPickedPlace('');
      setGenderState('');
    } catch (err) {
      console.error('Education data load failed');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleDrilldown = (type, label, extraParams = {}, event) => {
    if (type === 'mix_program') {
      select(label, event);
      if (event?.shiftKey || event?.metaKey) return;
    }
    setModal({
      isOpen: true,
      title: `${type.charAt(0).toUpperCase() + type.slice(1)}: ${label}`,
      apiUrl: '/api/education/drilldown',
      params: { ...filters, type, value: label, ...extraParams }
    });
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
      <div className="spinner"></div>
    </div>
  );

  const byProgram = {};
  (data.activities || []).forEach((r) => {
    if (!byProgram[r.program]) byProgram[r.program] = 0;
    byProgram[r.program] += r.students || 0;
  });
  const programItems = Object.entries(byProgram).map(([label, value]) => ({ label, value }));
  const rollupStudents = programItems.reduce((s, r) => s + r.value, 0);
  const mix = data.mix?.status === 'ok' ? data.mix : null;
  const mixSchool = mix?.school;
  const mixKpis = mixSchool?.kpis || {};
  const mixByProgram = mixSchool?.by_program || [];
  const mixCaste = mixSchool?.caste || [];
  const mixKkp = mix?.kkp;
  const mixThemes = mix?.kkp2?.themes || [];
  const mixActivities = mix?.muskaan_activity?.activities || [];
  const mixMonths = mix?.muskaan_activity?.months || [];
  const mixFellows = mix?.fellowship;
  const useSchoolSheets = Number(mixKpis.schools) > 0 || mixByProgram.length > 0;
  const kkpLocations = data.prePost?.by_location || [];
  const kkpPicked = kkpLocations.find((row) => row.location === kkpLocation) || null;
  const kkpRows = kkpPicked
    ? kkpPicked.rows
    : (data.prePost?.status !== 'no_data' ? (data.prePost?.data || []) : []);
  const showQuadrant = Array.isArray(data.quadrant?.points) && data.quadrant.points.length > 0;
  const showMuskaan = data.muskaan?.status !== 'no_data' && data.muskaan?.data?.length > 0;

  return (
    <div>
      <PageRail>
        <YearStrip
          label="Academic year"
          years={financialYearList(6)}
          value={filters.academic_year || filters.financial_year}
          onChange={(fy) => patchFilters({ academic_year: fy, financial_year: fy })}
        />
        <ChartFocusBar
          focus={focus}
          onClear={clear}
          onRemove={remove}
          hint="Shift-click a second programme to compare"
        />
      </PageRail>
      <div className="kpi-grid">
        {useSchoolSheets ? (
          <>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{Number(mixKpis.students || 0).toLocaleString('en-IN')}</div>
                <div className="kpi-label">Students</div>
                <p className="kpi-caption">Max headcount per school, then summed</p>
                <FilterTags monthIgnored={Boolean(filters.month)} />
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{Number(mixKpis.schools || 0).toLocaleString('en-IN')}</div>
                <div className="kpi-label">Schools</div>
              </div>
            </div>
            {mixKpis.girls_pct != null && (
              <div className="kpi-card">
                <div className="kpi-body">
                  <div className="kpi-value">{mixKpis.girls_pct}%</div>
                  <div className="kpi-label">Girls share</div>
                </div>
              </div>
            )}
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('mix_programs', 'Total programs')}>
              <div className="kpi-body">
                <div className="kpi-value">{(mix?.programs || []).length}</div>
                <div className="kpi-label">Total programs</div>
                <p className="kpi-caption">Programmes in the initiative list that have rows under these filters</p>
              </div>
            </div>
            <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('mix_activities', 'Activities covered')}>
              <div className="kpi-body">
                <div className="kpi-value">{Number(mix?.muskaan_activity?.rows || 0).toLocaleString('en-IN')}</div>
                <div className="kpi-label">Activities covered</div>
                <p className="kpi-caption">Muskaan activity rows</p>
              </div>
            </div>
            {Number(mixKpis.teachers) > 0 && (
              <div className="kpi-card">
                <div className="kpi-body">
                <div className="kpi-value">{Number(mixKpis.teachers).toLocaleString('en-IN')}</div>
                <div className="kpi-label">Teachers covered</div>
                <p className="kpi-caption">Schools Working, Khusiyon ki Pathshala, Edulab, and HP CLAP. Library on Wheels is excluded because its teachers field holds student counts.</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{rollupStudents.toLocaleString('en-IN')}</div>
                <div className="kpi-label">Programme rollup</div>
                <p className="kpi-caption">education_program student_count. School sheets are empty for this filter.</p>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{programItems.length}</div>
                <div className="kpi-label">Programmes</div>
              </div>
            </div>
          </>
        )}
        {kkpRows.length > 0 && (
          <div className="kpi-card">
            <div className="kpi-body">
              <div className="kpi-value">{kkpRows.length}</div>
              <div className="kpi-label">KKP values</div>
              <p className="kpi-caption">Location-level skilltracking scores</p>
            </div>
          </div>
        )}
        {mixKkp?.total_sessions > 0 && (
          <div className="kpi-card">
            <div className="kpi-body">
              <div className="kpi-value">{Number(mixKkp.total_sessions).toLocaleString('en-IN')}</div>
              <div className="kpi-label">KKP sessions</div>
            </div>
          </div>
        )}
      </div>

      {mix?.network && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Our School Network</h3>
          </div>
          <div className="card-body">
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-body">
                  <div className="kpi-value">{mix.network.locations}</div>
                  <div className="kpi-label">School Locations</div>
                  <p className="kpi-caption">{(mix.network.location_names || []).join(', ') || 'None of the five network locations under these filters'}</p>
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-body">
                  <div className="kpi-value">{mix.network.states}</div>
                  <div className="kpi-label">States Covered</div>
                  <p className="kpi-caption">{(mix.network.state_names || []).join(', ') || 'None under these filters'}</p>
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-body">
                  <GraduationCap size={28} weight="duotone" />
                  <div className="kpi-label">Education – Focus Sector</div>
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-body">
                  <Sun size={28} weight="duotone" />
                  <div className="kpi-label">Brighter Futures – Our Commitment</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {mix && (
        <>
          {(mix.operational_schools || []).length > 0 && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Operational Schools</h3>
                <p className="kpi-caption">Distinct Schools Working schools by location.</p>
                <FilterTags monthIgnored={Boolean(filters.month)} />
              </div>
              <div className="card-body">
                <div className="card-row">
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-body">
                      <BrandDoughnut
                        title="Operational Schools"
                        percent
                        labels={(mix.operational_schools || []).map((row) => row.label)}
                        values={(mix.operational_schools || []).map((row) => row.value)}
                        colors={(mix.operational_schools || []).map((row) => STATE_COLORS[
                          (mix.states || []).find((state) => (state.places || []).some((place) => place.place === row.label))?.state
                        ] || '#1e3a8a')}
                        onSliceClick={(label) => setOpsPlace((current) => (current === label ? '' : label))}
                      />
                    </div>
                  </div>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-body">
                      <BrandDoughnut
                        title={opsPlace ? `Category · ${opsPlace}` : 'Category'}
                        percent
                        labels={(opsPlace ? (mix.category_by_place?.[opsPlace] || []) : ['Gen', 'OBC', 'SC/ST', 'EBC'].map((label) => ({
                          label,
                          value: Object.values(mix.category_by_place || {}).reduce((sum, items) => sum + ((items || []).find((item) => item.label === label)?.value || 0), 0)
                        })).filter((item) => item.value > 0)).map((row) => row.label)}
                        values={(opsPlace ? (mix.category_by_place?.[opsPlace] || []) : ['Gen', 'OBC', 'SC/ST', 'EBC'].map((label) => ({
                          label,
                          value: Object.values(mix.category_by_place || {}).reduce((sum, items) => sum + ((items || []).find((item) => item.label === label)?.value || 0), 0)
                        })).filter((item) => item.value > 0)).map((row) => row.value)}
                        onSliceClick={(label) => handleDrilldown('mix_caste', label === 'Gen' ? 'General' : label)}
                      />
                      {((mix.category_by_place?.Bharuch || []).length === 1 && mix.category_by_place.Bharuch[0]?.label === 'Gen') && (
                        <p className="chart-caption">Bharuch students are all recorded as General.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(mix.initiatives || []).length > 0 && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Initiatives</h3>
                <p className="kpi-caption">Muskaan Activity counts are participations. A month filter changes Khusiyon ki Pathshala 2.0 and Muskaan Activity only.</p>
              </div>
              <div className="card-body">
                <EChart
                  option={groupedBarOption(
                    mix.initiatives.map((row) => row.name),
                    [{ label: 'Students', data: mix.initiatives.map((row) => row.students) }],
                    { horizontal: true, showLabels: true, legend: false }
                  )}
                  height={Math.max(220, mix.initiatives.length * 72)}
                  onPoint={(point) => point.name && setPickedInitiative((current) => (current === point.name ? '' : point.name))}
                />
                {pickedInitiative && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>{pickedInitiative}</h3>
                    <EChart
                      option={groupedBarOption(
                        (mix.initiatives.find((row) => row.name === pickedInitiative)?.programs || []).map((row) => row.participations ? `${row.name} (participations)` : row.name),
                        [{ label: 'Students', data: (mix.initiatives.find((row) => row.name === pickedInitiative)?.programs || []).map((row) => row.students) }],
                        { horizontal: true, showLabels: true, withPercent: true, legend: false }
                      )}
                      height={Math.max(180, ((mix.initiatives.find((row) => row.name === pickedInitiative)?.programs || []).length) * 48)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {(mixKpis.schools > 0 || mixByProgram.length > 0) && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>School programmes</h3>
              </div>
              <div className="card-body">
                <div className="card-row">
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>Program wise students</h3></div>
                    <div className="card-body">
                      <EChart
                        option={treemapOption(mixByProgram.map((r) => ({ label: r.label, value: r.students })), { name: 'Students' })}
                        focus={focus}
                        onPoint={(p) => p.name && handleDrilldown('mix_program', p.name, {}, p.nativeEvent)}
                      />
                    </div>
                  </div>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>Gender Ratio program wise</h3></div>
                    <div className="card-body">
                      <EChart
                        option={stackedBarOption(
                          mixByProgram.map((r) => r.label),
                          [
                            { label: 'Male', data: mixByProgram.map((r) => r.male) },
                            { label: 'Female', data: mixByProgram.map((r) => r.female) }
                          ],
                          { rotateLabels: true, pctLabels: true }
                        )}
                        focus={focus}
                        onPoint={(p) => p.name && handleDrilldown('mix_program', p.name, {}, p.nativeEvent)}
                      />
                    </div>
                  </div>
                </div>
                {(mix.states || []).length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Statewise programs</h3>
                    <FilterTags monthIgnored={Boolean(filters.month)} />
                    <p className="chart-caption">
                      {pickedPlace
                        ? `${pickedState} · ${pickedPlace}`
                        : pickedState
                          ? pickedState
                          : 'Choose a state, then a location.'}
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '8px 0 12px' }}>
                      {(pickedState || pickedPlace) && (
                        <button type="button" className="filter-tag" onClick={() => { setPickedState(''); setPickedPlace(''); }}>All states</button>
                      )}
                      {pickedState && (
                        <button type="button" className="filter-tag" onClick={() => setPickedPlace('')}>{pickedState}</button>
                      )}
                    </div>
                    {!pickedState && (
                      <div className="kpi-grid">
                        {mix.states.map((row) => (
                          <button
                            key={row.state}
                            type="button"
                            className="kpi-card"
                            onClick={() => setPickedState(row.state)}
                            style={{ textAlign: 'left', borderTop: `4px solid ${STATE_COLORS[row.state] || '#1e3a8a'}` }}
                          >
                            <div className="kpi-body">
                              <div className="kpi-label">{row.state}</div>
                              <div className="kpi-value">{Number(row.students || 0).toLocaleString('en-IN')}</div>
                              <p className="kpi-caption">{Number(row.schools || 0).toLocaleString('en-IN')} schools</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {pickedState && !pickedPlace && (
                      <div className="kpi-grid">
                        {(mix.states.find((row) => row.state === pickedState)?.places || []).map((place) => (
                          <button key={place.place} type="button" className="kpi-card" onClick={() => setPickedPlace(place.place)} style={{ textAlign: 'left' }}>
                            <div className="kpi-body">
                              <div className="kpi-label">{place.place}</div>
                              <p className="kpi-caption">{place.programs.length} programmes</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {pickedPlace && (
                      <EChart
                        option={groupedBarOption(
                          (mix.states.find((row) => row.state === pickedState)?.places || []).find((place) => place.place === pickedPlace)?.programs.map((row) => row.name) || [],
                          [{
                            label: 'Students',
                            data: ((mix.states.find((row) => row.state === pickedState)?.places || []).find((place) => place.place === pickedPlace)?.programs || []).map((row) => row.students)
                          }],
                          { horizontal: true, showLabels: true, legend: false }
                        )}
                        height={280}
                        onPoint={(point) => point.name && handleDrilldown('mix_program', point.name)}
                      />
                    )}
                  </div>
                )}
                {(mix.states || []).length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Location wise Program</h3>
                    <p className="chart-caption">Students by state. Click a bar for male, female, and gender not split.</p>
                    <FilterTags monthIgnored={Boolean(filters.month)} />
                    <EChart
                      option={groupedBarOption(
                        mix.states.map((row) => row.state),
                        [{ label: 'Students', data: mix.states.map((row) => row.students) }],
                        {
                          horizontal: true,
                          showLabels: true,
                          withPercent: true,
                          legend: false,
                          colors: mix.states.map((row) => STATE_COLORS[row.state] || '#1e3a8a')
                        }
                      )}
                      height={Math.max(220, mix.states.length * 56)}
                      onPoint={(point) => point.name && setGenderState(point.name)}
                    />
                    {genderState && (
                      <div style={{ marginTop: '12px' }}>
                        <h4 className="chart-inline-title">{genderState}</h4>
                        {(() => {
                          const row = mix.states.find((item) => item.state === genderState);
                          if (!row) return null;
                          const slices = [
                            { label: 'Male', value: row.male },
                            { label: 'Female', value: row.female },
                            ...(row.not_split > 0 ? [{ label: 'Gender not split', value: row.not_split }] : [])
                          ];
                          return (
                            <BrandDoughnut
                              percent
                              labels={slices.map((item) => item.label)}
                              values={slices.map((item) => item.value)}
                            />
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
                {(mixSchool?.location_pies || []).length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Programme by location</h3>
                    <div className="program-loc-grid">
                      {mixSchool.location_pies.map((block) => (
                        <div key={block.program} className="program-loc-card">
                          <h4 className="chart-inline-title">{block.program}</h4>
                          <BrandDoughnut
                            percent
                            labels={(block.rows || []).map((row) => row.label)}
                            values={(block.rows || []).map((row) => row.value)}
                            onSliceClick={(label) => handleDrilldown('mix_heat', block.program, { location: label })}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {mixCaste.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Category</h3>
                    <EChart
                      option={roseOption(mixCaste)}
                      onPoint={(p) => p.name && handleDrilldown('mix_caste', p.name)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {mixThemes.length > 0 && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>KKP 2.0 themes</h3>
              </div>
              <div className="card-body">
                <EChart
                  option={treemapOption(mixThemes)}
                  onPoint={(p) => p.name && handleDrilldown('mix_theme', p.name)}
                />
              </div>
            </div>
          )}

          {mixActivities.length > 0 && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Muskaan activities</h3>
              </div>
              <div className="card-body">
                <EChart
                  option={treemapOption(mixActivities)}
                  onPoint={(p) => p.name && handleDrilldown('mix_activity', p.name)}
                />
                {mixMonths.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: 'bold' }}>Total students: {Number(mix?.muskaan_activity?.students || 0).toLocaleString('en-IN')}</h3>
                      <p className="kpi-caption">Male {Number(mix?.muskaan_activity?.male || 0).toLocaleString('en-IN')} | Female {Number(mix?.muskaan_activity?.female || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <p className="chart-caption">Activity participations</p>
                    <EChart
                      option={groupedBarOption(
                        mixMonths.map((row) => row.label),
                        [{ label: 'Participations', data: mixMonths.map((row) => row.value) }],
                        { showLabels: true, withPercent: true, legend: false, colors: mixMonths.map((_, index) => MONTH_COLORS[index % MONTH_COLORS.length]) }
                      )}
                      onPoint={(point) => {
                        if (!point.name) return;
                        const row = mixMonths.find((item) => item.label === point.name);
                        handleDrilldown('mix_month', point.name, {
                          month: row?.month,
                          year: row?.year
                        });
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {mixFellows?.fellows > 0 && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Muskaan fellowship</h3>
              </div>
              <div className="card-body">
                <div className="kpi-grid">
                  <div className="kpi-card kpi-card--clickable" onClick={() => handleDrilldown('mix_fellow', '')}>
                    <div className="kpi-body">
                      <div className="kpi-value">{mixFellows.fellows}</div>
                      <div className="kpi-label">Fellows</div>
                    </div>
                  </div>
                </div>
                <EChart
                  option={roseOption(mixFellows.gender || [])}
                  onPoint={(p) => p.name && handleDrilldown('mix_fellow', p.name)}
                />
              </div>
            </div>
          )}
        </>
      )}

      {(kkpRows.length > 0 || data.prePost?.status === 'no_data') && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>
              {data.prePost?.source === 'skilltracking_kkp_pre_and_post'
                ? 'KKP pre/post by value'
                : 'Values assessment — pre vs post'}
            </h3>
          </div>
          <div className="card-body">
            {data.prePost?.status === 'no_data' && (
              <p className="chart-caption">{data.prePost.message}</p>
            )}
            {data.prePost?.source === 'skilltracking_kkp_pre_and_post' && kkpRows.length > 0 && (
              <>
                <p className="chart-caption">
                  {kkpPicked
                    ? `Scores for ${kkpPicked.location}.`
                    : 'All is the average of every location.'}
                </p>
                {kkpLocations.length > 1 && (
                  <div style={{ marginBottom: 12 }}>
                    <YearStrip
                      label="Location"
                      years={['All', ...kkpLocations.map((row) => row.location)]}
                      value={kkpPicked ? kkpPicked.location : 'All'}
                      onChange={(name) => setKkpLocation(name === 'All' ? '' : name)}
                    />
                  </div>
                )}
              </>
            )}
            {kkpRows.length > 0 && (
              <GroupedBar
                labels={kkpRows.map(r => r.value)}
                datasets={[
                  { label: 'Pre score', data: kkpRows.map(r => r.avg_pre), color: SKY },
                  { label: 'Post score', data: kkpRows.map(r => r.avg_post), color: NAVY }
                ]}
                onBarClick={(label) => handleDrilldown(
                  data.prePost?.source === 'skilltracking_kkp_pre_and_post' ? 'kkp' : 'assessment',
                  label,
                  kkpPicked ? { location_name: kkpPicked.location } : {}
                )}
              />
            )}
          </div>
        </div>
      )}

      {showQuadrant && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>School quadrant — reach vs learning gain</h3>
          </div>
          <div className="card-body">
            <QuadrantScatter
              payload={data.quadrant}
              caption="School-level pre/post scores. KKP location averages cannot place schools here."
              onPointClick={(point) => handleDrilldown('quadrant', point.label || point.key)}
            />
          </div>
        </div>
      )}

      {showMuskaan && (
        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Muskaan — skill level outcomes</h3>
          </div>
          <div className="card-body">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Skill Area</th>
                    <th>Pre Level</th>
                    <th>Post Level</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.muskaan.data.map((r, i) => (
                    <tr key={i} style={{ cursor: 'pointer' }} onClick={() => handleDrilldown('muskaan', r.skill_area)}>
                      <td>{r.skill_area}</td>
                      <td>{r.pre_level}</td>
                      <td>{r.post_level}</td>
                      <td>{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
