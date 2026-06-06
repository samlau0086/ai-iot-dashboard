import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { User as UserIcon, Lock, Mail } from 'lucide-react';

export function Profile() {
  const { language, currentUser, updateCurrentUser } = useAppStore();
  const t = translations[language];
  const [formData, setFormData] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    password: currentUser?.password || '',
  });

  useEffect(() => {
    if (!currentUser) return;
    setFormData({
      name: currentUser.name,
      email: currentUser.email,
      password: currentUser.password || '',
    });
  }, [currentUser]);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((current) => ({ ...current, [e.target.name]: e.target.value }));
  };

  const handleSave = () => {
    updateCurrentUser(formData);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Profile</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Manage your personal information and security preferences.
        </p>
      </div>

      <div className="bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
        <div className="px-4 py-5 sm:p-6 space-y-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 font-medium text-xl border border-slate-200 dark:border-slate-700">
              {currentUser.name.charAt(0)}
            </div>
            <div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white">{currentUser.name}</h3>
              <p className="text-sm text-slate-500">{currentUser.role} / {currentUser.siteId}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                <UserIcon className="h-4 w-4" /> Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300 py-2 px-3"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                <Mail className="h-4 w-4" /> Email Address
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300 py-2 px-3"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                <Lock className="h-4 w-4" /> Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300 py-2 px-3"
              />
            </div>
          </div>
        </div>
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 sm:px-6 flex justify-end rounded-b-lg border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={handleSave}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none"
          >
            {t.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}
