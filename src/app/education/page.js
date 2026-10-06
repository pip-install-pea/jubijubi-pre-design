'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import GroupedBar from '../../components/charts/GroupedBar';
import QuadrantScatter from '../../components/charts/QuadrantScatter';
import EChart, {
  treemapOption,
  stackedBarOption,
  groupedBarOption,
  sunburstOption,
  roseOption
} from '../../components/charts/EChart';
import DrilldownModal from '../../components/DrilldownModal';
import YearStrip from '../../components/YearStrip';
import ChartFocusBar from '../../components/ChartFocusBar';
import PageRail from '../../components/PageRail';
import { useChartFocus, patchFilters } from '../../hooks/useChartFocus';
import { financialYearList } from '../../lib/phpRegistry.js';
import { NAVY, SKY } from '../../lib/chartTheme';
import IndiaMap from '../../components/charts/IndiaMap';
import { pinsFor } from '../../lib/geo/locations';

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
  const mixProgramLocs = mixSchool?.program_locations || [];
  const mixSunburst = mixSchool?.sunburst || [];
  const useSchoolSheets = Number(mixKpis.schools) > 0 || mixByProgram.length > 0;
  const kkpLocations = data.prePost?.by_location || [];
  const kkpPicked = kkpLocations.find((row) => row.location === kkpLocation) || null;
  const kkpRows = kkpPicked
    ? kkpPicked.rows
    : (data.prePost?.status !== 'no_data' ? (data.prePost?.data || []) : []);
  const kkpDelta = kkpRows.length
    ? kkpRows.reduce((s, r) => s + (Number(r.avg_post) || 0) - (Number(r.avg_pre) || 0), 0) / kkpRows.length
    : null;
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
      <div className="card" style={{ width: '100%', marginBottom: '24px' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Our School Network</h3>
        </div>
        <div className="card-body">
          <IndiaMap
            pins={pinsFor('education')}
            highlightStates={['Rajasthan', 'Gujarat', 'Uttar Pradesh', 'Karnataka']}
            enableDrilldown
            caption="School and student counts by location are not on this view. Pins show place names only."
          />
        </div>
      </div>
      <div className="kpi-grid">
        {useSchoolSheets ? (
          <>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{Number(mixKpis.students || 0).toLocaleString('en-IN')}</div>
                <div className="kpi-label">Students</div>
                <p className="kpi-caption">Max headcount per school, then summed</p>
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
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{mixByProgram.length}</div>
                <div className="kpi-label">School programmes</div>
              </div>
            </div>
            {Number(mixKpis.teachers) > 0 && (
              <div className="kpi-card">
                <div className="kpi-body">
                  <div className="kpi-value">{Number(mixKpis.teachers).toLocaleString('en-IN')}</div>
                  <div className="kpi-label">Teachers reached</div>
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
        {kkpDelta != null && (
          <>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{kkpDelta > 0 ? '+' : ''}{kkpDelta.toFixed(1)}</div>
                <div className="kpi-label">Mean KKP gain</div>
                <p className="kpi-caption">Post − pre, location scores, not students</p>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-body">
                <div className="kpi-value">{kkpRows.length}</div>
                <div className="kpi-label">KKP values</div>
                <p className="kpi-caption">Location-level skilltracking scores</p>
              </div>
            </div>
          </>
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

      {mix && (
        <>
          {(mixKpis.schools > 0 || mixByProgram.length > 0) && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>School programmes</h3>
              </div>
              <div className="card-body">
                <div className="card-row">
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>Students by programme</h3></div>
                    <div className="card-body">
                      <EChart
                        option={treemapOption(mixByProgram.map((r) => ({ label: r.label, value: r.students })), { name: 'Students' })}
                        focus={focus}
                        onPoint={(p) => p.name && handleDrilldown('mix_program', p.name, {}, p.nativeEvent)}
                      />
                    </div>
                  </div>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="card-header"><h3>Male and female by programme</h3></div>
                    <div className="card-body">
                      <EChart
                        option={stackedBarOption(
                          mixByProgram.map((r) => r.label),
                          [
                            { label: 'Male', data: mixByProgram.map((r) => r.male) },
                            { label: 'Female', data: mixByProgram.map((r) => r.female) }
                          ]
                        )}
                        focus={focus}
                        onPoint={(p) => p.name && handleDrilldown('mix_program', p.name, {}, p.nativeEvent)}
                      />
                    </div>
                  </div>
                </div>
                {mixSunburst.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Location to programme</h3>
                    <EChart
                      option={sunburstOption(mixSunburst)}
                      height={380}
                      focus={focus}
                      onPoint={(p) => {
                        if (!p.name) return;
                        const isProgram = mixByProgram.some((r) => r.label === p.name);
                        handleDrilldown(isProgram ? 'mix_program' : 'mix_location', p.name, {}, p.nativeEvent);
                      }}
                    />
                  </div>
                )}
                {mixProgramLocs.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Top locations in each programme</h3>
                    <div className="program-loc-grid">
                      {mixProgramLocs.map((block) => (
                        <div key={block.program} className="program-loc-card">
                          <h4 className="chart-inline-title">{block.program}</h4>
                          <EChart
                            option={groupedBarOption(
                              (block.rows || []).map((r) => r.label),
                              [{ label: 'Students', data: (block.rows || []).map((r) => r.value) }],
                              { horizontal: true }
                            )}
                            height={Math.max(200, (block.rows || []).length * 32)}
                            onPoint={(p) => {
                              if (!p.name) return;
                              handleDrilldown('mix_heat', block.program, { location: p.name });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {mixCaste.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Caste categories</h3>
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
                    <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>By month</h3>
                    <EChart
                      option={groupedBarOption(
                        mixMonths.map((r) => r.label),
                        [{ label: 'Students', data: mixMonths.map((r) => r.value) }]
                      )}
                      onPoint={(p) => {
                        if (!p.name) return;
                        const row = mixMonths.find((r) => r.label === p.name);
                        handleDrilldown('mix_month', p.name, {
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
