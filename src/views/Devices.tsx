import React, { useEffect, useState } from 'react';
import { MoreVertical, Edit2, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { DeviceForm } from '../components/DeviceForm';
import { DeviceConfirmDelete } from '../components/DeviceConfirmDelete';
import { getDeviceIcon } from '../lib/icons';
import { Link } from 'react-router-dom';
import type { Device } from '../types';

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

export function Devices() {
  const { language, devices, sites, activeSiteId, setActiveSite } = useAppStore();
  const t = translations[language];

  const [activeView, setActiveView] = useState<'list' | 'form'>('list');
  const [editingDeviceId, setEditingDeviceId] = useState<string | undefined>(undefined);
  const [deletingDeviceId, setDeletingDeviceId] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string>(activeSiteId || 'All');
  const [selectedTag, setSelectedTag] = useState<string>('All');

  const siteOptions = [{ id: 'All', name: 'All Sites', tenantName: 'All Tenants' }, ...sites];
  const siteScopedDevices = devices.filter((device) => (
    selectedSiteId === 'All'
    || device.siteId === selectedSiteId
    || sites.find((site) => site.id === selectedSiteId)?.tags?.some((tag) => device.tags?.includes(tag))
  ));
  const uniqueTags = ['All', ...Array.from(new Set(siteScopedDevices.flatMap(d => d.tags || [])))].filter(Boolean);
  const filteredDevices = siteScopedDevices.filter(d => selectedTag === 'All' || d.tags?.includes(selectedTag));

  const handleSiteSelect = (siteId: string) => {
    setSelectedSiteId(siteId);
    setSelectedTag('All');
    if (siteId !== 'All') setActiveSite(siteId);
  };

  useEffect(() => {
    if (!activeSiteId || selectedSiteId === 'All' || selectedSiteId === activeSiteId) return;

    setSelectedSiteId(activeSiteId);
    setSelectedTag('All');
  }, [activeSiteId, selectedSiteId]);

  const handleCreate = () => {
    setEditingDeviceId(undefined);
    setActiveView('form');
  };

  const handleEdit = (id: string) => {
    setEditingDeviceId(id);
    setActiveView('form');
    setOpenDropdown(null);
  };

  const handleDelete = (id: string) => {
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
                  device.status === 'online' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' :
                  device.status === 'warning' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' :
                  'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                )}>
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    device.status === 'online' ? 'bg-emerald-500' :
                    device.status === 'warning' ? 'bg-amber-500' :
                    'bg-red-500'
                  )} />
                  {device.status}
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
                  <p className="mt-1 truncate font-mono font-semibold text-slate-900 dark:text-white">{keyMetric}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t.devices.table.lastSeen}: {new Date(device.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit'})}
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
                      device.status === 'online' ? "bg-emerald-500" : 
                      device.status === 'warning' ? "bg-amber-500" : 
                      "bg-red-500"
                    )}></span>
                    {device.status.charAt(0).toUpperCase() + device.status.slice(1)}
                  </span>
                </td>
                <td className="p-4 text-right text-slate-700 dark:text-slate-300">
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
                </td>
                <td className="p-4 text-slate-500 dark:text-slate-400">
                  {new Date(device.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit'})}
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
          onClose={() => setDeletingDeviceId(null)}
          onConfirm={() => {
            useAppStore.getState().deleteDevice(deletingDeviceId);
            setDeletingDeviceId(null);
          }}
        />
      )}
    </div>
  );
}
