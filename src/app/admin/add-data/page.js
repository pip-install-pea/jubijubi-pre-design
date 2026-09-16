'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useAuth } from '../../../context/AuthContext';
import { TABLE_SCHEMAS } from '@/lib/tableSchemas.js';

/* ─── Static Table Menu (matches tableSchemas.js on server) ─── */
const TABLE_MENU = {
  health: {
    label: 'Health',
    tables: [
      { key: 'health_profile_patients', label: 'Patient Registration' },
      { key: 'health_profile_doctors', label: 'Doctor Registration' },
      { key: 'health_patient_appointments', label: 'Patient Appointment' },
      { key: 'health_beneficiary_year', label: 'Year envelope' },
      { key: 'health_disease_summary', label: 'Disease mix summary' },
      { key: 'health_disease_patients', label: 'Disease patients (sample)' },
    ]
  },
  livelihood: {
    label: 'Livelihood',
    tables: [
      { key: 'skilltracking_batch_list', label: 'Training Batch' },
      { key: 'skilltracking_persons', label: 'Skilling Trainee' },
      { key: 'skilltracking_monitor', label: 'Placement Monitor' },
      { key: 'enterprise_support', label: 'Enterprise Member' },
      { key: 'enterprise_support_monitoring', label: 'Enterprise Profit Monitor' },
      { key: 'enterprise_market_access', label: 'Market Access' },
    ]
  },
  education: {
    label: 'Education',
    tables: [
      { key: 'education_program', label: 'Programme Session' },
      { key: 'education_mixprogram', label: 'Mixprogramme schools' },
      { key: 'education_assessment', label: 'Values Assessment' },
      { key: 'education_muskaan_assessment', label: 'Muskaan Skill Assessment' },
    ]
  },
};

