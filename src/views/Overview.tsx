import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Server, Zap, AlertTriangle, BrainCircuit, Plus, GripHorizontal, Save, Pencil, Trash2, X, Sun, BatteryCharging, Thermometer, Droplets, DoorOpen, Gauge, Waves, Timer, Wind, SlidersHorizontal, LayoutGrid } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { mockEnergyTrends, mockAlerts } from '../lib/mockData';
import { useAppStore } from '../lib/store';
import type { DashboardTemplate, OverviewKpiKey, OverviewWidget } from '../lib/store';
import { translations } from '../lib/i18n';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import { ChartRenderer } from '../components/ChartRenderer';
import { cn } from '../lib/utils';
import { IOT_ICONS } from '../lib/icons';

const ResponsiveGridLayout = WidthProvider(Responsive);
const GRID_COLS = 12;
const GRID_ROW_HEIGHT = 80;
const GRID_MARGIN: [number, number] = [16, 16];
const SNAP_THRESHOLD = 1;

type SnapGuide = {
  x?: number;
  y?: number;
};

type WidgetDisplayMode = NonNullable<OverviewWidget['displayMode']>;

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

const getTagTemplateId = (tag: string) => {
  const normalizedTag = tag.toLowerCase();

  if (normalizedTag.includes('solar')) return 'solar-monitoring';
  if (normalizedTag.includes('cold')) return 'cold-storage';
  if (normalizedTag.includes('pump')) return 'water-pump';
  if (normalizedTag.includes('compressor')) return 'air-compressor';

  return 'factory-energy';
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

export function Overview() {
  const {
    language,
    theme,
    devices,
    charts,
    overviewWidgets,
    overviewWidgetLibrary,
    overviewLayout,
    dashboardTemplates,
    activeDashboardTemplateId,
    tagDashboardTemplateMap,
    addOverviewWidget,
    removeOverviewWidget,
    updateOverviewWidget,
    updateOverviewLayout,
    updateOverviewWidgets,
    addOverviewWidgetLibraryItem,
    updateOverviewWidgetLibraryItem,
    removeOverviewWidgetLibraryItem,
    applyDashboardTemplate,
    setTagDashboardTemplate,
    addDashboardTemplate,
    updateDashboardTemplate,
    deleteDashboardTemplate,
  } = useAppStore();
  const t = translations[language];
  const [showWidgetBuilder, setShowWidgetBuilder] = useState(false);
  const [activeSnapGuide, setActiveSnapGuide] = useState<SnapGuide>({});
  const [templateEditorMode, setTemplateEditorMode] = useState<'new' | 'edit' | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null);
  const [editingLibraryWidgetId, setEditingLibraryWidgetId] = useState<string | null>(null);
  const [draggingLibraryWidgetId, setDraggingLibraryWidgetId] = useState<string | null>(null);
  const [builderTitle, setBuilderTitle] = useState('New Widget');
  const [builderDisplayMode, setBuilderDisplayMode] = useState<WidgetDisplayMode>('number');
  const [builderMetricKey, setBuilderMetricKey] = useState('power');
  const [builderIconId, setBuilderIconId] = useState('activity');
  const [builderDeviceIds, setBuilderDeviceIds] = useState<string[]>([]);
  const isTemplateEditing = templateEditorMode !== null;
  const dashboardDropRef = useRef<HTMLDivElement | null>(null);
  const isGridInteractingRef = useRef(false);

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
    lg: overviewLayout.map((item) => ({ ...item })),
  }), [overviewLayout]);

  const availableTags = useMemo(() => {
    return ['All', ...Array.from(new Set(devices.flatMap((device) => device.tags || [])))].filter(Boolean);
  }, [devices]);

  const taggedDevices = useMemo(() => {
    return selectedTag === 'All'
      ? devices
      : devices.filter((device) => device.tags?.includes(selectedTag));
  }, [devices, selectedTag]);

  const taggedDeviceIds = useMemo(() => new Set(taggedDevices.map((device) => device.id)), [taggedDevices]);
  const taggedAlerts = useMemo(() => {
    return selectedTag === 'All'
      ? mockAlerts
      : mockAlerts.filter((alert) => taggedDeviceIds.has(alert.deviceId));
  }, [selectedTag, taggedDeviceIds]);

  const tagMetricOptions = useMemo(() => {
    const metrics = new Set<string>();
    taggedDevices.forEach((device) => {
      Object.keys(device.metrics || {}).forEach((metric) => metrics.add(metric));
    });

    return Array.from(metrics).sort();
  }, [taggedDevices]);

  const builderDevices = useMemo(() => {
    if (builderDeviceIds.length === 0) return taggedDevices;

    const selectedDeviceIds = new Set(builderDeviceIds);
    return devices.filter((device) => selectedDeviceIds.has(device.id));
  }, [builderDeviceIds, devices, taggedDevices]);

  const builderMetricOptions = useMemo(() => {
    const metrics = new Set<string>();
    builderDevices.forEach((device) => {
      Object.keys(device.metrics || {}).forEach((metric) => metrics.add(metric));
    });

    return Array.from(metrics).sort();
  }, [builderDevices]);

  const getAlertsForDevices = (targetDevices: any[]) => {
    if (targetDevices === taggedDevices) return taggedAlerts;

    const targetIds = new Set(targetDevices.map((device) => device.id));
    return mockAlerts.filter((alert) => targetIds.has(alert.deviceId));
  };

  const getStatsForDevices = (targetDevices: any[]): Record<OverviewKpiKey, { name: string; value: string; icon: any }> => {
    const targetAlerts = getAlertsForDevices(targetDevices);

    return {
      totalDevices: { name: t.overview.totalDevices, value: targetDevices.length.toString(), icon: Server },
      onlineDevices: { name: t.overview.onlineDevices, value: targetDevices.filter(d => d.status === 'online').length.toString(), icon: Activity },
      energyToday: { name: t.overview.energyToday, value: `${sumMetric(targetDevices, 'energy_today').toFixed(1)} kWh`, icon: Zap },
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

  const stats = getStatsForDevices(taggedDevices);

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

    updateOverviewWidgets(nextWidgets);
    updateOverviewLayout(nextLayout);
  }, [overviewLayout, overviewWidgets, updateOverviewLayout, updateOverviewWidgets]);

  useEffect(() => {
    if (!isTemplateEditing || !showWidgetBuilder) return;
    if (builderMetricOptions.length === 0) return;
    if (builderMetricOptions.includes(builderMetricKey)) return;

    setBuilderMetricKey(builderMetricOptions[0]);
  }, [builderMetricKey, builderMetricOptions, isTemplateEditing, showWidgetBuilder]);

  const isDark = theme === 'dark';
  const cartesianGridStroke = isDark ? '#334155' : '#e2e8f0';
  const tooltipBg = isDark ? '#0f1115' : '#ffffff';
  const tooltipBorder = isDark ? '#1e293b' : '#e2e8f0';
  const tooltipColor = isDark ? '#cbd5e1' : '#334155';

  const onLayoutChange = (currentLayout: any[]) => {
    if (isGridInteractingRef.current) return;
    if (layoutsEqual(currentLayout, overviewLayout)) return;

    updateOverviewLayout(currentLayout);
  };

  const handleDragStart = () => {
    isGridInteractingRef.current = true;
  };

  const handleDrag = (_layout: any[], _oldItem: any, newItem: any, _placeholder: any) => {
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
    const nextLayout = snapLayoutItem(layout.map((item) => ({ ...item })), { ...newItem });

    if (!layoutsEqual(nextLayout, overviewLayout)) {
      updateOverviewLayout(nextLayout);
    }

    isGridInteractingRef.current = false;
    updateSnapGuide({});
  };

  const handleResizeStart = () => {
    isGridInteractingRef.current = true;
    clearSnapGuide();
  };

  const handleResizeStop = (layout: any[]) => {
    const nextLayout = layout.map((item) => ({ ...item }));

    if (!layoutsEqual(nextLayout, overviewLayout)) {
      updateOverviewLayout(nextLayout);
    }

    isGridInteractingRef.current = false;
    updateSnapGuide({});
  };

  const clearSnapGuide = () => {
    updateSnapGuide({});
  };

  const activeTemplate = dashboardTemplates.find((template) => template.id === activeDashboardTemplateId) || dashboardTemplates[0];
  const selectedTemplateId = activeTemplate?.id || '';
  const configWidget = overviewWidgets.find((widget) => widget.id === configWidgetId) || null;

  const getWidgetDevices = (widget: OverviewWidget) => {
    if (widget.deviceIds?.length) {
      const selectedDeviceIds = new Set(widget.deviceIds);
      return devices.filter((device) => selectedDeviceIds.has(device.id));
    }

    return taggedDevices;
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
    updateOverviewWidget(widget.id, { title });
  };

  const handleWidgetDeviceToggle = (widget: OverviewWidget, deviceId: string) => {
    const selectedDeviceIds = new Set(widget.deviceIds || []);

    if (selectedDeviceIds.has(deviceId)) {
      selectedDeviceIds.delete(deviceId);
    } else {
      selectedDeviceIds.add(deviceId);
    }

    updateOverviewWidget(widget.id, { deviceIds: Array.from(selectedDeviceIds) });
  };

  const clearWidgetDevices = (widget: OverviewWidget) => {
    updateOverviewWidget(widget.id, { deviceIds: [] });
  };

  const resetWidgetBuilder = () => {
    setEditingLibraryWidgetId(null);
    setBuilderTitle('New Widget');
    setBuilderDisplayMode('number');
    setBuilderMetricKey(builderMetricOptions[0] || tagMetricOptions[0] || 'power');
    setBuilderIconId('activity');
    setBuilderDeviceIds([]);
  };

  const openWidgetBuilder = (widget?: OverviewWidget) => {
    if (widget) {
      setEditingLibraryWidgetId(widget.id);
      setBuilderTitle(widget.title || 'New Widget');
      setBuilderDisplayMode(widget.displayMode || 'number');
      setBuilderMetricKey(widget.metricKey || tagMetricOptions[0] || 'power');
      setBuilderIconId(widget.iconId || 'activity');
      setBuilderDeviceIds(widget.deviceIds ? [...widget.deviceIds] : []);
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
    };

    if (editingLibraryWidgetId) {
      updateOverviewWidgetLibraryItem(editingLibraryWidgetId, widget);
    } else {
      addOverviewWidgetLibraryItem(widget);
    }

    setShowWidgetBuilder(false);
    resetWidgetBuilder();
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
      { i: id, x: nextPosition.x, y: nextPosition.y, w: width, h: height, minW: isChartLike ? 3 : 2, minH: 2 }
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

  const getWidgetLayoutSize = (widget: OverviewWidget) => {
    if (widget.type === 'kpi') return { w: 3, h: 2, minW: 2, minH: 2 };
    if (widget.type === 'trend' || widget.type === 'chart' || widget.type === 'ai') return { w: 4, h: 5, minW: 3, minH: 3 };
    if (widget.type === 'custom') {
      const mode = widget.displayMode || 'number';
      if (['line', 'area', 'bar', 'donut'].includes(mode)) return { w: 4, h: 4, minW: 3, minH: 3 };
      return { w: 3, h: 2, minW: 2, minH: 2 };
    }

    return { w: 3, h: 2, minW: 2, minH: 2 };
  };

  const sortWidgetsForAutoLayout = (widgets: OverviewWidget[]) => {
    const priority = (widget: OverviewWidget) => {
      if (widget.type === 'kpi') return 0;
      if (widget.type === 'custom' && ['number', 'gauge', 'status'].includes(widget.displayMode || 'number')) return 1;
      if (widget.type === 'trend' || widget.type === 'chart') return 2;
      if (widget.type === 'custom') return 3;
      if (widget.type === 'ai') return 4;
      return 5;
    };

    return [...widgets].sort((first, second) => priority(first) - priority(second));
  };

  const autoArrangeWidgets = () => {
    let x = 0;
    let y = 0;
    let rowHeight = 0;

    const nextLayout = sortWidgetsForAutoLayout(overviewWidgets).map((widget) => {
      const size = getWidgetLayoutSize(widget);

      if (x + size.w > GRID_COLS) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }

      const item = {
        i: widget.id,
        x,
        y,
        ...size,
      };

      x += size.w;
      rowHeight = Math.max(rowHeight, size.h);

      return item;
    });

    updateOverviewLayout(nextLayout);
    setActiveSnapGuide({});
  };

  const handleTagSelect = (tag: string) => {
    setSelectedTag(tag);

    const templateId = tagDashboardTemplateMap[tag] || getTagTemplateId(tag);
    if (dashboardTemplates.some((template) => template.id === templateId)) {
      applyDashboardTemplate(templateId);
    }

    closeTemplateEditor();
  };

  const openNewTemplate = () => {
    setTemplateEditorMode('new');
    setTemplateName('Custom Monitoring');
    setTemplateDescription('Custom dashboard template.');
  };

  const openEditTemplate = () => {
    if (!activeTemplate) return;

    setTemplateEditorMode('edit');
    setTemplateName(activeTemplate.name);
    setTemplateDescription(activeTemplate.description);
  };

  const closeTemplateEditor = () => {
    setTemplateEditorMode(null);
    setTemplateName('');
    setTemplateDescription('');
    setConfigWidgetId(null);
    setShowWidgetBuilder(false);
  };

  const buildTemplateFromCurrentDashboard = (id: string, name: string, description: string): DashboardTemplate => ({
    id,
    name: name.trim() || 'Untitled Monitoring',
    description: description.trim(),
    layout: overviewLayout.map((item) => ({ ...item })),
    widgets: overviewWidgets.map((widget) => ({ ...widget, deviceIds: widget.deviceIds ? [...widget.deviceIds] : undefined })),
  });

  const saveTemplate = () => {
    if (templateEditorMode === 'new') {
      const template = buildTemplateFromCurrentDashboard(`custom-${Date.now()}`, templateName, templateDescription);
      addDashboardTemplate(template);
      if (selectedTag !== 'All') {
        setTagDashboardTemplate(selectedTag, template.id);
      }
      closeTemplateEditor();
      return;
    }

    if (templateEditorMode === 'edit' && activeTemplate) {
      const template = buildTemplateFromCurrentDashboard(activeTemplate.id, templateName, templateDescription);
      updateDashboardTemplate(template);
      if (selectedTag !== 'All') {
        setTagDashboardTemplate(selectedTag, template.id);
      }
      closeTemplateEditor();
      return;
    }

    if (activeTemplate) {
      const template = buildTemplateFromCurrentDashboard(activeTemplate.id, activeTemplate.name, activeTemplate.description);
      updateDashboardTemplate(template);
      if (selectedTag !== 'All') {
        setTagDashboardTemplate(selectedTag, template.id);
      }
    }
  };

  const handleTemplateDelete = () => {
    if (!activeTemplate) return;
    if (!window.confirm(`Delete template "${activeTemplate.name}"?`)) return;

    deleteDashboardTemplate(activeTemplate.id);
    closeTemplateEditor();
  };

  const handleAddChart = (chart: any) => {
    const id = createWidgetId(`chart_${chart.id}`);

    addOverviewWidget(
      { id, type: 'chart', chartId: chart.id, title: chart.title },
      { i: id, x: 0, y: Infinity, w: 4, h: 4, minW: 3, minH: 3 }
    );
    setConfigWidgetId(id);
    setShowWidgetBuilder(false);
  };

  const handleAddKPI = (kpi: { id: string; key: OverviewKpiKey }) => {
    const id = createWidgetId(kpi.id);

    addOverviewWidget(
      { id, type: 'kpi', kpiKey: kpi.key, title: stats[kpi.key].name },
      { i: id, x: 0, y: Infinity, w: 3, h: 2, minW: 2, minH: 2 }
    );
    setConfigWidgetId(id);
    setShowWidgetBuilder(false);
  };

  const handleAddUtilityWidget = (type: 'trend' | 'ai') => {
    const id = createWidgetId(type);
    const title = type === 'trend' ? t.overview.realtimeTrend : t.overview.aiCopilot;

    addOverviewWidget(
      { id, type, title },
      { i: id, x: 0, y: Infinity, w: type === 'trend' ? 5 : 4, h: 5, minW: 3, minH: 3 }
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
    const totalPower = sumMetric(targetDevices, 'power');
    const factor = totalPower > 0 ? Math.max(totalPower / 45000, 0.25) : 0.25;
    const widgetTrendData = mockEnergyTrends.map((point) => ({
      ...point,
      value: Math.round(point.value * factor),
      baseline: Math.round(point.baseline * factor),
    }));

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

  const renderAI = (widget: OverviewWidget) => (
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
            <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">CNC Machine 1 power exceeded the baseline by 25% over the last 15 mins. This may indicate tool wear.</p>
            <button type="button" className="mt-2 text-left text-[10px] font-bold text-orange-600 dark:text-orange-500 hover:text-orange-700 dark:hover:text-orange-400 uppercase tracking-tight truncate">{t.overview.viewDetails} &rarr;</button>
          </div>
        </div>
        
        <div className="rounded bg-slate-50 dark:bg-slate-900/50 p-3 border border-slate-200 dark:border-slate-800/50">
          <div className="flex flex-col">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">{t.overview.savings}</p>
            <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">Shifting Air Compressor maintenance to off-peak (02:00) could save ~$320/mth.</p>
            <button type="button" className="mt-2 text-[10px] text-left font-bold text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400 uppercase tracking-tight truncate">{t.overview.applyWorkflow} &rarr;</button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAnalyticChart = (widgetConfig: OverviewWidget) => {
    const chartConf = charts.find(c => c.id === widgetConfig.chartId);
    if (!chartConf) return <div className="p-4 text-xs text-slate-500 border rounded-lg h-full overflow-hidden">Chart not found</div>;

    return (
      <div className="h-full w-full overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col group relative">
        {false && (
        <button 
          onClick={() => removeOverviewWidget(widgetConfig.id)} 
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
          <ChartRenderer chartConf={chartConf} theme={theme} devices={getWidgetDevices(widgetConfig)} />
        </div>
      </div>
    );
  };

  const renderCustomWidget = (widget: OverviewWidget) => {
    const targetDevices = getWidgetDevices(widget);
    const metricKey = widget.metricKey || 'power';
    const title = getWidgetTitle(widget);
    const Icon = IOT_ICONS[widget.iconId || 'activity'] || Activity;
    const displayMode = widget.displayMode || 'number';
    const value = sumMetric(targetDevices, metricKey);
    const averageValue = averageMetric(targetDevices, metricKey);
    const baseline = averageValue || value || 1;
    const trendData = mockEnergyTrends.map((point, index) => ({
      time: point.time,
      value: Number((baseline * (0.72 + index * 0.09)).toFixed(1)),
    }));
    const deviceMetricData = targetDevices.map((device) => ({
      name: device.name,
      value: Number(device.metrics?.[metricKey]) || 0,
    }));
    const chartData = deviceMetricData.length ? deviceMetricData : [{ name: metricKey, value }];
    const statusLevel = averageValue > 80 ? 'Warning' : averageValue > 0 ? 'Normal' : 'No Data';
    const gaugeValue = Math.max(0, Math.min(100, averageValue || value));

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
                <Area type="monotone" dataKey="value" stroke="#ea580c" strokeWidth={2} fill="#ea580c" fillOpacity={displayMode === 'area' ? 0.24 : 0} name={metricKey} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
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
                <Bar dataKey="value" fill="#ea580c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
                    <Cell key={entry.name} fill={['#ea580c', '#3b82f6', '#10b981', '#64748b'][index % 4]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: `1px solid ${tooltipBorder}`, backgroundColor: tooltipBg, color: tooltipColor }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
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
              <p className="text-2xl font-mono font-bold text-slate-900 dark:text-white">{gaugeValue.toFixed(1)}%</p>
              <p className="mt-1 truncate text-[10px] font-mono text-slate-400">{metricKey}</p>
            </div>
            <div className="relative h-20 w-20 shrink-0 rounded-full" style={{ background: `conic-gradient(#ea580c ${gaugeValue * 3.6}deg, ${isDark ? '#334155' : '#e2e8f0'} 0deg)` }}>
              <div className="absolute inset-3 rounded-full bg-white dark:bg-[#1c2128] flex items-center justify-center">
                <Icon className="h-5 w-5 text-orange-500" />
              </div>
            </div>
          </div>
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
              <p className={cn(
                "mt-1 text-2xl font-mono font-bold truncate",
                statusLevel === 'Warning' ? "text-amber-500" : statusLevel === 'Normal' ? "text-emerald-500" : "text-slate-400"
              )}>{statusLevel}</p>
              <p className="mt-1 truncate text-[10px] font-mono text-slate-400">{metricKey}: {averageValue.toFixed(1)}</p>
            </div>
            <span className={cn(
              "h-4 w-4 rounded-full shrink-0",
              statusLevel === 'Warning' ? "bg-amber-500" : statusLevel === 'Normal' ? "bg-emerald-500" : "bg-slate-400"
            )} />
          </div>
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
            <p className="mt-1 text-2xl xl:text-3xl font-mono font-bold text-slate-900 dark:text-white truncate">{Number(value.toFixed(1)).toLocaleString()}</p>
            <p className="mt-1 truncate text-[10px] font-mono text-slate-400">{metricKey}</p>
          </div>
          <div className="rounded p-2 text-orange-600 dark:text-orange-500 shrink-0">
            <Icon className="h-5 w-5 xl:h-6 xl:w-6" aria-hidden="true" />
          </div>
        </div>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t.overview.title}</h1>
          <div className="mt-2 flex max-w-full items-center gap-2 overflow-x-auto pb-1">
            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleTagSelect(tag)}
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

        <div className="flex flex-wrap items-start justify-end gap-2">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1c2128] p-2 shadow-sm">
            <select
              value={selectedTemplateId}
              onChange={(event) => {
                applyDashboardTemplate(event.target.value);
                closeTemplateEditor();
              }}
              className="h-9 min-w-[240px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-700 dark:text-slate-300 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            >
              {dashboardTemplates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={openNewTemplate}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-slate-300 dark:border-slate-700 px-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              New
            </button>
            <button
              type="button"
              onClick={openEditTemplate}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-slate-300 dark:border-slate-700 px-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
            <button
              type="button"
              onClick={saveTemplate}
              className="inline-flex h-9 items-center gap-1.5 rounded bg-orange-600 px-3 text-sm font-semibold text-white hover:bg-orange-500"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
            <button
              type="button"
              onClick={handleTemplateDelete}
              className="inline-flex h-9 items-center justify-center rounded border border-slate-300 dark:border-slate-700 px-2.5 text-slate-500 hover:border-red-300 hover:text-red-600 dark:text-slate-400 dark:hover:border-red-500/50 dark:hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {isTemplateEditing && (
            <>
            <button
              type="button"
              onClick={autoArrangeWidgets}
              className="inline-flex items-center gap-x-2 rounded bg-white dark:bg-[#1c2128] px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
            >
              <LayoutGrid className="-ml-0.5 h-4 w-4" aria-hidden="true" />
              Auto Layout
            </button>
            <button
              type="button"
              onClick={() => openWidgetBuilder()}
              className="inline-flex items-center gap-x-2 rounded bg-white dark:bg-[#1c2128] px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
            >
              <Plus className="-ml-0.5 h-4 w-4" aria-hidden="true" />
              Add Widget
            </button>
            </>
          )}
        </div>
      </div>

      {templateEditorMode && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1c2128] p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,320px)_1fr_auto] lg:items-end">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Template name</label>
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                className="mt-1 h-10 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Description</label>
              <input
                value={templateDescription}
                onChange={(event) => setTemplateDescription(event.target.value)}
                className="mt-1 h-10 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveTemplate}
                className="inline-flex h-10 items-center gap-1.5 rounded bg-orange-600 px-3 text-sm font-semibold text-white hover:bg-orange-500"
              >
                <Save className="h-4 w-4" />
                Save
              </button>
              <button
                type="button"
                onClick={closeTemplateEditor}
                className="inline-flex h-10 items-center justify-center rounded border border-slate-300 dark:border-slate-700 px-3 text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {isTemplateEditing && showWidgetBuilder && (
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
                {builderDeviceIds.length > 0 ? 'Metrics from bound devices' : 'Metrics from current tag devices'}
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
                  {taggedDevices.filter((device) => !builderDeviceIds.includes(device.id)).map((device) => (
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
        </div>
      )}

      {isTemplateEditing && (
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
                      onClick={() => removeOverviewWidgetLibraryItem(widget.id)}
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
      )}

      {isTemplateEditing && configWidget && (
        <div className="rounded-lg border border-orange-200 dark:border-orange-500/30 bg-white dark:bg-[#1c2128] p-4 shadow-sm">
          <div className="grid gap-4 xl:grid-cols-[minmax(220px,360px)_1fr_auto] xl:items-start">
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
                  Use current tag
                </button>
              </div>
              <div className="mt-2 grid max-h-32 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                {taggedDevices.map((device) => (
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
                {taggedDevices.length === 0 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">No devices under this tag.</div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfigWidgetId(null)}
              className="inline-flex h-10 items-center justify-center rounded border border-slate-300 dark:border-slate-700 px-3 text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
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
        <ResponsiveGridLayout
          className="layout"
          layouts={gridLayouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
          rowHeight={GRID_ROW_HEIGHT}
          onLayoutChange={onLayoutChange}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragStop={handleDragStop}
          onResizeStart={handleResizeStart}
          onResizeStop={handleResizeStop}
          {...({ draggableHandle: ".draggable-handle" } as any)}
          isResizable={isTemplateEditing}
          isDraggable={isTemplateEditing}
          resizeHandles={['se']}
          preventCollision={true}
          compactType={null}
          margin={GRID_MARGIN}
        >
          {overviewWidgets.map(widget => (
            <div key={widget.id} className="relative">
              {isTemplateEditing && (
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
                    onClick={() => {
                      removeOverviewWidget(widget.id);
                      if (configWidgetId === widget.id) setConfigWidgetId(null);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-red-500/50 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {renderWidgetBody(widget)}
            </div>
          ))}
        </ResponsiveGridLayout>
      </div>

    </div>
  );
}
