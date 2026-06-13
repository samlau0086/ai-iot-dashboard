import type { Alert, Device } from '../types';
import type { ChartConfig, SiteTenant, Workflow } from './store';

export type AiCopilotAction =
  | {
      id: string;
      type: 'create_workflow';
      label: string;
      description: string;
      workflow: Workflow;
    }
  | {
      id: string;
      type: 'download_report';
      label: string;
      description: string;
      rows: string[][];
      fileName: string;
    }
  | {
      id: string;
      type: 'open_device';
      label: string;
      description: string;
      deviceId: string;
    }
  | {
      id: string;
      type: 'open_route';
      label: string;
      description: string;
      route: string;
    };

export type AiCopilotResponse = {
  title: string;
  answer: string;
  insights: Array<{
    label: string;
    value: string;
    tone: 'neutral' | 'good' | 'warning' | 'critical';
  }>;
  relatedDevices: Array<{
    id: string;
    name: string;
    type: Device['type'];
    status: Device['status'];
    reason: string;
  }>;
  recommendations: string[];
  sources: string[];
  actions: AiCopilotAction[];
};

export type AiCopilotContext = {
  devices: Device[];
  alerts: Alert[];
  workflows: Workflow[];
  charts: ChartConfig[];
  sites: SiteTenant[];
  activeSiteId: string;
};

const normalize = (value: string) => value.toLowerCase().trim();

const hasAny = (text: string, keywords: string[]) => keywords.some((keyword) => text.includes(keyword));

const formatNumber = (value: number, digits = 1) => (
  Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : '0'
);

