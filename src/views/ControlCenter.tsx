import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, History, Play, Power, PowerOff, RefreshCw, RotateCcw, Send, Settings2, SlidersHorizontal } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { cn } from '../lib/utils';

type ControlCommand = {
  id: string;
  deviceId: string;
  deviceName: string;
  command: string;
  parameters: Record<string, any>;
  requestedBy: string;
  requestedByRole: string;
  source: string;
  status: 'queued' | 'sent' | 'success' | 'failed' | 'rejected';
  result?: string;
  createdAt: string;
  updatedAt: string;
};

const commandOptions = [
  { id: 'power_on', label: 'Power On', icon: Power, tone: 'emerald' },
  { id: 'power_off', label: 'Power Off', icon: PowerOff, tone: 'red' },
  { id: 'restart', label: 'Restart', icon: RotateCcw, tone: 'amber' },
  { id: 'set_mode', label: 'Set Mode', icon: Settings2, tone: 'blue' },
  { id: 'set_speed', label: 'Set Speed', icon: SlidersHorizontal, tone: 'orange' },
  { id: 'set_parameter', label: 'Set Parameter', icon: Send, tone: 'slate' },
];

const controllableTypes = new Set(['plc', 'pump_controller', 'air_compressor', 'gateway', 'dtu', 'rtu']);

