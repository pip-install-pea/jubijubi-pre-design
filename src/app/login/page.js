'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const result = await login(identifier, password);
    if (result.success) {
      router.push('/');
    } else {
      setError(result.error);
    }
    setIsSubmitting(false);
  };

  if (user) {
    return null; // Let the useEffect handle redirection
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo-box">
          <img src="/logo.png" alt="Jubilant Bhartia Foundation" />
        </div>

        <h1 className="login-heading">Jubilant Platform</h1>
        <p className="login-subtitle">Sign in to manage programmes and impact</p>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '20px', padding: '12px', borderRadius: '8px', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label className="auth-label" htmlFor="identifier">Email or Username</label>
            <div className="auth-input-wrapper">
              <i className="ph ph-envelope"></i>
              <input 
                className="auth-input" 
                type="text" 
                id="identifier" 
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com or username" 
                required 
                autoFocus
              />
            </div>
          </div>

          <div className="auth-form-group">
            <div className="auth-label-row">
              <label className="auth-label" htmlFor="password">Password</label>
            </div>
            <div className="auth-input-wrapper">
              <i className="ph ph-key"></i>
              <input 
                className="auth-input" 
                type="password" 
                id="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="btn-auth" 
            disabled={isSubmitting}
            style={{ width: '100%', cursor: 'pointer' }}
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