const metricValue = (device: Device, keys: string[]) => {
  for (const key of keys) {
    const value = Number(device.metrics?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
};

const getSiteDevices = (context: AiCopilotContext, includeAllSites: boolean) => {
  if (includeAllSites || !context.activeSiteId || context.activeSiteId === 'All') return context.devices;
  const site = context.sites.find((item) => item.id === context.activeSiteId);
  const siteTags = new Set(site?.tags || []);
  return context.devices.filter((device) => (
    device.siteId === context.activeSiteId
    || (!device.siteId && device.tags?.some((tag) => siteTags.has(tag)))
  ));
};

const findMentionedDevice = (query: string, devices: Device[]) => {
  const normalizedQuery = normalize(query);
  return devices.find((device) => (
    normalizedQuery.includes(normalize(device.id))
    || normalizedQuery.includes(normalize(device.name))
    || normalize(device.name).split(/\s+/).some((part) => part.length >= 4 && normalizedQuery.includes(part))
  )) || null;
};

const deviceMetricSummary = (device: Device) => {
  const metrics = Object.entries(device.metrics || {})
    .filter(([, value]) => Number.isFinite(Number(value)))
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${formatNumber(Number(value), 2)}`);
  return metrics.length ? metrics.join(', ') : 'no numeric metrics';
};

const buildReportRows = (devices: Device[], alerts: Alert[], title: string) => {
  const totalPower = devices.reduce((sum, device) => sum + metricValue(device, ['power', 'pv_power']), 0);
  const totalEnergy = devices.reduce((sum, device) => sum + metricValue(device, ['energy', 'energy_today', 'daily_generation']), 0);
  const activeAlerts = alerts.filter((alert) => alert.status === 'active');

  return [
    ['Report', title],
    ['Generated At', new Date().toISOString()],
    ['Devices', String(devices.length)],
    ['Online Devices', String(devices.filter((device) => device.status === 'online').length)],
    ['Warning Devices', String(devices.filter((device) => device.status === 'warning').length)],
    ['Offline Devices', String(devices.filter((device) => device.status === 'offline').length)],
    ['Active Alerts', String(activeAlerts.length)],
    ['Total Power W', totalPower.toFixed(2)],
    ['Total Energy kWh', totalEnergy.toFixed(2)],
    [],
    ['Device ID', 'Name', 'Type', 'Status', 'Last Seen', 'Metrics'],
    ...devices.map((device) => [
      device.id,
      device.name,
      device.type,
      device.status,
      device.lastSeen || '',
      deviceMetricSummary(device),
    ]),
    [],
    ['Alert ID', 'Device ID', 'Device Name', 'Level', 'Status', 'Message', 'Timestamp'],
    ...alerts.map((alert) => [
      alert.id,
      alert.deviceId,
      alert.deviceName,
      alert.level,
      alert.status,
      alert.message,
      alert.timestamp,
    ]),
  ];
};

const createWorkflowDraft = (title: string, description: string, device: Device | null, metric: string, threshold: number): Workflow => {
  const idSuffix = `${Date.now()}-${Math.round(Math.random() * 10000)}`;
  const triggerId = `ai_trigger_${idSuffix}`;
  const analysisId = `ai_analyze_${idSuffix}`;
  const notificationId = `ai_notify_${idSuffix}`;

  return {
    id: `wf-ai-${idSuffix}`,
    name: title,
    description,
    enabled: false,
    draftVersion: 1,
    publishedVersion: 0,
    updatedAt: new Date().toISOString(),
    nodes: [
      {
        id: triggerId,
        name: 'ai_metric_trigger',
        type: 'trigger',
        config: {
          type: 'threshold',
          device: device?.id || '',
          metric,
          condition: '>',
          value: threshold,
          cooldownMinutes: 10,
        },
      },
      {
        id: analysisId,
        name: 'ai_root_cause',
        type: 'action',
        config: {
          type: 'ai_analyze',
          prompt: `Analyze ${metric} anomaly for ${device?.name || 'the affected device'} and suggest maintenance actions.`,
        },
      },
      {
        id: notificationId,
        name: 'notify_operator',
        type: 'action',
        config: {
          type: 'notification',
          message: `AI detected ${metric} anomaly on ${device?.name || 'a device'}. $.ai_root_cause.output.summary`,
        },
      },
    ],
    edges: [
      { id: `edge-${triggerId}-${analysisId}`, source: triggerId, target: analysisId, type: 'next' },
      { id: `edge-${analysisId}-${notificationId}`, source: analysisId, target: notificationId, type: 'next' },
    ],
  };
};

const knowledgeMatches = (query: string) => {
  const text = normalize(query);
  const matches: string[] = [];
  if (hasAny(text, ['mqtt', 'broker', 'topic'])) {
    matches.push('Knowledge: MQTT Subscriber runs in the backend and writes accepted telemetry into raw data and device metrics.');
  }
  if (hasAny(text, ['http', 'api', 'push', '上报'])) {
    matches.push('Knowledge: HTTP Push is gateway-to-dashboard ingestion. Devices should POST telemetry to the dashboard endpoint.');
  }
  if (hasAny(text, ['workflow', '工作流', 'automation', '自动化'])) {
    matches.push('Knowledge: Workflows execute from any matching trigger, then route through IF / ELIF / ELSE, Switch / Case, or action nodes.');
  }
  if (hasAny(text, ['claim', 'mac', 'imei', 'serial', '认领'])) {
    matches.push('Knowledge: Provisioning can match manufactured devices by MAC, IMEI, or Serial Number with Claim Code validation.');
  }
  if (hasAny(text, ['scada', '运维视图'])) {
    matches.push('Knowledge: SCADA reads device logs and workflow runtime state for dynamic animations and historical playback.');
  }
  return matches;
};

export const runAiCopilot = (query: string, context: AiCopilotContext): AiCopilotResponse => {
  const text = normalize(query);
  const includeAllSites = hasAny(text, ['all site', 'all sites', '全部站点', '所有站点']);
  const devices = getSiteDevices(context, includeAllSites);
  const deviceIds = new Set(devices.map((device) => device.id));
  const alerts = context.alerts.filter((alert) => includeAllSites || deviceIds.has(alert.deviceId));
  const activeAlerts = alerts.filter((alert) => alert.status === 'active');
  const mentionedDevice = findMentionedDevice(query, devices);
  const targetDevices = mentionedDevice ? [mentionedDevice] : devices;
  const totalPower = targetDevices.reduce((sum, device) => sum + metricValue(device, ['power', 'pv_power']), 0);
  const totalEnergy = targetDevices.reduce((sum, device) => sum + metricValue(device, ['energy', 'energy_today', 'daily_generation']), 0);
  const topPowerDevices = [...devices]
    .map((device) => ({ device, power: metricValue(device, ['power', 'pv_power']) }))
    .filter((item) => item.power > 0)
    .sort((first, second) => second.power - first.power)
    .slice(0, 3);
  const anomalyDevices = devices.filter((device) => (
    device.status !== 'online'
    || metricValue(device, ['temperature', 'motor_temp', 'oil_temp']) >= 80
    || metricValue(device, ['pressure']) >= 8
    || metricValue(device, ['leakage_rate']) > 2
    || (metricValue(device, ['battery', 'battery_soc']) > 0 && metricValue(device, ['battery', 'battery_soc']) < 20)
  ));
  const sources = [
    `${devices.length} scoped devices`,
    `${alerts.length} derived alerts`,
    `${context.workflows.length} workflows`,
    `${context.charts.length} analytics charts`,
    ...knowledgeMatches(query),
  ];
  const insights: AiCopilotResponse['insights'] = [
    { label: 'Devices', value: `${devices.length}`, tone: 'neutral' },
    { label: 'Online', value: `${devices.filter((device) => device.status === 'online').length}`, tone: 'good' },
    { label: 'Active alerts', value: `${activeAlerts.length}`, tone: activeAlerts.length ? 'warning' : 'good' },
    { label: 'Power', value: `${formatNumber(totalPower, 0)} W`, tone: totalPower > 20000 ? 'warning' : 'neutral' },
  ];

  const relatedDevices = (mentionedDevice ? [mentionedDevice] : anomalyDevices.length ? anomalyDevices : topPowerDevices.map((item) => item.device))
    .slice(0, 5)
    .map((device) => ({
      id: device.id,
      name: device.name,
      type: device.type,
      status: device.status,
      reason: device === mentionedDevice
        ? `Matched your question. Current metrics: ${deviceMetricSummary(device)}.`
        : device.status !== 'online'
          ? `Status is ${device.status}. Last seen ${device.lastSeen || 'unknown'}.`
          : `Relevant metrics: ${deviceMetricSummary(device)}.`,
    }));

  const recommendations = [
    activeAlerts.length ? 'Review active alerts first and acknowledge only after the physical condition is confirmed.' : 'No active derived alert is blocking the current site scope.',
    anomalyDevices.length ? 'Create an automated workflow for repeated anomalies so operators receive consistent notifications.' : 'Keep monitoring telemetry freshness and add thresholds for the most critical metrics.',
    topPowerDevices[0] ? `Check ${topPowerDevices[0].device.name} first for load profile, schedule, and maintenance impact.` : 'No power metric is available yet. Confirm metric mapping for power or energy fields.',
  ];

  let title = 'Operations summary';
  let answer = `I checked the current site scope. There are ${devices.length} devices, ${activeAlerts.length} active alerts, ${formatNumber(totalPower, 0)} W current power, and ${formatNumber(totalEnergy, 2)} kWh reported energy.`;
  const actions: AiCopilotAction[] = [];

  const reportRows = buildReportRows(targetDevices, alerts, mentionedDevice ? `${mentionedDevice.name} AI Report` : 'AI Operations Report');
  actions.push({
    id: 'download-report',
    type: 'download_report',
    label: 'Download AI Report',
    description: 'Export the Copilot analysis context as CSV.',
    rows: reportRows,
    fileName: mentionedDevice ? `${mentionedDevice.id}-ai-report.csv` : 'ai-operations-report.csv',
  });

  if (relatedDevices[0]) {
    actions.push({
      id: `open-${relatedDevices[0].id}`,
      type: 'open_device',
      label: `Open ${relatedDevices[0].name}`,
      description: 'Inspect device details, metrics, logs, and controls.',
      deviceId: relatedDevices[0].id,
    });
  }

  if (hasAny(text, ['workflow', 'automation', '自动化', '工作流', 'generate workflow', '创建流程'])) {
    const workflowDevice = mentionedDevice || anomalyDevices[0] || topPowerDevices[0]?.device || devices[0] || null;
    const metric = workflowDevice
      ? metricValue(workflowDevice, ['temperature', 'motor_temp', 'oil_temp']) >= 80
        ? 'temperature'
        : metricValue(workflowDevice, ['pressure']) >= 8
          ? 'pressure'
          : metricValue(workflowDevice, ['leakage_rate']) > 2
            ? 'leakage_rate'
            : 'power'
      : 'power';
    const currentValue = workflowDevice ? metricValue(workflowDevice, [metric]) : 0;
    const threshold = currentValue > 0 ? Number((currentValue * 1.08).toFixed(1)) : 1;
    const workflow = createWorkflowDraft(
      `AI Guard - ${workflowDevice?.name || 'Device Anomaly'}`,
      'Generated by AI Copilot as a draft. Review thresholds, notification targets, and publish when ready.',
      workflowDevice,
      metric,
      threshold
    );
    title = 'Workflow draft prepared';
    answer = `I prepared a workflow draft for ${workflowDevice?.name || 'the selected device'}. It watches ${metric} above ${threshold}, runs AI analysis, then sends a system notification. It is saved as disabled draft until you review and publish it.`;
    actions.unshift({
      id: 'create-workflow',
      type: 'create_workflow',
      label: 'Create Workflow Draft',
      description: 'Add this generated workflow to Workflow Automation.',
      workflow,
    });
  } else if (hasAny(text, ['report', '报表', 'export', '导出', 'summary'])) {
    title = 'Report ready';
    answer = `I generated a report context for ${targetDevices.length} device(s), including metrics, active alerts, total power, and total energy. You can download it as CSV now.`;
  } else if (hasAny(text, ['anomaly', '异常', '告警', 'alert', 'root cause', '原因'])) {
    title = 'Anomaly analysis';
    answer = activeAlerts.length || anomalyDevices.length
      ? `I found ${activeAlerts.length} active alert(s) and ${anomalyDevices.length} device(s) that need attention. The most likely causes are stale telemetry, high temperature, high pressure, leakage, or high power draw depending on the device metrics.`
      : 'I did not find active derived anomalies in the current site scope. If the physical equipment is abnormal, check telemetry mapping and whether the device is still reporting fresh data.';
  } else if (hasAny(text, ['energy', 'power', '能耗', '用电', 'cost', 'electricity'])) {
    title = 'Energy analysis';
    answer = topPowerDevices.length
      ? `Current total power is ${formatNumber(totalPower, 0)} W. The highest contributors are ${topPowerDevices.map((item) => `${item.device.name} (${formatNumber(item.power, 0)} W)`).join(', ')}.`
      : 'I could not find power metrics in this scope. Confirm telemetry mapping for power, energy, or pv_power fields.';
  } else if (hasAny(text, ['device', '设备', 'status', 'online', 'offline'])) {
    title = mentionedDevice ? `${mentionedDevice.name} status` : 'Device status';
    answer = mentionedDevice
      ? `${mentionedDevice.name} is ${mentionedDevice.status}. Last seen: ${mentionedDevice.lastSeen || 'unknown'}. Current metrics: ${deviceMetricSummary(mentionedDevice)}.`
      : `There are ${devices.length} devices in scope: ${devices.filter((device) => device.status === 'online').length} online, ${devices.filter((device) => device.status === 'warning').length} warning, and ${devices.filter((device) => device.status === 'offline').length} offline.`;
  }

  actions.push({
    id: 'open-analytics',
    type: 'open_route',
    label: 'Open Analytics',
    description: 'Build charts against telemetry logs.',
    route: '/analytics',
  });

  return {
    title,
    answer,
    insights,
    relatedDevices,
    recommendations,
    sources,
    actions,
  };
};
