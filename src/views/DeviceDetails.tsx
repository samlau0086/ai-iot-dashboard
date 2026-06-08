import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../lib/store';
import { getDeviceIcon } from '../lib/icons';
import { ArrowLeft, Activity, Info, Settings, Zap, Thermometer, Gauge, Cpu, HardDrive, Waves, BatteryCharging, Timer, Wind, Droplets, DoorOpen, Radio, Edit2, Play, Plus, Trash2, X } from 'lucide-react';
import { translations } from '../lib/i18n';
import { cn } from '../lib/utils';
import { DeviceForm } from '../components/DeviceForm';
import { CONTROL_ICON_OPTIONS, buildControlParameters, buildControlStatePatch, getDeviceControlDefinitions, sanitizeControlDefinition, type DeviceControlDefinition, type DeviceControlValueType } from '../lib/deviceControls';

export function DeviceDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { devices, language, updateDevice, currentUser } = useAppStore();
  const t = translations[language];

  const device = devices.find(d => d.id === id);
  const [isEditing, setIsEditing] = useState(false);

  const [controlValues, setControlValues] = useState<Record<string, any>>({});
  const [parameterNames, setParameterNames] = useState<Record<string, string>>({});
  const [controlMessage, setControlMessage] = useState('');
  const [submittingControlId, setSubmittingControlId] = useState('');
  const [editingControl, setEditingControl] = useState<DeviceControlDefinition | null>(null);
  const [controlDraft, setControlDraft] = useState<DeviceControlDefinition | null>(null);
  const [controlOptionsDraft, setControlOptionsDraft] = useState('');
  const [controlFieldsDraft, setControlFieldsDraft] = useState('');
  const controlDefinitions = getDeviceControlDefinitions(device);
  const canControl = currentUser?.role !== 'Demo' && ['Owner', 'Admin', 'Engineer', 'Operator'].includes(currentUser?.role || '');

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

  if (!device) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Device Not Found</h2>
        <p>The requested device could not be found.</p>
        <button onClick={() => navigate('/devices')} className="mt-4 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-500">
          Back to Devices
        </button>
      </div>
    );
  }

  if (isEditing) {
    return <DeviceForm deviceId={device.id} onClose={() => setIsEditing(false)} />;
  }

  const IconComp = getDeviceIcon(device.icon);

  const updateControl = (key: string, value: any) => {
    setControlValues(prev => ({ ...prev, [key]: value }));
  };

  const submitDeviceControl = async (controlId: string, nextControlValues = controlValues) => {
    const definition = controlDefinitions.find((control) => control.id === controlId);
    if (!definition || !canControl) return;

    setSubmittingControlId(controlId);
    setControlMessage('');
    const parameters = buildControlParameters(definition, nextControlValues, parameterNames[controlId]);

    try {
      const response = await fetch('/api/device-commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
        return;
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
    } catch (error) {
      setControlMessage('Failed to submit control command.');
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

  const deleteControlDefinition = (controlId: string) => {
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
  };

  const primaryMetricKeys = primaryMetricKeysByType[device.type] || Object.keys(device.metrics || {}).slice(0, 4).map((key) => ({ key, label: key, icon: Activity }));
  const primaryMetrics = primaryMetricKeys.filter((metric) => device.metrics?.[metric.key] !== undefined);
  const primaryMetricSet = new Set(primaryMetrics.map((metric) => metric.key));
  const secondaryMetrics = Object.entries(device.metrics || {}).filter(([key]) => !primaryMetricSet.has(key));

  const formatConfigValue = (value: unknown) => {
    if (value && typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const renderMetricCard = (metric: { key: string; label: string; icon: any }) => {
    const value = metricValue(metric.key);
    const max = metricMax(metric.key, value);
    const percent = max === 0 ? 100 : Math.max(0, Math.min(100, Math.abs(value) / max * 100));
    const Icon = metric.icon;

    return (
      <div key={metric.key} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800/50 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-mono uppercase tracking-wider text-slate-500">{metric.label}</p>
            <p className="mt-2 truncate text-2xl font-semibold text-slate-900 dark:text-white">
              {value.toFixed(value % 1 === 0 ? 0 : 1)}
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/devices')}
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
                  device.status === 'online' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : 
                  device.status === 'warning' ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" : 
                  "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                )}>
                  {device.status}
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
                          <span className="min-w-0 truncate text-slate-500">{key}</span>
                          <span className="text-slate-900 dark:text-slate-300">
                            {String(value)} {metricUnit(key)}
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
                            disabled={!canControl || submittingControlId === control.id}
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
                          disabled={!canControl || submittingControlId === control.id}
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
