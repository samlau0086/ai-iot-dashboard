import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle2, Database, Plus, Send, Settings as SettingsIcon, Trash2, UserCheck, UserX, Users, Wifi } from 'lucide-react';
import { useAppStore, type NotificationChannel } from '../lib/store';
import { translations } from '../lib/i18n';
import { cn } from '../lib/utils';

const CHANNEL_TYPES: NotificationChannel['type'][] = ['email', 'webhook', 'bark', 'sms', 'telegram', 'slack'];
const USER_ROLES = ['Owner', 'Admin', 'Engineer', 'Operator', 'Viewer', 'Partner', 'Customer'];

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function Settings() {
  const {
    language,
    notificationChannels,
    addNotificationChannel,
    updateNotificationChannel,
    deleteNotificationChannel,
    testNotificationChannel,
    users,
    addUser,
    updateUser,
    deleteUser,
    approveUser,
    rejectUser,
    currentUser,
    deviceDataSettingsByUser,
    updateDeviceDataSettings,
  } = useAppStore();
  const t = translations[language];
  const [activeTab, setActiveTab] = useState<'general' | 'data' | 'notifications' | 'users'>('general');
  const currentDataSettings = currentUser ? deviceDataSettingsByUser[currentUser.id] : undefined;
  const [dataDraft, setDataDraft] = useState({
    apiUrl: '',
    apiToken: '',
    apiPollMs: 10000,
    mqttWsUrl: '',
    mqttEnabled: false,
  });
  const [dataSaveMessage, setDataSaveMessage] = useState('');
  const [mqttTestMessage, setMqttTestMessage] = useState('');
  const [channelDraft, setChannelDraft] = useState({
    type: 'email' as NotificationChannel['type'],
    name: '',
    target: '',
  });
  const [userDraft, setUserDraft] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Operator',
    siteId: 'factory-a',
  });

  const tabs = [
    { id: 'general', name: t.settings.tabs.general, icon: SettingsIcon },
    { id: 'data', name: 'Data Sources', icon: Database },
    { id: 'notifications', name: t.settings.tabs.notifications, icon: Bell },
    { id: 'users', name: t.settings.tabs.users, icon: Users },
  ];

  useEffect(() => {
    setDataDraft({
      apiUrl: currentDataSettings?.apiUrl || '',
      apiToken: currentDataSettings?.apiToken || '',
      apiPollMs: currentDataSettings?.apiPollMs || 10000,
      mqttWsUrl: currentDataSettings?.mqttWsUrl || '',
      mqttEnabled: currentDataSettings?.mqttEnabled || false,
    });
    setDataSaveMessage('');
    setMqttTestMessage('');
  }, [currentDataSettings, currentUser?.id]);

  const handleAddChannel = () => {
    if (!channelDraft.target.trim()) return;

    addNotificationChannel({
      id: newId('channel'),
      type: channelDraft.type,
      name: channelDraft.name.trim() || `${channelDraft.type.toUpperCase()} Channel`,
      target: channelDraft.target.trim(),
      enabled: true,
    });
    setChannelDraft({ type: 'email', name: '', target: '' });
  };

  const handleAddUser = () => {
    if (!userDraft.name.trim() || !userDraft.email.trim() || !userDraft.password.trim()) return;

    addUser({
      id: newId('user'),
      name: userDraft.name.trim(),
      email: userDraft.email.trim().toLowerCase(),
      password: userDraft.password,
      role: userDraft.role,
      siteId: userDraft.siteId.trim() || 'factory-a',
      status: 'approved',
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
    });
    setUserDraft({ name: '', email: '', password: '', role: 'Operator', siteId: 'factory-a' });
  };

  const handleSaveDataSettings = () => {
    if (!currentUser) return;

    updateDeviceDataSettings(currentUser.id, {
      ...dataDraft,
      apiPollMs: Number.isFinite(Number(dataDraft.apiPollMs)) ? Number(dataDraft.apiPollMs) : 10000,
    });
    setDataSaveMessage('Data source settings saved for current user.');
  };

  const handleTestMqtt = () => {
    setMqttTestMessage('');
    if (!dataDraft.mqttWsUrl.trim()) {
      setMqttTestMessage('MQTT WebSocket URL is required.');
      return;
    }

    let socket: WebSocket | null = null;
    const timeoutId = window.setTimeout(() => {
      socket?.close();
      setMqttTestMessage('Connection test timed out.');
    }, 5000);

    try {
      socket = new WebSocket(dataDraft.mqttWsUrl.trim());
      socket.onopen = () => {
        window.clearTimeout(timeoutId);
        setMqttTestMessage('MQTT WebSocket bridge is reachable.');
        socket?.close();
      };
      socket.onerror = () => {
        window.clearTimeout(timeoutId);
        setMqttTestMessage('Connection failed. Check URL, TLS, firewall, and bridge service.');
      };
    } catch (error) {
      window.clearTimeout(timeoutId);
      setMqttTestMessage('Invalid WebSocket URL.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t.settings.title}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t.settings.desc}</p>
      </div>

      <div className="bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
        <div className="border-b border-slate-200 dark:border-slate-800">
          <nav className="-mb-px flex border-b border-slate-200 dark:border-slate-800" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'general' | 'data' | 'notifications' | 'users')}
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
          {activeTab === 'general' && (
            <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div className="sm:col-span-4">
                <label htmlFor="company-name" className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-300">
                  {t.settings.whiteLabel}
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="company-name"
                    id="company-name"
                    className="block w-full rounded-md border-0 bg-transparent py-2 px-3 text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-orange-500 dark:bg-slate-900/50 dark:ring-slate-700 sm:text-sm"
                    placeholder="AI IoT Dashboard"
                    defaultValue="AI IoT Dashboard"
                  />
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
                    className="block w-full rounded-md border-0 py-2 px-3 text-slate-900 dark:text-slate-300 bg-transparent dark:bg-slate-900/50 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 focus:ring-2 focus:ring-inset focus:ring-orange-500 sm:max-w-xs sm:text-sm outline-none"
                    defaultValue="CST"
                  >
                    <option value="UTC">UTC</option>
                    <option value="EST">EST</option>
                    <option value="PST">PST</option>
                    <option value="CST">CST (China Standard Time)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6 max-w-4xl">
              <div>
                <h2 className="text-base font-semibold leading-7 text-slate-900 dark:text-white">Device Data Sources</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Gateway HTTP Push is the recommended path. MQTT bridge settings are saved for the current user and take effect after saving.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-orange-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Gateway HTTP Push</h3>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Configure your gateway to POST telemetry JSON to this Dashboard endpoint. The frontend polls this local buffer automatically.
                </p>
                <div className="mt-4 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                  <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Gateway POST URL</label>
                  <code className="mt-1 block overflow-x-auto rounded bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    {`${window.location.origin}/api/telemetry`}
                  </code>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Optional server token: set <span className="font-mono">IOT_INGEST_TOKEN</span> and send it as <span className="font-mono">x-iot-token</span> or Bearer token.
                  </p>
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
                    Optional external HTTP polling fallback
                  </summary>
                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr_160px]">
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">API URL</label>
                      <input
                        value={dataDraft.apiUrl}
                        onChange={(event) => setDataDraft((current) => ({ ...current, apiUrl: event.target.value }))}
                        placeholder="https://your-api.example.com/devices"
                        className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Bearer Token</label>
                      <input
                        value={dataDraft.apiToken}
                        onChange={(event) => setDataDraft((current) => ({ ...current, apiToken: event.target.value }))}
                        placeholder="Optional"
                        type="password"
                        className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Poll ms</label>
                      <input
                        value={dataDraft.apiPollMs}
                        onChange={(event) => setDataDraft((current) => ({ ...current, apiPollMs: Number(event.target.value) }))}
                        type="number"
                        min={1000}
                        step={1000}
                        className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                      />
                    </div>
                  </div>
                </details>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-5 w-5 text-sky-500" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">MQTT WebSocket Bridge</h3>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={dataDraft.mqttEnabled}
                      onChange={(event) => setDataDraft((current) => ({ ...current, mqttEnabled: event.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    />
                    Enabled
                  </label>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  This is not an MQTT Broker. It should point to your external MQTT WebSocket bridge that sends JSON telemetry messages to the browser.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
                  <input
                    value={dataDraft.mqttWsUrl}
                    onChange={(event) => setDataDraft((current) => ({ ...current, mqttWsUrl: event.target.value }))}
                    placeholder="wss://your-domain.com/iot/telemetry"
                    className="block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                  />
                  <button
                    type="button"
                    onClick={handleTestMqtt}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Send className="h-4 w-4" />
                    Test MQTT
                  </button>
                </div>
                {mqttTestMessage && (
                  <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    {mqttTestMessage}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveDataSettings}
                  className="rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 border border-orange-500"
                >
                  Save Data Source Settings
                </button>
                {dataSaveMessage && (
                  <span className="text-sm text-emerald-600 dark:text-emerald-400">{dataSaveMessage}</span>
                )}
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold leading-7 text-slate-900 dark:text-white">{t.settings.notifications}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Same channel type can be added multiple times, for example several emails, webhooks, or Bark endpoints.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30 lg:grid-cols-[150px_1fr_1.5fr_auto]">
                <select
                  value={channelDraft.type}
                  onChange={(event) => setChannelDraft((current) => ({ ...current, type: event.target.value as NotificationChannel['type'] }))}
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                >
                  {CHANNEL_TYPES.map((type) => (
                    <option key={type} value={type}>{type.toUpperCase()}</option>
                  ))}
                </select>
                <input
                  value={channelDraft.name}
                  onChange={(event) => setChannelDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Channel name"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <input
                  value={channelDraft.target}
                  onChange={(event) => setChannelDraft((current) => ({ ...current, target: event.target.value }))}
                  placeholder="Email, webhook URL, Bark URL, phone, bot target..."
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <button
                  type="button"
                  onClick={handleAddChannel}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Channel</th>
                      <th className="px-4 py-3 font-semibold">Target</th>
                      <th className="px-4 py-3 font-semibold">Enabled</th>
                      <th className="px-4 py-3 font-semibold">Test</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-[#1c2128]">
                    {notificationChannels.map((channel) => (
                      <tr key={channel.id}>
                        <td className="px-4 py-3 align-top">
                          <input
                            value={channel.name}
                            onChange={(event) => updateNotificationChannel(channel.id, { name: event.target.value })}
                            className="w-full rounded-md border-0 bg-transparent px-2 py-1 text-sm font-medium text-slate-900 ring-1 ring-transparent focus:ring-orange-500 dark:text-white"
                          />
                          <div className="mt-1 text-xs uppercase text-slate-500">{channel.type}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <input
                            value={channel.target}
                            onChange={(event) => updateNotificationChannel(channel.id, { target: event.target.value })}
                            className="w-full min-w-64 rounded-md border-0 bg-transparent px-2 py-1 font-mono text-xs text-slate-600 ring-1 ring-transparent focus:ring-orange-500 dark:text-slate-300"
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={channel.enabled}
                              onChange={(event) => updateNotificationChannel(channel.id, { enabled: event.target.checked })}
                              className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                            Active
                          </label>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <button
                            type="button"
                            onClick={() => testNotificationChannel(channel.id)}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Send className="h-3.5 w-3.5" />
                            Test
                          </button>
                          {channel.lastTestStatus && (
                            <div className={cn(
                              'mt-2 flex items-center gap-1 text-xs',
                              channel.lastTestStatus === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                            )}>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {channel.lastTestStatus === 'success' ? 'Test passed' : 'Target required'}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right align-top">
                          <button
                            type="button"
                            onClick={() => deleteNotificationChannel(channel.id)}
                            className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                            title="Delete channel"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {notificationChannels.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                          No notification channels configured yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold leading-7 text-slate-900 dark:text-white">User Management</h2>
                  <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Registered users must be approved here before they can log in to the backend.
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  Pending: {users.filter((user) => user.status === 'pending').length}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30 lg:grid-cols-[1fr_1.3fr_1fr_150px_130px_auto]">
                <input
                  value={userDraft.name}
                  onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Name"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <input
                  type="email"
                  value={userDraft.email}
                  onChange={(event) => setUserDraft((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Email"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <input
                  type="password"
                  value={userDraft.password}
                  onChange={(event) => setUserDraft((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Initial password"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <select
                  value={userDraft.role}
                  onChange={(event) => setUserDraft((current) => ({ ...current, role: event.target.value }))}
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                >
                  {USER_ROLES.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                <input
                  value={userDraft.siteId}
                  onChange={(event) => setUserDraft((current) => ({ ...current, siteId: event.target.value }))}
                  placeholder="factory-a"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <button
                  type="button"
                  onClick={handleAddUser}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">User</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold">Site / Tags</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-[#1c2128]">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <input
                            value={user.name}
                            onChange={(event) => updateUser(user.id, { name: event.target.value })}
                            className="block w-full rounded-md border-0 bg-transparent px-2 py-1 font-medium text-slate-900 ring-1 ring-transparent focus:ring-orange-500 dark:text-white"
                          />
                          <input
                            value={user.email}
                            onChange={(event) => updateUser(user.id, { email: event.target.value })}
                            className="mt-1 block w-full rounded-md border-0 bg-transparent px-2 py-1 text-xs text-slate-500 ring-1 ring-transparent focus:ring-orange-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
                            user.status === 'approved' && 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300',
                            user.status === 'pending' && 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300',
                            user.status === 'rejected' && 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300'
                          )}>
                            {user.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={user.role}
                            onChange={(event) => updateUser(user.id, { role: event.target.value })}
                            className="rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-300 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-700"
                          >
                            {USER_ROLES.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={user.siteId}
                            onChange={(event) => updateUser(user.id, { siteId: event.target.value })}
                            className="w-36 rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-300 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-700"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => approveUser(user.id, user.role, user.siteId)}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => rejectUser(user.id)}
                              disabled={user.id === currentUser?.id}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                            >
                              <UserX className="h-3.5 w-3.5" />
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteUser(user.id)}
                              disabled={user.id === currentUser?.id}
                              className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                              title="Delete user"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
