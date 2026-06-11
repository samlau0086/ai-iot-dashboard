import { create } from 'zustand';
import { Language } from './i18n';
import { Device } from '../types';
import { mockDevices } from './mockData';
import { mergeTelemetryIntoDevices } from './deviceData';
import type { DeviceTelemetryMessage } from '../types';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: string;
  siteId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: string;
  approvedAt?: string;
}

const DEFAULT_USERS: User[] = [
  {
    id: '1',
    name: 'Admin User',
    email: 'admin@factory.com',
    role: 'Admin',
    siteId: 'factory-a',
    password: 'password123',
    status: 'approved',
    approvedAt: new Date().toISOString(),
  },
  {
    id: 'demo-user',
    name: 'Demo User',
    email: 'demo@factory.com',
    role: 'Demo',
    siteId: 'factory-a',
    password: 'demo123',
    status: 'approved',
    approvedAt: new Date().toISOString(),
  },
];

export interface SiteTenant {
  id: string;
  name: string;
  tenantId: string;
  tenantName: string;
  type: 'factory' | 'solar' | 'cold_storage' | 'pump_station' | 'compressed_air' | 'other';
  tags: string[];
  location?: string;
  timezone?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt?: string;
}

export interface NotificationChannel {
  id: string;
  type: 'bark' | 'email' | 'webhook' | 'sms' | 'telegram' | 'slack';
  name: string;
  target: string;
  config?: Record<string, string>;
  enabled: boolean;
  lastTestStatus?: 'success' | 'failed';
  lastTestAt?: string;
  lastTestMessage?: string;
}

