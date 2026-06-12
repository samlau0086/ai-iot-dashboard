import React, { useEffect, useMemo, useState } from 'react';
import { Database, Download, FileJson, Filter, RefreshCw, Search } from 'lucide-react';
import { useAppStore } from '../lib/store';

type RawTelemetryMessage = {
  device_id?: string;
  deviceId?: string;
  id?: string;
  name?: string;
  source?: string;
  mqtt_topic?: string;
  topic?: string;
  received_at?: string;
  timestamp?: string;
  metrics?: Record<string, unknown>;
  [key: string]: unknown;
};

const toDateTimeLocal = (date: Date) => {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
};

const toIsoOrEmpty = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};

const downloadJson = (messages: RawTelemetryMessage[]) => {
  const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `raw-telemetry-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export function RawData() {
  const { devices, sites } = useAppStore();
  const [deviceId, setDeviceId] = useState('');
  const [metric, setMetric] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState(() => toDateTimeLocal(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(() => toDateTimeLocal(new Date()));
  const [limit, setLimit] = useState(200);
  const [messages, setMessages] = useState<RawTelemetryMessage[]>([]);
  const [selected, setSelected] = useState<RawTelemetryMessage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const getDeviceId = (message: RawTelemetryMessage) => String(message.device_id || message.deviceId || message.id || '');
  const getReceivedAt = (message: RawTelemetryMessage) => String(message.received_at || message.timestamp || '');

  const metricOptions = useMemo(() => {
    const metrics = new Set<string>();
    devices.forEach((device) => {
      if (deviceId && device.id !== deviceId && device.config?.externalDeviceId !== deviceId) return;
      Object.keys(device.metrics || {}).forEach((key) => metrics.add(key));
    });
    messages.forEach((message) => {
      Object.keys(message.metrics || {}).forEach((key) => metrics.add(key));
    });
    return Array.from(metrics).sort();
  }, [deviceId, devices, messages]);

  const sourceOptions = useMemo(() => {
    const sources = new Set(messages.map((message) => String(message.source || '')).filter(Boolean));
    ['http', 'mqtt', 'http:legacy'].forEach((item) => sources.add(item));
    return Array.from(sources).sort();
  }, [messages]);

  const deviceNameById = useMemo(() => {
    const map = new Map<string, string>();
    devices.forEach((device) => {
      map.set(device.id, device.name);
      if (device.config?.externalDeviceId) map.set(device.config.externalDeviceId, device.name);
    });
    return map;
  }, [devices]);

  const getMessageMatch = (message: RawTelemetryMessage) => {
    const rowDeviceId = getDeviceId(message);
    const metrics = message.metrics || {};
    const matchedDevice = devices.find((device) => device.id === rowDeviceId || device.config?.externalDeviceId === rowDeviceId);

    if (matchedDevice) {
      return {
        status: 'matched' as const,
        label: matchedDevice.name,
        detail: `Matched ${matchedDevice.config?.externalDeviceId === rowDeviceId ? 'External Device ID' : 'Device ID'}`,
      };
    }

    if (!rowDeviceId) {
      return { status: 'unmatched' as const, label: 'Unmatched', detail: 'Payload has no device_id, deviceId, or id.' };
    }

    if (Object.keys(metrics).length === 0) {
      return { status: 'unmatched' as const, label: 'Unmatched', detail: 'Payload has no numeric metrics.' };
    }

    return { status: 'unmatched' as const, label: 'Unmatched', detail: `No device uses ID or External Device ID "${rowDeviceId}".` };
  };

  const queryRawData = async () => {
    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (deviceId) params.set('deviceId', deviceId);
      if (metric) params.set('metric', metric);
      if (source) params.set('source', source);
      if (from) params.set('from', toIsoOrEmpty(from));
      if (to) params.set('to', toIsoOrEmpty(to));
      params.set('limit', String(limit));

      const response = await fetch(`/api/telemetry?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Telemetry query failed: ${response.status}`);

      const nextMessages = Array.isArray(payload.messages) ? payload.messages : [];
      setMessages(nextMessages);
      setSelected(nextMessages[0] || null);
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Failed to query raw telemetry.');
      setMessages([]);
      setSelected(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    queryRawData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            <Database className="h-6 w-6 text-orange-600 dark:text-orange-500" />
            Raw Data Query
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Inspect original telemetry payloads stored from HTTP Push, device API paths, and MQTT subscribers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={queryRawData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => downloadJson(messages)}
            disabled={messages.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            Export JSON
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#1c2128] lg:grid-cols-6">
        <label className="space-y-1 text-sm lg:col-span-2">
          <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
            <Search className="h-4 w-4" />
            Device
          </span>
          <select
            value={deviceId}
            onChange={(event) => {
              setDeviceId(event.target.value);
              setMetric('');
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">All devices</option>
            {sites.map((site) => {
              const siteDevices = devices.filter((device) => device.siteId === site.id);
              if (siteDevices.length === 0) return null;
              return (
                <optgroup key={site.id} label={site.name}>
                  {siteDevices.map((device) => (
                    <option key={device.id} value={device.config?.externalDeviceId || device.id}>
                      {device.name} ({device.config?.externalDeviceId || device.id})
                    </option>
                  ))}
                </optgroup>
              );
            })}
            {devices.filter((device) => !device.siteId).map((device) => (
              <option key={device.id} value={device.config?.externalDeviceId || device.id}>
                {device.name} ({device.config?.externalDeviceId || device.id})
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
            <Filter className="h-4 w-4" />
            Metric
          </span>
          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">All metrics</option>
            {metricOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Source</span>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">All sources</option>
            {sourceOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">From</span>
          <input
            type="datetime-local"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">To</span>
          <input
            type="datetime-local"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Limit</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={limit}
            onChange={(event) => setLimit(Math.max(1, Math.min(Number(event.target.value || 1), 1000)))}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </label>

        <div className="flex items-end lg:col-span-5">
          <button
            type="button"
            onClick={queryRawData}
            disabled={isLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-orange-600 dark:hover:bg-orange-500 lg:w-auto"
          >
            <Search className="h-4 w-4" />
            Query raw data
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#1c2128]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Telemetry messages</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{messages.length} records in current query</p>
            </div>
            <FileJson className="h-5 w-5 text-slate-400" />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Received</th>
                  <th className="px-4 py-3 font-semibold">Device</th>
                  <th className="px-4 py-3 font-semibold">Match</th>
                  <th className="px-4 py-3 font-semibold">Source</th>
                  <th className="px-4 py-3 font-semibold">Topic</th>
                  <th className="px-4 py-3 font-semibold">Metrics</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {messages.map((message, index) => {
                  const rowDeviceId = getDeviceId(message);
                  const rowReceivedAt = getReceivedAt(message);
                  const isSelected = selected === message;
                  const match = getMessageMatch(message);
                  return (
                    <tr
                      key={`${rowReceivedAt}-${rowDeviceId}-${index}`}
                      onClick={() => setSelected(message)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-orange-50 dark:bg-orange-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {rowReceivedAt ? new Date(rowReceivedAt).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{deviceNameById.get(rowDeviceId) || message.name || rowDeviceId || '-'}</div>
                        <div className="font-mono text-xs text-slate-500">{rowDeviceId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            match.status === 'matched'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                          }`}
                          title={match.detail}
                        >
                          {match.label}
                        </span>
                        <div className="mt-1 max-w-[12rem] truncate text-[10px] text-slate-500" title={match.detail}>{match.detail}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{String(message.source || '-')}</td>
                      <td className="max-w-[14rem] truncate px-4 py-3 font-mono text-xs text-slate-500">{String(message.mqtt_topic || message.topic || '-')}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(message.metrics || {}).slice(0, 4).map(([key, value]) => (
                            <span key={key} className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              {key}: {String(value)}
                            </span>
                          ))}
                          {Object.keys(message.metrics || {}).length > 4 && (
                            <span className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-500 dark:bg-slate-900">
                              +{Object.keys(message.metrics || {}).length - 4}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {messages.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      No raw telemetry matched the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#1c2128]">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Payload detail</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selected ? getMessageMatch(selected).detail : 'Original JSON as stored by the telemetry ingest path.'}
            </p>
          </div>
          <pre className="max-h-[34rem] overflow-auto p-4 text-xs leading-5 text-slate-700 dark:text-slate-300">
            {selected ? JSON.stringify(selected, null, 2) : 'Select a telemetry row to inspect the raw payload.'}
          </pre>
        </div>
      </div>
    </div>
  );
}
