import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Server, Zap, AlertTriangle, BrainCircuit, Plus, GripHorizontal, Save, Pencil, Trash2, X, Sun, BatteryCharging, Thermometer, Droplets, DoorOpen, Gauge, Waves, Timer, Wind } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { mockEnergyTrends, mockDevices, mockAlerts } from '../lib/mockData';
import { useAppStore } from '../lib/store';
import type { DashboardTemplate, OverviewKpiKey } from '../lib/store';
import { translations } from '../lib/i18n';
import { Responsive, WidthProvider } from 'react-grid-layout/legacy';
import { ChartRenderer } from '../components/ChartRenderer';
import { cn } from '../lib/utils';

const ResponsiveGridLayout = WidthProvider(Responsive);
const GRID_COLS = 12;
const GRID_ROW_HEIGHT = 80;
const GRID_MARGIN: [number, number] = [16, 16];
const SNAP_THRESHOLD = 1;

type SnapGuide = {
  x?: number;
  y?: number;
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
    charts,
    overviewWidgets,
    overviewLayout,
    dashboardTemplates,
    activeDashboardTemplateId,
    addOverviewWidget,
    removeOverviewWidget,
    updateOverviewLayout,
    updateOverviewWidgets,
    applyDashboardTemplate,
    addDashboardTemplate,
    updateDashboardTemplate,
    deleteDashboardTemplate,
  } = useAppStore();
  const t = translations[language];
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [activeSnapGuide, setActiveSnapGuide] = useState<SnapGuide>({});
  const [templateEditorMode, setTemplateEditorMode] = useState<'new' | 'edit' | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

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

  const stats: Record<OverviewKpiKey, { name: string; value: string; icon: any }> = {
    totalDevices: { name: t.overview.totalDevices, value: mockDevices.length.toString(), icon: Server },
    onlineDevices: { name: t.overview.onlineDevices, value: mockDevices.filter(d => d.status === 'online').length.toString(), icon: Activity },
    energyToday: { name: t.overview.energyToday, value: '728.8 kWh', icon: Zap },
    activeAlerts: { name: t.overview.activeAlerts, value: mockAlerts.filter(a => a.status === 'active').length.toString(), icon: AlertTriangle },
    solarGeneration: { name: 'PV Generation Today', value: '1.84 MWh', icon: Sun },
    solarEfficiency: { name: 'Inverter Efficiency', value: '96.8%', icon: Activity },
    batterySoc: { name: 'Battery SOC', value: '78%', icon: BatteryCharging },
    coldRoomTemp: { name: 'Cold Room Temp', value: '-18.4 deg C', icon: Thermometer },
    coldRoomHumidity: { name: 'Humidity', value: '62%', icon: Droplets },
    doorOpenEvents: { name: 'Door Open Events', value: '7', icon: DoorOpen },
    pumpFlowRate: { name: 'Flow Rate', value: '128 m3/h', icon: Waves },
    waterPressure: { name: 'Water Pressure', value: '4.6 bar', icon: Gauge },
    pumpRuntime: { name: 'Pump Runtime', value: '18.2 h', icon: Timer },
    compressorPressure: { name: 'Air Pressure', value: '7.8 bar', icon: Gauge },
    compressorRuntime: { name: 'Compressor Runtime', value: '14.6 h', icon: Timer },
    airLeakageRate: { name: 'Leakage Rate', value: '3.2%', icon: Wind },
  };

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

  const isDark = theme === 'dark';
  const cartesianGridStroke = isDark ? '#334155' : '#e2e8f0';
  const tooltipBg = isDark ? '#0f1115' : '#ffffff';
  const tooltipBorder = isDark ? '#1e293b' : '#e2e8f0';
  const tooltipColor = isDark ? '#cbd5e1' : '#334155';

  const onLayoutChange = (currentLayout: any[]) => {
    if (layoutsEqual(currentLayout, overviewLayout)) return;

    updateOverviewLayout(currentLayout);
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
    const nextLayout = snapLayoutItem(layout, newItem);

    if (!layoutsEqual(nextLayout, overviewLayout)) {
      updateOverviewLayout(nextLayout);
    }

    updateSnapGuide({});
  };

  const handleResizeStop = (layout: any[]) => {
    if (!layoutsEqual(layout, overviewLayout)) {
      updateOverviewLayout(layout);
    }

    updateSnapGuide({});
  };

  const clearSnapGuide = () => {
    updateSnapGuide({});
  };

  const activeTemplate = dashboardTemplates.find((template) => template.id === activeDashboardTemplateId) || dashboardTemplates[0];
  const selectedTemplateId = activeTemplate?.id || '';

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
  };

  const buildTemplateFromCurrentDashboard = (id: string, name: string, description: string): DashboardTemplate => ({
    id,
    name: name.trim() || 'Untitled Monitoring',
    description: description.trim(),
    layout: overviewLayout.map((item) => ({ ...item })),
    widgets: overviewWidgets.map((widget) => ({ ...widget })),
  });

  const saveTemplate = () => {
    if (templateEditorMode === 'new') {
      addDashboardTemplate(buildTemplateFromCurrentDashboard(`custom-${Date.now()}`, templateName, templateDescription));
      closeTemplateEditor();
      return;
    }

    if (templateEditorMode === 'edit' && activeTemplate) {
      updateDashboardTemplate(buildTemplateFromCurrentDashboard(activeTemplate.id, templateName, templateDescription));
      closeTemplateEditor();
      return;
    }

    if (activeTemplate) {
      updateDashboardTemplate(buildTemplateFromCurrentDashboard(activeTemplate.id, activeTemplate.name, activeTemplate.description));
    }
  };

  const handleTemplateDelete = () => {
    if (!activeTemplate) return;
    if (!window.confirm(`Delete template "${activeTemplate.name}"?`)) return;

    deleteDashboardTemplate(activeTemplate.id);
    closeTemplateEditor();
  };

  const handleAddChart = (chart: any) => {
    const id = `chart_${chart.id}`;
    if (overviewWidgets.find(w => w.id === id)) return; // already added

    addOverviewWidget(
      { id, type: 'chart', chartId: chart.id },
      { i: id, x: 0, y: Infinity, w: 4, h: 4, minW: 3, minH: 3 }
    );
    setShowAddMenu(false);
  };

  const handleAddKPI = (kpi: { id: string; key: OverviewKpiKey }) => {
    if (overviewWidgets.some((widget) => widget.id === kpi.id)) return;

    addOverviewWidget(
      { id: kpi.id, type: 'kpi', kpiKey: kpi.key },
      { i: kpi.id, x: 0, y: Infinity, w: 3, h: 2, minW: 2, minH: 2 }
    );
    setShowAddMenu(false);
  };

  const renderKPI = (kpiKey?: OverviewKpiKey) => {
    if (!kpiKey) return null;

    const stat = stats[kpiKey];
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
            <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">{stat.name}</p>
            <p className="mt-1 text-2xl xl:text-3xl font-mono font-bold text-slate-900 dark:text-white truncate">{stat.value}</p>
          </div>
          <div className="rounded p-2 text-orange-600 dark:text-orange-500 shrink-0">
            <Icon className="h-5 w-5 xl:h-6 xl:w-6" aria-hidden="true" />
          </div>
        </div>
      </div>
    );
  };

  const renderTrend = () => (
    <div className="h-full w-full overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col group relative">
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1c2128] px-4 py-3 shrink-0 flex justify-between items-center cursor-move draggable-handle">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-2">
           <GripHorizontal className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
           {t.overview.realtimeTrend}
        </h3>
      </div>
      <div className="p-4 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={mockEnergyTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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

  const renderAI = () => (
    <div className="h-full w-full overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 border-l-4 border-l-orange-500 shadow-sm flex flex-col group relative">
      <div className="p-3 shrink-0 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/50 cursor-move draggable-handle">
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
          <div className="w-5 h-5 bg-orange-500 rounded-sm flex items-center justify-center">
            <BrainCircuit className="h-3 w-3 text-white" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{t.overview.aiCopilot}</h3>
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

  const renderAnalyticChart = (widgetConfig: any) => {
    const chartConf = charts.find(c => c.id === widgetConfig.chartId);
    if (!chartConf) return <div className="p-4 text-xs text-slate-500 border rounded-lg h-full overflow-hidden">Chart not found</div>;

    return (
      <div className="h-full w-full overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col group relative">
        <button 
          onClick={() => removeOverviewWidget(widgetConfig.id)} 
          className="absolute top-3 right-3 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10 block cursor-pointer"
        >
          ×
        </button>
        <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1c2128] px-4 py-3 shrink-0 flex justify-between items-center cursor-move draggable-handle">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200 flex items-center gap-2 truncate pr-6">
            <GripHorizontal className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
            {chartConf.title}
          </h3>
        </div>
        <div className="p-4 flex-1 min-h-0">
          <ChartRenderer chartConf={chartConf} theme={theme} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t.overview.title}</h1>
          <div className="mt-1 inline-flex bg-slate-200 dark:bg-slate-800 rounded px-2 py-0.5 text-[10px] font-mono text-slate-700 dark:text-slate-400">
            {t.overview.site}
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

          <div className="relative">
          <button 
            type="button" 
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="inline-flex items-center gap-x-2 rounded bg-white dark:bg-[#1c2128] px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
          >
            <Plus className="-ml-0.5 h-4 w-4" aria-hidden="true" />
            Add Widget
          </button>
          
          {showAddMenu && (
            <div className="absolute right-0 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-md bg-white dark:bg-slate-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
              <div className="py-1">
                <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700">Industry KPIs</div>
                {AVAILABLE_KPI_WIDGETS.map(kpi => {
                  const stat = stats[kpi.key];
                  const isAdded = overviewWidgets.some(widget => widget.id === kpi.id);
                  return (
                    <button
                      key={kpi.id}
                      onClick={() => handleAddKPI(kpi)}
                      disabled={isAdded}
                      className={cn(
                        "w-full text-left px-4 py-2 text-sm transition-colors",
                        isAdded
                          ? "text-slate-400 dark:text-slate-500 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50"
                          : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                      )}
                    >
                      <span className="block truncate">{stat.name}</span>
                      <span className="block text-[10px] uppercase tracking-wider text-slate-400">{kpi.category}</span>
                    </button>
                  );
                })}

                <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-y border-slate-100 dark:border-slate-700">Analytics Charts</div>
                {charts.length === 0 && (
                  <div className="px-4 py-3 text-xs text-slate-500">No charts available. Go to Analytics to create some.</div>
                )}
                {charts.map(chart => {
                  const isAdded = overviewWidgets.some(w => w.chartId === chart.id);
                  return (
                    <button
                      key={chart.id}
                      onClick={() => handleAddChart(chart)}
                      disabled={isAdded}
                      className={cn(
                        "w-full text-left px-4 py-2 text-sm transition-colors",
                        isAdded 
                          ? "text-slate-400 dark:text-slate-500 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50" 
                          : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                      )}
                    >
                      {chart.title}
                      {isAdded && <span className="ml-2 text-[10px] uppercase border rounded px-1 text-slate-400 border-slate-300">Added</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          </div>
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

      <div className="-mx-4 pb-[100px] relative">
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
          layouts={{ lg: overviewLayout }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
          rowHeight={GRID_ROW_HEIGHT}
          onLayoutChange={onLayoutChange}
          onDrag={handleDrag}
          onDragStop={handleDragStop}
          onResizeStart={clearSnapGuide}
          onResizeStop={handleResizeStop}
          {...({ draggableHandle: ".draggable-handle" } as any)}
          isResizable={true}
          isDraggable={true}
          resizeHandles={['se']}
          preventCollision={false}
          compactType={null}
          margin={GRID_MARGIN}
        >
          {overviewWidgets.map(widget => {
            return (
              <div key={widget.id}>
                {widget.type === 'kpi' && renderKPI(widget.kpiKey)}
                {widget.type === 'trend' && renderTrend()}
                {widget.type === 'ai' && renderAI()}
                {widget.type === 'chart' && renderAnalyticChart(widget)}
              </div>
            );
          })}
        </ResponsiveGridLayout>
      </div>

      {showAddMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)}></div>
      )}
    </div>
  );
}