export interface AccessDefinition {
  id: string;
  name: string;
  enabled: boolean;
  method: 'qr' | 'nfc_basic' | 'nfc' | 'caller_id' | 'sms';
  aesKey?: string;
  credentialGroups?: string[];
  grantedMessage?: string;
  deniedMessage?: string;
  extraParams: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

export interface AccessCredential {
  id: string;
  accessId: string;
  type: 'qr' | 'nfc_basic' | 'nfc' | 'caller_id' | 'sms';
  name: string;
  enabled: boolean;
  tagId?: string;
  groups?: string[];
  lastCounter?: number;
  hasLink?: boolean;
  hasLatestQrLink?: boolean;
  rotateOnUse?: boolean;
  refreshIntervalSeconds: number;
  periodSeconds: number;
  maxUses: number;
  usedCount: number;
  createdAt: string;
  validFrom: string;
  validUntil: string;
  lastUsedAt?: string | null;
}

export interface ChartConfig {
  id: string;
  title: string;
  type: 'bar' | 'pie' | 'line';
  dataSource: 'energy' | 'devices' | 'alerts' | 'solar' | 'coldStorage' | 'waterPump' | 'airCompressor';
  deviceIds?: string[];
  metricKey?: string;
}

export type OverviewKpiKey =
  | 'totalDevices'
  | 'onlineDevices'
  | 'energyToday'
  | 'activeAlerts'
  | 'solarGeneration'
  | 'solarEfficiency'
  | 'batterySoc'
  | 'coldRoomTemp'
  | 'coldRoomHumidity'
  | 'doorOpenEvents'
  | 'pumpFlowRate'
  | 'waterPressure'
  | 'pumpRuntime'
  | 'compressorPressure'
  | 'compressorRuntime'
  | 'airLeakageRate';

export interface OverviewWidget {
  id: string;
  type: 'kpi' | 'kpis' | 'trend' | 'ai' | 'chart' | 'custom';
  title?: string;
  deviceIds?: string[];
  displayMode?: 'number' | 'line' | 'area' | 'bar' | 'gauge' | 'status' | 'donut';
  metricKey?: string;
  iconId?: string;
  kpiKey?: OverviewKpiKey;
  chartId?: string;
  unit?: string;
  precision?: number;
  thresholds?: {
    direction?: 'above' | 'below';
    warning?: number;
    critical?: number;
  };
  colorRules?: {
    normal?: string;
    warning?: string;
    critical?: string;
    noData?: string;
  };
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  layout: any[];
  widgets: OverviewWidget[];
}

export interface OverviewDashboardState {
  layout: any[];
  widgets: OverviewWidget[];
  widgetLibrary: OverviewWidget[];
  templateId?: string;
  updatedAt?: string;
}

export type ScadaElementType = 'device' | 'metric' | 'pipe' | 'power' | 'wireless' | 'signal' | 'image' | 'label';

export type ScadaShapePrimitiveType =
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'propeller'
  | 'valve'
  | 'arrow'
  | 'busbar'
  | 'terminal'
  | 'bracket'
  | 'tank'
  | 'svgIcon';

export interface ScadaShapePrimitive {
  id: string;
  name?: string;
  type: ScadaShapePrimitiveType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rx?: number;
  points?: Array<{ x: number; y: number }>;
  iconUrl?: string;
  iconSvg?: string;
  iconName?: string;
  strokeMode?: 'state' | 'muted' | 'accent' | 'custom' | 'none';
  fillMode?: 'state' | 'panel' | 'accent' | 'custom' | 'none';
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  opacity?: number;
  fillOpacity?: number;
  strokeOpacity?: number;
  dash?: string;
  rotation?: {
    angle?: number;
    centerX?: number;
    centerY?: number;
  };
  animation?: {
    type?: 'none' | 'rotate' | 'scale' | 'translate' | 'visibility' | 'pulse' | 'strokeFlow';
    trigger?: 'always' | 'deviceOnline' | 'metricNonZero' | 'metricGreaterThan' | 'metricEquals' | 'deviceStatus' | 'workflowTruthy' | 'workflowEquals';
    metricKey?: string;
    workflowId?: string;
    workflowPath?: string;
    operatorValue?: string | number;
    deviceStatus?: 'online' | 'offline' | 'warning' | 'normal' | 'critical';
    durationSeconds?: number;
    repeatCount?: number | 'indefinite';
    centerX?: number;
    centerY?: number;
    rotateFrom?: number;
    rotateTo?: number;
    scaleFrom?: number;
    scaleTo?: number;
    fromX?: number;
    fromY?: number;
    toX?: number;
    toY?: number;
    visibleSeconds?: number;
    hiddenSeconds?: number;
  };
}

export interface ScadaShapeEndpoint {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface ScadaShapePreset {
  id: string;
  name: string;
  primitives: ScadaShapePrimitive[];
  endpoints?: ScadaShapeEndpoint[];
  createdAt: string;
  updatedAt?: string;
}

export interface ScadaElement {
  id: string;
  type: ScadaElementType;
  label: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  shapePreset?: string;
  labelStyle?: {
    x?: number;
    y?: number;
    fontSize?: number;
  };
  iconStyle?: {
    x?: number;
    y?: number;
    size?: number;
  };
  valueStyle?: {
    x?: number;
    y?: number;
    fontSize?: number;
  };
  metaStyle?: {
    x?: number;
    y?: number;
    fontSize?: number;
  };
  points?: Array<{ x: number; y: number }>;
  connections?: {
    start?: { elementId: string; anchor: string };
    end?: { elementId: string; anchor: string };
  };
  lineWidth?: number;
  lineAnimation?: 'none' | 'flow' | 'pulse' | 'glow';
  lineAnimationSpeed?: number;
  arrowSize?: number;
  lineProtocol?: 'ethernet' | 'rs485' | 'rs232' | 'can' | 'modbus' | 'wifi' | 'lora' | 'custom';
  imageSrc?: string;
  imageFileName?: string;
  imageOpacity?: number;
  scadaIcon?: {
    mode: 'auto' | 'preset' | 'svg';
    iconId?: string;
    svg?: string;
    fileName?: string;
  };
  deviceId?: string;
  metricKey?: string;
  unit?: string;
  warning?: number;
  critical?: number;
}

export interface ScadaScene {
  id: string;
  siteId: string;
  name: string;
  elements: ScadaElement[];
  updatedAt?: string;
}

const createDefaultScadaShapePresets = (): ScadaShapePreset[] => [
  {
    id: 'custom-panel-header',
    name: 'Header Panel',
    createdAt: new Date().toISOString(),
    endpoints: [
      { id: 'left', label: 'Left', x: 0, y: 50 },
      { id: 'right', label: 'Right', x: 100, y: 50 },
      { id: 'top', label: 'Top', x: 50, y: 0 },
      { id: 'bottom', label: 'Bottom', x: 50, y: 100 },
    ],
    primitives: [
      { id: 'header-frame', type: 'rect', x: 0, y: 0, width: 100, height: 100, rx: 8, fillMode: 'state', strokeMode: 'state', strokeWidth: 2 },
      { id: 'header-line', type: 'line', x: 0, y: 28, width: 100, height: 0, fillMode: 'none', strokeMode: 'muted', strokeWidth: 1 },
      { id: 'header-pill', type: 'rect', x: 8, y: 10, width: 18, height: 8, rx: 4, fillMode: 'accent', strokeMode: 'none', opacity: 0.75 },
    ],
  },
  {
    id: 'custom-control-node',
    name: 'Control Node',
    createdAt: new Date().toISOString(),
    endpoints: [
      { id: 'inlet', label: 'Inlet', x: 0, y: 50 },
      { id: 'outlet', label: 'Outlet', x: 100, y: 50 },
      { id: 'signal', label: 'Signal', x: 50, y: 0 },
    ],
    primitives: [
      { id: 'node-body', type: 'polygon', x: 0, y: 0, points: [{ x: 8, y: 0 }, { x: 92, y: 0 }, { x: 100, y: 50 }, { x: 92, y: 100 }, { x: 8, y: 100 }, { x: 0, y: 50 }], fillMode: 'state', strokeMode: 'state', strokeWidth: 2 },
      { id: 'node-inner', type: 'rect', x: 10, y: 12, width: 80, height: 76, rx: 10, fillMode: 'panel', strokeMode: 'muted', strokeWidth: 1, opacity: 0.9 },
      { id: 'node-dot', type: 'ellipse', x: 82, y: 12, width: 8, height: 8, fillMode: 'accent', strokeMode: 'none' },
    ],
  },
];

const DEFAULT_TAG_TEMPLATE_MAP: Record<string, string> = {
  All: 'factory-energy',
  'factory-a': 'factory-energy',
  solar: 'solar-monitoring',
  'cold-storage': 'cold-storage',
  'water-pump': 'water-pump',
  'air-compressor': 'air-compressor',
};

const DEFAULT_SITES: SiteTenant[] = [
  {
    id: 'factory-a',
    name: 'Factory A',
    tenantId: 'default-tenant',
    tenantName: 'Default Tenant',
    type: 'factory',
    tags: ['factory-a'],
    location: 'Shenzhen',
    timezone: 'Asia/Shanghai',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'solar-site',
    name: 'Solar Site',
    tenantId: 'default-tenant',
    tenantName: 'Default Tenant',
    type: 'solar',
    tags: ['solar'],
    timezone: 'Asia/Shanghai',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'pump-station',
    name: 'Pump Station',
    tenantId: 'default-tenant',
    tenantName: 'Default Tenant',
    type: 'pump_station',
    tags: ['water-pump'],
    timezone: 'Asia/Shanghai',
    status: 'active',
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_OVERVIEW_LAYOUT = [
  { i: 'kpi-online-devices', x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: 'kpi-total-devices', x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: 'kpi-active-alerts', x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: 'kpi-energy-today', x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: 'trend', x: 0, y: 2, w: 4, h: 5, minW: 4, minH: 3 },
  { i: 'ai', x: 4, y: 2, w: 4, h: 5, minW: 3, minH: 3 }
];

const DEFAULT_OVERVIEW_WIDGETS: OverviewWidget[] = [
  { id: 'kpi-online-devices', type: 'kpi', kpiKey: 'onlineDevices' },
  { id: 'kpi-total-devices', type: 'kpi', kpiKey: 'totalDevices' },
  { id: 'kpi-active-alerts', type: 'kpi', kpiKey: 'activeAlerts' },
  { id: 'kpi-energy-today', type: 'kpi', kpiKey: 'energyToday' },
  { id: 'trend', type: 'trend' },
  { id: 'ai', type: 'ai' }
];

const cloneLayout = (layout: any[]) => layout.map((item) => ({ ...item }));
const cloneWidgets = (widgets: OverviewWidget[]) => widgets.map((widget) => ({
  ...widget,
  deviceIds: widget.deviceIds ? [...widget.deviceIds] : undefined,
  thresholds: widget.thresholds ? { ...widget.thresholds } : undefined,
  colorRules: widget.colorRules ? { ...widget.colorRules } : undefined,
}));
const DEFAULT_CHARTS: ChartConfig[] = [
  { id: '1', title: 'Weekly Consumption', type: 'bar', dataSource: 'energy' },
  { id: '2', title: 'Device Distribution', type: 'pie', dataSource: 'devices' },
  { id: 'solar-production', title: 'PV Production Curve', type: 'line', dataSource: 'solar' },
  { id: 'cold-temperature', title: 'Cold Room Temperature', type: 'line', dataSource: 'coldStorage' },
  { id: 'pump-pressure', title: 'Pump Pressure Trend', type: 'line', dataSource: 'waterPump' },
  { id: 'compressor-pressure', title: 'Compressor Pressure Trend', type: 'line', dataSource: 'airCompressor' }
];
const mergeDefaultCharts = (charts: ChartConfig[] = []) => {
  const existingIds = new Set(charts.map((chart) => chart.id));
  return [
    ...charts,
    ...DEFAULT_CHARTS.filter((chart) => !existingIds.has(chart.id)),
  ];
};

const mergeDefaultDevices = (devices: Device[] = []) => {
  const mockIds = new Set(mockDevices.map((device) => device.id));
  const existingIds = new Set(devices.map((device) => device.id));
  return [
    ...devices.map((device) => ({
      ...device,
      siteId: device.siteId || device.tags?.[0] || 'factory-a',
      tenantId: device.tenantId || 'default-tenant',
      metrics: mockIds.has(device.id) ? {} : device.metrics,
      status: mockIds.has(device.id) ? 'offline' as const : device.status,
      lastSeen: mockIds.has(device.id) ? '' : device.lastSeen,
    })),
    ...mockDevices
      .filter((device) => !existingIds.has(device.id))
      .map((device) => ({
        ...device,
        metrics: {},
        status: 'offline' as const,
        lastSeen: '',
      })),
  ];
};

const createDefaultScadaScene = (siteId = 'factory-a', siteName = 'Factory A'): ScadaScene => ({
  id: `scada-${siteId}`,
  siteId,
  name: `${siteName} Operations View`,
  elements: [
    { id: 'scada-label-main', type: 'label', label: siteName, x: 60, y: 44, width: 220, height: 40 },
    { id: 'scada-device-meter', type: 'device', label: 'Main Meter', x: 90, y: 160, width: 150, height: 86, deviceId: 'DEV-001', metricKey: 'power', unit: 'W', warning: 3500, critical: 5000 },
    { id: 'scada-device-compressor', type: 'device', label: 'Air Compressor', x: 390, y: 150, width: 170, height: 96, deviceId: 'DEV-003', metricKey: 'pressure', unit: 'bar', warning: 7.5, critical: 8.5 },
    { id: 'scada-device-cold', type: 'device', label: 'Cold Storage', x: 700, y: 150, width: 160, height: 96, deviceId: 'DEV-004', metricKey: 'temperature', unit: 'deg C', warning: -12, critical: -8 },
    { id: 'scada-metric-energy', type: 'metric', label: 'Energy Today', x: 92, y: 300, width: 170, height: 70, deviceId: 'DEV-001', metricKey: 'energy', unit: 'kWh', warning: 650, critical: 900 },
    { id: 'scada-pipe-air', type: 'pipe', label: 'Compressed Air', x: 0, y: 0, points: [{ x: 560, y: 198 }, { x: 700, y: 198 }], connections: { start: { elementId: 'scada-device-compressor', anchor: 'right' }, end: { elementId: 'scada-device-cold', anchor: 'left' } }, deviceId: 'DEV-003', metricKey: 'pressure', warning: 7.5, critical: 8.5 },
    { id: 'scada-power-feed', type: 'power', label: 'Power Feed', x: 0, y: 0, points: [{ x: 240, y: 202 }, { x: 390, y: 198 }], connections: { start: { elementId: 'scada-device-meter', anchor: 'right' }, end: { elementId: 'scada-device-compressor', anchor: 'left' } }, deviceId: 'DEV-001', metricKey: 'power', warning: 3500, critical: 5000 },
  ],
});

const mergeDefaultScadaScenes = (scenesBySite: Record<string, ScadaScene> = {}, sites: SiteTenant[] = DEFAULT_SITES) => {
  const nextScenes = { ...scenesBySite };
  sites.forEach((site) => {
    if (!nextScenes[site.id]) nextScenes[site.id] = createDefaultScadaScene(site.id, site.name);
  });
  return nextScenes;
};

const mergeDefaultSites = (sites: SiteTenant[] = []) => {
  const existingIds = new Set(sites.map((site) => site.id));
  return [
    ...sites,
    ...DEFAULT_SITES.filter((site) => !existingIds.has(site.id)),
  ];
};

const sameOverviewLayout = (first: any[] = [], second: any[] = []) => {
  if (first.length !== second.length) return false;

  const secondById = new Map(second.map((item) => [item.i, item]));

  return first.every((item) => {
    const other = secondById.get(item.i);
    if (!other) return false;

    return (
      item.x === other.x &&
      item.y === other.y &&
      item.w === other.w &&
      item.h === other.h &&
      item.minW === other.minW &&
      item.minH === other.minH
    );
  });
};

const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: 'factory-energy',
    name: 'Factory Energy Monitoring',
    description: 'Energy, alerts, device availability, trend, and AI analysis for factory operations.',
    layout: DEFAULT_OVERVIEW_LAYOUT,
    widgets: DEFAULT_OVERVIEW_WIDGETS,
  },
  {
    id: 'solar-monitoring',
    name: 'Solar Monitoring',
    description: 'Tracks PV generation, inverter availability, battery state, efficiency, and production trends.',
    layout: [
      { i: 'kpi-solar-generation', x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'kpi-solar-efficiency', x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'kpi-battery-soc', x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'kpi-online-devices', x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'trend', x: 0, y: 2, w: 6, h: 5, minW: 4, minH: 3 },
      { i: 'chart_solar_production', x: 6, y: 2, w: 6, h: 5, minW: 3, minH: 3 },
      { i: 'ai', x: 0, y: 7, w: 4, h: 4, minW: 3, minH: 3 },
      { i: 'chart_2', x: 4, y: 7, w: 4, h: 4, minW: 3, minH: 3 },
    ],
    widgets: [
      { id: 'kpi-solar-generation', type: 'kpi', kpiKey: 'solarGeneration' },
      { id: 'kpi-solar-efficiency', type: 'kpi', kpiKey: 'solarEfficiency' },
      { id: 'kpi-battery-soc', type: 'kpi', kpiKey: 'batterySoc' },
      { id: 'kpi-online-devices', type: 'kpi', kpiKey: 'onlineDevices' },
      { id: 'trend', type: 'trend' },
      { id: 'chart_solar_production', type: 'chart', chartId: 'solar-production' },
      { id: 'ai', type: 'ai' },
      { id: 'chart_2', type: 'chart', chartId: '2' },
    ],
  },
  {
    id: 'cold-storage',
    name: 'Cold Storage Monitoring',
    description: 'Tracks cold room temperature, humidity, door events, alerts, and anomaly analysis.',
    layout: [
      { i: 'kpi-cold-room-temp', x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'kpi-cold-room-humidity', x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'kpi-door-open-events', x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'kpi-active-alerts', x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'ai', x: 0, y: 2, w: 4, h: 5, minW: 3, minH: 3 },
      { i: 'trend', x: 4, y: 2, w: 4, h: 5, minW: 4, minH: 3 },
      { i: 'chart_cold_temperature', x: 8, y: 2, w: 4, h: 5, minW: 3, minH: 3 },
    ],
    widgets: [
      { id: 'kpi-cold-room-temp', type: 'kpi', kpiKey: 'coldRoomTemp' },
      { id: 'kpi-cold-room-humidity', type: 'kpi', kpiKey: 'coldRoomHumidity' },
      { id: 'kpi-door-open-events', type: 'kpi', kpiKey: 'doorOpenEvents' },
      { id: 'kpi-active-alerts', type: 'kpi', kpiKey: 'activeAlerts' },
      { id: 'ai', type: 'ai' },
      { id: 'trend', type: 'trend' },
      { id: 'chart_cold_temperature', type: 'chart', chartId: 'cold-temperature' },
    ],
  },
  {
    id: 'water-pump',
    name: 'Water Pump Monitoring',
    description: 'Tracks pump flow, water pressure, runtime, alerts, and system guidance.',
    layout: [
      { i: 'kpi-pump-flow-rate', x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'kpi-water-pressure', x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'kpi-pump-runtime', x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'kpi-active-alerts', x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'trend', x: 0, y: 2, w: 5, h: 5, minW: 4, minH: 3 },
      { i: 'chart_pump_pressure', x: 5, y: 2, w: 3, h: 5, minW: 3, minH: 3 },
      { i: 'ai', x: 8, y: 2, w: 4, h: 5, minW: 3, minH: 3 },
    ],
    widgets: [
      { id: 'kpi-pump-flow-rate', type: 'kpi', kpiKey: 'pumpFlowRate' },
      { id: 'kpi-water-pressure', type: 'kpi', kpiKey: 'waterPressure' },
      { id: 'kpi-pump-runtime', type: 'kpi', kpiKey: 'pumpRuntime' },
      { id: 'kpi-active-alerts', type: 'kpi', kpiKey: 'activeAlerts' },
      { id: 'trend', type: 'trend' },
      { id: 'chart_pump_pressure', type: 'chart', chartId: 'pump-pressure' },
      { id: 'ai', type: 'ai' },
    ],
  },
  {
    id: 'air-compressor',
    name: 'Air Compressor Monitoring',
    description: 'Tracks compressor pressure, runtime, air leakage, energy usage, and savings opportunities.',
    layout: [
      { i: 'kpi-compressor-pressure', x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'kpi-compressor-runtime', x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'kpi-air-leakage-rate', x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'kpi-energy-today', x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
      { i: 'trend', x: 0, y: 2, w: 6, h: 5, minW: 4, minH: 3 },
      { i: 'ai', x: 6, y: 2, w: 4, h: 5, minW: 3, minH: 3 },
      { i: 'chart_compressor_pressure', x: 0, y: 7, w: 4, h: 4, minW: 3, minH: 3 },
    ],
    widgets: [
      { id: 'kpi-compressor-pressure', type: 'kpi', kpiKey: 'compressorPressure' },
      { id: 'kpi-compressor-runtime', type: 'kpi', kpiKey: 'compressorRuntime' },
      { id: 'kpi-air-leakage-rate', type: 'kpi', kpiKey: 'airLeakageRate' },
      { id: 'kpi-energy-today', type: 'kpi', kpiKey: 'energyToday' },
      { id: 'trend', type: 'trend' },
      { id: 'ai', type: 'ai' },
      { id: 'chart_compressor_pressure', type: 'chart', chartId: 'compressor-pressure' },
    ],
  },
];

const getDefaultDashboardTemplateId = (siteId: string, sites: SiteTenant[] = DEFAULT_SITES, templateMap: Record<string, string> = DEFAULT_TAG_TEMPLATE_MAP) => {
  if (siteId === 'All') return templateMap.All || 'factory-energy';

  const site = sites.find((item) => item.id === siteId);
  const mappedByTag = site?.tags.map((tag) => templateMap[tag]).find(Boolean);
  if (mappedByTag) return mappedByTag;

  switch (site?.type) {
    case 'solar':
      return 'solar-monitoring';
    case 'cold_storage':
      return 'cold-storage';
    case 'pump_station':
      return 'water-pump';
    case 'compressed_air':
      return 'air-compressor';
    case 'factory':
    default:
      return 'factory-energy';
  }
};

const cloneDashboard = (dashboard: OverviewDashboardState): OverviewDashboardState => ({
  layout: cloneLayout(dashboard.layout),
  widgets: cloneWidgets(dashboard.widgets),
  widgetLibrary: cloneWidgets(dashboard.widgetLibrary || []),
  templateId: dashboard.templateId,
  updatedAt: dashboard.updatedAt,
});

const createDefaultOverviewDashboard = (
  siteId: string,
  sites: SiteTenant[] = DEFAULT_SITES,
  templateMap: Record<string, string> = DEFAULT_TAG_TEMPLATE_MAP,
): OverviewDashboardState => {
  const templateId = getDefaultDashboardTemplateId(siteId, sites, templateMap);
  const template = DASHBOARD_TEMPLATES.find((item) => item.id === templateId) || DASHBOARD_TEMPLATES[0];

  return {
    layout: cloneLayout(template.layout),
    widgets: cloneWidgets(template.widgets),
    widgetLibrary: [],
    templateId: template.id,
  };
};

const getOverviewDashboard = (state: Pick<AppState, 'overviewDashboardsBySite' | 'sites' | 'tagDashboardTemplateMap' | 'activeSiteId'>, siteId?: string) => {
  const dashboardSiteId = siteId || state.activeSiteId || 'factory-a';
  return state.overviewDashboardsBySite[dashboardSiteId] || createDefaultOverviewDashboard(dashboardSiteId, state.sites, state.tagDashboardTemplateMap);
};

const mergeDefaultOverviewDashboards = (
  dashboardsBySite: Record<string, OverviewDashboardState> = {},
  sites: SiteTenant[] = DEFAULT_SITES,
  legacyLayout?: any[],
  legacyWidgets?: OverviewWidget[],
  legacyWidgetLibrary?: OverviewWidget[],
  activeSiteId = 'factory-a',
  templateMap: Record<string, string> = DEFAULT_TAG_TEMPLATE_MAP,
) => {
  const nextDashboards = Object.fromEntries(
    Object.entries(dashboardsBySite).map(([siteId, dashboard]) => [siteId, cloneDashboard({
      layout: dashboard.layout || [],
      widgets: dashboard.widgets || [],
      widgetLibrary: dashboard.widgetLibrary || [],
      templateId: dashboard.templateId,
      updatedAt: dashboard.updatedAt,
    })])
  ) as Record<string, OverviewDashboardState>;

  if (Object.keys(nextDashboards).length === 0 && legacyLayout?.length && legacyWidgets?.length) {
    nextDashboards[activeSiteId] = {
      layout: cloneLayout(legacyLayout),
      widgets: cloneWidgets(legacyWidgets),
      widgetLibrary: cloneWidgets(legacyWidgetLibrary || []),
      templateId: getDefaultDashboardTemplateId(activeSiteId, sites, templateMap),
    };
  }

  ['All', ...sites.map((site) => site.id)].forEach((siteId) => {
    if (!nextDashboards[siteId]) {
      nextDashboards[siteId] = createDefaultOverviewDashboard(siteId, sites, templateMap);
    }
  });

  return nextDashboards;
};

const patchOverviewDashboard = (
  state: Pick<AppState, 'overviewDashboardsBySite' | 'sites' | 'tagDashboardTemplateMap' | 'activeSiteId'>,
  siteId: string | undefined,
  patch: Partial<OverviewDashboardState>,
) => {
  const dashboardSiteId = siteId || state.activeSiteId || 'factory-a';
  const currentDashboard = getOverviewDashboard(state, dashboardSiteId);
  const nextDashboard: OverviewDashboardState = {
    ...currentDashboard,
    ...patch,
    layout: patch.layout ? cloneLayout(patch.layout) : cloneLayout(currentDashboard.layout),
    widgets: patch.widgets ? cloneWidgets(patch.widgets) : cloneWidgets(currentDashboard.widgets),
    widgetLibrary: patch.widgetLibrary ? cloneWidgets(patch.widgetLibrary) : cloneWidgets(currentDashboard.widgetLibrary),
    updatedAt: new Date().toISOString(),
  };

  return {
    overviewDashboardsBySite: {
      ...state.overviewDashboardsBySite,
      [dashboardSiteId]: nextDashboard,
    },
    ...(dashboardSiteId === state.activeSiteId ? {
      overviewLayout: cloneLayout(nextDashboard.layout),
      overviewWidgets: cloneWidgets(nextDashboard.widgets),
      overviewWidgetLibrary: cloneWidgets(nextDashboard.widgetLibrary),
    } : {}),
  };
};

export interface WorkflowNode {
  id: string;
  name?: string;
  type: 'trigger' | 'condition' | 'action';
  config: any;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type: 'next' | 'branch' | 'true' | 'false' | 'continue';
  label?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  nodes: WorkflowNode[];
  edges?: WorkflowEdge[];
}

interface AppState {
  backendHydrated: boolean;
  hydrateBackendState: () => Promise<void>;
  language: Language;
  theme: 'light' | 'dark';
  setLanguage: (lang: Language) => void;
  toggleTheme: () => void;
  // Notification Config
  barkUrl: string;
  setBarkUrl: (url: string) => void;
  emailAlerts: string;
  setEmailAlerts: (email: string) => void;
  webhookUrl: string;
  setWebhookUrl: (url: string) => void;
  notificationChannels: NotificationChannel[];
  addNotificationChannel: (channel: NotificationChannel) => void;
  updateNotificationChannel: (id: string, channel: Partial<NotificationChannel>) => void;
  deleteNotificationChannel: (id: string) => void;
  testNotificationChannel: (id: string) => Promise<void>;
  // Devices
  devices: Device[];
  deviceDataSourceStatus: 'mock' | 'api' | 'mqtt' | 'error';
  addDevice: (device: Device) => void;
  setDevices: (devices: Device[], source?: 'api' | 'mqtt' | 'mock') => void;
  applyTelemetryMessage: (message: DeviceTelemetryMessage, source?: 'mqtt' | 'api') => void;
  setDeviceDataSourceStatus: (status: 'mock' | 'api' | 'mqtt' | 'error') => void;
  updateDevice: (id: string, device: Partial<Device>) => void;
  deleteDevice: (id: string) => void;
  // Sites / Tenants
  sites: SiteTenant[];
  activeSiteId: string;
  setActiveSite: (siteId: string) => void;
  addSite: (site: SiteTenant) => void;
  updateSite: (id: string, site: Partial<SiteTenant>) => void;
  deleteSite: (id: string) => void;
  // Access Control
  accesses: AccessDefinition[];
  accessCredentials: AccessCredential[];
  setAccesses: (accesses: AccessDefinition[]) => void;
  setAccessCredentials: (credentials: AccessCredential[]) => void;
  addAccess: (access: AccessDefinition) => void;
  updateAccess: (id: string, access: Partial<AccessDefinition>) => void;
  deleteAccess: (id: string) => void;
  // Users
  users: User[];
  addUser: (user: User) => void;
  registerUser: (user: Omit<User, 'id' | 'role' | 'siteId' | 'status' | 'createdAt'> & { siteId?: string }) => { ok: boolean; message: string };
  updateUser: (id: string, user: Partial<User>) => void;
  deleteUser: (id: string) => void;
  approveUser: (id: string, role: string, siteId: string) => void;
  rejectUser: (id: string) => void;
  login: (email: string, password: string) => { ok: boolean; message: string };
  logout: () => void;
  // Profile
  currentUser: User | null;
  updateCurrentUser: (user: Partial<User>) => void;
  // Charts
  charts: ChartConfig[];
  addChart: (chart: ChartConfig) => void;
  removeChart: (id: string) => void;
  // Overview Dashboard
  overviewLayout: any[];
  overviewWidgets: OverviewWidget[];
  overviewWidgetLibrary: OverviewWidget[];
  overviewDashboardsBySite: Record<string, OverviewDashboardState>;
  dashboardTemplates: DashboardTemplate[];
  activeDashboardTemplateId: string;
  tagDashboardTemplateMap: Record<string, string>;
  updateOverviewLayout: (layout: any[], siteId?: string) => void;
  updateOverviewWidgets: (widgets: OverviewWidget[], siteId?: string) => void;
  addOverviewWidgetLibraryItem: (widget: OverviewWidget, siteId?: string) => void;
  updateOverviewWidgetLibraryItem: (id: string, widget: Partial<OverviewWidget>, siteId?: string) => void;
  removeOverviewWidgetLibraryItem: (id: string, siteId?: string) => void;
  applyDashboardTemplate: (id: string, siteId?: string) => void;
  setTagDashboardTemplate: (tag: string, templateId: string) => void;
  addDashboardTemplate: (template: DashboardTemplate) => void;
  updateDashboardTemplate: (template: DashboardTemplate) => void;
  deleteDashboardTemplate: (id: string) => void;
  addOverviewWidget: (widget: OverviewWidget, layoutItem: any, siteId?: string) => void;
  updateOverviewWidget: (id: string, widget: Partial<OverviewWidget>, siteId?: string) => void;
  removeOverviewWidget: (id: string, siteId?: string) => void;
  // SCADA Operations View
  scadaScenesBySite: Record<string, ScadaScene>;
  scadaShapePresets: ScadaShapePreset[];
  updateScadaScene: (siteId: string, scene: ScadaScene) => void;
  addScadaShapePreset: (preset: ScadaShapePreset) => void;
  updateScadaShapePreset: (id: string, preset: Partial<ScadaShapePreset>) => void;
  deleteScadaShapePreset: (id: string) => void;
  // Workflows
  workflows: Workflow[];
  addWorkflow: (workflow: Workflow) => void;
  updateWorkflow: (id: string, workflow: Partial<Workflow>) => void;
  deleteWorkflow: (id: string) => void;
}

type BackendState = Partial<Pick<AppState,
  | 'language'
  | 'theme'
  | 'barkUrl'
  | 'emailAlerts'
  | 'webhookUrl'
  | 'notificationChannels'
  | 'devices'
  | 'deviceDataSourceStatus'
  | 'sites'
  | 'activeSiteId'
  | 'users'
  | 'accesses'
  | 'accessCredentials'
  | 'charts'
  | 'overviewLayout'
  | 'overviewWidgets'
  | 'overviewWidgetLibrary'
  | 'overviewDashboardsBySite'
  | 'dashboardTemplates'
  | 'activeDashboardTemplateId'
  | 'tagDashboardTemplateMap'
  | 'scadaScenesBySite'
  | 'scadaShapePresets'
  | 'workflows'
>>;

const SESSION_USER_ID_KEY = 'ai-iot-dashboard-session-user-id';

const getStoredSessionUserId = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SESSION_USER_ID_KEY);
  } catch (error) {
    return null;
  }
};