export function ControlCenter() {
  const { devices, currentUser, activeSiteId, sites } = useAppStore();
  const [selectedSiteId, setSelectedSiteId] = useState(activeSiteId || 'All');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedCommand, setSelectedCommand] = useState('power_on');
  const [mode, setMode] = useState('auto');
  const [speed, setSpeed] = useState(50);
  const [parameterName, setParameterName] = useState('');
  const [parameterValue, setParameterValue] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [commands, setCommands] = useState<ControlCommand[]>([]);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canControl = ['Owner', 'Admin', 'Engineer', 'Operator'].includes(currentUser?.role || '');
  const siteOptions = [{ id: 'All', name: 'All Sites' }, ...sites];
  const scopedDevices = useMemo(() => {
    return devices.filter((device) => {
      const inSite = selectedSiteId === 'All' || device.siteId === selectedSiteId;
      return inSite && controllableTypes.has(device.type);
    });
  }, [devices, selectedSiteId]);
  const selectedDevice = scopedDevices.find((device) => device.id === selectedDeviceId) || scopedDevices[0] || null;

  useEffect(() => {
    if (!selectedDeviceId && selectedDevice) {
      setSelectedDeviceId(selectedDevice.id);
    }
  }, [selectedDevice, selectedDeviceId]);

  const loadCommands = async () => {
    try {
      const response = await fetch('/api/device-commands?limit=100');
      const payload = await response.json();
      setCommands(Array.isArray(payload.commands) ? payload.commands : []);
    } catch (error) {
      setMessage('Failed to load control history.');
    }
  };

  useEffect(() => {
    loadCommands();
  }, []);

  const buildParameters = () => {
    if (selectedCommand === 'set_mode') return { mode };
    if (selectedCommand === 'set_speed') return { speed };
    if (selectedCommand === 'set_parameter') return { name: parameterName, value: parameterValue };
    return {};
  };

  const submitCommand = async () => {
    if (!selectedDevice || !canControl || !confirmChecked) return;

    setIsSubmitting(true);
    setMessage('');

    try {
      const response = await fetch('/api/device-commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId: selectedDevice.id,
          command: selectedCommand,
          parameters: buildParameters(),
          requestedBy: currentUser?.name || currentUser?.email || 'Unknown user',
          requestedByRole: currentUser?.role || 'Viewer',
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error || 'Control command rejected.');
      } else {
        setMessage(`Command queued: ${payload.command?.id}`);
        setConfirmChecked(false);
        await loadCommands();
      }
    } catch (error) {
      setMessage('Failed to submit control command.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedOption = commandOptions.find((option) => option.id === selectedCommand) || commandOptions[0];
  const SelectedIcon = selectedOption.icon;

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            <SlidersHorizontal className="h-6 w-6 text-orange-600 dark:text-orange-500" />
            Control Center
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Issue audited remote control commands for controllable devices.
          </p>
        </div>
        <button
          type="button"
          onClick={loadCommands}
          className="mt-4 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-[#1c2128] dark:text-slate-200 dark:hover:bg-slate-800 sm:mt-0"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {!canControl && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          Your current role can view control history but cannot issue commands.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,460px)_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#1c2128]">
          <div className="mb-4 flex items-center gap-2">
            <SelectedIcon className="h-5 w-5 text-orange-500" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">New Control Command</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Site</label>
              <select
                value={selectedSiteId}
                onChange={(event) => {
                  setSelectedSiteId(event.target.value);
                  setSelectedDeviceId('');
                }}
                className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {siteOptions.map((site) => (
                  <option key={site.id} value={site.id}>{site.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Device</label>
              <select
                value={selectedDevice?.id || ''}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
                disabled={scopedDevices.length === 0}
                className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {scopedDevices.map((device) => (
                  <option key={device.id} value={device.id}>{device.name} / {device.type}</option>
                ))}
                {scopedDevices.length === 0 && <option value="">No controllable devices</option>}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Command</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {commandOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedCommand(option.id)}
                      className={cn(
                        "flex h-10 items-center gap-2 rounded border px-3 text-left text-xs font-semibold transition-colors",
                        selectedCommand === option.id
                          ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedCommand === 'set_mode' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Mode</label>
                <select value={mode} onChange={(event) => setMode(event.target.value)} className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <option value="auto">Auto</option>
                  <option value="manual">Manual</option>
                  <option value="eco">Eco</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
            )}

            {selectedCommand === 'set_speed' && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Speed</label>
                  <span className="text-sm font-semibold text-orange-600">{speed}%</span>
                </div>
                <input type="range" min={0} max={100} value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="mt-3 w-full accent-orange-600" />
              </div>
            )}

            {selectedCommand === 'set_parameter' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Parameter</label>
                  <input value={parameterName} onChange={(event) => setParameterName(event.target.value)} placeholder="setpoint" className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Value</label>
                  <input value={parameterValue} onChange={(event) => setParameterValue(event.target.value)} placeholder="42" className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
              </div>
            )}

            <label className="flex items-start gap-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              <input type="checkbox" checked={confirmChecked} onChange={(event) => setConfirmChecked(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-orange-600 focus:ring-orange-500" />
              <span>I confirm this command may affect live industrial equipment and should be recorded in the control log.</span>
            </label>

            <button
              type="button"
              onClick={submitCommand}
              disabled={!selectedDevice || !canControl || !confirmChecked || isSubmitting}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
            >
              <Play className="h-4 w-4" />
              {isSubmitting ? 'Submitting...' : 'Submit Command'}
            </button>

            {message && (
              <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#1c2128]">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-slate-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Control Log</h2>
            </div>
            <span className="text-xs text-slate-500">{commands.length} records</span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {commands.map((command) => (
              <div key={command.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{command.deviceName}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-400">{command.command}</span>
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      command.status === 'rejected' || command.status === 'failed'
                        ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                        : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    )}>
                      {command.status === 'rejected' || command.status === 'failed' ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      {command.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{command.result}</p>
                  <p className="mt-2 truncate text-[11px] font-mono text-slate-400">{JSON.stringify(command.parameters || {})}</p>
                </div>
                <div className="text-left text-xs text-slate-500 md:text-right">
                  <div>{new Date(command.createdAt).toLocaleString()}</div>
                  <div className="mt-1">{command.requestedBy} / {command.requestedByRole}</div>
                  <div className="mt-1 font-mono text-[10px] text-slate-400">{command.source}</div>
                </div>
              </div>
            ))}
            {commands.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">No control commands yet.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
