'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkUser = React.useCallback(async () => {
    try {
      const response = await axios.get('/api/auth/me');
      setUser(response.data.user);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  const login = async (identifier, password) => {
    try {
      const response = await axios.post('/api/auth/login', { identifier, password });
      setUser(response.data.user);
      return { success: true };
    } catch (error) {
      const payload = error.response?.data || {};
      const extra = payload.db?.target
        ? ` Tried ${payload.db.target}.`
        : (payload.db?.reason ? ` ${payload.db.reason}` : '');
      return { success: false, error: `${payload.error || 'Login failed'}${extra}` };
    }
  };

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout');
      setUser(null);
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
