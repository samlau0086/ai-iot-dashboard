import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore, type WorkflowNode } from '../lib/store';
import { translations } from '../lib/i18n';
import { 
  GitMerge, GitBranch, GitCommit, Settings2, Timer, Plus, Play, Square, Trash2, Edit2, 
  MessageCircle, Mail, Ticket, Power, Globe,
  FileText, BrainCircuit, Activity, AlertTriangle,
  Clock, Zap, PowerOff, ArrowRight, Radio, Wifi, Bell, KeyRound, ListTree, RefreshCw, X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { WorkflowEditor } from './WorkflowEditor';
import { confirmDelete } from '../lib/confirm';
import { UnderDevelopmentBadge } from '../components/UnderDevelopmentBadge';

type WorkflowRunStep = {
  nodeId?: string;
  nodeName?: string;
  type?: string;
  status?: string;
  input?: unknown;
  output?: unknown;
  startedAt?: string;
  finishedAt?: string;
};

type WorkflowRunLog = {
  id: string;
  workflowId: string;
  workflowName: string;
  triggerType: string;
  eventSource: string;
  status: string;
  event: unknown;
  steps: WorkflowRunStep[];
  startedAt: string;
  finishedAt: string;
};

export function Workflows() {
  const { language, workflows, updateWorkflow, deleteWorkflow } = useAppStore();
  const t = translations[language];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [logsWorkflowId, setLogsWorkflowId] = useState<string | null>(null);
  const [workflowLogs, setWorkflowLogs] = useState<WorkflowRunLog[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');

  const activeLogsWorkflow = workflows.find((workflow) => workflow.id === logsWorkflowId) || null;
  const selectedRun = useMemo(
    () => workflowLogs.find((run) => run.id === selectedRunId) || workflowLogs[0] || null,
    [workflowLogs, selectedRunId]
  );

  const loadWorkflowLogs = async (workflowId: string) => {
    setLogsLoading(true);
    setLogsError('');
    try {
      const response = await fetch(`/api/workflow-runs?workflowId=${encodeURIComponent(workflowId)}&limit=50`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to load workflow logs.');
      const runs = Array.isArray(payload.runs) ? payload.runs : [];
      setWorkflowLogs(runs);
      setSelectedRunId((current) => runs.some((run: WorkflowRunLog) => run.id === current) ? current : runs[0]?.id || '');
    } catch (error) {
      setWorkflowLogs([]);
      setSelectedRunId('');
      setLogsError(error instanceof Error ? error.message : 'Failed to load workflow logs.');
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (!logsWorkflowId) return;
    loadWorkflowLogs(logsWorkflowId);
  }, [logsWorkflowId]);

  const openLogs = (workflowId: string) => {
    setLogsWorkflowId(workflowId);
    setWorkflowLogs([]);
    setSelectedRunId('');
    setLogsError('');
  };

  const closeLogs = () => {
    setLogsWorkflowId(null);
    setWorkflowLogs([]);
    setSelectedRunId('');
    setLogsError('');
  };

  const clearWorkflowLogs = async (workflowId: string) => {
    if (!(await confirmDelete({
      title: 'Clear workflow logs',
      itemName: activeLogsWorkflow?.name || 'this workflow',
      description: 'All saved execution logs for this workflow will be removed.',
      confirmLabel: 'Clear Logs',
    }))) return;
    setLogsLoading(true);
    setLogsError('');
    try {
      const response = await fetch(`/api/workflow-runs?workflowId=${encodeURIComponent(workflowId)}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to clear workflow logs.');
      setWorkflowLogs([]);
      setSelectedRunId('');
    } catch (error) {
      setLogsError(error instanceof Error ? error.message : 'Failed to clear workflow logs.');
    } finally {
      setLogsLoading(false);
    }
  };

  const formatJson = (value: unknown) => {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value ?? null, null, 2);
    } catch {
      return String(value);
    }
  };

  const statusClassName = (status?: string) => {
    switch (status) {
      case 'success':
        return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
      case 'failed':
        return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300';
      case 'skipped':
        return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300';
      case 'stopped':
        return 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300';
      default:
        return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300';
    }
  };

  if (editingId) {
    return <div className="h-full relative isolate"><WorkflowEditor workflowId={editingId} onBack={() => setEditingId(null)} /></div>;
  }

  // Map node type to icon
  const getActionIcon = (type: string) => {
    switch (type) {
      case 'whatsapp': return <MessageCircle className="h-4 w-4 text-emerald-500" />;
      case 'email': return <Mail className="h-4 w-4 text-blue-500" />;
      case 'ticket': return <Ticket className="h-4 w-4 text-purple-500" />;
      case 'start_backup': return <Power className="h-4 w-4 text-orange-500" />;
      case 'stop_device': return <PowerOff className="h-4 w-4 text-red-500" />;
      case 'webhook': return <Globe className="h-4 w-4 text-indigo-500" />;
      case 'access': return <KeyRound className="h-4 w-4 text-orange-500" />;
      case 'nfc_access': return <KeyRound className="h-4 w-4 text-cyan-500" />;
      case 'report': return <FileText className="h-4 w-4 text-slate-500" />;
      case 'ai_analyze': return <BrainCircuit className="h-4 w-4 text-orange-600" />;
      // triggers
      case 'threshold': return <Activity className="h-4 w-4 text-cyan-500" />;
      case 'offline': return <PowerOff className="h-4 w-4 text-red-500" />;
      case 'alert': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'schedule': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'ai': return <BrainCircuit className="h-4 w-4 text-orange-600" />;
      // conditions
      case 'if': return <GitBranch className="h-4 w-4 text-indigo-500" />;
      case 'elif': return <GitCommit className="h-4 w-4 text-indigo-500" />;
      case 'else': return <GitBranch className="h-4 w-4 text-slate-500" />;
      case 'logic_and': return <GitCommit className="h-4 w-4 text-purple-500" />;
      case 'logic_or': return <GitBranch className="h-4 w-4 text-purple-500" />;
      case 'check_state': return <Settings2 className="h-4 w-4 text-indigo-500" />;
      case 'time_window': return <Timer className="h-4 w-4 text-amber-500" />;
      case 'delay': return <Timer className="h-4 w-4 text-slate-500" />;
      case 'mqtt_message': return <Radio className="h-4 w-4 text-sky-500" />;
      case 'mqtt_publish': return <Wifi className="h-4 w-4 text-sky-600" />;
      case 'notification': return <Bell className="h-4 w-4 text-yellow-500" />;
      default: return <Zap className="h-4 w-4 text-slate-400" />;
    }
  };

  const getActionLabel = (type: string) => {
    if (type === 'nfc_access') return 'NFC Trigger';
    // @ts-ignore
    return t.workflows.actionTypes[type] || t.workflows.conditionTypes[type] || t.workflows.triggerTypes[type] || type;
  };

  type PreviewItem =
    | { type: 'nodes'; nodes: WorkflowNode[] }
    | { type: 'branchGroup'; branches: Array<{ condition: WorkflowNode; actions: WorkflowNode[] }> };

  const isBranchCondition = (node: WorkflowNode) =>
    node.type === 'condition' && ['if', 'elif', 'else'].includes(node.config.type);

  const buildPreviewItems = (nodes: WorkflowNode[]): PreviewItem[] => {
    const items: PreviewItem[] = [];
    const flowNodes = nodes.filter((node) => node.type !== 'trigger');
    let index = 0;

    while (index < flowNodes.length) {
      const node = flowNodes[index];

      if (isBranchCondition(node)) {
        const branches: Array<{ condition: WorkflowNode; actions: WorkflowNode[] }> = [];

        while (index < flowNodes.length && isBranchCondition(flowNodes[index])) {
          const condition = flowNodes[index];
          const previousType = branches.length > 0 ? branches[branches.length - 1].condition.config.type : undefined;

          if (branches.length > 0 && (condition.config.type === 'if' || previousType === 'else')) {
            break;
          }

          index += 1;
          const actions: WorkflowNode[] = [];

          while (
            index < flowNodes.length &&
            flowNodes[index].type === 'action' &&
            flowNodes[index].config.groupId === condition.id
          ) {
            actions.push(flowNodes[index]);
            index += 1;
          }

          branches.push({ condition, actions });
        }

        items.push({ type: 'branchGroup', branches });
        continue;
      }

      const group: WorkflowNode[] = [];
      while (index < flowNodes.length && !isBranchCondition(flowNodes[index])) {
        group.push(flowNodes[index]);
        index += 1;
      }
      items.push({ type: 'nodes', nodes: group });
    }

    return items;
  };

  const renderPreviewCard = (node: WorkflowNode) => {
    const isCondition = node.type === 'condition';
    const isTrigger = node.type === 'trigger';

    return (
      <div
        key={node.id}
        className={cn(
          "w-48 rounded-lg border p-3 flex flex-col gap-2 transition-all shadow-sm bg-white dark:bg-[#1c2128]",
          isTrigger
            ? "border-orange-200 dark:border-orange-500/30 ring-1 ring-orange-500/10"
            : isCondition
              ? "border-indigo-200 dark:border-indigo-500/30 ring-1 ring-indigo-500/10"
              : "border-slate-200 dark:border-slate-800"
        )}
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "p-1.5 rounded-md",
              isTrigger
                ? "bg-orange-50 dark:bg-orange-500/10"
                : isCondition
                  ? "bg-indigo-50 dark:bg-indigo-500/10"
                  : "bg-slate-50 dark:bg-slate-800/50"
            )}
          >
            {getActionIcon(node.config.type)}
          </div>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-1">
            {getActionLabel(node.config.type)}
          </span>
        </div>
        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-50/50 dark:bg-slate-900/30 p-2 rounded line-clamp-2">
          {Object.entries(node.config).filter(([key]) => key !== 'type' && key !== 'groupId').map(([key, value]) => `${key}: ${value}`).join(', ')}
        </div>
      </div>
    );
  };

  const renderBranchPreview = (item: Extract<PreviewItem, { type: 'branchGroup' }>) => (
    <div className="flex items-start gap-3 rounded-xl border border-indigo-200/70 dark:border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-500/[0.03] px-4 py-3">
      {item.branches.map((branch, index) => (
        <React.Fragment key={branch.condition.id}>
          {index > 0 && (
            <div className="mt-10 flex items-center gap-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
              <span className="h-px w-6 bg-slate-300 dark:bg-slate-700" />
              <span className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5">OR</span>
              <span className="h-px w-6 bg-slate-300 dark:bg-slate-700" />
            </div>
          )}
          <div className="flex flex-col items-center gap-3">
            {renderPreviewCard(branch.condition)}
            {branch.actions.length > 0 && (
              <>
                <div className="h-5 w-px bg-slate-300 dark:bg-slate-700" />
                <div className="flex flex-col gap-3">
                  {branch.actions.map(renderPreviewCard)}
                </div>
              </>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            <GitMerge className="h-6 w-6 text-orange-600 dark:text-orange-500" />
            {t.workflows.title}
            <UnderDevelopmentBadge />
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t.workflows.desc}
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={() => setEditingId('new')}
            type="button"
            className="inline-flex items-center gap-x-2 rounded-md bg-orange-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          >
            <Plus className="-ml-0.5 h-5 w-5" aria-hidden="true" />
            {t.workflows.addWorkflow}
          </button>
        </div>
      </div>

      {workflows.length === 0 ? (
        <div className="text-center bg-white dark:bg-[#1c2128] rounded-xl border border-slate-200 dark:border-slate-800 border-dashed p-12">
          <GitMerge className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">No workflows</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.workflows.empty}</p>
          <div className="mt-6">
            <button
              onClick={() => setEditingId('new')}
              className="inline-flex items-center gap-x-2 rounded-md bg-orange-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            >
              <Plus className="-ml-0.5 h-5 w-5" aria-hidden="true" />
              {t.workflows.addWorkflow}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {workflows.map((workflow) => (
            <div key={workflow.id} className="bg-white dark:bg-[#1c2128] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col group relative overflow-visible">
              
              <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    workflow.enabled ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-300 dark:bg-slate-700"
                  )} />
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      {workflow.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">{workflow.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => updateWorkflow(workflow.id, { enabled: !workflow.enabled })}
                    className={cn(
                      "p-1.5 rounded-md border text-xs font-medium flex items-center gap-1 transition-colors",
                      workflow.enabled 
                        ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700" 
                        : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    {workflow.enabled ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {workflow.enabled ? "Disable" : "Enable"}
                  </button>
                  <button 
                    onClick={() => setEditingId(workflow.id)}
                    className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title="Edit workflow"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => openLogs(workflow.id)}
                    className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title="Workflow logs"
                  >
                    <ListTree className="h-4 w-4" />
                  </button>
                  <button onClick={async () => {
                    if (await confirmDelete({ title: 'Delete workflow', itemName: workflow.name || 'this workflow', description: 'Workflow nodes, settings, and saved workflow definition will be removed.' })) deleteWorkflow(workflow.id);
                  }} className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-600 hover:border-red-200 dark:hover:bg-slate-800 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Workflow Canvas Preview */}
              <div className="p-6 bg-slate-50/30 dark:bg-[#16191f] overflow-x-auto">
                <div className="flex items-center gap-4 min-w-max">
                  {/* Triggers Group */}
                  <div className="flex flex-col gap-3">
                    {workflow.nodes.filter(n => n.type === 'trigger').map(renderPreviewCard)}
                  </div>

                  {workflow.nodes.filter(n => n.type === 'trigger').length > 0 && workflow.nodes.filter(n => n.type !== 'trigger').length > 0 && (
                    <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
                  )}

                  {/* Other Nodes */}
                  {buildPreviewItems(workflow.nodes).map((item, index, arr) => {
                    return (
                      <React.Fragment key={`${item.type}-${index}`}>
                        {item.type === 'branchGroup' ? (
                          renderBranchPreview(item)
                        ) : (
                          item.nodes.map((node, nodeIndex) => (
                            <React.Fragment key={node.id}>
                              {renderPreviewCard(node)}
                              {nodeIndex < item.nodes.length - 1 && (
                                <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
                              )}
                            </React.Fragment>
                          ))
                        )}
                        {index < arr.length - 1 && (
                          <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
                        )}
                      </React.Fragment>
                    );
                  })}
                  
                  {/* Add Node Button */}
                  <button 
                    onClick={() => setEditingId(workflow.id)} 
                    className="h-8 w-8 ml-2 rounded-full border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-400 hover:text-orange-500 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeLogsWorkflow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1c2128]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                  <ListTree className="h-4 w-4 text-orange-500" />
                  Logs
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {activeLogsWorkflow.name} · execution flow and errors
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadWorkflowLogs(activeLogsWorkflow.id)}
                  disabled={logsLoading}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <RefreshCw className={cn("h-4 w-4", logsLoading && "animate-spin")} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => clearWorkflowLogs(activeLogsWorkflow.id)}
                  disabled={logsLoading || workflowLogs.length === 0}
                  className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear Logs
                </button>
                <button
                  type="button"
                  onClick={closeLogs}
                  className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[320px_1fr]">
              <aside className="min-h-0 overflow-y-auto border-b border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/20 lg:border-b-0 lg:border-r">
                {logsError && (
                  <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    {logsError}
                  </div>
                )}
                {logsLoading && workflowLogs.length === 0 ? (
                  <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                    Loading workflow logs...
                  </div>
                ) : workflowLogs.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                    No logs yet. Trigger this workflow once to record a run.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {workflowLogs.map((run) => (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => setSelectedRunId(run.id)}
                        className={cn(
                          "w-full rounded-lg border p-3 text-left transition-colors",
                          selectedRun?.id === run.id
                            ? "border-orange-300 bg-orange-50 dark:border-orange-500/40 dark:bg-orange-500/10"
                            : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", statusClassName(run.status))}>
                            {run.status}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {new Date(run.startedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-2 truncate text-xs font-mono text-slate-500 dark:text-slate-400">
                          {run.triggerType} · {run.eventSource}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {run.steps?.length || 0} steps
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </aside>

              <main className="min-h-0 overflow-y-auto p-5">
                {selectedRun ? (
                  <div className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">Status</span>
                        <span className={cn("mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold uppercase", statusClassName(selectedRun.status))}>
                          {selectedRun.status}
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">Trigger</span>
                        <span className="mt-2 block text-sm font-semibold text-slate-900 dark:text-white">{selectedRun.triggerType}</span>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">Started</span>
                        <span className="mt-2 block text-sm font-semibold text-slate-900 dark:text-white">{new Date(selectedRun.startedAt).toLocaleString()}</span>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">Finished</span>
                        <span className="mt-2 block text-sm font-semibold text-slate-900 dark:text-white">{new Date(selectedRun.finishedAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <section>
                      <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Execution Flow</h4>
                      <div className="space-y-3">
                        {(selectedRun.steps || []).map((step, index) => (
                          <div key={`${step.nodeId || step.nodeName || 'step'}-${index}`} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex items-start gap-3">
                                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                  {index + 1}
                                </div>
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-slate-900 dark:text-white">{step.nodeName || step.nodeId || 'Node'}</span>
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:bg-slate-800 dark:text-slate-400">{step.type || 'node'}</span>
                                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", statusClassName(step.status))}>
                                      {step.status || 'unknown'}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {step.startedAt ? new Date(step.startedAt).toLocaleTimeString() : '-'} - {step.finishedAt ? new Date(step.finishedAt).toLocaleTimeString() : '-'}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                              <div>
                                <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Input</div>
                                <pre className="max-h-56 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-200">{formatJson(step.input)}</pre>
                              </div>
                              <div>
                                <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                                  {step.status === 'failed' ? 'Error / Output' : 'Output'}
                                </div>
                                <pre className={cn(
                                  "max-h-56 overflow-auto rounded-md p-3 text-xs",
                                  step.status === 'failed'
                                    ? "bg-red-950/80 text-red-100"
                                    : "bg-slate-950 text-slate-200"
                                )}>{formatJson(step.output)}</pre>
                              </div>
                            </div>
                          </div>
                        ))}
                        {(!selectedRun.steps || selectedRun.steps.length === 0) && (
                          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            This run has no recorded steps.
                          </div>
                        )}
                      </div>
                    </section>

                    <section>
                      <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Trigger Event</h4>
                      <pre className="max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-200">{formatJson(selectedRun.event)}</pre>
                    </section>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Select a run to inspect the execution flow.
                  </div>
                )}
              </main>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
