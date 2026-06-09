import React, { useState, useEffect, useRef } from 'react';
import { useAppStore, Workflow, WorkflowEdge, WorkflowNode } from '../lib/store';
import { translations } from '../lib/i18n';
import { 
  ArrowLeft, Plus, Save, Trash2, Play, Square,
  MessageCircle, Mail, Ticket, Power, Globe, FileText, BrainCircuit,
  Activity, Clock, Zap, PowerOff, ArrowDown, X, AlertTriangle, Settings,
  GitBranch, GitCommit, Settings2, Timer, ChevronDown, Radio, Wifi, Bell,
  Code2, Shuffle, Ruler, Database, Repeat2, Ban, Braces, Route
} from 'lucide-react';
import { cn } from '../lib/utils';
import { buildControlParameters, getDeviceControlDefinitions } from '../lib/deviceControls';

interface WorkflowEditorProps {
  workflowId: string;
  onBack: () => void;
}

const getActionIcon = (type: string) => {
  switch (type) {
    case 'whatsapp': return <MessageCircle className="h-5 w-5 text-emerald-500" />;
    case 'email': return <Mail className="h-5 w-5 text-blue-500" />;
    case 'ticket': return <Ticket className="h-5 w-5 text-purple-500" />;
    case 'start_backup': return <Power className="h-5 w-5 text-orange-500" />;
    case 'stop_device': return <PowerOff className="h-5 w-5 text-red-500" />;
    case 'device_control': return <Settings2 className="h-5 w-5 text-orange-500" />;
    case 'webhook': return <Globe className="h-5 w-5 text-indigo-500" />;
    case 'report': return <FileText className="h-5 w-5 text-slate-500" />;
    case 'ai_analyze': return <BrainCircuit className="h-5 w-5 text-orange-600" />;
    case 'threshold': return <Activity className="h-5 w-5 text-cyan-500" />;
    case 'offline': return <PowerOff className="h-5 w-5 text-red-500" />;
    case 'alert': return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    case 'schedule': return <Clock className="h-5 w-5 text-blue-500" />;
    case 'ai': return <BrainCircuit className="h-5 w-5 text-orange-600" />;
    case 'if': return <GitBranch className="h-5 w-5 text-indigo-500" />;
    case 'elif': return <GitCommit className="h-5 w-5 text-indigo-500" />;
    case 'else': return <GitBranch className="h-5 w-5 text-slate-500" />;
    case 'logic_and': return <GitCommit className="h-5 w-5 text-purple-500" />;
    case 'logic_or': return <GitBranch className="h-5 w-5 text-purple-500" />;
    case 'check_state': return <Settings2 className="h-5 w-5 text-indigo-500" />;
    case 'time_window': return <Timer className="h-5 w-5 text-amber-500" />;
    case 'delay': return <Timer className="h-5 w-5 text-slate-500" />;
    case 'mqtt_message': return <Radio className="h-5 w-5 text-sky-500" />;
    case 'mqtt_publish': return <Wifi className="h-5 w-5 text-sky-600" />;
    case 'notification': return <Bell className="h-5 w-5 text-yellow-500" />;
    case 'debug': return <Activity className="h-5 w-5 text-lime-500" />;
    case 'set': return <Braces className="h-5 w-5 text-emerald-500" />;
    case 'function': return <Code2 className="h-5 w-5 text-violet-500" />;
    case 'switch': return <Route className="h-5 w-5 text-indigo-500" />;
    case 'http_request': return <Globe className="h-5 w-5 text-blue-500" />;
    case 'metric_mapper': return <Shuffle className="h-5 w-5 text-cyan-500" />;
    case 'unit_convert': return <Ruler className="h-5 w-5 text-amber-500" />;
    case 'command_confirm': return <Activity className="h-5 w-5 text-emerald-500" />;
    case 'retry': return <Repeat2 className="h-5 w-5 text-orange-500" />;
    case 'error_catch': return <Database className="h-5 w-5 text-red-500" />;
    case 'stop_workflow': return <Ban className="h-5 w-5 text-red-500" />;
    default: return <Zap className="h-5 w-5 text-slate-400" />;
  }
};

const defaultConfigs: Record<string, any> = {
  threshold: { device: '', metric: 'temperature', condition: '>', value: 10, duration: '5m' },
  offline: { device: '', duration: '10m' },
  alert: { device: '', severity: 'critical' },
  schedule: { device: '', crontab: '0 * * * *' },
  ai: { device: '', anomalyType: 'all' },
  webhook: { device: '', endpoint: '/api/v1/webhook/' },
  mqtt_message: { device: '', topic: 'sensors/+/data', payload_match: '{"status":"alert"}' },
  whatsapp: { target: '+1234567890', message: 'Alert triggered!' },
  email: { to: 'admin@factory.com', subject: 'Alert Notification' },
  ticket: { priority: 'high', assignee: 'maintenance' },
  start_backup: { target: '' },
  stop_device: { target: '' },
  device_control: { device: '', controlId: '', value: '', parameterName: '', parameters: {} },
  report: { frequency: 'weekly', recipient: 'manager@factory.com' },
  ai_analyze: { prompt: 'Analyze possible causes for the event.' },
  delay: { duration: '60s' },
  mqtt_publish: { target: '', topic: 'control/device', payload: '{"cmd":"stop"}' },
  notification: { message: 'Alert triggered!' },
  debug: { expression: '', label: 'Debug snapshot' },
  set: { assignments: '{\n  "payload.status": "processed"\n}', mergeMode: 'merge' },
  function: { code: 'return { ...input.event, processedAt: new Date().toISOString() };' },
  switch: { property: 'event.message.status', condition: '==', value: 'warning' },
  case: { property: 'event.message.status', condition: '==', value: 'normal' },
  default: {},
  http_request: { method: 'POST', url: 'https://example.com/webhook', headers: '{"content-type":"application/json"}', body: '{"event":"$.debug.output"}' },
  metric_mapper: { mappings: '{\n  "temp": "temperature",\n  "pwr": "power"\n}' },
  unit_convert: { metric: 'event.message.temperature', from: 'F', to: 'C' },
  command_confirm: { device: '', commandId: '$.device_control.output.commandId', timeout: '30s' },
  retry: { attempts: 3, interval: '10s' },
  error_catch: { fromNode: '', fallbackMessage: 'Workflow branch failed' },
  stop_workflow: { reason: 'Stopped by workflow node' },
  if: { device: '', metric: 'temperature', condition: '>', value: 10 },
  elif: { device: '', metric: 'power', condition: '>', value: 1000 },
  else: {},
  logic_and: { preconditions: 'temp > 30, humidity < 50' },
  logic_or: { preconditions: 'door_open == true, motion_detected == true' },
  check_state: { device: '', status: 'open' },
  time_window: { start: '22:00', end: '06:00' },
};

const multilineConfigKeys = new Set(['assignments', 'code', 'rules', 'headers', 'body', 'mappings', 'payload', 'expression']);
const selectConfigOptions: Record<string, string[]> = {
  method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  mergeMode: ['merge', 'replace'],
  from: ['C', 'F', 'K', 'W', 'kW', 'Wh', 'kWh', 'bar', 'psi'],
  to: ['C', 'F', 'K', 'W', 'kW', 'Wh', 'kWh', 'bar', 'psi'],
};
const hiddenActionNodeTypes = new Set(['retry', 'error_catch']);

const isFlowControlNode = (node?: WorkflowNode) => node?.type === 'action' && ['retry', 'error_catch'].includes(node.config?.type);
const isStopWorkflowNode = (node?: WorkflowNode) => node?.type === 'action' && node.config?.type === 'stop_workflow';

const createWebhookEndpoint = (workflowId: string) => {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  return `${window.location.origin}/api/workflow-webhooks/${workflowId}/${token}`;
};

const slugifyNodeName = (value: string) => String(value || '')
  .trim()
  .replace(/\s+/g, '_')
  .replace(/[.]/g, '_');

const getNodeDefaultName = (type: string, existingNodes: WorkflowNode[]) => {
  const base = slugifyNodeName(type) || 'node';
  let index = existingNodes.length + 1;
  let name = `${base}_${index}`;
  const existingNames = new Set(existingNodes.map((node) => node.name).filter(Boolean));

  while (existingNames.has(name)) {
    index++;
    name = `${base}_${index}`;
  }

  return name;
};

