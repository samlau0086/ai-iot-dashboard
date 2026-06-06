import { Device, Alert } from '../types';

export const mockDevices: Device[] = [
  {
    id: 'DEV-001',
    name: 'Main Energy Meter',
    type: 'energy_meter',
    tags: ['factory-a'],
    metrics: {
      voltage: 220,
      current: 18.5,
      power: 4070,
      energy_today: 128.6
    },
    status: 'online',
    lastSeen: new Date().toISOString(),
    firmwareVersion: 'v1.2.0'
  },
  {
    id: 'DEV-002',
    name: 'CNC Machine 1 Power',
    type: 'energy_meter',
    tags: ['factory-a'],
    metrics: {
      voltage: 380,
      current: 45.2,
      power: 17176,
      energy_today: 450.2
    },
    status: 'warning',
    lastSeen: new Date(Date.now() - 5 * 60000).toISOString(),
    firmwareVersion: 'v1.1.8'
  },
  {
    id: 'DEV-003',
    name: 'Air Compressor 1',
    type: 'air_compressor',
    tags: ['factory-a'],
    metrics: {
      pressure: 7.8,
      temperature: 85,
      power: 22000,
      running_hours: 1450
    },
    status: 'online',
    lastSeen: new Date().toISOString(),
    firmwareVersion: 'v2.0.1'
  },
  {
    id: 'DEV-004',
    name: 'Cold Storage Ambient',
    type: 'temperature_sensor',
    tags: ['factory-a'],
    metrics: {
      temperature: -18.5,
      humidity: 45,
      battery: 85
    },
    status: 'online',
    lastSeen: new Date().toISOString(),
    firmwareVersion: 'v1.0.5'
  },
  {
    id: 'GW-001',
    name: 'Factory Main Gateway',
    type: 'gateway',
    tags: ['factory-a'],
    metrics: {
      cpu: 45,
      ram: 60,
      uptime: 720
    },
    status: 'online',
    lastSeen: new Date().toISOString(),
    firmwareVersion: 'v3.5.0'
  }
];

export const mockAlerts: Alert[] = [
  {
    id: 'ALT-1001',
    deviceId: 'DEV-002',
    deviceName: 'CNC Machine 1 Power',
    level: 'Warning',
    message: 'Abnormal power spike detected: Exceeded baseline by 25%.',
    timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
    status: 'active'
  },
  {
    id: 'ALT-1002',
    deviceId: 'DEV-003',
    deviceName: 'Air Compressor 1',
    level: 'Info',
    message: 'Routine maintenance recommended: 1450 hours reached.',
    timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
    status: 'active'
  },
  {
    id: 'ALT-1003',
    deviceId: 'DEV-004',
    deviceName: 'Cold Storage Ambient',
    level: 'Critical',
    message: 'Temperature exceeds -15Â°C threshold.',
    timestamp: new Date(Date.now() - 10 * 60000).toISOString(),
    status: 'acknowledged'
  }
];

export const mockEnergyTrends = [
  { time: '00:00', value: 450, baseline: 420 },
  { time: '04:00', value: 420, baseline: 410 },
  { time: '08:00', value: 1250, baseline: 1100 },
  { time: '12:00', value: 1800, baseline: 1750 },
  { time: '16:00', value: 1650, baseline: 1600 },
  { time: '20:00', value: 900, baseline: 850 },
];
