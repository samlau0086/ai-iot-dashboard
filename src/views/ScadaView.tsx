import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Cpu, Droplets, Gauge, Move, Network, Save, Trash2, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, type ScadaElement, type ScadaElementType, type ScadaScene, type ScadaShapePreset, type ScadaShapePrimitive, type ScadaShapePrimitiveType, type ScadaShapeEndpoint } from '../lib/store';
import { getDeviceIcon } from '../lib/icons';
import { scadaIconPresets } from '../lib/scadaIconPresets';
import { cn } from '../lib/utils';
import { confirmDelete } from '../lib/confirm';
import type { Device } from '../types';

const CANVAS_WIDTH = 1100;
const CANVAS_HEIGHT = 620;
const SNAP_DISTANCE = 28;
const DETACH_DISTANCE = 52;

type AnchorSide = string;
type LineEndpoint = 0 | 1;
type ScadaEditablePart = 'label' | 'icon' | 'value' | 'meta';
type ScadaAnchor = {
  elementId: string;
  side: AnchorSide;
  label: string;
  x: number;
  y: number;
};
type DragState =
  | { type: 'element'; id: string; dx: number; dy: number }
  | { type: 'endpoint'; id: string; endpoint: LineEndpoint; lockedAnchor?: ScadaAnchor | null }
  | { type: 'innerPart'; id: string; part: ScadaEditablePart; dx: number; dy: number }
  | { type: 'resize'; id: string; startX: number; startY: number; startWidth: number; startHeight: number };
type ShapeEditorDragState =
  | { type: 'move'; id: string; dx: number; dy: number }
  | { type: 'resize'; id: string; startX: number; startY: number; startWidth: number; startHeight: number }
  | { type: 'endpoint'; id: string; dx: number; dy: number }
  | { type: 'rotationCenter'; id: string; dx: number; dy: number };

