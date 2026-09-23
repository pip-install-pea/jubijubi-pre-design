'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';

export default function SyncLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const { user } = useAuth();

  const fetchLogs = React.useCallback(async () => {
    try {
      const response = await axios.get('/api/admin/sync/logs');
      setLogs(response.data);
    } catch (error) {
      console.error('Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const triggerSync = async (force = false) => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const response = await axios.post('/api/admin/sync/trigger', { force });
      setSyncMsg(response.data.message || 'Background sync started.');
      setTimeout(fetchLogs, 5000);
    } catch (error) {
      setSyncMsg('Sync trigger failed.');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
      <div className="spinner"></div>
      <span style={{ marginLeft: '12px', color: '#64748b' }}>Loading...</span>
    </div>
  );

  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div>
      {/* Header */}
      {/* Manual Sync Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header"><h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Manual Sync</h3></div>
        <div className="card-body">
          <p className="text-muted" style={{ marginBottom: '1rem', color: '#64748b' }}>
            Incremental updates new rows. Full refresh reloads the full history. Runs in the background — check the log below.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            {isSuperAdmin ? (
              <>
                <button
                  onClick={() => triggerSync(false)}
                  disabled={syncing}
                  className="btn btn-primary"
                >
                  {syncing ? 'Starting Sync...' : 'Trigger incremental sync'}
                </button>
                <button
                  onClick={() => triggerSync(true)}
                  disabled={syncing}
                  className="btn btn-secondary"
                >
                  Full restack sync
                </button>
              </>
            ) : (
              <p className="text-muted" style={{ color: '#64748b' }}>Only super_admin can trigger a manual sync.</p>
            )}
            {syncMsg && (
              <span className="text-muted" style={{ fontWeight: 600, color: '#16a34a' }}>
                {syncMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Logs Table Card */}
      <div className="card">
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Recent Sync Log <span className="badge">{logs.length}</span></h3>
        </div>
        <div className="card-body card-body--flush">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Module</th>
                  <th>Table</th>
                  <th>Fetched</th>
                  <th>Upserted</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Finished</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.length > 0 ? logs.map(log => (
                  <tr key={log.id}>
                    <td>{log.id}</td>
                    <td style={{ fontWeight: 700 }}>{log.module}</td>
                    <td><code style={{ fontSize: '12px', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{log.table_name}</code></td>
                    <td style={{ textAlign: 'center' }}>{log.records_fetched}</td>
                    <td style={{ textAlign: 'center' }}>{log.records_upserted}</td>
                    <td>
                      {log.status === 'success' ? (
                        <span className="badge badge--success">success</span>
                      ) : (
                        <span className="badge badge--danger">{log.status}</span>
                      )}
                    </td>
                    <td className="text-mono" style={{ fontSize: '12px' }}>{log.started_at || '—'}</td>
                    <td className="text-mono" style={{ fontSize: '12px' }}>{log.finished_at || '—'}</td>
                    <td style={{ maxWidth: '260px', wordBreak: 'break-word', fontSize: '12px', color: 'var(--danger)' }}>
                      {log.error_message || ''}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="9" className="text-center" style={{ padding: '40px', color: '#94a3b8', fontStyle: 'italic' }}>No sync records yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
