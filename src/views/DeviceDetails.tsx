import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../lib/store';
import { getDeviceIcon } from '../lib/icons';
import { ArrowLeft, Activity, Info, Settings, Zap, Thermometer, Gauge, Cpu, HardDrive, Waves, BatteryCharging, Timer, Wind, Droplets, DoorOpen, Radio, Edit2 } from 'lucide-react';
import { translations } from '../lib/i18n';
import { cn } from '../lib/utils';
import { DeviceForm } from '../components/DeviceForm';

export function DeviceDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { devices, language, updateDevice } = useAppStore();
  const t = translations[language];

  const device = devices.find(d => d.id === id);
  const [isEditing, setIsEditing] = useState(false);

  // States for controls
  const [controlValues, setControlValues] = useState<Record<string, any>>({
    powerState: true,
    targetTemp: 22,
    mode: 'auto',
    speed: 50,
  });

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
  
  const isControllable = ['pump_controller', 'plc', 'air_compressor', 'hvac'].includes(device.type) || device.type.includes('controller');

  const updateControl = (key: string, value: any) => {
    setControlValues(prev => ({ ...prev, [key]: value }));
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
      { key: 'energy_today', label: 'Energy Today', icon: Activity },
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
  const commonMetricTargets = [
    { key: 'power', label: 'Power Draw' },
    { key: 'energy_today', label: 'Energy Today' },
    { key: 'voltage', label: 'Voltage' },
    { key: 'current', label: 'Current' },
    { key: 'temperature', label: 'Temperature' },
    { key: 'humidity', label: 'Humidity' },
    { key: 'pressure', label: 'Pressure' },
    { key: 'flow_rate', label: 'Flow Rate' },
    { key: 'running_hours', label: 'Runtime' },
    { key: 'signal', label: 'Signal' },
    { key: 'battery', label: 'Battery' },
    { key: 'cpu', label: 'CPU Load' },
    { key: 'ram', label: 'Memory' },
  ];
  const metricTargetMap = new Map<string, { key: string; label: string }>();
  primaryMetricKeys.forEach((metric) => metricTargetMap.set(metric.key, { key: metric.key, label: metric.label }));
  commonMetricTargets.forEach((metric) => metricTargetMap.set(metric.key, metric));
  Object.keys(device.metrics || {}).forEach((key) => metricTargetMap.set(key, { key, label: key }));
  const metricTargetOptions = Array.from(metricTargetMap.values());

  const formatConfigValue = (value: unknown) => {
    if (value && typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const handleMetricMappingChange = (sourceKey: string, targetKey: string) => {
    const currentMapping = device.config?.metricMapping || {};
    const nextMapping = { ...currentMapping };
    const nextMetrics = { ...device.metrics };

    if (targetKey) {
      nextMapping[sourceKey] = targetKey;
      nextMetrics[targetKey] = Number(device.metrics[sourceKey]);
    } else {
      delete nextMapping[sourceKey];
    }

    updateDevice(device.id, {
      metrics: nextMetrics,
      config: {
        ...(device.config || {}),
        metricMapping: nextMapping,
      },
    });
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
                        <div key={key} className="grid grid-cols-1 gap-3 px-4 py-3 text-xs font-mono sm:grid-cols-[1fr_auto_14rem] sm:items-center">
                          <span className="min-w-0 truncate text-slate-500">{key}</span>
                          <span className="text-slate-900 dark:text-slate-300">
                            {String(value)} {metricUnit(device.config?.metricMapping?.[key] || key)}
                          </span>
                          <select
                            value={device.config?.metricMapping?.[key] || ''}
                            onChange={(event) => handleMetricMappingChange(key, event.target.value)}
                            className="h-8 rounded-md border-slate-300 bg-white px-2 text-xs text-slate-700 shadow-sm focus:border-orange-500 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            <option value="">Unmapped</option>
                            {metricTargetOptions
                              .filter((metric) => metric.key !== key)
                              .map((metric) => (
                                <option key={metric.key} value={metric.key}>{metric.label} ({metric.key})</option>
                              ))}
                          </select>
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

          {isControllable && (
            <div className="bg-white dark:bg-[#1c2128] rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white mb-6 uppercase tracking-wider text-[11px] font-mono">
                <Zap className="h-4 w-4" /> Remote Controls
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Power Toggle */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/50">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Main Power</p>
                    <p className="text-xs text-slate-500 mt-1">Toggle equipment operations</p>
                  </div>
                  <button 
                    onClick={() => updateControl('powerState', !controlValues.powerState)}
                    className={cn(
                      "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      controlValues.powerState ? 'bg-orange-600' : 'bg-slate-200 dark:bg-slate-700'
                    )}
                  >
                    <span 
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        controlValues.powerState ? 'translate-x-5' : 'translate-x-0'
                      )} 
                    />
                  </button>
                </div>

                {/* Operation Mode */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-900 dark:text-white block">Operating Mode</label>
                  <div className="flex rounded-md shadow-sm">
                    {['Auto', 'Manual', 'Eco'].map((mode) => (
                      <button
                        key={mode}
                        onClick={() => updateControl('mode', mode.toLowerCase())}
                        className={cn(
                          "flex-1 px-4 py-2 text-xs font-medium border-y border-l first:rounded-l-md last:rounded-r-md last:border-r border-slate-200 dark:border-slate-700 transition-colors",
                          controlValues.mode === mode.toLowerCase()
                            ? "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30 z-10"
                            : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-[#1c2128] dark:text-slate-300 dark:hover:bg-slate-800"
                        )}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slider Control */}
                <div className="space-y-3 md:col-span-2 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/50">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-900 dark:text-white">Motor Speed</label>
                    <span className="text-sm font-mono text-orange-600 font-semibold">{controlValues.speed}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={controlValues.speed}
                    onChange={(e) => updateControl('speed', parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-orange-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
