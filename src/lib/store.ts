import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Language } from './i18n';
import { Device } from '../types';
import { mockDevices } from './mockData';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: string;
  siteId: string;
}

export interface ChartConfig {
  id: string;
  title: string;
  type: 'bar' | 'pie' | 'line';
  dataSource: 'energy' | 'devices' | 'alerts' | 'solar' | 'coldStorage' | 'waterPump' | 'airCompressor';
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
  displayMode?: 'number' | 'line';
  metricKey?: string;
  iconId?: string;
  kpiKey?: OverviewKpiKey;
  chartId?: string;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  layout: any[];
  widgets: OverviewWidget[];
}

const DEFAULT_TAG_TEMPLATE_MAP: Record<string, string> = {
  All: 'factory-energy',
  'factory-a': 'factory-energy',
  solar: 'solar-monitoring',
  'cold-storage': 'cold-storage',
  'water-pump': 'water-pump',
  'air-compressor': 'air-compressor',
};

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
  const existingIds = new Set(devices.map((device) => device.id));
  return [
    ...devices,
    ...mockDevices.filter((device) => !existingIds.has(device.id)),
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

export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'condition' | 'action';
  config: any;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  nodes: WorkflowNode[];
}

interface AppState {
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
  // Devices
  devices: Device[];
  addDevice: (device: Device) => void;
  updateDevice: (id: string, device: Partial<Device>) => void;
  deleteDevice: (id: string) => void;
  // Users
  users: User[];
  addUser: (user: User) => void;
  updateUser: (id: string, user: Partial<User>) => void;
  deleteUser: (id: string) => void;
  // Profile
  currentUser: User;
  updateCurrentUser: (user: Partial<User>) => void;
  // Charts
  charts: ChartConfig[];
  addChart: (chart: ChartConfig) => void;
  removeChart: (id: string) => void;
  // Overview Dashboard
  overviewLayout: any[];
  overviewWidgets: OverviewWidget[];
  overviewWidgetLibrary: OverviewWidget[];
  dashboardTemplates: DashboardTemplate[];
  activeDashboardTemplateId: string;
  tagDashboardTemplateMap: Record<string, string>;
  updateOverviewLayout: (layout: any[]) => void;
  updateOverviewWidgets: (widgets: OverviewWidget[]) => void;
  addOverviewWidgetLibraryItem: (widget: OverviewWidget) => void;
  updateOverviewWidgetLibraryItem: (id: string, widget: Partial<OverviewWidget>) => void;
  removeOverviewWidgetLibraryItem: (id: string) => void;
  applyDashboardTemplate: (id: string) => void;
  setTagDashboardTemplate: (tag: string, templateId: string) => void;
  addDashboardTemplate: (template: DashboardTemplate) => void;
  updateDashboardTemplate: (template: DashboardTemplate) => void;
  deleteDashboardTemplate: (id: string) => void;
  addOverviewWidget: (widget: OverviewWidget, layoutItem: any) => void;
  updateOverviewWidget: (id: string, widget: Partial<OverviewWidget>) => void;
  removeOverviewWidget: (id: string) => void;
  // Workflows
  workflows: Workflow[];
  addWorkflow: (workflow: Workflow) => void;
  updateWorkflow: (id: string, workflow: Partial<Workflow>) => void;
  deleteWorkflow: (id: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
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

      devices: mockDevices,
      addDevice: (device) => set((state) => ({ devices: [...state.devices, device] })),
      updateDevice: (id, device) => set((state) => ({
        devices: state.devices.map(d => d.id === id ? { ...d, ...device } : d)
      })),
      deleteDevice: (id) => set((state) => ({
        devices: state.devices.filter(d => d.id !== id)
      })),

      users: [
        { id: '1', name: 'Admin User', email: 'admin@factory.com', role: 'Administrator', siteId: 'factory-a', password: 'password123' }
      ],
      addUser: (user) => set((state) => ({ users: [...state.users, user] })),
      updateUser: (id, user) => set((state) => ({
        users: state.users.map(u => u.id === id ? { ...u, ...user } : u)
      })),
      deleteUser: (id) => set((state) => ({
        users: state.users.filter(u => u.id !== id)
      })),

      currentUser: { id: '1', name: 'Admin User', email: 'admin@factory.com', role: 'Administrator', siteId: 'factory-a', password: 'password123' },
      updateCurrentUser: (user) => set((state) => ({
        currentUser: { ...state.currentUser, ...user },
        users: state.users.map(u => u.id === state.currentUser.id ? { ...u, ...user } : u)
      })),

      charts: DEFAULT_CHARTS,
      addChart: (chart) => set((state) => ({ charts: [...state.charts, chart] })),
      removeChart: (id) => set((state) => ({ charts: state.charts.filter(c => c.id !== id) })),

      overviewLayout: cloneLayout(DEFAULT_OVERVIEW_LAYOUT),
      overviewWidgets: cloneWidgets(DEFAULT_OVERVIEW_WIDGETS),
      overviewWidgetLibrary: [],
      dashboardTemplates: DASHBOARD_TEMPLATES.map((template) => ({
        ...template,
        layout: cloneLayout(template.layout),
        widgets: cloneWidgets(template.widgets),
      })),
      activeDashboardTemplateId: 'factory-energy',
      tagDashboardTemplateMap: DEFAULT_TAG_TEMPLATE_MAP,
      updateOverviewLayout: (layout) => set((state) => (
        sameOverviewLayout(state.overviewLayout, layout) ? state : { overviewLayout: layout }
      )),
      updateOverviewWidgets: (widgets) => set({ overviewWidgets: widgets }),
      addOverviewWidgetLibraryItem: (widget) => set((state) => ({
        overviewWidgetLibrary: [...state.overviewWidgetLibrary, widget]
      })),
      updateOverviewWidgetLibraryItem: (id, widget) => set((state) => ({
        overviewWidgetLibrary: state.overviewWidgetLibrary.map((item) => (
          item.id === id ? { ...item, ...widget } : item
        ))
      })),
      removeOverviewWidgetLibraryItem: (id) => set((state) => ({
        overviewWidgetLibrary: state.overviewWidgetLibrary.filter((item) => item.id !== id)
      })),
      applyDashboardTemplate: (id) => set((state) => {
        const template = state.dashboardTemplates.find((item) => item.id === id);
        if (!template) return {};

        return {
          activeDashboardTemplateId: id,
          overviewLayout: cloneLayout(template.layout),
          overviewWidgets: cloneWidgets(template.widgets),
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
      addOverviewWidget: (widget, layoutItem) => set((state) => ({
        overviewWidgets: [...state.overviewWidgets, widget],
        overviewLayout: [...state.overviewLayout, layoutItem]
      })),
      updateOverviewWidget: (id, widget) => set((state) => ({
        overviewWidgets: state.overviewWidgets.map((item) => (
          item.id === id ? { ...item, ...widget } : item
        ))
      })),
      removeOverviewWidget: (id) => set((state) => ({
        overviewWidgets: state.overviewWidgets.filter(w => w.id !== id),
        overviewLayout: state.overviewLayout.filter(l => l.i !== id)
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
    }),
    {
      name: 'app-storage',
      version: 7,
      migrate: (persistedState: any, version) => {
        if (version >= 7 || !persistedState) return persistedState;

        const builtInTemplateIds = new Set(DASHBOARD_TEMPLATES.map((template) => template.id));
        const customTemplates = (persistedState.dashboardTemplates || []).filter((template: DashboardTemplate) => !builtInTemplateIds.has(template.id));
        const upgradedTemplates = [
          ...DASHBOARD_TEMPLATES.map((template) => ({
            ...template,
            layout: cloneLayout(template.layout),
            widgets: cloneWidgets(template.widgets),
          })),
          ...customTemplates,
        ];
        const activeTemplate = upgradedTemplates.find((template) => template.id === persistedState.activeDashboardTemplateId) || upgradedTemplates[0];

        return {
          ...persistedState,
          devices: mergeDefaultDevices(persistedState.devices),
          charts: mergeDefaultCharts(persistedState.charts),
          overviewWidgetLibrary: cloneWidgets(persistedState.overviewWidgetLibrary || []),
          dashboardTemplates: upgradedTemplates,
          activeDashboardTemplateId: activeTemplate.id,
          tagDashboardTemplateMap: {
            ...DEFAULT_TAG_TEMPLATE_MAP,
            ...(persistedState.tagDashboardTemplateMap || {}),
          },
          overviewLayout: cloneLayout(activeTemplate.layout),
          overviewWidgets: cloneWidgets(activeTemplate.widgets),
        };
      },
    }
  )
);
