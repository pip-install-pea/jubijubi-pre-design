'use client';

import React from 'react';

const DataModal = ({ isOpen, onClose, title, data, columns }) => {
  if (!isOpen) return null;

  return (
    <div 
      id="drilldown-modal" 
      className="modal-overlay" 
      onClick={(e) => { if (e.target.id === 'drilldown-modal') onClose(); }}
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
      <div className="drilldown-box" style={{ maxWidth: '1000px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="drilldown-header">
          <h3 className="drilldown-title">{title}</h3>
          <div className="drilldown-header-actions">
            <button 
              className="btn btn-sm btn-ghost" 
              onClick={() => {
                const headers = columns.map(c => c.header).join(',');
                const rows = data.map(r => columns.map(c => `"${r[c.key] || ''}"`).join(',')).join('\n');
                const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `drilldown_${new Date().getTime()}.csv`;
                a.click();
              }}
            >
              ↓ CSV
            </button>
            <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        
        <div className="drilldown-body" style={{ flex: 1, overflow: 'auto', padding: 0 }}>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((col, i) => (
                    <th key={i}>{col.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length > 0 ? data.map((row, i) => (
                  <tr key={i}>
                    {columns.map((col, j) => (
                      <td key={j}>{row[col.key] || '—'}</td>
                    ))}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={columns.length} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontStyle: 'italic' }}>
                      No records found for this selection
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="drilldown-footer">
          <span>{data.length} records found</span>
        </div>
      </div>
    </div>
  );
};

export default DataModal;
