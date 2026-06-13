import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Server, Zap, AlertTriangle, BrainCircuit, Plus, GripHorizontal, Save, Pencil, Trash2, X, Sun, BatteryCharging, Thermometer, Droplets, DoorOpen, Gauge, Waves, Timer, Wind, SlidersHorizontal, Play, Pause, History, RotateCcw, Calendar, ChevronLeft, ChevronRight, LayoutDashboard } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { useAppStore } from '../lib/store';
import type { OverviewKpiKey, OverviewWidget } from '../lib/store';
import { translations } from '../lib/i18n';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import { ChartRenderer } from '../components/ChartRenderer';
import { cn } from '../lib/utils';
import { IOT_ICONS } from '../lib/icons';
import { deriveAlertsFromDevices, deriveEnergyTrendData } from '../lib/derivedData';
import { confirmDelete } from '../lib/confirm';
import { notifySuccess } from '../lib/toast';
import { useRuntimeDevices } from '../hooks/useRuntimeDevices';
import type { Device } from '../types';
import { applyMetricMappingsToMetrics } from '../lib/metricMappings';
import { getDeviceDataQuality } from '../lib/deviceStatus';

const ResponsiveGridLayout = WidthProvider(Responsive);
const GRID_COLS = 12;
const GRID_COLS_BY_BREAKPOINT = { lg: 12, md: 12, sm: 6, xs: 2, xxs: 1 };
const GRID_ROW_HEIGHT = 80;
const GRID_MARGIN: [number, number] = [16, 16];
const SNAP_THRESHOLD = 1;

type SnapGuide = {
  x?: number;
  y?: number;
};

type WidgetDisplayMode = NonNullable<OverviewWidget['displayMode']>;
type WidgetRuleState = 'normal' | 'warning' | 'critical' | 'noData';
type WidgetDataIssue = {
  title: string;
  detail: string;
  tone: 'config' | 'offline' | 'noData';
};
type OverviewTelemetryMessage = {
  device_id?: string;
  deviceId?: string;
  id?: string;
  status?: Device['status'];
  timestamp?: string;
  received_at?: string;
  metrics?: Record<string, unknown>;
  [key: string]: unknown;
};

const KPI_WIDGETS: { id: string; key: OverviewKpiKey; x: number }[] = [
  { id: 'kpi-total-devices', key: 'totalDevices', x: 0 },
  { id: 'kpi-online-devices', key: 'onlineDevices', x: 3 },
  { id: 'kpi-energy-today', key: 'energyToday', x: 6 },
  { id: 'kpi-active-alerts', key: 'activeAlerts', x: 9 },
];

const AVAILABLE_KPI_WIDGETS: { id: string; key: OverviewKpiKey; category: string }[] = [
  { id: 'kpi-total-devices', key: 'totalDevices', category: 'Common' },
  { id: 'kpi-online-devices', key: 'onlineDevices', category: 'Common' },
  { id: 'kpi-active-alerts', key: 'activeAlerts', category: 'Common' },
  { id: 'kpi-energy-today', key: 'energyToday', category: 'Energy' },
  { id: 'kpi-solar-generation', key: 'solarGeneration', category: 'Solar' },
  { id: 'kpi-solar-efficiency', key: 'solarEfficiency', category: 'Solar' },
  { id: 'kpi-battery-soc', key: 'batterySoc', category: 'Solar' },
  { id: 'kpi-cold-room-temp', key: 'coldRoomTemp', category: 'Cold Storage' },
  { id: 'kpi-cold-room-humidity', key: 'coldRoomHumidity', category: 'Cold Storage' },
  { id: 'kpi-door-open-events', key: 'doorOpenEvents', category: 'Cold Storage' },
  { id: 'kpi-pump-flow-rate', key: 'pumpFlowRate', category: 'Water Pump' },
  { id: 'kpi-water-pressure', key: 'waterPressure', category: 'Water Pump' },
  { id: 'kpi-pump-runtime', key: 'pumpRuntime', category: 'Water Pump' },
  { id: 'kpi-compressor-pressure', key: 'compressorPressure', category: 'Air Compressor' },
  { id: 'kpi-compressor-runtime', key: 'compressorRuntime', category: 'Air Compressor' },
  { id: 'kpi-air-leakage-rate', key: 'airLeakageRate', category: 'Air Compressor' },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const findNearestGuide = (value: number, guides: number[], min: number, max: number, threshold?: number) => {
  let nearest: number | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  guides.forEach((guide) => {
    if (guide < min || guide > max) return;

    const distance = Math.abs(value - guide);
    if ((threshold === undefined || distance <= threshold) && distance < nearestDistance) {
      nearest = guide;
      nearestDistance = distance;
    }
  });

  return nearest;
};

const sumMetric = (devices: any[], metric: string) => {
  return devices.reduce((total, device) => total + (Number(device.metrics?.[metric]) || 0), 0);
};

const averageMetric = (devices: any[], metric: string) => {
  const values = devices
    .map((device) => Number(device.metrics?.[metric]))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) return 0;

  return values.reduce((total, value) => total + value, 0) / values.length;
};

const parseOptionalNumber = (value: string) => {
  if (value.trim() === '') return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getWidgetPrecision = (widget: OverviewWidget) => {
  const precision = Number(widget.precision);
  if (!Number.isFinite(precision)) return 1;

  return clamp(Math.round(precision), 0, 6);
};

const normalizePrecision = (value: number) => {
  if (!Number.isFinite(value)) return 1;

  return clamp(Math.round(value), 0, 6);
};

const formatWidgetValue = (value: number, widget: OverviewWidget) => {
  if (!Number.isFinite(value)) return 'No Data';

  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: getWidgetPrecision(widget),
    maximumFractionDigits: getWidgetPrecision(widget),
  });

  return widget.unit ? `${formatted} ${widget.unit}` : formatted;
};

const getWidgetRuleState = (value: number, widget: OverviewWidget): WidgetRuleState => {
  if (!Number.isFinite(value)) return 'noData';

  const direction = widget.thresholds?.direction || 'above';
  const warning = widget.thresholds?.warning;
  const critical = widget.thresholds?.critical;

  if (direction === 'below') {
    if (critical !== undefined && value <= critical) return 'critical';
    if (warning !== undefined && value <= warning) return 'warning';
    return 'normal';
  }

  if (critical !== undefined && value >= critical) return 'critical';
  if (warning !== undefined && value >= warning) return 'warning';
  return 'normal';
};

const getWidgetRuleColor = (widget: OverviewWidget, state: WidgetRuleState) => {
  return widget.colorRules?.[state] || DEFAULT_WIDGET_COLORS[state];
};

const createWidgetId = (prefix: string) => `${prefix}_${Date.now()}_${Math.round(Math.random() * 10000)}`;
const WIDGET_DISPLAY_OPTIONS: { value: WidgetDisplayMode; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'line', label: 'Line Trend' },
  { value: 'area', label: 'Area Trend' },
  { value: 'bar', label: 'Bar Chart' },
  { value: 'gauge', label: 'Gauge' },
  { value: 'status', label: 'Status' },
  { value: 'donut', label: 'Donut' },
];
const getDisplayModeLabel = (mode?: WidgetDisplayMode) => WIDGET_DISPLAY_OPTIONS.find((option) => option.value === mode)?.label || 'Number';
const DEFAULT_WIDGET_COLORS: Record<WidgetRuleState, string> = {
  normal: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
  noData: '#94a3b8',
};
const HISTORY_PLAYBACK_TICK_MS = 1000;
const HISTORY_PLAYBACK_STEPS = 120;

const toDateTimeLocal = (date: Date) => {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
};

const getLocalDateKey = (date: Date) => toDateTimeLocal(date).slice(0, 10);

const getDatePart = (value: string) => value?.slice(0, 10) || getLocalDateKey(new Date());

const getTimePart = (value: string) => value?.slice(11, 16) || '00:00';

const setDatePart = (value: string, datePart: string) => `${datePart}T${getTimePart(value)}`;

const setTimePart = (value: string, timePart: string) => `${getDatePart(value)}T${timePart || '00:00'}`;

const toIsoOrEmpty = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};

const getTelemetryTime = (message: OverviewTelemetryMessage) => {
  const rawTime = String(message.received_at || message.timestamp || '');
  const time = new Date(rawTime).getTime();
  return Number.isFinite(time) ? time : 0;
};

const getTelemetryMetrics = (message: OverviewTelemetryMessage) => (
  Object.entries(message.metrics || {}).reduce<Record<string, number>>((acc, [key, value]) => {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) acc[key] = numericValue;
    return acc;
  }, {})
);

const getTelemetryDeviceId = (message: OverviewTelemetryMessage) => String(message.device_id || message.deviceId || message.id || '');

const getTelemetryMessageKey = (message: OverviewTelemetryMessage, index: number) => [
  getTelemetryDeviceId(message),
  String(message.received_at || message.timestamp || ''),
  String(message.topic || message.mqtt_topic || message.source || ''),
  String(message.id || index),
].join('|');

