import React, { useEffect, useState } from 'react';
import { Bell, Building2, CheckCircle2, Copy, Database, KeyRound, Plus, Send, Settings as SettingsIcon, Trash2, UserCheck, UserX, Users, Wifi } from 'lucide-react';
import { useAppStore, type NotificationChannel, type SiteTenant } from '../lib/store';
import { translations } from '../lib/i18n';
import { cn } from '../lib/utils';

const CHANNEL_TYPES: NotificationChannel['type'][] = ['email', 'webhook', 'bark', 'sms', 'telegram', 'slack'];
const USER_ROLES = ['Owner', 'Admin', 'Engineer', 'Operator', 'Viewer', 'Demo', 'Partner', 'Customer'];
const SITE_TYPES: SiteTenant['type'][] = ['factory', 'solar', 'cold_storage', 'pump_station', 'compressed_air', 'other'];

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const DEFAULT_NOTIFICATION_CONFIG: Record<NotificationChannel['type'], Record<string, string>> = {
  email: { recipients: '', subjectPrefix: '[IoT Alert]' },
  webhook: { url: '', method: 'POST', secretHeader: '' },
  bark: { serverUrl: 'https://api.day.app', deviceKey: '' },
  sms: { provider: 'custom', phoneNumber: '', templateId: '' },
  telegram: { botToken: '', chatId: '' },
  slack: { webhookUrl: '', channel: '', username: 'AI IoT Dashboard' },
};

