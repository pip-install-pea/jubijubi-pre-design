'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { Search, Download, Loader2, X, Plus } from 'lucide-react';

const SELECT_KEYS = new Set([
  'gender', 'person_gender', 'placement_status', 'work_status', 'status',
  'year', 'academic_year', 'financial_year', 'month',
  'course_name', 'trade', 'training_type', 'trade_name',
  'program', 'program_name', 'phase', 'class',
  'caste', 'category', 'person_category',
  'district', 'state', 'block', 'location',
  'funding_support', 'livelihood', 'assessment_type',
  'market_access_type', 'member_type', 'time_bucket', 'delta_bucket',
  'theme_touched', 'activity_name', 'disability', 'community'
]);

const SKIP_KEYS = new Set([
  'person_id', 'member_id', 'patient_id', 'appointment_id', 'id',
  'source_id', 'mobile_number', 'phone_number', 'pre_post_id',
  'patients', 'metric', 'value'
]);

const PINNED = [
  'gender', 'person_gender', 'year', 'academic_year', 'financial_year',
  'placement_status', 'work_status', 'district', 'location', 'course_name', 'program'
];

function filterKind(key) {
  if (SKIP_KEYS.has(key)) return 'skip';
  if (SELECT_KEYS.has(key)) return 'select';
  return 'text';
}

function genderGroup(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (['f', 'female', 'woman', 'women', 'girl'].includes(s)) return 'f';
  if (['m', 'male', 'man', 'men', 'boy'].includes(s)) return 'm';
  return s;
}

function valuesMatch(cell, needle, key) {
  const a = String(cell ?? '').trim();
  const b = String(needle ?? '').trim();
  if (!b) return true;
  if (!a || a === '—') return false;
  if (key === 'gender' || key === 'person_gender') return genderGroup(a) === genderGroup(b);
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left === right || left.includes(right);
}

function filterRows(rows, columns, colFilters, findText) {
  const entries = Object.entries(colFilters || {}).filter(([, v]) => String(v || '').trim());
  const q = String(findText || '').trim().toLowerCase();
  const keys = new Set((columns || []).map((c) => c.key));
  return (rows || []).filter((row) => {
    const colsOk = entries.every(([key, val]) => {
      if (!keys.has(key)) return true;
      return valuesMatch(row?.[key], val, key);
    });
    if (!colsOk) return false;
    if (!q) return true;
    return (columns || []).some((col) => String(row?.[col.key] ?? '').toLowerCase().includes(q));
  });
}

function filterParams(colFilters) {
  const out = {};
  for (const [key, val] of Object.entries(colFilters || {})) {
    const trimmed = String(val || '').trim();
    if (trimmed) out[`f_${key}`] = trimmed;
  }
  return out;
}

