'use client';

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Printer } from '@phosphor-icons/react';

const GlobalFilters = ({ onApply }) => {
  const [locations, setLocations] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [filters, setFilters] = useState({
    state_id: '',
    district_id: '',
    year: new Date().getFullYear().toString(),
    quarter: '',
    academic_year: ''
  });

  const activeStateIdRef = useRef('');

  const fetchLocations = React.useCallback(async () => {
    try {
      const response = await axios.get('/api/locations');
      setLocations(response.data);
    } catch (error) {
      console.error('Failed to fetch locations');
    }
  }, []);

  const fetchDistricts = React.useCallback(async (stateId) => {
    activeStateIdRef.current = stateId;
    try {
      const response = await axios.get(`/api/locations?state_id=${stateId}`);
      if (activeStateIdRef.current === stateId) {
        setDistricts(response.data);
      }
    } catch (error) {
      if (activeStateIdRef.current === stateId) {
        console.error('Failed to fetch districts');
      }
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => {
      const nextFilters = {
        ...prev,
        [name]: value
      };
      if (name === 'state_id') {
        nextFilters.district_id = '';
        if (value) {
          fetchDistricts(value);
        } else {
          activeStateIdRef.current = '';
          setDistricts([]);
        }
      }
      return nextFilters;
    });
  };

  const handleReset = () => {
    const defaultFilters = { state_id: '', district_id: '', year: new Date().getFullYear().toString(), quarter: '', academic_year: '' };
    activeStateIdRef.current = '';
    setFilters(defaultFilters);
    setDistricts([]);
    onApply(defaultFilters);
  };

  const years = [];
  for (let y = new Date().getFullYear(); y >= 2020; y--) {
    years.push(y);
  }

  return (
    <div className="filter-bar">
      <div className="filter-controls">
        <select 
          name="state_id"
          value={filters.state_id}
          onChange={handleChange}
        >
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

        <select 
          name="year"
          value={filters.year}
          onChange={handleChange}
        >
          <option value="">All Years</option>
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <select 
          name="quarter"
          value={filters.quarter}
          onChange={handleChange}
        >
          <option value="">All Quarters</option>
          <option value="Q1">Q1 (Jan–Mar)</option>
          <option value="Q2">Q2 (Apr–Jun)</option>
          <option value="Q3">Q3 (Jul–Sep)</option>
          <option value="Q4">Q4 (Oct–Dec)</option>
        </select>
        
        <select 
          name="academic_year"
          value={filters.academic_year}
          onChange={handleChange}
        >
          <option value="">All Academic Years</option>
          <option value="2024-25">2024-25</option>
          <option value="2023-24">2023-24</option>
          <option value="2022-23">2022-23</option>
        </select>
      </div>

      <div className="filter-actions">
        <button 
          className="btn btn-primary"
          onClick={() => onApply(filters)}
        >
          Apply
        </button>
        <button 
          className="btn btn-ghost"
          onClick={handleReset}
        >
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
    </div>
  );
};

export default GlobalFilters;