const mergeTelemetryMessages = (groups: OverviewTelemetryMessage[][]) => {
  const seen = new Set<string>();
  return groups
    .flat()
    .filter((message, index) => {
      const key = getTelemetryMessageKey(message, index);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((first, second) => getTelemetryTime(first) - getTelemetryTime(second));
};

const mergeTelemetryDayRows = (groups: Array<Array<{ day: string; count: number }>>) => {
  const byDay = new Map<string, number>();
  groups.flat().forEach((item) => {
    if (!item.day) return;
    byDay.set(item.day, (byDay.get(item.day) || 0) + Number(item.count || 0));
  });

  return Array.from(byDay.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((first, second) => first.day.localeCompare(second.day));
};

const WIDGET_PRESET_LIBRARY: (OverviewWidget & { category: string; description: string })[] = [
  {
    id: 'preset-power-demand',
    type: 'custom',
    category: 'Factory Energy',
    title: 'Power Demand',
    description: 'Current total power demand with warning and critical bands.',
    displayMode: 'number',
    metricKey: 'power',
    iconId: 'zap',
    unit: 'W',
    precision: 0,
    thresholds: { direction: 'above', warning: 3500, critical: 5000 },
  },
  {
    id: 'preset-energy-trend',
    type: 'custom',
    category: 'Factory Energy',
    title: 'Energy Trend',
    description: 'Area trend for daily energy consumption.',
    displayMode: 'area',
    metricKey: 'energy',
    iconId: 'plug-zap',
    unit: 'kWh',
    precision: 1,
    thresholds: { direction: 'above', warning: 650, critical: 900 },
  },
  {
    id: 'preset-equipment-status',
    type: 'custom',
    category: 'Common',
    title: 'Equipment Health Status',
    description: 'Status tile for any health or load percentage metric.',
    displayMode: 'status',
    metricKey: 'health',
    iconId: 'activity',
    unit: '%',
    precision: 0,
    thresholds: { direction: 'below', warning: 70, critical: 45 },
  },
  {
    id: 'preset-temperature-status',
    type: 'custom',
    category: 'Cold Storage',
    title: 'Cold Room Temperature',
    description: 'Temperature status for cold storage and refrigeration rooms.',
    displayMode: 'status',
    metricKey: 'temperature',
    iconId: 'thermometer',
    unit: 'deg C',
    precision: 1,
    thresholds: { direction: 'above', warning: -12, critical: -8 },
  },
  {
    id: 'preset-humidity-gauge',
    type: 'custom',
    category: 'Cold Storage',
    title: 'Humidity Gauge',
    description: 'Gauge for cold storage humidity monitoring.',
    displayMode: 'gauge',
    metricKey: 'humidity',
    iconId: 'droplet',
    unit: '%',
    precision: 0,
    thresholds: { direction: 'above', warning: 75, critical: 85 },
  },
  {
    id: 'preset-solar-generation',
    type: 'custom',
    category: 'Solar',
    title: 'PV Generation',
    description: 'Solar generation line trend for inverter or plant metrics.',
    displayMode: 'line',
    metricKey: 'daily_generation',
    iconId: 'sun',
    unit: 'kWh',
    precision: 1,
    thresholds: { direction: 'below', warning: 180, critical: 100 },
  },
  {
    id: 'preset-battery-soc',
    type: 'custom',
    category: 'Solar',
    title: 'Battery SOC',
    description: 'Battery state of charge gauge.',
    displayMode: 'gauge',
    metricKey: 'battery_soc',
    iconId: 'battery-charging',
    unit: '%',
    precision: 0,
    thresholds: { direction: 'below', warning: 35, critical: 20 },
  },
  {
    id: 'preset-pump-pressure',
    type: 'custom',
    category: 'Water Pump',
    title: 'Pump Pressure',
    description: 'Pump station pressure trend.',
    displayMode: 'line',
    metricKey: 'pressure',
    iconId: 'gauge',
    unit: 'bar',
    precision: 1,
    thresholds: { direction: 'above', warning: 6, critical: 8 },
  },
  {
    id: 'preset-flow-rate',
    type: 'custom',
    category: 'Water Pump',
    title: 'Flow Rate',
    description: 'Bar chart comparing flow rate across selected pumps.',
    displayMode: 'bar',
    metricKey: 'flow_rate',
    iconId: 'waves',
    unit: 'm3/h',
    precision: 1,
    thresholds: { direction: 'below', warning: 35, critical: 20 },
  },
  {
    id: 'preset-air-pressure',
    type: 'custom',
    category: 'Air Compressor',
    title: 'Air Pressure',
    description: 'Compressed air pressure gauge.',
    displayMode: 'gauge',
    metricKey: 'pressure',
    iconId: 'gauge-circle',
    unit: 'bar',
    precision: 1,
    thresholds: { direction: 'below', warning: 6.5, critical: 5.5 },
  },
  {
    id: 'preset-leakage-rate',
    type: 'custom',
    category: 'Air Compressor',
    title: 'Leakage Rate',
    description: 'Leakage rate status for compressed air systems.',
    displayMode: 'status',
    metricKey: 'leakage_rate',
    iconId: 'wind',
    unit: '%',
    precision: 1,
    thresholds: { direction: 'above', warning: 8, critical: 15 },
  },
];

const collides = (a: any, b: any) => {
  if (a.i === b.i) return false;

  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
};

const collidesWithLayout = (item: any, layout: any[]) => {
  return layout.some((candidate) => collides(item, candidate));
};

const layoutsEqual = (first: any[], second: any[]) => {
  if (first.length !== second.length) return false;

  const secondById = new Map(second.map((item) => [item.i, item]));

  return first.every((item) => {
    const other = secondById.get(item.i);
    if (!other) return false;

    return (
      item.x === other.x &&
      item.y === other.y &&
      item.w === other.w &&
      item.h === other.h
    );
  });
};

const getResponsiveWidgetWidth = (item: any, cols: number) => {
  if (cols <= 2) return cols;
  if (cols <= 6) return item.w >= 6 ? cols : Math.min(3, cols);
  return item.w;
};

const getInitialOverviewBreakpoint = (): keyof typeof GRID_COLS_BY_BREAKPOINT => {
  if (typeof window === 'undefined') return 'lg';
  if (window.innerWidth < 480) return 'xxs';
  if (window.innerWidth < 768) return 'xs';
  if (window.innerWidth < 996) return 'sm';
  if (window.innerWidth < 1200) return 'md';
  return 'lg';
};

const createResponsiveLayout = (layout: any[], cols: number) => {
  if (cols >= GRID_COLS) return layout.map((item) => ({ ...item }));

  const sortedLayout = layout
    .map((item) => ({ ...item }))
    .sort((first, second) => (first.y - second.y) || (first.x - second.x));
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  return sortedLayout.map((item) => {
    const width = getResponsiveWidgetWidth(item, cols);
    const height = Math.max(Number(item.h) || 2, Number(item.minH) || 2);

    if (cursorX + width > cols) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }

    const nextItem = {
      ...item,
      x: cursorX,
      y: cursorY,
      w: width,
      h: height,
      minW: Math.min(Number(item.minW) || 1, width),
      maxW: cols,
    };

    cursorX += width;
    rowHeight = Math.max(rowHeight, height);

    return nextItem;
  });
};

export function Overview() {
  const {
    language,
    theme,
    devices: storedDevices,
    charts,
    overviewWidgets: globalOverviewWidgets,
    overviewWidgetLibrary: globalOverviewWidgetLibrary,
    overviewLayout: globalOverviewLayout,
    overviewDashboardsBySite,
    sites,
    activeSiteId,
    setActiveSite,
    addOverviewWidget,
    removeOverviewWidget,
    updateOverviewWidget,
    updateOverviewLayout,
    updateOverviewWidgets,
    addOverviewWidgetLibraryItem,
    updateOverviewWidgetLibraryItem,
    removeOverviewWidgetLibraryItem,
  } = useAppStore();
  const liveDevices = useRuntimeDevices(storedDevices);
  const t = translations[language];
  const [showWidgetBuilder, setShowWidgetBuilder] = useState(false);
  const [activeSnapGuide, setActiveSnapGuide] = useState<SnapGuide>({});
  const [selectedSiteId, setSelectedSiteId] = useState(activeSiteId || 'factory-a');
  const [historyFrom, setHistoryFrom] = useState(() => toDateTimeLocal(new Date(Date.now() - 60 * 60 * 1000)));
  const [historyTo, setHistoryTo] = useState(() => toDateTimeLocal(new Date()));
  const [historyMode, setHistoryMode] = useState(false);
  const [historyPlaying, setHistoryPlaying] = useState(false);
  const [historyCursor, setHistoryCursor] = useState(() => new Date(historyFrom).getTime());
  const [historyMessages, setHistoryMessages] = useState<OverviewTelemetryMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [activeDatePicker, setActiveDatePicker] = useState<'from' | 'to' | null>(null);
  const [datePickerMonth, setDatePickerMonth] = useState(() => new Date());
  const [telemetryDataDays, setTelemetryDataDays] = useState<Array<{ day: string; count: number }>>([]);
  const [telemetryDataDaysError, setTelemetryDataDaysError] = useState('');
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null);
  const [editingLibraryWidgetId, setEditingLibraryWidgetId] = useState<string | null>(null);
  const [draggingLibraryWidgetId, setDraggingLibraryWidgetId] = useState<string | null>(null);
  const [builderTitle, setBuilderTitle] = useState('New Widget');
  const [builderDisplayMode, setBuilderDisplayMode] = useState<WidgetDisplayMode>('number');
  const [builderMetricKey, setBuilderMetricKey] = useState('power');
  const [builderIconId, setBuilderIconId] = useState('activity');
  const [builderDeviceIds, setBuilderDeviceIds] = useState<string[]>([]);
  const [builderUnit, setBuilderUnit] = useState('');
  const [builderPrecision, setBuilderPrecision] = useState(1);
  const [builderThresholdDirection, setBuilderThresholdDirection] = useState<'above' | 'below'>('above');
  const [builderWarningThreshold, setBuilderWarningThreshold] = useState('');
  const [builderCriticalThreshold, setBuilderCriticalThreshold] = useState('');
  const [builderNormalColor, setBuilderNormalColor] = useState(DEFAULT_WIDGET_COLORS.normal);
  const [builderWarningColor, setBuilderWarningColor] = useState(DEFAULT_WIDGET_COLORS.warning);
  const [builderCriticalColor, setBuilderCriticalColor] = useState(DEFAULT_WIDGET_COLORS.critical);
  const [builderNoDataColor, setBuilderNoDataColor] = useState(DEFAULT_WIDGET_COLORS.noData);
  const [currentBreakpoint, setCurrentBreakpoint] = useState<keyof typeof GRID_COLS_BY_BREAKPOINT>(getInitialOverviewBreakpoint);
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const dashboardDropRef = useRef<HTMLDivElement | null>(null);
  const isGridInteractingRef = useRef(false);
  const activeOverviewDashboard = overviewDashboardsBySite[selectedSiteId] || {
    layout: globalOverviewLayout,
    widgets: globalOverviewWidgets,
    widgetLibrary: globalOverviewWidgetLibrary,
  };
  const overviewLayout = activeOverviewDashboard.layout || [];
  const overviewWidgets = activeOverviewDashboard.widgets || [];
  const overviewWidgetLibrary = activeOverviewDashboard.widgetLibrary || [];
  const historyStartMs = new Date(historyFrom).getTime();
  const historyEndMs = new Date(historyTo).getTime();
  const historyRangeValid = Number.isFinite(historyStartMs) && Number.isFinite(historyEndMs) && historyEndMs > historyStartMs;
  const devices = useMemo(() => {
    if (!historyMode) return liveDevices;

    const snapshotById = new Map<string, Device>(storedDevices.map((device): [string, Device] => [
      device.id,
      {
        ...device,
        metrics: {},
        status: 'offline' as const,
        lastSeen: '',
      },
    ]));

    [...historyMessages]
      .filter((message) => getTelemetryTime(message) <= historyCursor)
      .sort((first, second) => getTelemetryTime(first) - getTelemetryTime(second))
      .forEach((message) => {
        const telemetryDeviceId = String(message.device_id || message.deviceId || message.id || '');
        if (!telemetryDeviceId) return;
        const target = Array.from(snapshotById.values()).find((device) => (
          device.id === telemetryDeviceId || device.config?.externalDeviceId === telemetryDeviceId
        ));
        if (!target) return;
        const messageTime = getTelemetryTime(message);
        snapshotById.set(target.id, {
          ...target,
          status: message.status || 'online',
          lastSeen: messageTime ? new Date(messageTime).toISOString() : target.lastSeen,
          metrics: {
            ...target.metrics,
            ...applyMetricMappingsToMetrics(target, getTelemetryMetrics(message)),
          },
        });
      });

    return Array.from(snapshotById.values());
  }, [historyCursor, historyMessages, historyMode, liveDevices, storedDevices]);
  const historyProgress = historyMode && historyRangeValid
    ? Math.max(0, Math.min(100, ((historyCursor - historyStartMs) / (historyEndMs - historyStartMs)) * 100))
    : 0;
  const historyCursorLabel = historyMode && Number.isFinite(historyCursor)
    ? new Date(historyCursor).toLocaleString()
    : 'Live';
  const telemetryDataDaySet = useMemo(() => new Set(telemetryDataDays.map((item) => item.day)), [telemetryDataDays]);
  const telemetryDataCountByDay = useMemo(
    () => Object.fromEntries(telemetryDataDays.map((item) => [item.day, item.count])) as Record<string, number>,
    [telemetryDataDays]
  );
  const historyScopeDevices = useMemo(() => {
    if (selectedSiteId === 'All') return storedDevices;

    const selectedSite = sites.find((site) => site.id === selectedSiteId) || null;
    const siteTags = new Set(selectedSite?.tags || []);
    return storedDevices.filter((device) => (
      device.siteId === selectedSiteId ||
      (!device.siteId && Boolean(device.tags?.some((tag) => siteTags.has(tag))))
    ));
  }, [selectedSiteId, sites, storedDevices]);
  const historyDeviceIdentifiers = useMemo(() => (
    Array.from(new Set(
      historyScopeDevices
        .flatMap((device) => [device.id, device.config?.externalDeviceId])
        .filter((value): value is string => Boolean(value))
        .map((value) => String(value))
    ))
  ), [historyScopeDevices]);

  const openDatePicker = (kind: 'from' | 'to') => {
    const sourceValue = kind === 'from' ? historyFrom : historyTo;
    const sourceDate = new Date(sourceValue || Date.now());
    setDatePickerMonth(Number.isNaN(sourceDate.getTime()) ? new Date() : sourceDate);
    setActiveDatePicker((current) => current === kind ? null : kind);
  };

  const updateHistoryDate = (kind: 'from' | 'to', dateKey: string) => {
    if (kind === 'from') {
      setHistoryFrom((current) => setDatePart(current, dateKey));
    } else {
      setHistoryTo((current) => setDatePart(current, dateKey));
    }
    setActiveDatePicker(null);
  };

  const updateHistoryTime = (kind: 'from' | 'to', timeValue: string) => {
    if (kind === 'from') {
      setHistoryFrom((current) => setTimePart(current, timeValue));
    } else {
      setHistoryTo((current) => setTimePart(current, timeValue));
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadTelemetryDataDays = async () => {
      try {
        const start = new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth(), 1);
        start.setDate(start.getDate() - 7);
        const end = new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth() + 1, 7, 23, 59, 59);
        const params = new URLSearchParams();
        params.set('from', start.toISOString());
        params.set('to', end.toISOString());
        if (historyDeviceIdentifiers.length === 0) {
          if (!cancelled) {
            setTelemetryDataDays([]);
            setTelemetryDataDaysError('');
          }
          return;
        }

        const dayGroups = await Promise.all(historyDeviceIdentifiers.map(async (deviceId) => {
          const scopedParams = new URLSearchParams(params);
          scopedParams.set('deviceId', deviceId);
          const response = await fetch(`/api/telemetry/days?${scopedParams.toString()}`);
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || `Telemetry days query failed: ${response.status}`);
          return Array.isArray(payload.days) ? payload.days as Array<{ day: string; count: number }> : [];
        }));

        if (!cancelled) {
          setTelemetryDataDays(mergeTelemetryDayRows(dayGroups));
          setTelemetryDataDaysError('');
        }
      } catch (error) {
        if (!cancelled) {
          setTelemetryDataDays([]);
          setTelemetryDataDaysError(error instanceof Error ? error.message : 'Failed to load telemetry days.');
        }
      }
    };

    loadTelemetryDataDays();
    return () => {
      cancelled = true;
    };
  }, [datePickerMonth, historyDeviceIdentifiers]);

  const loadHistoryRange = async () => {
    setHistoryPlaying(false);
    setHistoryError('');

    if (!historyRangeValid) {
      setHistoryError('Please select a valid time range.');
      return;
    }

    setHistoryLoading(true);
    try {
      if (historyDeviceIdentifiers.length === 0) {
        setHistoryMessages([]);
        setHistoryCursor(historyStartMs);
        setHistoryMode(true);
        setHistoryPlaying(false);
        setHistoryError('No devices are assigned to the selected site.');
        return;
      }

      const params = new URLSearchParams();
      params.set('from', toIsoOrEmpty(historyFrom));
      params.set('to', toIsoOrEmpty(historyTo));
      params.set('limit', '1000');
      const messageGroups = await Promise.all(historyDeviceIdentifiers.map(async (deviceId) => {
        const scopedParams = new URLSearchParams(params);
        scopedParams.set('deviceId', deviceId);
        const response = await fetch(`/api/telemetry?${scopedParams.toString()}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `Telemetry query failed: ${response.status}`);
        return Array.isArray(payload.messages) ? payload.messages as OverviewTelemetryMessage[] : [];
      }));

      setHistoryMessages(mergeTelemetryMessages(messageGroups));
      setHistoryCursor(historyStartMs);
      setHistoryMode(true);
      setHistoryPlaying(false);
    } catch (error) {
      setHistoryMessages([]);
      setHistoryMode(true);
      setHistoryCursor(historyStartMs);
      setHistoryError(error instanceof Error ? error.message : 'Failed to load historical telemetry.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const returnToLive = () => {
    setHistoryMode(false);
    setHistoryPlaying(false);
    setHistoryError('');
  };

  useEffect(() => {
    setHistoryPlaying(false);
  }, [historyFrom, historyTo]);

  useEffect(() => {
    if (!historyMode || !historyPlaying || !historyRangeValid) return;

    const stepMs = Math.max(1000, Math.ceil((historyEndMs - historyStartMs) / HISTORY_PLAYBACK_STEPS));
    const intervalId = window.setInterval(() => {
      setHistoryCursor((current) => {
        const next = Math.min(historyEndMs, current + stepMs);
        if (next >= historyEndMs) setHistoryPlaying(false);
        return next;
      });
    }, HISTORY_PLAYBACK_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [historyEndMs, historyMode, historyPlaying, historyRangeValid, historyStartMs]);

  const updateSnapGuide = (nextGuide: SnapGuide) => {
    setActiveSnapGuide((currentGuide) => (
      currentGuide.x === nextGuide.x && currentGuide.y === nextGuide.y
        ? currentGuide
        : nextGuide
    ));
  };

  const snapGuides = useMemo(() => {
    return overviewLayout.reduce<Record<string, { x: number[]; y: number[] }>>((acc, item: any) => {
      const otherItems = overviewLayout.filter((candidate: any) => candidate.i !== item.i);
      const xGuides = new Set<number>([0]);
      const yGuides = new Set<number>([0]);

      otherItems.forEach((candidate: any) => {
        const candidateRight = candidate.x + candidate.w;
        const candidateBottom = candidate.y + candidate.h;

        if (Number.isFinite(candidate.x)) xGuides.add(candidate.x);
        if (Number.isFinite(candidateRight)) xGuides.add(candidateRight);
        if (Number.isFinite(candidate.y)) yGuides.add(candidate.y);
        if (Number.isFinite(candidateBottom)) yGuides.add(candidateBottom);
      });

      acc[item.i] = {
        x: Array.from(xGuides),
        y: Array.from(yGuides),
      };

      return acc;
    }, {});
  }, [overviewLayout]);

  const gridLayouts = useMemo(() => ({
    lg: createResponsiveLayout(overviewLayout, GRID_COLS_BY_BREAKPOINT.lg),
    md: createResponsiveLayout(overviewLayout, GRID_COLS_BY_BREAKPOINT.md),
    sm: createResponsiveLayout(overviewLayout, GRID_COLS_BY_BREAKPOINT.sm),
    xs: createResponsiveLayout(overviewLayout, GRID_COLS_BY_BREAKPOINT.xs),
    xxs: createResponsiveLayout(overviewLayout, GRID_COLS_BY_BREAKPOINT.xxs),
  }), [overviewLayout]);
  const isDesktopGrid = currentBreakpoint === 'lg' || currentBreakpoint === 'md';
  const isLayoutEditable = isDesktopGrid && layoutEditMode;

  const siteFilters = useMemo(() => [
    { id: 'All', name: 'All Sites', tenantName: 'All Tenants', tags: [] as string[] },
    ...sites,
  ], [sites]);

  useEffect(() => {
    if (!selectedSiteId && activeSiteId) setSelectedSiteId(activeSiteId);
  }, [activeSiteId, selectedSiteId]);

  useEffect(() => {
    if (!activeSiteId || selectedSiteId === 'All' || selectedSiteId === activeSiteId) return;

    setSelectedSiteId(activeSiteId);
  }, [activeSiteId, selectedSiteId]);

  useEffect(() => {
    if (!isDesktopGrid && layoutEditMode) {
      setLayoutEditMode(false);
      clearSnapGuide();
    }
  }, [isDesktopGrid, layoutEditMode]);

  const selectedSite = useMemo(() => sites.find((site) => site.id === selectedSiteId) || null, [selectedSiteId, sites]);

  const scopedDevices = useMemo(() => {
    if (selectedSiteId === 'All') return devices;

    const siteTags = new Set(selectedSite?.tags || []);
    return devices.filter((device) => (
      device.siteId === selectedSiteId ||
      (!device.siteId && Boolean(device.tags?.some((tag) => siteTags.has(tag))))
    ));
  }, [devices, selectedSite, selectedSiteId]);

  const scopedDeviceIds = useMemo(() => new Set(scopedDevices.map((device) => device.id)), [scopedDevices]);
  const scopedAlerts = useMemo(() => {
    const alerts = deriveAlertsFromDevices(devices);
    return selectedSiteId === 'All'
      ? alerts
      : alerts.filter((alert) => scopedDeviceIds.has(alert.deviceId));
  }, [devices, selectedSiteId, scopedDeviceIds]);

  const scopedMetricOptions = useMemo(() => {
    const metrics = new Set<string>();
    scopedDevices.forEach((device) => {
      Object.keys(device.metrics || {}).forEach((metric) => metrics.add(metric));
    });

    return Array.from(metrics).sort();
  }, [scopedDevices]);

  const builderDevices = useMemo(() => {
    if (builderDeviceIds.length === 0) return scopedDevices;

    const selectedDeviceIds = new Set(builderDeviceIds);
    return devices.filter((device) => selectedDeviceIds.has(device.id));
  }, [builderDeviceIds, devices, scopedDevices]);

  const builderMetricOptions = useMemo(() => {
    const metrics = new Set<string>();
    builderDevices.forEach((device) => {
      Object.keys(device.metrics || {}).forEach((metric) => metrics.add(metric));
    });

    return Array.from(metrics).sort();
  }, [builderDevices]);

  const getAlertsForDevices = (targetDevices: any[]) => {
    if (targetDevices === scopedDevices) return scopedAlerts;

    const targetIds = new Set(targetDevices.map((device) => device.id));
    return deriveAlertsFromDevices(devices).filter((alert) => targetIds.has(alert.deviceId));
  };

  const getHistoryTrendData = (targetDevices: Device[], metricKey: string) => {
    const fallbackData = deriveEnergyTrendData(targetDevices, metricKey).map((point) => ({
      time: point.time,
      value: point.value,
      baseline: point.baseline,
    }));
    if (!historyMode || !historyRangeValid) return fallbackData;

    const targetIds = new Set<string>();
    targetDevices.forEach((device) => {
      targetIds.add(device.id);
      if (device.config?.externalDeviceId) targetIds.add(device.config.externalDeviceId);
    });

    const visibleMessages = historyMessages
      .map((message) => {
        const telemetryDeviceId = getTelemetryDeviceId(message);
        const boundDevice = targetDevices.find((device) => device.id === telemetryDeviceId || device.config?.externalDeviceId === telemetryDeviceId);
        return {
          message,
          time: getTelemetryTime(message),
          metrics: applyMetricMappingsToMetrics(boundDevice, getTelemetryMetrics(message)),
        };
      })
      .filter(({ message, time, metrics }) => (
        time >= historyStartMs
        && time <= historyCursor
        && targetIds.has(getTelemetryDeviceId(message))
        && Number.isFinite(Number(metrics[metricKey]))
      ))
      .sort((first, second) => first.time - second.time);

    if (visibleMessages.length === 0) {
      return [
        { time: new Date(historyStartMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), value: 0, baseline: 0 },
        { time: new Date(Math.min(historyCursor, historyEndMs)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), value: 0, baseline: 0 },
      ];
    }

    const bucketCount = 12;
    const bucketSize = Math.max(1, (historyEndMs - historyStartMs) / bucketCount);
    const buckets = new Map<number, number>();
    visibleMessages.forEach(({ time, metrics }) => {
      const bucket = Math.max(0, Math.min(bucketCount - 1, Math.floor((time - historyStartMs) / bucketSize)));
      buckets.set(bucket, (buckets.get(bucket) || 0) + Number(metrics[metricKey] || 0));
    });

    return Array.from(buckets.entries()).map(([bucket, value]) => {
      const bucketTime = historyStartMs + bucket * bucketSize;
      return {
        time: new Date(bucketTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: Number(value.toFixed(3)),
        baseline: 0,
      };
    });
  };

  const getStatsForDevices = (targetDevices: any[]): Record<OverviewKpiKey, { name: string; value: string; icon: any }> => {
    const targetAlerts = getAlertsForDevices(targetDevices);
    const liveDeviceCount = targetDevices.filter((device) => (
      getDeviceDataQuality(
        historyMode ? device : storedDevices.find((item) => item.id === device.id) || device,
        historyMode ? historyCursor : Date.now()
      ).state === 'online'
    )).length;

    return {
      totalDevices: { name: t.overview.totalDevices, value: targetDevices.length.toString(), icon: Server },
      onlineDevices: { name: t.overview.onlineDevices, value: liveDeviceCount.toString(), icon: Activity },
      energyToday: { name: t.overview.energyToday, value: `${sumMetric(targetDevices, 'energy').toFixed(1)} kWh`, icon: Zap },
      activeAlerts: { name: t.overview.activeAlerts, value: targetAlerts.filter(a => a.status === 'active').length.toString(), icon: AlertTriangle },
      solarGeneration: { name: 'PV Generation Today', value: `${(sumMetric(targetDevices, 'energy_today') / 1000).toFixed(2)} MWh`, icon: Sun },
      solarEfficiency: { name: 'Inverter Efficiency', value: `${averageMetric(targetDevices, 'efficiency').toFixed(1)}%`, icon: Activity },
      batterySoc: { name: 'Battery SOC', value: `${averageMetric(targetDevices, 'battery_soc').toFixed(0)}%`, icon: BatteryCharging },
      coldRoomTemp: { name: 'Cold Room Temp', value: `${averageMetric(targetDevices, 'temperature').toFixed(1)} deg C`, icon: Thermometer },
      coldRoomHumidity: { name: 'Humidity', value: `${averageMetric(targetDevices, 'humidity').toFixed(0)}%`, icon: Droplets },
      doorOpenEvents: { name: 'Door Open Events', value: sumMetric(targetDevices, 'door_open_events').toFixed(0), icon: DoorOpen },
      pumpFlowRate: { name: 'Flow Rate', value: `${averageMetric(targetDevices, 'flow_rate').toFixed(0)} m3/h`, icon: Waves },
      waterPressure: { name: 'Water Pressure', value: `${averageMetric(targetDevices, 'pressure').toFixed(1)} bar`, icon: Gauge },
      pumpRuntime: { name: 'Pump Runtime', value: `${averageMetric(targetDevices, 'running_hours').toFixed(1)} h`, icon: Timer },
      compressorPressure: { name: 'Air Pressure', value: `${averageMetric(targetDevices, 'pressure').toFixed(1)} bar`, icon: Gauge },
      compressorRuntime: { name: 'Compressor Runtime', value: `${averageMetric(targetDevices, 'running_hours').toFixed(1)} h`, icon: Timer },
      airLeakageRate: { name: 'Leakage Rate', value: `${averageMetric(targetDevices, 'leakage_rate').toFixed(1)}%`, icon: Wind },
    };
  };

  const stats = getStatsForDevices(scopedDevices);

  useEffect(() => {
    const hasLegacyKpis = overviewWidgets.some((widget) => widget.type === 'kpis') || overviewLayout.some((item) => item.i === 'kpis');

    if (!hasLegacyKpis) return;

    const legacyLayout = overviewLayout.find((item) => item.i === 'kpis');
    const kpiY = Number.isFinite(legacyLayout?.y) ? legacyLayout.y : 0;
    const kpiHeight = Number.isFinite(legacyLayout?.h) ? legacyLayout.h : 2;
    const nextWidgets = [
      ...KPI_WIDGETS.map((kpi) => ({ id: kpi.id, type: 'kpi' as const, kpiKey: kpi.key })),
      ...overviewWidgets.filter((widget) => widget.type !== 'kpis' && !KPI_WIDGETS.some((kpi) => kpi.id === widget.id)),
    ];
    const nextLayout = [
      ...KPI_WIDGETS.map((kpi) => {
        const existing = overviewLayout.find((item) => item.i === kpi.id);
        return existing || { i: kpi.id, x: kpi.x, y: kpiY, w: 3, h: kpiHeight, minW: 2, minH: 2 };
      }),
      ...overviewLayout.filter((item) => item.i !== 'kpis' && !KPI_WIDGETS.some((kpi) => kpi.id === item.i)),
    ];

    updateOverviewWidgets(nextWidgets, selectedSiteId);
    updateOverviewLayout(nextLayout, selectedSiteId);
  }, [overviewLayout, overviewWidgets, selectedSiteId, updateOverviewLayout, updateOverviewWidgets]);

  useEffect(() => {
    if (!showWidgetBuilder) return;
    if (builderMetricOptions.length === 0) return;
    if (builderMetricOptions.includes(builderMetricKey)) return;

    setBuilderMetricKey(builderMetricOptions[0]);
  }, [builderMetricKey, builderMetricOptions, showWidgetBuilder]);

  const isDark = theme === 'dark';
  const cartesianGridStroke = isDark ? '#334155' : '#e2e8f0';
  const tooltipBg = isDark ? '#0f1115' : '#ffffff';
  const tooltipBorder = isDark ? '#1e293b' : '#e2e8f0';
  const tooltipColor = isDark ? '#cbd5e1' : '#334155';

  const onLayoutChange = (currentLayout: any[]) => {
    if (!isLayoutEditable) return;
    if (isGridInteractingRef.current) return;
    if (layoutsEqual(currentLayout, overviewLayout)) return;

    updateOverviewLayout(currentLayout, selectedSiteId);
  };

  const handleDragStart = () => {
    if (!isLayoutEditable) return;
    isGridInteractingRef.current = true;
  };

  const handleDrag = (_layout: any[], _oldItem: any, newItem: any, _placeholder: any) => {
    if (!isLayoutEditable) return;
    const guides = snapGuides[newItem.i];
    if (!guides) {
      updateSnapGuide({});
      return;
    }

    const snapX = findNearestGuide(newItem.x, guides.x, 0, GRID_COLS - newItem.w, SNAP_THRESHOLD);
    const snapY = findNearestGuide(newItem.y, guides.y, 0, Number.POSITIVE_INFINITY, SNAP_THRESHOLD);
    const nextGuide: SnapGuide = {};

    if (snapX !== undefined) {
      nextGuide.x = clamp(snapX, 0, GRID_COLS - newItem.w);
    }

    if (snapY !== undefined) {
      nextGuide.y = Math.max(0, snapY);
    }

    updateSnapGuide(nextGuide);
  };

  const snapLayoutItem = (layout: any[], movedItem: any) => {
    const guides = snapGuides[movedItem.i];
    if (!guides) return layout;

    const snapX = findNearestGuide(movedItem.x, guides.x, 0, GRID_COLS - movedItem.w);
    const snapY = findNearestGuide(movedItem.y, guides.y, 0, Number.POSITIVE_INFINITY);

    if (snapX === undefined && snapY === undefined) return layout;

    const originalItem = {...movedItem};
    const snappedItem = {
      ...movedItem,
      x: snapX !== undefined ? clamp(snapX, 0, GRID_COLS - movedItem.w) : movedItem.x,
      y: snapY !== undefined ? Math.max(0, snapY) : movedItem.y,
    };

    const otherItems = layout.filter((item) => item.i !== movedItem.i);
    let nextItem = snappedItem;

    if (collidesWithLayout(nextItem, otherItems)) {
      const xOnlyItem = {...originalItem, x: snappedItem.x};
      const yOnlyItem = {...originalItem, y: snappedItem.y};

      if (!collidesWithLayout(xOnlyItem, otherItems)) {
        nextItem = xOnlyItem;
      } else if (!collidesWithLayout(yOnlyItem, otherItems)) {
        nextItem = yOnlyItem;
      } else {
        nextItem = originalItem;
      }
    }

    return layout.map((item) => item.i === movedItem.i ? {...item, ...nextItem} : item);
  };

  const handleDragStop = (layout: any[], _oldItem: any, newItem: any) => {
    if (!isLayoutEditable) return;
    const nextLayout = snapLayoutItem(layout.map((item) => ({ ...item })), { ...newItem });

    if (!layoutsEqual(nextLayout, overviewLayout)) {
      updateOverviewLayout(nextLayout, selectedSiteId);
    }

    isGridInteractingRef.current = false;
    updateSnapGuide({});
  };

  const handleResizeStart = () => {
    if (!isLayoutEditable) return;
    isGridInteractingRef.current = true;
    clearSnapGuide();
  };

  const handleResizeStop = (layout: any[]) => {
    if (!isLayoutEditable) return;
    const nextLayout = layout.map((item) => ({ ...item }));

    if (!layoutsEqual(nextLayout, overviewLayout)) {
      updateOverviewLayout(nextLayout, selectedSiteId);
    }

    isGridInteractingRef.current = false;
    updateSnapGuide({});
  };

  const clearSnapGuide = () => {
    updateSnapGuide({});
  };

  const configWidget = overviewWidgets.find((widget) => widget.id === configWidgetId) || null;
  const builderColorFields: { label: string; value: string; setValue: React.Dispatch<React.SetStateAction<string>> }[] = [
    { label: 'Normal', value: builderNormalColor, setValue: setBuilderNormalColor },
    { label: 'Warning', value: builderWarningColor, setValue: setBuilderWarningColor },
    { label: 'Critical', value: builderCriticalColor, setValue: setBuilderCriticalColor },
    { label: 'No Data', value: builderNoDataColor, setValue: setBuilderNoDataColor },
  ];
  const widgetPresetCategories = Array.from(new Set(WIDGET_PRESET_LIBRARY.map((preset) => preset.category)));

  useEffect(() => {
    if (!configWidget) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConfigWidgetId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [configWidget]);

  const getWidgetDevices = (widget: OverviewWidget) => {
    if (widget.deviceIds?.length) {
      const selectedDeviceIds = new Set(widget.deviceIds);
      return devices.filter((device) => selectedDeviceIds.has(device.id));
    }

    return scopedDevices;
  };

  const getWidgetDataIssue = (
    widget: OverviewWidget,
    targetDevices: Device[],
    metricKey: string,
    hasMetricValues: boolean
  ): WidgetDataIssue | null => {
    if (!metricKey) {
      return {
        title: 'Metric not configured',
        detail: 'Open widget settings and select a metric to display.',
        tone: 'config',
      };
    }

    if (widget.deviceIds?.length && targetDevices.length === 0) {
      return {
        title: 'Bound device missing',
        detail: 'The selected devices no longer exist or are outside this site.',
        tone: 'config',
      };
    }

    if (targetDevices.length === 0) {
      return {
        title: 'No site devices',
        detail: 'Add devices to this Site or bind this widget to specific devices.',
        tone: 'config',
      };
    }

    if (historyMode) {
      return hasMetricValues ? null : {
        title: 'No historical data',
        detail: `No ${metricKey} telemetry exists before the current playback time.`,
        tone: 'noData',
      };
    }

    const qualities = targetDevices.map((device) => getDeviceDataQuality(device, Date.now()));
    const hasLiveData = qualities.some((quality) => quality.hasLiveData);
    if (!hasLiveData) {
      const allNeverReported = qualities.every((quality) => quality.state === 'never_reported');
      const allOffline = qualities.every((quality) => quality.state === 'offline' || quality.state === 'never_reported');
      return {
        title: allNeverReported ? 'Never reported' : allOffline ? 'Device offline' : 'No live data',
        detail: allNeverReported
          ? 'No telemetry has been received from the bound devices yet.'
          : allOffline
            ? 'Bound devices are offline or past the offline timeout.'
            : 'Latest telemetry is stale, so this widget is not using old values.',
        tone: allOffline ? 'offline' : 'noData',
      };
    }

    if (!hasMetricValues) {
      return {
        title: 'Metric has no data',
        detail: `Live telemetry exists, but none contains numeric ${metricKey}.`,
        tone: 'noData',
      };
    }

    return null;
  };

  const renderWidgetDataIssue = (issue: WidgetDataIssue | null) => {
    if (!issue) return null;

    const toneClass = issue.tone === 'config'
      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
      : issue.tone === 'offline'
        ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200';

    return (
      <div className={cn('pointer-events-none absolute inset-x-3 bottom-3 z-20 rounded border px-3 py-2 shadow-sm backdrop-blur', toneClass)}>
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{issue.title}</p>
            <p className="mt-0.5 text-[10px] opacity-80">{issue.detail}</p>
          </div>
        </div>
      </div>
    );
  };

  const getWidgetDefaultTitle = (widget: OverviewWidget) => {
    if (widget.type === 'kpi' && widget.kpiKey) return stats[widget.kpiKey].name;
    if (widget.type === 'trend') return t.overview.realtimeTrend;
    if (widget.type === 'ai') return t.overview.aiCopilot;
    if (widget.type === 'chart') return charts.find((chart) => chart.id === widget.chartId)?.title || 'Chart';

    return 'Widget';
  };

  const getWidgetTitle = (widget: OverviewWidget) => widget.title || getWidgetDefaultTitle(widget);

  const handleWidgetTitleChange = (widget: OverviewWidget, title: string) => {
    updateOverviewWidget(widget.id, { title }, selectedSiteId);
  };

  const handleWidgetDeviceToggle = (widget: OverviewWidget, deviceId: string) => {
    const selectedDeviceIds = new Set(widget.deviceIds || []);

    if (selectedDeviceIds.has(deviceId)) {
      selectedDeviceIds.delete(deviceId);
    } else {
      selectedDeviceIds.add(deviceId);
    }

    updateOverviewWidget(widget.id, { deviceIds: Array.from(selectedDeviceIds) }, selectedSiteId);
  };

  const clearWidgetDevices = (widget: OverviewWidget) => {
    updateOverviewWidget(widget.id, { deviceIds: [] }, selectedSiteId);
  };

  const resetWidgetBuilder = () => {
    setEditingLibraryWidgetId(null);
    setBuilderTitle('New Widget');
    setBuilderDisplayMode('number');
    setBuilderMetricKey(builderMetricOptions[0] || scopedMetricOptions[0] || 'power');
    setBuilderIconId('activity');
    setBuilderDeviceIds([]);
    setBuilderUnit('');
    setBuilderPrecision(1);
    setBuilderThresholdDirection('above');
    setBuilderWarningThreshold('');
    setBuilderCriticalThreshold('');
    setBuilderNormalColor(DEFAULT_WIDGET_COLORS.normal);
    setBuilderWarningColor(DEFAULT_WIDGET_COLORS.warning);
    setBuilderCriticalColor(DEFAULT_WIDGET_COLORS.critical);
    setBuilderNoDataColor(DEFAULT_WIDGET_COLORS.noData);
  };

  const openWidgetBuilder = (widget?: OverviewWidget) => {
    if (widget) {
      setEditingLibraryWidgetId(widget.id);
      setBuilderTitle(widget.title || 'New Widget');
      setBuilderDisplayMode(widget.displayMode || 'number');
      setBuilderMetricKey(widget.metricKey || scopedMetricOptions[0] || 'power');
      setBuilderIconId(widget.iconId || 'activity');
      setBuilderDeviceIds(widget.deviceIds ? [...widget.deviceIds] : []);
      setBuilderUnit(widget.unit || '');
      setBuilderPrecision(getWidgetPrecision(widget));
      setBuilderThresholdDirection(widget.thresholds?.direction || 'above');
      setBuilderWarningThreshold(widget.thresholds?.warning !== undefined ? String(widget.thresholds.warning) : '');
      setBuilderCriticalThreshold(widget.thresholds?.critical !== undefined ? String(widget.thresholds.critical) : '');
      setBuilderNormalColor(widget.colorRules?.normal || DEFAULT_WIDGET_COLORS.normal);
      setBuilderWarningColor(widget.colorRules?.warning || DEFAULT_WIDGET_COLORS.warning);
      setBuilderCriticalColor(widget.colorRules?.critical || DEFAULT_WIDGET_COLORS.critical);
      setBuilderNoDataColor(widget.colorRules?.noData || DEFAULT_WIDGET_COLORS.noData);
    } else {
      resetWidgetBuilder();
    }

    setShowWidgetBuilder(true);
  };

  const toggleBuilderDevice = (deviceId: string) => {
    setBuilderDeviceIds((current) => (
      current.includes(deviceId)
        ? current.filter((id) => id !== deviceId)
        : [...current, deviceId]
    ));
  };

  const saveWidgetBuilder = () => {
    if (!builderMetricKey) return;

    const widget: OverviewWidget = {
      id: editingLibraryWidgetId || createWidgetId('library_widget'),
      type: 'custom',
      title: builderTitle.trim() || 'Untitled Widget',
      displayMode: builderDisplayMode,
      metricKey: builderMetricKey,
      iconId: builderIconId,
      deviceIds: builderDeviceIds,
      unit: builderUnit.trim() || undefined,
      precision: normalizePrecision(builderPrecision),
      thresholds: {
        direction: builderThresholdDirection,
        warning: parseOptionalNumber(builderWarningThreshold),
        critical: parseOptionalNumber(builderCriticalThreshold),
      },
      colorRules: {
        normal: builderNormalColor,
        warning: builderWarningColor,
        critical: builderCriticalColor,
        noData: builderNoDataColor,
      },
    };

    if (editingLibraryWidgetId) {
      updateOverviewWidgetLibraryItem(editingLibraryWidgetId, widget, selectedSiteId);
    } else {
      addOverviewWidgetLibraryItem(widget, selectedSiteId);
    }

    notifySuccess('Widget saved successfully.');
    setShowWidgetBuilder(false);
    resetWidgetBuilder();
  };

  const addPresetWidgetToLibrary = (preset: OverviewWidget & { category: string; description: string }) => {
    const { category: _category, description: _description, id: _presetId, ...widgetPreset } = preset;
    const id = createWidgetId(preset.id);

    addOverviewWidgetLibraryItem({
      ...widgetPreset,
      id,
      title: preset.title || 'Preset Widget',
      colorRules: {
        normal: DEFAULT_WIDGET_COLORS.normal,
        warning: DEFAULT_WIDGET_COLORS.warning,
        critical: DEFAULT_WIDGET_COLORS.critical,
        noData: DEFAULT_WIDGET_COLORS.noData,
        ...preset.colorRules,
      },
      deviceIds: [],
    }, selectedSiteId);
  };

  const getDropGridPosition = (event: React.DragEvent<HTMLDivElement>, width: number) => {
    const dropTarget = dashboardDropRef.current;
    if (!dropTarget) return { x: 0, y: Infinity };

    const rect = dropTarget.getBoundingClientRect();
    const colWidth = (rect.width - (GRID_COLS - 1) * GRID_MARGIN[0]) / GRID_COLS;
    const rawX = (event.clientX - rect.left) / (colWidth + GRID_MARGIN[0]);
    const rawY = (event.clientY - rect.top) / (GRID_ROW_HEIGHT + GRID_MARGIN[1]);

    return {
      x: clamp(Math.floor(rawX), 0, GRID_COLS - width),
      y: Math.max(0, Math.floor(rawY)),
    };
  };

  const addLibraryWidgetToDashboard = (libraryWidgetId: string, position?: { x: number; y: number }) => {
    const libraryWidget = overviewWidgetLibrary.find((widget) => widget.id === libraryWidgetId);
    if (!libraryWidget) return;

    const id = createWidgetId(libraryWidget.id);
    const isChartLike = ['line', 'area', 'bar', 'donut'].includes(libraryWidget.displayMode || '');
    const width = isChartLike ? 5 : 3;
    const height = isChartLike ? 4 : 2;
    const nextPosition = position || { x: 0, y: Infinity };

    addOverviewWidget(
      { ...libraryWidget, id, deviceIds: libraryWidget.deviceIds ? [...libraryWidget.deviceIds] : [] },
      { i: id, x: nextPosition.x, y: nextPosition.y, w: width, h: height, minW: isChartLike ? 3 : 2, minH: 2 },
      selectedSiteId
    );
    setConfigWidgetId(id);
  };

  const handleDashboardDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!draggingLibraryWidgetId) return;

    const libraryWidget = overviewWidgetLibrary.find((widget) => widget.id === draggingLibraryWidgetId);
    const width = ['line', 'area', 'bar', 'donut'].includes(libraryWidget?.displayMode || '') ? 5 : 3;
    const position = getDropGridPosition(event, width);

    addLibraryWidgetToDashboard(draggingLibraryWidgetId, position);
    setDraggingLibraryWidgetId(null);
  };

  const handleSiteSelect = (siteId: string) => {
    setSelectedSiteId(siteId);
    if (siteId !== 'All') setActiveSite(siteId);
    setConfigWidgetId(null);
    setShowWidgetBuilder(false);
  };

  const handleAddChart = (chart: any) => {
    const id = createWidgetId(`chart_${chart.id}`);

    addOverviewWidget(
      { id, type: 'chart', chartId: chart.id, title: chart.title },
      { i: id, x: 0, y: Infinity, w: 4, h: 4, minW: 3, minH: 3 },
      selectedSiteId
    );
    setConfigWidgetId(id);
    setShowWidgetBuilder(false);
  };

  const handleAddKPI = (kpi: { id: string; key: OverviewKpiKey }) => {
    const id = createWidgetId(kpi.id);

    addOverviewWidget(
      { id, type: 'kpi', kpiKey: kpi.key, title: stats[kpi.key].name },
      { i: id, x: 0, y: Infinity, w: 3, h: 2, minW: 2, minH: 2 },
      selectedSiteId
    );
    setConfigWidgetId(id);
    setShowWidgetBuilder(false);
  };

  const handleAddUtilityWidget = (type: 'trend' | 'ai') => {
    const id = createWidgetId(type);
    const title = type === 'trend' ? t.overview.realtimeTrend : t.overview.aiCopilot;

    addOverviewWidget(
      { id, type, title },
      { i: id, x: 0, y: Infinity, w: type === 'trend' ? 5 : 4, h: 5, minW: 3, minH: 3 },
      selectedSiteId
    );
    setConfigWidgetId(id);
    setShowWidgetBuilder(false);
  };

  const renderKPI = (widget: OverviewWidget) => {
    if (!widget.kpiKey) return null;

    const stat = getStatsForDevices(getWidgetDevices(widget))[widget.kpiKey];
    const Icon = stat.icon;

    return (
      <div className="h-full w-full overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col justify-center relative group">
        <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-se-resize pointer-events-none text-slate-400">
          <span className="block h-2 w-2 border-r-2 border-b-2 border-current" />
        </div>
        <div className="absolute top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-move draggable-handle bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 rounded p-1 shadow-lg pointer-events-auto">
          <GripHorizontal className="h-4 w-4" />
        </div>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">{getWidgetTitle(widget)}</p>
            <p className="mt-1 text-2xl xl:text-3xl font-mono font-bold text-slate-900 dark:text-white truncate">{stat.value}</p>
          </div>
          <div className="rounded p-2 text-orange-600 dark:text-orange-500 shrink-0">
            <Icon className="h-5 w-5 xl:h-6 xl:w-6" aria-hidden="true" />
          </div>
        </div>
      </div>
    );
  };

  const renderTrend = (widget: OverviewWidget) => {
    const targetDevices = getWidgetDevices(widget);
    const widgetTrendData = getHistoryTrendData(targetDevices, 'power');

    return (
    <div className="h-full w-full overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col group relative">
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1c2128] px-4 py-3 shrink-0 flex justify-between items-center cursor-move draggable-handle">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-2">
           <GripHorizontal className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
           {getWidgetTitle(widget)}
        </h3>
      </div>
      <div className="p-4 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={widgetTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ea580c" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#ea580c" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cartesianGridStroke} />
            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontFamily: 'monospace'}} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontFamily: 'monospace'}} />
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: `1px solid ${tooltipBorder}`, backgroundColor: tooltipBg, color: tooltipColor }}
              labelStyle={{ color: '#64748b', marginBottom: '4px' }}
            />
            <Area type="monotone" dataKey="value" stroke="#ea580c" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" name={t.overview.current} />
            <Area type="monotone" dataKey="baseline" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fill="none" name={t.overview.baseline} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
    );
  };

  const renderAI = (widget: OverviewWidget) => {
    const targetDevices = getWidgetDevices(widget);
    const targetAlerts = getAlertsForDevices(targetDevices);
    const primaryAlert = targetAlerts.find((alert) => alert.status === 'active') || targetAlerts[0];
    const highPowerDevice = [...targetDevices].sort((first, second) => (Number(second.metrics?.power) || 0) - (Number(first.metrics?.power) || 0))[0];
    const suggestion = highPowerDevice
      ? `${highPowerDevice.name} is currently drawing ${Number(highPowerDevice.metrics?.power || 0).toFixed(0)} W. Review schedule or load profile before peak tariff hours.`
      : 'No energy optimization suggestion is available until telemetry reports power or energy metrics.';

    return (
    <div className="h-full w-full overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 border-l-4 border-l-orange-500 shadow-sm flex flex-col group relative">
      <div className="p-3 shrink-0 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/50 cursor-move draggable-handle">
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
          <div className="w-5 h-5 bg-orange-500 rounded-sm flex items-center justify-center">
            <BrainCircuit className="h-3 w-3 text-white" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{getWidgetTitle(widget)}</h3>
        </div>
      </div>
      <div className="p-3 space-y-3 text-sm text-slate-600 dark:text-slate-300 overflow-y-auto min-h-0 flex-1">
        <div className="rounded bg-slate-50 dark:bg-slate-900/50 p-3 border border-slate-200 dark:border-slate-800/50">
          <div className="flex flex-col">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">{t.overview.anomaly}</p>
            <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">{primaryAlert ? primaryAlert.message : 'No telemetry anomalies detected for the selected dashboard scope.'}</p>
            <button type="button" className="mt-2 text-left text-[10px] font-bold text-orange-600 dark:text-orange-500 hover:text-orange-700 dark:hover:text-orange-400 uppercase tracking-tight truncate">{t.overview.viewDetails} &rarr;</button>
          </div>
        </div>
        
        <div className="rounded bg-slate-50 dark:bg-slate-900/50 p-3 border border-slate-200 dark:border-slate-800/50">
          <div className="flex flex-col">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">{t.overview.savings}</p>
            <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">{suggestion}</p>
            <button type="button" className="mt-2 text-[10px] text-left font-bold text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400 uppercase tracking-tight truncate">{t.overview.applyWorkflow} &rarr;</button>
          </div>
        </div>
      </div>
    </div>
    );
  };

  const renderAnalyticChart = (widgetConfig: OverviewWidget) => {
    const chartConf = charts.find(c => c.id === widgetConfig.chartId);
    if (!chartConf) return <div className="p-4 text-xs text-slate-500 border rounded-lg h-full overflow-hidden">Chart not found</div>;
    const chartDevices = getWidgetDevices(widgetConfig);
    const metricBySource: Record<string, string> = {
      energy: 'energy',
      solar: 'energy_today',
      coldStorage: 'temperature',
      waterPump: 'pressure',
      airCompressor: 'pressure',
    };
    const chartMetric = chartConf.metricKey || metricBySource[chartConf.dataSource];
    const chartHistoryData = historyMode && chartConf.type === 'line' && chartMetric
      ? getHistoryTrendData(chartDevices, chartMetric).map((point) => ({ name: point.time, A: point.value, value: point.value }))
      : undefined;

    return (
      <div className="h-full w-full overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col group relative">
        {false && (
        <button 
          onClick={async () => {
            if (await confirmDelete({ title: 'Remove dashboard widget', itemName: getWidgetTitle(widgetConfig), description: 'The widget will be removed from this site dashboard.' })) removeOverviewWidget(widgetConfig.id, selectedSiteId);
          }}
          className="absolute top-3 right-3 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10 block cursor-pointer"
        >
          ×
        </button>
        )}
        <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1c2128] px-4 py-3 shrink-0 flex justify-between items-center cursor-move draggable-handle">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-2 truncate pr-6">
            <GripHorizontal className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
            {getWidgetTitle(widgetConfig)}
          </h3>
        </div>
        <div className="p-4 flex-1 min-h-0">
          <ChartRenderer chartConf={chartConf} theme={theme} devices={chartDevices} dataOverride={chartHistoryData} />
        </div>
      </div>
    );
  };

  const renderCustomWidget = (widget: OverviewWidget) => {
    const targetDevices = getWidgetDevices(widget);
    const metricKey = widget.metricKey || '';
    const title = getWidgetTitle(widget);
    const Icon = IOT_ICONS[widget.iconId || 'activity'] || Activity;
    const displayMode = widget.displayMode || 'number';
    const hasMetricValues = targetDevices.some((device) => Number.isFinite(Number(device.metrics?.[metricKey])));
    const dataIssue = getWidgetDataIssue(widget, targetDevices, metricKey, hasMetricValues);
    const value = hasMetricValues ? sumMetric(targetDevices, metricKey) : Number.NaN;
    const averageValue = hasMetricValues ? averageMetric(targetDevices, metricKey) : Number.NaN;
    const displayValue = displayMode === 'number' || displayMode === 'bar' || displayMode === 'donut' ? value : averageValue;
    const ruleState = getWidgetRuleState(displayValue, widget);
    const ruleColor = getWidgetRuleColor(widget, ruleState);
    const trendData = getHistoryTrendData(targetDevices, metricKey);
    const deviceMetricData = targetDevices
      .map((device) => ({
        name: device.name,
        value: Number(device.metrics?.[metricKey]),
      }))
      .filter((item) => Number.isFinite(item.value));
    const chartData = deviceMetricData.length ? deviceMetricData : [{ name: metricKey, value: Number.isFinite(value) ? value : 0 }];
    const statusValue = Number.isFinite(averageValue) ? averageValue : value;
    const statusState = getWidgetRuleState(statusValue, widget);
    const statusLevel = statusState === 'critical' ? 'Critical' : statusState === 'warning' ? 'Warning' : statusState === 'normal' ? 'Normal' : 'No Data';
    const statusColor = getWidgetRuleColor(widget, statusState);
    const hasGaugeValue = Number.isFinite(averageValue) || Number.isFinite(value);
    const gaugeValue = hasGaugeValue ? Math.max(0, Math.min(100, averageValue || value)) : 0;

    if (displayMode === 'line' || displayMode === 'area') {
      return (
        <div className="h-full w-full overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col group relative">
          <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1c2128] px-4 py-3 shrink-0 flex justify-between items-center cursor-move draggable-handle">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-2 truncate">
              <GripHorizontal className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
              <Icon className="h-4 w-4 text-orange-500 shrink-0" />
              {title}
            </h3>
          </div>
          <div className="p-4 flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cartesianGridStroke} />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontFamily: 'monospace'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontFamily: 'monospace'}} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: `1px solid ${tooltipBorder}`, backgroundColor: tooltipBg, color: tooltipColor }} />
                <Area type="monotone" dataKey="value" stroke={ruleColor} strokeWidth={2} fill={ruleColor} fillOpacity={displayMode === 'area' ? 0.24 : 0} name={metricKey} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {renderWidgetDataIssue(dataIssue)}
        </div>
      );
    }

    if (displayMode === 'bar') {
      return (
        <div className="h-full w-full overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col group relative">
          <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1c2128] px-4 py-3 shrink-0 flex justify-between items-center cursor-move draggable-handle">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-2 truncate">
              <GripHorizontal className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
              <Icon className="h-4 w-4 text-orange-500 shrink-0" />
              {title}
            </h3>
          </div>
          <div className="p-4 flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cartesianGridStroke} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontFamily: 'monospace'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10, fontFamily: 'monospace'}} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: `1px solid ${tooltipBorder}`, backgroundColor: tooltipBg, color: tooltipColor }} />
                <Bar dataKey="value" fill={ruleColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {renderWidgetDataIssue(dataIssue)}
        </div>
      );
    }

    if (displayMode === 'donut') {
      return (
        <div className="h-full w-full overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col group relative">
          <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1c2128] px-4 py-3 shrink-0 flex justify-between items-center cursor-move draggable-handle">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-2 truncate">
              <GripHorizontal className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
              <Icon className="h-4 w-4 text-orange-500 shrink-0" />
              {title}
            </h3>
          </div>
          <div className="p-4 flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2}>
                  {chartData.map((entry, index) => (
                    <Cell key={entry.name} fill={index === 0 ? ruleColor : ['#3b82f6', '#10b981', '#64748b', '#8b5cf6'][index % 4]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: `1px solid ${tooltipBorder}`, backgroundColor: tooltipBg, color: tooltipColor }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {renderWidgetDataIssue(dataIssue)}
        </div>
      );
    }

    if (displayMode === 'gauge') {
      return (
        <div className="h-full w-full overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col justify-center relative group">
          <div className="absolute top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-move draggable-handle bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 rounded p-1 shadow-lg pointer-events-auto">
            <GripHorizontal className="h-4 w-4" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">{title}</p>
              <p className="text-2xl font-mono font-bold text-slate-900 dark:text-white">{formatWidgetValue(hasGaugeValue ? gaugeValue : Number.NaN, widget)}</p>
              <p className="mt-1 truncate text-[10px] font-mono text-slate-400">{metricKey}</p>
            </div>
            <div className="relative h-20 w-20 shrink-0 rounded-full" style={{ background: `conic-gradient(${ruleColor} ${gaugeValue * 3.6}deg, ${isDark ? '#334155' : '#e2e8f0'} 0deg)` }}>
              <div className="absolute inset-3 rounded-full bg-white dark:bg-[#1c2128] flex items-center justify-center">
                <Icon className="h-5 w-5" style={{ color: ruleColor }} />
              </div>
            </div>
          </div>
          {renderWidgetDataIssue(dataIssue)}
        </div>
      );
    }

    if (displayMode === 'status') {
      return (
        <div className="h-full w-full overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col justify-center relative group">
          <div className="absolute top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-move draggable-handle bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 rounded p-1 shadow-lg pointer-events-auto">
            <GripHorizontal className="h-4 w-4" />
          </div>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">{title}</p>
              <p className="mt-1 truncate text-2xl font-mono font-bold" style={{ color: statusColor }}>{statusLevel}</p>
              <p className="mt-1 truncate text-[10px] font-mono text-slate-400">{metricKey}: {formatWidgetValue(statusValue, widget)}</p>
            </div>
            <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: statusColor }} />
          </div>
          {renderWidgetDataIssue(dataIssue)}
        </div>
      );
    }

    return (
      <div className="h-full w-full overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col justify-center relative group">
        <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-se-resize pointer-events-none text-slate-400">
          <span className="block h-2 w-2 border-r-2 border-b-2 border-current" />
        </div>
        <div className="absolute top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-move draggable-handle bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 rounded p-1 shadow-lg pointer-events-auto">
          <GripHorizontal className="h-4 w-4" />
        </div>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">{title}</p>
            <p className="mt-1 truncate text-2xl font-mono font-bold xl:text-3xl" style={{ color: ruleColor }}>{formatWidgetValue(value, widget)}</p>
            <p className="mt-1 truncate text-[10px] font-mono text-slate-400">{metricKey}</p>
          </div>
          <div className="shrink-0 rounded p-2" style={{ color: ruleColor }}>
            <Icon className="h-5 w-5 xl:h-6 xl:w-6" aria-hidden="true" />
          </div>
        </div>
        {renderWidgetDataIssue(dataIssue)}
      </div>
    );
  };

  const renderWidgetBody = (widget: OverviewWidget) => {
    if (widget.type === 'kpi') return renderKPI(widget);
    if (widget.type === 'trend') return renderTrend(widget);
    if (widget.type === 'ai') return renderAI(widget);
    if (widget.type === 'chart') return renderAnalyticChart(widget);
    if (widget.type === 'custom') return renderCustomWidget(widget);

    return null;
  };

  const renderHistoryDateTimePicker = (kind: 'from' | 'to', label: string, value: string) => {
    const selectedDateKey = getDatePart(value);
    const monthLabel = datePickerMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const monthStart = new Date(datePickerMonth.getFullYear(), datePickerMonth.getMonth(), 1);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());
    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });

    return (
      <div className="relative space-y-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_84px] gap-2">
          <button
            type="button"
            onClick={() => openDatePicker(kind)}
            className="inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded border border-slate-300 bg-white px-3 text-left text-sm normal-case tracking-normal text-slate-900 outline-none hover:border-orange-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <span className="truncate">{selectedDateKey}</span>
            <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
          <input
            type="time"
            value={getTimePart(value)}
            onChange={(event) => updateHistoryTime(kind, event.target.value)}
            className="h-9 rounded border border-slate-300 bg-white px-2 text-sm normal-case tracking-normal text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        {activeDatePicker === kind && (
          <div className="absolute left-0 top-full z-[80] mt-2 w-[316px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-950">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setDatePickerMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-sm font-semibold normal-case tracking-normal text-slate-900 dark:text-white">{monthLabel}</div>
              <button
                type="button"
                onClick={() => setDatePickerMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-slate-400">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((weekday) => <div key={weekday}>{weekday}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {days.map((date) => {
                const dateKey = getLocalDateKey(date);
                const inMonth = date.getMonth() === datePickerMonth.getMonth();
                const selected = dateKey === selectedDateKey;
                const hasData = telemetryDataDaySet.has(dateKey);
                const count = telemetryDataCountByDay[dateKey] || 0;

                return (
                  <button
                    key={dateKey}
                    type="button"
                    title={hasData ? `${count} telemetry messages` : 'No telemetry messages'}
                    onClick={() => updateHistoryDate(kind, dateKey)}
                    className={cn(
                      "relative flex h-9 items-center justify-center rounded text-sm font-medium normal-case tracking-normal transition-colors",
                      inMonth ? "text-slate-700 dark:text-slate-200" : "text-slate-300 dark:text-slate-700",
                      selected
                        ? "bg-orange-600 text-white hover:bg-orange-500"
                        : "hover:bg-slate-100 dark:hover:bg-slate-900"
                    )}
                  >
                    {date.getDate()}
                    {hasData && (
                      <span className={cn(
                        "absolute bottom-1.5 h-1.5 w-1.5 rounded-full",
                        selected ? "bg-white" : "bg-orange-500"
                      )} />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] normal-case tracking-normal text-slate-500 dark:border-slate-800">
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-orange-500" /> telemetry data</span>
              {telemetryDataDaysError ? <span className="text-red-500">{telemetryDataDaysError}</span> : <span>{telemetryDataDays.length} active days</span>}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t.overview.title}</h1>
          <div className="mt-2 flex max-w-full items-center gap-2 overflow-x-auto pb-1">
            {siteFilters.map((site) => (
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

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setLayoutEditMode((value) => !value);
              clearSnapGuide();
            }}
            disabled={!isDesktopGrid}
            className={cn(
              "inline-flex h-9 items-center gap-x-2 rounded border px-3 text-sm font-semibold shadow-sm transition-colors",
              layoutEditMode && isDesktopGrid
                ? "border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-500"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#1c2128] dark:text-slate-300 dark:hover:bg-slate-800/80",
              !isDesktopGrid && "cursor-not-allowed opacity-50"
            )}
            title={isDesktopGrid ? "Enable layout editing" : "Layout editing is available on PC view"}
          >
            <SlidersHorizontal className="-ml-0.5 h-4 w-4" aria-hidden="true" />
            {layoutEditMode && isDesktopGrid ? 'Lock Layout' : 'Edit Layout'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (showWidgetBuilder) {
                setShowWidgetBuilder(false);
                resetWidgetBuilder();
                return;
              }

              openWidgetBuilder();
            }}
            className={cn(
              "inline-flex h-9 items-center gap-x-2 rounded border px-3 text-sm font-semibold shadow-sm transition-colors",
              showWidgetBuilder
                ? "border-orange-500 bg-orange-600 text-white hover:bg-orange-500"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#1c2128] dark:text-slate-300 dark:hover:bg-slate-800/80"
            )}
          >
            <Plus className="-ml-0.5 h-4 w-4" aria-hidden="true" />
            Add Widget
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-[#1c2128]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[220px_220px_auto_auto] xl:items-end">
            {renderHistoryDateTimePicker('from', 'From', historyFrom)}
            {renderHistoryDateTimePicker('to', 'To', historyTo)}
            <button
              type="button"
              onClick={loadHistoryRange}
              disabled={historyLoading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <History className="h-4 w-4 text-orange-500" />
              {historyLoading ? 'Loading...' : 'Load Range'}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setHistoryPlaying((value) => !value)}
                disabled={!historyMode || !historyRangeValid}
                className={cn(
                  "inline-flex h-9 flex-1 items-center justify-center gap-2 rounded px-3 text-sm font-semibold shadow-sm transition-colors",
                  historyPlaying
                    ? "bg-amber-600 text-white hover:bg-amber-500"
                    : "bg-orange-600 text-white hover:bg-orange-500",
                  (!historyMode || !historyRangeValid) && "cursor-not-allowed opacity-50"
                )}
              >
                {historyPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {historyPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                onClick={returnToLive}
                disabled={!historyMode}
                className="inline-flex h-9 items-center justify-center rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-w-0 xl:w-[360px]">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 font-semibold uppercase tracking-wider",
                historyMode
                  ? "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
              )}>
                {historyMode ? 'Historical Playback' : 'Live'}
              </span>
              <span className="truncate font-mono text-slate-500 dark:text-slate-400">{historyCursorLabel}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className={cn("h-full rounded-full transition-all", historyMode ? "bg-orange-500" : "bg-emerald-500")}
                style={{ width: historyMode ? `${historyProgress}%` : '100%' }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] font-mono text-slate-400">
              <span>{historyMode ? `${historyMessages.length} site messages` : 'Realtime telemetry'}</span>
              {historyMode && <span>{historyPlaying ? 'Playing' : 'Paused'}</span>}
            </div>
          </div>
        </div>
        {historyError && (
          <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {historyError}
          </div>
        )}
      </div>

      {selectedSiteId !== 'All' && scopedDevices.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">No devices in this Site</p>
                <p className="mt-0.5 text-xs opacity-80">Widgets can be added now, but live values will show configuration or no-data states until devices are assigned to this Site.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openWidgetBuilder()}
              className="inline-flex h-8 items-center justify-center gap-2 rounded border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-slate-950 dark:text-amber-200 dark:hover:bg-amber-500/10"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Widget
            </button>
          </div>
        </div>
      )}

      {showWidgetBuilder && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1c2128] p-4 shadow-sm">
          <div className="grid gap-4 xl:grid-cols-[minmax(220px,320px)_180px_180px_1fr_auto] xl:items-end">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Widget title</label>
              <input
                value={builderTitle}
                onChange={(event) => setBuilderTitle(event.target.value)}
                className="mt-1 h-10 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Display</label>
              <select
                value={builderDisplayMode}
                onChange={(event) => setBuilderDisplayMode(event.target.value as WidgetDisplayMode)}
                className="mt-1 h-10 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              >
                {WIDGET_DISPLAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Metric</label>
              <select
                value={builderMetricKey}
                onChange={(event) => setBuilderMetricKey(event.target.value)}
                disabled={builderMetricOptions.length === 0}
                className="mt-1 h-10 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              >
                {builderMetricOptions.length > 0 ? (
                  builderMetricOptions.map((metric) => (
                    <option key={metric} value={metric}>{metric}</option>
                  ))
                ) : (
                  <option value="">No metrics available</option>
                )}
              </select>
              <p className="mt-1 truncate text-[10px] text-slate-500 dark:text-slate-400">
                {builderDeviceIds.length > 0 ? 'Metrics from bound devices' : 'Metrics from current site devices'}
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Bound devices</label>
              <div className="mt-1 flex min-h-10 flex-wrap items-center gap-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
                {builderDeviceIds.map((deviceId) => {
                  const device = devices.find((item) => item.id === deviceId);
                  return (
                    <button
                      key={deviceId}
                      type="button"
                      onClick={() => toggleBuilderDevice(deviceId)}
                      className="inline-flex max-w-[160px] items-center gap-1 rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300"
                    >
                      <span className="truncate">{device?.name || deviceId}</span>
                      <X className="h-3 w-3 shrink-0" />
                    </button>
                  );
                })}
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value) toggleBuilderDevice(event.target.value);
                  }}
                  className="h-7 min-w-[150px] flex-1 bg-transparent text-xs text-slate-700 outline-none dark:text-slate-300"
                >
                  <option value="">Add device...</option>
                  {scopedDevices.filter((device) => !builderDeviceIds.includes(device.id)).map((device) => (
                    <option key={device.id} value={device.id}>{device.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Icon</label>
                <select
                  value={builderIconId}
                  onChange={(event) => setBuilderIconId(event.target.value)}
                  className="mt-1 h-10 w-32 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                >
                  {Object.keys(IOT_ICONS).map((iconId) => (
                    <option key={iconId} value={iconId}>{iconId}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={saveWidgetBuilder}
                disabled={builderMetricOptions.length === 0}
                className="inline-flex h-10 items-center gap-1.5 rounded bg-orange-600 px-3 text-sm font-semibold text-white hover:bg-orange-500"
              >
                <Save className="h-4 w-4" />
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowWidgetBuilder(false);
                  resetWidgetBuilder();
                }}
                className="inline-flex h-10 items-center justify-center rounded border border-slate-300 dark:border-slate-700 px-3 text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[120px_110px_130px_1fr]">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Unit</label>
              <input
                value={builderUnit}
                onChange={(event) => setBuilderUnit(event.target.value)}
                placeholder="kWh, bar, deg C"
                className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Precision</label>
              <input
                type="number"
                min={0}
                max={6}
                value={builderPrecision}
                onChange={(event) => setBuilderPrecision(Number(event.target.value))}
                className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Threshold</label>
              <select
                value={builderThresholdDirection}
                onChange={(event) => setBuilderThresholdDirection(event.target.value as 'above' | 'below')}
                className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="above">Above is bad</option>
                <option value="below">Below is bad</option>
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Warning value</label>
                <input
                  type="number"
                  value={builderWarningThreshold}
                  onChange={(event) => setBuilderWarningThreshold(event.target.value)}
                  className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Critical value</label>
                <input
                  type="number"
                  value={builderCriticalThreshold}
                  onChange={(event) => setBuilderCriticalThreshold(event.target.value)}
                  className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {builderColorFields.map((field) => (
              <label key={field.label} className="flex items-center justify-between gap-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                <span>{field.label}</span>
                <input
                  type="color"
                  value={field.value}
                  onChange={(event) => field.setValue(event.target.value)}
                  className="h-7 w-10 rounded border border-slate-300 bg-transparent p-0 dark:border-slate-700"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {showWidgetBuilder && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#1c2128]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Widget Preset Library</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">Add presets to the available widget shelf</span>
            </div>
            <div className="space-y-4">
              {widgetPresetCategories.map((category) => (
                <div key={category}>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{category}</div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {WIDGET_PRESET_LIBRARY.filter((preset) => preset.category === category).map((preset) => {
                      const Icon = IOT_ICONS[preset.iconId || 'activity'] || Activity;
                      return (
                        <div key={preset.id} className="flex min-w-0 items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                          <div className="flex min-w-0 gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-orange-500/10 text-orange-500">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{preset.title}</div>
                              <div className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{preset.description}</div>
                              <div className="mt-2 truncate text-[10px] uppercase tracking-wider text-slate-400">
                                {getDisplayModeLabel(preset.displayMode)} / {preset.metricKey} {preset.unit ? `/ ${preset.unit}` : ''}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => addPresetWidgetToLibrary(preset)}
                            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1c2128] p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Available Widgets</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">Drag a widget into the dashboard below</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {overviewWidgetLibrary.map((widget) => {
                const Icon = IOT_ICONS[widget.iconId || 'activity'] || Activity;
                return (
                  <div
                    key={widget.id}
                    draggable
                    onDragStart={() => setDraggingLibraryWidgetId(widget.id)}
                    onDragEnd={() => setDraggingLibraryWidgetId(null)}
                    className="flex min-w-[220px] cursor-grab items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-3 py-2 active:cursor-grabbing"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-orange-500" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{widget.title}</div>
                        <div className="truncate text-[10px] uppercase tracking-wider text-slate-400">{getDisplayModeLabel(widget.displayMode)} / {widget.metricKey}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => openWidgetBuilder(widget)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (await confirmDelete({ title: 'Delete widget preset', itemName: widget.title || 'this widget preset', description: 'The widget will be removed from the available widget library.' })) removeOverviewWidgetLibraryItem(widget.id, selectedSiteId);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {overviewWidgetLibrary.length === 0 && (
                <div className="text-sm text-slate-500 dark:text-slate-400">No available widgets yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {configWidget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Widget configuration"
          onClick={() => setConfigWidgetId(null)}
        >
          <div
            className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-orange-200 bg-white p-4 shadow-2xl dark:border-orange-500/30 dark:bg-[#1c2128]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Widget Configuration</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{getWidgetTitle(configWidget)}</p>
              </div>
              <button
                type="button"
                onClick={() => setConfigWidgetId(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded border border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Close widget configuration"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(220px,360px)_1fr] xl:items-start">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Widget title</label>
              <input
                value={getWidgetTitle(configWidget)}
                onChange={(event) => handleWidgetTitleChange(configWidget, event.target.value)}
                className="mt-1 h-10 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Bound devices</label>
                <button
                  type="button"
                  onClick={() => clearWidgetDevices(configWidget)}
                  className="text-xs font-medium text-orange-600 hover:text-orange-500 dark:text-orange-400"
                >
                  Use current site
                </button>
              </div>
              <div className="mt-2 grid max-h-32 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                {scopedDevices.map((device) => (
                  <label
                    key={device.id}
                    className="flex min-w-0 items-center gap-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-300"
                  >
                    <input
                      type="checkbox"
                      checked={configWidget.deviceIds?.includes(device.id) || false}
                      onChange={() => handleWidgetDeviceToggle(configWidget, device.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span className="truncate">{device.name}</span>
                  </label>
                ))}
                {scopedDevices.length === 0 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">No devices under this site.</div>
                )}
              </div>
            </div>
          </div>
          {configWidget.type === 'custom' && (
            <div className="mt-4 space-y-3 border-t border-orange-100 pt-4 dark:border-orange-500/20">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Unit</label>
                  <input
                    value={configWidget.unit || ''}
                    onChange={(event) => updateOverviewWidget(configWidget.id, { unit: event.target.value.trim() || undefined }, selectedSiteId)}
                    className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Precision</label>
                  <input
                    type="number"
                    min={0}
                    max={6}
                    value={getWidgetPrecision(configWidget)}
                    onChange={(event) => updateOverviewWidget(configWidget.id, { precision: normalizePrecision(Number(event.target.value)) }, selectedSiteId)}
                    className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Threshold</label>
                  <select
                    value={configWidget.thresholds?.direction || 'above'}
                    onChange={(event) => updateOverviewWidget(configWidget.id, { thresholds: { ...configWidget.thresholds, direction: event.target.value as 'above' | 'below' } }, selectedSiteId)}
                    className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="above">Above is bad</option>
                    <option value="below">Below is bad</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Warning</label>
                  <input
                    type="number"
                    value={configWidget.thresholds?.warning ?? ''}
                    onChange={(event) => updateOverviewWidget(configWidget.id, { thresholds: { ...configWidget.thresholds, warning: parseOptionalNumber(event.target.value) } }, selectedSiteId)}
                    className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Critical</label>
                  <input
                    type="number"
                    value={configWidget.thresholds?.critical ?? ''}
                    onChange={(event) => updateOverviewWidget(configWidget.id, { thresholds: { ...configWidget.thresholds, critical: parseOptionalNumber(event.target.value) } }, selectedSiteId)}
                    className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {([
                  ['Normal', 'normal'],
                  ['Warning', 'warning'],
                  ['Critical', 'critical'],
                  ['No Data', 'noData'],
                ] as const).map(([label, key]) => (
                  <label key={key} className="flex items-center justify-between gap-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                    <span>{label}</span>
                    <input
                      type="color"
                      value={configWidget.colorRules?.[key] || DEFAULT_WIDGET_COLORS[key]}
                      onChange={(event) => updateOverviewWidget(configWidget.id, { colorRules: { ...configWidget.colorRules, [key]: event.target.value } }, selectedSiteId)}
                      className="h-7 w-10 rounded border border-slate-300 bg-transparent p-0 dark:border-slate-700"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      <div
        ref={dashboardDropRef}
        className="-mx-4 pb-[100px] relative"
        onDragOver={(event) => {
          if (draggingLibraryWidgetId) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          handleDashboardDrop(event);
        }}
      >
        <div className="pointer-events-none absolute inset-x-4 top-0 z-20">
          {activeSnapGuide.x !== undefined && (
            <div
              className="overview-snap-line overview-snap-line-vertical"
              style={{ left: `calc(${activeSnapGuide.x} * (100% - ${(GRID_COLS - 1) * GRID_MARGIN[0]}px) / ${GRID_COLS} + ${activeSnapGuide.x * GRID_MARGIN[0]}px)` }}
            />
          )}
          {activeSnapGuide.y !== undefined && (
            <div
              className="overview-snap-line overview-snap-line-horizontal"
              style={{ top: `${activeSnapGuide.y * (GRID_ROW_HEIGHT + GRID_MARGIN[1])}px` }}
            />
          )}
        </div>
        {overviewWidgets.length === 0 ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-[#1c2128]">
            <div className="max-w-md">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
                <LayoutDashboard className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900 dark:text-white">No widgets in this dashboard</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Add widgets from the builder or drag available widgets here. New widgets can bind to Site devices and metrics.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => openWidgetBuilder()}
                  className="inline-flex h-9 items-center gap-2 rounded bg-orange-600 px-3 text-sm font-semibold text-white hover:bg-orange-500"
                >
                  <Plus className="h-4 w-4" />
                  Add Widget
                </button>
                {overviewWidgetLibrary.length > 0 && (
                  <span className="inline-flex h-9 items-center rounded border border-slate-300 px-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {overviewWidgetLibrary.length} available widgets
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <ResponsiveGridLayout
            className={cn("layout", !isLayoutEditable && "overview-readonly-layout", !isDesktopGrid && "overview-mobile-layout")}
            layouts={gridLayouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={GRID_COLS_BY_BREAKPOINT}
            rowHeight={GRID_ROW_HEIGHT}
            onBreakpointChange={(breakpoint) => {
              setCurrentBreakpoint((breakpoint as keyof typeof GRID_COLS_BY_BREAKPOINT) || 'lg');
              clearSnapGuide();
            }}
            onLayoutChange={onLayoutChange}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragStop={handleDragStop}
            onResizeStart={handleResizeStart}
            onResizeStop={handleResizeStop}
            {...({ draggableHandle: ".draggable-handle" } as any)}
            isResizable={isLayoutEditable}
            isDraggable={isLayoutEditable}
            resizeHandles={['se']}
            preventCollision={true}
            compactType={null}
            margin={GRID_MARGIN}
          >
            {overviewWidgets.map(widget => (
              <div key={widget.id} className="relative">
                <div className="absolute right-2 top-2 z-30 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setConfigWidgetId(widget.id)}
                    className={cn(
                      "inline-flex h-7 w-7 items-center justify-center rounded border shadow-sm",
                      configWidgetId === widget.id
                        ? "border-orange-500 bg-orange-500 text-white"
                        : "border-slate-200 bg-white text-slate-500 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                    )}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!(await confirmDelete({ title: 'Remove dashboard widget', itemName: getWidgetTitle(widget), description: 'The widget will be removed from this site dashboard.' }))) return;
                      removeOverviewWidget(widget.id, selectedSiteId);
                      if (configWidgetId === widget.id) setConfigWidgetId(null);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-red-500/50 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {renderWidgetBody(widget)}
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>

    </div>
  );
}
