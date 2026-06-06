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
  dataSource: 'energy' | 'devices' | 'alerts';
}

export interface OverviewWidget {
  id: string;
  type: 'kpi' | 'kpis' | 'trend' | 'ai' | 'chart';
  kpiKey?: 'totalDevices' | 'onlineDevices' | 'energyToday' | 'activeAlerts';
  chartId?: string;
}

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
  updateOverviewLayout: (layout: any[]) => void;
  updateOverviewWidgets: (widgets: OverviewWidget[]) => void;
  addOverviewWidget: (widget: OverviewWidget, layoutItem: any) => void;
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

      charts: [
        { id: '1', title: 'Weekly Consumption', type: 'bar', dataSource: 'energy' },
        { id: '2', title: 'Device Distribution', type: 'pie', dataSource: 'devices' }
      ],
      addChart: (chart) => set((state) => ({ charts: [...state.charts, chart] })),
      removeChart: (id) => set((state) => ({ charts: state.charts.filter(c => c.id !== id) })),

      overviewLayout: [
        { i: 'kpi-total-devices', x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
        { i: 'kpi-online-devices', x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
        { i: 'kpi-energy-today', x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
        { i: 'kpi-active-alerts', x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
        { i: 'trend', x: 0, y: 2, w: 8, h: 4, minW: 4, minH: 3 },
        { i: 'ai', x: 8, y: 2, w: 4, h: 4, minW: 3, minH: 3 }
      ],
      overviewWidgets: [
        { id: 'kpi-total-devices', type: 'kpi', kpiKey: 'totalDevices' },
        { id: 'kpi-online-devices', type: 'kpi', kpiKey: 'onlineDevices' },
        { id: 'kpi-energy-today', type: 'kpi', kpiKey: 'energyToday' },
        { id: 'kpi-active-alerts', type: 'kpi', kpiKey: 'activeAlerts' },
        { id: 'trend', type: 'trend' },
        { id: 'ai', type: 'ai' }
      ],
      updateOverviewLayout: (layout) => set({ overviewLayout: layout }),
      updateOverviewWidgets: (widgets) => set({ overviewWidgets: widgets }),
      addOverviewWidget: (widget, layoutItem) => set((state) => ({
        overviewWidgets: [...state.overviewWidgets, widget],
        overviewLayout: [...state.overviewLayout, layoutItem]
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
    }
  )
);