const NOTIFICATION_FIELDS: Record<NotificationChannel['type'], { key: string; label: string; placeholder: string; secret?: boolean }[]> = {
  email: [
    { key: 'recipients', label: 'Recipients', placeholder: 'ops@example.com, manager@example.com' },
    { key: 'subjectPrefix', label: 'Subject Prefix', placeholder: '[IoT Alert]' },
  ],
  webhook: [
    { key: 'url', label: 'Webhook URL', placeholder: 'https://example.com/iot-alerts' },
    { key: 'method', label: 'Method', placeholder: 'POST' },
    { key: 'secretHeader', label: 'Secret Header', placeholder: 'x-alert-secret: ********', secret: true },
  ],
  bark: [
    { key: 'serverUrl', label: 'Bark Server', placeholder: 'https://api.day.app' },
    { key: 'deviceKey', label: 'Device Key', placeholder: 'Bark device key', secret: true },
  ],
  sms: [
    { key: 'provider', label: 'Provider', placeholder: 'twilio / aliyun / custom' },
    { key: 'phoneNumber', label: 'Phone Number', placeholder: '+1 555 0100' },
    { key: 'templateId', label: 'Template ID', placeholder: 'Optional provider template' },
  ],
  telegram: [
    { key: 'botToken', label: 'Bot Token', placeholder: '123456:ABC...', secret: true },
    { key: 'chatId', label: 'Chat ID', placeholder: '-1001234567890' },
  ],
  slack: [
    { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/services/...' },
    { key: 'channel', label: 'Channel', placeholder: '#factory-alerts' },
    { key: 'username', label: 'Bot Name', placeholder: 'AI IoT Dashboard' },
  ],
};

const notificationTargetFromConfig = (type: NotificationChannel['type'], config: Record<string, string>) => {
  switch (type) {
    case 'email': return config.recipients || '';
    case 'webhook': return config.url || '';
    case 'bark': return config.deviceKey || '';
    case 'sms': return config.phoneNumber || '';
    case 'telegram': return config.chatId || '';
    case 'slack': return config.webhookUrl || config.channel || '';
    default: return '';
  }
};

const notificationConfigFromChannel = (channel: NotificationChannel) => {
  const config = { ...DEFAULT_NOTIFICATION_CONFIG[channel.type], ...(channel.config || {}) };
  if (!channel.config && channel.target) {
    switch (channel.type) {
      case 'email':
        config.recipients = channel.target;
        break;
      case 'webhook':
        config.url = channel.target;
        break;
      case 'bark':
        config.deviceKey = channel.target;
        break;
      case 'sms':
        config.phoneNumber = channel.target;
        break;
      case 'telegram':
        config.chatId = channel.target;
        break;
      case 'slack':
        config.webhookUrl = channel.target;
        break;
    }
  }

  return config;
};

type HttpPushChannel = {
  id: string;
  name: string;
  enabled: boolean;
  token: string;
};

type MqttChannel = {
  id: string;
  name: string;
  enabled: boolean;
  brokerUrl: string;
  username: string;
  password?: string;
  topics: string[] | string;
};

type MqttStatus = {
  state: string;
  message: string;
  connectedAt?: string | null;
  lastMessageAt?: string | null;
  lastTopic?: string | null;
  receivedCount?: number;
  acceptedCount?: number;
  rejectedCount?: number;
};

type IngestToken = {
  id: string;
  name: string;
  token: string;
  ownerUserId: string;
  ownerName: string;
  createdAt: string;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
  lastUsedSource?: string | null;
};

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
    sites,
    addSite,
    updateSite,
    deleteSite,
  } = useAppStore();
  const t = translations[language];
  const isDemoUser = currentUser?.role === 'Demo';
  const [activeTab, setActiveTab] = useState<'general' | 'sites' | 'data' | 'tokens' | 'notifications' | 'users'>('general');
  const [httpPushChannels, setHttpPushChannels] = useState<HttpPushChannel[]>([]);
  const [mqttChannels, setMqttChannels] = useState<MqttChannel[]>([]);
  const [mqttStatuses, setMqttStatuses] = useState<Record<string, MqttStatus>>({});
  const [mqttObservedTopics, setMqttObservedTopics] = useState<Record<string, string[]>>({});
  const [mqttTopicDrafts, setMqttTopicDrafts] = useState<Record<string, string>>({});
  const [dataSourceMessage, setDataSourceMessage] = useState('');
  const [ingestTokens, setIngestTokens] = useState<IngestToken[]>([]);
  const [tokenDraftName, setTokenDraftName] = useState('Device Gateway Token');
  const [tokenMessage, setTokenMessage] = useState('');
  const [channelDraft, setChannelDraft] = useState({
    type: 'email' as NotificationChannel['type'],
    name: '',
    config: { ...DEFAULT_NOTIFICATION_CONFIG.email },
  });
  const [userDraft, setUserDraft] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Operator',
    siteId: 'factory-a',
  });
  const [siteDraft, setSiteDraft] = useState({
    id: '',
    name: '',
    tenantId: 'default-tenant',
    tenantName: 'Default Tenant',
    type: 'factory' as SiteTenant['type'],
    tags: 'factory-a',
    location: '',
    timezone: 'Asia/Shanghai',
  });

  const tabs = [
    { id: 'general', name: t.settings.tabs.general, icon: SettingsIcon },
    { id: 'sites', name: 'Sites', icon: Building2 },
    { id: 'data', name: 'Data Sources', icon: Database },
    { id: 'tokens', name: 'Ingest Tokens', icon: KeyRound },
    { id: 'notifications', name: t.settings.tabs.notifications, icon: Bell },
    { id: 'users', name: t.settings.tabs.users, icon: Users },
  ];

  const mqttChannelIds = mqttChannels.map((channel) => channel.id).join('|');
  const normalizeTopics = (topics: MqttChannel['topics']) => Array.isArray(topics)
    ? topics.map((topic) => topic.trim()).filter(Boolean)
    : topics.split(',').map((topic) => topic.trim()).filter(Boolean);

  useEffect(() => {
    const loadDataSources = async () => {
      try {
        const response = await fetch('/api/data-sources');
        if (!response.ok) return;
        const payload = await response.json();
        setHttpPushChannels(Array.isArray(payload.httpPushChannels) ? payload.httpPushChannels : []);
        setMqttChannels(Array.isArray(payload.mqttChannels)
          ? payload.mqttChannels.map((channel: MqttChannel) => ({
              ...channel,
              password: '',
              topics: normalizeTopics(channel.topics || []),
            }))
          : []);
        setMqttStatuses(payload.mqttStatuses || {});
        setMqttObservedTopics(payload.mqttObservedTopics || {});
      } catch (error) {
        setDataSourceMessage('Failed to load device data source config.');
      }
    };

    const loadIngestTokens = async () => {
      try {
        const response = await fetch('/api/ingest-tokens');
        if (!response.ok) return;
        const payload = await response.json();
        setIngestTokens(Array.isArray(payload.tokens) ? payload.tokens : []);
      } catch (error) {
        setTokenMessage('Failed to load ingest tokens.');
      }
    };

    loadDataSources();
    loadIngestTokens();
  }, []);

  useEffect(() => {
    if (activeTab !== 'data' || mqttChannelIds.length === 0) return;

    let cancelled = false;
    const refreshMqttStatuses = async () => {
      try {
        const response = await fetch('/api/data-sources');
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        if (!cancelled) {
          setMqttStatuses(payload.mqttStatuses || {});
          setMqttObservedTopics(payload.mqttObservedTopics || {});
        }
      } catch {
        // Keep the last visible status if the backend is briefly unavailable.
      }
    };

    refreshMqttStatuses();
    const intervalId = window.setInterval(refreshMqttStatuses, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeTab, mqttChannelIds]);

  const handleAddChannel = () => {
    const target = notificationTargetFromConfig(channelDraft.type, channelDraft.config);
    if (!target.trim()) return;

    addNotificationChannel({
      id: newId('channel'),
      type: channelDraft.type,
      name: channelDraft.name.trim() || `${channelDraft.type.toUpperCase()} Channel`,
      target: target.trim(),
      config: channelDraft.config,
      enabled: true,
    });
    setChannelDraft({ type: 'email', name: '', config: { ...DEFAULT_NOTIFICATION_CONFIG.email } });
  };

  const handleAddUser = () => {
    if (!userDraft.name.trim() || !userDraft.email.trim() || !userDraft.password.trim()) return;

    addUser({
      id: newId('user'),
      name: userDraft.name.trim(),
      email: userDraft.email.trim().toLowerCase(),
      password: userDraft.password,
      role: userDraft.role,
      siteId: userDraft.siteId.trim() || sites[0]?.id || 'factory-a',
      status: 'approved',
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
    });
    setUserDraft({ name: '', email: '', password: '', role: 'Operator', siteId: sites[0]?.id || 'factory-a' });
  };

  const handleAddSite = () => {
    const id = siteDraft.id.trim() || siteDraft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id || !siteDraft.name.trim()) return;

    addSite({
      id,
      name: siteDraft.name.trim(),
      tenantId: siteDraft.tenantId.trim() || 'default-tenant',
      tenantName: siteDraft.tenantName.trim() || siteDraft.tenantId.trim() || 'Default Tenant',
      type: siteDraft.type,
      tags: siteDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      location: siteDraft.location.trim(),
      timezone: siteDraft.timezone.trim() || 'Asia/Shanghai',
      status: 'active',
      createdAt: new Date().toISOString(),
    });
    setSiteDraft({
      id: '',
      name: '',
      tenantId: 'default-tenant',
      tenantName: 'Default Tenant',
      type: 'factory',
      tags: '',
      location: '',
      timezone: 'Asia/Shanghai',
    });
  };

  const handleAddHttpPushChannel = () => {
    setHttpPushChannels((current) => [
      ...current,
      {
        id: newId('http'),
        name: `HTTP Push ${current.length + 1}`,
        enabled: true,
        token: Math.random().toString(36).slice(2, 12),
      },
    ]);
  };

  const handleAddMqttChannel = () => {
    setMqttChannels((current) => [
      ...current,
      {
        id: newId('mqtt'),
        name: `MQTT Broker ${current.length + 1}`,
        enabled: false,
        brokerUrl: 'mqtt://broker.example.com:1883',
        username: '',
        password: '',
        topics: 'devices/+/telemetry',
      },
    ]);
  };

  const updateMqttTopics = (channelId: string, topics: string[]) => {
    const uniqueTopics = Array.from(new Set(topics.map((topic) => topic.trim()).filter(Boolean)));
    setMqttChannels((current) => current.map((item) => (
      item.id === channelId ? { ...item, topics: uniqueTopics } : item
    )));
  };

  const addMqttTopic = (channelId: string, topic: string) => {
    const nextTopic = topic.trim();
    if (!nextTopic) return;
    const channel = mqttChannels.find((item) => item.id === channelId);
    if (!channel) return;
    updateMqttTopics(channelId, [...normalizeTopics(channel.topics), nextTopic]);
    setMqttTopicDrafts((current) => ({ ...current, [channelId]: '' }));
  };

  const removeMqttTopic = (channelId: string, topic: string) => {
    const channel = mqttChannels.find((item) => item.id === channelId);
    if (!channel) return;
    updateMqttTopics(channelId, normalizeTopics(channel.topics).filter((item) => item !== topic));
  };

  const handleSaveDataSources = async () => {
    setDataSourceMessage('');
    if (isDemoUser) {
      setDataSourceMessage('Demo account changes are local only and will not be saved to backend data sources.');
      return;
    }

    const channelsToSave = mqttChannels.map((channel) => ({
      ...channel,
      topics: normalizeTopics([
        ...normalizeTopics(channel.topics),
        mqttTopicDrafts[channel.id] || '',
      ]),
    }));

    const invalidMqtt = channelsToSave.find((channel) => {
      const topics = normalizeTopics(channel.topics);
      return channel.enabled && (!channel.brokerUrl.trim() || topics.length === 0);
    });
    if (invalidMqtt) {
      setDataSourceMessage(`${invalidMqtt.name} requires broker URL and at least one topic.`);
      return;
    }

    try {
      const response = await fetch('/api/data-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          httpPushChannels,
          mqttChannels: channelsToSave.map((channel) => ({
            ...channel,
            topics: normalizeTopics(channel.topics),
          })),
        }),
      });
      const payload = await response.json();
      if (response.ok) {
        setHttpPushChannels(Array.isArray(payload.httpPushChannels) ? payload.httpPushChannels : httpPushChannels);
        setMqttChannels(Array.isArray(payload.mqttChannels)
          ? payload.mqttChannels.map((channel: MqttChannel) => ({
              ...channel,
              password: '',
              topics: normalizeTopics(channel.topics || []),
            }))
          : mqttChannels);
        setMqttStatuses(payload.mqttStatuses || {});
        setMqttObservedTopics(payload.mqttObservedTopics || {});
      }
      setDataSourceMessage(response.ok ? 'Device data source channels saved.' : 'Failed to save device data source channels.');
    } catch (error) {
      setDataSourceMessage('Failed to save device data source channels.');
    }
  };

  const handleGenerateToken = async () => {
    setTokenMessage('');
    if (isDemoUser) {
      setTokenMessage('Demo account cannot generate backend ingest tokens.');
      return;
    }

    try {
      const response = await fetch('/api/ingest-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tokenDraftName.trim() || 'Device Gateway Token',
          ownerUserId: currentUser?.id,
          ownerName: currentUser?.name,
        }),
      });
      const payload = await response.json();
      if (response.ok) {
        setIngestTokens(Array.isArray(payload.tokens) ? payload.tokens : []);
        setTokenDraftName('Device Gateway Token');
      }
      setTokenMessage(response.ok ? 'Token generated. Copy it into your gateway request header.' : 'Failed to generate token.');
    } catch (error) {
      setTokenMessage('Failed to generate token.');
    }
  };

  const handleRevokeToken = async (tokenId: string) => {
    setTokenMessage('');
    if (isDemoUser) {
      setTokenMessage('Demo account cannot revoke backend ingest tokens.');
      return;
    }

    try {
      const response = await fetch(`/api/ingest-tokens/${encodeURIComponent(tokenId)}/revoke`, {
        method: 'POST',
      });
      const payload = await response.json();
      if (response.ok) {
        setIngestTokens(Array.isArray(payload.tokens) ? payload.tokens : []);
      }
      setTokenMessage(response.ok ? 'Token revoked.' : 'Failed to revoke token.');
    } catch (error) {
      setTokenMessage('Failed to revoke token.');
    }
  };

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setTokenMessage('Token copied.');
    } catch (error) {
      setTokenMessage('Copy failed. Select the token text and copy it manually.');
    }
  };

  const renderNotificationConfigFields = (
    type: NotificationChannel['type'],
    config: Record<string, string>,
    onChange: (key: string, value: string) => void
  ) => (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {NOTIFICATION_FIELDS[type].map((field) => (
        <div key={field.key}>
          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">{field.label}</label>
          <input
            type={field.secret ? 'password' : 'text'}
            value={config[field.key] || ''}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder={field.placeholder}
            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
          />
        </div>
      ))}
    </div>
  );

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
                onClick={() => setActiveTab(tab.id as 'general' | 'sites' | 'data' | 'tokens' | 'notifications' | 'users')}
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

          {activeTab === 'sites' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold leading-7 text-slate-900 dark:text-white">Site / Tenant Management</h2>
                  <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Model tenants and physical sites, then bind users and devices to a site for data isolation and dashboard scoping.
                  </p>
                </div>
                <div className="text-xs text-slate-500">Sites: {sites.length}</div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30 lg:grid-cols-[1fr_1fr_1fr_150px_1fr_1fr_auto]">
                <input
                  value={siteDraft.name}
                  onChange={(event) => setSiteDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Site name"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <input
                  value={siteDraft.id}
                  onChange={(event) => setSiteDraft((current) => ({ ...current, id: event.target.value }))}
                  placeholder="site-id"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <input
                  value={siteDraft.tenantName}
                  onChange={(event) => setSiteDraft((current) => ({ ...current, tenantName: event.target.value }))}
                  placeholder="Tenant name"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <select
                  value={siteDraft.type}
                  onChange={(event) => setSiteDraft((current) => ({ ...current, type: event.target.value as SiteTenant['type'] }))}
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                >
                  {SITE_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <input
                  value={siteDraft.tags}
                  onChange={(event) => setSiteDraft((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="tags, comma separated"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <input
                  value={siteDraft.location}
                  onChange={(event) => setSiteDraft((current) => ({ ...current, location: event.target.value }))}
                  placeholder="Location"
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                />
                <button
                  type="button"
                  onClick={handleAddSite}
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
                      <th className="px-4 py-3 font-semibold">Site</th>
                      <th className="px-4 py-3 font-semibold">Tenant</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Tags</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-[#1c2128]">
                    {sites.map((site) => (
                      <tr key={site.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <input
                            value={site.name}
                            onChange={(event) => updateSite(site.id, { name: event.target.value })}
                            className="block w-44 rounded-md border-0 bg-transparent px-2 py-1 font-medium text-slate-900 ring-1 ring-transparent focus:ring-orange-500 dark:text-white"
                          />
                          <input
                            value={site.id}
                            onChange={(event) => updateSite(site.id, { id: event.target.value })}
                            className="mt-1 block w-44 rounded-md border-0 bg-transparent px-2 py-1 font-mono text-xs text-slate-500 ring-1 ring-transparent focus:ring-orange-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={site.tenantName}
                            onChange={(event) => updateSite(site.id, { tenantName: event.target.value })}
                            className="block w-44 rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-transparent focus:ring-orange-500 dark:text-slate-300"
                          />
                          <input
                            value={site.tenantId}
                            onChange={(event) => updateSite(site.id, { tenantId: event.target.value })}
                            className="mt-1 block w-44 rounded-md border-0 bg-transparent px-2 py-1 font-mono text-xs text-slate-500 ring-1 ring-transparent focus:ring-orange-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={site.type}
                            onChange={(event) => updateSite(site.id, { type: event.target.value as SiteTenant['type'] })}
                            className="rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-300 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-700"
                          >
                            {SITE_TYPES.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={site.tags.join(', ')}
                            onChange={(event) => updateSite(site.id, { tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })}
                            className="w-56 rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-300 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-700"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={site.status}
                            onChange={(event) => updateSite(site.id, { status: event.target.value as SiteTenant['status'] })}
                            className="rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-300 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-700"
                          >
                            <option value="active">active</option>
                            <option value="inactive">inactive</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => deleteSite(site.id)}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                            title="Delete site"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6 max-w-4xl">
              <div>
                <h2 className="text-base font-semibold leading-7 text-slate-900 dark:text-white">Device Data Sources</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  The same data source type can have multiple channels. Each channel writes into the same telemetry store and can be mapped to devices by External Device ID.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-orange-500" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Gateway HTTP Push Channels</h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddHttpPushChannel}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    Add HTTP Channel
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Use separate endpoints for different gateways, factories, or customer sites. The token is embedded in the URL and can also be rotated here.
                </p>
                <div className="mt-4 space-y-3">
                  {httpPushChannels.map((channel) => (
                    <div key={channel.id} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_auto]">
                        <div>
                          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Channel Name</label>
                          <input
                            value={channel.name}
                            onChange={(event) => setHttpPushChannels((current) => current.map((item) => item.id === channel.id ? { ...item, name: event.target.value } : item))}
                            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">URL Token</label>
                          <input
                            value={channel.token}
                            onChange={(event) => setHttpPushChannels((current) => current.map((item) => item.id === channel.id ? { ...item, token: event.target.value.trim() } : item))}
                            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <label className="inline-flex h-10 items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={channel.enabled}
                              onChange={(event) => setHttpPushChannels((current) => current.map((item) => item.id === channel.id ? { ...item, enabled: event.target.checked } : item))}
                              className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                            Active
                          </label>
                          <button
                            type="button"
                            onClick={() => setHttpPushChannels((current) => current.filter((item) => item.id !== channel.id))}
                            className="mb-1 rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                            title="Delete HTTP channel"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <label className="mt-3 block text-xs font-medium uppercase tracking-wider text-slate-500">Gateway POST URL</label>
                      <code className="mt-1 block overflow-x-auto rounded bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {`${window.location.origin}/api/telemetry/${channel.id}/${channel.token || '<token>'}`}
                      </code>
                    </div>
                  ))}
                  {httpPushChannels.length === 0 && (
                    <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                      No HTTP Push channels yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-5 w-5 text-sky-500" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Backend MQTT Subscribers</h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddMqttChannel}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    Add MQTT Channel
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  The Dashboard backend can connect to multiple external MQTT Brokers at the same time. Each subscriber has its own topics and connection status.
                </p>
                <div className="mt-4 space-y-3">
                  {mqttChannels.map((channel) => {
                    const status = mqttStatuses[channel.id];
                    return (
                      <div key={channel.id} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_1.4fr]">
                            <div>
                              <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Channel Name</label>
                              <input
                                value={channel.name}
                                onChange={(event) => setMqttChannels((current) => current.map((item) => item.id === channel.id ? { ...item, name: event.target.value } : item))}
                                className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Broker URL</label>
                              <input
                                value={channel.brokerUrl}
                                onChange={(event) => setMqttChannels((current) => current.map((item) => item.id === channel.id ? { ...item, brokerUrl: event.target.value } : item))}
                                placeholder="mqtt://broker.example.com:1883"
                                className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-6">
                            <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={channel.enabled}
                                onChange={(event) => setMqttChannels((current) => current.map((item) => item.id === channel.id ? { ...item, enabled: event.target.checked } : item))}
                                className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                              />
                              Active
                            </label>
                            <button
                              type="button"
                              onClick={() => setMqttChannels((current) => current.filter((item) => item.id !== channel.id))}
                              className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                              title="Delete MQTT channel"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_1.5fr]">
                          <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Username</label>
                            <input
                              value={channel.username}
                              onChange={(event) => setMqttChannels((current) => current.map((item) => item.id === channel.id ? { ...item, username: event.target.value } : item))}
                              placeholder="Optional"
                              className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Password</label>
                            <input
                              type="password"
                              value={channel.password || ''}
                              onChange={(event) => setMqttChannels((current) => current.map((item) => item.id === channel.id ? { ...item, password: event.target.value } : item))}
                              placeholder="Leave blank to keep saved password"
                              className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Subscribe Topics</label>
                            <div className="mt-1 flex min-h-[2.5rem] w-full flex-wrap items-center gap-2 rounded-md bg-white p-1.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus-within:ring-2 focus-within:ring-orange-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                              {normalizeTopics(channel.topics).map((topic) => (
                                <span key={topic} className="inline-flex max-w-full items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  <span className="max-w-[13rem] truncate">{topic}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeMqttTopic(channel.id, topic)}
                                    className="text-slate-400 hover:text-red-500"
                                    title="Remove topic"
                                  >
                                    &times;
                                  </button>
                                </span>
                              ))}
                              <input
                                list={`mqtt-topic-options-${channel.id}`}
                                value={mqttTopicDrafts[channel.id] || ''}
                                onChange={(event) => setMqttTopicDrafts((current) => ({ ...current, [channel.id]: event.target.value }))}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ',') {
                                    event.preventDefault();
                                    addMqttTopic(channel.id, mqttTopicDrafts[channel.id] || '');
                                  } else if (event.key === 'Backspace' && !mqttTopicDrafts[channel.id]) {
                                    const topics = normalizeTopics(channel.topics);
                                    updateMqttTopics(channel.id, topics.slice(0, -1));
                                  }
                                }}
                                onBlur={() => addMqttTopic(channel.id, mqttTopicDrafts[channel.id] || '')}
                                placeholder="devices/+/telemetry"
                                className="min-w-[12rem] flex-1 border-0 bg-transparent p-0 font-mono text-sm text-slate-900 shadow-none outline-none placeholder:text-slate-400 focus:ring-0 dark:text-slate-200"
                              />
                              <datalist id={`mqtt-topic-options-${channel.id}`}>
                                {(mqttObservedTopics[channel.id] || [])
                                  .filter((topic) => !normalizeTopics(channel.topics).includes(topic))
                                  .map((topic) => (
                                    <option key={topic} value={topic} />
                                  ))}
                              </datalist>
                            </div>
                            {(mqttObservedTopics[channel.id] || []).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {(mqttObservedTopics[channel.id] || [])
                                  .filter((topic) => !normalizeTopics(channel.topics).includes(topic))
                                  .slice(0, 6)
                                  .map((topic) => (
                                    <button
                                      key={topic}
                                      type="button"
                                      onClick={() => addMqttTopic(channel.id, topic)}
                                      className="max-w-[12rem] truncate rounded border border-sky-200 bg-sky-50 px-2 py-1 font-mono text-[10px] text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
                                      title={topic}
                                    >
                                      {topic}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className={cn(
                            'rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
                            status?.state === 'connected' && 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300',
                            status && status.state !== 'connected' && status.state !== 'disabled' && 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300',
                            (!status || status.state === 'disabled') && 'bg-slate-100 text-slate-600 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
                          )}>
                            {status ? `${status.state}: ${status.message}` : 'not saved yet'}
                          </span>
                          {status?.lastMessageAt && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">Last message: {new Date(status.lastMessageAt).toLocaleString()}</span>
                          )}
                          {status?.lastTopic && (
                            <span className="max-w-full truncate rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              Topic: {status.lastTopic}
                            </span>
                          )}
                          {status && (status.receivedCount || status.acceptedCount || status.rejectedCount) ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              Received {status.receivedCount || 0} / Accepted {status.acceptedCount || 0} / Rejected {status.rejectedCount || 0}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {mqttChannels.length === 0 && (
                    <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                      No MQTT subscribers yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveDataSources}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
                >
                  <Send className="h-4 w-4" />
                  Save Data Sources
                </button>
                {dataSourceMessage && (
                  <span className="text-sm text-slate-600 dark:text-slate-300">{dataSourceMessage}</span>
                )}
              </div>
            </div>
          )}

          {activeTab === 'tokens' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold leading-7 text-slate-900 dark:text-white">Ingest Token Management</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Generate user-owned tokens for gateways that POST telemetry to <span className="font-mono">/api/telemetry</span>. Revoked tokens stop working immediately.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30 lg:grid-cols-[1fr_auto]">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">Token Name</label>
                  <input
                    value={tokenDraftName}
                    onChange={(event) => setTokenDraftName(event.target.value)}
                    placeholder="Factory A Gateway Token"
                    className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleGenerateToken}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
                  >
                    <Plus className="h-4 w-4" />
                    Generate Token
                  </button>
                </div>
              </div>

              {tokenMessage && (
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  {tokenMessage}
                </div>
              )}

              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Token</th>
                      <th className="px-4 py-3 font-semibold">Owner</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Last Used</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-[#1c2128]">
                    {ingestTokens.map((token) => {
                      const revoked = Boolean(token.revokedAt);
                      return (
                        <tr key={token.id}>
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium text-slate-900 dark:text-white">{token.name}</div>
                            <code className="mt-1 block max-w-md overflow-x-auto rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                              {token.token}
                            </code>
                            <div className="mt-1 text-xs text-slate-500">Created: {new Date(token.createdAt).toLocaleString()}</div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="text-slate-700 dark:text-slate-200">{token.ownerName}</div>
                            <div className="mt-1 font-mono text-xs text-slate-500">{token.ownerUserId}</div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span className={cn(
                              'rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
                              revoked
                                ? 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300'
                                : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                            )}>
                              {revoked ? 'Revoked' : 'Active'}
                            </span>
                            {token.revokedAt && (
                              <div className="mt-2 text-xs text-slate-500">{new Date(token.revokedAt).toLocaleString()}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                            {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : 'Never'}
                            {token.lastUsedSource && (
                              <div className="mt-1 font-mono text-xs text-slate-500">{token.lastUsedSource}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleCopyToken(token.token)}
                                disabled={revoked}
                                className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                Copy
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRevokeToken(token.id)}
                                disabled={revoked}
                                className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-500/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Revoke
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {ingestTokens.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                          No ingest tokens yet. Generate one for your device gateway before enabling token-protected telemetry.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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

              <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[150px_1fr_auto]">
                  <select
                    value={channelDraft.type}
                    onChange={(event) => {
                      const type = event.target.value as NotificationChannel['type'];
                      setChannelDraft((current) => ({ ...current, type, config: { ...DEFAULT_NOTIFICATION_CONFIG[type] } }));
                    }}
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
                  <button
                    type="button"
                    onClick={handleAddChannel}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>
                {renderNotificationConfigFields(
                  channelDraft.type,
                  channelDraft.config,
                  (key, value) => setChannelDraft((current) => ({ ...current, config: { ...current.config, [key]: value } }))
                )}
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Channel</th>
                      <th className="px-4 py-3 font-semibold">Configuration</th>
                      <th className="px-4 py-3 font-semibold">Enabled</th>
                      <th className="px-4 py-3 font-semibold">Test</th>
                      <th className="px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-[#1c2128]">
                    {notificationChannels.map((channel) => {
                      const channelConfig = notificationConfigFromChannel(channel);

                      return (
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
                          <div className="min-w-80">
                            {renderNotificationConfigFields(
                              channel.type,
                              channelConfig,
                              (key, value) => {
                                const nextConfig = { ...channelConfig, [key]: value };
                                updateNotificationChannel(channel.id, {
                                  config: nextConfig,
                                  target: notificationTargetFromConfig(channel.type, nextConfig),
                                });
                              }
                            )}
                          </div>
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
                              {channel.lastTestStatus === 'success' ? 'Test passed' : 'Configuration required'}
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
                      );
                    })}
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
                <select
                  value={userDraft.siteId}
                  onChange={(event) => setUserDraft((current) => ({ ...current, siteId: event.target.value }))}
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                >
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
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
                          <select
                            value={user.siteId}
                            onChange={(event) => updateUser(user.id, { siteId: event.target.value })}
                            className="w-40 rounded-md border-0 bg-transparent px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-300 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-700"
                          >
                            {sites.map((site) => (
                              <option key={site.id} value={site.id}>{site.name}</option>
                            ))}
                          </select>
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
