import React, { useEffect, useState } from 'react';
import { ArrowRight, MoreVertical, Edit2, PackageCheck, Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { DeviceForm } from '../components/DeviceForm';
import { DeviceConfirmDelete } from '../components/DeviceConfirmDelete';
import { getDeviceIcon } from '../lib/icons';
import { Link, useNavigate } from 'react-router-dom';
import type { Device } from '../types';
import { useRuntimeDevices } from '../hooks/useRuntimeDevices';
import { formatDeviceAge, getDeviceDataQuality } from '../lib/deviceStatus';
import { getUserAppProfile } from '../lib/featureAccess';

const getDeviceKeyMetric = (device: Device) => {
  const metrics = device.metrics || {};
  const preferredKeys = ['power', 'pressure', 'flow_rate', 'temperature', 'io_rate', 'di_on', 'relay_on', 'position', 'frequency', 'battery_soc', 'signal', 'cpu', 'value'];
  const metricKey = preferredKeys.find((key) => metrics[key] !== undefined) || Object.keys(metrics)[0];
  if (!metricKey) return '-';
  const units: Record<string, string> = {
    power: 'W',
    pressure: 'bar',
    flow_rate: 'm3/h',
    temperature: 'deg C',
    io_rate: '/s',
    frequency: 'Hz',
    battery_soc: '%',
    signal: '%',
    cpu: '%',
  };
  return `${metricKey}: ${metrics[metricKey] || 0}${units[metricKey] ? ` ${units[metricKey]}` : ''}`;
};

const qualityTone = (state: string) => (
  state === 'online' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' :
  state === 'warning' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' :
  state === 'stale' ? 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300' :
  'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
);

const qualityDot = (state: string) => (
  state === 'online' ? 'bg-emerald-500' :
  state === 'warning' ? 'bg-amber-500' :
  state === 'stale' ? 'bg-orange-500' :
  'bg-red-500'
);

export function Devices() {
  const navigate = useNavigate();
  const { language, devices: storedDevices, sites, activeSiteId, setActiveSite, currentUser } = useAppStore();
  const devices = useRuntimeDevices(storedDevices);
  const t = translations[language];
  const isSimpleProfile = getUserAppProfile(currentUser) === 'simple';
  const userSiteId = currentUser?.siteId || activeSiteId || 'factory-a';

  const [activeView, setActiveView] = useState<'list' | 'form'>('list');
  const [editingDeviceId, setEditingDeviceId] = useState<string | undefined>(undefined);
  const [deletingDeviceId, setDeletingDeviceId] = useState<string | null>(null);
  const [deviceConfirmMode, setDeviceConfirmMode] = useState<'delete' | 'remove'>('delete');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string>(isSimpleProfile ? userSiteId : activeSiteId || 'All');
  const [selectedTag, setSelectedTag] = useState<string>('All');

  const userSiteOption = sites.find((site) => site.id === userSiteId) || { id: userSiteId, name: userSiteId, tenantName: 'Assigned Site' };
  const siteOptions = isSimpleProfile
    ? [userSiteOption]
    : [{ id: 'All', name: 'All Sites', tenantName: 'All Tenants' }, ...sites];
  const effectiveSiteId = isSimpleProfile ? userSiteId : selectedSiteId;
  const siteScopedDevices = devices.filter((device) => (
    effectiveSiteId === 'All'
    || device.siteId === effectiveSiteId
    || sites.find((site) => site.id === effectiveSiteId)?.tags?.some((tag) => device.tags?.includes(tag))
  ));
  const uniqueTags = ['All', ...Array.from(new Set(siteScopedDevices.flatMap(d => d.tags || [])))].filter(Boolean);
  const filteredDevices = siteScopedDevices.filter(d => selectedTag === 'All' || d.tags?.includes(selectedTag));

  const handleSiteSelect = (siteId: string) => {
    if (isSimpleProfile) return;
    setSelectedSiteId(siteId);
    setSelectedTag('All');
    if (siteId !== 'All') setActiveSite(siteId);
  };

  useEffect(() => {
    if (isSimpleProfile && selectedSiteId !== userSiteId) {
      setSelectedSiteId(userSiteId);
      setSelectedTag('All');
      return;
    }
    if (!activeSiteId || selectedSiteId === 'All' || selectedSiteId === activeSiteId) return;

    setSelectedSiteId(activeSiteId);
    setSelectedTag('All');
  }, [activeSiteId, isSimpleProfile, selectedSiteId, userSiteId]);

  const handleCreate = () => {
    if (isSimpleProfile) {
      navigate('/claim');
      return;
    }
    setEditingDeviceId(undefined);
    setActiveView('form');
  };

  const handleEdit = (id: string) => {
    setEditingDeviceId(id);
    setActiveView('form');
    setOpenDropdown(null);
  };

  const handleDelete = (id: string) => {
    setDeviceConfirmMode('delete');
    setDeletingDeviceId(id);
    setOpenDropdown(null);
  };

  const handleRemoveFromMyDevices = (id: string) => {
    setDeviceConfirmMode('remove');
    setDeletingDeviceId(id);
    setOpenDropdown(null);
  };

  const closeForm = () => {
    setActiveView('list');
    setEditingDeviceId(undefined);
  };

  if (activeView === 'form') {
    return <DeviceForm deviceId={editingDeviceId} onClose={closeForm} />;
  }

  if (isSimpleProfile) {
    const siteName = userSiteOption.name || 'My Site';
    const qualityByDevice = new Map(filteredDevices.map((device) => [
      device.id,
      getDeviceDataQuality(storedDevices.find((item) => item.id === device.id) || device),
    ]));
    const onlineCount = filteredDevices.filter((device) => qualityByDevice.get(device.id)?.state === 'online').length;
    const attentionCount = filteredDevices.filter((device) => {
      const state = qualityByDevice.get(device.id)?.state;
      return state === 'warning' || state === 'stale' || state === 'offline';
    }).length;

    return (
      <div className="mx-auto max-w-4xl space-y-5 pb-10">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{siteName}</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">My Devices</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Open a device to view status and operate it.</p>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm dark:border-slate-800 dark:bg-[#1c2128]">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{filteredDevices.length}</p>
            <p className="mt-1 text-xs text-slate-500">Total</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{onlineCount}</p>
            <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">Online</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{attentionCount}</p>
            <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">Attention</p>
          </div>
        </div>

        {filteredDevices.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-[#1c2128]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300">
              <PackageCheck className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">Add your first device</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
              Scan or enter the MAC, IMEI, or Serial Number on your device label to finish setup.
            </p>
            <button
              type="button"
              onClick={handleCreate}
              className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-orange-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
            >
              <Plus className="h-4 w-4" />
              Add Device
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDevices.map((device) => {
              const IconComp = getDeviceIcon(device.icon);
              const quality = qualityByDevice.get(device.id) || getDeviceDataQuality(device);
              const keyMetric = quality.hasLiveData ? getDeviceKeyMetric(device) : 'No Live Data';

              return (
                <div
                  key={device.id}
                  className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md dark:border-slate-800 dark:bg-[#1c2128] dark:hover:border-orange-500/40"
                >
                  <div className="flex items-start gap-4">
                    <Link to={`/devices/${device.id}`} className="flex min-w-0 flex-1 items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/20">
                        <IconComp className="h-7 w-7" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-bold text-slate-900 dark:text-white">{device.name}</p>
                            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{device.id}</p>
                          </div>
                          <span className={cn(
                            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase',
                            qualityTone(quality.state)
                          )}>
                            <span className={cn('h-1.5 w-1.5 rounded-full', qualityDot(quality.state))} />
                            {quality.label}
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Current</p>
                            <p className="mt-1 truncate font-mono text-lg font-bold text-slate-900 dark:text-white">{keyMetric}</p>
                            <p className="mt-1 text-xs text-slate-500">Last seen {formatDeviceAge(quality.ageMs)}</p>
                          </div>
                          <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                            Operate
                            <ArrowRight className="h-4 w-4" />
                          </span>
                        </div>
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleRemoveFromMyDevices(device.id)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                      title="Remove from my devices"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t.devices.title}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {t.devices.desc}
          </p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          <button
            type="button"
            onClick={handleCreate}
            className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-sm font-medium rounded text-white border border-orange-500 shadow-sm"
          >
            {t.devices.addDevice}
          </button>
        </div>
      </div>
      
      <div className="space-y-3 -mt-2">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Sites</p>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {siteOptions.map((site) => (
              <button
                key={site.id}
                type="button"
                onClick={() => handleSiteSelect(site.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border transition-colors whitespace-nowrap",
                  selectedSiteId === site.id
                    ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200 shadow-sm"
                    : "bg-white dark:bg-[#1c2128] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                )}
              >
                <span>{site.name}</span>
                {site.id !== 'All' && (
                  <span className={cn(
                    "text-[10px] font-normal",
                    selectedSiteId === site.id ? "text-slate-300 dark:text-slate-600" : "text-slate-400"
                  )}>{site.tenantName}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tags</p>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {uniqueTags.map(tag => (
          <button
            key={tag}
            onClick={() => setSelectedTag(tag)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-full border transition-colors whitespace-nowrap",
              selectedTag === tag 
                ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200 shadow-sm" 
                : "bg-white dark:bg-[#1c2128] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
            )}
          >
            {tag}
          </button>
        ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 pb-6 md:hidden">
        {filteredDevices.map((device) => {
          const IconComp = getDeviceIcon(device.icon);
          const keyMetric = getDeviceKeyMetric(device) || (
            device.type === 'energy_meter' ? `${device.metrics.power || 0} W` :
            device.type === 'temperature_sensor' ? `${device.metrics.temperature || 0} 掳C` :
            device.type === 'air_compressor' ? `${device.metrics.pressure || 0} bar` :
            device.type === 'gateway' ? `CPU: ${device.metrics.cpu || 0}%` :
            device.type === 'dtu' ? `Volt: ${device.metrics.voltage || 0} V` :
            device.type === 'rtu' ? `Mem: ${device.metrics.memory || 0}%` :
            device.type === 'lora_gateway' ? `RSSI: ${device.metrics.rssi || 0} dBm` :
            device.type === 'plc' ? `I/O: ${device.metrics.io_rate || 0}/s` :
            device.type === 'solar_inverter' ? `${device.metrics.power || 0} W` :
            device.type === 'pump_controller' ? `${device.metrics.pressure || 0} bar` :
            '-');
          const quality = getDeviceDataQuality(storedDevices.find((item) => item.id === device.id) || device);

          return (
            <div key={device.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#1c2128]">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/devices/${device.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                    <IconComp className="h-5 w-5 text-orange-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{device.name}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{device.id}</p>
                  </div>
                </Link>
                <span className={cn(
                  'mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                  qualityTone(quality.state)
                )}>
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    qualityDot(quality.state)
                  )} />
                  {quality.label}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-900/40">
                  <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">{t.devices.table.type}</p>
                  <p className="mt-1 truncate font-medium text-slate-800 dark:text-slate-200">
                    {(t.devices.types as any)[device.type] || device.type.replace('_', ' ')}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-900/40">
                  <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">{t.devices.table.metric}</p>
                  <p className="mt-1 truncate font-mono font-semibold text-slate-900 dark:text-white">{quality.hasLiveData ? keyMetric : 'No Live Data'}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t.devices.table.lastSeen}: {formatDeviceAge(quality.ageMs)}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(device.id)}
                    className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-orange-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-orange-400"
                    title={t.devices.editDevice}
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(device.id)}
                    className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                    title={t.devices.form.delete}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm pb-[100px] md:block">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-500 font-mono uppercase text-[10px]">
            <tr>
              <th className="p-4">{t.devices.table.name}</th>
              <th className="p-4">{t.devices.table.type}</th>
              <th className="p-4">{t.devices.table.status}</th>
              <th className="p-4 text-right">{t.devices.table.metric}</th>
              <th className="p-4">{t.devices.table.lastSeen}</th>
              <th className="p-4 text-center">{t.devices.table.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 font-mono">
            {filteredDevices.map((device) => {
              const IconComp = getDeviceIcon(device.icon);
              const quality = getDeviceDataQuality(storedDevices.find((item) => item.id === device.id) || device);
              return (
              <tr key={device.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <td className="p-4">
                  <Link to={`/devices/${device.id}`} className="flex items-center group cursor-pointer">
                    <div className="h-8 w-8 flex-shrink-0 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center group-hover:border-orange-500/50 transition-colors">
                      <IconComp className="h-4 w-4 text-slate-500 dark:text-slate-400 group-hover:text-orange-500 transition-colors" />
                    </div>
                    <div className="ml-4">
                      <div className="font-medium text-slate-900 dark:text-slate-300 group-hover:text-orange-600 transition-colors">{device.name}</div>
                      <div className="text-slate-500 text-[10px]">{device.id}</div>
                    </div>
                  </Link>
                </td>
                <td className="p-4">
                  <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px]">
                    {(t.devices.types as any)[device.type] || device.type.replace('_', ' ')}
                  </span>
                </td>
                <td className="p-4">
                  <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 text-[11px]">
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      qualityDot(quality.state)
                    )}></span>
                    {quality.label}
                  </span>
                </td>
                <td className="p-4 text-right text-slate-700 dark:text-slate-300">
                  {!quality.hasLiveData && <span className="text-slate-400">No Live Data</span>}
                  {quality.hasLiveData && (
                    <>
                  {device.type === 'energy_meter' && `${device.metrics.power || 0} W`}
                  {device.type === 'temperature_sensor' && `${device.metrics.temperature || 0} °C`}
                  {device.type === 'air_compressor' && `${device.metrics.pressure || 0} bar`}
                  {device.type === 'gateway' && `CPU: ${device.metrics.cpu || 0}%`}
                  {device.type === 'dtu' && `Volt: ${device.metrics.voltage || 0} V`}
                  {device.type === 'rtu' && `Mem: ${device.metrics.memory || 0}%`}
                  {device.type === 'lora_gateway' && `RSSI: ${device.metrics.rssi || 0} dBm`}
                  {device.type === 'plc' && `I/O: ${device.metrics.io_rate || 0}/s`}
                  {device.type === 'solar_inverter' && `${device.metrics.power || 0} W`}
                  {device.type === 'pump_controller' && `${device.metrics.pressure || 0} bar`}
                  {!['energy_meter', 'temperature_sensor', 'air_compressor', 'gateway', 'dtu', 'rtu', 'lora_gateway', 'plc', 'solar_inverter', 'pump_controller'].includes(device.type) && getDeviceKeyMetric(device)}
                    </>
                  )}
                </td>
                <td className="p-4 text-slate-500 dark:text-slate-400">
                  {formatDeviceAge(quality.ageMs)}
                </td>
                <td className="p-4 text-center relative">
                  <button 
                    type="button" 
                    onClick={() => setOpenDropdown(openDropdown === device.id ? null : device.id)}
                    className="p-1 text-slate-400 hover:text-orange-600 dark:text-slate-500 dark:hover:text-orange-400 rounded transition-colors"
                  >
                    <MoreVertical className="h-4 w-4 mx-auto" />
                  </button>
                  {openDropdown === device.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)}></div>
                      <div className="absolute right-[50%] mt-1 mr-4 w-32 bg-white dark:bg-[#1f252d] border border-slate-200 dark:border-slate-700 rounded-md shadow-lg z-20 py-1 font-sans">
                        <button
                          onClick={() => handleEdit(device.id)}
                          className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-2 transition-colors"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          {t.devices.editDevice}
                        </button>
                        <button
                          onClick={() => handleDelete(device.id)}
                          className="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 dark:text-red-500 flex items-center gap-2 transition-colors mt-0.5 border-t border-slate-100 dark:border-slate-800/50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t.devices.form.delete}
                        </button>
                      </div>
                    </>
                  )}
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {deletingDeviceId && (
        <DeviceConfirmDelete 
          deviceId={deletingDeviceId} 
          title={deviceConfirmMode === 'remove' ? 'Remove from My Devices' : undefined}
          description={deviceConfirmMode === 'remove'
            ? 'This removes the device from your My Devices list and releases its claim so it can be bound again. It does not delete device models, inventory records, or historical telemetry.'
            : undefined}
          confirmLabel={deviceConfirmMode === 'remove' ? 'Remove Device' : undefined}
          tone={deviceConfirmMode === 'remove' ? 'warning' : 'danger'}
          onClose={() => setDeletingDeviceId(null)}
          onConfirm={() => {
            if (deviceConfirmMode === 'remove') {
              useAppStore.getState().removeDeviceFromMyDevices(deletingDeviceId, currentUser);
            } else {
              useAppStore.getState().deleteDevice(deletingDeviceId);
            }
            setDeletingDeviceId(null);
          }}
        />
      )}
    </div>
  );
}
