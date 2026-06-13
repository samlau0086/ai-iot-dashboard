import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, History, Play, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { cn } from '../lib/utils';
import { buildControlParameters, buildControlStatePatch, getDeviceControlDefinitions, isDeviceControllable } from '../lib/deviceControls';
import { useRuntimeDevices } from '../hooks/useRuntimeDevices';
import { UnderDevelopmentBadge } from '../components/UnderDevelopmentBadge';
import { canIssueControlCommand, getAccessibleDevices, getAccessibleSites, hasFullDataAccess } from '../lib/featureAccess';

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

export function ControlCenter() {
  const { devices: storedDevices, currentUser, activeSiteId, sites, updateDevice } = useAppStore();
  const accessibleSites = useMemo(() => getAccessibleSites(currentUser, sites), [currentUser, sites]);
  const accessibleStoredDevices = useMemo(() => getAccessibleDevices(currentUser, storedDevices), [currentUser, storedDevices]);
  const devices = useRuntimeDevices(accessibleStoredDevices);
  const [selectedSiteId, setSelectedSiteId] = useState(activeSiteId || 'All');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedCommand, setSelectedCommand] = useState('power_on');
  const [controlValues, setControlValues] = useState<Record<string, any>>({});
  const [parameterName, setParameterName] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [commands, setCommands] = useState<ControlCommand[]>([]);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDemoUser = currentUser?.role === 'Demo';
  const canControl = canIssueControlCommand(currentUser);
  const siteOptions = useMemo(() => (
    [...(hasFullDataAccess(currentUser) ? [{ id: 'All', name: 'All Sites' }] : []), ...accessibleSites]
  ), [accessibleSites, currentUser]);
  const scopedDevices = useMemo(() => {
    return devices.filter((device) => {
      const inSite = selectedSiteId === 'All' || device.siteId === selectedSiteId;
      return inSite && isDeviceControllable(device) && canIssueControlCommand(currentUser, device.id);
    });
  }, [currentUser, devices, selectedSiteId]);
  const selectedDevice = scopedDevices.find((device) => device.id === selectedDeviceId) || scopedDevices[0] || null;
  const commandOptions = getDeviceControlDefinitions(selectedDevice).filter((control) => (
    canIssueControlCommand(currentUser, selectedDevice?.id, control.id)
  ));

  useEffect(() => {
    if (!siteOptions.length) return;
    if (selectedSiteId === 'All' && !hasFullDataAccess(currentUser)) {
      setSelectedSiteId(siteOptions[0].id);
      setSelectedDeviceId('');
      return;
    }
    if (selectedSiteId !== 'All' && !siteOptions.some((site) => site.id === selectedSiteId)) {
      setSelectedSiteId(siteOptions[0].id);
      setSelectedDeviceId('');
    }
  }, [currentUser, selectedSiteId, siteOptions]);

  useEffect(() => {
    if (!selectedDeviceId && selectedDevice) {
      setSelectedDeviceId(selectedDevice.id);
    }
  }, [selectedDevice, selectedDeviceId]);

  useEffect(() => {
    if (!selectedDevice) return;
    const options = getDeviceControlDefinitions(selectedDevice);
    const nextSelected = options.some((option) => option.id === selectedCommand)
      ? selectedCommand
      : options[0]?.id || '';
    setSelectedCommand(nextSelected);
    setControlValues({
      ...(selectedDevice.config?.controlState || {}),
      ...Object.fromEntries(options.map((option) => [option.id, selectedDevice.config?.controlState?.[option.id] ?? option.defaultValue ?? ''])),
    });
  }, [selectedDevice?.id, selectedCommand]);

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

  const submitCommand = async (nextControlValues = controlValues, forceSubmit = false) => {
    if (!selectedDevice || !canControl || (!confirmChecked && !forceSubmit)) return;
    const definition = commandOptions.find((option) => option.id === selectedCommand);
    if (!canIssueControlCommand(currentUser, selectedDevice.id, definition?.id)) {
      setMessage('Current user is not allowed to issue this control action.');
      return;
    }
    if (!definition) return;
    const parameters = buildControlParameters(definition, nextControlValues, parameterName);

    setIsSubmitting(true);
    setMessage('');

    try {
      const response = await fetch('/api/device-commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId: selectedDevice.id,
          command: selectedCommand,
          parameters,
          requestedBy: currentUser?.name || currentUser?.email || 'Unknown user',
          requestedByRole: currentUser?.role || 'Viewer',
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload.error || 'Control command rejected.');
      } else {
        setMessage(`Command queued: ${payload.command?.id}`);
        updateDevice(selectedDevice.id, {
          config: {
            ...(selectedDevice.config || {}),
            controlState: {
              ...(selectedDevice.config?.controlState || {}),
              ...buildControlStatePatch(definition, nextControlValues, parameters),
            },
          },
        });
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
  const SelectedIcon = selectedOption?.icon || SlidersHorizontal;

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            <SlidersHorizontal className="h-6 w-6 text-orange-600 dark:text-orange-500" />
            Control Center
            <UnderDevelopmentBadge />
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
          {isDemoUser
            ? 'Demo account can preview control workflows, but commands will not be sent to backend or devices.'
            : 'Your current role can view control history but cannot issue commands.'}
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
                {commandOptions.length === 0 && (
                  <div className="col-span-2 rounded border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    No controls available for this device type.
                  </div>
                )}
              </div>
            </div>

            {selectedOption?.valueType === 'select' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{selectedOption.label}</label>
                <select value={controlValues[selectedOption.id] ?? selectedOption.defaultValue ?? ''} onChange={(event) => setControlValues((current) => ({ ...current, [selectedOption.id]: event.target.value }))} className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {selectedOption.options?.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedOption?.valueType === 'toggle' && (
              <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/50">
                <span className="font-medium text-slate-700 dark:text-slate-200">{selectedOption.label}</span>
                <button
                  type="button"
                  disabled={!selectedDevice || !canControl || isSubmitting}
                  onClick={() => {
                    const nextValue = !Boolean(controlValues[selectedOption.id]);
                    const nextControlValues = { ...controlValues, [selectedOption.id]: nextValue };
                    setControlValues(nextControlValues);
                    submitCommand(nextControlValues, true);
                  }}
                  className={cn(
                    "relative inline-flex h-10 w-24 shrink-0 items-center rounded-full border-2 px-2 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    Boolean(controlValues[selectedOption.id])
                      ? "justify-start border-slate-950 bg-slate-950 text-white dark:border-orange-500 dark:bg-orange-600"
                      : "justify-end border-slate-950 bg-white text-slate-950 dark:border-slate-400 dark:bg-slate-950 dark:text-white"
                  )}
                >
                  <span className="z-10 text-sm">{Boolean(controlValues[selectedOption.id]) ? 'ON' : 'OFF'}</span>
                  <span
                    className={cn(
                      "absolute top-1 h-7 w-7 rounded-full transition-all",
                      Boolean(controlValues[selectedOption.id])
                        ? "right-1 bg-white"
                        : "left-1 bg-slate-950 dark:bg-white"
                    )}
                  />
                </button>
              </div>
            )}

            {(selectedOption?.valueType === 'range' || selectedOption?.valueType === 'slider') && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{selectedOption.label}</label>
                  <span className="text-sm font-semibold text-orange-600">{controlValues[selectedOption.id] ?? selectedOption.defaultValue}{selectedOption.unit}</span>
                </div>
                <input type="range" min={selectedOption.min ?? 0} max={selectedOption.max ?? 100} step={selectedOption.step ?? 1} value={controlValues[selectedOption.id] ?? selectedOption.defaultValue ?? 0} onChange={(event) => setControlValues((current) => ({ ...current, [selectedOption.id]: Number(event.target.value) }))} className="mt-3 w-full accent-orange-600" />
              </div>
            )}

            {selectedOption?.valueType === 'number' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{selectedOption.label}</label>
                <div className="mt-1 flex rounded border border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <input type="number" min={selectedOption.min} max={selectedOption.max} step={selectedOption.step ?? 1} value={controlValues[selectedOption.id] ?? selectedOption.defaultValue ?? ''} onChange={(event) => setControlValues((current) => ({ ...current, [selectedOption.id]: Number(event.target.value) }))} className="h-10 flex-1 border-0 bg-transparent px-3 text-sm text-slate-900 outline-none focus:ring-0 dark:text-slate-100" />
                  {selectedOption.unit && <span className="flex items-center px-3 text-xs text-slate-500">{selectedOption.unit}</span>}
                </div>
              </div>
            )}

            {selectedOption?.valueType === 'text' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Parameter</label>
                  <input value={parameterName} onChange={(event) => setParameterName(event.target.value)} placeholder="setpoint" className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Value</label>
                  <input value={controlValues[selectedOption.id] ?? ''} onChange={(event) => setControlValues((current) => ({ ...current, [selectedOption.id]: event.target.value }))} placeholder="42" className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
              </div>
            )}

            {selectedOption?.valueType === 'parameter_group' && (
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedOption.fields?.map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{field.label}</label>
                    {field.valueType === 'select' ? (
                      <select
                        value={controlValues[`${selectedOption.id}.${field.key}`] ?? field.defaultValue ?? ''}
                        onChange={(event) => setControlValues((current) => ({ ...current, [`${selectedOption.id}.${field.key}`]: event.target.value }))}
                        className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        {field.options?.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.valueType === 'number' ? 'number' : 'text'}
                        value={controlValues[`${selectedOption.id}.${field.key}`] ?? field.defaultValue ?? ''}
                        onChange={(event) => setControlValues((current) => ({ ...current, [`${selectedOption.id}.${field.key}`]: field.valueType === 'number' ? Number(event.target.value) : event.target.value }))}
                        className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {selectedOption?.valueType !== 'toggle' && (
              <label className="flex items-start gap-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                <input type="checkbox" checked={confirmChecked} onChange={(event) => setConfirmChecked(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-orange-600 focus:ring-orange-500" />
                <span>I confirm this command may affect live industrial equipment and should be recorded in the control log.</span>
              </label>
            )}

            {selectedOption?.valueType !== 'toggle' && (
              <button
                type="button"
                onClick={() => submitCommand()}
                disabled={!selectedDevice || !canControl || !confirmChecked || isSubmitting}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
              >
                <Play className="h-4 w-4" />
                {isSubmitting ? 'Submitting...' : 'Submit Command'}
              </button>
            )}

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
