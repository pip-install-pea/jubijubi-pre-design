'use client';

import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, User as UserIcon, Bell } from 'lucide-react';

const Navbar = () => {
  const { user, logout } = useAuth();

  return (
    <nav className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-slate-800">Jubilant Platform</h1>
      </div>
      
      <div className="flex items-center gap-6">
        <button className="text-slate-500 hover:text-slate-700 transition-colors">
          <Bell size={20} />
        </button>
        
        <div className="flex items-center gap-3 border-l pl-6 border-slate-200">
          <div className="text-right">
            <p className="text-sm font-medium text-slate-900">{user?.username}</p>
            <p className="text-xs text-slate-500 capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 border border-slate-200">
            <UserIcon size={20} />
          </div>
          <button 
            onClick={logout}
            className="ml-2 text-slate-400 hover:text-red-500 transition-colors"
            title="Logout"
            style={{ cursor: 'pointer' }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
