import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Cpu, Droplets, Gauge, Move, Network, Save, Trash2, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, type ScadaElement, type ScadaElementType, type ScadaScene } from '../lib/store';
import { getDeviceIcon } from '../lib/icons';
import { cn } from '../lib/utils';
import type { Device } from '../types';

const CANVAS_WIDTH = 1100;
const CANVAS_HEIGHT = 620;
const SNAP_DISTANCE = 28;
const DETACH_DISTANCE = 52;

type AnchorSide = 'left' | 'right';
type LineEndpoint = 0 | 1;
type ScadaEditablePart = 'label' | 'icon' | 'value' | 'meta';
type ScadaAnchor = {
  elementId: string;
  side: AnchorSide;
  x: number;
  y: number;
};
type DragState =
  | { type: 'element'; id: string; dx: number; dy: number }
  | { type: 'endpoint'; id: string; endpoint: LineEndpoint; lockedAnchor?: ScadaAnchor | null }
  | { type: 'innerPart'; id: string; part: ScadaEditablePart; dx: number; dy: number };

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

const scadaIconByDeviceType: Record<string, string> = {
  air_compressor: 'gauge-circle',
  energy_meter: 'plug-zap',
  gateway: 'router',
  dtu: 'antenna',
  rtu: 'radio',
  lora_gateway: 'satellite',
  plc: 'microchip',
  pump_controller: 'droplet',
  sensor: 'activity',
  solar_inverter: 'sun',
  temperature_sensor: 'thermometer',
};