const setStoredSessionUserId = (userId: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_USER_ID_KEY, userId);
  } catch (error) {
    console.warn('Failed to persist login session', error);
  }
};

const clearStoredSessionUserId = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_USER_ID_KEY);
  } catch (error) {
    console.warn('Failed to clear login session', error);
  }
};

const mergeDefaultUsers = (users: User[] = []) => {
  const existingEmails = new Set(users.map((user) => user.email.toLowerCase()));
  return [
    ...users,
    ...DEFAULT_USERS.filter((user) => !existingEmails.has(user.email.toLowerCase())),
  ];
};

const pickBackendState = (state: AppState): BackendState => ({
  language: state.language,
  theme: state.theme,
  barkUrl: state.barkUrl,
  emailAlerts: state.emailAlerts,
  webhookUrl: state.webhookUrl,
  notificationChannels: state.notificationChannels,
  devices: state.devices,
  deviceDataSourceStatus: state.deviceDataSourceStatus,
  sites: state.sites,
  activeSiteId: state.activeSiteId,
  users: state.users,
  accesses: state.accesses,
  accessCredentials: state.accessCredentials,
  charts: state.charts,
  overviewLayout: state.overviewLayout,
  overviewWidgets: state.overviewWidgets,
  overviewWidgetLibrary: state.overviewWidgetLibrary,
  overviewDashboardsBySite: state.overviewDashboardsBySite,
  dashboardTemplates: state.dashboardTemplates,
  activeDashboardTemplateId: state.activeDashboardTemplateId,
  tagDashboardTemplateMap: state.tagDashboardTemplateMap,
  scadaScenesBySite: state.scadaScenesBySite,
  scadaShapePresets: state.scadaShapePresets,
  workflows: state.workflows,
});