function DeviceSelect({ value, onChange, devices }: { value: string, onChange: (val: string) => void, devices: any[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  
  const filtered = devices.filter(d => d.name.toLowerCase().includes(search.toLowerCase()) || d.id.toLowerCase().includes(search.toLowerCase()));
  const selected = devices.find(d => d.id === value);

  useEffect(() => {
    const handleClick = () => setIsOpen(false);
    if (isOpen) {
      window.addEventListener('click', handleClick);
    }
    return () => window.removeEventListener('click', handleClick);
  }, [isOpen]);
  
  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="block w-full rounded-md border-0 py-2 pl-3 pr-10 text-left text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
      >
        {selected ? selected.name : 'All Devices / Any'}
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
        </span>
      </button>
      
      {isOpen && (
        <div className="absolute z-10 mx-auto mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm dark:bg-slate-800 dark:ring-slate-700">
          <div className="sticky top-0 z-10 bg-white px-3 py-2 dark:bg-slate-800">
            <input
              type="text"
              className="block w-full rounded-md border-0 py-1.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm sm:leading-6 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div 
            className={cn("relative cursor-default select-none py-2 pl-3 pr-9 hover:bg-orange-50 dark:hover:bg-slate-700", !value && "bg-orange-50 dark:bg-slate-700")}
             onClick={() => { onChange(''); setIsOpen(false); }}
          >
            All Devices / Any
          </div>
          {filtered.map(device => (
            <div
              key={device.id}
              className={cn("relative cursor-default select-none py-2 pl-3 pr-9 hover:bg-orange-50 dark:hover:bg-slate-700", value === device.id && "bg-orange-50 dark:bg-slate-700")}
              onClick={() => { onChange(device.id); setIsOpen(false); }}
            >
              <div className="flex items-center">
                <span className={cn("inline-block w-2 h-2 rounded-full mr-2 shrink-0", device.status === 'online' ? "bg-emerald-500" : "bg-red-500")} />
                <span className={cn("block truncate", value === device.id ? "font-semibold" : "font-normal")}>
                  {device.name}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkflowEditor({ workflowId, onBack }: WorkflowEditorProps) {
  const { language, workflows, addWorkflow, updateWorkflow, devices } = useAppStore();
  const t = translations[language];
  const isNew = workflowId === 'new';

  const [draft, setDraft] = useState<Workflow>({
    id: `wf-${Date.now()}`,
    name: 'New Workflow',
    description: '',
    enabled: true,
    nodes: []
  });

  const [showSelector, setShowSelector] = useState<{
    show: boolean;
    insertIndex: number;
    isTriggerSelect?: boolean;
    actionGroupId?: string;
    branchOnly?: boolean;
    allowedConditionTypes?: string[];
  }>({ show: false, insertIndex: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [liveState, setLiveState] = useState<any>(null);
  const [liveNodeId, setLiveNodeId] = useState<string | null>(null);
  const lastLiveRunKeyRef = useRef('');
  const liveReplayTimersRef = useRef<number[]>([]);

  const triggerNodes = draft.nodes.filter(n => n.type === 'trigger');
  const otherNodes = draft.nodes.filter(n => n.type !== 'trigger');

  const isTriggerOnly = showSelector.isTriggerSelect || (showSelector.insertIndex === 0 && triggerNodes.length === 0);
  const isAfterTriggers = showSelector.insertIndex === triggerNodes.length;
  const showConditions = !isTriggerOnly && !showSelector.actionGroupId;

  const availableConditionTypes = Object.keys(t.workflows.conditionTypes);
  const branchConditionTypes = new Set(['if', 'elif', 'else', 'switch', 'case', 'default']);
  const branchRootTypes = new Set(['if', 'switch']);
  const terminalBranchTypes = new Set(['else', 'default']);
  const getBranchFamily = (type: string) => (['switch', 'case', 'default'].includes(type) ? 'switch' : 'if');
  const conditionTypesForSelector = showSelector.allowedConditionTypes || availableConditionTypes.filter((type) => !['elif', 'else', 'case', 'default'].includes(type));

  type BranchGroup = { condition: WorkflowNode; index: number; nodes: Array<{ node: WorkflowNode; index: number }>; endIndex: number };
  type FlowItem = { type: 'branch_group'; branches: BranchGroup[]; startIndex: number; endIndex: number } | { type: 'nodes'; groups: any[] };

  const toActionGroups = (items: Array<{ node: WorkflowNode; index: number }>) => {
    const groups: any[] = [];
    items.forEach(({ node, index }) => {
      if (node.type === 'condition') {
        groups.push({ type: 'condition', node, index });
        return;
      }
      if (isFlowControlNode(node)) {
        groups.push({ type: 'flow_control', node, index });
        return;
      }

      const groupId = node.config.groupId || node.id;
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.type === 'action_group' && lastGroup.groupId === groupId) {
        lastGroup.nodes.push({ node, index });
      } else {
        groups.push({ type: 'action_group', groupId, nodes: [{ node, index }] });
      }
    });
    return groups;
  };

  const flowItems: FlowItem[] = [];
  let flowIndex = triggerNodes.length;
  while (flowIndex < draft.nodes.length) {
    const node = draft.nodes[flowIndex];
    if (node.type === 'trigger') {
      flowIndex++;
      continue;
    }

    if (node.type === 'condition' && branchConditionTypes.has(node.config.type)) {
      const branches: BranchGroup[] = [];
      const startIndex = flowIndex;

      while (
        flowIndex < draft.nodes.length
        && draft.nodes[flowIndex].type === 'condition'
        && branchConditionTypes.has(draft.nodes[flowIndex].config.type)
      ) {
        const condition = draft.nodes[flowIndex];
        const previousBranchType = branches[branches.length - 1]?.condition.config.type;
        const rootFamily = getBranchFamily(branches[0]?.condition.config.type || condition.config.type);
        const conditionFamily = getBranchFamily(condition.config.type);
        if (
          branches.length > 0
          && (branchRootTypes.has(condition.config.type) || terminalBranchTypes.has(previousBranchType) || conditionFamily !== rootFamily)
        ) {
          break;
        }

        const branch: BranchGroup = { condition, index: flowIndex, nodes: [], endIndex: flowIndex + 1 };
        flowIndex++;

        while (
          flowIndex < draft.nodes.length
          && draft.nodes[flowIndex].type === 'action'
          && draft.nodes[flowIndex].config?.groupId === condition.id
        ) {
          branch.nodes.push({ node: draft.nodes[flowIndex], index: flowIndex });
          flowIndex++;
          branch.endIndex = flowIndex;
        }

        branches.push(branch);
      }

      flowItems.push({ type: 'branch_group', branches, startIndex, endIndex: flowIndex });
      continue;
    }

    const nodeItems: Array<{ node: WorkflowNode; index: number }> = [];
    while (
      flowIndex < draft.nodes.length
      && draft.nodes[flowIndex].type !== 'trigger'
      && !(draft.nodes[flowIndex].type === 'condition' && branchConditionTypes.has(draft.nodes[flowIndex].config.type))
    ) {
      nodeItems.push({ node: draft.nodes[flowIndex], index: flowIndex });
      flowIndex++;
    }
    flowItems.push({ type: 'nodes', groups: toActionGroups(nodeItems) });
  }
  const getBranchRootName = (nodeId: string) => {
    const branchGroup = flowItems.find((item): item is Extract<FlowItem, { type: 'branch_group' }> => (
      item.type === 'branch_group' && item.branches.some((branch) => branch.condition.id === nodeId)
    ));

    return branchGroup?.branches[0]?.condition.name || branchGroup?.branches[0]?.condition.id || '';
  };

  const useBranchLayout = flowItems.some((item) => item.type === 'branch_group');
  const otherNodeGroups = toActionGroups(otherNodes.map((node, index) => ({ node, index: triggerNodes.length + index })));
  const workflowEndsWithStop = isStopWorkflowNode(draft.nodes[draft.nodes.length - 1]);

  useEffect(() => {
    if (!isNew) {
      const existing = workflows.find(w => w.id === workflowId);
      if (existing) setDraft(existing);
    }
  }, [workflowId, workflows, isNew]);

  useEffect(() => {
    return () => {
      liveReplayTimersRef.current.forEach(window.clearTimeout);
      liveReplayTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!liveMode) {
      liveReplayTimersRef.current.forEach(window.clearTimeout);
      liveReplayTimersRef.current = [];
      setLiveState(null);
      setLiveNodeId(null);
      return;
    }

    let stopped = false;
    const loadLiveState = async () => {
      try {
        const response = await fetch(`/api/workflow-live/${draft.id}`);
        const payload = await response.json();
        if (stopped) return;

        const live = payload.live || null;
        setLiveState(live);
        if (!live) {
          setLiveNodeId(null);
          return;
        }

        if (live.status === 'running' && live.currentNodeId) {
          liveReplayTimersRef.current.forEach(window.clearTimeout);
          liveReplayTimersRef.current = [];
          lastLiveRunKeyRef.current = live.runId || '';
          setLiveNodeId(live.currentNodeId);
          return;
        }

        const steps = Array.isArray(live.steps) ? live.steps : [];
        const runKey = `${live.runId || ''}:${live.finishedAt || live.updatedAt || ''}:${steps.length}`;
        if (steps.length > 0 && runKey !== lastLiveRunKeyRef.current) {
          lastLiveRunKeyRef.current = runKey;
          liveReplayTimersRef.current.forEach(window.clearTimeout);
          liveReplayTimersRef.current = [];
          steps.forEach((step: any, index: number) => {
            const timer = window.setTimeout(() => setLiveNodeId(step.nodeId), index * 450);
            liveReplayTimersRef.current.push(timer);
          });
          const clearTimer = window.setTimeout(() => setLiveNodeId(null), steps.length * 450 + 900);
          liveReplayTimersRef.current.push(clearTimer);
        }
      } catch {
        if (!stopped) setLiveState(null);
      }
    };

    loadLiveState();
    const timer = window.setInterval(loadLiveState, 1000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [liveMode, draft.id]);

  const buildWorkflowEdges = () => {
    const edges: WorkflowEdge[] = [];
    const addEdge = (source: string | undefined, target: string | undefined, type: WorkflowEdge['type'], label?: string) => {
      if (!source || !target) return;
      edges.push({
        id: `edge-${source}-${target}-${type}-${edges.length}`,
        source,
        target,
        type,
        label,
      });
    };
    const firstNodeOf = (item: FlowItem | undefined) => {
      if (!item) return undefined;
      if (item.type === 'branch_group') return item.branches[0]?.condition.id;
      const firstGroup = item.groups[0];
      return ['condition', 'flow_control'].includes(firstGroup?.type) ? firstGroup.node.id : firstGroup?.nodes?.[0]?.node.id;
    };

    triggerNodes.forEach((trigger) => addEdge(trigger.id, firstNodeOf(flowItems[0]), 'next'));

    flowItems.forEach((item, itemIndex) => {
      const nextStart = firstNodeOf(flowItems[itemIndex + 1]);

      if (item.type === 'nodes') {
        item.groups.forEach((group, groupIndex) => {
          const nextGroup = item.groups[groupIndex + 1];
          const groupNext = nextGroup
            ? (['condition', 'flow_control'].includes(nextGroup.type) ? nextGroup.node.id : nextGroup.nodes[0]?.node.id)
            : nextStart;

          if (['condition', 'flow_control'].includes(group.type)) {
            addEdge(group.node.id, groupNext, 'next');
            return;
          }

          group.nodes.forEach((entry: any, nodeIndex: number) => {
            if (isStopWorkflowNode(entry.node)) return;
            addEdge(entry.node.id, group.nodes[nodeIndex + 1]?.node.id || groupNext, 'next');
          });
        });
        return;
      }

      if (getBranchFamily(item.branches[0]?.condition.config.type || 'if') === 'switch') {
        const switchBranch = item.branches[0];
        const caseBranches = item.branches.slice(1);

        if (caseBranches.length === 0) {
          addEdge(switchBranch?.condition.id, nextStart, 'next');
          return;
        }

        addEdge(switchBranch?.condition.id, caseBranches[0]?.condition.id, 'next');
        caseBranches.forEach((branch, branchIndex) => {
          const nextBranch = caseBranches[branchIndex + 1];
          const firstBranchAction = branch.nodes[0]?.node.id;

          if (nextBranch) {
            addEdge(branch.condition.id, nextBranch.condition.id, 'false');
            addEdge(branch.condition.id, nextBranch.condition.id, 'branch', 'OR');
          }

          addEdge(branch.condition.id, firstBranchAction || nextStart, 'true');
          branch.nodes.forEach((entry, nodeIndex) => {
            if (isStopWorkflowNode(entry.node)) return;
            addEdge(entry.node.id, branch.nodes[nodeIndex + 1]?.node.id || nextStart, nodeIndex === branch.nodes.length - 1 ? 'continue' : 'next');
          });
        });
        return;
      }

      item.branches.forEach((branch, branchIndex) => {
        const nextBranch = item.branches[branchIndex + 1];
        const firstBranchAction = branch.nodes[0]?.node.id;

        if (nextBranch) {
          addEdge(branch.condition.id, nextBranch.condition.id, 'false');
          addEdge(branch.condition.id, nextBranch.condition.id, 'branch', 'OR');
        }

        addEdge(branch.condition.id, firstBranchAction || nextStart, 'true');
        branch.nodes.forEach((entry, nodeIndex) => {
          if (isStopWorkflowNode(entry.node)) return;
          addEdge(entry.node.id, branch.nodes[nodeIndex + 1]?.node.id || nextStart, nodeIndex === branch.nodes.length - 1 ? 'continue' : 'next');
        });
      });
    });

    return edges;
  };

  const handleSave = () => {
    const usedNames = new Set<string>();
    let currentBranchRootName = '';
    const namedNodes = draft.nodes.map((node) => {
      let nodeName = slugifyNodeName(node.name || node.config?.name || node.config?.type || node.id);

      if (node.type === 'condition' && ['elif', 'else', 'case', 'default'].includes(node.config?.type)) {
        nodeName = currentBranchRootName || nodeName;
      }

      if (!nodeName) nodeName = node.id;
      const baseName = nodeName;
      let suffix = 2;
      while (usedNames.has(nodeName) && !(node.type === 'condition' && ['elif', 'else', 'case', 'default'].includes(node.config?.type))) {
        nodeName = `${baseName}_${suffix}`;
        suffix++;
      }
      usedNames.add(nodeName);

      if (node.type === 'condition' && branchRootTypes.has(node.config?.type)) {
        currentBranchRootName = nodeName;
      }

      return { ...node, name: nodeName };
    });
    const workflowToSave = { ...draft, nodes: namedNodes, edges: buildWorkflowEdges() };
    if (isNew) {
      addWorkflow(workflowToSave);
    } else {
      updateWorkflow(draft.id, workflowToSave);
    }
    onBack();
  };

  const getActionLabel = (type: string) => {
    return (t.workflows.actionTypes as any)[type] || (t.workflows.conditionTypes as any)[type] || (t.workflows.triggerTypes as any)[type] || type;
  };

  const updateNodeConfig = (nodeId: string, patch: Record<string, any>) => {
    const newNodes = draft.nodes.map(n =>
      n.id === nodeId ? { ...n, config: { ...n.config, ...patch } } : n
    );
    setDraft({ ...draft, nodes: newNodes });
  };

  const buildWorkflowControlPatch = (deviceId: string, controlId?: string) => {
    const device = devices.find((item) => item.id === deviceId);
    const controls = getDeviceControlDefinitions(device);
    const control = controls.find((item) => item.id === controlId) || controls[0];
    if (!control) return { device: deviceId, controlId: '', value: '', parameterName: '', parameters: {} };

    const valueKey = control.valueType === 'parameter_group'
      ? ''
      : control.id;
    const controlValues = control.valueType === 'parameter_group'
      ? Object.fromEntries((control.fields || []).map((field) => [`${control.id}.${field.key}`, field.defaultValue ?? '']))
      : { [control.id]: control.defaultValue ?? (control.valueType === 'toggle' ? true : '') };
    const parameters = buildControlParameters(control, controlValues, 'parameter');

    return {
      device: deviceId,
      controlId: control.id,
      value: valueKey ? controlValues[valueKey] : '',
      parameterName: control.id === 'set_parameter' ? 'parameter' : '',
      parameters,
    };
  };

  const addNode = (type: string, isTrigger: boolean, isCondition: boolean = false) => {
    let groupId = showSelector.actionGroupId;
    if (!isTrigger && !isCondition && !groupId) {
      groupId = `group-${Date.now()}`;
    }

    let nodeConfig = { ...defaultConfigs[type] };
    if (type === 'webhook') {
      if (isTrigger) {
        nodeConfig = { endpoint: createWebhookEndpoint(draft.id), expectedContent: '{"status": "error"}' };
      } else {
        nodeConfig = { endpoint: '/api/v1/webhook/' };
      }
    }

    const newNode: WorkflowNode = {
      id: `n-${Date.now()}`,
      name: getNodeDefaultName(type, draft.nodes),
      type: isTrigger ? 'trigger' : isCondition ? 'condition' : 'action',
      config: { type, ...nodeConfig }
    };
    if (groupId && !isTrigger && !isCondition) {
      newNode.config.groupId = groupId;
    }
    
    const newNodes = [...draft.nodes];
    newNodes.splice(showSelector.insertIndex, 0, newNode);

    const triggers = newNodes.filter(n => n.type === 'trigger');
    const others = newNodes.filter(n => n.type !== 'trigger');
    
    setDraft({ ...draft, nodes: [...triggers, ...others] });
    setShowSelector({ show: false, insertIndex: 0 });
  };

  const deleteNode = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetNode = draft.nodes.find((node) => node.id === id);
    const idsToDelete = new Set<string>([id]);

    if (targetNode?.type === 'condition' && branchConditionTypes.has(targetNode.config.type)) {
      if (branchRootTypes.has(targetNode.config.type)) {
        const branchItem = flowItems.find((item): item is Extract<FlowItem, { type: 'branch_group' }> => (
          item.type === 'branch_group' && item.branches.some((branch) => branch.condition.id === id)
        ));
        branchItem?.branches.forEach((branch) => {
          idsToDelete.add(branch.condition.id);
          branch.nodes.forEach((item) => idsToDelete.add(item.node.id));
        });
      } else {
        const branch = flowItems
          .filter((item): item is Extract<FlowItem, { type: 'branch_group' }> => item.type === 'branch_group')
          .flatMap((item) => item.branches)
          .find((item) => item.condition.id === id);
        branch?.nodes.forEach((item) => idsToDelete.add(item.node.id));
      }
    }

    setDraft({ ...draft, nodes: draft.nodes.filter((node) => !idsToDelete.has(node.id)) });
    if (selectedNodeId && idsToDelete.has(selectedNodeId)) setSelectedNodeId(null);
  };

  const renderNodeCard = (node: WorkflowNode) => {
    const isSelected = selectedNodeId === node.id;
    const isTrigger = node.type === 'trigger';
    const isCondition = node.type === 'condition';
    const isLogic = isCondition && ['logic_and', 'logic_or'].includes(node.config.type);
    const isBranch = isCondition && branchConditionTypes.has(node.config.type);
    const isFlowControl = isFlowControlNode(node);

    return (
      <div 
        key={node.id}
        onClick={() => setSelectedNodeId(node.id)}
        className={cn(
          "w-80 shrink-0 rounded-xl border-2 p-4 flex items-center justify-between cursor-pointer transition-all bg-white dark:bg-[#1c2128] shadow-sm hover:shadow-md",
          isSelected ? "border-orange-500 ring-4 ring-orange-500/10 shadow-orange-500/10" : isTrigger ? "border-slate-200 dark:border-slate-700" : isCondition ? "border-indigo-200 dark:border-indigo-900/50" : isFlowControl ? "border-amber-200 dark:border-amber-500/30" : "border-slate-200 dark:border-slate-700",
          isTrigger && !isSelected && "border-orange-200 dark:border-orange-900/50",
          isCondition && !isSelected && !isLogic && "border-indigo-200 dark:border-indigo-900/50",
          isLogic && !isSelected && "border-purple-300 dark:border-purple-800",
          liveMode && liveNodeId === node.id && "workflow-live-node border-emerald-400 dark:border-emerald-400 shadow-emerald-500/20"
        )}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className={cn(
            "p-3 rounded-lg flex items-center justify-center shrink-0",
            isTrigger ? "bg-orange-50 dark:bg-orange-500/10" : isCondition ? (isLogic ? "bg-purple-50 dark:bg-purple-500/10" : "bg-indigo-50 dark:bg-indigo-500/10") : isFlowControl ? "bg-amber-50 dark:bg-amber-500/10" : "bg-slate-50 dark:bg-slate-800/50"
          )}>
            {getActionIcon(node.config.type)}
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-slate-900 dark:text-white tracking-tight truncate">
              {getActionLabel(node.config.type)}
            </h4>
            <p className="text-[11px] text-orange-600 dark:text-orange-400 mt-0.5 truncate">
              {node.type === 'condition' && ['elif', 'else', 'case', 'default'].includes(node.config.type)
                ? `$.${getBranchRootName(node.id) || node.name || node.id}`
                : `$.${node.name || node.id}`}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              {isTrigger ? "Trigger" : isBranch ? "Branch" : isCondition ? "Condition" : isFlowControl ? "Flow Control" : "Action"} - {Object.keys(node.config).filter(k => k !== 'type').length} params
            </p>
            {node.type !== 'trigger' && (node.config.executionPolicy?.retryEnabled || node.config.executionPolicy?.onFailure === 'continue') && (
              <p className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                {node.config.executionPolicy?.retryEnabled ? `Retry x${node.config.executionPolicy.retryAttempts || 3}` : 'No retry'}
                {' · '}
                On error: {node.config.executionPolicy?.onFailure === 'continue' ? 'Continue' : 'Stop'}
              </p>
            )}
          </div>
        </div>
        <button 
          onClick={(e) => deleteNode(node.id, e)}
          className="p-2 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  const renderBranchConnector = (insertIndex: number, allowedTypes: string[]) => (
    <div className="group relative flex h-20 w-20 shrink-0 items-center justify-center">
      <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-slate-300 dark:bg-slate-600" />
      <div className="relative z-10 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm dark:border-slate-700 dark:bg-[#0f1115] dark:text-slate-400">
        OR
      </div>
      <button
        type="button"
        onClick={() => setShowSelector({ show: true, insertIndex, branchOnly: true, allowedConditionTypes: allowedTypes })}
        className="absolute left-1/2 top-1/2 z-20 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-indigo-300 bg-white text-indigo-500 opacity-0 shadow-sm transition-all hover:border-indigo-500 hover:bg-indigo-50 group-hover:translate-y-4 group-hover:opacity-100 dark:border-indigo-500/40 dark:bg-[#1c2128] dark:text-indigo-300 dark:hover:bg-indigo-500/10"
        title="Add branch"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );

  const renderBranchColumn = (branch: BranchGroup) => {
    const branchType = branch.condition.config.type;
    const branchHasStopWorkflow = branch.nodes.some((item) => isStopWorkflowNode(item.node));

    return (
      <div key={branch.condition.id} className="flex min-w-[22rem] flex-col items-center">
        <div className="flex h-20 items-center">
          {renderNodeCard(branch.condition)}
        </div>

        <div className="mt-4 flex min-h-24 w-80 flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white/60 p-3 dark:border-slate-700 dark:bg-[#1c2128]/60">
          {branch.nodes.map((item) => renderNodeCard(item.node))}
          {!branchHasStopWorkflow && (
            <button
              type="button"
              onClick={() => setShowSelector({ show: true, insertIndex: branch.endIndex, actionGroupId: branch.condition.id })}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
            >
              <Plus className="h-4 w-4" />
              Add action to {getActionLabel(branchType)}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderBranchBrace = (branches: BranchGroup[], direction: 'down' | 'up') => {
    if (branches.length < 2) return null;

    const width = Math.max(520, branches.length * 320 + (branches.length - 1) * 80);
    const mid = width / 2;
    const isDown = direction === 'down';

    return (
      <svg
        width={width}
        height="42"
        viewBox={`0 0 ${width} 42`}
        className="pointer-events-none shrink-0 overflow-visible text-slate-300 dark:text-slate-600"
        aria-hidden="true"
      >
        <path
          d={isDown
            ? `M ${mid} 0 L ${mid} 12 Q ${mid} 22 ${mid - 22} 22 L 42 22 Q 18 22 18 40 M ${mid} 12 Q ${mid} 22 ${mid + 22} 22 L ${width - 42} 22 Q ${width - 18} 22 ${width - 18} 40`
            : `M ${mid} 42 L ${mid} 30 Q ${mid} 20 ${mid - 22} 20 L 42 20 Q 18 20 18 2 M ${mid} 30 Q ${mid} 20 ${mid + 22} 20 L ${width - 42} 20 Q ${width - 18} 20 ${width - 18} 2`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  };

  const renderBranchChain = (branches: BranchGroup[], endIndex: number) => {
    const branchFamily = getBranchFamily(branches[0]?.condition.config.type || 'if');
    const terminalType = branchFamily === 'switch' ? 'default' : 'else';
    const switchBranch = branchFamily === 'switch' ? branches[0] : null;
    const visibleBranches = switchBranch ? branches.slice(1) : branches;
    const groupHasTerminalBranch = visibleBranches.some((branch) => branch.condition.config.type === terminalType);

    if (switchBranch) {
      return (
        <div className="mb-8 flex w-max min-w-full flex-col items-center px-4 py-2">
          {renderNodeCard(switchBranch.condition)}
          <div className="w-px h-8 sm:h-10 bg-slate-300 dark:bg-slate-600 relative my-1 sm:my-2">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-slate-50 dark:bg-[#0f1115] rounded-full flex items-center justify-center group z-10">
              <button
                type="button"
                onClick={() => setShowSelector({ show: true, insertIndex: switchBranch.endIndex, branchOnly: true, allowedConditionTypes: groupHasTerminalBranch ? ['case'] : ['case', 'default'] })}
                className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:bg-indigo-500 hover:text-white transition-colors"
                title="Add Case or Default"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <ArrowDown className="absolute -bottom-2 -translate-x-1/2 left-1/2 h-4 w-4 text-slate-300 dark:text-slate-600" />
          </div>

          {visibleBranches.length > 0 && (
            <>
              {renderBranchBrace(visibleBranches, 'down')}
              <div className="flex items-start justify-center">
                {visibleBranches.map((branch, index) => {
                  const nextBranch = visibleBranches[index + 1];
                  const connectorAllowedTypes = groupHasTerminalBranch ? ['case'] : ['case', 'default'];
                  const isLastBranch = index === visibleBranches.length - 1;
                  const canAppendBranch = isLastBranch && branch.condition.config.type !== terminalType;
                  return (
                    <React.Fragment key={branch.condition.id}>
                      {renderBranchColumn(branch)}
                      {nextBranch && renderBranchConnector(nextBranch.index, connectorAllowedTypes)}
                      {canAppendBranch && renderBranchConnector(branch.endIndex, connectorAllowedTypes)}
                    </React.Fragment>
                  );
                })}
              </div>
              {renderBranchBrace(visibleBranches, 'up')}
            </>
          )}

          {visibleBranches.length > 0 && (
            <div className="w-px h-8 sm:h-10 bg-slate-300 dark:bg-slate-600 relative my-1 sm:my-2">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-slate-50 dark:bg-[#0f1115] rounded-full flex items-center justify-center group z-10">
                <button
                  type="button"
                  onClick={() => setShowSelector({ show: true, insertIndex: endIndex || draft.nodes.length, allowedConditionTypes: ['if', 'switch'] })}
                  className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:bg-orange-500 hover:text-white transition-colors"
                  title="Add next node after switch"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <ArrowDown className="absolute -bottom-2 -translate-x-1/2 left-1/2 h-4 w-4 text-slate-300 dark:text-slate-600" />
            </div>
          )}
        </div>
      );
    }

    return (
    <div className="mb-8 flex w-max min-w-full flex-col items-center px-4 py-2">
      {renderBranchBrace(branches, 'down')}
      <div className="flex items-start justify-center">
        {branches.map((branch, index) => {
          const nextBranch = branches[index + 1];
          const connectorAllowedTypes = branchFamily === 'switch'
            ? (groupHasTerminalBranch ? ['case'] : ['case', 'default'])
            : (groupHasTerminalBranch ? ['elif'] : ['elif', 'else']);
          const isLastBranch = index === branches.length - 1;
          const canAppendBranch = isLastBranch && branch.condition.config.type !== terminalType;
          return (
            <React.Fragment key={branch.condition.id}>
              {renderBranchColumn(branch)}
              {nextBranch && renderBranchConnector(nextBranch.index, connectorAllowedTypes)}
              {canAppendBranch && renderBranchConnector(branch.endIndex, connectorAllowedTypes)}
            </React.Fragment>
          );
        })}
      </div>
      {renderBranchBrace(branches, 'up')}
      <div className="w-px h-8 sm:h-10 bg-slate-300 dark:bg-slate-600 relative my-1 sm:my-2">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-slate-50 dark:bg-[#0f1115] rounded-full flex items-center justify-center group z-10">
          <button
            type="button"
            onClick={() => setShowSelector({ show: true, insertIndex: endIndex || draft.nodes.length, allowedConditionTypes: ['if', 'switch'] })}
            className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:bg-orange-500 hover:text-white transition-colors"
            title="Add next node after branches"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <ArrowDown className="absolute -bottom-2 -translate-x-1/2 left-1/2 h-4 w-4 text-slate-300 dark:text-slate-600" />
      </div>
    </div>
    );
  };

  const renderFlowNodeGroup = (group: any) => {
    const groupHasStopWorkflow = group.type === 'action_group' && group.nodes.some((item: any) => isStopWorkflowNode(item.node));
    const isVerticalNodeGroup = ['condition', 'flow_control'].includes(group.type);

    return (
    <React.Fragment key={isVerticalNodeGroup ? group.node.id : group.groupId}>
      {isVerticalNodeGroup ? (
        <div className="flex flex-col items-center">
          {renderNodeCard(group.node)}
          <div className="w-px h-8 sm:h-10 bg-slate-300 dark:bg-slate-600 relative my-1 sm:my-2">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-slate-50 dark:bg-[#0f1115] rounded-full flex items-center justify-center group z-10">
              <button
                onClick={() => setShowSelector({ show: true, insertIndex: group.index + 1 })}
                className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:bg-orange-500 hover:text-white transition-colors"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <ArrowDown className="absolute -bottom-2 -translate-x-1/2 left-1/2 h-4 w-4 text-slate-300 dark:text-slate-600" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full">
          {group.nodes.length > 1 && (
            <svg height="24" style={{ width: `${(group.nodes.length - 1) * 336}px`, overflow: 'visible' }} className="text-slate-300 dark:text-slate-600 -mt-1 relative z-0">
              <path d={`M ${(group.nodes.length - 1) * 336 / 2} 0 L ${(group.nodes.length - 1) * 336 / 2} 10 Q ${(group.nodes.length - 1) * 336 / 2} 15 ${(group.nodes.length - 1) * 336 / 2 - 5} 15 L 10 15 Q 0 15 0 20 L 0 24 M ${(group.nodes.length - 1) * 336 / 2} 10 Q ${(group.nodes.length - 1) * 336 / 2} 15 ${(group.nodes.length - 1) * 336 / 2 + 5} 15 L ${(group.nodes.length - 1) * 336 - 10} 15 Q ${(group.nodes.length - 1) * 336} 15 ${(group.nodes.length - 1) * 336} 20 L ${(group.nodes.length - 1) * 336} 24`} fill="none" stroke="currentColor" strokeWidth="2" />
              {group.nodes.length > 2 && Array.from({ length: group.nodes.length - 2 }).map((_, i) => (
                <line key={i} x1={(i + 1) * 336} y1="15" x2={(i + 1) * 336} y2="24" stroke="currentColor" strokeWidth="2" />
              ))}
              {group.nodes.map((_: any, i: number) => (
                <polygon key={`arr-${i}`} points={`${i * 336 - 5},14 ${i * 336 + 5},14 ${i * 336},24`} fill="currentColor" />
              ))}
            </svg>
          )}

          <div className="flex items-center gap-4 relative z-10 w-full justify-center">
            {!groupHasStopWorkflow && (
              <button
                onClick={() => setShowSelector({ show: true, insertIndex: group.nodes[0].index, actionGroupId: group.groupId })}
                className="w-10 h-10 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors shrink-0"
              >
                <Plus className="h-5 w-5 text-slate-400" />
              </button>
            )}

            {group.nodes.map((n: any) => renderNodeCard(n.node))}

            {!groupHasStopWorkflow && (
              <button
                onClick={() => setShowSelector({ show: true, insertIndex: group.nodes[group.nodes.length - 1].index + 1, actionGroupId: group.groupId })}
                className="w-10 h-10 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors shrink-0"
              >
                <Plus className="h-5 w-5 text-slate-400" />
              </button>
            )}
          </div>

          {group.nodes.length > 1 && (
            <svg height="24" style={{ width: `${(group.nodes.length - 1) * 336}px`, overflow: 'visible' }} className="text-slate-300 dark:text-slate-600 relative z-0">
              <path d={`M 0 0 L 0 5 Q 0 10 10 10 L ${(group.nodes.length - 1) * 336 / 2 - 10} 10 Q ${(group.nodes.length - 1) * 336 / 2} 10 ${(group.nodes.length - 1) * 336 / 2} 15 L ${(group.nodes.length - 1) * 336 / 2} 24 M ${(group.nodes.length - 1) * 336} 0 L ${(group.nodes.length - 1) * 336} 5 Q ${(group.nodes.length - 1) * 336} 10 ${(group.nodes.length - 1) * 336 - 10} 10 L ${(group.nodes.length - 1) * 336 / 2 + 10} 10 Q ${(group.nodes.length - 1) * 336 / 2} 10 ${(group.nodes.length - 1) * 336 / 2} 15`} fill="none" stroke="currentColor" strokeWidth="2" />
              {group.nodes.length > 2 && Array.from({ length: group.nodes.length - 2 }).map((_, i) => (
                <line key={i} x1={(i + 1) * 336} y1="0" x2={(i + 1) * 336} y2="10" stroke="currentColor" strokeWidth="2" />
              ))}
            </svg>
          )}

          {!groupHasStopWorkflow && (
            <div className={cn("w-px bg-slate-300 dark:bg-slate-600 relative transition-all", group.nodes.length > 1 ? "h-6 sm:h-8 my-0" : "h-8 sm:h-10 my-1 sm:my-2")}>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-slate-50 dark:bg-[#0f1115] rounded-full flex items-center justify-center group z-10">
                <button
                  onClick={() => setShowSelector({ show: true, insertIndex: group.nodes[group.nodes.length - 1].index + 1 })}
                  className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:bg-orange-500 hover:text-white transition-colors"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <ArrowDown className="absolute -bottom-2 -translate-x-1/2 left-1/2 h-4 w-4 text-slate-300 dark:text-slate-600" />
            </div>
          )}
        </div>
      )}
    </React.Fragment>
    );
  };

  return (
    <div className="absolute inset-0 z-10 bg-slate-50 dark:bg-[#0f1115] flex flex-col sm:flex-row overflow-hidden border-t sm:border-t-0 border-slate-200 dark:border-slate-800 rounded-none sm:rounded-tl-2xl">
      {/* Main Graph Area */}
      <div className="flex-1 flex flex-col h-full bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:20px_20px]">
        {/* Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#1c2128]/80 backdrop-blur-sm p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-sm z-10 gap-3">
          <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <button 
              onClick={onBack}
              className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <input 
                type="text" 
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="text-base sm:text-lg font-bold bg-transparent border-none p-0 focus:ring-0 text-slate-900 dark:text-white placeholder:text-slate-400 w-full"
                placeholder="Workflow Name"
              />
              <input 
                type="text" 
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className="text-xs sm:text-sm font-medium bg-transparent border-none p-0 focus:ring-0 text-slate-500 dark:text-slate-400 placeholder:text-slate-300 dark:placeholder:text-slate-600 w-full"
                placeholder="Brief description of this workflow"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end shrink-0">
            {liveMode && (
              <span className="hidden md:inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                {liveState?.status === 'running'
                  ? `Running${liveState?.currentNodeId ? `: ${draft.nodes.find((node) => node.id === liveState.currentNodeId)?.name || liveState.currentNodeId}` : ''}`
                  : liveState?.status
                    ? `Last run: ${liveState.status}`
                    : 'Waiting for trigger'}
              </span>
            )}
            <button
              type="button"
              onClick={() => setLiveMode((value) => !value)}
              className={cn(
                "px-3 py-1.5 rounded-md border text-sm font-medium flex items-center gap-2 transition-colors",
                liveMode
                  ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              )}
            >
              <Activity className="h-4 w-4" />
              Live
            </button>
            <button
              onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
              className={cn(
                "px-3 py-1.5 rounded-md border text-sm font-medium flex items-center gap-2 transition-colors",
                draft.enabled 
                  ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                  : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700" 
              )}
            >
              {draft.enabled ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {draft.enabled ? "Active" : "Paused"}
            </button>
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-x-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 transition-colors"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto p-4 sm:p-10 flex flex-col items-center">
          {triggerNodes.length > 0 && (
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-4 relative z-10 w-full justify-center">
                <button
                  onClick={() => setShowSelector({ show: true, insertIndex: 0, isTriggerSelect: true })}
                  className="w-10 h-10 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center hover:border-orange-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors shrink-0"
                  title="Add trigger. Any trigger can start this workflow."
                >
                  <Plus className="h-5 w-5 text-slate-400" />
                </button>
                
                {triggerNodes.map(node => renderNodeCard(node))}

                <button
                  onClick={() => setShowSelector({ show: true, insertIndex: triggerNodes.length, isTriggerSelect: true })}
                  className="w-10 h-10 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center hover:border-orange-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors shrink-0"
                  title="Add trigger. Any trigger can start this workflow."
                >
                  <Plus className="h-5 w-5 text-slate-400" />
                </button>
              </div>

              <div className="mt-3 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300">
                Any trigger starts the workflow
              </div>
              <div className="w-px h-8 sm:h-10 bg-slate-300 dark:bg-slate-600 relative my-1 sm:my-2">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-slate-50 dark:bg-[#0f1115] rounded-full flex items-center justify-center group z-10">
                  <button 
                    onClick={() => setShowSelector({ show: true, insertIndex: triggerNodes.length, allowedConditionTypes: ['if'] })}
                    className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:bg-orange-500 hover:text-white transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <ArrowDown className="absolute -bottom-2 -translate-x-1/2 left-1/2 h-4 w-4 text-slate-300 dark:text-slate-600" />
              </div>
            </div>
          )}

          {triggerNodes.length === 0 && otherNodes.length > 0 && (
            <div className="flex flex-col items-center">
              <button
                onClick={() => setShowSelector({ show: true, insertIndex: 0, isTriggerSelect: true })}
                className="w-80 rounded-xl border-2 border-dashed border-orange-300 bg-white/70 p-6 flex flex-col items-center justify-center gap-2 text-orange-600 hover:border-orange-500 hover:bg-orange-50 dark:border-orange-500/40 dark:bg-[#1c2128]/60 dark:text-orange-400 dark:hover:bg-orange-500/10 transition-all backdrop-blur-sm"
              >
                <Plus className="h-6 w-6" />
                <span className="font-medium">Add Trigger</span>
              </button>
              <div className="w-px h-8 sm:h-10 bg-slate-300 dark:bg-slate-600 relative my-1 sm:my-2">
                <ArrowDown className="absolute -bottom-2 -translate-x-1/2 left-1/2 h-4 w-4 text-slate-300 dark:text-slate-600" />
              </div>
            </div>
          )}

          {useBranchLayout && flowItems.map((item, index) => (
            item.type === 'branch_group'
              ? <React.Fragment key={`branch-${item.startIndex}`}>{renderBranchChain(item.branches, item.endIndex)}</React.Fragment>
              : <React.Fragment key={`nodes-${index}`}>{item.groups.map(renderFlowNodeGroup)}</React.Fragment>
          ))}

          {(!useBranchLayout ? otherNodeGroups : []).map(renderFlowNodeGroup)}

          {/* Add Initial Block or End Block */}
          {draft.nodes.length === 0 ? (
            <button
              onClick={() => setShowSelector({ show: true, insertIndex: 0, isTriggerSelect: true })}
              className="w-80 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-6 flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-orange-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/5 transition-all bg-white/50 dark:bg-[#1c2128]/50 backdrop-blur-sm mt-4"
            >
              <Plus className="h-6 w-6" />
              <span className="font-medium">Add Trigger</span>
            </button>
          ) : !useBranchLayout && !workflowEndsWithStop ? (
            <button
              onClick={() => setShowSelector({ show: true, insertIndex: draft.nodes.length })}
              className="w-80 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-6 flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-orange-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/5 transition-all bg-white/50 dark:bg-[#1c2128]/50 backdrop-blur-sm"
            >
              <Plus className="h-6 w-6" />
              <span className="font-medium">Add Node</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Right Sidebar - Properties panel */}
      {selectedNodeId && (
        <div className="absolute inset-y-0 right-0 sm:relative w-full sm:w-80 md:w-96 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1c2128] flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.1)] z-20 transition-transform">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Settings className="h-4 w-4 text-slate-500" />
              Node Settings
            </h3>
            <button onClick={() => setSelectedNodeId(null)} className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
            {draft.nodes.map(node => {
              if (node.id !== selectedNodeId) return null;
              
              return (
                <div key={node.id} className="space-y-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Node Name</label>
                    {node.type === 'condition' && ['elif', 'else', 'case', 'default'].includes(node.config.type) ? (
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                        Uses branch group name: <span className="font-mono text-orange-600 dark:text-orange-400">$.{getBranchRootName(node.id) || node.name || node.id}</span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={node.name || ''}
                        placeholder="e.g. CheckTemperature"
                        onChange={(event) => {
                          const newName = slugifyNodeName(event.target.value);
                          const newNodes = draft.nodes.map(n =>
                            n.id === node.id ? { ...n, name: newName } : n
                          );
                          setDraft({ ...draft, nodes: newNodes });
                        }}
                        className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                      />
                    )}
                    <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                      Reference this node later with <span className="font-mono">$.{node.type === 'condition' && ['elif', 'else', 'case', 'default'].includes(node.config.type) ? (getBranchRootName(node.id) || node.name || node.id) : (node.name || node.id)}.input</span> or <span className="font-mono">$.{node.type === 'condition' && ['elif', 'else', 'case', 'default'].includes(node.config.type) ? (getBranchRootName(node.id) || node.name || node.id) : (node.name || node.id)}.output</span>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Type</label>
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                      {getActionIcon(node.config.type)}
                      <span className="font-medium text-slate-900 dark:text-white">
                        {getActionLabel(node.config.type)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Configuration</label>
                    {node.config.type === 'device_control' ? (() => {
                      const selectedDevice = devices.find((device) => device.id === node.config.device);
                      const controlDefinitions = getDeviceControlDefinitions(selectedDevice);
                      const selectedControl = controlDefinitions.find((control) => control.id === node.config.controlId) || controlDefinitions[0];
                      const controlValue = node.config.value ?? selectedControl?.defaultValue ?? '';
                      const parameterValues = node.config.parameters || {};
                      const ControlIcon = selectedControl?.icon;

                      const updateControlValue = (value: any) => {
                        if (!selectedControl) return;
                        const controlValues = selectedControl.valueType === 'parameter_group'
                          ? Object.fromEntries((selectedControl.fields || []).map((field) => [
                            `${selectedControl.id}.${field.key}`,
                            field.key in parameterValues ? parameterValues[field.key] : field.defaultValue ?? '',
                          ]))
                          : { [selectedControl.id]: value };
                        const parameters = selectedControl.valueType === 'parameter_group'
                          ? Object.fromEntries((selectedControl.fields || []).map((field) => [
                            field.key,
                            controlValues[`${selectedControl.id}.${field.key}`],
                          ]))
                          : buildControlParameters(selectedControl, controlValues, node.config.parameterName || 'parameter');

                        updateNodeConfig(node.id, { value, parameters });
                      };
                      const updateParameterName = (parameterName: string) => {
                        if (!selectedControl) return;
                        const controlValues = { [selectedControl.id]: controlValue };
                        updateNodeConfig(node.id, {
                          parameterName,
                          parameters: buildControlParameters(selectedControl, controlValues, parameterName || 'parameter'),
                        });
                      };
                      const updateParameterGroupField = (fieldKey: string, value: any) => {
                        if (!selectedControl) return;
                        const nextParameters = { ...parameterValues, [fieldKey]: value };
                        updateNodeConfig(node.id, { parameters: nextParameters });
                      };

                      return (
                        <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Device</label>
                            <DeviceSelect
                              value={node.config.device || ''}
                              onChange={(deviceId) => updateNodeConfig(node.id, buildWorkflowControlPatch(deviceId))}
                              devices={devices}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Control Action</label>
                            <select
                              value={selectedControl?.id || ''}
                              disabled={!selectedDevice || controlDefinitions.length === 0}
                              onChange={(event) => updateNodeConfig(node.id, buildWorkflowControlPatch(node.config.device, event.target.value))}
                              className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                            >
                              {controlDefinitions.map((control) => (
                                <option key={control.id} value={control.id}>{control.label}</option>
                              ))}
                              {controlDefinitions.length === 0 && <option value="">No controls available</option>}
                            </select>
                          </div>

                          {selectedControl && (
                            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedControl.label}</p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{selectedControl.description}</p>
                                </div>
                                <div className="rounded-md bg-slate-50 p-2 text-orange-500 ring-1 ring-slate-200 dark:bg-[#1c2128] dark:ring-slate-800">
                                  {ControlIcon ? <ControlIcon className="h-4 w-4" /> : getActionIcon(node.config.type)}
                                </div>
                              </div>
                            </div>
                          )}

                          {selectedControl && selectedControl.valueType === 'toggle' && (
                            <div className="flex items-center justify-between gap-3 rounded border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                              <span className="text-slate-700 dark:text-slate-300">{selectedControl.parameterKey || selectedControl.id}</span>
                              <button
                                type="button"
                                onClick={() => updateControlValue(!Boolean(controlValue))}
                                className={cn(
                                  "relative inline-flex h-10 w-24 shrink-0 items-center rounded-full border-2 px-2 font-bold transition-colors",
                                  Boolean(controlValue)
                                    ? "justify-start border-slate-950 bg-slate-950 text-white dark:border-orange-500 dark:bg-orange-600"
                                    : "justify-end border-slate-950 bg-white text-slate-950 dark:border-slate-400 dark:bg-slate-950 dark:text-white"
                                )}
                              >
                                <span className="z-10 text-sm">{Boolean(controlValue) ? 'ON' : 'OFF'}</span>
                                <span
                                  className={cn(
                                    "absolute top-1 h-7 w-7 rounded-full transition-all",
                                    Boolean(controlValue)
                                      ? "right-1 bg-white"
                                      : "left-1 bg-slate-950 dark:bg-white"
                                  )}
                                />
                              </button>
                            </div>
                          )}

                          {selectedControl && ['select'].includes(selectedControl.valueType) && (
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{selectedControl.label}</label>
                              <select
                                value={String(controlValue)}
                                onChange={(event) => updateControlValue(event.target.value)}
                                className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                              >
                                {selectedControl.options?.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {selectedControl && ['slider', 'range', 'number'].includes(selectedControl.valueType) && (
                            <div>
                              <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                <span>{selectedControl.label}</span>
                                <span className="font-mono text-orange-600 dark:text-orange-400">{controlValue}{selectedControl.unit}</span>
                              </div>
                              {selectedControl.valueType === 'number' ? (
                                <input
                                  type="number"
                                  min={selectedControl.min}
                                  max={selectedControl.max}
                                  step={selectedControl.step ?? 1}
                                  value={controlValue}
                                  onChange={(event) => updateControlValue(Number(event.target.value))}
                                  className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                                />
                              ) : (
                                <input
                                  type="range"
                                  min={selectedControl.min ?? 0}
                                  max={selectedControl.max ?? 100}
                                  step={selectedControl.step ?? 1}
                                  value={controlValue}
                                  onChange={(event) => updateControlValue(Number(event.target.value))}
                                  className="w-full accent-orange-600"
                                />
                              )}
                            </div>
                          )}

                          {selectedControl && selectedControl.valueType === 'text' && (
                            <div className="space-y-3">
                              {selectedControl.id === 'set_parameter' && (
                                <div>
                                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Parameter Name</label>
                                  <input
                                    value={node.config.parameterName || ''}
                                    onChange={(event) => updateParameterName(event.target.value)}
                                    className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                                  />
                                </div>
                              )}
                              <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{selectedControl.label}</label>
                                <input
                                  value={controlValue}
                                  onChange={(event) => updateControlValue(event.target.value)}
                                  className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                                />
                              </div>
                            </div>
                          )}

                          {selectedControl && selectedControl.valueType === 'parameter_group' && (
                            <div className="space-y-3">
                              {(selectedControl.fields || []).map((field) => (
                                <div key={field.key}>
                                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{field.label}</label>
                                  {field.valueType === 'select' ? (
                                    <select
                                      value={parameterValues[field.key] ?? field.defaultValue ?? ''}
                                      onChange={(event) => updateParameterGroupField(field.key, event.target.value)}
                                      className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                                    >
                                      {field.options?.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type={field.valueType === 'number' ? 'number' : 'text'}
                                      value={parameterValues[field.key] ?? field.defaultValue ?? ''}
                                      onChange={(event) => {
                                        updateParameterGroupField(field.key, field.valueType === 'number' ? Number(event.target.value) : event.target.value);
                                      }}
                                      className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {selectedControl && selectedControl.valueType === 'none' && (
                            <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                              This action has no extra parameters and will execute directly when the workflow reaches this node.
                            </div>
                          )}
                        </div>
                      );
                    })() : null}
                    {Object.entries(node.config).map(([key, value]) => {
                      if (node.config.type === 'device_control') return null;
                      if (key === 'type') return null;
                      
                      const isDeviceSelect = (key === 'device' && (node.type === 'trigger' || ['if', 'elif'].includes(node.config.type) || node.config.type === 'command_confirm')) ||
                                             (key === 'target' && (node.config.type === 'start_backup' || node.config.type === 'stop_device' || node.config.type === 'mqtt_publish')) ||
                                             (key === 'device' && node.config.type === 'check_state');

                      if (isDeviceSelect) {
                        return (
                          <div key={key}>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 capitalize">
                              {key === 'target' ? 'Target Device' : 'Device'}
                            </label>
                            <DeviceSelect 
                              value={value as string}
                              onChange={(newDevice) => {
                                const newNodes = draft.nodes.map(n => 
                                  n.id === node.id 
                                    ? { ...n, config: { ...n.config, [key]: newDevice } }
                                    : n
                                );
                                setDraft({ ...draft, nodes: newNodes });
                              }}
                              devices={devices}
                            />
                          </div>
                        );
                      }

                      if (selectConfigOptions[key]) {
                        return (
                          <div key={key}>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 capitalize">
                              {key.replace('_', ' ')}
                            </label>
                            <select
                              value={String(value)}
                              onChange={(event) => updateNodeConfig(node.id, { [key]: event.target.value })}
                              className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                            >
                              {selectConfigOptions[key].map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>
                        );
                      }

                      if (multilineConfigKeys.has(key)) {
                        return (
                          <div key={key}>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 capitalize">
                              {key.replace('_', ' ')}
                            </label>
                            <textarea
                              value={String(value ?? '')}
                              rows={key === 'code' ? 8 : 5}
                              onChange={(event) => updateNodeConfig(node.id, { [key]: event.target.value })}
                              className="block w-full resize-y rounded-md border-0 py-2 font-mono text-xs text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                            />
                            {key === 'code' && (
                              <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                                Available variables: input, event, context, config. Return the node output.
                              </p>
                            )}
                          </div>
                        );
                      }
                      
                      return (
                        <div key={key}>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 capitalize">
                            {key === 'expectedContent' ? 'Match Content' : key.replace('_', ' ')}
                          </label>
                          <input 
                            type={typeof value === 'number' ? 'number' : 'text'}
                            value={value as string | number}
                            readOnly={node.type === 'trigger' && node.config.type === 'webhook' && key === 'endpoint'}
                            onChange={(e) => {
                              const nextValue = typeof value === 'number' ? Number(e.target.value) : e.target.value;
                              const newNodes = draft.nodes.map(n => 
                                n.id === node.id 
                                  ? { ...n, config: { ...n.config, [key]: nextValue } }
                                  : n
                              );
                              setDraft({ ...draft, nodes: newNodes });
                            }}
                            className={cn(
                              "block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700",
                              node.type === 'trigger' && node.config.type === 'webhook' && key === 'endpoint' && "bg-slate-50 dark:bg-slate-900/50 cursor-copy"
                            )}
                            onClick={(e) => {
                              if (node.type === 'trigger' && node.config.type === 'webhook' && key === 'endpoint') {
                                navigator.clipboard.writeText(value as string);
                                // could show a toast here, but simple copy is fine
                              }
                            }}
                          />
                          {node.type === 'trigger' && node.config.type === 'webhook' && key === 'endpoint' && (
                            <p className="mt-1 text-[10px] text-slate-500">Click to copy your unique webhook URL</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {node.type !== 'trigger' && (
                    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Execution Policy</label>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Configure retry and failure handling for this node without adding extra workflow nodes.
                        </p>
                      </div>

                      <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                        <span className="font-medium text-slate-700 dark:text-slate-300">Retry on failure</span>
                        <input
                          type="checkbox"
                          checked={Boolean(node.config.executionPolicy?.retryEnabled)}
                          onChange={(event) => updateNodeConfig(node.id, {
                            executionPolicy: {
                              ...(node.config.executionPolicy || {}),
                              retryEnabled: event.target.checked,
                              retryAttempts: node.config.executionPolicy?.retryAttempts ?? 3,
                              retryInterval: node.config.executionPolicy?.retryInterval ?? '10s',
                              onFailure: node.config.executionPolicy?.onFailure || 'stop',
                            },
                          })}
                          className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-600"
                        />
                      </label>

                      {node.config.executionPolicy?.retryEnabled && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Attempts</label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={node.config.executionPolicy?.retryAttempts ?? 3}
                              onChange={(event) => updateNodeConfig(node.id, {
                                executionPolicy: {
                                  ...(node.config.executionPolicy || {}),
                                  retryEnabled: true,
                                  retryAttempts: Number(event.target.value),
                                },
                              })}
                              className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Interval</label>
                            <input
                              value={node.config.executionPolicy?.retryInterval ?? '10s'}
                              onChange={(event) => updateNodeConfig(node.id, {
                                executionPolicy: {
                                  ...(node.config.executionPolicy || {}),
                                  retryEnabled: true,
                                  retryInterval: event.target.value,
                                },
                              })}
                              className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">On Failure</label>
                        <select
                          value={node.config.executionPolicy?.onFailure || 'stop'}
                          onChange={(event) => updateNodeConfig(node.id, {
                            executionPolicy: {
                              ...(node.config.executionPolicy || {}),
                              retryAttempts: node.config.executionPolicy?.retryAttempts ?? 3,
                              retryInterval: node.config.executionPolicy?.retryInterval ?? '10s',
                              onFailure: event.target.value,
                            },
                          })}
                          className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                        >
                          <option value="stop">Stop workflow</option>
                          <option value="continue">Continue to next node</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Edit the parameters above to configure how this {node.type} behaves when executed in the workflow stream.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Node Selector Modal */}
      {showSelector.show && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1c2128] rounded-xl shadow-xl w-full max-w-5xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-semibold text-slate-900 dark:text-white">Choose Node</h3>
              <button 
                onClick={() => setShowSelector({ show: false, insertIndex: 0 })}
                className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto space-y-6">
              {isTriggerOnly ? (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1">{t.workflows.triggers}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                    {Object.keys(t.workflows.triggerTypes).map(type => (
                      <button
                        key={type}
                        onClick={() => addNode(type, true, false)}
                        className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 text-left transition-all group shadow-sm bg-white dark:bg-[#1c2128]"
                      >
                        <div className="p-2 rounded-md bg-slate-50 dark:bg-slate-800 group-hover:bg-white dark:group-hover:bg-slate-700">
                          {getActionIcon(type)}
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {getActionLabel(type)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {showConditions && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1">{t.workflows.conditions}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                        {conditionTypesForSelector.map(type => (
                          <button
                            key={type}
                            onClick={() => addNode(type, false, true)}
                            className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-left transition-all group shadow-sm bg-white dark:bg-[#1c2128]"
                          >
                            <div className="p-2 rounded-md bg-slate-50 dark:bg-slate-800 group-hover:bg-white dark:group-hover:bg-slate-700">
                              {getActionIcon(type)}
                            </div>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                              {getActionLabel(type)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!showSelector.branchOnly && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 px-1">{t.workflows.actions}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                      {Object.keys(t.workflows.actionTypes).filter((type) => !hiddenActionNodeTypes.has(type)).map(type => (
                        <button
                          key={type}
                          onClick={() => addNode(type, false, false)}
                          className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-left transition-all group shadow-sm bg-white dark:bg-[#1c2128]"
                        >
                          <div className="p-2 rounded-md bg-slate-50 dark:bg-slate-800 group-hover:bg-white dark:group-hover:bg-slate-700">
                            {getActionIcon(type)}
                          </div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {getActionLabel(type)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