const elementTypes: Array<{ type: ScadaElementType; label: string; icon: any }> = [
  { type: 'device', label: 'Device', icon: Cpu },
  { type: 'metric', label: 'Metric', icon: Gauge },
  { type: 'pipe', label: 'Pipe', icon: Droplets },
  { type: 'power', label: 'Power Line', icon: Zap },
  { type: 'label', label: 'Label', icon: Activity },
];
const shapePresets = [
  { id: 'auto', label: 'Auto' },
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'soft-panel', label: 'Soft Panel' },
  { id: 'capsule', label: 'Capsule' },
  { id: 'circle', label: 'Circle' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'octagon', label: 'Octagon' },
  { id: 'tag', label: 'Tag' },
  { id: 'notched', label: 'Notched' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'double', label: 'Double Border' },
];
const createShapeId = () => `custom-shape-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const createPrimitiveId = () => `primitive-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const createEndpointId = () => `endpoint-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const createPrimitive = (type: ScadaShapePrimitiveType): ScadaShapePrimitive => {
  const base = { id: createPrimitiveId(), type, x: 12, y: 12, strokeMode: 'state' as const, fillMode: 'panel' as const, strokeWidth: 2, opacity: 1 };
  if (type === 'ellipse') return { ...base, width: 42, height: 38, fillMode: 'state' };
  if (type === 'line') return { ...base, x: 16, y: 50, width: 68, height: 0, fillMode: 'none', strokeMode: 'muted' };
  if (type === 'polygon') return { ...base, x: 16, y: 16, width: 68, height: 68, points: [{ x: 14, y: 0 }, { x: 86, y: 0 }, { x: 100, y: 50 }, { x: 86, y: 100 }, { x: 14, y: 100 }, { x: 0, y: 50 }], fillMode: 'state' };
  if (type === 'propeller') return { ...base, x: 30, y: 28, width: 40, height: 44, fillMode: 'accent', strokeMode: 'state' };
  if (type === 'valve') return { ...base, x: 18, y: 32, width: 64, height: 36, fillMode: 'panel', strokeMode: 'state' };
  if (type === 'arrow') return { ...base, x: 16, y: 38, width: 68, height: 24, fillMode: 'accent', strokeMode: 'accent' };
  if (type === 'busbar') return { ...base, x: 18, y: 28, width: 64, height: 44, fillMode: 'none', strokeMode: 'state', strokeWidth: 3 };
  if (type === 'terminal') return { ...base, x: 22, y: 28, width: 56, height: 44, fillMode: 'panel', strokeMode: 'state' };
  if (type === 'bracket') return { ...base, x: 12, y: 18, width: 76, height: 64, fillMode: 'none', strokeMode: 'muted', strokeWidth: 3 };
  if (type === 'tank') return { ...base, x: 24, y: 12, width: 52, height: 76, fillMode: 'state', strokeMode: 'state' };
  if (type === 'svgIcon') return { ...base, x: 24, y: 18, width: 52, height: 52, fillMode: 'none', strokeMode: 'none' };
  return { ...base, width: 76, height: 76, rx: 8, fillMode: 'state' };
};
const primitiveTypes: ScadaShapePrimitiveType[] = ['rect', 'ellipse', 'line', 'polygon', 'propeller', 'valve', 'arrow', 'busbar', 'terminal', 'bracket', 'tank'];

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
const isResizableElement = (element: ScadaElement) => !isLineElement(element);
const getShapePreset = (element: ScadaElement) => element.shapePreset || (element.type === 'device' ? 'auto' : 'rounded');
const getElementSize = (element: ScadaElement) => ({
  width: element.width || 150,
  height: element.height || 76,
});
const defaultElementEndpoints: ScadaShapeEndpoint[] = [
  { id: 'left', label: 'Left', x: 0, y: 50 },
  { id: 'right', label: 'Right', x: 100, y: 50 },
];
const distanceBetween = (first: { x: number; y: number }, second: { x: number; y: number }) => Math.hypot(first.x - second.x, first.y - second.y);
const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const getPrimitiveCenter = (primitive: ScadaShapePrimitive) => ({
  x: primitive.x + (primitive.width ?? 32) / 2,
  y: primitive.y + (primitive.height ?? 32) / 2,
});
const shouldPlayPrimitiveAnimation = (
  primitive: ScadaShapePrimitive,
  device: Device | undefined,
  elementState: string | undefined,
  fallbackMetricKey: string | undefined,
  fallbackMetricValue: number | undefined,
) => {
  const animation = primitive.animation;
  const trigger = animation?.trigger || 'always';
  if (!animation || animation.type === 'none' || trigger === 'always') return true;
  if (trigger === 'deviceOnline') return Boolean(device?.lastSeen && device.status !== 'offline');
  if (trigger === 'deviceStatus') return Boolean(animation.deviceStatus && (device?.status === animation.deviceStatus || elementState === animation.deviceStatus));

  const metricKey = animation.metricKey || fallbackMetricKey;
  const rawMetric = metricKey ? device?.metrics?.[metricKey] : fallbackMetricValue;
  const numericMetric = Number(rawMetric);

  if (trigger === 'metricNonZero') return Number.isFinite(numericMetric) && numericMetric !== 0;
  if (trigger === 'metricGreaterThan') return Number.isFinite(numericMetric) && numericMetric > Number(animation.operatorValue ?? 0);
  if (trigger === 'metricEquals') return String(rawMetric ?? '') === String(animation.operatorValue ?? '');
  return true;
};

export function ScadaView() {
  const navigate = useNavigate();
  const {
    activeSiteId,
    sites,
    devices,
    scadaScenesBySite,
    scadaShapePresets,
    updateScadaScene,
    addScadaShapePreset,
    updateScadaShapePreset,
    deleteScadaShapePreset,
  } = useAppStore();
  const activeSite = sites.find((site) => site.id === activeSiteId) || sites[0];
  const fallbackScene = createBlankScene(activeSite?.id || 'factory-a', activeSite?.name || 'Site');
  const storeScene = scadaScenesBySite[activeSite?.id || 'factory-a'] || fallbackScene;
  const [draft, setDraft] = useState<ScadaScene>(storeScene);
  const [selectedElementId, setSelectedElementId] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [activeInnerPart, setActiveInnerPart] = useState<{ id: string; part: ScadaEditablePart } | null>(null);
  const [shapeManagerOpen, setShapeManagerOpen] = useState(false);
  const [editingShape, setEditingShape] = useState<ScadaShapePreset | null>(null);
  const [selectedPrimitiveId, setSelectedPrimitiveId] = useState('');
  const [selectedEndpointId, setSelectedEndpointId] = useState('');
  const [selectedIconPresetId, setSelectedIconPresetId] = useState(scadaIconPresets[0]?.id || '');
  const [shapeEditorDragState, setShapeEditorDragState] = useState<ShapeEditorDragState | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const shapeEditorSvgRef = useRef<SVGSVGElement | null>(null);

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
  const customShapeById = useMemo(
    () => Object.fromEntries(scadaShapePresets.map((preset) => [preset.id, preset])) as Record<string, ScadaShapePreset>,
    [scadaShapePresets]
  );
  const selectableShapePresets = useMemo(
    () => [
      ...shapePresets,
      ...scadaShapePresets.map((preset) => ({ id: preset.id, label: `Custom / ${preset.name}` })),
    ],
    [scadaShapePresets]
  );
  const metricOptions = useMemo(() => {
    const device = devices.find((item) => item.id === selectedElement?.deviceId);
    return Object.keys(device?.metrics || {}).sort();
  }, [devices, selectedElement?.deviceId]);
  const getElementAnchors = (element: ScadaElement): ScadaAnchor[] => {
    if (isLineElement(element) || element.type === 'label') return [];
    const {width, height} = getElementSize(element);
    const shapeId = getShapePreset(element);
    const endpoints = customShapeById[shapeId]?.endpoints?.length
      ? customShapeById[shapeId].endpoints || defaultElementEndpoints
      : defaultElementEndpoints;
    return endpoints.map((endpoint) => ({
      elementId: element.id,
      side: endpoint.id,
      label: endpoint.label || endpoint.id,
      x: element.x + (endpoint.x / 100) * width,
      y: element.y + (endpoint.y / 100) * height,
    }));
  };
  const deviceAnchors = useMemo(
    () => draft.elements.flatMap((element) => getElementAnchors(element)),
    [draft.elements, customShapeById]
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

  const toShapeEditorPoint = (clientX: number, clientY: number) => {
    const svg = shapeEditorSvgRef.current;
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
    const element = draft.elements.find((item) => item.id === id);
    if (!confirmDelete({ title: 'Delete SCADA element', itemName: element?.label || 'this SCADA element', description: 'The element will be removed from the current SCADA scene.' })) return;
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

  const startNewShape = () => {
    const primitive = createPrimitive('rect');
    setEditingShape({
      id: createShapeId(),
      name: `Custom Shape ${scadaShapePresets.length + 1}`,
      primitives: [primitive],
      endpoints: [
        { id: 'left', label: 'Left', x: 0, y: 50 },
        { id: 'right', label: 'Right', x: 100, y: 50 },
      ],
      createdAt: new Date().toISOString(),
    });
    setSelectedPrimitiveId(primitive.id);
    setSelectedEndpointId('');
  };

  const startEditShape = (preset: ScadaShapePreset) => {
    const copy = JSON.parse(JSON.stringify(preset)) as ScadaShapePreset;
    if (!copy.endpoints?.length) copy.endpoints = [...defaultElementEndpoints];
    setEditingShape(copy);
    setSelectedPrimitiveId(copy.primitives[0]?.id || '');
    setSelectedEndpointId('');
  };

  const updateEditingPrimitive = (id: string, patch: Partial<ScadaShapePrimitive>) => {
    setEditingShape((current) => current ? {
      ...current,
      primitives: current.primitives.map((primitive) => primitive.id === id ? { ...primitive, ...patch } : primitive),
    } : current);
  };

  const handleShapePrimitivePointerDown = (event: React.PointerEvent, primitive: ScadaShapePrimitive) => {
    event.stopPropagation();
    const point = toShapeEditorPoint(event.clientX, event.clientY);
    setSelectedPrimitiveId(primitive.id);
    setSelectedEndpointId('');
    setShapeEditorDragState({ type: 'move', id: primitive.id, dx: point.x - primitive.x, dy: point.y - primitive.y });
  };

  const handleShapePrimitiveResizePointerDown = (event: React.PointerEvent, primitive: ScadaShapePrimitive) => {
    event.stopPropagation();
    const point = toShapeEditorPoint(event.clientX, event.clientY);
    setSelectedPrimitiveId(primitive.id);
    setSelectedEndpointId('');
    setShapeEditorDragState({
      type: 'resize',
      id: primitive.id,
      startX: point.x,
      startY: point.y,
      startWidth: primitive.width ?? 32,
      startHeight: primitive.height ?? 32,
    });
  };

  const handleShapeEndpointPointerDown = (event: React.PointerEvent, endpoint: ScadaShapeEndpoint) => {
    event.stopPropagation();
    const point = toShapeEditorPoint(event.clientX, event.clientY);
    setSelectedEndpointId(endpoint.id);
    setSelectedPrimitiveId('');
    setShapeEditorDragState({ type: 'endpoint', id: endpoint.id, dx: point.x - endpoint.x, dy: point.y - endpoint.y });
  };

  const handleShapeRotationCenterPointerDown = (event: React.PointerEvent, primitive: ScadaShapePrimitive) => {
    event.stopPropagation();
    const point = toShapeEditorPoint(event.clientX, event.clientY);
    const center = getPrimitiveCenter(primitive);
    const centerX = primitive.rotation?.centerX ?? center.x;
    const centerY = primitive.rotation?.centerY ?? center.y;
    setSelectedPrimitiveId(primitive.id);
    setSelectedEndpointId('');
    setShapeEditorDragState({ type: 'rotationCenter', id: primitive.id, dx: point.x - centerX, dy: point.y - centerY });
  };

  const handleShapeEditorPointerMove = (event: React.PointerEvent) => {
    if (!shapeEditorDragState) return;
    const point = toShapeEditorPoint(event.clientX, event.clientY);
    const primitive = editingShape?.primitives.find((item) => item.id === shapeEditorDragState.id);
    const endpoint = editingShape?.endpoints?.find((item) => item.id === shapeEditorDragState.id);
    if (shapeEditorDragState.type === 'endpoint' && endpoint) {
      updateEditingEndpoint(endpoint.id, {
        x: clampPercent(point.x - shapeEditorDragState.dx),
        y: clampPercent(point.y - shapeEditorDragState.dy),
      });
      return;
    }
    if (!primitive) return;

    if (shapeEditorDragState.type === 'move') {
      const width = primitive.width ?? 24;
      const height = primitive.height ?? 24;
      updateEditingPrimitive(primitive.id, {
        x: clampPercent(Math.min(100 - width, point.x - shapeEditorDragState.dx)),
        y: clampPercent(Math.min(100 - height, point.y - shapeEditorDragState.dy)),
      });
      return;
    }

    if (shapeEditorDragState.type === 'rotationCenter') {
      updateEditingPrimitive(primitive.id, {
        rotation: {
          ...(primitive.rotation || {}),
          centerX: clampPercent(point.x - shapeEditorDragState.dx),
          centerY: clampPercent(point.y - shapeEditorDragState.dy),
        },
      });
      return;
    }

    if (shapeEditorDragState.type === 'resize') {
      updateEditingPrimitive(primitive.id, {
        width: Math.max(4, Math.min(100 - primitive.x, Math.round(shapeEditorDragState.startWidth + point.x - shapeEditorDragState.startX))),
        height: Math.max(primitive.type === 'line' ? 0 : 4, Math.min(100 - primitive.y, Math.round(shapeEditorDragState.startHeight + point.y - shapeEditorDragState.startY))),
      });
    }
  };

  const addEditingPrimitive = (type: ScadaShapePrimitiveType) => {
    const primitive = createPrimitive(type);
    setEditingShape((current) => current ? { ...current, primitives: [...current.primitives, primitive] } : current);
    setSelectedPrimitiveId(primitive.id);
    setSelectedEndpointId('');
  };

  const addEditingIconPreset = () => {
    const preset = scadaIconPresets.find((item) => item.id === selectedIconPresetId) || scadaIconPresets[0];
    if (!preset) return;
    const primitive = {
      ...createPrimitive('svgIcon'),
      iconUrl: preset.url,
      iconName: preset.name,
    };
    setEditingShape((current) => current ? { ...current, primitives: [...current.primitives, primitive] } : current);
    setSelectedPrimitiveId(primitive.id);
    setSelectedEndpointId('');
  };

  const updateEditingEndpoint = (id: string, patch: Partial<ScadaShapeEndpoint>) => {
    setEditingShape((current) => current ? {
      ...current,
      endpoints: (current.endpoints || defaultElementEndpoints).map((endpoint) => endpoint.id === id ? { ...endpoint, ...patch } : endpoint),
    } : current);
  };

  const addEditingEndpoint = () => {
    const endpoint: ScadaShapeEndpoint = {
      id: createEndpointId(),
      label: `Endpoint ${(editingShape?.endpoints?.length || 0) + 1}`,
      x: 50,
      y: 50,
    };
    setEditingShape((current) => current ? { ...current, endpoints: [...(current.endpoints || defaultElementEndpoints), endpoint] } : current);
    setSelectedEndpointId(endpoint.id);
    setSelectedPrimitiveId('');
  };

  const removeEditingEndpoint = (id: string) => {
    const endpoint = (editingShape?.endpoints || defaultElementEndpoints).find((item) => item.id === id);
    if (!confirmDelete({ title: 'Delete connection endpoint', itemName: endpoint?.label || 'this endpoint', description: 'Lines will no longer snap to this custom endpoint.' })) return;
    setEditingShape((current) => {
      if (!current) return current;
      const endpoints = (current.endpoints || defaultElementEndpoints).filter((endpoint) => endpoint.id !== id);
      setSelectedEndpointId(endpoints[0]?.id || '');
      return { ...current, endpoints };
    });
  };

  const removeEditingPrimitive = (id: string) => {
    const primitive = editingShape?.primitives.find((item) => item.id === id);
    if (!confirmDelete({ title: 'Delete shape layer', itemName: primitive?.type || 'this layer', description: 'This primitive will be removed from the custom shape.' })) return;
    setEditingShape((current) => {
      if (!current || current.primitives.length <= 1) return current;
      const nextPrimitives = current.primitives.filter((primitive) => primitive.id !== id);
      setSelectedPrimitiveId(nextPrimitives[0]?.id || '');
      return { ...current, primitives: nextPrimitives };
    });
  };

  const moveEditingPrimitive = (id: string, direction: 'front' | 'back' | 'up' | 'down') => {
    setEditingShape((current) => {
      if (!current) return current;
      const index = current.primitives.findIndex((primitive) => primitive.id === id);
      if (index < 0) return current;
      const nextPrimitives = [...current.primitives];
      const [primitive] = nextPrimitives.splice(index, 1);
      if (direction === 'front') nextPrimitives.push(primitive);
      if (direction === 'back') nextPrimitives.unshift(primitive);
      if (direction === 'up') nextPrimitives.splice(Math.min(nextPrimitives.length, index + 1), 0, primitive);
      if (direction === 'down') nextPrimitives.splice(Math.max(0, index - 1), 0, primitive);
      return { ...current, primitives: nextPrimitives };
    });
  };

  const saveEditingShape = () => {
    if (!editingShape || !editingShape.name.trim()) return;
    const savedShape = {
      ...editingShape,
      name: editingShape.name.trim(),
      primitives: editingShape.primitives.length ? editingShape.primitives : [createPrimitive('rect')],
      endpoints: editingShape.endpoints?.length ? editingShape.endpoints : [...defaultElementEndpoints],
    };
    if (scadaShapePresets.some((preset) => preset.id === savedShape.id)) {
      updateScadaShapePreset(savedShape.id, savedShape);
    } else {
      addScadaShapePreset(savedShape);
    }
    setEditingShape(null);
    setSelectedPrimitiveId('');
    setSelectedEndpointId('');
  };

  const deleteShape = (preset: ScadaShapePreset) => {
    if (!confirmDelete({ title: 'Delete custom shape', itemName: preset.name, description: 'Elements using this shape will fall back to the default SCADA frame.' })) return;
    deleteScadaShapePreset(preset.id);
    if (editingShape?.id === preset.id) {
      setEditingShape(null);
      setSelectedPrimitiveId('');
      setSelectedEndpointId('');
    }
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

  const handleResizePointerDown = (event: React.PointerEvent, element: ScadaElement) => {
    if (!editMode || !isResizableElement(element)) return;
    event.stopPropagation();
    const point = toSvgPoint(event.clientX, event.clientY);
    const {width, height} = getElementSize(element);
    setSelectedElementId(element.id);
    setActiveInnerPart(null);
    setDragState({ type: 'resize', id: element.id, startX: point.x, startY: point.y, startWidth: width, startHeight: height });
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

    if (dragState.type === 'resize') {
      const nextWidth = Math.max(60, Math.min(CANVAS_WIDTH, dragState.startWidth + point.x - dragState.startX));
      const nextHeight = Math.max(36, Math.min(CANVAS_HEIGHT, dragState.startHeight + point.y - dragState.startY));
      updateElement(dragState.id, {
        width: Math.round(nextWidth),
        height: Math.round(nextHeight),
      });
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

  const renderPrimitiveMotion = (
    primitive: ScadaShapePrimitive,
    content: React.ReactNode,
    mapX: (value?: number) => number,
    mapY: (value?: number) => number,
    shouldPlayAnimation = true
  ) => {
    const primitiveCenter = getPrimitiveCenter(primitive);
    const rotationCenterX = mapX(primitive.rotation?.centerX ?? primitiveCenter.x);
    const rotationCenterY = mapY(primitive.rotation?.centerY ?? primitiveCenter.y);
    const animation = shouldPlayAnimation ? primitive.animation : undefined;
    const duration = Math.max(0.2, animation?.durationSeconds || 2);
    const staticRotation = primitive.rotation?.angle
      ? `rotate(${primitive.rotation.angle} ${rotationCenterX} ${rotationCenterY})`
      : undefined;

    if (animation?.type === 'scale') {
      const centerX = mapX(animation.centerX ?? primitive.rotation?.centerX ?? primitiveCenter.x);
      const centerY = mapY(animation.centerY ?? primitive.rotation?.centerY ?? primitiveCenter.y);
      const from = animation.scaleFrom ?? 1;
      const to = animation.scaleTo ?? 1.12;
      return (
        <g key={primitive.id} transform={`translate(${centerX} ${centerY})`}>
          <animateTransform attributeName="transform" type="scale" values={`${from};${to};${from}`} dur={`${duration}s`} repeatCount="indefinite" additive="sum" />
          <g transform={`translate(${-centerX} ${-centerY})`}>
            <g transform={staticRotation}>{content}</g>
          </g>
        </g>
      );
    }

    if (animation?.type === 'visibility') {
      const visibleSeconds = Math.max(0.1, animation.visibleSeconds ?? 1);
      const hiddenSeconds = Math.max(0.1, animation.hiddenSeconds ?? 1);
      const totalSeconds = visibleSeconds + hiddenSeconds;
      const visibleRatio = Math.max(0.01, Math.min(0.99, visibleSeconds / totalSeconds));
      return (
        <g key={primitive.id} transform={staticRotation}>
          <animate
            attributeName="opacity"
            values="1;1;0;0"
            keyTimes={`0;${visibleRatio};${visibleRatio};1`}
            dur={`${totalSeconds}s`}
            repeatCount="indefinite"
          />
          {content}
        </g>
      );
    }

    return (
      <g key={primitive.id} transform={staticRotation}>
        {animation?.type === 'rotate' && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            values={`${animation.rotateFrom ?? 0} ${rotationCenterX} ${rotationCenterY};${animation.rotateTo ?? 360} ${rotationCenterX} ${rotationCenterY}`}
            dur={`${duration}s`}
            repeatCount="indefinite"
            additive="sum"
          />
        )}
        {animation?.type === 'translate' && (
          <animateTransform
            attributeName="transform"
            type="translate"
            values={`${mapX(animation.fromX ?? primitive.x) - mapX(primitive.x)} ${mapY(animation.fromY ?? primitive.y) - mapY(primitive.y)};${mapX(animation.toX ?? primitive.x) - mapX(primitive.x)} ${mapY(animation.toY ?? primitive.y) - mapY(primitive.y)};${mapX(animation.fromX ?? primitive.x) - mapX(primitive.x)} ${mapY(animation.fromY ?? primitive.y) - mapY(primitive.y)}`}
            dur={`${duration}s`}
            repeatCount="indefinite"
            additive="sum"
          />
        )}
        {content}
      </g>
    );
  };

  const renderShapeFrame = (
    element: ScadaElement,
    style: typeof stateStyles.normal,
    isSelected: boolean,
    state: string,
    metricValue?: number,
    device?: Device,
    inset = 0
  ) => {
    const width = (element.width || 150) - inset * 2;
    const height = (element.height || 76) - inset * 2;
    const x = element.x + inset;
    const y = element.y + inset;
    const stroke = isSelected ? '#fb923c' : style.stroke;
    const preset = getShapePreset(element) === 'auto' ? 'rounded' : getShapePreset(element);
    const commonProps = {
      fill: style.fill,
      stroke,
      strokeWidth: isSelected ? 3 : 2,
      className: state === 'critical' ? 'scada-alarm-pulse' : undefined,
    };
    const points: Record<string, string> = {
      diamond: `${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`,
      hexagon: `${x + width * 0.18},${y} ${x + width * 0.82},${y} ${x + width},${y + height / 2} ${x + width * 0.82},${y + height} ${x + width * 0.18},${y + height} ${x},${y + height / 2}`,
      octagon: `${x + width * 0.14},${y} ${x + width * 0.86},${y} ${x + width},${y + height * 0.24} ${x + width},${y + height * 0.76} ${x + width * 0.86},${y + height} ${x + width * 0.14},${y + height} ${x},${y + height * 0.76} ${x},${y + height * 0.24}`,
      tag: `${x},${y} ${x + width * 0.86},${y} ${x + width},${y + height / 2} ${x + width * 0.86},${y + height} ${x},${y + height}`,
      notched: `${x + 18},${y} ${x + width},${y} ${x + width},${y + height - 18} ${x + width - 18},${y + height} ${x},${y + height} ${x},${y + 18}`,
      terminal: `${x},${y} ${x + width - 20},${y} ${x + width},${y + 20} ${x + width},${y + height} ${x},${y + height}`,
    };
    const customShape = customShapeById[preset];
    const primitivePaint = (primitive: ScadaShapePrimitive) => {
      const fillMap = {
        state: style.fill,
        panel: 'rgba(15,23,42,0.54)',
        accent: style.badge,
        none: 'none',
      };
      const strokeMap = {
        state: stroke,
        muted: 'rgba(148,163,184,0.38)',
        accent: style.badge,
        none: 'none',
      };
      return {
        fill: fillMap[primitive.fillMode || 'none'],
        stroke: strokeMap[primitive.strokeMode || 'state'],
        strokeWidth: primitive.strokeWidth ?? 2,
        opacity: primitive.opacity ?? 1,
        strokeDasharray: primitive.dash || undefined,
        className: state === 'critical' ? 'scada-alarm-pulse' : undefined,
      };
    };
    const toX = (value = 0) => x + (value / 100) * width;
    const toY = (value = 0) => y + (value / 100) * height;

    if (customShape) {
      return (
        <g>
          {customShape.primitives.map((primitive) => {
            const paint = primitivePaint(primitive);
            const primitiveWidth = primitive.width ?? 32;
            const primitiveHeight = primitive.height ?? 32;
            const primitiveX = toX(primitive.x);
            const primitiveY = toY(primitive.y);
            const scaledWidth = (primitiveWidth / 100) * width;
            const scaledHeight = (primitiveHeight / 100) * height;
            const centerX = primitiveX + scaledWidth / 2;
            const centerY = primitiveY + scaledHeight / 2;
            const scaleX = scaledWidth / 100;
            const scaleY = scaledHeight / 100;
            const wrapPrimitive = (content: React.ReactNode) => renderPrimitiveMotion(
              primitive,
              content,
              toX,
              toY,
              shouldPlayPrimitiveAnimation(primitive, device, state, element.metricKey, metricValue)
            );
            if (primitive.type === 'svgIcon') {
              return wrapPrimitive(
                <image
                  href={primitive.iconUrl || ''}
                  x={primitiveX}
                  y={primitiveY}
                  width={scaledWidth}
                  height={scaledHeight}
                  opacity={paint.opacity}
                  preserveAspectRatio="xMidYMid meet"
                />
              );
            }
            if (primitive.type === 'propeller') {
              return wrapPrimitive(
                <g transform={`translate(${centerX} ${centerY}) scale(${scaleX} ${scaleY})`} {...paint}>
                  <g transform="scale(0.22) translate(-215 -265)">
                    <path d="M455.768,310.97c-5.397-38.312-99.612-46.241-166-43.953c0.251-8.286-0.87-16.753-3.551-25.096c-5.628-17.515-17.125-31.5-31.61-40.514c23.898-43.029,41.406-105.359,25.39-131.664c-29.209-47.972-86.606-66.331-128.2-41.005c-33.324,20.29-2.528,111.288,26.057,171.344c-21.346,12.279-35.041,34.285-37.108,58.307c-49.552,1.636-113.802,19.484-128.081,47.388c-25.585,49.999-11.182,108.514,32.17,130.697c34.075,17.436,93.831-53.34,130.271-108.71c18.068,11.468,40.906,15.129,62.873,8.071c4.717-1.516,9.172-3.467,13.351-5.777c29.13,40.911,83.713,86.965,116.038,82.411C422.983,404.635,462.562,359.192,455.768,310.97z M224.783,294.764c-16.571,5.324-34.321-3.793-39.645-20.364s3.793-34.321,20.364-39.645c16.571-5.325,34.321,3.792,39.645,20.364C250.471,271.69,241.354,289.44,224.783,294.764z" />
                  </g>
                  <circle cx="0" cy="0" r="7" fill="#020617" stroke={paint.stroke} strokeWidth="2.5" />
                </g>
              );
            }
            if (primitive.type === 'valve') {
              return wrapPrimitive(
                <g {...paint}>
                  <polygon points={`${primitiveX},${centerY} ${centerX},${primitiveY} ${centerX},${primitiveY + scaledHeight} ${primitiveX},${centerY}`} />
                  <polygon points={`${primitiveX + scaledWidth},${centerY} ${centerX},${primitiveY} ${centerX},${primitiveY + scaledHeight} ${primitiveX + scaledWidth},${centerY}`} />
                  <line x1={centerX} y1={primitiveY - scaledHeight * 0.28} x2={centerX} y2={primitiveY} stroke={paint.stroke} strokeWidth={paint.strokeWidth} />
                  <line x1={centerX - scaledWidth * 0.18} y1={primitiveY - scaledHeight * 0.28} x2={centerX + scaledWidth * 0.18} y2={primitiveY - scaledHeight * 0.28} stroke={paint.stroke} strokeWidth={paint.strokeWidth} />
                </g>
              );
            }
            if (primitive.type === 'arrow') {
              return wrapPrimitive(<polygon points={`${primitiveX},${centerY - scaledHeight * 0.22} ${primitiveX + scaledWidth * 0.66},${centerY - scaledHeight * 0.22} ${primitiveX + scaledWidth * 0.66},${primitiveY} ${primitiveX + scaledWidth},${centerY} ${primitiveX + scaledWidth * 0.66},${primitiveY + scaledHeight} ${primitiveX + scaledWidth * 0.66},${centerY + scaledHeight * 0.22} ${primitiveX},${centerY + scaledHeight * 0.22}`} {...paint} />);
            }
            if (primitive.type === 'busbar') {
              return wrapPrimitive(
                <g {...paint}>
                  {[0.18, 0.5, 0.82].map((ratio) => <line key={ratio} x1={primitiveX} y1={primitiveY + scaledHeight * ratio} x2={primitiveX + scaledWidth} y2={primitiveY + scaledHeight * ratio} strokeLinecap="round" />)}
                  <line x1={primitiveX + scaledWidth * 0.16} y1={primitiveY} x2={primitiveX + scaledWidth * 0.16} y2={primitiveY + scaledHeight} strokeLinecap="round" />
                  <line x1={primitiveX + scaledWidth * 0.84} y1={primitiveY} x2={primitiveX + scaledWidth * 0.84} y2={primitiveY + scaledHeight} strokeLinecap="round" />
                </g>
              );
            }
            if (primitive.type === 'terminal') {
              return wrapPrimitive(
                <g {...paint}>
                  <rect x={primitiveX} y={primitiveY} width={scaledWidth} height={scaledHeight} rx={Math.min(scaledWidth, scaledHeight) * 0.12} />
                  {[0.25, 0.5, 0.75].map((ratio) => <circle key={ratio} cx={primitiveX + scaledWidth * ratio} cy={centerY} r={Math.min(scaledWidth, scaledHeight) * 0.08} fill="#020617" stroke={paint.stroke} strokeWidth={paint.strokeWidth} />)}
                </g>
              );
            }
            if (primitive.type === 'bracket') {
              return wrapPrimitive(
                <g fill="none" stroke={paint.stroke} strokeWidth={paint.strokeWidth} opacity={paint.opacity}>
                  <path d={`M ${primitiveX + scaledWidth * 0.24} ${primitiveY} L ${primitiveX} ${primitiveY} L ${primitiveX} ${primitiveY + scaledHeight} L ${primitiveX + scaledWidth * 0.24} ${primitiveY + scaledHeight}`} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={`M ${primitiveX + scaledWidth * 0.76} ${primitiveY} L ${primitiveX + scaledWidth} ${primitiveY} L ${primitiveX + scaledWidth} ${primitiveY + scaledHeight} L ${primitiveX + scaledWidth * 0.76} ${primitiveY + scaledHeight}`} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              );
            }
            if (primitive.type === 'tank') {
              return wrapPrimitive(
                <g {...paint}>
                  <ellipse cx={centerX} cy={primitiveY + scaledHeight * 0.12} rx={scaledWidth / 2} ry={scaledHeight * 0.12} />
                  <rect x={primitiveX} y={primitiveY + scaledHeight * 0.12} width={scaledWidth} height={scaledHeight * 0.76} />
                  <ellipse cx={centerX} cy={primitiveY + scaledHeight * 0.88} rx={scaledWidth / 2} ry={scaledHeight * 0.12} />
                </g>
              );
            }
            if (primitive.type === 'ellipse') {
              return wrapPrimitive(<ellipse cx={toX(primitive.x + primitiveWidth / 2)} cy={toY(primitive.y + primitiveHeight / 2)} rx={(primitiveWidth / 100) * width / 2} ry={(primitiveHeight / 100) * height / 2} {...paint} />);
            }
            if (primitive.type === 'line') {
              return wrapPrimitive(<line x1={toX(primitive.x)} y1={toY(primitive.y)} x2={toX(primitive.x + (primitive.width ?? 0))} y2={toY(primitive.y + (primitive.height ?? 0))} strokeLinecap="round" {...paint} />);
            }
            if (primitive.type === 'polygon') {
              const primitivePoints = primitive.width && primitive.height
                ? (primitive.points || []).map((point) => `${toX(primitive.x + point.x * primitiveWidth / 100)},${toY(primitive.y + point.y * primitiveHeight / 100)}`).join(' ')
                : (primitive.points || []).map((point) => `${toX(point.x)},${toY(point.y)}`).join(' ');
              return wrapPrimitive(<polygon points={primitivePoints} {...paint} />);
            }
            return wrapPrimitive(<rect x={toX(primitive.x)} y={toY(primitive.y)} width={((primitive.width ?? 40) / 100) * width} height={((primitive.height ?? 40) / 100) * height} rx={primitive.rx ?? 0} {...paint} />);
          })}
          {isSelected && <rect x={x} y={y} width={width} height={height} rx={8} fill="none" stroke="#fb923c" strokeWidth={2} strokeDasharray="5 5" />}
        </g>
      );
    }

    if (preset === 'circle') {
      return <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} {...commonProps} />;
    }
    if (preset === 'diamond' || preset === 'hexagon' || preset === 'octagon' || preset === 'tag' || preset === 'notched' || preset === 'terminal') {
      return <polygon points={points[preset]} {...commonProps} />;
    }
    if (preset === 'capsule') {
      return <rect x={x} y={y} width={width} height={height} rx={height / 2} {...commonProps} />;
    }
    if (preset === 'rectangle') {
      return <rect x={x} y={y} width={width} height={height} rx={0} {...commonProps} />;
    }
    if (preset === 'soft-panel') {
      return (
        <>
          <rect x={x} y={y} width={width} height={height} rx={14} {...commonProps} />
          <rect x={x + 8} y={y + 8} width={Math.max(0, width - 16)} height={Math.max(0, height - 16)} rx={9} fill="none" stroke="rgba(148,163,184,0.28)" strokeWidth={1} />
        </>
      );
    }
    if (preset === 'dashed') {
      return <rect x={x} y={y} width={width} height={height} rx={8} {...commonProps} strokeDasharray="8 6" />;
    }
    if (preset === 'double') {
      return (
        <>
          <rect x={x} y={y} width={width} height={height} rx={8} {...commonProps} />
          <rect x={x + 6} y={y + 6} width={Math.max(0, width - 12)} height={Math.max(0, height - 12)} rx={5} fill="none" stroke={stroke} strokeWidth={1} opacity={0.7} />
        </>
      );
    }
    return <rect x={x} y={y} width={width} height={height} rx={8} {...commonProps} />;
  };

  const renderDeviceGraphic = (element: ScadaElement, device: Device | undefined, style: typeof stateStyles.normal, isSelected: boolean, state: string, value?: number) => {
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

    if (getShapePreset(element) !== 'auto') {
      return (
        <>
          {renderShapeFrame(element, style, isSelected, state, value, device)}
          {renderIcon()}
        </>
      );
    }

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
    const resizeHandle = editMode && isSelected && isResizableElement(element) ? (
      <g
        className="cursor-nwse-resize"
        onPointerDown={(event) => handleResizePointerDown(event, element)}
        onClick={(event) => event.stopPropagation()}
      >
        <rect x={element.x + width - 14} y={element.y + height - 14} width={14} height={14} rx={3} fill="rgba(251,146,60,0.2)" stroke="#fb923c" strokeWidth={1.5} />
        <path d={`M ${element.x + width - 10} ${element.y + height - 4} L ${element.x + width - 4} ${element.y + height - 10}`} stroke="#fb923c" strokeWidth={1.5} strokeLinecap="round" />
      </g>
    ) : null;

    if (element.type === 'label') {
      return (
        <g key={element.id} onPointerDown={(event) => handlePointerDown(event, element)} onClick={(event) => { event.stopPropagation(); setSelectedElementId(element.id); }} className={cn(editMode && 'cursor-move')}>
          <text x={element.x} y={element.y} fill="#e5e7eb" fontSize="24" fontWeight="700">{element.label}</text>
          {isSelected && <rect x={element.x - 8} y={element.y - 30} width={width} height={height} fill="none" stroke="#fb923c" strokeDasharray="5 5" />}
          {resizeHandle}
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
          renderDeviceGraphic(element, device, style, isSelected, state, value)
        ) : (
          renderShapeFrame(element, style, isSelected, state, value, device)
        )}
        <circle cx={element.x + 18} cy={element.y + 20} r={5} fill={style.badge} />
        {renderEditableText(element, 'label', element.label, labelLayout, { fill: '#e5e7eb', fontWeight: 700 })}
        {renderEditableText(element, 'value', formatMetricValue(value, element.unit), valueLayout, { fill: style.text, fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' })}
        {renderEditableText(element, 'meta', metaText, metaLayout, { fill: '#94a3b8' })}
        {resizeHandle}
      </g>
    );
  };

  const renderDeviceAnchors = () => {
    if (!showDeviceAnchors) return null;
    return (
      <g pointerEvents="none">
        {deviceAnchors.map((anchor) => (
          <g key={`${anchor.elementId}-${anchor.side}-anchor`}>
            <line x1={anchor.x - 10} y1={anchor.y} x2={anchor.x + 10} y2={anchor.y} stroke="#93c5fd" strokeWidth={2} strokeDasharray="4 4" />
            <line x1={anchor.x} y1={anchor.y - 10} x2={anchor.x} y2={anchor.y + 10} stroke="#93c5fd" strokeWidth={2} strokeDasharray="4 4" />
            <circle cx={anchor.x} cy={anchor.y} r={7} fill="#020617" stroke="#93c5fd" strokeWidth={2} strokeDasharray="3 3" />
            <text x={anchor.x + 9} y={anchor.y - 8} fill="#93c5fd" fontSize="10">{anchor.label}</text>
          </g>
        ))}
      </g>
    );
  };

  const renderShapePreviewPrimitive = (primitive: ScadaShapePrimitive, selected = false) => {
    const paint = {
      fill: primitive.fillMode === 'none' ? 'none' : primitive.fillMode === 'accent' ? '#f97316' : primitive.fillMode === 'state' ? 'rgba(16,185,129,0.35)' : 'rgba(15,23,42,0.72)',
      stroke: primitive.strokeMode === 'none' ? 'none' : primitive.strokeMode === 'accent' ? '#f97316' : primitive.strokeMode === 'muted' ? 'rgba(148,163,184,0.5)' : '#10b981',
      strokeWidth: selected ? 3 : primitive.strokeWidth ?? 2,
      opacity: primitive.opacity ?? 1,
      strokeDasharray: primitive.dash || undefined,
    };
    const width = primitive.width ?? 32;
    const height = primitive.height ?? 32;
    const centerX = primitive.x + width / 2;
    const centerY = primitive.y + height / 2;
    const scaleX = width / 100;
    const scaleY = height / 100;
    const wrapPrimitive = (content: React.ReactNode) => renderPrimitiveMotion(primitive, content, (value = 0) => value, (value = 0) => value);
    if (primitive.type === 'svgIcon') {
      return wrapPrimitive(
        <image
          href={primitive.iconUrl || ''}
          x={primitive.x}
          y={primitive.y}
          width={width}
          height={height}
          opacity={paint.opacity}
          preserveAspectRatio="xMidYMid meet"
        />
      );
    }
    if (primitive.type === 'propeller') {
      return wrapPrimitive(
        <g transform={`translate(${centerX} ${centerY}) scale(${scaleX} ${scaleY})`} {...paint}>
          <g transform="scale(0.22) translate(-215 -265)">
            <path d="M455.768,310.97c-5.397-38.312-99.612-46.241-166-43.953c0.251-8.286-0.87-16.753-3.551-25.096c-5.628-17.515-17.125-31.5-31.61-40.514c23.898-43.029,41.406-105.359,25.39-131.664c-29.209-47.972-86.606-66.331-128.2-41.005c-33.324,20.29-2.528,111.288,26.057,171.344c-21.346,12.279-35.041,34.285-37.108,58.307c-49.552,1.636-113.802,19.484-128.081,47.388c-25.585,49.999-11.182,108.514,32.17,130.697c34.075,17.436,93.831-53.34,130.271-108.71c18.068,11.468,40.906,15.129,62.873,8.071c4.717-1.516,9.172-3.467,13.351-5.777c29.13,40.911,83.713,86.965,116.038,82.411C422.983,404.635,462.562,359.192,455.768,310.97z M224.783,294.764c-16.571,5.324-34.321-3.793-39.645-20.364s3.793-34.321,20.364-39.645c16.571-5.325,34.321,3.792,39.645,20.364C250.471,271.69,241.354,289.44,224.783,294.764z" />
          </g>
          <circle cx="0" cy="0" r="7" fill="#020617" stroke={paint.stroke} strokeWidth="2.5" />
        </g>
      );
    }
    if (primitive.type === 'valve') {
      return wrapPrimitive(
        <g {...paint}>
          <polygon points={`${primitive.x},${centerY} ${centerX},${primitive.y} ${centerX},${primitive.y + height} ${primitive.x},${centerY}`} />
          <polygon points={`${primitive.x + width},${centerY} ${centerX},${primitive.y} ${centerX},${primitive.y + height} ${primitive.x + width},${centerY}`} />
          <line x1={centerX} y1={primitive.y - height * 0.28} x2={centerX} y2={primitive.y} stroke={paint.stroke} strokeWidth={paint.strokeWidth} />
          <line x1={centerX - width * 0.18} y1={primitive.y - height * 0.28} x2={centerX + width * 0.18} y2={primitive.y - height * 0.28} stroke={paint.stroke} strokeWidth={paint.strokeWidth} />
        </g>
      );
    }
    if (primitive.type === 'arrow') {
      return wrapPrimitive(<polygon points={`${primitive.x},${centerY - height * 0.22} ${primitive.x + width * 0.66},${centerY - height * 0.22} ${primitive.x + width * 0.66},${primitive.y} ${primitive.x + width},${centerY} ${primitive.x + width * 0.66},${primitive.y + height} ${primitive.x + width * 0.66},${centerY + height * 0.22} ${primitive.x},${centerY + height * 0.22}`} {...paint} />);
    }
    if (primitive.type === 'busbar') {
      return wrapPrimitive(
        <g {...paint}>
          {[0.18, 0.5, 0.82].map((ratio) => <line key={ratio} x1={primitive.x} y1={primitive.y + height * ratio} x2={primitive.x + width} y2={primitive.y + height * ratio} strokeLinecap="round" />)}
          <line x1={primitive.x + width * 0.16} y1={primitive.y} x2={primitive.x + width * 0.16} y2={primitive.y + height} strokeLinecap="round" />
          <line x1={primitive.x + width * 0.84} y1={primitive.y} x2={primitive.x + width * 0.84} y2={primitive.y + height} strokeLinecap="round" />
        </g>
      );
    }
    if (primitive.type === 'terminal') {
      return wrapPrimitive(
        <g {...paint}>
          <rect x={primitive.x} y={primitive.y} width={width} height={height} rx={Math.min(width, height) * 0.12} />
          {[0.25, 0.5, 0.75].map((ratio) => <circle key={ratio} cx={primitive.x + width * ratio} cy={centerY} r={Math.min(width, height) * 0.08} fill="#020617" stroke={paint.stroke} strokeWidth={paint.strokeWidth} />)}
        </g>
      );
    }
    if (primitive.type === 'bracket') {
      return wrapPrimitive(
        <g fill="none" stroke={paint.stroke} strokeWidth={paint.strokeWidth} opacity={paint.opacity}>
          <path d={`M ${primitive.x + width * 0.24} ${primitive.y} L ${primitive.x} ${primitive.y} L ${primitive.x} ${primitive.y + height} L ${primitive.x + width * 0.24} ${primitive.y + height}`} strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M ${primitive.x + width * 0.76} ${primitive.y} L ${primitive.x + width} ${primitive.y} L ${primitive.x + width} ${primitive.y + height} L ${primitive.x + width * 0.76} ${primitive.y + height}`} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    }
    if (primitive.type === 'tank') {
      return wrapPrimitive(
        <g {...paint}>
          <ellipse cx={centerX} cy={primitive.y + height * 0.12} rx={width / 2} ry={height * 0.12} />
          <rect x={primitive.x} y={primitive.y + height * 0.12} width={width} height={height * 0.76} />
          <ellipse cx={centerX} cy={primitive.y + height * 0.88} rx={width / 2} ry={height * 0.12} />
        </g>
      );
    }
    if (primitive.type === 'ellipse') {
      return wrapPrimitive(<ellipse cx={primitive.x + width / 2} cy={primitive.y + height / 2} rx={width / 2} ry={height / 2} {...paint} />);
    }
    if (primitive.type === 'line') {
      return wrapPrimitive(<line x1={primitive.x} y1={primitive.y} x2={primitive.x + (primitive.width ?? 0)} y2={primitive.y + (primitive.height ?? 0)} strokeLinecap="round" {...paint} />);
    }
    if (primitive.type === 'polygon') {
      const points = primitive.width && primitive.height
        ? (primitive.points || []).map((point) => `${primitive.x + point.x * width / 100},${primitive.y + point.y * height / 100}`).join(' ')
        : (primitive.points || []).map((point) => `${point.x},${point.y}`).join(' ');
      return wrapPrimitive(<polygon points={points} {...paint} />);
    }
    return wrapPrimitive(<rect x={primitive.x} y={primitive.y} width={primitive.width ?? 40} height={primitive.height ?? 40} rx={primitive.rx ?? 0} {...paint} />);
  };

  const renderPrimitiveSelection = (primitive: ScadaShapePrimitive) => {
    const width = primitive.width ?? 32;
    const height = primitive.height ?? 32;
    const selectionHeight = Math.max(8, height);
    return (
      <g>
        <rect x={primitive.x - 2} y={primitive.y - 2} width={width + 4} height={selectionHeight + 4} fill="none" stroke="#fb923c" strokeWidth={1.4} strokeDasharray="3 2" pointerEvents="none" />
        <rect
          x={primitive.x + width - 3}
          y={primitive.y + selectionHeight - 3}
          width={7}
          height={7}
          rx={1.5}
          fill="#fb923c"
          stroke="#020617"
          strokeWidth={1}
          className="cursor-nwse-resize"
          onPointerDown={(event) => handleShapePrimitiveResizePointerDown(event, primitive)}
        />
      </g>
    );
  };

  const renderPrimitiveRotationCenter = (primitive: ScadaShapePrimitive) => {
    const center = getPrimitiveCenter(primitive);
    const centerX = primitive.rotation?.centerX ?? center.x;
    const centerY = primitive.rotation?.centerY ?? center.y;
    return (
      <g className="cursor-move" onPointerDown={(event) => handleShapeRotationCenterPointerDown(event, primitive)}>
        <line x1={centerX - 5} y1={centerY} x2={centerX + 5} y2={centerY} stroke="#f97316" strokeWidth={1.3} pointerEvents="none" />
        <line x1={centerX} y1={centerY - 5} x2={centerX} y2={centerY + 5} stroke="#f97316" strokeWidth={1.3} pointerEvents="none" />
        <circle cx={centerX} cy={centerY} r={4.5} fill="rgba(249,115,22,0.18)" stroke="#f97316" strokeWidth={1.2} />
        <text x={centerX + 6} y={centerY - 6} fill="#fb923c" fontSize="4.5" pointerEvents="none">rotation</text>
      </g>
    );
  };

  const renderShapeManager = () => {
    if (!shapeManagerOpen) return null;
    const selectedPrimitive = editingShape?.primitives.find((primitive) => primitive.id === selectedPrimitiveId) || null;
    const shapeEndpoints = editingShape?.endpoints?.length ? editingShape.endpoints : defaultElementEndpoints;
    const selectedEndpoint = shapeEndpoints.find((endpoint) => endpoint.id === selectedEndpointId) || null;
    const primitivePointsText = (selectedPrimitive?.points || []).map((point) => `${point.x},${point.y}`).join(' ');
    const primitiveLayers = editingShape ? [...editingShape.primitives].map((primitive, index) => ({
      primitive,
      index,
    })).reverse() : [];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
        <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-white shadow-2xl dark:bg-[#1c2128]">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Custom SCADA Shape Presets</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Build reusable frames from basic geometry and industrial symbols. Drag or resize shapes directly on the canvas; coordinates stay relative from 0 to 100.</p>
            </div>
            <button type="button" onClick={() => { setShapeManagerOpen(false); setEditingShape(null); }} className="rounded px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Close</button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] overflow-hidden">
            <aside className="min-h-0 overflow-auto border-r border-slate-200 p-4 dark:border-slate-800">
              <button type="button" onClick={startNewShape} className="mb-3 inline-flex h-9 w-full items-center justify-center rounded bg-orange-600 px-3 text-sm font-semibold text-white hover:bg-orange-500">
                New Custom Shape
              </button>
              <div className="space-y-2">
                {!scadaShapePresets.length && (
                  <div className="rounded border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">
                    No custom shapes yet.
                  </div>
                )}
                {scadaShapePresets.map((preset) => (
                  <div key={preset.id} className={cn('rounded border p-3', editingShape?.id === preset.id ? 'border-orange-500 bg-orange-500/10' : 'border-slate-200 dark:border-slate-700')}>
                    <button type="button" onClick={() => startEditShape(preset)} className="block w-full text-left text-sm font-semibold text-slate-900 dark:text-white">{preset.name}</button>
                    <div className="mt-2 h-16 rounded bg-slate-950 p-2">
                      <svg viewBox="0 0 100 100" className="h-full w-full">
                        {preset.primitives.map((primitive) => renderShapePreviewPrimitive(primitive))}
                      </svg>
                    </div>
                    <button type="button" onClick={() => deleteShape(preset)} className="mt-2 text-xs font-semibold text-red-500 hover:text-red-400">Delete</button>
                  </div>
                ))}
              </div>
            </aside>

            <section className="min-h-0 overflow-auto p-4">
              {editingShape ? (
                <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
                  <div className="space-y-4">
                    <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                      Shape Name
                      <input value={editingShape.name} onChange={(event) => setEditingShape({ ...editingShape, name: event.target.value })} className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                    </label>
                    <div className="rounded border border-slate-200 bg-slate-950 p-4 dark:border-slate-800">
                      <svg
                        ref={shapeEditorSvgRef}
                        viewBox="0 0 100 100"
                        className="h-72 w-full touch-none rounded bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:10px_10px]"
                        onPointerMove={handleShapeEditorPointerMove}
                        onPointerUp={() => setShapeEditorDragState(null)}
                        onPointerLeave={() => setShapeEditorDragState(null)}
                        onPointerDown={() => {
                          setSelectedPrimitiveId('');
                          setSelectedEndpointId('');
                        }}
                      >
                        <rect x="0" y="0" width="100" height="100" fill="rgba(2,6,23,0.5)" />
                        {editingShape.primitives.map((primitive) => (
                          <g
                            key={primitive.id}
                            onPointerDown={(event) => handleShapePrimitivePointerDown(event, primitive)}
                            className="cursor-move"
                          >
                            {renderShapePreviewPrimitive(primitive, primitive.id === selectedPrimitiveId)}
                            {primitive.id === selectedPrimitiveId && renderPrimitiveSelection(primitive)}
                            {primitive.id === selectedPrimitiveId && renderPrimitiveRotationCenter(primitive)}
                          </g>
                        ))}
                        {shapeEndpoints.map((endpoint) => (
                          <g key={endpoint.id} onPointerDown={(event) => handleShapeEndpointPointerDown(event, endpoint)} className="cursor-move">
                            <circle cx={endpoint.x} cy={endpoint.y} r={selectedEndpointId === endpoint.id ? 3.8 : 3} fill="#38bdf8" stroke="#020617" strokeWidth="1.2" />
                            <text x={endpoint.x + 4} y={endpoint.y - 4} fill="#93c5fd" fontSize="5">{endpoint.label || endpoint.id}</text>
                            {selectedEndpointId === endpoint.id && <circle cx={endpoint.x} cy={endpoint.y} r="6" fill="none" stroke="#fb923c" strokeDasharray="2 2" />}
                          </g>
                        ))}
                      </svg>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {primitiveTypes.map((type) => (
                        <button key={type} type="button" onClick={() => addEditingPrimitive(type)} className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                          Add {type}
                        </button>
                      ))}
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Preset Shapes</div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <select value={selectedIconPresetId} onChange={(event) => setSelectedIconPresetId(event.target.value)} className="h-9 rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                          {scadaIconPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                        </select>
                        <button type="button" onClick={addEditingIconPreset} className="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600">
                          Add Preset
                        </button>
                      </div>
                      <div className="mt-2 max-h-24 overflow-auto rounded bg-slate-950 p-2">
                        <div className="grid grid-cols-8 gap-2">
                          {scadaIconPresets.slice(0, 32).map((preset) => (
                            <button key={preset.id} type="button" onClick={() => setSelectedIconPresetId(preset.id)} className={cn('flex h-8 items-center justify-center rounded border bg-white p-1', selectedIconPresetId === preset.id ? 'border-orange-500' : 'border-slate-700')}>
                              <img src={preset.url} alt={preset.name} className="h-full w-full object-contain" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Layers</h3>
                        <span className="text-xs text-slate-500">Top layer first</span>
                      </div>
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Primitives</div>
                          {primitiveLayers.map(({ primitive, index }) => {
                            const selected = selectedPrimitiveId === primitive.id;
                            return (
                              <div key={primitive.id} className={cn('rounded border p-2', selected ? 'border-orange-500 bg-orange-500/10' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950')}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPrimitiveId(primitive.id);
                                    setSelectedEndpointId('');
                                  }}
                                  className="flex w-full items-center justify-between text-left"
                                >
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{primitive.iconName || primitive.type}</span>
                                  <span className="font-mono text-[10px] text-slate-500">#{index + 1}</span>
                                </button>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <button type="button" onClick={() => moveEditingPrimitive(primitive.id, 'front')} className="rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Top</button>
                                  <button type="button" onClick={() => moveEditingPrimitive(primitive.id, 'up')} className="rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Up</button>
                                  <button type="button" onClick={() => moveEditingPrimitive(primitive.id, 'down')} className="rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Down</button>
                                  <button type="button" onClick={() => moveEditingPrimitive(primitive.id, 'back')} className="rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Bottom</button>
                                  {editingShape.primitives.length > 1 && (
                                    <button type="button" onClick={() => removeEditingPrimitive(primitive.id)} className="rounded border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-500 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10">Delete</button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Endpoints</div>
                            <button type="button" onClick={addEditingEndpoint} className="rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Add</button>
                          </div>
                          {shapeEndpoints.map((endpoint) => (
                            <div key={endpoint.id} className={cn('rounded border p-2', selectedEndpointId === endpoint.id ? 'border-sky-400 bg-sky-500/10' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950')}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedEndpointId(endpoint.id);
                                  setSelectedPrimitiveId('');
                                }}
                                className="flex w-full items-center justify-between text-left"
                              >
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{endpoint.label || endpoint.id}</span>
                                <span className="font-mono text-[10px] text-slate-500">{Math.round(endpoint.x)}, {Math.round(endpoint.y)}</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingShape(null)} className="rounded border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
                      <button type="button" onClick={saveEditingShape} className="rounded bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500">Save Shape</button>
                    </div>
                  </div>

                  <div className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Primitive Settings</h3>
                    {selectedPrimitive ? (
                      <div className="mt-3 space-y-3">
                        <div className="flex items-center justify-between rounded bg-white p-2 text-xs font-semibold text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                          <span>{selectedPrimitive.iconName || selectedPrimitive.type}</span>
                          {editingShape.primitives.length > 1 && (
                            <button type="button" onClick={() => removeEditingPrimitive(selectedPrimitive.id)} className="text-red-500 hover:text-red-400">Remove</button>
                          )}
                        </div>
                        {selectedPrimitive.type === 'svgIcon' && (
                          <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            Preset Shape
                            <select
                              value={scadaIconPresets.find((preset) => preset.url === selectedPrimitive.iconUrl)?.id || ''}
                              onChange={(event) => {
                                const preset = scadaIconPresets.find((item) => item.id === event.target.value);
                                if (preset) updateEditingPrimitive(selectedPrimitive.id, { iconUrl: preset.url, iconName: preset.name });
                              }}
                              className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            >
                              {scadaIconPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                            </select>
                          </label>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          {(['x', 'y', 'width', 'height', 'rx', 'strokeWidth', 'opacity'] as const).map((key) => (
                            <label key={key} className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                              {key}
                              <input type="number" step={key === 'opacity' ? 0.1 : 1} min={key === 'opacity' ? 0 : undefined} max={key === 'opacity' ? 1 : 100} value={Number(selectedPrimitive[key] ?? (key === 'opacity' ? 1 : 0))} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { [key]: Number(event.target.value) } as Partial<ScadaShapePrimitive>)} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            </label>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            Fill
                            <select value={selectedPrimitive.fillMode || 'none'} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { fillMode: event.target.value as ScadaShapePrimitive['fillMode'] })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                              {['state', 'panel', 'accent', 'none'].map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                          </label>
                          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            Stroke
                            <select value={selectedPrimitive.strokeMode || 'state'} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { strokeMode: event.target.value as ScadaShapePrimitive['strokeMode'] })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                              {['state', 'muted', 'accent', 'none'].map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                          </label>
                        </div>
                        <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                          Dash
                          <input value={selectedPrimitive.dash || ''} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { dash: event.target.value })} placeholder="8 6" className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                        </label>
                        <div className="rounded border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Rotation</div>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                              Angle
                              <input type="number" value={selectedPrimitive.rotation?.angle ?? 0} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { rotation: { ...(selectedPrimitive.rotation || {}), angle: Number(event.target.value) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            </label>
                            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                              Center X
                              <input type="number" min={0} max={100} value={selectedPrimitive.rotation?.centerX ?? Math.round(getPrimitiveCenter(selectedPrimitive).x)} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { rotation: { ...(selectedPrimitive.rotation || {}), centerX: clampPercent(Number(event.target.value)) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            </label>
                            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                              Center Y
                              <input type="number" min={0} max={100} value={selectedPrimitive.rotation?.centerY ?? Math.round(getPrimitiveCenter(selectedPrimitive).y)} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { rotation: { ...(selectedPrimitive.rotation || {}), centerY: clampPercent(Number(event.target.value)) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            </label>
                          </div>
                        </div>
                        <div className="rounded border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Animation</div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                              Type
                              <select value={selectedPrimitive.animation?.type || 'none'} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), type: event.target.value as NonNullable<ScadaShapePrimitive['animation']>['type'] } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                                {['none', 'rotate', 'scale', 'translate', 'visibility'].map((value) => <option key={value} value={value}>{value}</option>)}
                              </select>
                            </label>
                            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                              Trigger
                              <select value={selectedPrimitive.animation?.trigger || 'always'} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), trigger: event.target.value as NonNullable<ScadaShapePrimitive['animation']>['trigger'] } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                                <option value="always">Always</option>
                                <option value="deviceOnline">Device online</option>
                                <option value="metricNonZero">When reading != 0</option>
                                <option value="metricGreaterThan">Metric greater than</option>
                                <option value="metricEquals">Metric equals</option>
                                <option value="deviceStatus">Device status</option>
                              </select>
                            </label>
                          </div>
                          {(selectedPrimitive.animation?.trigger === 'metricNonZero' || selectedPrimitive.animation?.trigger === 'metricGreaterThan' || selectedPrimitive.animation?.trigger === 'metricEquals') && (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                                Metric Key
                                <input value={selectedPrimitive.animation?.metricKey || ''} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), metricKey: event.target.value } })} placeholder="Default metric" className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                              </label>
                              {(selectedPrimitive.animation?.trigger === 'metricGreaterThan' || selectedPrimitive.animation?.trigger === 'metricEquals') && (
                                <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                                  Value
                                  <input value={selectedPrimitive.animation?.operatorValue ?? ''} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), operatorValue: event.target.value } })} placeholder="0 / running" className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                                </label>
                              )}
                            </div>
                          )}
                          {selectedPrimitive.animation?.trigger === 'deviceStatus' && (
                            <label className="mt-2 block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                              Device Status
                              <select value={selectedPrimitive.animation?.deviceStatus || 'online'} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), deviceStatus: event.target.value as NonNullable<ScadaShapePrimitive['animation']>['deviceStatus'] } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                                {['online', 'normal', 'warning', 'critical', 'offline'].map((statusOption) => <option key={statusOption} value={statusOption}>{statusOption}</option>)}
                              </select>
                            </label>
                          )}
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                              Duration
                              <input type="number" min={0.2} step={0.1} value={selectedPrimitive.animation?.durationSeconds ?? 2} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), durationSeconds: Number(event.target.value) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            </label>
                          </div>
                          {(selectedPrimitive.animation?.type === 'rotate' || selectedPrimitive.animation?.type === 'scale') && (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                                Center X
                                <input type="number" min={0} max={100} value={selectedPrimitive.animation?.centerX ?? Math.round(getPrimitiveCenter(selectedPrimitive).x)} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), centerX: clampPercent(Number(event.target.value)) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                              </label>
                              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                                Center Y
                                <input type="number" min={0} max={100} value={selectedPrimitive.animation?.centerY ?? Math.round(getPrimitiveCenter(selectedPrimitive).y)} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), centerY: clampPercent(Number(event.target.value)) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                              </label>
                            </div>
                          )}
                          {selectedPrimitive.animation?.type === 'rotate' && (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">From<input type="number" value={selectedPrimitive.animation?.rotateFrom ?? 0} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), rotateFrom: Number(event.target.value) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">To<input type="number" value={selectedPrimitive.animation?.rotateTo ?? 360} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), rotateTo: Number(event.target.value) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                            </div>
                          )}
                          {selectedPrimitive.animation?.type === 'scale' && (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">From<input type="number" step={0.1} value={selectedPrimitive.animation?.scaleFrom ?? 1} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), scaleFrom: Number(event.target.value) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">To<input type="number" step={0.1} value={selectedPrimitive.animation?.scaleTo ?? 1.12} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), scaleTo: Number(event.target.value) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                            </div>
                          )}
                          {selectedPrimitive.animation?.type === 'translate' && (
                            <div className="mt-2 grid grid-cols-4 gap-2">
                              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">From X<input type="number" min={0} max={100} value={selectedPrimitive.animation?.fromX ?? selectedPrimitive.x} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), fromX: clampPercent(Number(event.target.value)) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">From Y<input type="number" min={0} max={100} value={selectedPrimitive.animation?.fromY ?? selectedPrimitive.y} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), fromY: clampPercent(Number(event.target.value)) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">To X<input type="number" min={0} max={100} value={selectedPrimitive.animation?.toX ?? selectedPrimitive.x} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), toX: clampPercent(Number(event.target.value)) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">To Y<input type="number" min={0} max={100} value={selectedPrimitive.animation?.toY ?? selectedPrimitive.y} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), toY: clampPercent(Number(event.target.value)) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                            </div>
                          )}
                          {selectedPrimitive.animation?.type === 'visibility' && (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Visible Seconds<input type="number" min={0.1} step={0.1} value={selectedPrimitive.animation?.visibleSeconds ?? 1} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), visibleSeconds: Number(event.target.value) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                              <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Hidden Seconds<input type="number" min={0.1} step={0.1} value={selectedPrimitive.animation?.hiddenSeconds ?? 1} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { animation: { ...(selectedPrimitive.animation || {}), hiddenSeconds: Number(event.target.value) } })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label>
                            </div>
                          )}
                        </div>
                        {selectedPrimitive.type === 'polygon' && (
                          <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            Polygon Points
                            <textarea value={primitivePointsText} onChange={(event) => updateEditingPrimitive(selectedPrimitive.id, { points: event.target.value.split(/\s+/).map((pair) => pair.split(',').map(Number)).filter(([xValue, yValue]) => Number.isFinite(xValue) && Number.isFinite(yValue)).map(([xValue, yValue]) => ({ x: xValue, y: yValue })) })} className="mt-1 h-20 w-full rounded border border-slate-300 bg-white px-2 py-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                          </label>
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-500">Select or add a primitive to edit its geometry.</p>
                    )}
                    <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Connection Endpoints</h3>
                        <button type="button" onClick={addEditingEndpoint} className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Add</button>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pipe and power line endpoints snap to these points when this shape is used.</p>
                      <div className="mt-3 space-y-2">
                        {shapeEndpoints.map((endpoint) => (
                          <button
                            key={endpoint.id}
                            type="button"
                            onClick={() => {
                              setSelectedEndpointId(endpoint.id);
                              setSelectedPrimitiveId('');
                            }}
                            className={cn('flex w-full items-center justify-between rounded border px-2 py-2 text-left text-xs', selectedEndpointId === endpoint.id ? 'border-orange-500 bg-orange-500/10 text-orange-500' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300')}
                          >
                            <span>{endpoint.label || endpoint.id}</span>
                            <span className="font-mono">{Math.round(endpoint.x)}, {Math.round(endpoint.y)}</span>
                          </button>
                        ))}
                      </div>
                      {selectedEndpoint && (
                        <div className="mt-3 space-y-2 rounded border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                          <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            Label
                            <input value={selectedEndpoint.label} onChange={(event) => updateEditingEndpoint(selectedEndpoint.id, { label: event.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                              X
                              <input type="number" min={0} max={100} value={Math.round(selectedEndpoint.x)} onChange={(event) => updateEditingEndpoint(selectedEndpoint.id, { x: clampPercent(Number(event.target.value)) })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            </label>
                            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                              Y
                              <input type="number" min={0} max={100} value={Math.round(selectedEndpoint.y)} onChange={(event) => updateEditingEndpoint(selectedEndpoint.id, { y: clampPercent(Number(event.target.value)) })} className="mt-1 h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            </label>
                          </div>
                          <button type="button" onClick={() => removeEditingEndpoint(selectedEndpoint.id)} className="w-full rounded border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10">Remove Endpoint</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[360px] items-center justify-center rounded border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700">
                  Select a custom shape or create a new one.
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
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
          <button type="button" onClick={() => setShapeManagerOpen(true)} className="inline-flex h-9 items-center gap-2 rounded border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            Shape Library
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
              {(selectedElement.type === 'device' || selectedElement.type === 'metric') && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                    Shape Preset
                    <select
                      value={getShapePreset(selectedElement)}
                      onChange={(event) => updateElement(selectedElement.id, { shapePreset: event.target.value })}
                      className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      {selectableShapePresets
                        .filter((preset) => selectedElement.type === 'device' || preset.id !== 'auto')
                        .map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={() => setShapeManagerOpen(true)} className="inline-flex h-8 w-full items-center justify-center rounded border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    Manage Custom Shapes
                  </button>
                </div>
              )}
              {isResizableElement(selectedElement) && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                    Width
                    <input
                      type="number"
                      min={60}
                      value={Math.round((selectedElement.width || getElementSize(selectedElement).width))}
                      onChange={(event) => updateElement(selectedElement.id, { width: Math.max(60, Number(event.target.value) || 60) })}
                      className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-2 text-sm normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </label>
                  <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                    Height
                    <input
                      type="number"
                      min={36}
                      value={Math.round((selectedElement.height || getElementSize(selectedElement).height))}
                      onChange={(event) => updateElement(selectedElement.id, { height: Math.max(36, Number(event.target.value) || 36) })}
                      className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-2 text-sm normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </label>
                </div>
              )}
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
      {renderShapeManager()}
    </div>
  );
}