const isNotificationChannelConfigured = (channel: NotificationChannel) => {
  const config = channel.config || {};
  switch (channel.type) {
    case 'email':
      return Boolean(config.recipients || channel.target);
    case 'webhook':
      return Boolean(config.url || channel.target);
    case 'bark':
      return Boolean(config.deviceKey || channel.target);
    case 'sms':
      return Boolean(config.phoneNumber || channel.target);
    case 'telegram':
      return Boolean((config.botToken && config.chatId) || channel.target);
    case 'slack':
      return Boolean(config.webhookUrl || channel.target);
    default:
      return Boolean(channel.target.trim());
  }
};

export const useAppStore = create<AppState>()(
    (set) => ({
      backendHydrated: false,
      hydrateBackendState: async () => {
        try {
          const response = await fetch('/api/state');
          if (!response.ok) throw new Error(`State load failed: ${response.status}`);
          const payload = await response.json();
          const state = payload.state as BackendState | null;
          const users = mergeDefaultUsers(state?.users || useAppStore.getState().users);
          const sites = mergeDefaultSites(state?.sites);
          const activeSiteId = state?.activeSiteId || 'factory-a';
          const overviewDashboardsBySite = mergeDefaultOverviewDashboards(
            state?.overviewDashboardsBySite,
            sites,
            state?.overviewLayout,
            state?.overviewWidgets,
            state?.overviewWidgetLibrary,
            activeSiteId,
            state?.tagDashboardTemplateMap || DEFAULT_TAG_TEMPLATE_MAP,
          );
          const activeDashboard = overviewDashboardsBySite[activeSiteId] || createDefaultOverviewDashboard(activeSiteId, sites, state?.tagDashboardTemplateMap || DEFAULT_TAG_TEMPLATE_MAP);
          const scadaScenesBySite = mergeDefaultScadaScenes(state?.scadaScenesBySite, sites);
          const scadaShapePresets = Array.isArray(state?.scadaShapePresets) ? state.scadaShapePresets : createDefaultScadaShapePresets();
          const sessionUserId = getStoredSessionUserId();
          const sessionUser = sessionUserId
            ? users.find((user) => user.id === sessionUserId && user.status === 'approved') || null
            : null;

          if (sessionUserId && !sessionUser) {
            clearStoredSessionUserId();
          }

          set({
            ...(state || {}),
            devices: mergeDefaultDevices(state?.devices),
            sites,
            activeSiteId,
            charts: mergeDefaultCharts(state?.charts),
            accesses: Array.isArray(state?.accesses) ? state.accesses : [],
            accessCredentials: Array.isArray(state?.accessCredentials) ? state.accessCredentials : [],
            overviewDashboardsBySite,
            scadaScenesBySite,
            scadaShapePresets,
            overviewLayout: cloneLayout(activeDashboard.layout),
            overviewWidgets: cloneWidgets(activeDashboard.widgets),
            overviewWidgetLibrary: cloneWidgets(activeDashboard.widgetLibrary),
            users,
            currentUser: sessionUser,
            backendHydrated: true,
          } as Partial<AppState>);
        } catch (error) {
          console.error(error);
          const sessionUserId = getStoredSessionUserId();
          const sessionUser = sessionUserId
            ? useAppStore.getState().users.find((user) => user.id === sessionUserId && user.status === 'approved') || null
            : null;
          if (sessionUserId && !sessionUser) {
            clearStoredSessionUserId();
          }
          set({ currentUser: sessionUser, backendHydrated: true });
        }
      },
      language: 'en',
      theme: 'dark',
      setLanguage: (lang) => set({ language: lang }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      
      barkUrl: '',
      setBarkUrl: (url) => set({ barkUrl: url }),
      emailAlerts: '',
      setEmailAlerts: (email) => set({ emailAlerts: email }),
      webhookUrl: '',
      setWebhookUrl: (url) => set({ webhookUrl: url }),
      notificationChannels: [],
      addNotificationChannel: (channel) => set((state) => ({
        notificationChannels: [...state.notificationChannels, channel]
      })),
      updateNotificationChannel: (id, channel) => set((state) => ({
        notificationChannels: state.notificationChannels.map((item) => (
          item.id === id ? { ...item, ...channel } : item
        ))
      })),
      deleteNotificationChannel: (id) => set((state) => ({
        notificationChannels: state.notificationChannels.filter((item) => item.id !== id)
      })),
      testNotificationChannel: async (id) => {
        const channel = useAppStore.getState().notificationChannels.find((item) => item.id === id);
        if (!channel) return;

        if (!channel.enabled || !isNotificationChannelConfigured(channel)) {
          set((state) => ({
            notificationChannels: state.notificationChannels.map((item) => (
              item.id === id
                ? {
                  ...item,
                  lastTestStatus: 'failed',
                  lastTestAt: new Date().toISOString(),
                  lastTestMessage: !item.enabled ? 'Channel is disabled.' : 'Configuration required.',
                }
                : item
            )),
          }));
          return;
        }

        try {
          const response = await fetch('/api/notification-channels/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel }),
          });
          const text = await response.text();
          let payload: { ok?: boolean; message?: string } = {};
          try {
            payload = text ? JSON.parse(text) : {};
          } catch {
            payload = { ok: false, message: text || `Test failed: ${response.status}` };
          }
          set((state) => ({
            notificationChannels: state.notificationChannels.map((item) => (
              item.id === id
                ? {
                  ...item,
                  lastTestStatus: response.ok && payload.ok ? 'success' : 'failed',
                  lastTestAt: new Date().toISOString(),
                  lastTestMessage: payload.message || (response.ok ? 'Test sent.' : 'Test failed.'),
                }
                : item
            )),
          }));
        } catch (error) {
          set((state) => ({
            notificationChannels: state.notificationChannels.map((item) => (
              item.id === id
                ? {
                  ...item,
                  lastTestStatus: 'failed',
                  lastTestAt: new Date().toISOString(),
                  lastTestMessage: error instanceof Error ? error.message : 'Test failed.',
                }
                : item
            )),
          }));
        }
      },

      devices: mergeDefaultDevices([]),
      deviceDataSourceStatus: 'api',
      addDevice: (device) => set((state) => ({ devices: [...state.devices, {
        ...device,
        siteId: device.siteId || state.activeSiteId || 'factory-a',
        tenantId: device.tenantId || state.sites.find((site) => site.id === (device.siteId || state.activeSiteId))?.tenantId || 'default-tenant',
      }] })),
      setDevices: (devices, source = 'api') => set({ devices, deviceDataSourceStatus: source }),
      applyTelemetryMessage: (message, source = 'mqtt') => set((state) => ({
        devices: mergeTelemetryIntoDevices(state.devices, message),
        deviceDataSourceStatus: source,
      })),
      setDeviceDataSourceStatus: (status) => set({ deviceDataSourceStatus: status }),
      updateDevice: (id, device) => set((state) => ({
        devices: state.devices.map(d => d.id === id ? { ...d, ...device } : d)
      })),
      deleteDevice: (id) => set((state) => ({
        devices: state.devices.filter(d => d.id !== id)
      })),

      sites: DEFAULT_SITES,
      activeSiteId: 'factory-a',
      setActiveSite: (siteId) => set((state) => {
        const dashboard = getOverviewDashboard(state, siteId);
        return {
          activeSiteId: siteId,
          overviewDashboardsBySite: {
            ...state.overviewDashboardsBySite,
            [siteId]: dashboard,
          },
          overviewLayout: cloneLayout(dashboard.layout),
          overviewWidgets: cloneWidgets(dashboard.widgets),
          overviewWidgetLibrary: cloneWidgets(dashboard.widgetLibrary),
        };
      }),
      addSite: (site) => set((state) => ({
        sites: [...state.sites, site],
        overviewDashboardsBySite: {
          ...state.overviewDashboardsBySite,
          [site.id]: createDefaultOverviewDashboard(site.id, [...state.sites, site], state.tagDashboardTemplateMap),
        },
        scadaScenesBySite: {
          ...state.scadaScenesBySite,
          [site.id]: createDefaultScadaScene(site.id, site.name),
        },
        tagDashboardTemplateMap: {
          ...state.tagDashboardTemplateMap,
          ...site.tags.reduce<Record<string, string>>((acc, tag) => {
            acc[tag] = state.tagDashboardTemplateMap[tag] || DEFAULT_TAG_TEMPLATE_MAP[tag] || 'factory-energy';
            return acc;
          }, {}),
        },
      })),
      updateSite: (id, site) => set((state) => {
        const nextSiteId = site.id || id;
        const renamedDashboard = nextSiteId !== id ? state.overviewDashboardsBySite[id] : undefined;
        const overviewDashboardsBySite = { ...state.overviewDashboardsBySite };
        const scadaScenesBySite = { ...state.scadaScenesBySite };

        if (renamedDashboard) {
          delete overviewDashboardsBySite[id];
          overviewDashboardsBySite[nextSiteId] = renamedDashboard;
        }
        if (site.id && site.id !== id && scadaScenesBySite[id]) {
          scadaScenesBySite[site.id] = { ...scadaScenesBySite[id], siteId: site.id, name: site.name || scadaScenesBySite[id].name };
          delete scadaScenesBySite[id];
        } else if (scadaScenesBySite[id] && site.name) {
          scadaScenesBySite[id] = { ...scadaScenesBySite[id], name: `${site.name} Operations View` };
        }

        return {
          sites: state.sites.map((item) => (
            item.id === id ? { ...item, ...site, updatedAt: new Date().toISOString() } : item
          )),
          overviewDashboardsBySite,
          scadaScenesBySite,
          users: site.id && site.id !== id
            ? state.users.map((user) => user.siteId === id ? { ...user, siteId: site.id as string } : user)
            : state.users,
          devices: site.id && site.id !== id
            ? state.devices.map((device) => device.siteId === id ? { ...device, siteId: site.id as string } : device)
            : state.devices,
          activeSiteId: state.activeSiteId === id ? nextSiteId : state.activeSiteId,
        };
      }),
      deleteSite: (id) => set((state) => {
        const remainingSites = state.sites.filter((site) => site.id !== id);
        const fallbackSiteId = remainingSites[0]?.id || 'factory-a';
        const overviewDashboardsBySite = { ...state.overviewDashboardsBySite };
        const scadaScenesBySite = { ...state.scadaScenesBySite };
        delete overviewDashboardsBySite[id];
        delete scadaScenesBySite[id];
        const fallbackDashboard = overviewDashboardsBySite[fallbackSiteId] || createDefaultOverviewDashboard(fallbackSiteId, remainingSites.length ? remainingSites : DEFAULT_SITES, state.tagDashboardTemplateMap);
        overviewDashboardsBySite[fallbackSiteId] = fallbackDashboard;
        return {
          sites: remainingSites.length ? remainingSites : DEFAULT_SITES,
          activeSiteId: state.activeSiteId === id ? fallbackSiteId : state.activeSiteId,
          overviewDashboardsBySite,
          scadaScenesBySite,
          ...(state.activeSiteId === id ? {
            overviewLayout: cloneLayout(fallbackDashboard.layout),
            overviewWidgets: cloneWidgets(fallbackDashboard.widgets),
            overviewWidgetLibrary: cloneWidgets(fallbackDashboard.widgetLibrary),
          } : {}),
          users: state.users.map((user) => user.siteId === id ? { ...user, siteId: fallbackSiteId } : user),
          devices: state.devices.map((device) => device.siteId === id ? { ...device, siteId: fallbackSiteId } : device),
        };
      }),

      accesses: [],
      accessCredentials: [],
      setAccesses: (accesses) => set({ accesses }),
      setAccessCredentials: (accessCredentials) => set({ accessCredentials }),
      addAccess: (access) => set((state) => ({ accesses: [access, ...state.accesses] })),
      updateAccess: (id, access) => set((state) => ({
        accesses: state.accesses.map((item) => (
          item.id === id ? { ...item, ...access, updatedAt: new Date().toISOString() } : item
        )),
      })),
      deleteAccess: (id) => set((state) => ({
        accesses: state.accesses.filter((item) => item.id !== id),
        accessCredentials: state.accessCredentials.filter((item) => item.accessId !== id),
      })),

      users: DEFAULT_USERS,
      addUser: (user) => set((state) => ({ users: [...state.users, user] })),
      registerUser: (user) => {
        const email = user.email.trim().toLowerCase();
        const exists = useAppStore.getState().users.some((item) => item.email.toLowerCase() === email);
        if (exists) return { ok: false, message: 'This email is already registered.' };

        const pendingUser: User = {
          id: `user-${Date.now()}`,
          name: user.name.trim(),
          email,
          password: user.password,
          role: 'Viewer',
          siteId: user.siteId?.trim() || 'factory-a',
          status: 'pending',
          createdAt: new Date().toISOString(),
        };

        set((state) => ({ users: [...state.users, pendingUser] }));
        return { ok: true, message: 'Registration submitted. Please wait for administrator approval.' };
      },
      updateUser: (id, user) => set((state) => ({
        users: state.users.map(u => u.id === id ? { ...u, ...user } : u),
        currentUser: state.currentUser && state.currentUser.id === id ? { ...state.currentUser, ...user } : state.currentUser
      })),
      deleteUser: (id) => {
        if (useAppStore.getState().currentUser?.id === id) clearStoredSessionUserId();
        set((state) => ({
          users: state.users.filter(u => u.id !== id),
          currentUser: state.currentUser && state.currentUser.id === id ? null : state.currentUser
        }));
      },
      approveUser: (id, role, siteId) => set((state) => ({
        users: state.users.map((user) => (
          user.id === id
            ? { ...user, role, siteId, status: 'approved', approvedAt: new Date().toISOString() }
            : user
        ))
      })),
      rejectUser: (id) => {
        if (useAppStore.getState().currentUser?.id === id) clearStoredSessionUserId();
        set((state) => ({
          users: state.users.map((user) => (
            user.id === id ? { ...user, status: 'rejected' } : user
          )),
          currentUser: state.currentUser && state.currentUser.id === id ? null : state.currentUser
        }));
      },
      login: (email, password) => {
        const user = useAppStore.getState().users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
        if (!user || user.password !== password) return { ok: false, message: 'Invalid email or password.' };
        if (user.status !== 'approved') return { ok: false, message: 'Your account is waiting for approval.' };

        setStoredSessionUserId(user.id);
        set({ currentUser: user });
        return { ok: true, message: 'Signed in.' };
      },
      logout: () => {
        clearStoredSessionUserId();
        set({ currentUser: null });
      },

      currentUser: null,
      updateCurrentUser: (user) => set((state) => ({
        currentUser: state.currentUser ? { ...state.currentUser, ...user } : state.currentUser,
        users: state.currentUser ? state.users.map(u => u.id === state.currentUser?.id ? { ...u, ...user } : u) : state.users
      })),

      charts: DEFAULT_CHARTS,
      addChart: (chart) => set((state) => ({ charts: [...state.charts, chart] })),
      removeChart: (id) => set((state) => ({ charts: state.charts.filter(c => c.id !== id) })),

      overviewLayout: cloneLayout(DEFAULT_OVERVIEW_LAYOUT),
      overviewWidgets: cloneWidgets(DEFAULT_OVERVIEW_WIDGETS),
      overviewWidgetLibrary: [],
      overviewDashboardsBySite: mergeDefaultOverviewDashboards({}, DEFAULT_SITES),
      scadaScenesBySite: mergeDefaultScadaScenes({}, DEFAULT_SITES),
      scadaShapePresets: createDefaultScadaShapePresets(),
      dashboardTemplates: DASHBOARD_TEMPLATES.map((template) => ({
        ...template,
        layout: cloneLayout(template.layout),
        widgets: cloneWidgets(template.widgets),
      })),
      activeDashboardTemplateId: 'factory-energy',
      tagDashboardTemplateMap: DEFAULT_TAG_TEMPLATE_MAP,
      updateOverviewLayout: (layout, siteId) => set((state) => (
        sameOverviewLayout(getOverviewDashboard(state, siteId).layout, layout) ? state : patchOverviewDashboard(state, siteId, { layout })
      )),
      updateOverviewWidgets: (widgets, siteId) => set((state) => patchOverviewDashboard(state, siteId, { widgets })),
      addOverviewWidgetLibraryItem: (widget, siteId) => set((state) => {
        const dashboard = getOverviewDashboard(state, siteId);
        return patchOverviewDashboard(state, siteId, { widgetLibrary: [...dashboard.widgetLibrary, widget] });
      }),
      updateOverviewWidgetLibraryItem: (id, widget, siteId) => set((state) => {
        const dashboard = getOverviewDashboard(state, siteId);
        return patchOverviewDashboard(state, siteId, {
          widgetLibrary: dashboard.widgetLibrary.map((item) => (
            item.id === id ? { ...item, ...widget } : item
          )),
        });
      }),
      removeOverviewWidgetLibraryItem: (id, siteId) => set((state) => {
        const dashboard = getOverviewDashboard(state, siteId);
        return patchOverviewDashboard(state, siteId, { widgetLibrary: dashboard.widgetLibrary.filter((item) => item.id !== id) });
      }),
      applyDashboardTemplate: (id, siteId) => set((state) => {
        const template = state.dashboardTemplates.find((item) => item.id === id);
        if (!template) return {};

        return {
          activeDashboardTemplateId: id,
          ...patchOverviewDashboard(state, siteId, {
            templateId: id,
            layout: cloneLayout(template.layout),
            widgets: cloneWidgets(template.widgets),
          }),
        };
      }),
      setTagDashboardTemplate: (tag, templateId) => set((state) => ({
        tagDashboardTemplateMap: {
          ...state.tagDashboardTemplateMap,
          [tag]: templateId,
        },
      })),
      addDashboardTemplate: (template) => set((state) => ({
        dashboardTemplates: [
          ...state.dashboardTemplates,
          {
            ...template,
            layout: cloneLayout(template.layout),
            widgets: cloneWidgets(template.widgets),
          },
        ],
        activeDashboardTemplateId: template.id,
        overviewLayout: cloneLayout(template.layout),
        overviewWidgets: cloneWidgets(template.widgets),
      })),
      updateDashboardTemplate: (template) => set((state) => ({
        dashboardTemplates: state.dashboardTemplates.map((item) => (
          item.id === template.id
            ? { ...template, layout: cloneLayout(template.layout), widgets: cloneWidgets(template.widgets) }
            : item
        )),
        activeDashboardTemplateId: template.id,
        overviewLayout: cloneLayout(template.layout),
        overviewWidgets: cloneWidgets(template.widgets),
      })),
      deleteDashboardTemplate: (id) => set((state) => {
        const remainingTemplates = state.dashboardTemplates.filter((template) => template.id !== id);
        const fallbackTemplate = remainingTemplates[0];

        if (!fallbackTemplate) {
          const fallback = DASHBOARD_TEMPLATES[0];
          return {
            dashboardTemplates: [{ ...fallback, layout: cloneLayout(fallback.layout), widgets: cloneWidgets(fallback.widgets) }],
            activeDashboardTemplateId: fallback.id,
            overviewLayout: cloneLayout(fallback.layout),
            overviewWidgets: cloneWidgets(fallback.widgets),
          };
        }

        return {
          dashboardTemplates: remainingTemplates,
          activeDashboardTemplateId: fallbackTemplate.id,
          overviewLayout: cloneLayout(fallbackTemplate.layout),
          overviewWidgets: cloneWidgets(fallbackTemplate.widgets),
        };
      }),
      addOverviewWidget: (widget, layoutItem, siteId) => set((state) => ({
        ...patchOverviewDashboard(state, siteId, {
          widgets: [...getOverviewDashboard(state, siteId).widgets, widget],
          layout: [...getOverviewDashboard(state, siteId).layout, layoutItem],
        }),
      })),
      updateOverviewWidget: (id, widget, siteId) => set((state) => {
        const dashboard = getOverviewDashboard(state, siteId);
        return patchOverviewDashboard(state, siteId, {
          widgets: dashboard.widgets.map((item) => (
            item.id === id ? { ...item, ...widget } : item
          )),
        });
      }),
      removeOverviewWidget: (id, siteId) => set((state) => {
        const dashboard = getOverviewDashboard(state, siteId);
        return patchOverviewDashboard(state, siteId, {
          widgets: dashboard.widgets.filter(w => w.id !== id),
          layout: dashboard.layout.filter(l => l.i !== id),
        });
      }),
      updateScadaScene: (siteId, scene) => set((state) => ({
        scadaScenesBySite: {
          ...state.scadaScenesBySite,
          [siteId]: {
            ...scene,
            siteId,
            updatedAt: new Date().toISOString(),
          },
        },
      })),
      addScadaShapePreset: (preset) => set((state) => ({
        scadaShapePresets: [...state.scadaShapePresets, preset],
      })),
      updateScadaShapePreset: (id, preset) => set((state) => ({
        scadaShapePresets: state.scadaShapePresets.map((item) => (
          item.id === id ? { ...item, ...preset, updatedAt: new Date().toISOString() } : item
        )),
      })),
      deleteScadaShapePreset: (id) => set((state) => ({
        scadaShapePresets: state.scadaShapePresets.filter((item) => item.id !== id),
        scadaScenesBySite: Object.fromEntries(
          Object.entries(state.scadaScenesBySite).map(([siteId, scene]) => [
            siteId,
            {
              ...scene,
              elements: scene.elements.map((element) => (
                element.shapePreset === id ? { ...element, shapePreset: element.type === 'device' ? 'auto' : 'rounded' } : element
              )),
            },
          ])
        ),
      })),
      
      workflows: [
        {
          id: 'wf-1',
          name: 'Critical Temperature Alert',
          description: 'Notify manager via WhatsApp if temperature is too high.',
          enabled: true,
          nodes: [
            { id: 't1', type: 'trigger', config: { type: 'threshold', metric: 'temperature', condition: '>', value: 8, duration: '10m' } },
            { id: 'a1', type: 'action', config: { type: 'whatsapp', target: '+1234567890', message: 'CRITICAL: Temperature exceeded 8°C for 10 minutes.' } },
            { id: 'a2', type: 'action', config: { type: 'start_backup', target: 'backup_cooling_unit_1' } },
            { id: 'a3', type: 'action', config: { type: 'ticket', priority: 'high', assignee: 'maintenance_team' } }
          ]
        },
        {
          id: 'wf-2',
          name: 'Nighttime Energy Spike Analysis',
          description: 'Ask AI to analyze possible causes if power usage spikes at night.',
          enabled: false,
          nodes: [
            { id: 't2', type: 'trigger', config: { type: 'threshold', metric: 'power', condition: '>', value: '20%', duration: 'baseline_comparison', timeframe: 'night' } },
            { id: 'a4', type: 'action', config: { type: 'ai_analyze', prompt: 'Analyze possible causes for the 20% power spike.' } },
            { id: 'a5', type: 'action', config: { type: 'report', frequency: 'weekly', recipient: 'manager@factory.com' } }
          ]
        }
      ],
      addWorkflow: (workflow) => set((state) => ({ workflows: [...state.workflows, workflow] })),
      updateWorkflow: (id, workflow) => set((state) => ({
        workflows: state.workflows.map(w => w.id === id ? { ...w, ...workflow } : w)
      })),
      deleteWorkflow: (id) => set((state) => ({
        workflows: state.workflows.filter(w => w.id !== id)
      }))
    })
);

let backendSaveTimer: number | undefined;

useAppStore.subscribe((state) => {
  if (!state.backendHydrated) return;
  if (state.currentUser?.role === 'Demo') return;

  window.clearTimeout(backendSaveTimer);
  backendSaveTimer = window.setTimeout(() => {
    fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pickBackendState(useAppStore.getState())),
    }).catch((error) => {
      console.error('Failed to save dashboard state', error);
    });
  }, 400);
});