/* ─── Lightweight field-config (mirrors server schema for form rendering) ─── */
const FIELD_CONFIGS = {
  health_profile_patients: [
    { col: 'patient_id', label: 'Patient ID', type: 'text', required: true },
    { col: 'full_name', label: 'Full Name', type: 'text', required: true },
    { col: 'gender', label: 'Gender', type: 'select', options: ['M', 'F', 'Other'] },
    { col: 'age', label: 'Age (years)', type: 'text' },
    { col: 'age_month', label: 'Age (months)', type: 'text' },
    { col: 'dob', label: 'Date of Birth', type: 'text', placeholder: 'YYYY-MM-DD' },
    { col: 'aadhar_no', label: 'Aadhaar No', type: 'text' },
    { col: 'contact_no', label: 'Contact No', type: 'text' },
    { col: 'partner_id', label: 'Healthcare Partner', type: 'fk', required: true },
    { col: 'state_id', label: 'State', type: 'fk' },
    { col: 'district_id', label: 'District', type: 'fk' },
    { col: 'block_id', label: 'Block', type: 'fk' },
    { col: 'village_id', label: 'Village', type: 'fk' },
    { col: 'address', label: 'Address', type: 'textarea' },
    { col: 'pin_code', label: 'PIN Code', type: 'text' },
    { col: 'height', label: 'Height (cm)', type: 'text' },
    { col: 'weight', label: 'Weight (kg)', type: 'text' },
    { col: 'blood_group_id', label: 'Blood Group', type: 'text' },
    { col: 'caste_id', label: 'Community/Caste', type: 'text' },
    { col: 'disability', label: 'Disability', type: 'select', options: ['Yes', 'No'] },
    { col: 'female_is_pregnant', label: 'Pregnant (F)', type: 'select', options: ['Yes', 'No', ''] },
  ],
  health_profile_doctors: [
    { col: 'source_id', label: 'Doctor ID', type: 'text', required: true },
    { col: 'doctor_name', label: 'Doctor Name', type: 'text', required: true },
    { col: 'specialization', label: 'Specialization', type: 'text' },
    { col: 'partner_id', label: 'Healthcare Partner', type: 'fk', required: true },
    { col: 'state_id', label: 'State', type: 'fk' },
    { col: 'district_id', label: 'District', type: 'fk' },
  ],
  health_patient_appointments: [
    { col: 'appointment_id', label: 'Appointment ID', type: 'text', required: true },
    { col: 'profile_patient_id', label: 'Patient', type: 'fk', required: true },
    { col: 'assigned_doctor_id', label: 'Assigned Doctor', type: 'fk' },
    { col: 'symtom', label: 'Symptoms', type: 'text' },
    { col: 'disease', label: 'Disease', type: 'text' },
    { col: 'bp_lower', label: 'BP Lower', type: 'text' },
    { col: 'bp_upper', label: 'BP Upper', type: 'text' },
    { col: 'sugar', label: 'Blood Sugar', type: 'text' },
    { col: 'temperature', label: 'Temperature', type: 'text' },
    { col: 'blood_oxygen_level', label: 'SpO₂', type: 'text' },
    { col: 'pulse', label: 'Pulse', type: 'text' },
    { col: 'hemoglobin', label: 'Haemoglobin', type: 'text' },
    { col: 'fees_free_or_paid', label: 'Free / Paid', type: 'select', options: ['Free', 'Paid'] },
    { col: 'paid_amount', label: 'Amount Paid', type: 'text' },
    { col: 'prescription', label: 'Prescription', type: 'textarea' },
    { col: 'doctor_remarks', label: 'Doctor Remarks', type: 'textarea' },
    { col: 'partner_id', label: 'Healthcare Partner', type: 'fk' },
    { col: 'state_id', label: 'State', type: 'fk' },
    { col: 'district_id', label: 'District', type: 'fk' },
  ],
  skilltracking_batch_list: [
    { col: 'batch_id', label: 'Batch ID', type: 'text', required: true },
    { col: 'batch_name', label: 'Batch Name', type: 'text', required: true },
    { col: 'course_id', label: 'Course / Trade', type: 'fk', required: true },
    { col: 'center_id', label: 'Skill Center', type: 'fk', required: true },
    { col: 'batch_strength', label: 'Batch Strength', type: 'text' },
    { col: 'batch_start_date', label: 'Start Date', type: 'text', placeholder: 'YYYY-MM-DD' },
    { col: 'batch_end_date', label: 'End Date', type: 'text', placeholder: 'YYYY-MM-DD' },
    { col: 'training_id', label: 'Training Stream', type: 'fk' },
    { col: 'state_id', label: 'State', type: 'fk' },
    { col: 'district_id', label: 'District', type: 'fk' },
    { col: 'latitude', label: 'Latitude', type: 'text' },
    { col: 'longitude', label: 'Longitude', type: 'text' },
  ],
  skilltracking_persons: [
    { col: 'person_id', label: 'Person ID', type: 'text', required: true },
    { col: 'person_name', label: 'Full Name', type: 'text', required: true },
    { col: 'batch_id', label: 'Batch', type: 'fk', required: true },
    { col: 'gender', label: 'Gender', type: 'select', options: ['M', 'F', 'Other'] },
    { col: 'dob', label: 'Date of Birth', type: 'text', placeholder: 'YYYY-MM-DD' },
    { col: 'email', label: 'Email', type: 'text' },
    { col: 'mobile_number', label: 'Mobile', type: 'text' },
    { col: 'address', label: 'Address', type: 'textarea' },
    { col: 'qualification_id', label: 'Qualification', type: 'fk' },
    { col: 'training_stream_id', label: 'Trade / Stream', type: 'fk' },
    { col: 'center_id', label: 'Skill Center', type: 'fk' },
    { col: 'date_of_completion_of_training', label: 'Completion Date', type: 'text', placeholder: 'YYYY-MM-DD' },
    { col: 'state_id', label: 'State', type: 'fk' },
    { col: 'district_id', label: 'District', type: 'fk' },
  ],
  skilltracking_monitor: [
    { col: 'monitoring_id', label: 'Monitoring ID', type: 'text', required: true },
    { col: 'person_id', label: 'Person', type: 'fk', required: true },
    { col: 'date_of_monitor', label: 'Monitor Date', type: 'text', placeholder: 'YYYY-MM-DD' },
    { col: 'work_status', label: 'Work Status', type: 'select', options: ['Working', 'Not Working', 'Self Employed'] },
    { col: 'current_work', label: 'Current Work', type: 'text' },
    { col: 'employment_type', label: 'Employment Type', type: 'select', options: ['Salaried', 'Daily Wage', 'Self Employed'] },
    { col: 'monthly_income', label: 'Monthly Income (₹)', type: 'text' },
    { col: 'remark', label: 'Remarks', type: 'textarea' },
    { col: 'state_id', label: 'State', type: 'fk' },
    { col: 'district_id', label: 'District', type: 'fk' },
  ],
  enterprise_support: [
    { col: 'member_id', label: 'Member ID', type: 'text', required: true },
    { col: 'member_name', label: 'Member Name', type: 'text', required: true },
    { col: 'member_type', label: 'Member Type', type: 'select', options: ['Individual', 'SHG', 'FPO'] },
    { col: 'member_mode', label: 'Member Mode', type: 'text' },
    { col: 'phone_number', label: 'Phone', type: 'text' },
    { col: 'supported_by', label: 'Supported By', type: 'text' },
    { col: 'state_id', label: 'State', type: 'fk' },
    { col: 'district_id', label: 'District', type: 'fk' },
    { col: 'block_id', label: 'Block', type: 'fk' },
    { col: 'village_id', label: 'Village', type: 'fk' },
  ],
  enterprise_support_monitoring: [
    { col: 'monitoring_id', label: 'Monitoring ID', type: 'text', required: true },
    { col: 'member_id', label: 'Enterprise Member', type: 'fk', required: true },
    { col: 'financial_year', label: 'Financial Year', type: 'text', placeholder: 'e.g. 2024-25' },
    { col: 'profit', label: 'Annual Profit (₹)', type: 'text' },
  ],
  education_program: [
    { col: 'program_id', label: 'Programme ID', type: 'text', required: true },
    { col: 'program_name', label: 'Programme Name', type: 'text', required: true },
    { col: 'activity_type', label: 'Activity Type', type: 'text' },
    { col: 'school_name', label: 'School Name', type: 'text' },
    { col: 'school_id', label: 'School ID', type: 'text' },
    { col: 'academic_year', label: 'Academic Year', type: 'text', placeholder: 'e.g. 2024-25' },
    { col: 'activity_date', label: 'Activity Date', type: 'text', placeholder: 'YYYY-MM-DD' },
    { col: 'student_count', label: 'Student Count', type: 'text' },
    { col: 'state_id', label: 'State', type: 'fk' },
    { col: 'district_id', label: 'District', type: 'fk' },
    { col: 'block_id', label: 'Block', type: 'fk' },
    { col: 'village_id', label: 'Village', type: 'fk' },
  ],
  education_assessment: [
    { col: 'assessment_id', label: 'Assessment ID', type: 'text', required: true },
    { col: 'program_id', label: 'Programme', type: 'fk', required: true },
    { col: 'school_id', label: 'School ID', type: 'text' },
    { col: 'student_id', label: 'Student ID', type: 'text' },
    { col: 'value_name', label: 'Value Name', type: 'text', placeholder: 'e.g. Respect, Empathy' },
    { col: 'pre_score', label: 'Pre Score', type: 'text' },
    { col: 'post_score', label: 'Post Score', type: 'text' },
    { col: 'assessment_date', label: 'Assessment Date', type: 'text', placeholder: 'YYYY-MM-DD' },
    { col: 'academic_year', label: 'Academic Year', type: 'text', placeholder: 'e.g. 2024-25' },
  ],
  education_muskaan_assessment: [
    { col: 'assessment_id', label: 'Assessment ID', type: 'text', required: true },
    { col: 'school_id', label: 'School ID', type: 'text' },
    { col: 'student_id', label: 'Student ID', type: 'text' },
    { col: 'skill_area', label: 'Skill Area', type: 'text', placeholder: 'e.g. Communication' },
    { col: 'pre_level', label: 'Pre Level', type: 'text', placeholder: 'e.g. Beginner' },
    { col: 'post_level', label: 'Post Level', type: 'text', placeholder: 'e.g. Proficient' },
    { col: 'assessment_date', label: 'Assessment Date', type: 'text', placeholder: 'YYYY-MM-DD' },
    { col: 'academic_year', label: 'Academic Year', type: 'text', placeholder: 'e.g. 2024-25' },
  ],
};

