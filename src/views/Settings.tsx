import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { Settings as SettingsIcon, Bell, Users } from 'lucide-react';
import { cn } from '../lib/utils';

export function Settings() {
  const { language, barkUrl, setBarkUrl, emailAlerts, setEmailAlerts, webhookUrl, setWebhookUrl } = useAppStore();
  const t = translations[language];
  const [activeTab, setActiveTab] = useState<'general' | 'notifications' | 'users'>('general');

  const tabs = [
    { id: 'general', name: t.settings.tabs.general, icon: SettingsIcon },
    { id: 'notifications', name: t.settings.tabs.notifications, icon: Bell },
    { id: 'users', name: t.settings.tabs.users, icon: Users },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t.settings.title}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {t.settings.desc}
        </p>
      </div>

      <div className="bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
        <div className="border-b border-slate-200 dark:border-slate-800">
          <nav className="-mb-px flex border-b border-slate-200 dark:border-slate-800" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'general' | 'notifications' | 'users')}
                className={cn(
                  activeTab === tab.id
                    ? 'border-orange-500 text-orange-600 dark:text-orange-500'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-300',
                  'group inline-flex items-center border-b-2 py-4 px-6 text-sm font-medium transition-colors cursor-pointer outline-none'
                )}
              >
                <tab.icon
                  className={cn(
                    activeTab === tab.id ? 'text-orange-600 dark:text-orange-500' : 'text-slate-400 group-hover:text-slate-500 dark:group-hover:text-slate-300',
                    '-ml-0.5 mr-2 h-4 w-4'
                  )}
                  aria-hidden="true"
                />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="px-4 py-6 sm:p-8 min-h-[400px]">
          <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
            
            {activeTab === 'general' && (
              <>
                <div className="sm:col-span-4">
                  <label htmlFor="company-name" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-300">
                    {t.settings.whiteLabel}
                  </label>
                  <div className="mt-2">
                    <div className="flex rounded shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 focus-within:ring-2 focus-within:ring-inset focus-within:ring-orange-500 sm:max-w-md bg-transparent dark:bg-slate-900/50">
                      <input
                        type="text"
                        name="company-name"
                        id="company-name"
                        className="block flex-1 border-0 bg-transparent py-1.5 pl-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-0 sm:text-sm sm:leading-6 font-mono"
                        placeholder="Acme Industrial Solutions"
                        defaultValue="Factory A Operations"
                      />
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-full">
                  <label htmlFor="timezone" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-300">
                    {t.settings.timezone}
                  </label>
                  <div className="mt-2">
                    <select
                      id="timezone"
                      name="timezone"
                      className="block w-full rounded border-0 py-1.5 text-slate-900 dark:text-slate-300 bg-transparent dark:bg-slate-900/50 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 focus:ring-2 focus:ring-inset focus:ring-orange-500 sm:max-w-xs sm:text-sm sm:leading-6 outline-none"
                      defaultValue="CST"
                    >
                      <option value="UTC">UTC (Coordinated Universal Time)</option>
                      <option value="EST">EST (Eastern Standard Time)</option>
                      <option value="PST">PST (Pacific Standard Time)</option>
                      <option value="CST">CST (China Standard Time)</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'notifications' && (
              <>
                <div className="sm:col-span-full">
                  <h2 className="text-base font-semibold leading-7 text-slate-900 dark:text-white">{t.settings.notifications}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{t.settings.notificationsDesc}</p>
                </div>

                <div className="sm:col-span-4">
                  <label htmlFor="bark-url" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-300">
                    {t.settings.barkConfig}
                  </label>
                  <div className="mt-2">
                    <div className="flex rounded shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 focus-within:ring-2 focus-within:ring-inset focus-within:ring-orange-500 sm:max-w-md bg-transparent dark:bg-slate-900/50">
                      <input
                        type="url"
                        id="bark-url"
                        value={barkUrl}
                        onChange={(e) => setBarkUrl(e.target.value)}
                        className="block flex-1 border-0 bg-transparent py-1.5 pl-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-0 sm:text-sm sm:leading-6 font-mono"
                        placeholder="https://api.day.app/your_key/"
                      />
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-4">
                  <label htmlFor="email-alerts" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-300">
                    {t.settings.emailConfig}
                  </label>
                  <div className="mt-2">
                    <div className="flex rounded shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 focus-within:ring-2 focus-within:ring-inset focus-within:ring-orange-500 sm:max-w-md bg-transparent dark:bg-slate-900/50">
                      <input
                        type="email"
                        id="email-alerts"
                        value={emailAlerts}
                        onChange={(e) => setEmailAlerts(e.target.value)}
                        className="block flex-1 border-0 bg-transparent py-1.5 pl-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-0 sm:text-sm sm:leading-6 font-mono"
                        placeholder="admin@factory.com"
                      />
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-4">
                  <label htmlFor="webhook-url" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-300">
                    {t.settings.webhookConfig}
                  </label>
                  <div className="mt-2">
                    <div className="flex rounded shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 focus-within:ring-2 focus-within:ring-inset focus-within:ring-orange-500 sm:max-w-md bg-transparent dark:bg-slate-900/50">
                      <input
                        type="url"
                        id="webhook-url"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        className="block flex-1 border-0 bg-transparent py-1.5 pl-3 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-0 sm:text-sm sm:leading-6 font-mono"
                        placeholder="https://your-domain.com/webhook"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'users' && (
              <div className="col-span-full space-y-4">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-base font-semibold leading-7 text-slate-900 dark:text-white">User Management</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">View and manage platform access.</p>
                  </div>
                  <button 
                    type="button" 
                    className="rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 border border-orange-500"
                    onClick={() => {
                        const newName = prompt('Enter new user name:');
                        if (newName) {
                           useAppStore.getState().addUser({
                               id: Math.random().toString(36).substring(7),
                               name: newName,
                               email: newName.toLowerCase().replace(' ', '') + '@factory.com',
                               role: 'Operator',
                               siteId: 'factory-a'
                           })
                        }
                    }}
                  >
                    + Add User
                  </button>
                </div>
                
                <div className="overflow-x-auto min-h-[300px]">
                  <table className="min-w-full text-left text-sm whitespace-nowrap">
                    <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-300">User Details</th>
                        <th className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-300">Role</th>
                        <th className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-300">Site Access</th>
                        <th className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-300 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#1c2128]">
                      {useAppStore.getState().users.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 dark:text-white">{user.name}</div>
                            <div className="text-slate-500">{user.email}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400"><span className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 ring-1 ring-inset ring-blue-700/10">{user.role}</span></td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{user.siteId}</td>
                          <td className="px-4 py-3 text-right">
                             <button onClick={() => {
                                 const change = prompt('Edit User Name:', user.name);
                                 if (change) useAppStore.getState().updateUser(user.id, { name: change });
                             }} className="text-orange-600 hover:text-orange-800 mr-3">Edit</button>
                             <button onClick={() => {
                                 if (confirm('Delete this user?')) useAppStore.getState().deleteUser(user.id);
                             }} className="text-red-600 hover:text-red-800">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </div>
        <div className="flex items-center justify-end gap-x-6 border-t border-slate-200 dark:border-slate-800 px-4 py-4 sm:px-8 bg-slate-50 dark:bg-slate-900/30 rounded-b-lg">
          <button type="button" className="text-sm font-semibold leading-6 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 border border-orange-500"
          >
            {t.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}
