import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, Loader2, Plus, Trash2 } from 'lucide-react';
import { useAppStore, type ChartConfig } from '../lib/store';
import { translations } from '../lib/i18n';
import { ChartRenderer } from '../components/ChartRenderer';
import { confirmDelete } from '../lib/confirm';
import { notifySuccess } from '../lib/toast';
import { useRuntimeDevices } from '../hooks/useRuntimeDevices';
import { UnderDevelopmentBadge } from '../components/UnderDevelopmentBadge';
import type { Device } from '../types';
import { applyMetricMappingsToMetrics, getMetricLabel, getMetricMappings, getMetricPrecision, getMetricUnit } from '../lib/metricMappings';

type TelemetryMessage = {
  device_id?: string;
  deviceId?: string;
  id?: string;
  received_at?: string;
  timestamp?: string;
  metrics?: Record<string, unknown>;
  [key: string]: unknown;
};

const CHART_TYPES: Array<{ value: ChartConfig['type']; label: string }> = [
  { value: 'line', label: 'Line Chart' },
  { value: 'bar', label: 'Bar Chart' },
  { value: 'pie', label: 'Pie Chart' },
];

const DATA_SOURCES: Array<{ value: ChartConfig['dataSource']; label: string }> = [
  { value: 'energy', label: 'Energy Metrics' },
  { value: 'devices', label: 'Device Health' },
  { value: 'alerts', label: 'Alert Frequency' },
  { value: 'solar', label: 'Solar Production' },
  { value: 'coldStorage', label: 'Cold Storage Temperature' },
  { value: 'waterPump', label: 'Water Pump Pressure' },
  { value: 'airCompressor', label: 'Air Compressor Pressure' },
];

const toDateTimeLocal = (date: Date) => {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
};

const toIsoOrEmpty = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};

const normalizePrecision = (value: number) => {
  if (!Number.isFinite(value)) return 2;
  return Math.max(0, Math.min(6, Math.round(value)));
};

const getTelemetryDeviceId = (message: TelemetryMessage) => String(message.device_id || message.deviceId || message.id || '');

const getTelemetryTime = (message: TelemetryMessage) => {
  const time = new Date(String(message.received_at || message.timestamp || '')).getTime();
  return Number.isFinite(time) ? time : 0;
};

const getTelemetryMetrics = (message: TelemetryMessage) => (
  Object.entries(message.metrics || {}).reduce<Record<string, number>>((acc, [key, value]) => {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) acc[key] = numericValue;
    return acc;
  }, {})
);

const getMetricDefaultsForDevices = (metricKey: string, sourceDevices: Device[]) => {
  const mapping = sourceDevices
    .flatMap((device) => getMetricMappings(device))
    .find((item) => item.standardKey === metricKey || item.rawKey === metricKey);
  const sourceDevice = sourceDevices.find((device) => (
    Object.prototype.hasOwnProperty.call(device.metrics || {}, metricKey)
    || getMetricMappings(device).some((item) => item.standardKey === metricKey || item.rawKey === metricKey)
  )) || sourceDevices[0] || null;

  return {
    label: mapping?.displayName || getMetricLabel(sourceDevice, metricKey),
    unit: mapping?.unit ?? getMetricUnit(sourceDevice, metricKey),
    precision: Number.isFinite(Number(mapping?.precision))
      ? normalizePrecision(Number(mapping?.precision))
      : getMetricPrecision(sourceDevice, metricKey),
  };
};

const getMetricOptionsForDevices = (sourceDevices: Device[]) => {
  const metrics = new Set<string>();
  sourceDevices.forEach((device) => {
    Object.keys(device.metrics || {}).forEach((metric) => metrics.add(metric));
    getMetricMappings(device).forEach((mapping) => {
      if (mapping.standardKey) metrics.add(mapping.standardKey);
      if (mapping.rawKey) metrics.add(mapping.rawKey);
    });
  });
  return Array.from(metrics).sort();
};

const getDefaultMetricForChart = (chartConf: ChartConfig) => {
  if (chartConf.metricKey) return chartConf.metricKey;
  const metricBySource: Partial<Record<ChartConfig['dataSource'], string>> = {
    energy: 'energy',
    solar: 'energy_today',
    coldStorage: 'temperature',
    waterPump: 'pressure',
    airCompressor: 'pressure',
  };
  return metricBySource[chartConf.dataSource] || '';
};

