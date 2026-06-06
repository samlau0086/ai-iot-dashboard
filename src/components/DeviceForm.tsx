import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { Device, DeviceType } from '../types';
import { IOT_ICONS } from '../lib/icons';

interface DeviceFormProps {
  deviceId?: string; // If provided, it's edit mode
  onClose: () => void;
}

export function DeviceForm({ deviceId, onClose }: DeviceFormProps) {
  const { language, devices, addDevice, updateDevice } = useAppStore();
  const t = translations[language].devices.form;
  const typesT = translations[language].devices.types;

  const existingDevice = deviceId ? devices.find(d => d.id === deviceId) : null;

  const [formData, setFormData] = useState<Partial<Device>>({
    name: '',
    type: 'gateway',
    tags: ['factory-a'],
    icon: 'server',
    ...existingDevice
  });

  const [configData, setConfigData] = useState<any>({
    dataSource: 'manual',
    ...existingDevice?.config
  });
  
  const [tagInput, setTagInput] = useState('');

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      const val = tagInput.trim();
      if (val) {
        e.preventDefault();
        if (!formData.tags?.includes(val)) {
          setFormData(prev => ({ ...prev, tags: [...(prev.tags || []), val] }));
        }
        setTagInput('');
      }
    } else if (e.key === 'Backspace' && !tagInput && formData.tags?.length) {
      setFormData(prev => ({ ...prev, tags: prev.tags?.slice(0, -1) }));
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({ ...prev, tags: prev.tags?.filter(t => t !== tagToRemove) }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setConfigData((prev: any) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleConfigSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfigData((prev: any) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSave = () => {
    const deviceId = existingDevice?.id || `DEV-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const newDevice: Device = {
      id: deviceId,
      name: formData.name || 'Unnamed Device',
      type: formData.type as DeviceType,
      tags: formData.tags || ['factory-a'],
      icon: formData.icon,
      config: {
        ...configData,
        externalDeviceId: configData.externalDeviceId || deviceId,
      },
      status: existingDevice?.status || 'offline',
      lastSeen: existingDevice?.lastSeen || new Date().toISOString(),
      firmwareVersion: existingDevice?.firmwareVersion || 'v1.0.0',
      metrics: existingDevice?.metrics || {}
    };

    if (existingDevice) {
      updateDevice(newDevice.id, newDevice);
    } else {
      addDevice(newDevice);
    }
    onClose();
  };

  const renderConfigFields = () => {
    switch (formData.type) {
      case 'dtu':
        return (
          <>
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t.protocol}</label>
              <select name="protocol" value={configData.protocol || 'MQTT'} onChange={handleConfigSelectChange} className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300">
                <option value="MQTT">MQTT</option>
                <option value="TCP">TCP</option>
                <option value="UDP">UDP</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t.baudRate}</label>
              <input type="number" name="baudRate" value={configData.baudRate || 9600} onChange={handleConfigChange} className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
            </div>
          </>
        );
      case 'rtu':
        return (
          <>
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t.pollingInterval}</label>
              <input type="number" name="pollingInterval" value={configData.pollingInterval || 5000} onChange={handleConfigChange} className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
            </div>
          </>
        );
      case 'gateway':
        return (
          <>
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t.ipAddress}</label>
              <input type="text" name="ipAddress" value={configData.ipAddress || ''} onChange={handleConfigChange} placeholder="192.168.1.100" className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
            </div>
          </>
        );
      case 'lora_gateway':
        return (
          <>
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t.frequencyPlan}</label>
              <select name="frequencyPlan" value={configData.frequencyPlan || 'EU868'} onChange={handleConfigSelectChange} className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300">
                <option value="EU868">EU868</option>
                <option value="US915">US915</option>
                <option value="CN470">CN470</option>
                <option value="AS923">AS923</option>
              </select>
            </div>
          </>
        );
      case 'sensor':
      case 'temperature_sensor':
        return (
          <>
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t.measurementType}</label>
              <input type="text" name="measurementType" value={configData.measurementType || ''} onChange={handleConfigChange} placeholder="Temperature, Humidity..." className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-5 sm:px-6 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-lg leading-6 font-medium text-slate-900 dark:text-white">
          {existingDevice ? translations[language].devices.editDevice : translations[language].devices.addDevice}
        </h3>
      </div>
      <div className="px-4 py-5 sm:p-6 space-y-6">
        
        {/* Basic Info */}
        <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t.name}</label>
            <input 
              type="text" 
              name="name" 
              value={formData.name} 
              onChange={handleChange} 
              className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" 
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t.type}</label>
            <select 
              name="type" 
              value={formData.type} 
              onChange={handleChange} 
              className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300"
            >
              {Object.keys(typesT).map(key => (
                <option key={key} value={key}>{(typesT as any)[key]}</option>
              ))}
            </select>
          </div>
          
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t.site}</label>
            <div className="mt-1 flex flex-wrap gap-2 items-center w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-1.5 focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500">
              {formData.tags?.map(tag => (
                <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none">
                    &times;
                  </button>
                </span>
              ))}
              <input 
                type="text" 
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type and press Enter..."
                className="flex-1 min-w-[120px] bg-transparent border-none focus:ring-0 p-0 sm:text-sm text-slate-900 dark:text-slate-300 shadow-none" 
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t.icon}</label>
          <div className="flex flex-wrap gap-3">
            {Object.keys(IOT_ICONS).map((iconId) => {
              const IconComp = IOT_ICONS[iconId];
              return (
                <button
                  key={iconId}
                  onClick={() => setFormData(p => ({ ...p, icon: iconId }))}
                  className={`p-3 rounded-md border ${
                    formData.icon === iconId 
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-500' 
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
                  } transition-colors`}
                >
                  <IconComp className="w-5 h-5" />
                </button>
              )
            })}
          </div>
        </div>

        {/* Config / Advanced */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
           <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-2">{t.config}</h4>
           <div className="mb-5 rounded border border-orange-200 dark:border-orange-500/30 bg-orange-50/70 dark:bg-orange-500/10 p-3 text-xs text-orange-900 dark:text-orange-100">
             <p className="font-semibold">Data Binding</p>
             <p className="mt-1 text-orange-800 dark:text-orange-200">
               Use these fields to link this platform device with real API or MQTT telemetry. Incoming data is matched by External Device ID first, then by the platform Device ID.
             </p>
           </div>
           <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
             <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">External Device ID</label>
              <input
                type="text"
                name="externalDeviceId"
                value={configData.externalDeviceId || existingDevice?.id || ''}
                onChange={handleConfigChange}
                placeholder="ID from API/MQTT payload, e.g. meter-001"
                className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Used to match device_id/deviceId/id from real telemetry.</p>
             </div>
             <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Data Source</label>
              <select
                name="dataSource"
                value={configData.dataSource || 'manual'}
                onChange={handleConfigSelectChange}
                className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300"
              >
                <option value="manual">Manual / Mock</option>
                <option value="api">HTTP API</option>
                <option value="mqtt">MQTT</option>
              </select>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose where live metrics for this device should come from.</p>
             </div>
             <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">API Path</label>
              <input
                type="text"
                name="apiPath"
                value={configData.apiPath || ''}
                onChange={handleConfigChange}
                placeholder="/devices/meter-001 or /telemetry/meter-001"
                className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Optional record of the backend endpoint used for this device.</p>
             </div>
             <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">MQTT Topic</label>
              <input
                type="text"
                name="mqttTopic"
                value={configData.mqttTopic || ''}
                onChange={handleConfigChange}
                placeholder="factory-a/energy/meter-001/telemetry"
                className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Optional telemetry topic used by the MQTT/WebSocket bridge.</p>
             </div>
             {renderConfigFields()}
           </div>
        </div>

      </div>
      
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 text-right sm:px-6 flex gap-3 justify-end">
        <button
          onClick={onClose}
          type="button"
          className="inline-flex justify-center py-2 px-4 border border-slate-300 dark:border-slate-700 shadow-sm text-sm font-medium rounded-md text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none"
        >
          {t.cancel}
        </button>
        <button
          onClick={handleSave}
          type="button"
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none"
        >
          {t.save}
        </button>
      </div>
    </div>
  );
}
