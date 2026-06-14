import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../lib/store';
import { getDeviceIcon } from '../lib/icons';
import { ArrowLeft, Activity, Info, Settings, Zap, Thermometer, Gauge, Cpu, HardDrive, Waves, BatteryCharging, Timer, Wind, Droplets, DoorOpen, Radio, Edit2, Play, Plus, Trash2, X, AlertTriangle, Database, RefreshCw, Copy, Wifi, Link as LinkIcon } from 'lucide-react';
import { translations } from '../lib/i18n';
import { cn } from '../lib/utils';
import { DeviceForm } from '../components/DeviceForm';
import { CONTROL_ICON_OPTIONS, buildControlParameters, buildControlStatePatch, getDeviceControlDefinitions, requiresControlConfirmation, sanitizeControlDefinition, type DeviceControlDefinition, type DeviceControlValueType } from '../lib/deviceControls';
import { confirmDelete } from '../lib/confirm';
import { useRuntimeDevices } from '../hooks/useRuntimeDevices';
import { formatDeviceAge, getDeviceDataQuality } from '../lib/deviceStatus';
import { canAccessDeviceData, canIssueControlCommand, getUserAppProfile } from '../lib/featureAccess';
import {
  STANDARD_METRIC_OPTIONS,
  applyMetricMappingsToMetrics,
  getMetricLabel,
  getMetricMappings,
  getMetricPrecision,
  getMetricUnit,
  getPrimaryMappedMetricKeys,
  inferMetricUnit,
} from '../lib/metricMappings';
import { buildCurlRequest, buildMqttExample, getMqttTelemetryTopic, getTelemetryEndpoint } from '../lib/deviceTelemetryExamples';
import type { DeviceMetricMapping } from '../types';
import { apiJsonHeaders } from '../lib/apiAuth';

type DeviceMetricLog = {
  device_id?: string;
  deviceId?: string;
  id?: string;
  source?: string;
  topic?: string;
  mqtt_topic?: string;
  received_at?: string;
  timestamp?: string;
  metrics?: Record<string, unknown>;
  [key: string]: unknown;
};

type DataSourceSnapshot = {
  httpPushChannels?: Array<{ id: string; name: string; enabled: boolean; token?: string }>;
  mqttChannels?: Array<{ id: string; name: string; enabled: boolean; brokerUrl?: string; topics?: string[] | string }>;
  mqttStatuses?: Record<string, {
    state?: string;
    message?: string;
    lastMessageAt?: string;
    lastTopic?: string;
    receivedCount?: number;
    acceptedCount?: number;
    rejectedCount?: number;
  }>;
  mqttObservedTopics?: Record<string, string[]>;
};

const getMetricLogTime = (message: DeviceMetricLog) => String(message.received_at || message.timestamp || '');
const getMetricLogKey = (message: DeviceMetricLog, index: number) => [
  message.device_id || message.deviceId || message.id || 'device',
  message.source || 'source',
  message.topic || message.mqtt_topic || 'topic',
  getMetricLogTime(message) || index,
].join(':');

const formatMetricLogValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '-';
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) return numericValue.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return String(value);
};