const getScadaDeviceIcon = (device?: Device) => getDeviceIcon(
  device?.scadaIcon?.mode === 'preset'
    ? device.scadaIcon.iconId
    : scadaIconByDeviceType[device?.type || ''] || 'server'
);
const getScadaSvgHref = (device?: Device) => (
  device?.scadaIcon?.mode === 'svg' && device.scadaIcon.svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(device.scadaIcon.svg)}`
    : ''
);

const getDefaultLabelLayout = () => ({ x: 32, y: 24, fontSize: 13 });
const getDefaultValueLayout = (element: ScadaElement) => ({ x: 16, y: 52, fontSize: element.type === 'metric' ? 20 : 17 });
const getDefaultMetaLayout = (element: ScadaElement) => ({ x: 16, y: (element.height || 76) - 12, fontSize: 10 });
const getDefaultIconLayout = (element: ScadaElement, device?: Device) => {
  const width = element.width || 150;
  const height = element.height || 76;
  const size = Math.max(24, Math.min(42, Math.min(width, height) * 0.34));
  const baseX = width / 2 - size / 2;
  const baseY = Math.max(16, height * 0.34 - size / 2);

  if (device?.type === 'pump_controller') return { x: width - size - 22, y: baseY, size };
  if (device?.type === 'temperature_sensor' || device?.type === 'sensor') return { x: baseX, y: 18, size };
  if (device?.type === 'gateway' || device?.type === 'dtu' || device?.type === 'rtu' || device?.type === 'lora_gateway' || device?.type === 'plc') return { x: baseX, y: baseY + 2, size };
  if (device?.type === 'energy_meter' || device?.type === 'solar_inverter') return { x: baseX, y: baseY + 4, size };
  return { x: baseX, y: baseY, size };
};

const isLineElement = (element: ScadaElement) => element.type === 'pipe' || element.type === 'power';
const getElementSize = (element: ScadaElement) => ({
  width: element.width || 150,
  height: element.height || 76,
});
const getElementAnchors = (element: ScadaElement): ScadaAnchor[] => {
  if (isLineElement(element) || element.type === 'label') return [];
  const {width, height} = getElementSize(element);
  const centerY = element.y + height / 2;
  return [
    { elementId: element.id, side: 'left', x: element.x, y: centerY },
    { elementId: element.id, side: 'right', x: element.x + width, y: centerY },
  ];
};
const distanceBetween = (first: { x: number; y: number }, second: { x: number; y: number }) => Math.hypot(first.x - second.x, first.y - second.y);

export function ScadaView() {
  const navigate = useNavigate();
  const { activeSiteId, sites, devices, scadaScenesBySite, updateScadaScene } = useAppStore();
  const activeSite = sites.find((site) => site.id === activeSiteId) || sites[0];
  const fallbackScene = createBlankScene(activeSite?.id || 'factory-a', activeSite?.name || 'Site');
  const storeScene = scadaScenesBySite[activeSite?.id || 'factory-a'] || fallbackScene;
  const [draft, setDraft] = useState<ScadaScene>(storeScene);
  const [selectedElementId, setSelectedElementId] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [activeInnerPart, setActiveInnerPart] = useState<{ id: string; part: ScadaEditablePart } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (storeScene) {
      setDraft(JSON.parse(JSON.stringify(storeScene)));
      setSelectedElementId('');
      setActiveInnerPart(null);
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
  const deviceAnchors = useMemo(
    () => draft.elements.flatMap((element) => getElementAnchors(element)),
    [draft.elements]
  );
  const showDeviceAnchors = editMode && (
    selectedElement ? isLineElement(selectedElement) : dragState?.type === 'endpoint'
  );

  const findAnchor = (connection?: { elementId: string; anchor: AnchorSide }) => {
    if (!connection) return null;
    return deviceAnchors.find((anchor) => anchor.elementId === connection.elementId && anchor.side === connection.anchor) || null;
  };

  const nearestAnchor = (point: { x: number; y: number }) => {
    let nearest: { anchor: ScadaAnchor; distance: number } | null = null;
    deviceAnchors.forEach((anchor) => {
      const distance = distanceBetween(point, anchor);
      if (!nearest || distance < nearest.distance) nearest = { anchor, distance };
    });
    return nearest;
  };

  const resolveLinePoints = (element: ScadaElement) => {
    const points = element.points || [];
    if (points.length < 2) return points;
    const startAnchor = findAnchor(element.connections?.start);
    const endAnchor = findAnchor(element.connections?.end);
    return [
      startAnchor ? { x: startAnchor.x, y: startAnchor.y } : points[0],
      endAnchor ? { x: endAnchor.x, y: endAnchor.y } : points[1],
    ];
  };

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
    setActiveInnerPart(null);
  };

  const saveScene = () => {
    if (!activeSite) return;
    updateScadaScene(activeSite.id, draft);
    setActiveInnerPart(null);
    setEditMode(false);
  };

  const handlePointerDown = (event: React.PointerEvent, element: ScadaElement) => {
    if (!editMode || isLineElement(element)) return;
    event.stopPropagation();
    const point = toSvgPoint(event.clientX, event.clientY);
    setSelectedElementId(element.id);
    setActiveInnerPart(null);
    setDragState({ type: 'element', id: element.id, dx: point.x - element.x, dy: point.y - element.y });
  };

  const getInnerPartLayout = (element: ScadaElement, part: ScadaEditablePart) => {
    const {device} = getDeviceValue(element, devices);
    if (part === 'icon') return { ...getDefaultIconLayout(element, device), ...(element.iconStyle || {}) };
    if (part === 'value') return { ...getDefaultValueLayout(element), ...(element.valueStyle || {}) };
    if (part === 'meta') return { ...getDefaultMetaLayout(element), ...(element.metaStyle || {}) };
    return { ...getDefaultLabelLayout(), ...(element.labelStyle || {}) };
  };

  const activateInnerPart = (event: React.MouseEvent, element: ScadaElement, part: ScadaEditablePart) => {
    if (!editMode || (element.type !== 'device' && element.type !== 'metric')) return;
    if (part === 'icon' && element.type !== 'device') return;
    event.stopPropagation();
    setSelectedElementId(element.id);
    setActiveInnerPart({ id: element.id, part });
  };

  const handleInnerPartPointerDown = (event: React.PointerEvent, element: ScadaElement, part: ScadaEditablePart) => {
    if (!editMode || (element.type !== 'device' && element.type !== 'metric')) return;
    if (part === 'icon' && element.type !== 'device') return;
    event.stopPropagation();
    setSelectedElementId(element.id);
    if (activeInnerPart?.id !== element.id || activeInnerPart.part !== part) return;
    const point = toSvgPoint(event.clientX, event.clientY);
    const layout = getInnerPartLayout(element, part);
    setDragState({
      type: 'innerPart',
      id: element.id,
      part,
      dx: point.x - (element.x + (layout.x || 0)),
      dy: point.y - (element.y + (layout.y || 0)),
    });
  };

  const handleEndpointPointerDown = (event: React.PointerEvent, element: ScadaElement, endpoint: LineEndpoint) => {
    if (!editMode) return;
    event.stopPropagation();
    setSelectedElementId(element.id);
    const lockedAnchor = endpoint === 0
      ? findAnchor(element.connections?.start)
      : findAnchor(element.connections?.end);
    setDragState({ type: 'endpoint', id: element.id, endpoint, lockedAnchor });
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragState) return;
    const point = toSvgPoint(event.clientX, event.clientY);
    if (dragState.type === 'element') {
      updateElement(dragState.id, {
        x: Math.max(8, Math.min(CANVAS_WIDTH - 80, point.x - dragState.dx)),
        y: Math.max(8, Math.min(CANVAS_HEIGHT - 50, point.y - dragState.dy)),
      });
      return;
    }

    if (dragState.type === 'innerPart') {
      setDraft((current) => ({
        ...current,
        elements: current.elements.map((element) => {
          if (element.id !== dragState.id || (element.type !== 'device' && element.type !== 'metric')) return element;
          const width = element.width || 150;
          const height = element.height || 76;
          const nextX = Math.max(-40, Math.min(width + 40, point.x - element.x - dragState.dx));
          const nextY = Math.max(-30, Math.min(height + 40, point.y - element.y - dragState.dy));
          if (dragState.part === 'icon') {
            const {device} = getDeviceValue(element, devices);
            return {
              ...element,
              iconStyle: {
                ...getDefaultIconLayout(element, device),
                ...(element.iconStyle || {}),
                x: nextX,
                y: nextY,
              },
            };
          }
          if (dragState.part === 'value') {
            return {
              ...element,
              valueStyle: {
                ...getDefaultValueLayout(element),
                ...(element.valueStyle || {}),
                x: nextX,
                y: nextY,
              },
            };
          }
          if (dragState.part === 'meta') {
            return {
              ...element,
              metaStyle: {
                ...getDefaultMetaLayout(element),
                ...(element.metaStyle || {}),
                x: nextX,
                y: nextY,
              },
            };
          }
          return {
            ...element,
            labelStyle: {
              ...getDefaultLabelLayout(),
              ...(element.labelStyle || {}),
              x: nextX,
              y: nextY,
            },
          };
        }),
      }));
      return;
    }

    const connectionKey = dragState.endpoint === 0 ? 'start' : 'end';
    let targetPoint = {
      x: Math.max(8, Math.min(CANVAS_WIDTH - 8, point.x)),
      y: Math.max(8, Math.min(CANVAS_HEIGHT - 8, point.y)),
    };
    let targetConnection: { elementId: string; anchor: AnchorSide } | null = null;
    let nextLockedAnchor: ScadaAnchor | null = null;

    if (dragState.lockedAnchor && distanceBetween(point, dragState.lockedAnchor) <= DETACH_DISTANCE) {
      targetPoint = { x: dragState.lockedAnchor.x, y: dragState.lockedAnchor.y };
      targetConnection = { elementId: dragState.lockedAnchor.elementId, anchor: dragState.lockedAnchor.side };
      nextLockedAnchor = dragState.lockedAnchor;
    } else {
      const snapped = nearestAnchor(point);
      if (snapped && snapped.distance <= SNAP_DISTANCE) {
        targetPoint = { x: snapped.anchor.x, y: snapped.anchor.y };
        targetConnection = { elementId: snapped.anchor.elementId, anchor: snapped.anchor.side };
        nextLockedAnchor = snapped.anchor;
      }
    }

    setDragState((current) => current && current.type === 'endpoint' && current.id === dragState.id && current.endpoint === dragState.endpoint
      ? { ...current, lockedAnchor: nextLockedAnchor }
      : current
    );

    setDraft((current) => ({
      ...current,
      elements: current.elements.map((element) => {
        if (element.id !== dragState.id || !isLineElement(element)) return element;
        const points = resolveLinePoints(element);
        if (points.length < 2) return element;
        const nextPoints = [...points];
        let nextConnections = { ...(element.connections || {}) };

        nextPoints[dragState.endpoint] = targetPoint;
        if (targetConnection) {
          nextConnections[connectionKey] = targetConnection;
        } else {
          delete nextConnections[connectionKey];
        }

        return {
          ...element,
          points: nextPoints,
          connections: Object.keys(nextConnections).length ? nextConnections : undefined,
        };
      }),
    }));
  };

  const renderLine = (element: ScadaElement) => {
    const points = resolveLinePoints(element);
    if (points.length < 2) return null;
    const state = getElementState(element, devices);
    const style = stateStyles[state];
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    const active = state === 'normal' || state === 'warning';
    const isSelected = selectedElementId === element.id;
    const startConnected = Boolean(element.connections?.start);
    const endConnected = Boolean(element.connections?.end);

    return (
      <g key={element.id} onClick={(event) => { event.stopPropagation(); setSelectedElementId(element.id); }} className={cn(editMode && 'cursor-pointer')}>
        <path d={path} fill="none" stroke="rgba(15,23,42,0.75)" strokeWidth={18} strokeLinecap="round" />
        <path d={path} fill="none" stroke={style.stroke} strokeWidth={8} strokeLinecap="round" strokeDasharray={element.type === 'power' ? '12 10' : '18 12'} markerEnd={element.type === 'power' ? 'url(#scada-arrow-power)' : 'url(#scada-arrow-pipe)'} className={active ? 'scada-flow-line' : ''} />
        <text x={(points[0].x + points[points.length - 1].x) / 2} y={(points[0].y + points[points.length - 1].y) / 2 - 14} fill="#94a3b8" fontSize="12" textAnchor="middle">{element.label}</text>
        {editMode && isSelected && (
          <>
            {[0, 1].map((endpoint) => {
              const point = points[endpoint];
              const connected = endpoint === 0 ? startConnected : endConnected;
              return (
                <g key={`${element.id}-endpoint-${endpoint}`}>
                  <circle cx={point.x} cy={point.y} r={14} fill="rgba(15,23,42,0.78)" stroke={connected ? '#22c55e' : '#fb923c'} strokeWidth={2} strokeDasharray={connected ? '4 3' : undefined} />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={7}
                    fill={connected ? '#22c55e' : '#fb923c'}
                    className="cursor-crosshair"
                    onPointerDown={(event) => handleEndpointPointerDown(event, element, endpoint as LineEndpoint)}
                  />
                </g>
              );
            })}
          </>
        )}
      </g>
    );
  };

  const renderEditableText = (
    element: ScadaElement,
    part: Exclude<ScadaEditablePart, 'icon'>,
    text: string,
    layout: { x?: number; y?: number; fontSize?: number },
    options: { fill: string; fontWeight?: string | number; fontFamily?: string } = { fill: '#e5e7eb' }
  ) => {
    const fontSize = layout.fontSize || 13;
    const active = activeInnerPart?.id === element.id && activeInnerPart.part === part;
    const canEdit = editMode && (element.type === 'device' || element.type === 'metric');
    return (
      <g
        className={cn(canEdit && (active ? 'cursor-move' : 'cursor-pointer'))}
        onClick={(event) => canEdit && event.stopPropagation()}
        onDoubleClick={(event) => activateInnerPart(event, element, part)}
        onPointerDown={(event) => handleInnerPartPointerDown(event, element, part)}
      >
        <text
          x={element.x + (layout.x || 0)}
          y={element.y + (layout.y || 0)}
          fill={options.fill}
          fontSize={fontSize}
          fontWeight={options.fontWeight}
          fontFamily={options.fontFamily}
        >
          {text}
        </text>
        {canEdit && active && (
          <rect
            x={element.x + (layout.x || 0) - 4}
            y={element.y + (layout.y || 0) - fontSize - 3}
            width={Math.max(56, text.length * fontSize * 0.62)}
            height={fontSize + 8}
            rx={4}
            fill="none"
            stroke="#fb923c"
            strokeDasharray="4 3"
          />
        )}
      </g>
    );
  };

  const renderDeviceGraphic = (element: ScadaElement, device: Device | undefined, style: typeof stateStyles.normal, isSelected: boolean, state: string) => {
    const width = element.width || 150;
    const height = element.height || 76;
    const x = element.x;
    const y = element.y;
    const Icon = getScadaDeviceIcon(device);
    const svgHref = getScadaSvgHref(device);
    const stroke = isSelected ? '#fb923c' : style.stroke;
    const commonProps = {
      fill: style.fill,
      stroke,
      strokeWidth: isSelected ? 3 : 2,
      className: state === 'critical' ? 'scada-alarm-pulse' : undefined,
    };
    const iconLayout = { ...getDefaultIconLayout(element, device), ...(element.iconStyle || {}) };
    const iconSize = iconLayout.size || 32;
    const iconX = x + (iconLayout.x || 0);
    const iconY = y + (iconLayout.y || 0);
    const deviceType = device?.type || 'default';
    const iconActive = activeInnerPart?.id === element.id && activeInnerPart.part === 'icon';
    const renderIcon = () => (
      <g
        className={cn(editMode && (iconActive ? 'cursor-move' : 'cursor-pointer'))}
        onClick={(event) => editMode && event.stopPropagation()}
        onDoubleClick={(event) => activateInnerPart(event, element, 'icon')}
        onPointerDown={(event) => handleInnerPartPointerDown(event, element, 'icon')}
      >
        {svgHref
          ? <image href={svgHref} x={iconX} y={iconY} width={iconSize} height={iconSize} preserveAspectRatio="xMidYMid meet" />
          : <Icon x={iconX} y={iconY} width={iconSize} height={iconSize} color={style.text} strokeWidth={2.2} />}
        {editMode && iconActive && (
          <rect x={iconX - 4} y={iconY - 4} width={iconSize + 8} height={iconSize + 8} rx={4} fill="none" stroke="#fb923c" strokeDasharray="4 3" />
        )}
      </g>
    );

    if (deviceType === 'air_compressor') {
      return (
        <>
          <rect x={x + 8} y={y + 18} width={width - 16} height={height - 34} rx={(height - 34) / 2} {...commonProps} />
          <circle cx={x + width - 28} cy={y + 20} r={12} fill="#0f172a" stroke={stroke} strokeWidth="2" />
          <line x1={x + 34} y1={y + height - 16} x2={x + 34} y2={y + height - 8} stroke={stroke} strokeWidth="3" strokeLinecap="round" />
          <line x1={x + width - 34} y1={y + height - 16} x2={x + width - 34} y2={y + height - 8} stroke={stroke} strokeWidth="3" strokeLinecap="round" />
          {renderIcon()}
        </>
      );
    }

    if (deviceType === 'pump_controller') {
      const radius = Math.min(height * 0.36, width * 0.22);
      return (
        <>
          <circle cx={x + 46} cy={y + height / 2} r={radius} {...commonProps} />
          <rect x={x + 58} y={y + height * 0.28} width={width - 72} height={height * 0.44} rx={8} {...commonProps} />
          <circle cx={x + 46} cy={y + height / 2} r={radius * 0.42} fill="#020617" stroke={stroke} strokeWidth="2" />
          {renderIcon()}
        </>
      );
    }

    if (deviceType === 'temperature_sensor' || deviceType === 'sensor') {
      const sensorWidth = Math.max(44, Math.min(64, width * 0.34));
      const sensorX = x + width / 2 - sensorWidth / 2;
      return (
        <>
          <rect x={sensorX} y={y + 8} width={sensorWidth} height={height - 16} rx={sensorWidth / 2} {...commonProps} />
          <circle cx={x + width / 2} cy={y + height - 24} r={sensorWidth * 0.28} fill="#020617" stroke={stroke} strokeWidth="2" />
          {renderIcon()}
        </>
      );
    }

    if (deviceType === 'gateway' || deviceType === 'dtu' || deviceType === 'rtu' || deviceType === 'lora_gateway' || deviceType === 'plc') {
      return (
        <>
          <rect x={x + 12} y={y + 10} width={width - 24} height={height - 20} rx={10} {...commonProps} />
          <rect x={x + 24} y={y + 22} width={width - 48} height={12} rx={3} fill="#020617" stroke="rgba(148,163,184,0.35)" />
          <circle cx={x + 32} cy={y + height - 22} r={4} fill={style.badge} />
          <circle cx={x + 46} cy={y + height - 22} r={4} fill="#334155" />
          <circle cx={x + 60} cy={y + height - 22} r={4} fill="#334155" />
          {renderIcon()}
        </>
      );
    }

    if (deviceType === 'energy_meter' || deviceType === 'solar_inverter') {
      return (
        <>
          <rect x={x + 14} y={y + 8} width={width - 28} height={height - 16} rx={8} {...commonProps} />
          <rect x={x + 28} y={y + 22} width={width - 56} height={18} rx={4} fill="#020617" stroke="rgba(148,163,184,0.35)" />
          <line x1={x + 28} y1={y + height - 22} x2={x + width - 28} y2={y + height - 22} stroke={stroke} strokeWidth="2" strokeDasharray="4 4" />
          {renderIcon()}
        </>
      );
    }

    return (
      <>
        <rect x={x} y={y} width={width} height={height} rx={10} {...commonProps} />
        {renderIcon()}
      </>
    );
  };

  const renderElement = (element: ScadaElement) => {
    if (isLineElement(element)) return renderLine(element);

    const {device, value} = getDeviceValue(element, devices);
    const state = getElementState(element, devices);
    const style = stateStyles[state];
    const width = element.width || 150;
    const height = element.height || 76;
    const isSelected = selectedElementId === element.id;
    const labelLayout = { ...getDefaultLabelLayout(), ...(element.labelStyle || {}) };
    const valueLayout = { ...getDefaultValueLayout(element), ...(element.valueStyle || {}) };
    const metaLayout = { ...getDefaultMetaLayout(element), ...(element.metaStyle || {}) };
    const metaText = device ? `${device.name} / ${element.metricKey || '-'}` : 'Unbound';

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
          if (activeInnerPart?.id !== element.id) setActiveInnerPart(null);
          if (!editMode && element.deviceId) navigate(`/devices/${element.deviceId}`);
        }}
        className={cn(editMode ? 'cursor-move' : element.deviceId && 'cursor-pointer')}
      >
        {element.type === 'device' ? (
          renderDeviceGraphic(element, device, style, isSelected, state)
        ) : (
          <rect x={element.x} y={element.y} width={width} height={height} rx={8} fill={style.fill} stroke={isSelected ? '#fb923c' : style.stroke} strokeWidth={isSelected ? 3 : 2} className={state === 'critical' ? 'scada-alarm-pulse' : ''} />
        )}
        <circle cx={element.x + 18} cy={element.y + 20} r={5} fill={style.badge} />
        {renderEditableText(element, 'label', element.label, labelLayout, { fill: '#e5e7eb', fontWeight: 700 })}
        {renderEditableText(element, 'value', formatMetricValue(value, element.unit), valueLayout, { fill: style.text, fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' })}
        {renderEditableText(element, 'meta', metaText, metaLayout, { fill: '#94a3b8' })}
      </g>
    );
  };

  const renderDeviceAnchors = () => {
    if (!showDeviceAnchors) return null;
    return (
      <g pointerEvents="none">
        {deviceAnchors.map((anchor) => (
          <g key={`${anchor.elementId}-${anchor.side}-anchor`}>
            <line
              x1={anchor.side === 'left' ? anchor.x - 18 : anchor.x + 18}
              y1={anchor.y}
              x2={anchor.x}
              y2={anchor.y}
              stroke="#93c5fd"
              strokeWidth={2}
              strokeDasharray="4 4"
            />
            <circle cx={anchor.x} cy={anchor.y} r={7} fill="#020617" stroke="#93c5fd" strokeWidth={2} strokeDasharray="3 3" />
          </g>
        ))}
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
              onClick={() => {
                if (!editMode) return;
                setSelectedElementId('');
                setActiveInnerPart(null);
              }}
            >
              <defs>
                <linearGradient id="scada-bg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0f172a" />
                  <stop offset="100%" stopColor="#020617" />
                </linearGradient>
                <marker id="scada-arrow-power" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#f97316" />
                </marker>
                <marker id="scada-arrow-pipe" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
                </marker>
              </defs>
              <rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#scada-bg)" opacity="0.72" />
              <rect x="36" y="110" width="1028" height="420" rx="18" fill="rgba(15,23,42,0.46)" stroke="#1e293b" strokeWidth="2" />
              <text x="54" y="558" fill="#64748b" fontSize="12">Click devices to open details. Enable Edit Mode to move and bind elements.</text>
              {draft.elements.map(renderElement)}
              {renderDeviceAnchors()}
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
              {(selectedElement.type === 'device' || selectedElement.type === 'metric') && (() => {
                const selectedDevice = devices.find((device) => device.id === selectedElement.deviceId || device.config?.externalDeviceId === selectedElement.deviceId);
                const labelLayout = { ...getDefaultLabelLayout(), ...(selectedElement.labelStyle || {}) };
                const iconLayout = { ...getDefaultIconLayout(selectedElement, selectedDevice), ...(selectedElement.iconStyle || {}) };
                const valueLayout = { ...getDefaultValueLayout(selectedElement), ...(selectedElement.valueStyle || {}) };
                const metaLayout = { ...getDefaultMetaLayout(selectedElement), ...(selectedElement.metaStyle || {}) };
                const renderTextLayoutControls = (
                  title: string,
                  part: Exclude<ScadaEditablePart, 'icon'>,
                  layout: { x?: number; y?: number; fontSize?: number },
                  styleKey: 'labelStyle' | 'valueStyle' | 'metaStyle',
                  min = 8,
                  max = 64
                ) => (
                  <div className="rounded border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-2 flex items-center justify-between">
                      <span className={cn("text-xs font-semibold", activeInnerPart?.id === selectedElement.id && activeInnerPart.part === part ? "text-orange-500" : "text-slate-600 dark:text-slate-300")}>{title}</span>
                      <button type="button" onClick={() => updateElement(selectedElement.id, { [styleKey]: undefined } as Partial<ScadaElement>)} className="text-xs text-slate-500 hover:text-orange-500">Reset</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                        X
                        <input type="number" value={Math.round(layout.x || 0)} onChange={(event) => updateElement(selectedElement.id, { [styleKey]: { ...layout, x: Number(event.target.value) } } as Partial<ScadaElement>)} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                      </label>
                      <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                        Y
                        <input type="number" value={Math.round(layout.y || 0)} onChange={(event) => updateElement(selectedElement.id, { [styleKey]: { ...layout, y: Number(event.target.value) } } as Partial<ScadaElement>)} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                      </label>
                      <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                        Size
                        <input type="number" min={min} max={max} value={Math.round(layout.fontSize || 13)} onChange={(event) => updateElement(selectedElement.id, { [styleKey]: { ...layout, fontSize: Number(event.target.value) } } as Partial<ScadaElement>)} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                      </label>
                    </div>
                  </div>
                );
                return (
                  <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Inner Layout</div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Double-click text, value, metric info, or icon on the canvas, then drag it. Values are relative to the element box.</p>
                    </div>
                    {renderTextLayoutControls('Title', 'label', labelLayout, 'labelStyle', 8, 48)}
                    {renderTextLayoutControls('Reading', 'value', valueLayout, 'valueStyle', 10, 72)}
                    {renderTextLayoutControls('Device / Metric', 'meta', metaLayout, 'metaStyle', 8, 36)}
                    {selectedElement.type === 'device' && (
                      <div className="rounded border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                        <div className="mb-2 flex items-center justify-between">
                          <span className={cn("text-xs font-semibold", activeInnerPart?.id === selectedElement.id && activeInnerPart.part === 'icon' ? "text-orange-500" : "text-slate-600 dark:text-slate-300")}>Icon</span>
                          <button type="button" onClick={() => updateElement(selectedElement.id, { iconStyle: undefined })} className="text-xs text-slate-500 hover:text-orange-500">Reset</button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            X
                            <input type="number" value={Math.round(iconLayout.x || 0)} onChange={(event) => updateElement(selectedElement.id, { iconStyle: { ...iconLayout, x: Number(event.target.value) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                          </label>
                          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            Y
                            <input type="number" value={Math.round(iconLayout.y || 0)} onChange={(event) => updateElement(selectedElement.id, { iconStyle: { ...iconLayout, y: Number(event.target.value) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                          </label>
                          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            Size
                            <input type="number" min={12} max={120} value={Math.round(iconLayout.size || 32)} onChange={(event) => updateElement(selectedElement.id, { iconStyle: { ...iconLayout, size: Number(event.target.value) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
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
