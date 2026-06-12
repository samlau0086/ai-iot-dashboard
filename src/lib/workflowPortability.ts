import type { Workflow, WorkflowEdge, WorkflowNode } from './store';

export type WorkflowExportPayload = {
  kind: 'ai-iot-dashboard.workflow';
  version: 1;
  exportedAt: string;
  workflow: Workflow;
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  workflow: Workflow;
};

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createWebhookEndpoint = (workflowId: string, origin = '') => {
  const bytes = new Uint8Array(16);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/api/workflow-webhooks/${workflowId}/${token}`;
};

const sanitizeWorkflowNodeForExport = (node: WorkflowNode): WorkflowNode => {
  const nextNode = cloneJson(node);
  if (nextNode.type === 'trigger' && nextNode.config?.type === 'webhook') {
    nextNode.config = {
      ...nextNode.config,
      endpoint: '',
    };
  }
  return nextNode;
};

const sanitizeWorkflowForExport = (workflow: Workflow): Workflow => {
  const nextWorkflow = cloneJson(workflow);
  nextWorkflow.nodes = (nextWorkflow.nodes || []).map(sanitizeWorkflowNodeForExport);
  if (nextWorkflow.publishedSnapshot?.nodes) {
    nextWorkflow.publishedSnapshot.nodes = nextWorkflow.publishedSnapshot.nodes.map(sanitizeWorkflowNodeForExport);
  }
  if (Array.isArray(nextWorkflow.versionHistory)) {
    nextWorkflow.versionHistory = nextWorkflow.versionHistory.map((version) => ({
      ...version,
      nodes: (version.nodes || []).map(sanitizeWorkflowNodeForExport),
    }));
  }
  return nextWorkflow;
};

export const exportWorkflowToJson = (workflow: Workflow) => {
  const payload: WorkflowExportPayload = {
    kind: 'ai-iot-dashboard.workflow',
    version: 1,
    exportedAt: new Date().toISOString(),
    workflow: sanitizeWorkflowForExport(workflow),
  };
  return JSON.stringify(payload, null, 2);
};

const assertWorkflowShape = (workflow: Partial<Workflow>) => {
  if (!workflow || typeof workflow !== 'object') throw new Error('Workflow JSON is empty.');
  if (!workflow.name || typeof workflow.name !== 'string') throw new Error('Workflow name is required.');
  if (!Array.isArray(workflow.nodes)) throw new Error('Workflow nodes must be an array.');
  workflow.nodes.forEach((node, index) => {
    if (!node || typeof node !== 'object') throw new Error(`Node ${index + 1} is invalid.`);
    if (!node.id || !node.type || !node.config) throw new Error(`Node ${index + 1} must include id, type, and config.`);
    if (!['trigger', 'condition', 'action'].includes(node.type)) throw new Error(`Node ${index + 1} has unsupported type: ${node.type}.`);
  });
  if (workflow.edges && !Array.isArray(workflow.edges)) throw new Error('Workflow edges must be an array.');
};

const remapWorkflowIds = (workflow: Workflow, origin = ''): Workflow => {
  const workflowId = createId('wf');
  const idMap = new Map<string, string>();
  const nodes = (workflow.nodes || []).map((node) => {
    const nextId = createId('n');
    idMap.set(node.id, nextId);
    return node;
  }).map((node) => {
    const nextNode = cloneJson(node);
    nextNode.id = idMap.get(node.id) || createId('n');
    if (nextNode.config?.groupId && idMap.has(nextNode.config.groupId)) {
      nextNode.config.groupId = idMap.get(nextNode.config.groupId);
    }
    if (nextNode.type === 'trigger' && nextNode.config?.type === 'webhook') {
      nextNode.config.endpoint = createWebhookEndpoint(workflowId, origin);
    }
    return nextNode;
  });

  const edges = (workflow.edges || [])
    .map((edge): WorkflowEdge | null => {
      const source = idMap.get(edge.source);
      const target = idMap.get(edge.target);
      if (!source || !target) return null;
      return {
        ...edge,
        id: createId('e'),
        source,
        target,
      };
    })
    .filter((edge): edge is WorkflowEdge => Boolean(edge));

  return {
    id: workflowId,
    name: `${workflow.name} Imported`,
    description: workflow.description || '',
    enabled: false,
    nodes,
    edges,
    draftVersion: 1,
    publishedVersion: 0,
    updatedAt: new Date().toISOString(),
  };
};

export const importWorkflowFromJson = (jsonText: string, origin = '') => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid JSON. Please paste a workflow export file.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Workflow JSON must be an object.');
  }

  const payload = parsed as Partial<WorkflowExportPayload> | Workflow;
  const workflow = 'workflow' in payload && payload.workflow ? payload.workflow : payload;
  assertWorkflowShape(workflow as Partial<Workflow>);
  return remapWorkflowIds(workflow as Workflow, origin);
};

const withLinearEdges = (workflow: Workflow): Workflow => ({
  ...workflow,
  edges: workflow.nodes.slice(0, -1).map((node, index) => ({
    id: `edge-${workflow.id}-${index}`,
    source: node.id,
    target: workflow.nodes[index + 1].id,
    type: 'next' as const,
  })),
});

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'device-offline-notify',
    name: 'Device Offline -> Notify',
    description: 'When a device reports offline, send a system notification with cooldown protection.',
    tags: ['device', 'notification'],
    workflow: withLinearEdges({
      id: 'tpl-device-offline',
      name: 'Device Offline Notification',
      description: 'Notify operators when a device goes offline.',
      enabled: false,
      nodes: [
        {id: 'trigger-offline', name: 'offline_trigger', type: 'trigger', config: {type: 'offline', device: '', duration: '10m', cooldown: '10m', dedupeKey: '$.input.event.deviceId'}},
        {id: 'notify-offline', name: 'notify_offline', type: 'action', config: {type: 'notification', groupId: 'group-offline', message: 'Device offline: $.input.deviceId', executionPolicy: {timeout: '30s', onFailure: 'continue'}}},
      ],
    }),
  },
  {
    id: 'threshold-if-control',
    name: 'Threshold Exceeded -> Notify / Control',
    description: 'Detect high temperature, branch through IF, then notify and queue a device control action.',
    tags: ['threshold', 'control'],
    workflow: {
      id: 'tpl-threshold-control',
      name: 'Threshold Control Response',
      description: 'Notify and control a device when a metric exceeds a threshold.',
      enabled: false,
      nodes: [
        {id: 'trigger-threshold', name: 'threshold_trigger', type: 'trigger', config: {type: 'threshold', device: '', metric: 'temperature', condition: '>', value: 80, duration: '1m', cooldown: '60s', dedupeKey: '$.input.event.deviceId'}},
        {id: 'if-high', name: 'check_temperature', type: 'condition', config: {type: 'if', device: '', metric: 'temperature', condition: '>', value: 80}},
        {id: 'notify-high', name: 'notify_high_temperature', type: 'action', config: {type: 'notification', groupId: 'if-high', message: 'High temperature on $.input.deviceId: $.input.event.message.temperature'}},
        {id: 'control-high', name: 'control_cooling', type: 'action', config: {type: 'device_control', groupId: 'if-high', deviceSource: 'expression', deviceExpression: '$.input.deviceId', controlId: 'power_on', parameters: {value: true}}},
      ],
      edges: [
        {id: 'edge-threshold-if', source: 'trigger-threshold', target: 'if-high', type: 'next'},
        {id: 'edge-if-notify', source: 'if-high', target: 'notify-high', type: 'true'},
        {id: 'edge-notify-control', source: 'notify-high', target: 'control-high', type: 'next'},
      ],
    },
  },
  {
    id: 'access-control',
    name: 'QR/NFC Access -> Device Control',
    description: 'Use QR or NFC Access extra parameters to control a target device.',
    tags: ['access', 'nfc', 'control'],
    workflow: {
      id: 'tpl-access-control',
      name: 'Access Granted Device Control',
      description: 'Control a device when QR or NFC access is accepted.',
      enabled: false,
      nodes: [
        {id: 'trigger-access', name: 'access_trigger', type: 'trigger', config: {type: 'access', accessId: '', cooldown: '0s', dedupeKey: '$.input.event.credentialId'}},
        {id: 'trigger-nfc', name: 'nfc_trigger', type: 'trigger', config: {type: 'nfc_access', accessId: '', cooldown: '0s', dedupeKey: '$.input.event.credentialId'}},
        {id: 'access-control', name: 'access_device_control', type: 'action', config: {type: 'device_control', groupId: 'group-access', deviceSource: 'expression', deviceExpression: '$.input.deviceId', controlId: 'power_on', parameters: {value: true}}},
      ],
      edges: [
        {id: 'edge-access-control', source: 'trigger-access', target: 'access-control', type: 'next'},
        {id: 'edge-nfc-control', source: 'trigger-nfc', target: 'access-control', type: 'next'},
      ],
    },
  },
  {
    id: 'mqtt-alert-ticket',
    name: 'MQTT Alert -> Create Ticket',
    description: 'Match incoming MQTT alert payloads and create a maintenance ticket.',
    tags: ['mqtt', 'ticket'],
    workflow: withLinearEdges({
      id: 'tpl-mqtt-ticket',
      name: 'MQTT Alert Ticket',
      description: 'Create a ticket when an MQTT alert payload is received.',
      enabled: false,
      nodes: [
        {id: 'trigger-mqtt', name: 'mqtt_alert', type: 'trigger', config: {type: 'mqtt_message', device: '', topic: 'devices/+/telemetry', payload_match: '{"status":"alert"}', cooldown: '30s', dedupeKey: '$.input.event.message.topic'}},
        {id: 'ticket-mqtt', name: 'create_ticket', type: 'action', config: {type: 'ticket', groupId: 'group-mqtt', priority: 'high', assignee: 'maintenance', message: 'MQTT alert received: $.input.event.message.status'}},
      ],
    }),
  },
  {
    id: 'schedule-report',
    name: 'Schedule -> Generate Report',
    description: 'Run on a schedule and queue a weekly operations report.',
    tags: ['schedule', 'report'],
    workflow: withLinearEdges({
      id: 'tpl-schedule-report',
      name: 'Scheduled Weekly Report',
      description: 'Generate an operations report on a schedule.',
      enabled: false,
      nodes: [
        {id: 'trigger-schedule', name: 'weekly_schedule', type: 'trigger', config: {type: 'schedule', device: '', crontab: '0 8 * * 1', cooldown: '0s', dedupeKey: ''}},
        {id: 'report-schedule', name: 'generate_report', type: 'action', config: {type: 'report', groupId: 'group-report', frequency: 'weekly', recipient: 'manager@factory.com'}},
      ],
    }),
  },
];

export const createWorkflowFromTemplate = (template: WorkflowTemplate, origin = '') => {
  const imported = remapWorkflowIds(template.workflow, origin);
  return {
    ...imported,
    name: template.workflow.name,
    description: template.workflow.description,
  };
};
