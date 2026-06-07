import React, { useState, useEffect } from 'react';
import { useAppStore, Workflow, WorkflowNode } from '../lib/store';
import { translations } from '../lib/i18n';
import { 
  ArrowLeft, Plus, Save, Trash2, Play, Square,
  MessageCircle, Mail, Ticket, Power, Globe, FileText, BrainCircuit,
  Activity, Clock, Zap, PowerOff, ArrowDown, X, AlertTriangle, Settings,
  GitBranch, GitCommit, Settings2, Timer, ChevronDown, Radio, Wifi, Bell
} from 'lucide-react';
import { cn } from '../lib/utils';

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
  report: { frequency: 'weekly', recipient: 'manager@factory.com' },
  ai_analyze: { prompt: 'Analyze possible causes for the event.' },
  delay: { duration: '60s' },
  mqtt_publish: { target: '', topic: 'control/device', payload: '{"cmd":"stop"}' },
  notification: { message: 'Alert triggered!' },
  if: { device: '', metric: 'temperature', condition: '>', value: 10 },
  elif: { device: '', metric: 'power', condition: '>', value: 1000 },
  else: {},
  logic_and: { preconditions: 'temp > 30, humidity < 50' },
  logic_or: { preconditions: 'door_open == true, motion_detected == true' },
  check_state: { device: '', status: 'open' },
  time_window: { start: '22:00', end: '06:00' },
};

