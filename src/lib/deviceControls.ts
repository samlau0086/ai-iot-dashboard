import {
  Gauge,
  Power,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  SlidersHorizontal,
  Wind,
} from 'lucide-react';
import type { Device, DeviceType } from '../types';

export type DeviceControlValueType = 'none' | 'toggle' | 'select' | 'slider' | 'range' | 'number' | 'text' | 'parameter_group';

export type DeviceControlDefinition = {
  id: string;
  label: string;
  description: string;
  icon?: any;
  iconId?: string;
  valueType: DeviceControlValueType;
  parameterKey?: string;
  defaultValue?: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  fields?: Array<{ key: string; label: string; valueType: 'text' | 'number' | 'select'; defaultValue?: string | number | boolean; options?: Array<{ value: string; label: string }>; unit?: string }>;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

const commonPowerControls: DeviceControlDefinition[] = [
  { id: 'power_on', label: 'Power On', description: 'Start equipment operation.', icon: Power, valueType: 'none' },
  { id: 'power_off', label: 'Power Off', description: 'Stop equipment operation.', icon: PowerOff, valueType: 'none' },
];

export const deviceControlProfiles: Partial<Record<DeviceType, DeviceControlDefinition[]>> = {
  pump_controller: [
    ...commonPowerControls,
    { id: 'set_mode', label: 'Pump Mode', description: 'Switch pump control mode.', icon: Settings2, valueType: 'select', parameterKey: 'mode', defaultValue: 'auto', options: [
      { value: 'auto', label: 'Auto' },
      { value: 'manual', label: 'Manual' },
      { value: 'constant_pressure', label: 'Constant Pressure' },
      { value: 'energy_saving', label: 'Energy Saving' },
    ] },
    { id: 'set_pressure', label: 'Pressure Setpoint', description: 'Set target line pressure.', icon: Gauge, valueType: 'number', parameterKey: 'pressure', defaultValue: 4.2, min: 0, max: 16, step: 0.1, unit: 'bar' },
    { id: 'set_speed', label: 'Motor Speed', description: 'Set pump motor speed.', icon: SlidersHorizontal, valueType: 'slider', parameterKey: 'speed', defaultValue: 50, min: 0, max: 100, step: 1, unit: '%' },
  ],
  air_compressor: [
    ...commonPowerControls,
    { id: 'set_mode', label: 'Compressor Mode', description: 'Switch compressor operating mode.', icon: Settings2, valueType: 'select', parameterKey: 'mode', defaultValue: 'auto', options: [
      { value: 'auto', label: 'Auto' },
      { value: 'load_unload', label: 'Load / Unload' },
      { value: 'eco', label: 'Eco' },
      { value: 'maintenance', label: 'Maintenance' },
    ] },
    { id: 'set_pressure', label: 'Pressure Setpoint', description: 'Set discharge pressure.', icon: Gauge, valueType: 'number', parameterKey: 'pressure', defaultValue: 7.5, min: 0, max: 16, step: 0.1, unit: 'bar' },
    { id: 'drain_condensate', label: 'Drain Condensate', description: 'Trigger condensate drain valve.', icon: Wind, valueType: 'none' },
  ],
  plc: [
    { id: 'restart', label: 'Restart PLC', description: 'Restart PLC runtime.', icon: RotateCcw, valueType: 'none' },
    { id: 'set_mode', label: 'Run Mode', description: 'Switch PLC run mode.', icon: Settings2, valueType: 'select', parameterKey: 'mode', defaultValue: 'run', options: [
      { value: 'run', label: 'Run' },
      { value: 'stop', label: 'Stop' },
      { value: 'maintenance', label: 'Maintenance' },
    ] },
    { id: 'set_parameter', label: 'Write Register', description: 'Write a named control parameter.', icon: Send, valueType: 'text', parameterKey: 'value', defaultValue: '' },
  ],
  gateway: [
    { id: 'restart', label: 'Restart Gateway', description: 'Restart gateway service.', icon: RotateCcw, valueType: 'none' },
    { id: 'sync_config', label: 'Sync Config', description: 'Ask gateway to reload configuration.', icon: RefreshCw, valueType: 'none' },
    { id: 'set_parameter', label: 'Set Parameter', description: 'Write a gateway parameter.', icon: Send, valueType: 'text', parameterKey: 'value', defaultValue: '' },
  ],
  dtu: [
    { id: 'restart', label: 'Restart DTU', description: 'Restart DTU communication module.', icon: RotateCcw, valueType: 'none' },
    { id: 'sync_config', label: 'Sync Config', description: 'Reload DTU connection config.', icon: RefreshCw, valueType: 'none' },
    { id: 'set_parameter', label: 'Set Parameter', description: 'Write a DTU parameter.', icon: Send, valueType: 'text', parameterKey: 'value', defaultValue: '' },
  ],
  rtu: [
    { id: 'restart', label: 'Restart RTU', description: 'Restart RTU controller.', icon: RotateCcw, valueType: 'none' },
    { id: 'sync_config', label: 'Sync Config', description: 'Reload RTU polling config.', icon: RefreshCw, valueType: 'none' },
    { id: 'set_parameter', label: 'Set Parameter', description: 'Write an RTU parameter.', icon: Send, valueType: 'text', parameterKey: 'value', defaultValue: '' },
  ],
};

const CONTROL_ICONS: Record<string, any> = {
  gauge: Gauge,
  power: Power,
  power_off: PowerOff,
  refresh: RefreshCw,
  restart: RotateCcw,
  send: Send,
  settings: Settings2,
  sliders: SlidersHorizontal,
  wind: Wind,
};

export const CONTROL_ICON_OPTIONS = [
  { id: 'send', label: 'Send' },
  { id: 'power', label: 'Power On' },
  { id: 'power_off', label: 'Power Off' },
  { id: 'restart', label: 'Restart' },
  { id: 'refresh', label: 'Refresh / Sync' },
  { id: 'settings', label: 'Settings' },
  { id: 'sliders', label: 'Sliders' },
  { id: 'gauge', label: 'Gauge' },
  { id: 'wind', label: 'Air / Drain' },
];

export const resolveControlIcon = (definition: DeviceControlDefinition) => (
  definition.icon || CONTROL_ICONS[definition.iconId || ''] || Send
);

export const sanitizeControlDefinition = (definition: DeviceControlDefinition): DeviceControlDefinition => {
  const { icon, ...serializable } = definition;
  return {
    ...serializable,
    iconId: definition.iconId || (
      definition.id.includes('power_off') ? 'power_off'
        : definition.id.includes('power') ? 'power'
          : definition.id.includes('restart') ? 'restart'
            : definition.id.includes('sync') ? 'refresh'
              : definition.id.includes('pressure') ? 'gauge'
                : definition.id.includes('speed') || definition.id.includes('mode') ? 'sliders'
                  : definition.id.includes('drain') ? 'wind'
                    : 'send'
    ),
  };
};

export const getDeviceControlDefinitions = (device?: Pick<Device, 'type'> | null) => {
  if (!device) return [];
  const customDefinitions = (device as any).config?.controlDefinitions;
  if (Array.isArray(customDefinitions)) {
    return customDefinitions.map((definition) => ({
      ...definition,
      icon: resolveControlIcon(definition),
    }));
  }

  return (deviceControlProfiles[device.type] || []).map((definition) => ({
    ...definition,
    icon: resolveControlIcon(definition),
  }));
};

export const isDeviceControllable = (device?: Pick<Device, 'type'> | null) => getDeviceControlDefinitions(device).length > 0;

export const buildControlParameters = (
  definition: DeviceControlDefinition,
  controlValues: Record<string, any>,
  parameterName?: string
) => {
  if (definition.valueType === 'none') return {};
  if (definition.valueType === 'toggle') {
    return { [definition.parameterKey || definition.id]: Boolean(controlValues[definition.id]) };
  }
  if (definition.valueType === 'parameter_group') {
    return (definition.fields || []).reduce<Record<string, any>>((acc, field) => {
      acc[field.key] = controlValues[`${definition.id}.${field.key}`] ?? field.defaultValue ?? '';
      return acc;
    }, {});
  }
  const parameterKey = definition.parameterKey || definition.id;
  const value = controlValues[definition.id] ?? definition.defaultValue ?? '';

  if (definition.id === 'set_parameter') {
    return {
      name: parameterName || 'parameter',
      value,
    };
  }

  return {
    [parameterKey]: value,
  };
};

export const buildControlStatePatch = (
  definition: DeviceControlDefinition,
  controlValues: Record<string, any>,
  parameters: Record<string, any>
) => {
  if (definition.id === 'power_on') return { powerState: true, lastCommand: definition.id };
  if (definition.id === 'power_off') return { powerState: false, lastCommand: definition.id };
  if (definition.id === 'restart' || definition.id === 'sync_config' || definition.id === 'drain_condensate') {
    return { lastCommand: definition.id, lastCommandAt: new Date().toISOString() };
  }
  if (definition.valueType === 'toggle') {
    return {
      lastCommand: definition.id,
      [definition.id]: Boolean(controlValues[definition.id]),
    };
  }
  if (definition.valueType === 'parameter_group') {
    return {
      lastCommand: definition.id,
      ...Object.fromEntries((definition.fields || []).map((field) => [
        `${definition.id}.${field.key}`,
        controlValues[`${definition.id}.${field.key}`] ?? field.defaultValue ?? '',
      ])),
    };
  }
  if (definition.id === 'set_parameter') {
    return {
      lastCommand: definition.id,
      lastParameterName: parameters.name,
      lastParameterValue: parameters.value,
    };
  }

  return {
    lastCommand: definition.id,
    [definition.id]: controlValues[definition.id] ?? definition.defaultValue ?? '',
  };
};
