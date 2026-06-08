import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { Device, DeviceType } from '../types';
import { IOT_ICONS } from '../lib/icons';
import { ArrowLeft, Copy } from 'lucide-react';

interface DeviceFormProps {
  deviceId?: string; // If provided, it's edit mode
  onClose: () => void;
}

const INDUSTRIAL_PROTOCOL_OPTIONS = [
  'HTTP Push',
  'MQTT',
  'Modbus RTU',
  'Modbus TCP',
  'CAN',
  'LoRa',
  '4G',
  'Ethernet',
  'WiFi',
  'Manual / Mock',
];

export function DeviceForm({ deviceId, onClose }: DeviceFormProps) {
  const { language, devices, addDevice, updateDevice, currentUser, sites, activeSiteId } = useAppStore();
  const t = translations[language].devices.form;
  const typesT = translations[language].devices.types;
  const isAdmin = currentUser?.role === 'Admin';

  const existingDevice = deviceId ? devices.find(d => d.id === deviceId) : null;
  const defaultSite = sites.find((site) => site.id === (existingDevice?.siteId || activeSiteId)) || sites[0];

  const [formData, setFormData] = useState<Partial<Device>>({
    name: '',
    type: 'gateway',
    siteId: defaultSite?.id || 'factory-a',
    tenantId: defaultSite?.tenantId || 'default-tenant',
    tags: defaultSite?.tags || ['factory-a'],
    icon: 'server',
    ...existingDevice
  });

  const initialConfigData = {
    dataSource: 'manual',
    ...existingDevice?.config,
    ...(existingDevice?.config?.dataSource === 'mqtt' && !existingDevice?.config?.protocol ? { protocol: 'MQTT' } : {}),
  };

  const [configData, setConfigData] = useState<any>({
    ...initialConfigData,
  });
  
  const [tagInput, setTagInput] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

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

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setConfigData((prev: any) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleConfigSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfigData((prev: any) => {
      const next = {
        ...prev,
        [name]: value,
      };

      if (name === 'dataSource' && value === 'mqtt') {
        next.protocol = 'MQTT';
      }

      if (name === 'dataSource' && value === 'api' && prev.protocol === 'MQTT') {
        next.protocol = 'HTTP Push';
      }

      if (name === 'dataSource' && value === 'manual' && prev.protocol === 'MQTT') {
        next.protocol = 'Manual / Mock';
      }

      return next;
    });
  };

  const sampleMetricsByType = (type?: DeviceType) => {
    switch (type) {
      case 'energy_meter':
        return { power: 4070, energy: 128.6, voltage: 380, current: 10.7 };
      case 'temperature_sensor':
      case 'sensor':
        return { temperature: -18.4, humidity: 62, battery: 85 };
      case 'air_compressor':
        return { pressure: 7.8, air_flow: 520, oil_temp: 76, leakage_rate: 1.8, power: 22000 };
      case 'solar_inverter':
        return { pv_power: 52.6, energy_today: 318.4, dc_voltage: 720, efficiency: 97.2 };
      case 'pump_controller':
        return { flow_rate: 68.5, pressure: 4.2, motor_temp: 58.3, runtime_hours: 1260 };
      case 'gateway':
        return { cpu: 45, ram: 60, uptime: 720 };
      case 'dtu':
      case 'rtu':
      case 'lora_gateway':
        return { voltage: 24, signal: 82, packet_loss: 0.2 };
      case 'plc':
        return { io_rate: 128, cycle_time: 12, cpu: 38 };
      default:
        return { value: 1 };
    }
  };

  const getTelemetryEndpoint = () => {
    const apiPath = String(configData.apiPath || '').trim();
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3006';

    if (apiPath) {
      if (apiPath.startsWith('http')) return apiPath;
      return `${origin}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
    }

    return `${origin}/api/telemetry`;
  };

  const buildTelemetryPayload = () => {
    const fallbackId = existingDevice?.id || 'NEW-DEVICE-ID';
    const externalDeviceId = String(configData.externalDeviceId || fallbackId).trim() || fallbackId;
    const deviceType = (formData.type || 'gateway') as DeviceType;

    return {
      device_id: externalDeviceId,
      device_type: deviceType,
      tags: formData.tags || ['factory-a'],
      ...(configData.dataSource === 'mqtt' ? { mqtt_topic: getMqttTelemetryTopic() } : {}),
      metrics: Object.keys(existingDevice?.metrics || {}).length
        ? existingDevice?.metrics
        : sampleMetricsByType(deviceType),
      status: existingDevice?.status || 'online',
      timestamp: new Date().toISOString(),
    };
  };

  const buildCurlRequest = () => {
    const payload = JSON.stringify(buildTelemetryPayload(), null, 2);
    return `curl -X POST "${getTelemetryEndpoint()}" \\
  -H "Content-Type: application/json" \\
  -H "x-iot-token: <copy-token-from-settings>" \\
  -d '${payload}'`;
  };

  function getMqttTelemetryTopic() {
    const fallbackId = existingDevice?.id || 'NEW-DEVICE-ID';
    const externalDeviceId = String(configData.externalDeviceId || fallbackId).trim() || fallbackId;
    return String(configData.mqttTopic || '').trim() || `devices/${externalDeviceId}/telemetry`;
  }

  const buildMqttExample = () => {
    const payload = JSON.stringify(buildTelemetryPayload(), null, 2);
    const commandPayload = configData.mqttCommandTemplate || JSON.stringify({
      cmd: '{{command}}',
      device: '{{deviceId}}',
      params: '{{parameters}}',
      ts: '{{timestamp}}',
    }, null, 2);
    return `Topic: ${getMqttTelemetryTopic()}

Payload:
${payload}

Command Topic:
${configData.commandTopic || `devices/${String(configData.externalDeviceId || existingDevice?.id || 'NEW-DEVICE-ID').trim()}/command`}

Command Payload Template:
${commandPayload}

MQTT CLI:
mqtt pub -h <broker-host> -p 1883 -t "${getMqttTelemetryTopic()}" -m '${JSON.stringify(buildTelemetryPayload())}'`;
  };

  const buildTelemetryExample = () => configData.dataSource === 'mqtt' ? buildMqttExample() : buildCurlRequest();

  const handleCopyTelemetryExample = async () => {
    setCopyMessage('');
    try {
      await navigator.clipboard.writeText(buildTelemetryExample());
      setCopyMessage(configData.dataSource === 'mqtt' ? 'MQTT example copied.' : 'Curl request copied.');
    } catch (error) {
      setCopyMessage('Copy failed. Select the example text and copy it manually.');
    }
  };

  const handleSave = () => {
    const deviceId = existingDevice?.id || `DEV-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const selectedSite = sites.find((site) => site.id === formData.siteId) || sites[0];
    const siteTags = selectedSite?.tags || [];
    const nextTags = Array.from(new Set([...(formData.tags || []), ...siteTags]));
    const newDevice: Device = {
      id: deviceId,
      name: formData.name || 'Unnamed Device',
      type: formData.type as DeviceType,
      siteId: selectedSite?.id || formData.siteId || 'factory-a',
      tenantId: selectedSite?.tenantId || formData.tenantId || 'default-tenant',
      tags: nextTags.length ? nextTags : ['factory-a'],
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Transport Mode</label>
              <select name="transportMode" value={configData.transportMode || 'MQTT'} onChange={handleConfigSelectChange} className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300">
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

  const renderIndustrialProtocolFields = () => {
    const protocol = configData.protocol || 'HTTP Push';

    if (protocol === 'Modbus RTU') {
      return (
        <>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Serial Port</label>
            <input type="text" name="serialPort" value={configData.serialPort || ''} onChange={handleConfigChange} placeholder="/dev/ttyUSB0 or COM3" className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Baud Rate</label>
            <input type="number" name="baudRate" value={configData.baudRate || 9600} onChange={handleConfigChange} className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Slave ID</label>
            <input type="number" name="slaveId" value={configData.slaveId || 1} onChange={handleConfigChange} className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
          <div className="sm:col-span-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Register / Metric Map</label>
            <input type="text" name="registerMap" value={configData.registerMap || ''} onChange={handleConfigChange} placeholder="40001:power,40002:voltage,40003:current" className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
        </>
      );
    }

    if (protocol === 'Modbus TCP') {
      return (
        <>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Device Host</label>
            <input type="text" name="host" value={configData.host || ''} onChange={handleConfigChange} placeholder="192.168.1.50" className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Port</label>
            <input type="number" name="port" value={configData.port || 502} onChange={handleConfigChange} className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Slave ID</label>
            <input type="number" name="slaveId" value={configData.slaveId || 1} onChange={handleConfigChange} className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
          <div className="sm:col-span-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Register / Metric Map</label>
            <input type="text" name="registerMap" value={configData.registerMap || ''} onChange={handleConfigChange} placeholder="40001:power,40002:voltage,40003:current" className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
        </>
      );
    }

    if (protocol === 'CAN') {
      return (
        <>
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">CAN Channel</label>
            <input type="text" name="canChannel" value={configData.canChannel || ''} onChange={handleConfigChange} placeholder="can0" className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bitrate</label>
            <input type="number" name="bitrate" value={configData.bitrate || 500000} onChange={handleConfigChange} className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
        </>
      );
    }

    if (protocol === 'LoRa') {
      return (
        <>
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">DevEUI</label>
            <input type="text" name="devEui" value={configData.devEui || ''} onChange={handleConfigChange} placeholder="70B3D57ED0000001" className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t.frequencyPlan}</label>
            <select name="frequencyPlan" value={configData.frequencyPlan || 'CN470'} onChange={handleConfigSelectChange} className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300">
              <option value="CN470">CN470</option>
              <option value="EU868">EU868</option>
              <option value="US915">US915</option>
              <option value="AS923">AS923</option>
            </select>
          </div>
        </>
      );
    }

    if (protocol === '4G') {
      return (
        <>
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">APN</label>
            <input type="text" name="apn" value={configData.apn || ''} onChange={handleConfigChange} placeholder="cmnet / iot.apn" className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">IMEI</label>
            <input type="text" name="imei" value={configData.imei || ''} onChange={handleConfigChange} placeholder="Gateway modem IMEI" className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
        </>
      );
    }

    if (protocol === 'Ethernet' || protocol === 'WiFi') {
      return (
        <>
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">IP Address</label>
            <input type="text" name="ipAddress" value={configData.ipAddress || ''} onChange={handleConfigChange} placeholder="192.168.1.100" className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{protocol === 'WiFi' ? 'SSID' : 'Subnet'}</label>
            <input type="text" name={protocol === 'WiFi' ? 'ssid' : 'subnet'} value={protocol === 'WiFi' ? (configData.ssid || '') : (configData.subnet || '')} onChange={handleConfigChange} placeholder={protocol === 'WiFi' ? 'Factory-WiFi' : '255.255.255.0'} className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300" />
          </div>
        </>
      );
    }

    return null;
  };

  return (
    <div className="bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-5 sm:px-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 -ml-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            title="Back to devices"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h3 className="text-lg leading-6 font-medium text-slate-900 dark:text-white">
            {existingDevice ? translations[language].devices.editDevice : translations[language].devices.addDevice}
          </h3>
        </div>
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Site / Tenant</label>
            <select
              name="siteId"
              value={formData.siteId || defaultSite?.id || 'factory-a'}
              onChange={(event) => {
                const selectedSite = sites.find((site) => site.id === event.target.value);
                setFormData((prev) => ({
                  ...prev,
                  siteId: event.target.value,
                  tenantId: selectedSite?.tenantId || prev.tenantId,
                  tags: Array.from(new Set([...(prev.tags || []), ...(selectedSite?.tags || [])])),
                }));
              }}
              className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300"
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.name} / {site.tenantName}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Devices inherit tenant ownership and default tags from the selected site.</p>
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Industrial Protocol</label>
              <select
                name="protocol"
                value={configData.protocol || 'HTTP Push'}
                onChange={handleConfigSelectChange}
                className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300"
              >
                {INDUSTRIAL_PROTOCOL_OPTIONS.map((protocol) => (
                  <option key={protocol} value={protocol}>{protocol}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Field-side protocol used by the edge gateway before data is normalized into HTTP Push or MQTT.</p>
             </div>
             {renderIndustrialProtocolFields()}
             <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">API Path</label>
              <input
                type="text"
                name="apiPath"
                value={configData.apiPath || ''}
                onChange={handleConfigChange}
                placeholder="/api/device-ingest/meter-001"
                className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Optional dedicated POST path for this device. Incoming payloads on this path are bound to this device.</p>
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
             <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">MQTT Command Topic</label>
              <input
                type="text"
                name="commandTopic"
                value={configData.commandTopic || ''}
                onChange={handleConfigChange}
                placeholder="factory-a/air-compressor-1/command"
                className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm text-slate-900 dark:text-slate-300"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Optional command topic. If empty, the backend derives one from MQTT Topic or External Device ID.</p>
             </div>
             {configData.dataSource === 'mqtt' && (
              <>
                <div className="sm:col-span-3">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">MQTT Receive Payload Template</label>
                  <textarea
                    name="mqttReceiveTemplate"
                    value={configData.mqttReceiveTemplate || ''}
                    onChange={handleConfigChange}
                    rows={8}
                    placeholder={`{
  "device_id": "$.device.id",
  "status": "$.state",
  "metrics": {
    "power": "$.data.p_total",
    "energy": "$.data.kwh",
    "voltage": "$.data.ua"
  }
}`}
                    className="mt-1 block w-full rounded-md border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Optional JSON template. Values like $.data.power read from the incoming MQTT payload and normalize it before storage.</p>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">MQTT Command Payload Template</label>
                  <textarea
                    name="mqttCommandTemplate"
                    value={configData.mqttCommandTemplate || ''}
                    onChange={handleConfigChange}
                    rows={8}
                    placeholder={`{
  "cmd": "{{command}}",
  "id": "{{deviceId}}",
  "value": "{{parameters.value}}",
  "params": {{parametersJson}},
  "time": "{{timestamp}}"
}`}
                    className="mt-1 block w-full rounded-md border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Optional command JSON template. Supports command, deviceId, timestamp, parameters.xxx, and parametersJson placeholders.</p>
                </div>
              </>
             )}
             {renderConfigFields()}
           </div>
        </div>

        {isAdmin && (
          <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-medium text-slate-900 dark:text-white">
                  {configData.dataSource === 'mqtt' ? 'MQTT Telemetry Example' : 'Telemetry Test Curl'}
                </h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {configData.dataSource === 'mqtt'
                    ? 'Generated from the current MQTT topic and device binding fields. Publish this JSON payload to the topic after the backend subscriber is connected.'
                    : 'Generated from the current device binding fields. Use an active Ingest Token from Settings when testing /api/telemetry.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyTelemetryExample}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
            <pre className="mt-3 max-h-80 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-4 text-xs leading-5 text-slate-100 dark:border-slate-800">
              <code>{buildTelemetryExample()}</code>
            </pre>
            {copyMessage && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{copyMessage}</p>
            )}
          </div>
        )}

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