const formatAverageInterval = (messages: DeviceMetricLog[]) => {
  const times = messages
    .map((message) => new Date(getMetricLogTime(message)).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((first, second) => first - second);
  if (times.length < 2) return '-';
  const intervals = times.slice(1).map((time, index) => time - times[index]).filter((interval) => interval > 0);
  if (intervals.length === 0) return '-';
  const averageMs = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  return formatDeviceAge(averageMs).replace(' ago', '');
};

const normalizeTopicList = (topics?: string[] | string) => (
  Array.isArray(topics)
    ? topics
    : String(topics || '').split(',')
).map((topic) => topic.trim()).filter(Boolean);

const mqttTopicMatches = (filter: string, topic: string) => {
  const filterParts = filter.split('/');
  const topicParts = topic.split('/');
  for (let index = 0; index < filterParts.length; index += 1) {
    const filterPart = filterParts[index];
    const topicPart = topicParts[index];
    if (filterPart === '#') return true;
    if (filterPart === '+') {
      if (topicPart === undefined) return false;
      continue;
    }
    if (filterPart !== topicPart) return false;
  }
  return filterParts.length === topicParts.length;
};

const getDeviceIdFromMetricLog = (message: DeviceMetricLog) => String(message.device_id || message.deviceId || message.id || '');

export function DeviceDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { devices: storedDevices, language, updateDevice, removeDeviceFromMyDevices, currentUser } = useAppStore();
  const devices = useRuntimeDevices(storedDevices);
  const t = translations[language];

  const storedDevice = storedDevices.find(d => d.id === id);
  const device = devices.find(d => d.id === id);
  const appProfile = getUserAppProfile(currentUser);
  const isSimpleProfile = appProfile === 'simple';
  const hasDeviceAccess = Boolean(device && canAccessDeviceData(currentUser, device));
  const [isEditing, setIsEditing] = useState(false);

  const [controlValues, setControlValues] = useState<Record<string, any>>({});
  const [parameterNames, setParameterNames] = useState<Record<string, string>>({});
  const [controlMessage, setControlMessage] = useState('');
  const [submittingControlId, setSubmittingControlId] = useState('');
  const [controlCooldowns, setControlCooldowns] = useState<Record<string, number>>({});
  const [editingControl, setEditingControl] = useState<DeviceControlDefinition | null>(null);
  const [controlDraft, setControlDraft] = useState<DeviceControlDefinition | null>(null);
  const [controlOptionsDraft, setControlOptionsDraft] = useState('');
  const [controlFieldsDraft, setControlFieldsDraft] = useState('');
  const [metricLogs, setMetricLogs] = useState<DeviceMetricLog[]>([]);
  const [metricLogsLoading, setMetricLogsLoading] = useState(false);
  const [metricLogsError, setMetricLogsError] = useState('');
  const [metricLogMetric, setMetricLogMetric] = useState('');
  const [metricLogLimit, setMetricLogLimit] = useState(50);
  const [metricMappingsDraft, setMetricMappingsDraft] = useState<DeviceMetricMapping[]>([]);
  const [metricMappingMessage, setMetricMappingMessage] = useState('');
  const [dataSourcesSnapshot, setDataSourcesSnapshot] = useState<DataSourceSnapshot | null>(null);
  const [diagnosticsMessage, setDiagnosticsMessage] = useState('');
  const controlDefinitions = getDeviceControlDefinitions(device);
  const canEditDevice = currentUser?.role !== 'Demo' && ['Owner', 'Admin', 'Engineer', 'Operator'].includes(currentUser?.role || '');
  const canControl = canIssueControlCommand(currentUser, device.id);

  useEffect(() => {
    if (!device) return;
    setControlValues({
      ...(device.config?.controlState || {}),
      ...Object.fromEntries(controlDefinitions.map((control) => [
        control.id,
        device.config?.controlState?.[control.id] ?? control.defaultValue ?? '',
      ])),
    });
  }, [device?.id]);

  const queryMetricLogs = async () => {
    if (isSimpleProfile) {
      setMetricLogs([]);
      setMetricLogsError('');
      setMetricLogsLoading(false);
      return;
    }
    const targetDevice = storedDevice || device;
    if (!targetDevice) return;

    setMetricLogsLoading(true);
    setMetricLogsError('');

    try {
      const deviceIds = Array.from(new Set([
        targetDevice.config?.externalDeviceId,
        targetDevice.id,
      ].filter(Boolean)));
      const responses = await Promise.all(deviceIds.map(async (deviceIdValue) => {
        const params = new URLSearchParams();
        params.set('deviceId', String(deviceIdValue));
        params.set('limit', String(metricLogLimit));
        const response = await fetch(`/api/telemetry?${params.toString()}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `Telemetry query failed: ${response.status}`);
        return Array.isArray(payload.messages) ? payload.messages as DeviceMetricLog[] : [];
      }));

      const byKey = new Map<string, DeviceMetricLog>();
      responses.flat().forEach((message, index) => {
        byKey.set(getMetricLogKey(message, index), message);
      });
      setMetricLogs(Array.from(byKey.values()).sort((first, second) => (
        new Date(getMetricLogTime(second)).getTime() - new Date(getMetricLogTime(first)).getTime()
      )));
    } catch (error) {
      setMetricLogs([]);
      setMetricLogsError(error instanceof Error ? error.message : 'Failed to load device metric logs.');
    } finally {
      setMetricLogsLoading(false);
    }
  };

  useEffect(() => {
    if (isSimpleProfile) {
      setMetricLogs([]);
      setMetricLogsError('');
      setMetricLogsLoading(false);
      return;
    }
    queryMetricLogs();
  }, [isSimpleProfile, storedDevice?.id, storedDevice?.config?.externalDeviceId, metricLogMetric, metricLogLimit]);

  useEffect(() => {
    setMetricMappingsDraft(getMetricMappings(storedDevice || device));
    setMetricMappingMessage('');
  }, [storedDevice?.id, device?.id]);

  useEffect(() => {
    if (isSimpleProfile) {
      setDataSourcesSnapshot(null);
      return;
    }
    let cancelled = false;
    const loadDataSources = async () => {
      try {
        const response = await fetch('/api/data-sources');
        const payload = await response.json();
        if (!cancelled && response.ok) setDataSourcesSnapshot(payload);
      } catch (error) {
        if (!cancelled) setDataSourcesSnapshot(null);
      }
    };
    loadDataSources();
    const intervalId = window.setInterval(loadDataSources, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isSimpleProfile]);

  const metricLogOptions = Array.from(new Set([
    ...Object.keys(storedDevice?.metrics || {}),
    ...Object.keys(device?.metrics || {}),
    ...metricLogs.flatMap((message) => Object.keys(message.metrics || {})),
  ])).sort();

  const rawMetricOptions = Array.from(new Set([
    ...metricLogs.flatMap((message) => Object.keys(message.metrics || {})),
    ...metricMappingsDraft.map((mapping) => mapping.rawKey),
  ])).sort();
  const discoveredMetricKeys = rawMetricOptions.length ? rawMetricOptions : metricLogOptions;
  const mappedRawKeys = new Set(metricMappingsDraft.map((mapping) => mapping.rawKey));
  const unmappedMetricKeys = rawMetricOptions.filter((key) => !mappedRawKeys.has(key));
  const invalidMetricKeys = Array.from(new Set(
    metricLogs.flatMap((message) => (
      Object.entries(message.metrics || {})
        .filter(([, value]) => value !== null && value !== undefined && value !== '' && !Number.isFinite(Number(value)))
        .map(([key]) => key)
    ))
  )).sort();

  if (!device || !hasDeviceAccess) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Device Unavailable</h2>
        <p>The requested device could not be found or is outside your data access scope.</p>
        <button onClick={() => navigate((location.state as { from?: string } | null)?.from || '/devices')} className="mt-4 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-500">
          Back
        </button>
      </div>
    );
  }

  if (isEditing) {
    return <DeviceForm deviceId={device.id} onClose={() => setIsEditing(false)} />;
  }

  const IconComp = getDeviceIcon(device.icon);
  const dataQuality = getDeviceDataQuality(storedDevice || device);
  const qualityClassName = dataQuality.state === 'online'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
    : dataQuality.state === 'warning'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
      : dataQuality.state === 'stale'
        ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300'
        : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3006';
  const expectedExternalId = device.config?.externalDeviceId || device.id;
  const expectedMqttTopic = getMqttTelemetryTopic(device);
  const expectedHttpEndpoint = getTelemetryEndpoint(device, origin);
  const latestRawTelemetry = metricLogs[0] || null;
  const latestRawTopic = String(latestRawTelemetry?.topic || latestRawTelemetry?.mqtt_topic || '');
  const latestRawSource = String(latestRawTelemetry?.source || '');
  const mappingCoverage = rawMetricOptions.length === 0 ? 0 : Math.round((mappedRawKeys.size / rawMetricOptions.length) * 100);
  const matchingMqttChannels = (dataSourcesSnapshot?.mqttChannels || []).filter((channel) => (
    normalizeTopicList(channel.topics).some((topic) => mqttTopicMatches(topic, expectedMqttTopic) || mqttTopicMatches(topic, latestRawTopic))
  ));
  const connectedMatchingMqttChannels = matchingMqttChannels.filter((channel) => dataSourcesSnapshot?.mqttStatuses?.[channel.id]?.state === 'connected');
  const matchedHttpChannel = (dataSourcesSnapshot?.httpPushChannels || []).find((channel) => latestRawSource.includes(channel.id));
  const telemetryExample = device.config?.dataSource === 'mqtt' ? buildMqttExample(device) : buildCurlRequest(device, origin);

  const copyDiagnosticsText = async (text: string, successMessage: string) => {
    setDiagnosticsMessage('');
    try {
      await navigator.clipboard.writeText(text);
      setDiagnosticsMessage(successMessage);
    } catch (error) {
      setDiagnosticsMessage('Copy failed. Select the text and copy it manually.');
    }
  };

  const updateControl = (key: string, value: any) => {
    setControlValues(prev => ({ ...prev, [key]: value }));
  };

  const submitDeviceControl = async (controlId: string, nextControlValues = controlValues) => {
    const definition = controlDefinitions.find((control) => control.id === controlId);
    if (!definition || !canIssueControlCommand(currentUser, device.id, definition.id)) {
      setControlMessage('Current user is not allowed to issue this control action.');
      return false;
    }

    setSubmittingControlId(controlId);
    setControlMessage('');
    const parameters = buildControlParameters(definition, nextControlValues, parameterNames[controlId]);

    try {
      const response = await fetch('/api/device-commands', {
        method: 'POST',
        headers: apiJsonHeaders(currentUser),
        body: JSON.stringify({
          deviceId: device.id,
          command: definition.id,
          parameters,
          requestedBy: currentUser?.name || currentUser?.email || 'Unknown user',
          requestedByRole: currentUser?.role || 'Viewer',
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setControlMessage(payload.error || 'Control command rejected.');
        return false;
      }

      updateDevice(device.id, {
        config: {
          ...(device.config || {}),
          controlState: {
            ...(device.config?.controlState || {}),
            ...buildControlStatePatch(definition, nextControlValues, parameters),
          },
        },
      });
      setControlMessage(`${definition.label}: ${payload.command?.status || 'queued'} - ${payload.command?.result || 'Command recorded.'}`);
      return true;
    } catch (error) {
      setControlMessage('Failed to submit control command.');
      return false;
    } finally {
      setSubmittingControlId('');
    }
  };

  const createControlDraft = (): DeviceControlDefinition => ({
    id: `custom_${Date.now().toString(36)}`,
    label: 'Custom Command',
    description: 'Custom device control action.',
    iconId: 'send',
    valueType: 'none',
    parameterKey: 'value',
    defaultValue: '',
    options: [],
    fields: [],
  });

  const openControlEditor = (control?: DeviceControlDefinition) => {
    const draft = control ? sanitizeControlDefinition(control) : createControlDraft();
    setEditingControl(control || null);
    setControlDraft({
      ...draft,
      options: draft.options || [],
      fields: draft.fields || [],
      iconId: draft.iconId || 'send',
    });
    setControlOptionsDraft((draft.options || []).map((option) => `${option.value}:${option.label}`).join('\n'));
    setControlFieldsDraft(JSON.stringify(draft.fields || [], null, 2));
  };

  const saveControlDraft = () => {
    if (!controlDraft) return;
    let nextDraft = { ...controlDraft };
    const parseToggleMappedValue = (value: unknown) => {
      const rawValue = String(value ?? '').trim();
      if (!rawValue) return undefined;
      if (rawValue === 'true') return true;
      if (rawValue === 'false') return false;
      const numericValue = Number(rawValue);
      return Number.isFinite(numericValue) && rawValue !== '' ? numericValue : rawValue;
    };
    if (nextDraft.valueType === 'toggle') {
      nextDraft = {
        ...nextDraft,
        toggleOnValue: parseToggleMappedValue(nextDraft.toggleOnValue),
        toggleOffValue: parseToggleMappedValue(nextDraft.toggleOffValue),
      };
    } else {
      nextDraft = {
        ...nextDraft,
        toggleOnValue: undefined,
        toggleOffValue: undefined,
      };
    }
    if (nextDraft.valueType === 'select') {
      nextDraft = {
        ...nextDraft,
        options: controlOptionsDraft.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
          const [value, ...labelParts] = line.split(':');
          return { value: value.trim(), label: (labelParts.join(':').trim() || value.trim()) };
        }),
      };
    }
    if (nextDraft.valueType === 'parameter_group') {
      try {
        const fields = JSON.parse(controlFieldsDraft || '[]');
        if (!Array.isArray(fields)) {
          setControlMessage('Parameter Group Fields JSON must be an array.');
          return;
        }
        nextDraft = { ...nextDraft, fields };
      } catch {
        setControlMessage('Parameter Group Fields JSON is not valid JSON.');
        return;
      }
    }
    const currentDefinitions = controlDefinitions.map(sanitizeControlDefinition);
    const nextDefinition = sanitizeControlDefinition(nextDraft);
    const exists = editingControl && currentDefinitions.some((control) => control.id === editingControl.id);
    const nextDefinitions = exists
      ? currentDefinitions.map((control) => control.id === editingControl.id ? nextDefinition : control)
      : [...currentDefinitions, nextDefinition];

    updateDevice(device.id, {
      config: {
        ...(device.config || {}),
        controlDefinitions: nextDefinitions,
      },
    });
    setEditingControl(null);
    setControlDraft(null);
    setControlOptionsDraft('');
    setControlFieldsDraft('');
  };

  const deleteControlDefinition = async (controlId: string) => {
    const control = controlDefinitions.find((item) => item.id === controlId);
    if (!(await confirmDelete({ title: 'Delete control action', itemName: control?.label || 'this control action', description: 'This control will be removed from the device configuration.' }))) return;
    const nextDefinitions = controlDefinitions
      .filter((control) => control.id !== controlId)
      .map(sanitizeControlDefinition);

    updateDevice(device.id, {
      config: {
        ...(device.config || {}),
        controlDefinitions: nextDefinitions,
      },
    });
  };

  const metricValue = (key: string) => Number(device.metrics?.[key]) || 0;

  const metricUnit = (key: string) => {
    const mappedUnit = getMetricUnit(device, key);
    if (mappedUnit) return mappedUnit;
    if (key.includes('power') || key === 'pv_power') return 'W';
    if (key.includes('energy') || key.includes('generation')) return 'kWh';
    if (key.includes('temp')) return 'deg C';
    if (key.includes('pressure')) return 'bar';
    if (key.includes('humidity') || key.includes('efficiency') || key.includes('battery') || key.includes('soc') || key.includes('cpu') || key.includes('ram') || key.includes('leakage')) return '%';
    if (key.includes('flow')) return 'm3/h';
    if (key.includes('hours') || key.includes('uptime')) return 'h';
    if (key.includes('voltage')) return 'V';
    if (key.includes('current')) return 'A';
    return '';
  };

  const metricMax = (key: string, value: number) => {
    if (key.includes('temp') && value < 0) return 0;
    if (key.includes('humidity') || key.includes('efficiency') || key.includes('battery') || key.includes('soc') || key.includes('cpu') || key.includes('ram') || key.includes('leakage')) return 100;
    if (key.includes('pressure')) return 10;
    if (key.includes('power') || key === 'pv_power') return Math.max(25000, value * 1.2);
    if (key.includes('flow')) return Math.max(150, value * 1.2);
    if (key.includes('voltage')) return 800;
    return Math.max(100, value * 1.2);
  };

  const metricColor = (key: string, value: number) => {
    if (device.status === 'warning') return 'bg-amber-500';
    if ((key.includes('temp') && value >= 80) || key.includes('leakage')) return 'bg-red-500';
    if (key.includes('battery') && value < 25) return 'bg-amber-500';
    if (key.includes('power') || key === 'pv_power') return 'bg-orange-500';
    return 'bg-emerald-500';
  };

  const primaryMetricKeysByType: Record<string, { key: string; label: string; icon: any }[]> = {
    energy_meter: [
      { key: 'power', label: 'Power Draw', icon: Zap },
      { key: 'energy', label: 'Energy Today', icon: Activity },
      { key: 'voltage', label: 'Voltage', icon: Gauge },
      { key: 'current', label: 'Current', icon: Activity },
    ],
    temperature_sensor: [
      { key: 'temperature', label: 'Temperature', icon: Thermometer },
      { key: 'humidity', label: 'Humidity', icon: Droplets },
      { key: 'door_open_events', label: 'Door Events', icon: DoorOpen },
      { key: 'battery', label: 'Battery', icon: BatteryCharging },
    ],
    air_compressor: [
      { key: 'pressure', label: 'Air Pressure', icon: Gauge },
      { key: 'temperature', label: 'Temperature', icon: Thermometer },
      { key: 'power', label: 'Power Draw', icon: Zap },
      { key: 'leakage_rate', label: 'Leakage Rate', icon: Wind },
    ],
    pump_controller: [
      { key: 'flow_rate', label: 'Flow Rate', icon: Waves },
      { key: 'pressure', label: 'Pressure', icon: Gauge },
      { key: 'running_hours', label: 'Runtime', icon: Timer },
      { key: 'power', label: 'Power Draw', icon: Zap },
    ],
    solar_inverter: [
      { key: 'power', label: 'PV Power', icon: Zap },
      { key: 'energy_today', label: 'Generation Today', icon: Activity },
      { key: 'efficiency', label: 'Efficiency', icon: Activity },
      { key: 'battery_soc', label: 'Battery SOC', icon: BatteryCharging },
    ],
    gateway: [
      { key: 'cpu', label: 'CPU Load', icon: Cpu },
      { key: 'ram', label: 'Memory', icon: HardDrive },
      { key: 'uptime', label: 'Uptime', icon: Timer },
    ],
    dtu: [
      { key: 'voltage', label: 'Voltage', icon: Gauge },
      { key: 'signal', label: 'Signal', icon: Radio },
      { key: 'packet_loss', label: 'Packet Loss', icon: Activity },
    ],
    rtu: [
      { key: 'memory', label: 'Memory', icon: HardDrive },
      { key: 'voltage', label: 'Voltage', icon: Gauge },
      { key: 'signal', label: 'Signal', icon: Radio },
    ],
    plc: [
      { key: 'io_rate', label: 'I/O Rate', icon: Activity },
      { key: 'cycle_time', label: 'Cycle Time', icon: Timer },
      { key: 'cpu', label: 'CPU Load', icon: Cpu },
    ],
    io_module: [
      { key: 'di_on', label: 'Digital Inputs On', icon: Activity },
      { key: 'do_on', label: 'Digital Outputs On', icon: Activity },
      { key: 'ai_value', label: 'Analog Input', icon: Gauge },
      { key: 'voltage', label: 'Supply Voltage', icon: Zap },
    ],
    relay_module: [
      { key: 'relay_on', label: 'Relays On', icon: Activity },
      { key: 'switching_count', label: 'Switch Count', icon: Timer },
      { key: 'coil_voltage', label: 'Coil Voltage', icon: Zap },
    ],
    valve_controller: [
      { key: 'position', label: 'Valve Position', icon: Gauge },
      { key: 'command_position', label: 'Command Position', icon: Activity },
      { key: 'pressure', label: 'Pressure', icon: Gauge },
      { key: 'cycles', label: 'Cycles', icon: Timer },
    ],
    vfd: [
      { key: 'frequency', label: 'Frequency', icon: Activity },
      { key: 'motor_speed', label: 'Motor Speed', icon: Gauge },
      { key: 'current', label: 'Current', icon: Activity },
      { key: 'fault_code', label: 'Fault Code', icon: AlertTriangle },
    ],
    hmi: [
      { key: 'cpu', label: 'CPU Load', icon: Cpu },
      { key: 'ram', label: 'Memory', icon: HardDrive },
      { key: 'disk', label: 'Disk', icon: HardDrive },
      { key: 'uptime', label: 'Uptime', icon: Timer },
    ],
    industrial_pc: [
      { key: 'cpu', label: 'CPU Load', icon: Cpu },
      { key: 'ram', label: 'Memory', icon: HardDrive },
      { key: 'disk', label: 'Disk', icon: HardDrive },
      { key: 'uptime', label: 'Uptime', icon: Timer },
    ],
    robot: [
      { key: 'cycle_time', label: 'Cycle Time', icon: Timer },
      { key: 'utilization', label: 'Utilization', icon: Activity },
      { key: 'error_count', label: 'Errors', icon: AlertTriangle },
      { key: 'axis_load', label: 'Axis Load', icon: Gauge },
    ],
    camera: [
      { key: 'online_streams', label: 'Streams', icon: Activity },
      { key: 'fps', label: 'FPS', icon: Gauge },
      { key: 'bitrate', label: 'Bitrate', icon: Activity },
      { key: 'storage', label: 'Storage', icon: HardDrive },
    ],
    ups: [
      { key: 'battery_soc', label: 'Battery SOC', icon: BatteryCharging },
      { key: 'voltage', label: 'Voltage', icon: Gauge },
      { key: 'temperature', label: 'Temperature', icon: Thermometer },
      { key: 'health', label: 'Health', icon: Activity },
    ],
    battery_bms: [
      { key: 'battery_soc', label: 'Battery SOC', icon: BatteryCharging },
      { key: 'voltage', label: 'Voltage', icon: Gauge },
      { key: 'temperature', label: 'Temperature', icon: Thermometer },
      { key: 'health', label: 'Health', icon: Activity },
    ],
    weather_station: [
      { key: 'temperature', label: 'Temperature', icon: Thermometer },
      { key: 'humidity', label: 'Humidity', icon: Droplets },
      { key: 'wind_speed', label: 'Wind Speed', icon: Wind },
      { key: 'rainfall', label: 'Rainfall', icon: Droplets },
    ],
    flow_meter: [
      { key: 'flow_rate', label: 'Flow Rate', icon: Waves },
      { key: 'total_flow', label: 'Total Flow', icon: Activity },
      { key: 'temperature', label: 'Temperature', icon: Thermometer },
    ],
    pressure_sensor: [
      { key: 'pressure', label: 'Pressure', icon: Gauge },
      { key: 'temperature', label: 'Temperature', icon: Thermometer },
      { key: 'battery', label: 'Battery', icon: BatteryCharging },
    ],
    level_sensor: [
      { key: 'level', label: 'Level', icon: Gauge },
      { key: 'volume', label: 'Volume', icon: Activity },
      { key: 'battery', label: 'Battery', icon: BatteryCharging },
    ],
    vibration_sensor: [
      { key: 'vibration', label: 'Vibration', icon: Activity },
      { key: 'velocity', label: 'Velocity', icon: Gauge },
      { key: 'bearing_temp', label: 'Bearing Temp', icon: Thermometer },
      { key: 'battery', label: 'Battery', icon: BatteryCharging },
    ],
  };

  const mappedPrimaryMetricKeys = getPrimaryMappedMetricKeys(device)
    .filter((key) => device.metrics?.[key] !== undefined)
    .map((key) => ({ key, label: getMetricLabel(device, key), icon: Activity }));
  const primaryMetricKeys = mappedPrimaryMetricKeys.length
    ? mappedPrimaryMetricKeys
    : primaryMetricKeysByType[device.type] || Object.keys(device.metrics || {}).slice(0, 4).map((key) => ({ key, label: getMetricLabel(device, key), icon: Activity }));
  const primaryMetrics = primaryMetricKeys.filter((metric) => device.metrics?.[metric.key] !== undefined);
  const primaryMetricSet = new Set(primaryMetrics.map((metric) => metric.key));
  const secondaryMetrics = Object.entries(device.metrics || {}).filter(([key]) => !primaryMetricSet.has(key));

  const formatConfigValue = (value: unknown) => {
    if (value && typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const updateMetricMappingDraft = (rawKey: string, patch: Partial<DeviceMetricMapping>) => {
    setMetricMappingsDraft((current) => {
      const existing = current.find((mapping) => mapping.rawKey === rawKey);
      const nextMapping = {
        rawKey,
        standardKey: patch.standardKey || existing?.standardKey || rawKey,
        displayName: patch.displayName ?? existing?.displayName ?? getMetricLabel(device, patch.standardKey || existing?.standardKey || rawKey),
        unit: patch.unit ?? existing?.unit ?? inferMetricUnit(patch.standardKey || existing?.standardKey || rawKey),
        precision: patch.precision ?? existing?.precision ?? 2,
        primary: patch.primary ?? existing?.primary ?? false,
      };
      return existing
        ? current.map((mapping) => mapping.rawKey === rawKey ? { ...mapping, ...nextMapping } : mapping)
        : [...current, nextMapping].sort((first, second) => first.rawKey.localeCompare(second.rawKey));
    });
    setMetricMappingMessage('');
  };

  const deleteMetricMappingDraft = async (rawKey: string) => {
    if (!(await confirmDelete({ title: 'Delete metric mapping', itemName: rawKey, description: 'This raw telemetry field will no longer be mapped to a standard metric.' }))) return;
    setMetricMappingsDraft((current) => current.filter((mapping) => mapping.rawKey !== rawKey));
    setMetricMappingMessage('');
  };

  const saveMetricMappings = () => {
    const nextMappings = metricMappingsDraft
      .map((mapping) => ({
        rawKey: String(mapping.rawKey || '').trim(),
        standardKey: String(mapping.standardKey || '').trim(),
        displayName: String(mapping.displayName || '').trim(),
        unit: String(mapping.unit || '').trim(),
        precision: Math.max(0, Math.min(6, Number(mapping.precision ?? 2))),
        primary: Boolean(mapping.primary),
      }))
      .filter((mapping) => mapping.rawKey && mapping.standardKey);

    const nextDeviceForMapping = {
      ...device,
      config: {
        ...(device.config || {}),
        metricMappings: nextMappings,
      },
    };

    updateDevice(device.id, {
      metrics: applyMetricMappingsToMetrics(nextDeviceForMapping, device.metrics || {}),
      config: {
        ...(device.config || {}),
        metricMappings: nextMappings,
        metricMapping: Object.fromEntries(nextMappings.map((mapping) => [mapping.rawKey, mapping.standardKey])),
      },
    });
    setMetricMappingMessage('Metric mappings saved. New telemetry will populate mapped standard metrics automatically.');
  };

  const handleRemoveSimpleDevice = async () => {
    if (!(await confirmDelete({
      title: 'Remove from My Devices',
      itemName: device.name,
      description: 'This removes the device from your My Devices list and releases its claim so it can be bound again. It does not delete device models, inventory records, or historical telemetry.',
      confirmLabel: 'Remove Device',
    }))) return;

    removeDeviceFromMyDevices(device.id, currentUser);
    navigate('/devices');
  };

  const renderMetricCard = (metric: { key: string; label: string; icon: any }) => {
    const value = metricValue(metric.key);
    const max = metricMax(metric.key, value);
    const percent = max === 0 ? 100 : Math.max(0, Math.min(100, Math.abs(value) / max * 100));
    const Icon = metric.icon;
    const precision = getMetricPrecision(device, metric.key);

    return (
      <div key={metric.key} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800/50 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-mono uppercase tracking-wider text-slate-500">{metric.label}</p>
            <p className="mt-2 truncate text-2xl font-semibold text-slate-900 dark:text-white">
              {value.toFixed(value % 1 === 0 ? 0 : precision)}
              <span className="ml-1 text-sm font-normal text-slate-500">{metricUnit(metric.key)}</span>
            </p>
          </div>
          <div className="rounded-md bg-white p-2 text-orange-500 ring-1 ring-slate-200 dark:bg-[#1c2128] dark:ring-slate-800">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div className={cn('h-full rounded-full', metricColor(metric.key, value))} style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 truncate text-[10px] font-mono text-slate-400">{metric.key}</p>
      </div>
    );
  };

  const getSimpleControlActionLabel = (control: DeviceControlDefinition, nextControlValues = controlValues) => {
    if (control.valueType !== 'toggle') return control.label;
    const isTurningOn = Boolean(nextControlValues[control.id]);
    const actionText = `${control.id} ${control.label}`.toLowerCase();
    if (/lock|door|open|unlock/.test(actionText)) return isTurningOn ? 'Unlock' : 'Lock';
    if (/power|start|enable/.test(actionText)) return isTurningOn ? 'Turn On' : 'Turn Off';
    return isTurningOn ? 'Enable' : 'Disable';
  };

  const confirmAndSubmitSimpleControl = async (control: DeviceControlDefinition, nextControlValues = controlValues) => {
    if ((controlCooldowns[control.id] || 0) > Date.now()) {
      setControlMessage('Command already queued. Please wait a moment.');
      return false;
    }

    const actionLabel = getSimpleControlActionLabel(control, nextControlValues);
    if (requiresControlConfirmation(control)) {
      const confirmed = await confirmDelete({
        title: 'Confirm Device Action',
        itemName: device.name,
        description: `This will send "${actionLabel}" to ${device.name}. Continue only if you are sure this action is safe right now.`,
        confirmLabel: actionLabel,
      });
      if (!confirmed) return false;
    }

    const submitted = await submitDeviceControl(control.id, nextControlValues);
    if (submitted) {
      setControlCooldowns((current) => ({ ...current, [control.id]: Date.now() + 3000 }));
      window.setTimeout(() => {
        setControlCooldowns((current) => {
          const next = { ...current };
          delete next[control.id];
          return next;
        });
      }, 3000);
    }
    return submitted;
  };

  const renderSimpleControlCard = (control: DeviceControlDefinition) => {
    const Icon = control.icon || Play;
    const currentValue = controlValues[control.id] ?? control.defaultValue ?? '';
    const isSubmitting = submittingControlId === control.id;
    const isCoolingDown = Boolean((controlCooldowns[control.id] || 0) > Date.now());
    const canUseControl = canIssueControlCommand(currentUser, device.id, control.id);
    const isDisabled = !canUseControl || isSubmitting || isCoolingDown;

    return (
      <div key={control.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#1c2128]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-900 dark:text-white">{control.label}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{control.description}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/20">
            <Icon className="h-5 w-5" />
          </div>
        </div>

        {control.valueType === 'toggle' && (
          <button
            type="button"
            disabled={isDisabled}
            onClick={async () => {
              const nextValue = !Boolean(controlValues[control.id]);
              const nextControlValues = { ...controlValues, [control.id]: nextValue };
              const submitted = await confirmAndSubmitSimpleControl(control, nextControlValues);
              if (submitted) setControlValues(nextControlValues);
            }}
            className={cn(
              'relative mt-5 flex h-16 w-full items-center overflow-hidden rounded-full border-2 px-2 text-lg font-black tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-60',
              Boolean(controlValues[control.id])
                ? 'justify-start border-slate-950 bg-slate-950 text-white dark:border-orange-500 dark:bg-orange-600'
                : 'justify-end border-slate-950 bg-white text-slate-950 dark:border-slate-300 dark:bg-slate-950 dark:text-white'
            )}
          >
            <span className="relative z-10 px-5">{Boolean(controlValues[control.id]) ? 'ON' : 'OFF'}</span>
            <span
              className={cn(
                'absolute h-12 w-12 rounded-full shadow transition-all',
                Boolean(controlValues[control.id])
                  ? 'left-2 bg-white'
                  : 'right-2 bg-slate-950 dark:bg-white'
              )}
            />
          </button>
        )}

        {control.valueType === 'select' && (
          <select
            value={currentValue}
            onChange={(event) => updateControl(control.id, event.target.value)}
            className="mt-5 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-orange-500 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            {control.options?.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        )}

        {(control.valueType === 'range' || control.valueType === 'slider') && (
          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
              <span>{control.min ?? 0}</span>
              <span className="rounded-full bg-orange-50 px-3 py-1 font-mono text-sm font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                {currentValue}{control.unit}
              </span>
              <span>{control.max ?? 100}</span>
            </div>
            <input
              type="range"
              min={control.min ?? 0}
              max={control.max ?? 100}
              step={control.step ?? 1}
              value={currentValue}
              onChange={(event) => updateControl(control.id, Number(event.target.value))}
              className="h-3 w-full accent-orange-600"
            />
          </div>
        )}

        {control.valueType === 'number' && (
          <div className="mt-5 flex h-12 overflow-hidden rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950">
            <input
              type="number"
              min={control.min}
              max={control.max}
              step={control.step ?? 1}
              value={currentValue}
              onChange={(event) => updateControl(control.id, Number(event.target.value))}
              className="min-w-0 flex-1 border-0 bg-transparent px-4 text-base text-slate-900 focus:ring-0 dark:text-white"
            />
            {control.unit && <span className="flex items-center px-4 text-sm text-slate-500">{control.unit}</span>}
          </div>
        )}

        {control.valueType === 'text' && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <input
              value={parameterNames[control.id] || ''}
              onChange={(event) => setParameterNames((current) => ({ ...current, [control.id]: event.target.value }))}
              placeholder="parameter"
              className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 focus:border-orange-500 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <input
              value={currentValue}
              onChange={(event) => updateControl(control.id, event.target.value)}
              placeholder="value"
              className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 focus:border-orange-500 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
        )}

        {control.valueType === 'parameter_group' && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {control.fields?.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">{field.label}</span>
                {field.valueType === 'select' ? (
                  <select
                    value={controlValues[`${control.id}.${field.key}`] ?? field.defaultValue ?? ''}
                    onChange={(event) => updateControl(`${control.id}.${field.key}`, event.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-orange-500 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex h-12 overflow-hidden rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950">
                    <input
                      type={field.valueType === 'number' ? 'number' : 'text'}
                      value={controlValues[`${control.id}.${field.key}`] ?? field.defaultValue ?? ''}
                      onChange={(event) => updateControl(`${control.id}.${field.key}`, field.valueType === 'number' ? Number(event.target.value) : event.target.value)}
                      className="min-w-0 flex-1 border-0 bg-transparent px-4 text-base text-slate-900 focus:ring-0 dark:text-white"
                    />
                    {field.unit && <span className="flex items-center px-3 text-sm text-slate-500">{field.unit}</span>}
                  </div>
                )}
              </label>
            ))}
          </div>
        )}

        {control.valueType !== 'toggle' && (
          <button
            type="button"
            onClick={() => confirmAndSubmitSimpleControl(control)}
            disabled={isDisabled}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
          >
            <Play className="h-4 w-4" />
            {isSubmitting ? 'Sending...' : isCoolingDown ? 'Queued' : 'Send Command'}
          </button>
        )}
      </div>
    );
  };

  if (isSimpleProfile) {
    const routeState = (location.state as { from?: string; justClaimed?: boolean } | null);
    const justClaimed = Boolean(routeState?.justClaimed);
    const hasLiveMetrics = Object.keys(device.metrics || {}).length > 0;
    const visiblePrimaryMetrics = primaryMetrics.length
      ? primaryMetrics
      : Object.keys(device.metrics || {}).slice(0, 4).map((key) => ({ key, label: getMetricLabel(device, key), icon: Activity }));

    return (
      <div className="mx-auto max-w-4xl space-y-5 pb-10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate((location.state as { from?: string } | null)?.from || '/devices')}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-orange-600 dark:border-slate-800 dark:bg-[#1c2128] dark:text-slate-300"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Device</p>
            <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{device.name}</h1>
          </div>
          {canEditDevice && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:text-orange-600 dark:border-slate-700 dark:bg-[#1c2128] dark:text-slate-200"
            >
              <Edit2 className="h-4 w-4" />
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={handleRemoveSimpleDevice}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700 shadow-sm hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
            title="Remove from my devices"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {justClaimed && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            <p className="font-semibold">Device added successfully.</p>
            <p className="mt-1 text-emerald-700/80 dark:text-emerald-200/80">
              You can operate it here. If data is not visible yet, power on the device and make sure it is connected to the network.
            </p>
          </div>
        )}

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#1c2128]">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/20">
              <IconComp className="h-10 w-10" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase', qualityClassName)}>
                  <span className={cn('h-2 w-2 rounded-full', dataQuality.state === 'online' ? 'bg-emerald-500' : dataQuality.state === 'warning' ? 'bg-amber-500' : dataQuality.state === 'stale' ? 'bg-orange-500' : 'bg-red-500')} />
                  {dataQuality.label}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  {(t.devices.types as any)[device.type] || device.type}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">ID: {device.id}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Last seen: {formatDeviceAge(dataQuality.ageMs)}</p>
            </div>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Status</h2>
            <span className="text-xs text-slate-500">{hasLiveMetrics ? `${Object.keys(device.metrics || {}).length} metrics` : 'No live data'}</span>
          </div>
          {hasLiveMetrics ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visiblePrimaryMetrics.map(renderMetricCard)}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-[#1c2128]">
              <p className="font-semibold text-slate-700 dark:text-slate-200">Waiting for device data</p>
              <p className="mt-1">Power on the device and confirm it is connected. The status will update after the first telemetry message arrives.</p>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Controls</h2>
          {!canControl && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              Current role can view controls only.
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {controlDefinitions.map(renderSimpleControlCard)}
            {controlDefinitions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-[#1c2128] sm:col-span-2">
                No control actions configured for this device.
              </div>
            )}
          </div>
          {controlMessage && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-[#1c2128] dark:text-slate-300">
              {controlMessage}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate((location.state as { from?: string } | null)?.from || '/devices')}
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
              <IconComp className="h-6 w-6 text-slate-500 dark:text-slate-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                {device.name}
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase",
                  qualityClassName
                )}>
                  {dataQuality.label}
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">ID: {device.id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-orange-600 dark:border-slate-700 dark:bg-[#1c2128] dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-orange-400"
          >
            <Edit2 className="h-4 w-4" />
            {t.devices.editDevice}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info Column */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#1c2128] rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-4 uppercase tracking-wider text-[11px] font-mono">
              <Info className="h-4 w-4" /> Attributes
            </h3>
            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">Type</span>
                <span className="text-slate-900 dark:text-slate-300">{(t.devices.types as any)[device.type] || device.type}</span>
              </div>
              <div className="flex justify-between pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">Tags</span>
                <span className="text-slate-900 dark:text-slate-300 flex gap-1 flex-wrap justify-end">
                  {device.tags?.map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {tag}
                    </span>
                  ))}
                </span>
              </div>
              <div className="flex justify-between pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">Last Seen</span>
                <span className="text-slate-900 dark:text-slate-300">{new Date(device.lastSeen).toLocaleString()}</span>
              </div>
              <div className="flex justify-between pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">Firmware</span>
                <span className="text-slate-900 dark:text-slate-300">{device.firmwareVersion}</span>
              </div>
              <div className="flex justify-between pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">External ID</span>
                <span className="text-slate-900 dark:text-slate-300">{device.config?.externalDeviceId || device.id}</span>
              </div>
              <div className="flex justify-between pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">Data Source</span>
                <span className="text-slate-900 dark:text-slate-300">{device.config?.dataSource || 'manual'}</span>
              </div>
              {(device.config?.mqttTopic || device.config?.apiPath) && (
                <div className="flex justify-between pb-3 border-b border-slate-100 dark:border-slate-800/50">
                  <span className="text-slate-500">Binding</span>
                  <span className="max-w-[180px] truncate text-right text-slate-900 dark:text-slate-300">{device.config?.mqttTopic || device.config?.apiPath}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-[#1c2128] rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-4 uppercase tracking-wider text-[11px] font-mono">
              <Settings className="h-4 w-4" /> Configuration
            </h3>
            {device.config && Object.keys(device.config).length > 0 ? (
              <div className="space-y-3 font-mono text-xs">
                {Object.entries(device.config).map(([key, value]) => (
                  <div key={key} className="flex justify-between pb-3 border-b border-slate-100 dark:border-slate-800/50 last:border-0 last:pb-0">
                    <span className="text-slate-500">{key}</span>
                    <span className="max-w-[14rem] truncate text-right text-slate-900 dark:text-slate-300" title={formatConfigValue(value)}>{formatConfigValue(value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No configuration properties set.</p>
            )}
          </div>

          <div className="bg-white dark:bg-[#1c2128] rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-4 uppercase tracking-wider text-[11px] font-mono">
              <AlertTriangle className="h-4 w-4" /> Data Quality
            </h3>
            <div className="space-y-3 font-mono text-xs">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">Realtime State</span>
                <span className={cn('rounded px-2 py-0.5 text-[10px] font-semibold uppercase', qualityClassName)}>{dataQuality.label}</span>
              </div>
              <div className="flex justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">Age</span>
                <span className="text-slate-900 dark:text-slate-300">{formatDeviceAge(dataQuality.ageMs)}</span>
              </div>
              <div className="flex justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">Freshness Timeout</span>
                <span className="text-slate-900 dark:text-slate-300">{dataQuality.timeoutSeconds}s</span>
              </div>
              <div className="flex justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">Offline Rule</span>
                <span className="text-slate-900 dark:text-slate-300">{dataQuality.isOfflineDetectionEnabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <div className="flex justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">Log Samples</span>
                <span className="text-slate-900 dark:text-slate-300">{metricLogs.length} / avg {formatAverageInterval(metricLogs)}</span>
              </div>
              <div className="pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Unmapped Fields</span>
                  <span className={cn('text-right', unmappedMetricKeys.length ? 'text-orange-600 dark:text-orange-300' : 'text-slate-900 dark:text-slate-300')}>{unmappedMetricKeys.length}</span>
                </div>
                {unmappedMetricKeys.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {unmappedMetricKeys.slice(0, 8).map((key) => <span key={key} className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">{key}</span>)}
                    {unmappedMetricKeys.length > 8 && <span className="text-[10px] text-slate-400">+{unmappedMetricKeys.length - 8}</span>}
                  </div>
                )}
              </div>
              <div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Invalid Values</span>
                  <span className={cn('text-right', invalidMetricKeys.length ? 'text-red-600 dark:text-red-300' : 'text-slate-900 dark:text-slate-300')}>{invalidMetricKeys.length}</span>
                </div>
                {invalidMetricKeys.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {invalidMetricKeys.slice(0, 8).map((key) => <span key={key} className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700 dark:bg-red-500/10 dark:text-red-300">{key}</span>)}
                  </div>
                )}
              </div>
              <p className="pt-2 text-[11px] leading-relaxed text-slate-500">{dataQuality.description}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-[#1c2128] rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] font-mono">
                <Radio className="h-4 w-4" /> Diagnostics
              </h3>
              <button
                type="button"
                onClick={() => copyDiagnosticsText(telemetryExample, 'Telemetry test example copied.')}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Test
              </button>
            </div>

            {diagnosticsMessage && (
              <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                {diagnosticsMessage}
              </div>
            )}

            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">Data Source</span>
                <span className="text-slate-900 dark:text-slate-300">{device.config?.dataSource || 'manual'}</span>
              </div>
              <div className="flex justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">Binding ID</span>
                <span className="max-w-[12rem] truncate text-right text-slate-900 dark:text-slate-300" title={expectedExternalId}>{expectedExternalId}</span>
              </div>
              <div className="flex justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">HTTP Endpoint</span>
                <span className="max-w-[12rem] truncate text-right text-slate-900 dark:text-slate-300" title={expectedHttpEndpoint}>{expectedHttpEndpoint}</span>
              </div>
              <div className="flex justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">MQTT Topic</span>
                <span className="max-w-[12rem] truncate text-right text-slate-900 dark:text-slate-300" title={expectedMqttTopic}>{expectedMqttTopic}</span>
              </div>
              <div className="pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">MQTT Match</span>
                  <span className={cn('text-right', connectedMatchingMqttChannels.length ? 'text-emerald-600 dark:text-emerald-300' : matchingMqttChannels.length ? 'text-amber-600 dark:text-amber-300' : 'text-slate-500')}>
                    {connectedMatchingMqttChannels.length ? 'Connected' : matchingMqttChannels.length ? 'Configured' : 'No matching subscriber'}
                  </span>
                </div>
                {matchingMqttChannels.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {matchingMqttChannels.slice(0, 3).map((channel) => {
                      const status = dataSourcesSnapshot?.mqttStatuses?.[channel.id];
                      return (
                        <div key={channel.id} className="rounded bg-slate-50 px-2 py-1 text-[10px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                          <Wifi className="mr-1 inline h-3 w-3 text-sky-500" />
                          {channel.name}: {status?.state || 'unknown'}{status?.lastTopic ? ` / ${status.lastTopic}` : ''}
                          {(status?.receivedCount || status?.acceptedCount || status?.rejectedCount) ? (
                            <span className="ml-1 text-slate-400">
                              R {status.receivedCount || 0} / A {status.acceptedCount || 0} / X {status.rejectedCount || 0}
                            </span>
                          ) : null}
                          {status?.message && <div className="mt-0.5 truncate text-slate-400" title={status.message}>{status.message}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Latest Raw Match</span>
                  <span className={cn('text-right', latestRawTelemetry ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300')}>
                    {latestRawTelemetry ? 'Found' : 'None'}
                  </span>
                </div>
                {latestRawTelemetry ? (
                  <div className="mt-2 rounded bg-slate-50 p-2 text-[10px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    <div>ID: {getDeviceIdFromMetricLog(latestRawTelemetry)}</div>
                    <div>Source: {latestRawSource || '-'}</div>
                    <div className="truncate" title={latestRawTopic}>Topic: {latestRawTopic || '-'}</div>
                    <div>Received: {getMetricLogTime(latestRawTelemetry) ? new Date(getMetricLogTime(latestRawTelemetry)).toLocaleString() : '-'}</div>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    No accepted raw telemetry matched this device ID or External Device ID. Check payload `device_id`, API Path, MQTT topic, and ingest token.
                  </p>
                )}
              </div>
              <div className="flex justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">HTTP Channel</span>
                <span className="text-slate-900 dark:text-slate-300">{matchedHttpChannel?.name || (latestRawSource.startsWith('http:') ? latestRawSource : '-')}</span>
              </div>
              <div className="flex justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/50">
                <span className="text-slate-500">Mapping Coverage</span>
                <span className={cn(mappingCoverage >= 80 ? 'text-emerald-600 dark:text-emerald-300' : mappingCoverage > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-slate-500')}>
                  {rawMetricOptions.length ? `${mappingCoverage}% (${mappedRawKeys.size}/${rawMetricOptions.length})` : 'No raw fields'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/raw-data')}
                className="inline-flex w-full items-center justify-center gap-2 rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                Open Raw Data Query
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Area: Metrics & Controls */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-[#1c2128] rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-6 uppercase tracking-wider text-[11px] font-mono">
              <Activity className="h-4 w-4" /> Live Metrics
            </h3>
            {device.metrics && Object.keys(device.metrics).length > 0 ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {(primaryMetrics.length ? primaryMetrics : Object.keys(device.metrics).slice(0, 4).map((key) => ({ key, label: key, icon: Activity }))).map(renderMetricCard)}
                </div>

                {secondaryMetrics.length > 0 && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800/50 overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:bg-slate-900">
                      Additional Telemetry
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {secondaryMetrics.map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between gap-3 px-4 py-3 text-xs font-mono">
                          <span className="min-w-0 truncate text-slate-500">{getMetricLabel(device, key)}</span>
                          <span className="text-slate-900 dark:text-slate-300">
                            {Number(value).toFixed(Number(value) % 1 === 0 ? 0 : getMetricPrecision(device, key))} {metricUnit(key)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No telemetry data available.</p>
            )}
            {false && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {Object.entries(device.metrics).map(([key, value]) => (
                  <div key={key} className="bg-slate-50 dark:bg-slate-900 p-4 rounded border border-slate-200 dark:border-slate-800/50">
                    <p className="text-slate-500 text-[10px] font-mono uppercase truncate">{key}</p>
                    <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 whitespace-nowrap">
                      {value}
                      <span className="text-sm font-normal text-slate-500 ml-1">
                        {key.includes('power') ? 'W' : key.includes('temp') ? '°C' : ''}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-[#1c2128] rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] font-mono">
                  <Settings className="h-4 w-4" /> Metrics Mapping
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Map raw telemetry fields to standard metrics used by Overview widgets, Analytics charts, SCADA, and reports.
                </p>
              </div>
              <button
                type="button"
                onClick={saveMetricMappings}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-orange-500 bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-500"
              >
                Save Mappings
              </button>
            </div>

            {metricMappingMessage && (
              <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                {metricMappingMessage}
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="max-h-96 overflow-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
                  <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-900">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Raw Field</th>
                      <th className="px-3 py-2 font-semibold">Standard Metric</th>
                      <th className="px-3 py-2 font-semibold">Display Name</th>
                      <th className="px-3 py-2 font-semibold">Unit</th>
                      <th className="px-3 py-2 font-semibold">Precision</th>
                      <th className="px-3 py-2 font-semibold">Primary</th>
                      <th className="px-3 py-2 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-mono dark:divide-slate-800/70 dark:bg-[#1c2128]">
                    {discoveredMetricKeys.map((rawKey) => {
                      const mapping = metricMappingsDraft.find((item) => item.rawKey === rawKey);
                      const standardKey = mapping?.standardKey || '';
                      const currentValue = device.metrics?.[rawKey];

                      return (
                        <tr key={rawKey} className="hover:bg-slate-50 dark:hover:bg-slate-900/60">
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">
                            <div className="font-semibold">{rawKey}</div>
                            <div className="mt-0.5 text-[10px] text-slate-400">latest {formatMetricLogValue(currentValue)}</div>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              list="standard-metric-options"
                              value={standardKey}
                              onChange={(event) => {
                                const nextStandardKey = event.target.value;
                                const standardMetric = STANDARD_METRIC_OPTIONS.find((option) => option.key === nextStandardKey);
                                updateMetricMappingDraft(rawKey, {
                                  standardKey: nextStandardKey,
                                  displayName: mapping?.displayName || standardMetric?.label || nextStandardKey,
                                  unit: mapping?.unit || standardMetric?.unit || inferMetricUnit(nextStandardKey),
                                });
                              }}
                              placeholder="temperature"
                              className="h-8 w-44 rounded border border-slate-300 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={mapping?.displayName || ''}
                              onChange={(event) => updateMetricMappingDraft(rawKey, { displayName: event.target.value })}
                              placeholder="Display name"
                              className="h-8 w-40 rounded border border-slate-300 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={mapping?.unit || ''}
                              onChange={(event) => updateMetricMappingDraft(rawKey, { unit: event.target.value })}
                              placeholder="unit"
                              className="h-8 w-24 rounded border border-slate-300 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={6}
                              value={mapping?.precision ?? 2}
                              onChange={(event) => updateMetricMappingDraft(rawKey, { precision: Number(event.target.value || 0) })}
                              className="h-8 w-20 rounded border border-slate-300 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={Boolean(mapping?.primary)}
                              onChange={(event) => updateMetricMappingDraft(rawKey, { primary: event.target.checked })}
                              className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {mapping && (
                              <button
                                type="button"
                                onClick={() => deleteMetricMappingDraft(rawKey)}
                                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                                title="Delete mapping"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {discoveredMetricKeys.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                          No telemetry fields discovered yet. Send a MQTT or HTTP telemetry payload, then refresh this page.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <datalist id="standard-metric-options">
              {STANDARD_METRIC_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </datalist>
          </div>

          <div className="bg-white dark:bg-[#1c2128] rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] font-mono">
                  <Database className="h-4 w-4" /> Metrics Logs
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Historical telemetry for this device. Use it to verify widget and chart data.
                </p>
              </div>
              <button
                type="button"
                onClick={queryMetricLogs}
                disabled={metricLogsLoading}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', metricLogsLoading && 'animate-spin')} />
                Refresh
              </button>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                Metric
                <select
                  value={metricLogMetric}
                  onChange={(event) => setMetricLogMetric(event.target.value)}
                  className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">All metrics</option>
                  {metricLogOptions.map((metric) => (
                    <option key={metric} value={metric}>{metric}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                Limit
                <select
                  value={metricLogLimit}
                  onChange={(event) => setMetricLogLimit(Number(event.target.value))}
                  className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {[20, 50, 100, 200].map((limit) => (
                    <option key={limit} value={limit}>{limit} rows</option>
                  ))}
                </select>
              </label>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
                <p className="font-mono uppercase tracking-wider text-slate-500">Current</p>
                <p className="mt-1 truncate font-mono text-sm text-slate-900 dark:text-slate-200">
                  {metricLogMetric
                    ? `${formatMetricLogValue(device.metrics?.[metricLogMetric])} ${metricUnit(metricLogMetric)}`
                    : `${Object.keys(device.metrics || {}).length} live metrics`}
                </p>
              </div>
            </div>

            {metricLogsError && (
              <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                {metricLogsError}
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="max-h-80 overflow-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
                  <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-900">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Received</th>
                      <th className="px-3 py-2 font-semibold">Source</th>
                      <th className="px-3 py-2 font-semibold">Metric Value</th>
                      <th className="px-3 py-2 font-semibold">Metrics</th>
                      <th className="px-3 py-2 font-semibold">Topic</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-mono dark:divide-slate-800/70 dark:bg-[#1c2128]">
                    {metricLogs.map((message, index) => {
                      const rawMetrics = message.metrics || {};
                      const metrics = applyMetricMappingsToMetrics(device, rawMetrics);
                      const metricEntries = Object.entries(metrics);
                      const selectedValue = metricLogMetric ? metrics[metricLogMetric] : undefined;
                      const preview = metricEntries.slice(0, 4).map(([key, value]) => `${key}: ${formatMetricLogValue(value)}`).join(' | ');

                      return (
                        <tr key={getMetricLogKey(message, index)} className="hover:bg-slate-50 dark:hover:bg-slate-900/60">
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-300">
                            {getMetricLogTime(message) ? new Date(getMetricLogTime(message)).toLocaleString() : '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500">{String(message.source || '-')}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-900 dark:text-white">
                            {metricLogMetric ? `${formatMetricLogValue(selectedValue)} ${metricUnit(metricLogMetric)}` : '-'}
                          </td>
                          <td className="max-w-sm px-3 py-2 text-slate-500">
                            <span title={JSON.stringify(metrics)}>{preview || '-'}</span>
                            {metricEntries.length > 4 && <span className="ml-1 text-slate-400">+{metricEntries.length - 4}</span>}
                          </td>
                          <td className="max-w-[14rem] truncate px-3 py-2 text-slate-500" title={String(message.topic || message.mqtt_topic || '')}>
                            {String(message.topic || message.mqtt_topic || '-')}
                          </td>
                        </tr>
                      );
                    })}
                    {!metricLogsLoading && metricLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                          No metric logs found for this device.
                        </td>
                      </tr>
                    )}
                    {metricLogsLoading && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                          Loading metric logs...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#1c2128] rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] font-mono">
                  <Zap className="h-4 w-4" /> Remote Controls
                </h3>
                <div className="flex items-center gap-2">
                  {!canControl && (
                    <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                      Current role can view controls only.
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => openControlEditor()}
                    className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Control
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {controlDefinitions.map((control) => {
                  const Icon = control.icon;
                  const currentValue = controlValues[control.id] ?? control.defaultValue ?? '';
                  const canUseControl = canIssueControlCommand(currentUser, device.id, control.id);

                  return (
                    <div key={control.id} className="group relative rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800/50 dark:bg-slate-900">
                      <div className="pointer-events-none absolute right-3 top-3 flex translate-y-1 gap-1 opacity-0 transition-all group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => openControlEditor(control)}
                          className="rounded border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm hover:text-orange-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400"
                          title="Edit control"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteControlDefinition(control.id)}
                          className="rounded border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400"
                          title="Delete control"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{control.label}</p>
                          <p className="mt-1 text-xs text-slate-500">{control.description}</p>
                        </div>
                        <div className="rounded-md bg-white p-2 text-orange-500 ring-1 ring-slate-200 dark:bg-[#1c2128] dark:ring-slate-800">
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>

                      {control.valueType === 'select' && (
                        <select
                          value={currentValue}
                          onChange={(event) => updateControl(control.id, event.target.value)}
                          className="mt-4 h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-orange-500 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        >
                          {control.options?.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      )}

                      {control.valueType === 'toggle' && (
                        <div className="mt-4 flex items-center justify-between gap-3 rounded border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                          <span className="text-slate-600 dark:text-slate-300">{control.parameterKey || control.id}</span>
                          <button
                            type="button"
                            disabled={!canUseControl || submittingControlId === control.id}
                            onClick={() => {
                              const nextValue = !Boolean(controlValues[control.id]);
                              const nextControlValues = { ...controlValues, [control.id]: nextValue };
                              setControlValues(nextControlValues);
                              submitDeviceControl(control.id, nextControlValues);
                            }}
                            className={cn(
                              "relative inline-flex h-10 w-24 shrink-0 items-center rounded-full border-2 px-2 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                              Boolean(controlValues[control.id])
                                ? "justify-start border-slate-950 bg-slate-950 text-white dark:border-orange-500 dark:bg-orange-600"
                                : "justify-end border-slate-950 bg-white text-slate-950 dark:border-slate-400 dark:bg-slate-950 dark:text-white"
                            )}
                          >
                            <span className="z-10 text-sm">{Boolean(controlValues[control.id]) ? 'ON' : 'OFF'}</span>
                            <span
                              className={cn(
                                "absolute top-1 h-7 w-7 rounded-full transition-all",
                                Boolean(controlValues[control.id])
                                  ? "right-1 bg-white"
                                  : "left-1 bg-slate-950 dark:bg-white"
                              )}
                            />
                          </button>
                        </div>
                      )}

                      {(control.valueType === 'range' || control.valueType === 'slider') && (
                        <div className="mt-4">
                          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                            <span>{control.min ?? 0}</span>
                            <span className="font-mono text-orange-600">{currentValue}{control.unit}</span>
                            <span>{control.max ?? 100}</span>
                          </div>
                          <input
                            type="range"
                            min={control.min ?? 0}
                            max={control.max ?? 100}
                            step={control.step ?? 1}
                            value={currentValue}
                            onChange={(event) => updateControl(control.id, Number(event.target.value))}
                            className="w-full accent-orange-600"
                          />
                        </div>
                      )}

                      {control.valueType === 'number' && (
                        <div className="mt-4 flex rounded border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950">
                          <input
                            type="number"
                            min={control.min}
                            max={control.max}
                            step={control.step ?? 1}
                            value={currentValue}
                            onChange={(event) => updateControl(control.id, Number(event.target.value))}
                            className="h-9 flex-1 border-0 bg-transparent px-3 text-sm text-slate-900 focus:ring-0 dark:text-slate-100"
                          />
                          {control.unit && <span className="flex items-center px-3 text-xs text-slate-500">{control.unit}</span>}
                        </div>
                      )}

                      {control.valueType === 'text' && (
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          <input
                            value={parameterNames[control.id] || ''}
                            onChange={(event) => setParameterNames((current) => ({ ...current, [control.id]: event.target.value }))}
                            placeholder="parameter"
                            className="h-9 rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-orange-500 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                          <input
                            value={currentValue}
                            onChange={(event) => updateControl(control.id, event.target.value)}
                            placeholder="value"
                            className="h-9 rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-orange-500 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </div>
                      )}

                      {control.valueType === 'parameter_group' && (
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          {control.fields?.map((field) => (
                            <div key={field.key}>
                              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{field.label}</label>
                              {field.valueType === 'select' ? (
                                <select
                                  value={controlValues[`${control.id}.${field.key}`] ?? field.defaultValue ?? ''}
                                  onChange={(event) => updateControl(`${control.id}.${field.key}`, event.target.value)}
                                  className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-orange-500 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                >
                                  {field.options?.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type={field.valueType === 'number' ? 'number' : 'text'}
                                  value={controlValues[`${control.id}.${field.key}`] ?? field.defaultValue ?? ''}
                                  onChange={(event) => updateControl(`${control.id}.${field.key}`, field.valueType === 'number' ? Number(event.target.value) : event.target.value)}
                                  className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-orange-500 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {control.valueType !== 'toggle' && (
                        <button
                          type="button"
                          onClick={() => submitDeviceControl(control.id)}
                          disabled={!canUseControl || submittingControlId === control.id}
                          className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                        >
                          <Play className="h-3.5 w-3.5" />
                          {submittingControlId === control.id ? 'Sending...' : 'Send Command'}
                        </button>
                      )}
                    </div>
                  );
                })}
                {controlDefinitions.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400 md:col-span-2">
                    No control actions configured for this device.
                  </div>
                )}
              </div>
              {controlMessage && (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{controlMessage}</p>
              )}
            </div>
        </div>
      </div>

      {controlDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-[#1c2128]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {editingControl ? 'Edit Control Action' : 'Add Control Action'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setControlDraft(null);
                  setEditingControl(null);
                  setControlOptionsDraft('');
                  setControlFieldsDraft('');
                }}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid max-h-[70vh] grid-cols-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Action ID</label>
                <input
                  value={controlDraft.id}
                  onChange={(event) => setControlDraft((current) => current ? { ...current, id: event.target.value.trim() || current.id } : current)}
                  className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Action Label</label>
                <input
                  value={controlDraft.label}
                  onChange={(event) => setControlDraft((current) => current ? { ...current, label: event.target.value } : current)}
                  className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Description</label>
                <input
                  value={controlDraft.description}
                  onChange={(event) => setControlDraft((current) => current ? { ...current, description: event.target.value } : current)}
                  className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Value Type</label>
                <select
                  value={controlDraft.valueType}
                  onChange={(event) => setControlDraft((current) => current ? { ...current, valueType: event.target.value as DeviceControlValueType } : current)}
                  className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="none">No Value</option>
                  <option value="toggle">Toggle</option>
                  <option value="slider">Slider</option>
                  <option value="number">Number</option>
                  <option value="select">Select</option>
                  <option value="text">Parameter</option>
                  <option value="parameter_group">Parameter Groups</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Action Icon</label>
                <select
                  value={controlDraft.iconId || 'send'}
                  onChange={(event) => setControlDraft((current) => current ? { ...current, iconId: event.target.value } : current)}
                  className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {CONTROL_ICON_OPTIONS.map((icon) => (
                    <option key={icon.id} value={icon.id}>{icon.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Action Variable Name</label>
                <input
                  value={controlDraft.parameterKey || ''}
                  onChange={(event) => setControlDraft((current) => current ? { ...current, parameterKey: event.target.value } : current)}
                  placeholder="speed / pressure / mode"
                  className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Default Value</label>
                <input
                  value={String(controlDraft.defaultValue ?? '')}
                  onChange={(event) => setControlDraft((current) => current ? { ...current, defaultValue: event.target.value } : current)}
                  className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              {controlDraft.valueType === 'toggle' && (
                <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">ON Value</label>
                    <input
                      value={String(controlDraft.toggleOnValue ?? '')}
                      onChange={(event) => setControlDraft((current) => current ? { ...current, toggleOnValue: event.target.value } : current)}
                      placeholder="true / 1 / ON / open"
                      className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">OFF Value</label>
                    <input
                      value={String(controlDraft.toggleOffValue ?? '')}
                      onChange={(event) => setControlDraft((current) => current ? { ...current, toggleOffValue: event.target.value } : current)}
                      placeholder="false / 0 / OFF / close"
                      className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Unit</label>
                <input
                  value={controlDraft.unit || ''}
                  onChange={(event) => setControlDraft((current) => current ? { ...current, unit: event.target.value } : current)}
                  placeholder="% / bar / rpm"
                  className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              {(controlDraft.valueType === 'slider' || controlDraft.valueType === 'range' || controlDraft.valueType === 'number') && (
                <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Min</label>
                    <input type="number" value={controlDraft.min ?? 0} onChange={(event) => setControlDraft((current) => current ? { ...current, min: Number(event.target.value) } : current)} className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Max</label>
                    <input type="number" value={controlDraft.max ?? 100} onChange={(event) => setControlDraft((current) => current ? { ...current, max: Number(event.target.value) } : current)} className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Step</label>
                    <input type="number" value={controlDraft.step ?? 1} onChange={(event) => setControlDraft((current) => current ? { ...current, step: Number(event.target.value) } : current)} className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                </div>
              )}
              {controlDraft.valueType === 'select' && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Select Options</label>
                  <textarea
                    rows={4}
                    value={controlOptionsDraft}
                    onChange={(event) => setControlOptionsDraft(event.target.value)}
                    placeholder={'auto:Auto\nmanual:Manual'}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              )}
              {controlDraft.valueType === 'parameter_group' && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Parameter Group Fields JSON</label>
                  <textarea
                    rows={7}
                    value={controlFieldsDraft}
                    onChange={(event) => setControlFieldsDraft(event.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setControlDraft(null);
                  setEditingControl(null);
                  setControlOptionsDraft('');
                  setControlFieldsDraft('');
                }}
                className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveControlDraft}
                className="rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500"
              >
                Save Control
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
