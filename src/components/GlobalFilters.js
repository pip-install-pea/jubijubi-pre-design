'use client';

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { usePathname } from 'next/navigation';
import { Printer } from '@phosphor-icons/react';

function moduleFromPath(pathname) {
  if (pathname?.startsWith('/health')) return 'health';
  if (pathname?.startsWith('/livelihood')) return 'livelihood';
  if (pathname?.startsWith('/education')) return 'education';
  return 'overview';
}

const CLOCK_HINT = {
  health: 'Health uses calendar year on patient created_at. Year-envelope stickers are not location-filterable.',
  livelihood: 'Livelihood uses its own geography (Gajraula ≠ Gautam Budh Nagar). Monitor dates and FY strings are different clocks.',
  education: 'Education uses academic year (derived from created_at). Location IDs may not match health or livelihood.',
  overview: 'Overview does not apply location IDs across programmes — health and livelihood geographies are not shared.'
};

export default function GlobalFilters({ onApply }) {
  const pathname = usePathname();
  const moduleName = moduleFromPath(pathname);
  const isEnterprise = pathname?.startsWith('/livelihood/enterprise');
  const showLocation = moduleName === 'health' || moduleName === 'livelihood' || moduleName === 'education';
  const showCalendar = moduleName === 'health' || moduleName === 'livelihood' || moduleName === 'overview';
  const showAcademic = moduleName === 'education';
  const showGender = moduleName === 'health';
  const showFy = isEnterprise;

  const [locations, setLocations] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [filters, setFilters] = useState({
    state_id: '',
    district_id: '',
    year: new Date().getFullYear().toString(),
    quarter: '',
    academic_year: '',
    financial_year: '',
    gender: ''
  });

  const activeStateIdRef = useRef('');

  const fetchLocations = React.useCallback(async (mod) => {
    if (mod === 'overview') {
      setLocations([]);
      return;
    }
    try {
      const response = await axios.get(`/api/locations?module=${mod}`);
      setLocations(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Failed to fetch locations');
      setLocations([]);
    }
  }, []);

  const fetchDistricts = React.useCallback(async (stateId, mod) => {
    activeStateIdRef.current = stateId;
    try {
      const response = await axios.get(`/api/locations?module=${mod}&state_id=${stateId}`);
      if (activeStateIdRef.current === stateId) {
        setDistricts(Array.isArray(response.data) ? response.data : []);
      }
    } catch (error) {
      if (activeStateIdRef.current === stateId) {
        console.error('Failed to fetch districts');
        setDistricts([]);
      }
    }
  }, []);

  useEffect(() => {
    activeStateIdRef.current = '';
    setDistricts([]);
    setLocations([]);
    const next = {
      state_id: '',
      district_id: '',
      year: new Date().getFullYear().toString(),
      quarter: '',
      academic_year: '',
      financial_year: '',
      gender: ''
    };
    setFilters(next);
    fetchLocations(moduleName);
    onApply({ ...next, geo_module: moduleName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleName]);

  const payload = () => ({ ...filters, geo_module: moduleName });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => {
      const nextFilters = { ...prev, [name]: value };
      if (name === 'state_id') {
        nextFilters.district_id = '';
        if (value) {
          fetchDistricts(value, moduleName);
        } else {
          activeStateIdRef.current = '';
          setDistricts([]);
        }
      }
      return nextFilters;
    });
  };

  const handleReset = () => {
    const defaultFilters = {
      state_id: '',
      district_id: '',
      year: new Date().getFullYear().toString(),
      quarter: '',
      academic_year: '',
      financial_year: '',
      gender: ''
    };
    activeStateIdRef.current = '';
    setFilters(defaultFilters);
    setDistricts([]);
    onApply({ ...defaultFilters, geo_module: moduleName });
  };

  const years = [];
  for (let y = new Date().getFullYear(); y >= 2020; y--) {
    years.push(y);
  }

  return (
    <div className="filter-bar">
      <div className="filter-controls">
        {showLocation && (
          <>
            <select name="state_id" value={filters.state_id} onChange={handleChange}>
              <option value="">All States</option>
              {locations.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <select
              name="district_id"
              value={filters.district_id}
              onChange={handleChange}
              disabled={!filters.state_id}
            >
              <option value="">All Districts</option>
              {districts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </>
        )}

        {showCalendar && (
          <>
            <select name="year" value={filters.year} onChange={handleChange}>
              <option value="">All Years</option>
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <select name="quarter" value={filters.quarter} onChange={handleChange}>
              <option value="">All Quarters</option>
              <option value="Q1">Q1 (Jan–Mar)</option>
              <option value="Q2">Q2 (Apr–Jun)</option>
              <option value="Q3">Q3 (Jul–Sep)</option>
              <option value="Q4">Q4 (Oct–Dec)</option>
            </select>
          </>
        )}

        {showAcademic && (
          <select name="academic_year" value={filters.academic_year} onChange={handleChange}>
            <option value="">All Academic Years</option>
            <option value="2025-26">2025-26</option>
            <option value="2024-25">2024-25</option>
            <option value="2023-24">2023-24</option>
            <option value="2022-23">2022-23</option>
          </select>
        )}

        {showFy && (
          <select name="financial_year" value={filters.financial_year} onChange={handleChange}>
            <option value="">All Financial Years</option>
            <option value="2025-26">2025-26</option>
            <option value="2025-2026">2025-2026</option>
            <option value="2024-25">2024-25</option>
            <option value="2023-24">2023-24</option>
            <option value="23-24">23-24</option>
          </select>
        )}

        {showGender && (
          <select name="gender" value={filters.gender} onChange={handleChange}>
            <option value="">All Genders</option>
            <option value="F">Female (F)</option>
            <option value="M">Male (M)</option>
          </select>
        )}
      </div>

      <div className="filter-actions">
        <button className="btn btn-primary" onClick={() => onApply(payload())}>
          Apply
        </button>
        <button className="btn btn-ghost" onClick={handleReset}>
          Reset
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => window.print()}
          style={{ marginLeft: '8px' }}
        >
          <Printer size={16} /> Download Report
        </button>
      </div>
      <p className="filter-hint">{CLOCK_HINT[moduleName]}</p>
    </div>
  );
}