const buildTelemetryChartData = (
  chartConf: ChartConfig,
  devices: Device[],
  messages: TelemetryMessage[]
) => {
  const metricKey = chartConf.metricKey || '';
  if (!metricKey || devices.length === 0) return [{ name: 'No Data', A: 0, B: 0, value: 0 }];

  const devicesByIdentifier = new Map<string, Device>();
  devices.forEach((device) => {
    devicesByIdentifier.set(device.id, device);
    if (device.config?.externalDeviceId) devicesByIdentifier.set(device.config.externalDeviceId, device);
  });

  const values = messages
    .map((message) => {
      const device = devicesByIdentifier.get(getTelemetryDeviceId(message));
      if (!device) return null;
      const metrics = applyMetricMappingsToMetrics(device, getTelemetryMetrics(message));
      const value = Number(metrics[metricKey]);
      const time = getTelemetryTime(message);
      if (!Number.isFinite(value) || !time) return null;
      return { device, time, value };
    })
    .filter((item): item is { device: Device; time: number; value: number } => Boolean(item))
    .sort((first, second) => first.time - second.time);

  if (values.length === 0) return [{ name: 'No Data', A: 0, B: 0, value: 0 }];

  if (chartConf.type === 'pie') {
    const totals = new Map<string, { name: string; value: number }>();
    values.forEach((item) => {
      const current = totals.get(item.device.id) || { name: item.device.name, value: 0 };
      current.value += item.value;
      totals.set(item.device.id, current);
    });
    return Array.from(totals.values()).map((item) => ({
      name: item.name,
      value: Number(item.value.toFixed(chartConf.precision ?? 2)),
      A: Number(item.value.toFixed(chartConf.precision ?? 2)),
      B: 0,
    }));
  }

  const from = chartConf.from ? new Date(chartConf.from).getTime() : values[0].time;
  const to = chartConf.to ? new Date(chartConf.to).getTime() : values[values.length - 1].time;
  const bucketCount = chartConf.type === 'bar' ? 8 : 16;
  const bucketSize = Math.max(1, (to - from) / bucketCount);
  const buckets = new Map<number, { total: number; count: number }>();

  values.forEach((item) => {
    const bucket = Math.max(0, Math.min(bucketCount - 1, Math.floor((item.time - from) / bucketSize)));
    const current = buckets.get(bucket) || { total: 0, count: 0 };
    current.total += item.value;
    current.count += 1;
    buckets.set(bucket, current);
  });

  return Array.from({ length: bucketCount }).map((_, index) => {
    const bucket = buckets.get(index);
    const bucketTime = from + index * bucketSize;
    const value = bucket ? bucket.total / bucket.count : 0;
    return {
      name: new Date(bucketTime).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      A: Number(value.toFixed(chartConf.precision ?? 2)),
      B: 0,
      value: Number(value.toFixed(chartConf.precision ?? 2)),
    };
  });
};

