import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Cpu, Droplets, Gauge, Move, Network, Save, Trash2, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, type ScadaElement, type ScadaElementType, type ScadaScene } from '../lib/store';
import { cn } from '../lib/utils';
import type { Device } from '../types';

const CANVAS_WIDTH = 1100;
const CANVAS_HEIGHT = 620;

const elementTypes: Array<{ type: ScadaElementType; label: string; icon: any }> = [
  { type: 'device', label: 'Device', icon: Cpu },
  { type: 'metric', label: 'Metric', icon: Gauge },
  { type: 'pipe', label: 'Pipe', icon: Droplets },
  { type: 'power', label: 'Power Line', icon: Zap },
  { type: 'label', label: 'Label', icon: Activity },
];

const createElementId = (type: ScadaElementType) => `scada-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const createBlankScene = (siteId: string, siteName: string): ScadaScene => ({
  id: `scada-${siteId}`,
  siteId,
  name: `${siteName} Operations View`,
  elements: [
    { id: createElementId('label'), type: 'label', label: siteName, x: 60, y: 44, width: 220, height: 40 },
  ],
});

const getDeviceValue = (element: ScadaElement, devices: Device[]) => {
  const device = devices.find((item) => item.id === element.deviceId || item.config?.externalDeviceId === element.deviceId);
  const rawValue = element.metricKey ? Number(device?.metrics?.[element.metricKey]) : Number.NaN;
  return {
    device,
    value: Number.isFinite(rawValue) ? rawValue : Number.NaN,
  };
};

const getElementState = (element: ScadaElement, devices: Device[]) => {
  const {device, value} = getDeviceValue(element, devices);
  if (!device || !device.lastSeen) return 'noData';
  if (device.status === 'offline') return 'critical';
  if (device.status === 'warning') return 'warning';
  if (Number.isFinite(value) && element.critical !== undefined && value >= element.critical) return 'critical';
  if (Number.isFinite(value) && element.warning !== undefined && value >= element.warning) return 'warning';
  return 'normal';
};

const stateStyles: Record<string, { stroke: string; fill: string; text: string; badge: string }> = {
  normal: { stroke: '#10b981', fill: 'rgba(16,185,129,0.12)', text: '#34d399', badge: '#10b981' },
  warning: { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.14)', text: '#fbbf24', badge: '#f59e0b' },
  critical: { stroke: '#ef4444', fill: 'rgba(239,68,68,0.14)', text: '#f87171', badge: '#ef4444' },
  noData: { stroke: '#64748b', fill: 'rgba(100,116,139,0.12)', text: '#94a3b8', badge: '#64748b' },
};

const formatMetricValue = (value: number, unit?: string) => {
  if (!Number.isFinite(value)) return 'No Data';
  const formatted = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
  return unit ? `${formatted} ${unit}` : formatted;
};

export function ScadaView() {
  const navigate = useNavigate();
  const { activeSiteId, sites, devices, scadaScenesBySite, updateScadaScene } = useAppStore();
  const activeSite = sites.find((site) => site.id === activeSiteId) || sites[0];
  const fallbackScene = createBlankScene(activeSite?.id || 'factory-a', activeSite?.name || 'Site');
  const storeScene = scadaScenesBySite[activeSite?.id || 'factory-a'] || fallbackScene;
  const [draft, setDraft] = useState<ScadaScene>(storeScene);
  const [selectedElementId, setSelectedElementId] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [dragState, setDragState] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (storeScene) {
      setDraft(JSON.parse(JSON.stringify(storeScene)));
      setSelectedElementId('');
      setEditMode(false);
    }
  }, [storeScene?.id, activeSiteId]);

  const siteDevices = useMemo(
    () => devices.filter((device) => !activeSite || device.siteId === activeSite.id || device.tags?.includes(activeSite.id)),
    [activeSite, devices]
  );
  const selectedElement = draft?.elements.find((element) => element.id === selectedElementId) || null;
  const metricOptions = useMemo(() => {
    const device = devices.find((item) => item.id === selectedElement?.deviceId);
    return Object.keys(device?.metrics || {}).sort();
  }, [devices, selectedElement?.deviceId]);

  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: transformed.x, y: transformed.y };
  };

  const updateElement = (id: string, patch: Partial<ScadaElement>) => {
    setDraft((current) => ({
      ...current,
      elements: current.elements.map((element) => element.id === id ? { ...element, ...patch } : element),
    }));
  };

  const addElement = (type: ScadaElementType) => {
    const id = createElementId(type);
    const base = { id, type, label: elementTypes.find((item) => item.type === type)?.label || type, x: 120, y: 120, width: 150, height: 76 };
    const line = { id, type, label: type === 'power' ? 'Power Line' : 'Pipe', x: 0, y: 0, points: [{ x: 280, y: 260 }, { x: 520, y: 260 }] };
    const nextElement = type === 'pipe' || type === 'power' ? line : base;
    setDraft((current) => ({ ...current, elements: [...current.elements, nextElement] }));
    setSelectedElementId(id);
    setEditMode(true);
  };

  const removeElement = (id: string) => {
    setDraft((current) => ({ ...current, elements: current.elements.filter((element) => element.id !== id) }));
    setSelectedElementId('');
  };

  const saveScene = () => {
    if (!activeSite) return;
    updateScadaScene(activeSite.id, draft);
    setEditMode(false);
  };

  const handlePointerDown = (event: React.PointerEvent, element: ScadaElement) => {
    if (!editMode || element.type === 'pipe' || element.type === 'power') return;
    event.stopPropagation();
    const point = toSvgPoint(event.clientX, event.clientY);
    setSelectedElementId(element.id);
    setDragState({ id: element.id, dx: point.x - element.x, dy: point.y - element.y });
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragState) return;
    const point = toSvgPoint(event.clientX, event.clientY);
    updateElement(dragState.id, {
      x: Math.max(8, Math.min(CANVAS_WIDTH - 80, point.x - dragState.dx)),
      y: Math.max(8, Math.min(CANVAS_HEIGHT - 50, point.y - dragState.dy)),
    });
  };

  const renderLine = (element: ScadaElement) => {
    const points = element.points || [];
    if (points.length < 2) return null;
    const state = getElementState(element, devices);
    const style = stateStyles[state];
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    const active = state === 'normal' || state === 'warning';

    return (
      <g key={element.id} onClick={(event) => { event.stopPropagation(); setSelectedElementId(element.id); }} className={cn(editMode && 'cursor-pointer')}>
        <path d={path} fill="none" stroke="rgba(15,23,42,0.75)" strokeWidth={18} strokeLinecap="round" />
        <path d={path} fill="none" stroke={style.stroke} strokeWidth={8} strokeLinecap="round" strokeDasharray={element.type === 'power' ? '12 10' : '18 12'} className={active ? 'scada-flow-line' : ''} />
        <text x={(points[0].x + points[points.length - 1].x) / 2} y={(points[0].y + points[points.length - 1].y) / 2 - 14} fill="#94a3b8" fontSize="12" textAnchor="middle">{element.label}</text>
      </g>
    );
  };

  const renderElement = (element: ScadaElement) => {
    if (element.type === 'pipe' || element.type === 'power') return renderLine(element);

    const {device, value} = getDeviceValue(element, devices);
    const state = getElementState(element, devices);
    const style = stateStyles[state];
    const width = element.width || 150;
    const height = element.height || 76;
    const isSelected = selectedElementId === element.id;

    if (element.type === 'label') {
      return (
        <g key={element.id} onPointerDown={(event) => handlePointerDown(event, element)} onClick={(event) => { event.stopPropagation(); setSelectedElementId(element.id); }} className={cn(editMode && 'cursor-move')}>
          <text x={element.x} y={element.y} fill="#e5e7eb" fontSize="24" fontWeight="700">{element.label}</text>
          {isSelected && <rect x={element.x - 8} y={element.y - 30} width={width} height={height} fill="none" stroke="#fb923c" strokeDasharray="5 5" />}
        </g>
      );
    }

    return (
      <g
        key={element.id}
        onPointerDown={(event) => handlePointerDown(event, element)}
        onClick={(event) => {
          event.stopPropagation();
          setSelectedElementId(element.id);
          if (!editMode && element.deviceId) navigate(`/devices/${element.deviceId}`);
        }}
        className={cn(editMode ? 'cursor-move' : element.deviceId && 'cursor-pointer')}
      >
        <rect x={element.x} y={element.y} width={width} height={height} rx={8} fill={style.fill} stroke={isSelected ? '#fb923c' : style.stroke} strokeWidth={isSelected ? 3 : 2} className={state === 'critical' ? 'scada-alarm-pulse' : ''} />
        <circle cx={element.x + 18} cy={element.y + 20} r={5} fill={style.badge} />
        <text x={element.x + 32} y={element.y + 24} fill="#e5e7eb" fontSize="13" fontWeight="700">{element.label}</text>
        <text x={element.x + 16} y={element.y + 52} fill={style.text} fontSize={element.type === 'metric' ? 20 : 17} fontWeight="700" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
          {formatMetricValue(value, element.unit)}
        </text>
        <text x={element.x + 16} y={element.y + height - 12} fill="#94a3b8" fontSize="10">{device ? `${device.name} / ${element.metricKey || '-'}` : 'Unbound'}</text>
      </g>
    );
  };

  if (!draft || !activeSite) {
    return <div className="text-sm text-slate-500">No SCADA scene available.</div>;
  }

  return (
    <div className="flex h-full min-h-[calc(100dvh-8rem)] flex-col gap-4">
      <style>{`
        @keyframes scada-flow { to { stroke-dashoffset: -60; } }
        @keyframes scada-alarm { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
        .scada-flow-line { animation: scada-flow 1.4s linear infinite; }
        .scada-alarm-pulse { animation: scada-alarm 1s ease-in-out infinite; }
      `}</style>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
            <Network className="h-6 w-6 text-orange-500" />
            SCADA 运维视图
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{activeSite.name} dynamic operations map driven by realtime telemetry.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditMode((value) => !value)}
            className={cn("inline-flex h-9 items-center gap-2 rounded border px-3 text-sm font-semibold", editMode ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200")}
          >
            <Move className="h-4 w-4" />
            {editMode ? 'Editing' : 'Edit Mode'}
          </button>
          <button type="button" onClick={saveScene} className="inline-flex h-9 items-center gap-2 rounded bg-orange-600 px-3 text-sm font-semibold text-white hover:bg-orange-500">
            <Save className="h-4 w-4" />
            Save Scene
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1fr_340px]">
        <section className="min-h-[520px] overflow-hidden rounded-lg border border-slate-200 bg-slate-950 shadow-sm dark:border-slate-800">
          <div className="h-full overflow-auto">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              className="min-h-[520px] w-full min-w-[900px] touch-none bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:22px_22px]"
              onPointerMove={handlePointerMove}
              onPointerUp={() => setDragState(null)}
              onPointerLeave={() => setDragState(null)}
              onClick={() => editMode && setSelectedElementId('')}
            >
              <defs>
                <linearGradient id="scada-bg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0f172a" />
                  <stop offset="100%" stopColor="#020617" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#scada-bg)" opacity="0.72" />
              <rect x="36" y="110" width="1028" height="420" rx="18" fill="rgba(15,23,42,0.46)" stroke="#1e293b" strokeWidth="2" />
              <text x="54" y="558" fill="#64748b" fontSize="12">Click devices to open details. Enable Edit Mode to move and bind elements.</text>
              {draft.elements.map(renderElement)}
            </svg>
          </div>
        </section>

        <aside className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#1c2128]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Scene Tools</h2>
            <span className="text-xs text-slate-500">{draft.elements.length} elements</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {elementTypes.map((item) => (
              <button key={item.type} type="button" onClick={() => addElement(item.type)} className="inline-flex items-center justify-center gap-2 rounded border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <item.icon className="h-4 w-4 text-orange-500" />
                {item.label}
              </button>
            ))}
          </div>

          {selectedElement ? (
            <div className="mt-5 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Element Settings</h3>
                <button type="button" onClick={() => removeElement(selectedElement.id)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                Label
                <input value={selectedElement.label} onChange={(event) => updateElement(selectedElement.id, { label: event.target.value })} className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                Device
                <select value={selectedElement.deviceId || ''} onChange={(event) => updateElement(selectedElement.id, { deviceId: event.target.value, metricKey: '' })} className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <option value="">Unbound</option>
                  {siteDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                Metric
                <input list="scada-metrics" value={selectedElement.metricKey || ''} onChange={(event) => updateElement(selectedElement.id, { metricKey: event.target.value })} className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                <datalist id="scada-metrics">{metricOptions.map((metric) => <option key={metric} value={metric} />)}</datalist>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                  Unit
                  <input value={selectedElement.unit || ''} onChange={(event) => updateElement(selectedElement.id, { unit: event.target.value })} className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-2 text-sm normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                </label>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                  Warn
                  <input type="number" value={selectedElement.warning ?? ''} onChange={(event) => updateElement(selectedElement.id, { warning: event.target.value === '' ? undefined : Number(event.target.value) })} className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-2 text-sm normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                </label>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                  Critical
                  <input type="number" value={selectedElement.critical ?? ''} onChange={(event) => updateElement(selectedElement.id, { critical: event.target.value === '' ? undefined : Number(event.target.value) })} className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-2 text-sm normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                </label>
              </div>
              {selectedElement.deviceId && (
                <button type="button" onClick={() => navigate(`/devices/${selectedElement.deviceId}`)} className="inline-flex w-full items-center justify-center gap-2 rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600">
                  Open Device Details
                </button>
              )}
            </div>
          ) : (
            <div className="mt-5 rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Select an element to bind device metrics, thresholds, and labels.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
