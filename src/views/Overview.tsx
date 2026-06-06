import React, { useState } from 'react';
import { Activity, Server, Zap, AlertTriangle, BrainCircuit, Plus, GripHorizontal } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { mockEnergyTrends, mockDevices, mockAlerts } from '../lib/mockData';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { ResponsiveGridLayout } from 'react-grid-layout';
import { ChartRenderer } from '../components/ChartRenderer';
import { cn } from '../lib/utils';

export function Overview() {
  const { language, theme, charts, overviewWidgets, overviewLayout, addOverviewWidget, removeOverviewWidget, updateOverviewLayout } = useAppStore();
  const t = translations[language];
  const [showAddMenu, setShowAddMenu] = useState(false);

  const stats = [
    { name: t.overview.totalDevices, value: mockDevices.length.toString(), icon: Server },
    { name: t.overview.onlineDevices, value: mockDevices.filter(d => d.status === 'online').length.toString(), icon: Activity },
    { name: t.overview.energyToday, value: '728.8 kWh', icon: Zap },
    { name: t.overview.activeAlerts, value: mockAlerts.filter(a => a.status === 'active').length.toString(), icon: AlertTriangle },
  ];

  const isDark = theme === 'dark';
  const cartesianGridStroke = isDark ? '#334155' : '#e2e8f0';
  const tooltipBg = isDark ? '#0f1115' : '#ffffff';
  const tooltipBorder = isDark ? '#1e293b' : '#e2e8f0';
  const tooltipColor = isDark ? '#cbd5e1' : '#334155';

  const onLayoutChange = (currentLayout: any[]) => {
    updateOverviewLayout(currentLayout);
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

  const renderKPIs = () => (
    <div className="flex h-full w-full gap-4">
      {stats.map((stat) => (
        <div key={stat.name} className="flex-1 overflow-hidden rounded-lg bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col justify-center relative group">
          <div className="flex items-center justify-between">
            <div>
              <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">{stat.name}</p>
              <p className="mt-1 text-2xl xl:text-3xl font-mono font-bold text-slate-900 dark:text-white">{stat.value}</p>
            </div>
            <div className="rounded p-2 text-orange-600 dark:text-orange-500">
              <stat.icon className="h-5 w-5 xl:h-6 xl:w-6" aria-hidden="true" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t.overview.title}</h1>
          <div className="mt-1 inline-flex bg-slate-200 dark:bg-slate-800 rounded px-2 py-0.5 text-[10px] font-mono text-slate-700 dark:text-slate-400">
            {t.overview.site}
          </div>
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
            <div className="absolute right-0 mt-2 w-56 rounded-md bg-white dark:bg-slate-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
              <div className="py-1">
                <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700">Analytics Charts</div>
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

      <div className="-mx-4 pb-[100px]">
        <ResponsiveGridLayout
          className="layout"
          layouts={{ lg: overviewLayout }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 12, xs: 12, xxs: 12 }}
          rowHeight={80}
          onLayoutChange={onLayoutChange}
          {...({ draggableHandle: ".draggable-handle" } as any)}
          isResizable={true}
          resizeHandles={['se']}
          preventCollision={true}
          compactType={null}
          margin={[16, 16]}
        >
          {overviewWidgets.map(widget => {
            return (
              <div key={widget.id}>
                {widget.type === 'kpis' && (
                  <div className="h-full w-full group relative">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-move draggable-handle bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 rounded p-1 shadow-lg pointer-events-auto">
                      <GripHorizontal className="h-4 w-4" />
                    </div>
                    {renderKPIs()}
                  </div>
                )}
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
