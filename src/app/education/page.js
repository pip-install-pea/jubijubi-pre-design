'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import RankingBar from '../../components/charts/RankingBar';
import GroupedBar from '../../components/charts/GroupedBar';
import DrilldownModal from '../../components/DrilldownModal';
import { LIME, NAVY, SKY } from '../../lib/chartTheme';

export default function EducationPage() {
  const [data, setData] = useState({
    activities: [],
    schools: [],
    prePost: { data: [] },
    muskaan: { data: [] },
    mix: { data: [] }
  });
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ isOpen: false, title: '', apiUrl: '', params: {} });

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
      const [activities, schools, prePost, muskaan] = await Promise.all([
        axios.get(`/api/education/activities?${query}`),
        axios.get(`/api/education/schools_comparison?${query}`),
        axios.get(`/api/education/pre_post_values?${query}`),
        axios.get(`/api/education/muskaan_performance?${query}`)
      ]);
      let mix = { data: { status: 'no_data', data: [] } };
      try {
        mix = await axios.get(`/api/education/mixprogram?${query}`);
      } catch (e) {
        mix = { data: { status: 'no_data', data: [] } };
      }
      setData({
        activities: activities.data,
        schools: schools.data,
        prePost: prePost.data,
        muskaan: muskaan.data,
        mix: mix.data
      });
    } catch (err) {
      console.error('Education data load failed');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleDrilldown = (type, label, extraParams = {}) => {
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
  const totalStudents = programItems.reduce((s, r) => s + r.value, 0);

  return (
    <div>
      <div className="section-header">
        <h2 className="card-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>Education Programme</h2>
        <p className="section-sub">Students by trimmed programme name. Activity type is not in the live schema.</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-body">
            <div className="kpi-value">{totalStudents.toLocaleString('en-IN')}</div>
            <div className="kpi-label">Students (SUM student_count)</div>
            <p className="kpi-caption">TRIM(program_name). Not grouped by activity type.</p>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-body">
            <div className="kpi-value">{(data.activities || []).length}</div>
            <div className="kpi-label">Programme × year rows</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Students by programme · trimmed program_name</h3>
        </div>
        <div className="card-body">
          <RankingBar
            items={programItems}
            color={LIME}
            caption="Trailing spaces in KKP vs KKP are trimmed at sync."
            onBarClick={(label) => handleDrilldown('activity', label)}
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Schools and students by academic year</h3>
        </div>
        <div className="card-body">
          <GroupedBar
            labels={(data.schools || []).map(r => `${r.academic_year} / ${r.program}`)}
            datasets={[
              { label: 'Schools', data: (data.schools || []).map(r => r.school_count), color: SKY },
              { label: 'Students', data: (data.schools || []).map(r => r.total_students), color: NAVY }
            ]}
            caption="Academic year is derived from created_at when the API does not send one."
            onBarClick={(label, idx) => {
              const r = data.schools[idx];
              if (r) handleDrilldown('school', label, { academic_year: r.academic_year, program_name: r.program });
            }}
          />
        </div>
      </div>

      {data.mix?.status === 'ok' && data.mix.data?.length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Mixprogramme schools</h3>
          </div>
          <div className="card-body">
            <RankingBar
              items={data.mix.data.map(r => ({ label: r.school_name, value: r.students_total }))}
              color={NAVY}
              caption="Optional mixprogram.php rows. theme_touched is unrelated text, not an activity type."
            />
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Values assessment — pre vs post</h3>
        </div>
        <div className="card-body">
          {data.prePost?.status === 'no_data' || !data.prePost?.data?.length ? (
            <div className="empty-state">
              <strong>Assessment data not yet available</strong>
              <p className="chart-caption">{data.prePost?.message || 'education_assessment is not in the live extract.'}</p>
            </div>
          ) : (
            <GroupedBar
              labels={data.prePost.data.map(r => r.value)}
              datasets={[
                { label: 'Pre score', data: data.prePost.data.map(r => r.avg_pre), color: SKY },
                { label: 'Post score', data: data.prePost.data.map(r => r.avg_post), color: NAVY }
              ]}
            />
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Muskaan — skill level outcomes</h3>
        </div>
        <div className="card-body">
          {data.muskaan?.status === 'no_data' || !data.muskaan?.data?.length ? (
            <div className="empty-state">
              <strong>Muskaan assessment data not yet available</strong>
              <p className="chart-caption">{data.muskaan?.message || 'education_muskaan_assessment is not in the live extract.'}</p>
            </div>
          ) : (
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
          )}
        </div>
      </div>

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