function uniquesFromRows(rows, key) {
  const seen = new Set();
  for (const row of rows || []) {
    const val = String(row?.[key] ?? '').trim();
    if (val && val !== '—') seen.add(val);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

function Field({ col, value, options, onChange }) {
  const kind = filterKind(col.key);
  const useSelect = kind === 'select' && options.length > 0 && options.length <= 60;
  return (
    <label className="drilldown-filter">
      <span>{col.label}</span>
      {useSelect ? (
        <select value={value || ''} onChange={(e) => onChange(col.key, e.target.value)}>
          <option value="">All</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          type="search"
          placeholder={`Filter ${col.label.toLowerCase()}`}
          value={value || ''}
          onChange={(e) => onChange(col.key, e.target.value)}
        />
      )}
    </label>
  );
}

export default function DrilldownModal({ isOpen, onClose, title, apiUrl, params }) {
  const [data, setData] = useState({ columns: [], rows: [], total: 0, facets: {} });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [findText, setFindText] = useState('');
  const [colFilters, setColFilters] = useState({});
  const [facetCache, setFacetCache] = useState({});
  const [addedKeys, setAddedKeys] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);

  const paramsStr = JSON.stringify(params);
  const filterStr = JSON.stringify(colFilters);

  const fetchData = React.useCallback(async () => {
    if (!apiUrl) return;
    setLoading(true);
    try {
      const parsedParams = paramsStr ? JSON.parse(paramsStr) : {};
      const res = await axios.get(apiUrl, {
        params: {
          ...parsedParams,
          page,
          per_page: 50,
          ...filterParams(JSON.parse(filterStr || '{}'))
        }
      });
      const next = res.data || { columns: [], rows: [], total: 0, facets: {} };
      setData(next);
      if (next.facets && Object.keys(next.facets).length) {
        setFacetCache((prev) => ({ ...prev, ...next.facets }));
      }
    } catch (err) {
      console.error('Drilldown fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, paramsStr, page, filterStr]);

  useEffect(() => {
    if (isOpen) fetchData();
    else {
      setPage(1);
      setFindText('');
      setColFilters({});
      setAddedKeys([]);
      setFacetCache({});
      setPickerOpen(false);
      setData({ columns: [], rows: [], total: 0, facets: {} });
    }
  }, [isOpen, fetchData]);

  useEffect(() => {
    const close = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const setFilter = (key, value) => {
    setPage(1);
    setColFilters((prev) => {
      const next = { ...prev };
      if (!String(value || '').trim()) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const clearAll = () => {
    setFindText('');
    setColFilters({});
    setAddedKeys([]);
    setPage(1);
  };

  const optionsFor = (col) => {
    const merged = [...new Set([
      ...(facetCache[col.key] || []),
      ...(data.facets?.[col.key] || []),
      ...uniquesFromRows(data.rows, col.key)
    ])].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const current = colFilters[col.key];
    if (current && !merged.includes(current)) merged.unshift(current);
    return merged;
  };

  const filterCols = useMemo(
    () => (data.columns || []).filter((col) => filterKind(col.key) !== 'skip'),
    [data.columns]
  );

  const pinnedCols = filterCols
    .filter((col) => PINNED.includes(col.key))
    .slice(0, 4);
  const extraCols = filterCols.filter((col) => !pinnedCols.some((p) => p.key === col.key));
  const extraActive = extraCols.filter((col) => addedKeys.includes(col.key) || colFilters[col.key]);

  const visibleRows = useMemo(
    () => filterRows(data.rows, data.columns, colFilters, findText),
    [data.rows, data.columns, colFilters, findText]
  );

  const activeCount = Object.values(colFilters).filter((v) => String(v || '').trim()).length
    + (findText.trim() ? 1 : 0);

  if (!isOpen) return null;

  return (
    <div
      id="drilldown-modal"
      onClick={(e) => { if (e.target.id === 'drilldown-modal') onClose(); }}
    >
      <div className="drilldown-box" style={{ maxWidth: '1100px', width: '100%' }}>
        <div className="drilldown-header">
          <div>
            <h3 className="drilldown-title">{title}</h3>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
              {loading ? 'Loading…' : `${visibleRows.length.toLocaleString('en-IN')} of ${Number(data.total || 0).toLocaleString('en-IN')} on this page`}
            </span>
            {data.caption && (
              <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '4px 0 0' }}>{data.caption}</p>
            )}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {filterCols.length > 0 && (
          <div className="drilldown-toolbar">
            <label className="drilldown-filter drilldown-filter--find">
              <span>Find</span>
              <span className="drilldown-find">
                <Search size={15} />
                <input
                  type="search"
                  placeholder="Find in this table"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                />
              </span>
            </label>

            {pinnedCols.map((col) => (
              <Field
                key={col.key}
                col={col}
                value={colFilters[col.key] || ''}
                options={optionsFor(col)}
                onChange={setFilter}
              />
            ))}

            {extraActive.map((col) => (
              <Field
                key={col.key}
                col={col}
                value={colFilters[col.key] || ''}
                options={optionsFor(col)}
                onChange={setFilter}
              />
            ))}

            <div className="drilldown-filter drilldown-toolbar__actions">
              <span />
              <div className="drilldown-toolbar__buttons">
                {extraCols.length > extraActive.length && (
                  <div className="drilldown-picker" ref={pickerRef}>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => setPickerOpen((v) => !v)}
                    >
                      <Plus size={14} /> Add filter
                    </button>
                    {pickerOpen && (
                      <div className="drilldown-picker__menu">
                        {extraCols
                          .filter((col) => !colFilters[col.key] && !addedKeys.includes(col.key))
                          .map((col) => (
                            <button
                              key={col.key}
                              type="button"
                              onClick={() => {
                                setPickerOpen(false);
                                setAddedKeys((prev) => (prev.includes(col.key) ? prev : [...prev, col.key]));
                              }}
                            >
                              {col.label}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
                {activeCount > 0 && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={clearAll}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeCount > 0 && (
          <div className="drilldown-chips">
            {findText.trim() && (
              <button type="button" className="filter-chip" onClick={() => setFindText('')}>
                Find: {findText.trim()}
                <X size={12} />
              </button>
            )}
            {Object.entries(colFilters).filter(([, v]) => String(v || '').trim()).map(([key, val]) => {
              const label = data.columns.find((c) => c.key === key)?.label || key;
              return (
                <button
                  key={key}
                  type="button"
                  className="filter-chip"
                  onClick={() => {
                    setFilter(key, '');
                    setAddedKeys((prev) => prev.filter((k) => k !== key));
                  }}
                >
                  {label}: {val}
                  <X size={12} />
                </button>
              );
            })}
          </div>
        )}

        <div className="drilldown-body">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {(data.columns || []).map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={data.columns?.length || 1} style={{ textAlign: 'center', padding: '40px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--muted)' }}>
                        <Loader2 className="animate-spin" size={20} style={{ color: 'var(--primary)' }} />
                        Loading data...
                      </div>
                    </td>
                  </tr>
                ) : visibleRows.length > 0 ? (
                  visibleRows.map((row, idx) => (
                    <tr key={idx}>
                      {data.columns.map((col) => (
                        <td key={col.key}>
                          {row[col.key] != null && row[col.key] !== '' ? String(row[col.key]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={data.columns?.length || 1} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                      No rows match these filters on this page.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="drilldown-footer">
          <div id="modal-pagination">
            {(() => {
              const pageSize = Number(data.per_page) || 50;
              const pages = Math.max(1, Math.ceil((data.total || 0) / pageSize));
              return (
                <>
                  <button disabled={page === 1 || loading} onClick={() => setPage((p) => p - 1)} className="btn btn-sm btn-ghost">
                    Previous
                  </button>
                  <span className="page-info">Page {page} of {pages}</span>
                  <button disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)} className="btn btn-sm btn-ghost">
                    Next
                  </button>
                </>
              );
            })()}
          </div>
          <button
            disabled={!visibleRows.length || loading}
            className="btn btn-sm btn-primary"
            onClick={() => {
              const headers = data.columns.map((c) => c.label).join(',');
              const rows = visibleRows.map((r) => data.columns.map((c) => `"${r[c.key] != null ? String(r[c.key]).replace(/"/g, '""') : ''}"`).join(',')).join('\n');
              const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv;charset=utf-8;' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.csv`;
              a.click();
            }}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}
