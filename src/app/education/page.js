'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import DrilldownModal from '../../components/DrilldownModal';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const PALETTE = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'];

export default function EducationPage() {
  const [data, setData] = useState({
    activities: [],
    schools: [],
    prePost: { data: [] },
    muskaan: { data: [] }
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
    const query = new URLSearchParams(filters).toString();
    try {
      const [activities, schools, prePost, muskaan] = await Promise.all([
        axios.get(`/api/education/activities?${query}`),
        axios.get(`/api/education/schools_comparison?${query}`),
        axios.get(`/api/education/pre_post_values?${query}`),
        axios.get(`/api/education/muskaan_performance?${query}`)
      ]);
      setData({
        activities: activities.data,
        schools: schools.data,
        prePost: prePost.data,
        muskaan: muskaan.data
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
      {/* <span style={{ marginLeft: '12px', color: '#64748b', fontWeight: 500 }}>Synchronizing Education Data...</span> */}
    </div>
  );

  // Process activities data for chart
  const activityYearMap = {};
  data.activities.forEach(r => {
    if (!activityYearMap[r.academic_year]) activityYearMap[r.academic_year] = { sessions: 0, students: 0 };
    activityYearMap[r.academic_year].sessions += r.sessions;
    activityYearMap[r.academic_year].students += r.students;
  });
  const activityYears = Object.keys(activityYearMap).sort();

  // Process schools comparison data
  const schoolLabels = data.schools.map(r => `${r.academic_year} / ${r.program}`);

  return (
    <div>
      {/* Header */}
      <div className="section-header">
        <h2 className="card-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>Education Programme</h2>
        <p className="section-sub">Activities, values assessment & Muskaan skill outcomes</p>
      </div>

      {/* Activities Chart */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Programme Sessions & Students by Year</h3>
        </div>
        <div className="card-body">
          <div className="h-[300px]">
            <Bar
              data={{
                labels: activityYears,
                datasets: [
                  { label: 'Sessions', data: activityYears.map(y => activityYearMap[y].sessions), backgroundColor: PALETTE[0] },
                  { label: 'Students', data: activityYears.map(y => activityYearMap[y].students), backgroundColor: PALETTE[2] }
                ]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                onClick: (e, els) => {
                  if (els.length > 0) {
                    handleDrilldown('activity', activityYears[els[0].index]);
                  }
                },
                plugins: { legend: { position: 'bottom' } }
              }}
            />
          </div>
        </div>
      </div>

      {/* Schools Comparison Chart */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Schools & Students by Academic Year</h3>
        </div>
        <div className="card-body">
          <div className="h-[300px]">
            <Bar
              data={{
                labels: schoolLabels,
                datasets: [
                  { label: 'Schools', data: data.schools.map(r => r.school_count), backgroundColor: PALETTE[1] },
                  { label: 'Students', data: data.schools.map(r => r.total_students), backgroundColor: PALETTE[3] }
                ]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                onClick: (e, els) => {
                  if (els.length > 0) {
                    const r = data.schools[els[0].index];
                    handleDrilldown('school', schoolLabels[els[0].index], { academic_year: r.academic_year, program_name: r.program });
                  }
                },
                plugins: { legend: { position: 'bottom' } }
              }}
            />
          </div>
        </div>
      </div>

      {/* Values Assessment */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Values Assessment — Pre vs Post Scores</h3>
        </div>
        <div className="card-body">
          {data.prePost.data.length === 0 ? (
            <div className="empty-state">
              <strong>Assessment data not yet available</strong>
            </div>
          ) : (
            <div className="h-[280px]">
              <Bar
                data={{
                  labels: data.prePost.data.map(r => r.value),
                  datasets: [
                    { label: 'Pre Score', data: data.prePost.data.map(r => r.avg_pre), backgroundColor: PALETTE[4] },
                    { label: 'Post Score', data: data.prePost.data.map(r => r.avg_post), backgroundColor: PALETTE[2] }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: (e, els) => {
                    if (els.length > 0) {
                      handleDrilldown('assessment', data.prePost.data[els[0].index].value);
                    }
                  },
                  plugins: { legend: { position: 'bottom' } }
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Muskaan Performance */}
      <div className="card">
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Muskaan — Skill Level Outcomes</h3>
        </div>
        <div className="card-body">
          {data.muskaan.data.length === 0 ? (
            <div className="empty-state">
              <strong>Muskaan assessment data not yet available</strong>
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
                    <tr
                      key={i}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleDrilldown('muskaan', r.skill_area)}
                    >
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