/* ═══════════════════════════════════════════════════════════ */

export default function AddDataPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  // Tab mode
  const [mode, setMode] = useState('live'); // 'live' | 'single' | 'bulk' | 'manage'

  // Table selection
  const [selectedTable, setSelectedTable] = useState('');
  const [lookups, setLookups] = useState({});
  const [lookupLoading, setLookupLoading] = useState(false);

  // Single-entry form
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  // Bulk upload
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const fileRef = useRef(null);

  // Manage tab state
  const [manualRecords, setManualRecords] = useState([]);
  const [loadingManual, setLoadingManual] = useState(false);
  const [manageError, setManageError] = useState('');
  const [editRecord, setEditRecord] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editResult, setEditResult] = useState(null);

  const [liveSheets, setLiveSheets] = useState([]);
  const [liveSheet, setLiveSheet] = useState('');
  const [liveYear, setLiveYear] = useState(String(new Date().getFullYear()));
  const [liveFrom, setLiveFrom] = useState('');
  const [liveTo, setLiveTo] = useState('');
  const [liveDiseaseId, setLiveDiseaseId] = useState('');
  const [liveRecords, setLiveRecords] = useState([]);
  const [liveMeta, setLiveMeta] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState('');

  // Compute visible categories
  const visibleCategories = Object.entries(TABLE_MENU).filter(([key]) => {
    return isAdmin || user?.thematic === key;
  });

  // Load FK lookups when table changes or filters are applied
  const loadLookups = useCallback(async (table, filters = {}) => {
    if (!table) return;
    const isInitial = Object.keys(filters).length === 0;
    if (isInitial) {
      setLookupLoading(true);
    }
    try {
      const res = await axios.post('/api/data/foreign-keys', { table, filters });
      if (isInitial) {
        setLookups(res.data.lookups || {});
      } else {
        setLookups(prev => ({
          ...prev,
          ...res.data.lookups
        }));
      }
    } catch (err) {
      console.error('Failed to load lookups:', err);
      if (isInitial) {
        setLookups({});
      }
    } finally {
      if (isInitial) {
        setLookupLoading(false);
      }
    }
  }, []);

  const fetchManualRecords = useCallback(async (table) => {
    if (!table) return;
    setLoadingManual(true);
    setManageError('');
    try {
      const res = await axios.get(`/api/data/list?table=${table}&source=all`);
      setManualRecords(res.data.records || []);
    } catch (err) {
      setManageError(err.response?.data?.error || 'Failed to fetch stored records.');
      setManualRecords([]);
    } finally {
      setLoadingManual(false);
    }
  }, []);

  useEffect(() => {
    const loadSheets = async () => {
      try {
        const res = await axios.get('/api/php/query');
        setLiveSheets(res.data.sheets || []);
      } catch (err) {
        console.error('Failed to load live sheets', err);
      }
    };
    loadSheets();
  }, []);

  const selectedLive = liveSheets.find((s) => s.sheet === liveSheet);

  const fetchLiveRecords = async () => {
    if (!liveSheet) return;
    setLiveLoading(true);
    setLiveError('');
    setLiveMeta(null);
    try {
      const payload = { sheet: liveSheet, year: liveYear };
      if (liveFrom) payload.from_date = liveFrom;
      if (liveTo) payload.to_date = liveTo;
      if (liveDiseaseId) payload.disease_id = liveDiseaseId;
      const res = await axios.post('/api/php/query', payload);
      setLiveRecords(res.data.records || []);
      setLiveMeta(res.data);
    } catch (err) {
      setLiveRecords([]);
      setLiveError(err.response?.data?.error || 'Live fetch failed.');
    } finally {
      setLiveLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTable) {
      loadLookups(selectedTable);
      setFormData({});
      setResult(null);
      setBulkPreview([]);
      setBulkResult(null);
      setBulkFile(null);
      setManualRecords([]);
      setManageError('');
      if (mode === 'manage') {
        fetchManualRecords(selectedTable);
      }
    }
  }, [selectedTable, mode, loadLookups, fetchManualRecords]);

  // Build category label for selected table
  const selectedConfig = FIELD_CONFIGS[selectedTable] || [];
  const selectedLabel = (() => {
    for (const [, cat] of Object.entries(TABLE_MENU)) {
      const t = cat.tables.find(t => t.key === selectedTable);
      if (t) return `${cat.label} — ${t.label}`;
    }
    return '';
  })();

  /* ─── Single-Entry Handlers ─── */
  const handleFieldChange = (col, value) => {
    setFormData(prev => {
      const nextData = { ...prev, [col]: value };
      
      // Cascading lookup logic for geographic hierarchy
      if (col === 'state_id') {
        nextData.district_id = '';
        nextData.block_id = '';
        nextData.village_id = '';
        loadLookups(selectedTable, { state_id: value });
      } else if (col === 'district_id') {
        nextData.block_id = '';
        nextData.village_id = '';
        loadLookups(selectedTable, { 
          state_id: nextData.state_id, 
          district_id: value 
        });
      } else if (col === 'block_id') {
        nextData.village_id = '';
        loadLookups(selectedTable, { 
          state_id: nextData.state_id, 
          district_id: nextData.district_id, 
          block_id: value 
        });
      } else if (col === 'center_id') {
        nextData.batch_id = '';
        loadLookups(selectedTable, { center_id: value });
      }
      
      return nextData;
    });
  };

  const handleSingleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await axios.post('/api/data/add', {
        table: selectedTable,
        record: formData
      });
      setResult({ type: 'success', message: res.data.message || 'Record saved!' });
      setFormData({});
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to save record.';
      setResult({ type: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteManual = async (id) => {
    if (!window.confirm('Are you sure you want to delete this record? This action cannot be undone.')) {
      return;
    }
    try {
      await axios.delete('/api/data/delete', {
        data: { table: selectedTable, id }
      });
      fetchManualRecords(selectedTable);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete record.');
    }
  };

  const handleEditClick = (record) => {
    setEditRecord(record);
    const initialData = {};
    selectedConfig.forEach(field => {
      initialData[field.col] = record[field.col] !== null ? record[field.col] : '';
    });
    setEditFormData(initialData);
    setEditResult(null);
  };

  const handleEditFieldChange = (col, value) => {
    setEditFormData(prev => {
      const nextData = { ...prev, [col]: value };
      if (col === 'state_id') {
        nextData.district_id = '';
        nextData.block_id = '';
        nextData.village_id = '';
        loadLookups(selectedTable, { state_id: value });
      } else if (col === 'district_id') {
        nextData.block_id = '';
        nextData.village_id = '';
        loadLookups(selectedTable, { 
          state_id: nextData.state_id, 
          district_id: value 
        });
      } else if (col === 'block_id') {
        nextData.village_id = '';
        loadLookups(selectedTable, { 
          state_id: nextData.state_id, 
          district_id: nextData.district_id, 
          block_id: value 
        });
      }
      return nextData;
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditSubmitting(true);
    setEditResult(null);
    try {
      const pk = TABLE_SCHEMAS[selectedTable]?.primaryKey || selectedConfig[0]?.col;
      await axios.put('/api/data/update', {
        table: selectedTable,
        id: editRecord[pk],
        record: editFormData
      });
      setEditResult({ type: 'success', message: 'Record updated successfully!' });
      setTimeout(() => {
        setEditRecord(null);
        fetchManualRecords(selectedTable);
      }, 1500);
    } catch (err) {
      setEditResult({ type: 'error', message: err.response?.data?.error || 'Failed to update record.' });
    } finally {
      setEditSubmitting(false);
    }
  };

  /* ─── Bulk Upload Handlers ─── */
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file);
    setBulkResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'binary' });
        const firstSheet = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' });
        setBulkPreview(rows.slice(0, 10)); // preview first 10 rows
        setBulkFile({ name: file.name, rows });
      } catch (err) {
        setBulkResult({ type: 'error', message: 'Failed to parse file. Use .xlsx or .csv format.' });
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleBulkUpload = async () => {
    if (!bulkFile?.rows?.length) return;
    setBulkUploading(true);
    setBulkResult(null);
    try {
      const res = await axios.post('/api/data/add-batch', {
        table: selectedTable,
        records: bulkFile.rows
      });
      setBulkResult({
        type: 'success',
        message: `✅ ${res.data.inserted} inserted, ${res.data.skipped} skipped (FK invalid), ${res.data.errors} errors.`
      });
    } catch (err) {
      const msg = err.response?.data?.error || 'Bulk upload failed.';
      setBulkResult({ type: 'error', message: msg });
    } finally {
      setBulkUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    if (!selectedConfig.length) return;
    const headers = selectedConfig.map(f => f.col);
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `${selectedTable}_template.xlsx`);
  };

  /* ─── Render ─── */
  return (
    <div>
      {/* Header */}
      <div className="section-header">
        <h2 className="card-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>Add Data</h2>
        <p className="section-sub">Live jubicare tables, plus manual Postgres insert</p>
      </div>

      <div className="tab-list" style={{ marginBottom: '16px' }}>
        <button
          className={`tab-btn ${mode === 'live' ? 'active' : ''}`}
          onClick={() => setMode('live')}
        >
          Live from API
        </button>
        <button
          className={`tab-btn ${mode === 'single' || mode === 'bulk' || mode === 'manage' ? 'active' : ''}`}
          onClick={() => setMode('single')}
        >
          Manual / Postgres
        </button>
      </div>

      {mode === 'live' && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-body">
            <p className="section-sub" style={{ marginBottom: '12px' }}>
              Reads jubicare directly (JWT stays on this app). Appointments and patients use a short date window — PHP 500s on a full year.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Sheet</label>
                <select className="form-control" value={liveSheet} onChange={(e) => { setLiveSheet(e.target.value); setLiveRecords([]); setLiveError(''); }}>
                  <option value="">— Choose a live sheet —</option>
                  {['health', 'livelihood', 'education'].map((theme) => (
                    <optgroup key={theme} label={theme}>
                      {liveSheets.filter((s) => s.thematic === theme).map((s) => (
                        <option key={s.sheet} value={s.sheet}>{s.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Calendar year</label>
                <input className="form-control" value={liveYear} onChange={(e) => setLiveYear(e.target.value)} placeholder="2025" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">from_date</label>
                <input className="form-control" value={liveFrom} onChange={(e) => setLiveFrom(e.target.value)} placeholder="YYYY-MM-DD (optional)" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">to_date</label>
                <input className="form-control" value={liveTo} onChange={(e) => setLiveTo(e.target.value)} placeholder="YYYY-MM-DD (optional)" />
              </div>
              {selectedLive?.needsDiseaseId && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">disease_id</label>
                  <input className="form-control" value={liveDiseaseId} onChange={(e) => setLiveDiseaseId(e.target.value)} placeholder="from disease summary" />
                </div>
              )}
            </div>
            {selectedLive?.caption && <p className="kpi-caption">{selectedLive.caption}</p>}
            <button className="btn btn-primary" onClick={fetchLiveRecords} disabled={!liveSheet || liveLoading} style={{ marginTop: '12px' }}>
              {liveLoading ? 'Fetching…' : 'Fetch live rows'}
            </button>
            {liveError && <p className="kpi-caption" style={{ color: 'var(--danger)', marginTop: '8px' }}>{liveError}</p>}
            {liveMeta && (
              <p className="kpi-caption" style={{ marginTop: '8px' }}>
                {liveMeta.endpoint} · {liveMeta.count} rows
                {liveMeta.body ? ` · ${JSON.stringify(liveMeta.body)}` : ''}
              </p>
            )}
            {liveRecords.length > 0 && (
              <div className="table-scroll" style={{ marginTop: '16px', maxHeight: '480px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {Object.keys(liveRecords[0]).map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {liveRecords.map((row, i) => (
                      <tr key={i}>
                        {Object.keys(liveRecords[0]).map((col) => (
                          <td key={col}>{row[col] == null ? '' : String(row[col])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!liveLoading && liveSheet && liveRecords.length === 0 && !liveError && liveMeta && (
              <div className="empty-state"><strong>No rows for this window</strong></div>
            )}
          </div>
        </div>
      )}

      {/* Table Selector */}
      {mode !== 'live' && (
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-body">
          <div className="form-group" style={{ maxWidth: '480px', marginBottom: 0 }}>
            <label className="form-label">Select Data Table</label>
            <select
              className="form-control"
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              id="add-data-table-select"
            >
              <option value="">— Choose a table —</option>
              {visibleCategories.map(([key, cat]) => (
                <optgroup key={key} label={cat.label}>
                  {cat.tables.map(t => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
      </div>
      )}

      {/* Mode Tabs */}
      {mode !== 'live' && selectedTable && (
        <>
          <div className="tab-list">
            <button
              className={`tab-btn ${mode === 'single' ? 'active' : ''}`}
              onClick={() => setMode('single')}
              id="tab-single-entry"
            >
              ✏️ Single Entry
            </button>
            <button
              className={`tab-btn ${mode === 'bulk' ? 'active' : ''}`}
              onClick={() => setMode('bulk')}
              id="tab-bulk-upload"
            >
              📊 Bulk Upload (Excel/CSV)
            </button>
            <button
              className={`tab-btn ${mode === 'manage' ? 'active' : ''}`}
              onClick={() => { setMode('manage'); fetchManualRecords(selectedTable); }}
              id="tab-manage-data"
            >
              🛠️ Postgres rows (incl. synced)
            </button>
          </div>

          {/* ─── Single Entry Panel ─── */}
          {mode === 'single' && (
            <div className="card" style={{ animation: 'fadeInUp 0.3s ease' }}>
              <div className="card-body">
                <div style={{ marginBottom: '16px' }}>
                  <h3 className="card-title" style={{ fontSize: '16px' }}>{selectedLabel}</h3>
                  <p className="section-sub" style={{ fontSize: '12px', marginTop: '2px' }}>
                    Fields marked with <span style={{ color: 'var(--danger)' }}>*</span> are required
                  </p>
                </div>

                {lookupLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px 0' }}>
                    <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
                    <span style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading form options…</span>
                  </div>
                ) : (
                  <form onSubmit={handleSingleSubmit}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                      gap: '16px'
                    }}>
                      {selectedConfig.map(field => (
                        <div className="form-group" key={field.col} style={{ marginBottom: 0 }}>
                          <label className="form-label">
                            {field.label}
                            {field.required && <span style={{ color: 'var(--danger)', marginLeft: '2px' }}>*</span>}
                          </label>

                          {/* Text / Number */}
                          {(field.type === 'text' || field.type === 'number') && (
                            <input
                              className="form-control"
                              type={field.type === 'number' ? 'number' : 'text'}
                              placeholder={field.placeholder || ''}
                              value={formData[field.col] || ''}
                              onChange={(e) => handleFieldChange(field.col, e.target.value)}
                              required={field.required}
                              id={`field-${field.col}`}
                            />
                          )}

                          {/* Static Select */}
                          {field.type === 'select' && (
                            <select
                              className="form-control"
                              value={formData[field.col] || ''}
                              onChange={(e) => handleFieldChange(field.col, e.target.value)}
                              required={field.required}
                              id={`field-${field.col}`}
                            >
                              <option value="">— Select —</option>
                              {(field.options || []).map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          )}

                          {/* FK Dropdown (loaded from API) */}
                          {field.type === 'fk' && (
                            <select
                              className="form-control"
                              value={formData[field.col] || ''}
                              onChange={(e) => handleFieldChange(field.col, e.target.value)}
                              required={field.required}
                              id={`field-${field.col}`}
                              disabled={
                                (field.col === 'district_id' && !formData.state_id) ||
                                (field.col === 'block_id' && !formData.district_id) ||
                                (field.col === 'village_id' && !formData.block_id) ||
                                (field.col === 'batch_id' && selectedConfig.some(f => f.col === 'center_id') && !formData.center_id)
                              }
                            >
                              <option value="">— Select —</option>
                              {(lookups[field.col] || []).map(opt => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label} ({opt.id})
                                </option>
                              ))}
                            </select>
                          )}

                          {/* Textarea */}
                          {field.type === 'textarea' && (
                            <textarea
                              className="form-control"
                              rows={2}
                              value={formData[field.col] || ''}
                              onChange={(e) => handleFieldChange(field.col, e.target.value)}
                              id={`field-${field.col}`}
                            />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Result message */}
                    {result && (
                      <div
                        className={`badge ${result.type === 'success' ? 'badge-success' : 'badge-danger'}`}
                        style={{ marginTop: '16px', padding: '8px 14px', fontSize: '13px' }}
                      >
                        {result.message}
                      </div>
                    )}

                    <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting}
                        id="btn-save-record"
                      >
                        {submitting ? 'Saving…' : '💾 Save Record'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => { setFormData({}); setResult(null); }}
                        id="btn-reset-form"
                      >
                        Reset
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* ─── Bulk Upload Panel ─── */}
          {mode === 'bulk' && (
            <div className="card" style={{ animation: 'fadeInUp 0.3s ease' }}>
              <div className="card-body">
                <div style={{ marginBottom: '16px' }}>
                  <h3 className="card-title" style={{ fontSize: '16px' }}>{selectedLabel} — Bulk Upload</h3>
                  <p className="section-sub" style={{ fontSize: '12px', marginTop: '2px' }}>
                    Upload an Excel (.xlsx) or CSV file. Column headers must match the expected field names.
                  </p>
                </div>

                {/* Template download */}
                <button
                  className="btn btn-outline"
                  onClick={handleDownloadTemplate}
                  style={{ marginBottom: '16px' }}
                  id="btn-download-template"
                >
                  📥 Download Template (.xlsx)
                </button>

                {/* File input */}
                <div
                  style={{
                    border: '2px dashed var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '32px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    marginBottom: '16px',
                    transition: 'border-color 0.2s ease',
                    background: 'var(--surface2)',
                  }}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onDragLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = 'var(--border)';
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      const fakeEvt = { target: { files: [file] } };
                      handleFileChange(fakeEvt);
                    }
                  }}
                  id="bulk-drop-zone"
                >
                  <input
                    type="file"
                    ref={fileRef}
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>📁</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                    {bulkFile?.name ? bulkFile.name : 'Click or drag & drop your file here'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                    Supported: .xlsx, .xls, .csv — max 5,000 rows
                  </div>
                </div>

                {/* Preview table */}
                {bulkPreview.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>
                      Preview (first {Math.min(bulkPreview.length, 10)} of {bulkFile?.rows?.length || 0} rows)
                    </p>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="data-table" style={{ fontSize: '11px' }}>
                        <thead>
                          <tr>
                            {Object.keys(bulkPreview[0]).map(col => (
                              <th key={col}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {bulkPreview.map((row, i) => (
                            <tr key={i}>
                              {Object.values(row).map((v, j) => (
                                <td key={j}>{String(v)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Result */}
                {bulkResult && (
                  <div
                    className={`badge ${bulkResult.type === 'success' ? 'badge-success' : 'badge-danger'}`}
                    style={{ marginBottom: '16px', padding: '8px 14px', fontSize: '13px' }}
                  >
                    {bulkResult.message}
                  </div>
                )}

                {/* Upload button */}
                {bulkFile?.rows?.length > 0 && (
                  <button
                    className="btn btn-primary"
                    onClick={handleBulkUpload}
                    disabled={bulkUploading}
                    id="btn-bulk-upload"
                  >
                    {bulkUploading
                      ? `Uploading ${bulkFile.rows.length} rows…`
                      : `🚀 Upload ${bulkFile.rows.length} Records`
                    }
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─── Manage Added Data Panel ─── */}
          {mode === 'manage' && (
            <div className="card" style={{ animation: 'fadeInUp 0.3s ease' }}>
              <div className="card-body">
                <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 className="card-title" style={{ fontSize: '16px' }}>Manage {selectedLabel}</h3>
                    <p className="section-sub" style={{ fontSize: '12px', marginTop: '2px' }}>
                      Update or delete records manually added to this table.
                    </p>
                  </div>
                  <button 
                    className="btn btn-outline" 
                    onClick={() => fetchManualRecords(selectedTable)}
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    🔄 Refresh
                  </button>
                </div>

                {manageError && (
                  <div className="badge badge-danger" style={{ marginBottom: '16px', padding: '8px 12px' }}>
                    {manageError}
                  </div>
                )}

                {loadingManual ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '30px 0' }}>
                    <div className="spinner" style={{ width: '20px', height: '20px' }}></div>
                    <span style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading manual records…</span>
                  </div>
                ) : manualRecords.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)', fontStyle: 'italic', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                    No manually added records found for this table.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          {selectedConfig.slice(0, 5).map(f => (
                            <th key={f.col}>{f.label}</th>
                          ))}
                          <th>Added By</th>
                          <th style={{ textAlign: 'center', width: '150px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manualRecords.map((record) => {
                          const pk = TABLE_SCHEMAS[selectedTable]?.primaryKey || selectedConfig[0]?.col;
                          const recordId = record[pk];
                          return (
                            <tr key={recordId}>
                              {selectedConfig.slice(0, 5).map(f => (
                                <td key={f.col} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                                  {record[f.col] !== null ? String(record[f.col]) : '—'}
                                </td>
                              ))}
                              <td>{record.added_by_username || `ID: ${record.added_by}`}</td>
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                  <button
                                    className="btn btn-outline"
                                    style={{ padding: '4px 8px', fontSize: '11px', borderColor: 'var(--accent)', color: 'var(--accent)' }}
                                    onClick={() => handleEditClick(record)}
                                    id={`btn-edit-${recordId}`}
                                  >
                                    ✏️ Edit
                                  </button>
                                  <button
                                    className="btn btn-outline"
                                    style={{ padding: '4px 8px', fontSize: '11px', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                                    onClick={() => handleDeleteManual(recordId)}
                                    id={`btn-delete-${recordId}`}
                                  >
                                    🗑️ Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Edit Record Overlay Modal ─── */}
          {editRecord && (
            <div 
              className="modal-overlay" 
              onClick={(e) => { if (e.target.className === 'modal-overlay') setEditRecord(null); }}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px'
              }}
            >
              <div className="drilldown-box" style={{ maxWidth: '800px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div className="drilldown-header">
                  <h3 className="drilldown-title">✏️ Edit Record</h3>
                  <button className="modal-close" onClick={() => setEditRecord(null)} aria-label="Close">✕</button>
                </div>
                
                <form onSubmit={handleEditSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div className="drilldown-body" style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                      gap: '16px'
                    }}>
                      {selectedConfig.map(field => {
                        const isPrimaryKey = field.col === (TABLE_SCHEMAS[selectedTable]?.primaryKey || selectedConfig[0]?.col);
                        return (
                          <div className="form-group" key={field.col} style={{ marginBottom: 0 }}>
                            <label className="form-label">
                              {field.label}
                              {field.required && <span style={{ color: 'var(--danger)', marginLeft: '2px' }}>*</span>}
                            </label>

                            {/* Text / Number */}
                            {(field.type === 'text' || field.type === 'number') && (
                              <input
                                className="form-control"
                                type={field.type === 'number' ? 'number' : 'text'}
                                placeholder={field.placeholder || ''}
                                value={editFormData[field.col] ?? ''}
                                onChange={(e) => handleEditFieldChange(field.col, e.target.value)}
                                required={field.required}
                                disabled={isPrimaryKey}
                                id={`edit-field-${field.col}`}
                              />
                            )}

                            {/* Static Select */}
                            {field.type === 'select' && (
                              <select
                                className="form-control"
                                value={editFormData[field.col] ?? ''}
                                onChange={(e) => handleEditFieldChange(field.col, e.target.value)}
                                required={field.required}
                                id={`edit-field-${field.col}`}
                              >
                                <option value="">— Select —</option>
                                {(field.options || []).map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            )}

                            {/* FK Dropdown */}
                            {field.type === 'fk' && (
                              <select
                                className="form-control"
                                value={editFormData[field.col] ?? ''}
                                onChange={(e) => handleEditFieldChange(field.col, e.target.value)}
                                required={field.required}
                                id={`edit-field-${field.col}`}
                                disabled={
                                  (field.col === 'district_id' && !editFormData.state_id) ||
                                  (field.col === 'block_id' && !editFormData.district_id) ||
                                  (field.col === 'village_id' && !editFormData.block_id) ||
                                  (field.col === 'batch_id' && selectedConfig.some(f => f.col === 'center_id') && !editFormData.center_id)
                                }
                              >
                                <option value="">— Select —</option>
                                {(lookups[field.col] || []).map(opt => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.label} ({opt.id})
                                  </option>
                                ))}
                              </select>
                            )}

                            {/* Textarea */}
                            {field.type === 'textarea' && (
                              <textarea
                                className="form-control"
                                rows={2}
                                value={editFormData[field.col] ?? ''}
                                onChange={(e) => handleEditFieldChange(field.col, e.target.value)}
                                id={`edit-field-${field.col}`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {editResult && (
                      <div
                        className={`badge ${editResult.type === 'success' ? 'badge-success' : 'badge-danger'}`}
                        style={{ marginTop: '16px', padding: '8px 14px', fontSize: '13px', display: 'block', textAlign: 'center' }}
                      >
                        {editResult.message}
                      </div>
                    )}
                  </div>

                  <div className="drilldown-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setEditRecord(null)}
                      disabled={editSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={editSubmitting}
                      id="btn-update-record"
                    >
                      {editSubmitting ? 'Updating…' : '💾 Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!selectedTable && mode !== 'live' && (
        <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--text)' }}>
            Select a data table to begin
          </h3>
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
            Choose from Health, Livelihood, or Education modules above
          </p>
        </div>
      )}
    </div>
  );
}
