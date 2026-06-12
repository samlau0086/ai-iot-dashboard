import type { Device, DeviceMetricMapping } from '../types';

type StandardMetricOption = {
  key: string;
  label: string;
  unit: string;
};

export const STANDARD_METRIC_OPTIONS: StandardMetricOption[] = [
  { key: 'power', label: 'Power', unit: 'W' },
  { key: 'energy', label: 'Energy', unit: 'kWh' },
  { key: 'energy_today', label: 'Energy Today', unit: 'kWh' },
  { key: 'temperature', label: 'Temperature', unit: 'deg C' },
  { key: 'humidity', label: 'Humidity', unit: '%' },
  { key: 'pressure', label: 'Pressure', unit: 'bar' },
  { key: 'flow_rate', label: 'Flow Rate', unit: 'm3/h' },
  { key: 'total_flow', label: 'Total Flow', unit: 'm3' },
  { key: 'voltage', label: 'Voltage', unit: 'V' },
  { key: 'current', label: 'Current', unit: 'A' },
  { key: 'frequency', label: 'Frequency', unit: 'Hz' },
  { key: 'battery_soc', label: 'Battery SOC', unit: '%' },
  { key: 'running_hours', label: 'Runtime', unit: 'h' },
  { key: 'signal', label: 'Signal', unit: '%' },
  { key: 'cpu', label: 'CPU Load', unit: '%' },
  { key: 'ram', label: 'Memory', unit: '%' },
  { key: 'di_on', label: 'Digital Inputs On', unit: '' },
  { key: 'do_on', label: 'Digital Outputs On', unit: '' },
  { key: 'ai_value', label: 'Analog Input', unit: '' },
];

const standardMetricByKey = new Map<string, StandardMetricOption>(STANDARD_METRIC_OPTIONS.map((metric) => [metric.key, metric]));

export const inferMetricUnit = (key: string) => {
  const normalizedKey = key.toLowerCase();
  const standardUnit = standardMetricByKey.get(key)?.unit;
  if (standardUnit !== undefined) return standardUnit;
  if (normalizedKey.includes('power')) return 'W';
  if (normalizedKey.includes('energy') || normalizedKey.includes('generation')) return 'kWh';
  if (normalizedKey.includes('temp')) return 'deg C';
  if (normalizedKey.includes('pressure')) return 'bar';
  if (normalizedKey.includes('humidity') || normalizedKey.includes('efficiency') || normalizedKey.includes('battery') || normalizedKey.includes('soc') || normalizedKey.includes('cpu') || normalizedKey.includes('ram') || normalizedKey.includes('leakage') || normalizedKey.includes('signal')) return '%';
  if (normalizedKey.includes('flow')) return 'm3/h';
  if (normalizedKey.includes('hours') || normalizedKey.includes('uptime') || normalizedKey.includes('runtime')) return 'h';
  if (normalizedKey.includes('voltage')) return 'V';
  if (normalizedKey.includes('current')) return 'A';
  if (normalizedKey.includes('frequency')) return 'Hz';
  return '';
};

export const getMetricMappings = (device?: Device | null): DeviceMetricMapping[] => {
  const structured = device?.config?.metricMappings || [];
  const legacy = Object.entries(device?.config?.metricMapping || {}).map(([rawKey, standardKey]) => ({
    rawKey,
    standardKey,
    displayName: standardMetricByKey.get(standardKey)?.label || standardKey,
    unit: inferMetricUnit(standardKey),
    precision: 2,
    primary: false,
  }));

  const byRawKey = new Map<string, DeviceMetricMapping>();
  [...legacy, ...structured].forEach((mapping) => {
    const rawKey = String(mapping.rawKey || '').trim();
    const standardKey = String(mapping.standardKey || '').trim();
    if (!rawKey || !standardKey) return;
    byRawKey.set(rawKey, {
      rawKey,
      standardKey,
      displayName: mapping.displayName || standardMetricByKey.get(standardKey)?.label || standardKey,
      unit: mapping.unit ?? inferMetricUnit(standardKey),
      precision: Number.isFinite(Number(mapping.precision)) ? Number(mapping.precision) : 2,
      primary: Boolean(mapping.primary),
    });
  });

  return Array.from(byRawKey.values()).sort((first, second) => first.rawKey.localeCompare(second.rawKey));
};

export const getMetricMappingByStandardKey = (device: Device | null | undefined, metricKey: string) => (
  getMetricMappings(device).find((mapping) => mapping.standardKey === metricKey)
);

export const applyMetricMappingsToMetrics = (
  device: Device | null | undefined,
  metrics: Record<string, unknown> = {}
) => {
  const mappedMetrics = Object.entries(metrics).reduce<Record<string, number>>((acc, [key, value]) => {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) acc[key] = numericValue;
    return acc;
  }, {});

  getMetricMappings(device).forEach((mapping) => {
    const numericValue = Number(metrics[mapping.rawKey]);
    if (Number.isFinite(numericValue)) mappedMetrics[mapping.standardKey] = numericValue;
  });

  return mappedMetrics;
};

export const getMetricLabel = (device: Device | null | undefined, metricKey: string) => (
  getMetricMappingByStandardKey(device, metricKey)?.displayName
  || standardMetricByKey.get(metricKey)?.label
  || metricKey
);

export const getMetricUnit = (device: Device | null | undefined, metricKey: string) => (
  getMetricMappingByStandardKey(device, metricKey)?.unit ?? inferMetricUnit(metricKey)
);

export const getMetricPrecision = (device: Device | null | undefined, metricKey: string) => {
  const precision = getMetricMappingByStandardKey(device, metricKey)?.precision;
  return Number.isFinite(Number(precision)) ? Math.max(0, Math.min(6, Number(precision))) : 2;
};

export const getPrimaryMappedMetricKeys = (device: Device | null | undefined) => (
  getMetricMappings(device).filter((mapping) => mapping.primary).map((mapping) => mapping.standardKey)
);
