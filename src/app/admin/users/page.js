'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', role_id: '' });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const { user: currentUser } = useAuth();

  const fetchData = React.useCallback(async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        axios.get(`/api/admin/users?page=${page}`),
        axios.get('/api/admin/roles')
      ]);
      setUsers(usersRes.data.items);
      setTotalPages(usersRes.data.pages);
      setRoles(rolesRes.data);
    } catch (error) {
      console.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/admin/users', newUser);
      setNewUser({ username: '', email: '', password: '', role_id: '' });
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add user');
    }
  };

  const handleEditUser = async (uid, updates) => {
    try {
      await axios.patch(`/api/admin/users/${uid}`, updates);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update user');
    }
  };

  const handleResetPassword = async (uid, username) => {
    const password = window.prompt(`Enter a new password for ${username}`);
    if (!password) return;
    try {
      await axios.patch(`/api/admin/users/${uid}`, { password });
      fetchData();
      alert('Password reset successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to reset password');
    }
  };

  const handleDeleteUser = async (uid, username) => {
    if (!window.confirm(`Delete ${username}?`)) return;
    try {
      await axios.delete(`/api/admin/users/${uid}`);
      fetchData();
    } catch (error) {
      alert('Failed to delete user');
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
      <div className="spinner"></div>
      <span style={{ marginLeft: '12px', color: '#64748b' }}>Loading user intelligence...</span>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="section-header">
        <h2 className="card-title" style={{ fontSize: '24px', fontWeight: 'bold' }}>User Management</h2>
        <p className="section-sub">Manage platform access and roles</p>
      </div>

      {/* Add User Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header"><h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Add User</h3></div>
        <div className="card-body">
          <form onSubmit={handleAddUser} className="inline-form">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Username</label>
                <input 
                  className="form-control" 
                  type="text" 
                  value={newUser.username}
                  onChange={e => setNewUser({...newUser, username: e.target.value})}
                  required placeholder="username"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input 
                  className="form-control" 
                  type="email" 
                  value={newUser.email}
                  onChange={e => setNewUser({...newUser, email: e.target.value})}
                  required placeholder="user@example.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input 
                  className="form-control" 
                  type="password" 
                  value={newUser.password}
                  onChange={e => setNewUser({...newUser, password: e.target.value})}
                  required placeholder="••••••••"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select 
                  className="form-control"
                  value={newUser.role_id}
                  onChange={e => setNewUser({...newUser, role_id: e.target.value})}
                  required
                >
                  <option value="">— select —</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.name}{r.thematic ? ` (${r.thematic})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-group form-group--btn">
                <button type="submit" className="btn btn-primary">Add</button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Users Table Card */}
      <div className="card">
        <div className="card-header">
          <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Users <span className="badge">{users.length}</span></h3>
        </div>
        <div className="card-body card-body--flush">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Active</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className={u.id === currentUser?.id ? 'row-self' : ''}>
                    <td>{u.id}</td>
                    <td style={{ fontWeight: 600 }}>{u.username}</td>
                    <td style={{ color: '#64748b' }}>{u.email}</td>
                    <td><span className="badge badge--role">{u.role_name}</span></td>
                    <td>
                      {u.is_active ? (
                        <span className="badge badge--success">Active</span>
                      ) : (
                        <span className="badge badge--danger">Inactive</span>
                      )}
                    </td>
                    <td style={{ fontSize: '13px', color: '#64748b' }}>{u.created_at?.slice(0, 10) || '—'}</td>
                    <td className="actions-cell">
                      {u.id !== currentUser?.id ? (
                        <>
                          <div className="action-form" style={{ display: 'inline-flex', gap: '8px' }}>
                            <select 
                              className="form-control form-control--sm"
                              value={u.role_id}
                              onChange={e => handleEditUser(u.id, { role_id: e.target.value })}
                              style={{ width: '120px' }}
                            >
                              {roles.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </select>
                            <select 
                              className="form-control form-control--sm"
                              value={u.is_active ? "1" : "0"}
                              onChange={e => handleEditUser(u.id, { is_active: e.target.value === "1" })}
                              style={{ width: '90px' }}
                            >
                              <option value="1">Active</option>
                              <option value="0">Inactive</option>
                            </select>
                          </div>
                          <button 
                            onClick={() => handleResetPassword(u.id, u.username)}
                            className="btn btn-sm btn-secondary"
                            style={{ marginLeft: '8px' }}
                          >
                            Reset Password
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(u.id, u.username)}
                            className="btn btn-sm btn-danger"
                            style={{ marginLeft: '8px' }}
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '1rem' }}>You</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="card-footer pagination">
            <button 
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="btn btn-sm btn-ghost"
            >
              ← Prev
            </button>
            <span className="page-info">Page {page} of {totalPages}</span>
            <button 
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="btn btn-sm btn-ghost"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