const createWebhookEndpoint = (workflowId: string) => {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  return `${window.location.origin}/api/workflow-webhooks/${workflowId}/${token}`;
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

  const triggerNodes = draft.nodes.filter(n => n.type === 'trigger');
  const otherNodes = draft.nodes.filter(n => n.type !== 'trigger');

  const isTriggerOnly = showSelector.isTriggerSelect || (showSelector.insertIndex === 0 && triggerNodes.length === 0);
  const isAfterTriggers = showSelector.insertIndex === triggerNodes.length;
  const showConditions = !isTriggerOnly && !showSelector.actionGroupId;

  const availableConditionTypes = Object.keys(t.workflows.conditionTypes);
  const branchConditionTypes = new Set(['if', 'elif', 'else']);
  const hasElseBranch = otherNodes.some((node) => node.type === 'condition' && node.config.type === 'else');
  const conditionTypesForSelector = showSelector.allowedConditionTypes || availableConditionTypes;

  const branchGroups: Array<{ condition: WorkflowNode; index: number; nodes: Array<{ node: WorkflowNode; index: number }>; endIndex: number }> = [];
  otherNodes.forEach((node, index) => {
    const absoluteIndex = triggerNodes.length + index;
    if (node.type === 'condition' && branchConditionTypes.has(node.config.type)) {
      branchGroups.push({ condition: node, index: absoluteIndex, nodes: [], endIndex: absoluteIndex + 1 });
      return;
    }

    const activeBranch = branchGroups[branchGroups.length - 1];
    if (activeBranch) {
      activeBranch.nodes.push({ node, index: absoluteIndex });
      activeBranch.endIndex = absoluteIndex + 1;
    }
  });
  const useBranchLayout = branchGroups.length > 0
    && otherNodes[0]?.type === 'condition'
    && branchConditionTypes.has(otherNodes[0].config.type);

  const otherNodeGroups: any[] = [];
  let currentIndex = triggerNodes.length;
  otherNodes.forEach(node => {
    if (node.type === 'condition') {
      otherNodeGroups.push({ type: 'condition', node, index: currentIndex });
    } else {
      const groupId = node.config.groupId || node.id;
      const lastGroup = otherNodeGroups[otherNodeGroups.length - 1];
      if (lastGroup && lastGroup.type === 'action_group' && lastGroup.groupId === groupId) {
        lastGroup.nodes.push({ node, index: currentIndex });
      } else {
        otherNodeGroups.push({ type: 'action_group', groupId, nodes: [{ node, index: currentIndex }] });
      }
    }
    currentIndex++;
  });

  useEffect(() => {
    if (!isNew) {
      const existing = workflows.find(w => w.id === workflowId);
      if (existing) setDraft(existing);
    }
  }, [workflowId, workflows, isNew]);

  const handleSave = () => {
    if (isNew) {
      addWorkflow(draft);
    } else {
      updateWorkflow(draft.id, draft);
    }
    onBack();
  };

  const getActionLabel = (type: string) => {
    return (t.workflows.actionTypes as any)[type] || (t.workflows.conditionTypes as any)[type] || (t.workflows.triggerTypes as any)[type] || type;
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

    if (targetNode?.type === 'condition' && ['if', 'elif', 'else'].includes(targetNode.config.type)) {
      if (targetNode.config.type === 'if') {
        branchGroups.forEach((branch) => {
          idsToDelete.add(branch.condition.id);
          branch.nodes.forEach((item) => idsToDelete.add(item.node.id));
        });
      } else {
        const branch = branchGroups.find((item) => item.condition.id === id);
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
    const isBranch = isCondition && ['if', 'elif', 'else'].includes(node.config.type);

    return (
      <div 
        key={node.id}
        onClick={() => setSelectedNodeId(node.id)}
        className={cn(
          "w-80 shrink-0 rounded-xl border-2 p-4 flex items-center justify-between cursor-pointer transition-all bg-white dark:bg-[#1c2128] shadow-sm hover:shadow-md",
          isSelected ? "border-orange-500 ring-4 ring-orange-500/10 shadow-orange-500/10" : isTrigger ? "border-slate-200 dark:border-slate-700" : isCondition ? "border-indigo-200 dark:border-indigo-900/50" : "border-slate-200 dark:border-slate-700",
          isTrigger && !isSelected && "border-orange-200 dark:border-orange-900/50",
          isCondition && !isSelected && !isLogic && "border-indigo-200 dark:border-indigo-900/50",
          isLogic && !isSelected && "border-purple-300 dark:border-purple-800"
        )}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className={cn(
            "p-3 rounded-lg flex items-center justify-center shrink-0",
            isTrigger ? "bg-orange-50 dark:bg-orange-500/10" : isCondition ? (isLogic ? "bg-purple-50 dark:bg-purple-500/10" : "bg-indigo-50 dark:bg-indigo-500/10") : "bg-slate-50 dark:bg-slate-800/50"
          )}>
            {getActionIcon(node.config.type)}
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-slate-900 dark:text-white tracking-tight truncate">
              {getActionLabel(node.config.type)}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              {isTrigger ? "Trigger" : isBranch ? "Branch" : isCondition ? "Condition" : "Action"} - {Object.keys(node.config).filter(k => k !== 'type').length} params
            </p>
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

  const renderBranchColumn = (branch: typeof branchGroups[number]) => {
    const branchType = branch.condition.config.type;

    return (
      <div key={branch.condition.id} className="flex min-w-[22rem] flex-col items-center">
        <div className="flex h-20 items-center">
          {renderNodeCard(branch.condition)}
        </div>

        <div className="mt-4 flex min-h-24 w-80 flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white/60 p-3 dark:border-slate-700 dark:bg-[#1c2128]/60">
          {branch.nodes.map((item) => renderNodeCard(item.node))}
          <button
            type="button"
            onClick={() => setShowSelector({ show: true, insertIndex: branch.endIndex, actionGroupId: branch.condition.id })}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
          >
            <Plus className="h-4 w-4" />
            Add action to {getActionLabel(branchType)}
          </button>
        </div>
      </div>
    );
  };

  const renderBranchBrace = (direction: 'down' | 'up') => {
    if (branchGroups.length < 2) return null;

    const width = Math.max(520, branchGroups.length * 320 + (branchGroups.length - 1) * 80);
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

  const renderBranchChain = () => (
    <div className="mb-8 flex w-full min-w-max flex-col items-center overflow-x-auto px-4 py-2">
      {renderBranchBrace('down')}
      <div className="flex items-start justify-center">
        {branchGroups.map((branch, index) => {
          const nextBranch = branchGroups[index + 1];
          const connectorAllowedTypes = hasElseBranch ? ['elif'] : ['elif', 'else'];
          const isLastBranch = index === branchGroups.length - 1;
          const canAppendBranch = isLastBranch && branch.condition.config.type !== 'else';
          return (
            <React.Fragment key={branch.condition.id}>
              {renderBranchColumn(branch)}
              {nextBranch && renderBranchConnector(nextBranch.index, connectorAllowedTypes)}
              {canAppendBranch && renderBranchConnector(branch.endIndex, connectorAllowedTypes)}
            </React.Fragment>
          );
        })}
      </div>
      {renderBranchBrace('up')}
    </div>
  );

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

          {useBranchLayout && renderBranchChain()}

          {!useBranchLayout && otherNodeGroups.map((group) => (
            <React.Fragment key={group.type === 'condition' ? group.node.id : group.groupId}>
              {group.type === 'condition' ? (
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
                    <button 
                      onClick={() => setShowSelector({ show: true, insertIndex: group.nodes[0].index, actionGroupId: group.groupId })} 
                      className="w-10 h-10 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors shrink-0"
                    >
                      <Plus className="h-5 w-5 text-slate-400" />
                    </button>

                    {group.nodes.map((n: any) => renderNodeCard(n.node))}

                    <button 
                      onClick={() => setShowSelector({ show: true, insertIndex: group.nodes[group.nodes.length - 1].index + 1, actionGroupId: group.groupId })} 
                      className="w-10 h-10 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors shrink-0"
                    >
                      <Plus className="h-5 w-5 text-slate-400" />
                    </button>
                  </div>

                  {group.nodes.length > 1 && (
                    <svg height="24" style={{ width: `${(group.nodes.length - 1) * 336}px`, overflow: 'visible' }} className="text-slate-300 dark:text-slate-600 relative z-0">
                      <path d={`M 0 0 L 0 5 Q 0 10 10 10 L ${(group.nodes.length - 1) * 336 / 2 - 10} 10 Q ${(group.nodes.length - 1) * 336 / 2} 10 ${(group.nodes.length - 1) * 336 / 2} 15 L ${(group.nodes.length - 1) * 336 / 2} 24 M ${(group.nodes.length - 1) * 336} 0 L ${(group.nodes.length - 1) * 336} 5 Q ${(group.nodes.length - 1) * 336} 10 ${(group.nodes.length - 1) * 336 - 10} 10 L ${(group.nodes.length - 1) * 336 / 2 + 10} 10 Q ${(group.nodes.length - 1) * 336 / 2} 10 ${(group.nodes.length - 1) * 336 / 2} 15`} fill="none" stroke="currentColor" strokeWidth="2" />
                      {group.nodes.length > 2 && Array.from({ length: group.nodes.length - 2 }).map((_, i) => (
                        <line key={i} x1={(i + 1) * 336} y1="0" x2={(i + 1) * 336} y2="10" stroke="currentColor" strokeWidth="2" />
                      ))}
                    </svg>
                  )}

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
                </div>
              )}
            </React.Fragment>
          ))}

          {/* Add Initial Block or End Block */}
          {draft.nodes.length === 0 ? (
            <button
              onClick={() => setShowSelector({ show: true, insertIndex: 0, isTriggerSelect: true })}
              className="w-80 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-6 flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-orange-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/5 transition-all bg-white/50 dark:bg-[#1c2128]/50 backdrop-blur-sm mt-4"
            >
              <Plus className="h-6 w-6" />
              <span className="font-medium">Add Trigger</span>
            </button>
          ) : !useBranchLayout ? (
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
                    {Object.entries(node.config).map(([key, value]) => {
                      if (key === 'type') return null;
                      
                      const isDeviceSelect = (key === 'device' && (node.type === 'trigger' || ['if', 'elif'].includes(node.config.type))) ||
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
                      
                      return (
                        <div key={key}>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 capitalize">
                            {key === 'expectedContent' ? 'Match Content' : key.replace('_', ' ')}
                          </label>
                          <input 
                            type="text" 
                            value={value as string}
                            readOnly={node.type === 'trigger' && node.config.type === 'webhook' && key === 'endpoint'}
                            onChange={(e) => {
                              const newNodes = draft.nodes.map(n => 
                                n.id === node.id 
                                  ? { ...n, config: { ...n.config, [key]: e.target.value } }
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
          <div className="bg-white dark:bg-[#1c2128] rounded-xl shadow-xl w-full max-w-lg border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden max-h-[90vh]">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      {Object.keys(t.workflows.actionTypes).map(type => (
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
