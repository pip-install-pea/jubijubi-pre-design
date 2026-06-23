'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Download, Loader2 } from 'lucide-react';

const DrilldownModal = ({ isOpen, onClose, title, apiUrl, params }) => {
  const [data, setData] = useState({ columns: [], rows: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchVal, setSearchVal] = useState('');

  const paramsStr = JSON.stringify(params);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const parsedParams = paramsStr ? JSON.parse(paramsStr) : {};
      const res = await axios.get(apiUrl, {
        params: { ...parsedParams, page, per_page: 50, q: searchTerm }
      });
      setData(res.data || { columns: [], rows: [], total: 0 });
    } catch (err) {
      console.error('Drilldown fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, paramsStr, page, searchTerm]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    } else {
      // Reset state when closed
      setPage(1);
      setSearchTerm('');
      setSearchVal('');
      setData({ columns: [], rows: [], total: 0 });
    }
  }, [isOpen, fetchData]);

  if (!isOpen) return null;

  return (
    <div 
      id="drilldown-modal" 
      onClick={(e) => { if (e.target.id === 'drilldown-modal') onClose(); }}
    >
      <div className="drilldown-box" style={{ maxWidth: '1000px', width: '100%' }}>
        {/* Header */}
        <div className="drilldown-header">
          <div>
            <h3 className="drilldown-title">{title}</h3>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
              {loading ? 'Searching...' : `${data.total || 0} records found`}
            </span>
          </div>
          
          <div className="drilldown-header-actions">
            {/* Search Input Box */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search 
                style={{ 
                  position: 'absolute', 
                  left: '10px', 
                  color: 'var(--muted)', 
                  pointerEvents: 'none' 
                }} 
                size={16} 
              />
              <input 
                type="text" 
                placeholder="Search... (Press Enter)" 
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (searchTerm === searchVal) {
                      fetchData();
                    } else {
                      setPage(1);
                      setSearchTerm(searchVal);
                    }
                  }
                }}
                className="input-cell"
                style={{ 
                  paddingLeft: '32px', 
                  fontSize: '13px', 
                  width: '240px',
                  height: '34px',
                  backgroundColor: 'var(--surface2)',
                  borderColor: 'var(--border)'
                }}
              />
            </div>
            
            <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="drilldown-body">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {data.columns && data.columns.map((col) => (
                    <th key={col.key}>
                      {col.label}
                    </th>
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
                ) : data.rows && data.rows.length > 0 ? (
                  data.rows.map((row, idx) => (
                    <tr key={idx}>
                      {data.columns.map((col) => (
                        <td key={col.key}>
                          {row[col.key] !== null && row[col.key] !== undefined ? String(row[col.key]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={data.columns?.length || 1} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)', fontStyle: 'italic' }}>
                      No records found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="drilldown-footer">
          {/* Pagination */}
          <div id="modal-pagination">
            <button 
              disabled={page === 1 || loading}
              onClick={() => setPage(p => p - 1)}
              className="btn btn-sm btn-ghost"
            >
              Previous
            </button>
            <span className="page-info">
              Page {page} of {Math.ceil((data.total || 0) / 50) || 1}
            </span>
            <button 
              disabled={page * 50 >= (data.total || 0) || loading}
              onClick={() => setPage(p => p + 1)}
              className="btn btn-sm btn-ghost"
            >
              Next
            </button>
          </div>

          <button 
            disabled={!data.rows || data.rows.length === 0 || loading}
            className="btn btn-sm btn-primary"
            onClick={() => {
              if (!data.rows || !data.columns) return;
              const headers = data.columns.map(c => c.label).join(',');
              const rows = data.rows.map(r => data.columns.map(c => `"${r[c.key] !== null && r[c.key] !== undefined ? String(r[c.key]).replace(/"/g, '""') : ''}"`).join(',')).join('\n');
              const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv;charset=utf-8;' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${title.toLowerCase().replace(/\s+/g, '_')}_${new Date().getTime()}.csv`;
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
};

export default DrilldownModal;