const getChartTimeRange = (chartConf: ChartConfig) => {
  const to = chartConf.to || new Date().toISOString();
  const from = chartConf.from || new Date(new Date(to).getTime() - 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
};

function AnalyticsChartCard({
  chartConf,
  devices,
  theme,
  onDelete,
}: {
  chartConf: ChartConfig;
  devices: Device[];
  theme: string;
  onDelete: () => void;
}) {
  const [historyData, setHistoryData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const effectiveChartConf = useMemo(() => ({
    ...chartConf,
    metricKey: getDefaultMetricForChart(chartConf),
  }), [chartConf]);
  const shouldUseTelemetryLogs = Boolean(effectiveChartConf.metricKey);
  const chartRange = useMemo(() => getChartTimeRange(chartConf), [chartConf]);

  useEffect(() => {
    let cancelled = false;

    const loadTelemetry = async () => {
      if (!shouldUseTelemetryLogs) {
        setHistoryData(null);
        setError('');
        return;
      }

      if (devices.length === 0) {
        setHistoryData([{ name: 'No Data', A: 0, B: 0, value: 0 }]);
        setError('No devices are bound to this chart scope.');
        return;
      }

      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        params.set('from', chartRange.from);
        params.set('to', chartRange.to);
        params.set('limit', '1000');

        const messageGroups = await Promise.all(devices.map(async (device) => {
          const identifiers = Array.from(new Set([device.id, device.config?.externalDeviceId].filter(Boolean) as string[]));
          const deviceGroups = await Promise.all(identifiers.map(async (deviceId) => {
            const scopedParams = new URLSearchParams(params);
            scopedParams.set('deviceId', deviceId);
            const response = await fetch(`/api/telemetry?${scopedParams.toString()}`);
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || `Telemetry query failed: ${response.status}`);
            return Array.isArray(payload.messages) ? payload.messages as TelemetryMessage[] : [];
          }));
          return deviceGroups.flat();
        }));

        const messages = messageGroups.flat();
        const chartData = buildTelemetryChartData({ ...effectiveChartConf, from: chartRange.from, to: chartRange.to }, devices, messages);
        if (!cancelled) setHistoryData(chartData);
      } catch (loadError) {
        if (!cancelled) {
          setHistoryData([{ name: 'No Data', A: 0, B: 0, value: 0 }]);
          setError(loadError instanceof Error ? loadError.message : 'Failed to load telemetry logs.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadTelemetry();
    return () => {
      cancelled = true;
    };
  }, [chartRange, devices, effectiveChartConf, shouldUseTelemetryLogs]);

  return (
    <div className="group relative rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#1c2128]">
      <button
        type="button"
        onClick={onDelete}
        className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-400 opacity-0 transition hover:border-red-300 hover:text-red-500 group-hover:opacity-100 dark:border-slate-700 dark:bg-slate-900"
        aria-label="Delete chart"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <h3 className="pr-10 text-sm font-semibold text-slate-900 dark:text-slate-200">{chartConf.title}</h3>
      <p className="mt-1 text-xs font-mono text-slate-500 dark:text-slate-400">
        {effectiveChartConf.metricKey || 'default metric'}{chartConf.unit ? ` / ${chartConf.unit}` : ''} / {chartConf.deviceIds?.length ? `${chartConf.deviceIds.length} devices` : 'site devices'}
      </p>
      <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
        <Calendar className="h-3 w-3" />
        {new Date(chartRange.from).toLocaleString()} - {new Date(chartRange.to).toLocaleString()}
      </p>
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="relative mt-5 h-80 w-full">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-white/70 text-sm text-slate-500 dark:bg-[#1c2128]/70 dark:text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading telemetry logs...
          </div>
        )}
        <ChartRenderer chartConf={effectiveChartConf} theme={theme} devices={devices} dataOverride={historyData || undefined} />
      </div>
    </div>
  );
}

export function Analytics() {
  const {
    language,
    theme,
    charts,
    addChart,
    removeChart,
    devices: storedDevices,
    sites,
    activeSiteId,
  } = useAppStore();
  const devices = useRuntimeDevices(storedDevices);
  const t = translations[language];
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState(activeSiteId || 'All');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [metricKey, setMetricKey] = useState('');
  const [unit, setUnit] = useState('');
  const [precision, setPrecision] = useState(2);
  const [unitTouched, setUnitTouched] = useState(false);
  const [precisionTouched, setPrecisionTouched] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(() => toDateTimeLocal(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [rangeTo, setRangeTo] = useState(() => toDateTimeLocal(new Date()));

  const siteOptions = useMemo(() => [
    { id: 'All', name: 'All Sites', tenantName: 'All Tenants', tags: [] as string[] },
    ...sites,
  ], [sites]);

  const getDevicesForSite = (siteId: string) => {
    if (siteId === 'All') return devices;
    const site = sites.find((item) => item.id === siteId);
    const siteTags = new Set(site?.tags || []);
    return devices.filter((device) => (
      device.siteId === siteId ||
      (!device.siteId && Boolean(device.tags?.some((tag) => siteTags.has(tag))))
    ));
  };

  const scopedDevices = useMemo(() => getDevicesForSite(selectedSiteId), [devices, selectedSiteId, sites]);
  const builderDevices = useMemo(() => (
    selectedDeviceIds.length
      ? scopedDevices.filter((device) => selectedDeviceIds.includes(device.id))
      : scopedDevices
  ), [scopedDevices, selectedDeviceIds]);
  const metricOptions = useMemo(() => getMetricOptionsForDevices(builderDevices), [builderDevices]);
  const metricOptionMeta = useMemo(() => (
    Object.fromEntries(metricOptions.map((metric) => [metric, getMetricDefaultsForDevices(metric, builderDevices)]))
  ), [builderDevices, metricOptions]);

  useEffect(() => {
    setSelectedDeviceIds([]);
    setMetricKey('');
    setUnitTouched(false);
    setPrecisionTouched(false);
  }, [selectedSiteId]);

  useEffect(() => {
    if (metricOptions.length === 0) {
      if (metricKey) setMetricKey('');
      return;
    }
    if (!metricKey || !metricOptions.includes(metricKey)) setMetricKey(metricOptions[0]);
  }, [metricKey, metricOptions]);

  useEffect(() => {
    if (!metricKey) return;
    const defaults = metricOptionMeta[metricKey] || getMetricDefaultsForDevices(metricKey, builderDevices);
    if (!unitTouched) setUnit(defaults.unit || '');
    if (!precisionTouched) setPrecision(normalizePrecision(defaults.precision));
  }, [builderDevices, metricKey, metricOptionMeta, precisionTouched, unitTouched]);

  const getChartDevices = (chartConf: ChartConfig) => {
    const chartScopeDevices = getDevicesForSite(chartConf.siteId || 'All');
    if (!chartConf.deviceIds?.length) return chartScopeDevices;
    const selectedIds = new Set(chartConf.deviceIds);
    return chartScopeDevices.filter((device) => selectedIds.has(device.id));
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setSelectedSiteId(activeSiteId || 'All');
    setSelectedDeviceIds([]);
    setMetricKey('');
    setUnit('');
    setPrecision(2);
    setUnitTouched(false);
    setPrecisionTouched(false);
    setRangeFrom(toDateTimeLocal(new Date(Date.now() - 24 * 60 * 60 * 1000)));
    setRangeTo(toDateTimeLocal(new Date()));
  };

  const handleAddSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const fromIso = toIsoOrEmpty(rangeFrom);
    const toIso = toIsoOrEmpty(rangeTo);

    addChart({
      id: `chart_${Date.now()}_${Math.round(Math.random() * 10000)}`,
      title: String(formData.get('title') || '').trim(),
      type: formData.get('type') as ChartConfig['type'],
      dataSource: formData.get('dataSource') as ChartConfig['dataSource'],
      siteId: selectedSiteId,
      deviceIds: selectedDeviceIds,
      metricKey: String(formData.get('metricKey') || metricKey || metricOptions[0] || ''),
      unit: unit.trim() || undefined,
      precision: normalizePrecision(precision),
      from: fromIso || undefined,
      to: toIso || undefined,
    });
    notifySuccess('Analytics chart saved successfully.');
    closeAddModal();
  };

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t.nav.analytics}
            <UnderDevelopmentBadge />
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Build device and metric reports from telemetry logs by Site, device, and time range.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="mt-4 inline-flex items-center gap-x-2 rounded border border-orange-500 bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 sm:mt-0"
        >
          <Plus className="-ml-0.5 h-4 w-4" aria-hidden="true" />
          Add Chart
        </button>
      </div>

      {charts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-[#1c2128]">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">No analytics charts yet</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Add a chart and bind it to Site telemetry logs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {charts.map((chartConf) => (
            <AnalyticsChartCard
              key={chartConf.id}
              chartConf={chartConf}
              theme={theme}
              devices={getChartDevices(chartConf)}
              onDelete={async () => {
                if (await confirmDelete({ title: 'Delete chart', itemName: chartConf.title || 'this chart', description: 'The chart report configuration will be removed.' })) {
                  removeChart(chartConf.id);
                  notifySuccess('Chart deleted successfully.');
                }
              }}
            />
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
            <div className="fixed inset-0 z-[100] transition-opacity" aria-hidden="true" onClick={closeAddModal}>
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            </div>
            <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>
            <div className="relative z-[110] inline-block w-full transform overflow-hidden rounded-lg border border-slate-200 bg-white text-left align-bottom shadow-xl transition-all dark:border-slate-800 dark:bg-[#1c2128] sm:my-8 sm:max-w-3xl sm:align-middle">
              <form onSubmit={handleAddSubmit}>
                <div className="px-4 pb-4 pt-5 sm:p-6">
                  <h3 className="mb-4 text-lg font-medium leading-6 text-slate-900 dark:text-white">Add Analytics Chart</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Chart Title</label>
                      <input required type="text" name="title" className="mt-1 block w-full rounded border-0 bg-slate-50 px-3 py-2 text-slate-900 shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Site</label>
                      <select
                        value={selectedSiteId}
                        onChange={(event) => setSelectedSiteId(event.target.value)}
                        className="mt-1 block w-full rounded border-0 bg-slate-50 px-3 py-2 text-slate-900 shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 sm:text-sm"
                      >
                        {siteOptions.map((site) => (
                          <option key={site.id} value={site.id}>{site.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Data Source</label>
                      <select name="dataSource" className="mt-1 block w-full rounded border-0 bg-slate-50 px-3 py-2 text-slate-900 shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 sm:text-sm">
                        {DATA_SOURCES.map((source) => (
                          <option key={source.value} value={source.value}>{source.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Chart Type</label>
                      <select name="type" className="mt-1 block w-full rounded border-0 bg-slate-50 px-3 py-2 text-slate-900 shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 sm:text-sm">
                        {CHART_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">From</label>
                      <input
                        type="datetime-local"
                        value={rangeFrom}
                        onChange={(event) => setRangeFrom(event.target.value)}
                        className="mt-1 block w-full rounded border-0 bg-slate-50 px-3 py-2 text-slate-900 shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">To</label>
                      <input
                        type="datetime-local"
                        value={rangeTo}
                        onChange={(event) => setRangeTo(event.target.value)}
                        className="mt-1 block w-full rounded border-0 bg-slate-50 px-3 py-2 text-slate-900 shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 sm:text-sm"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bind Devices</label>
                      <div className="mt-2 max-h-44 space-y-2 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                        {scopedDevices.length > 0 ? scopedDevices.map((device) => (
                          <label key={device.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={selectedDeviceIds.includes(device.id)}
                              onChange={(event) => {
                                setSelectedDeviceIds((current) => (
                                  event.target.checked
                                    ? [...current, device.id]
                                    : current.filter((id) => id !== device.id)
                                ));
                                setUnitTouched(false);
                                setPrecisionTouched(false);
                              }}
                              className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                            <span className="min-w-0 truncate">{device.name}</span>
                            <span className="ml-auto shrink-0 font-mono text-xs text-slate-400">{device.type}</span>
                          </label>
                        )) : (
                          <p className="text-sm text-slate-500 dark:text-slate-400">No devices in this Site.</p>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty to bind all devices in the selected Site.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Metric</label>
                      <select
                        name="metricKey"
                        value={metricKey || metricOptions[0] || ''}
                        onChange={(event) => {
                          setMetricKey(event.target.value);
                          setUnitTouched(false);
                          setPrecisionTouched(false);
                        }}
                        disabled={metricOptions.length === 0}
                        className="mt-1 block w-full rounded border-0 bg-slate-50 px-3 py-2 text-slate-900 shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 sm:text-sm"
                      >
                        {metricOptions.length > 0 ? metricOptions.map((metric) => {
                          const meta = metricOptionMeta[metric];
                          const label = meta?.label && meta.label !== metric ? `${meta.label} (${metric})` : metric;
                          return <option key={metric} value={metric}>{meta?.unit ? `${label} / ${meta.unit}` : label}</option>;
                        }) : (
                          <option value="">No metrics available</option>
                        )}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Unit</label>
                        <input
                          value={unit}
                          onChange={(event) => {
                            setUnitTouched(true);
                            setUnit(event.target.value);
                          }}
                          placeholder="kWh, bar, deg C"
                          className="mt-1 block w-full rounded border-0 bg-slate-50 px-3 py-2 text-slate-900 shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Precision</label>
                        <input
                          type="number"
                          min={0}
                          max={6}
                          value={precision}
                          onChange={(event) => {
                            setPrecisionTouched(true);
                            setPrecision(Number(event.target.value));
                          }}
                          className="mt-1 block w-full rounded border-0 bg-slate-50 px-3 py-2 text-slate-900 shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50 sm:flex sm:flex-row-reverse sm:px-6">
                  <button
                    type="submit"
                    disabled={metricOptions.length === 0}
                    className="inline-flex w-full justify-center rounded border border-transparent bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60 sm:ml-3 sm:w-auto"
                  >
                    Add
                  </button>
                  <button type="button" onClick={closeAddModal} className="mt-3 inline-flex w-full justify-center rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 sm:ml-3 sm:mt-0 sm:w-auto">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
