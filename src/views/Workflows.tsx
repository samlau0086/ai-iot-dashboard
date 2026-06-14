import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore, type Workflow, type WorkflowNode } from '../lib/store';
import { translations } from '../lib/i18n';
import { 
  GitMerge, GitBranch, GitCommit, Settings2, Timer, Plus, Play, Square, Trash2, Edit2, 
  MessageCircle, Mail, Ticket, Power, Globe,
  FileText, BrainCircuit, Activity, AlertTriangle,
  Clock, Zap, PowerOff, ArrowRight, Radio, Wifi, Bell, KeyRound, ListTree, RefreshCw, X,
  Download, Upload, Package, Copy, Search, Star
} from 'lucide-react';
import { cn } from '../lib/utils';
import { WorkflowEditor } from './WorkflowEditor';
import { confirmDelete } from '../lib/confirm';
import { UnderDevelopmentBadge } from '../components/UnderDevelopmentBadge';
import { notifySuccess } from '../lib/toast';
import {
  WORKFLOW_TEMPLATES,
  createWorkflowFromTemplate,
  exportWorkflowToJson,
  importWorkflowFromJson,
  type WorkflowTemplate,
} from '../lib/workflowPortability';

type WorkflowRunStep = {
  nodeId?: string;
  nodeName?: string;
  type?: string;
  status?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  startedAt?: string;
  finishedAt?: string;
};

type WorkflowLogStatusFilter = 'all' | 'success' | 'failed' | 'running';

type WorkflowRunLog = {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowVersion?: number;
  triggerType: string;
  eventSource: string;
  status: string;
  event: unknown;
  steps: WorkflowRunStep[];
  startedAt: string;
  finishedAt: string;
};

export function Workflows() {
  const { language, workflows, addWorkflow, updateWorkflow, deleteWorkflow } = useAppStore();
  const t = translations[language];
  const [searchParams, setSearchParams] = useSearchParams();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [logsWorkflowId, setLogsWorkflowId] = useState<string | null>(null);
  const [workflowLogs, setWorkflowLogs] = useState<WorkflowRunLog[]>([]);
  const [workflowRunMetrics, setWorkflowRunMetrics] = useState<WorkflowRunLog[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [logsStatusFilter, setLogsStatusFilter] = useState<WorkflowLogStatusFilter>('all');
  const [logsLoading, setLogsLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateCategory, setTemplateCategory] = useState('all');
  const [selectedTemplateId, setSelectedTemplateId] = useState(WORKFLOW_TEMPLATES[0]?.id || '');

  const activeLogsWorkflow = workflows.find((workflow) => workflow.id === logsWorkflowId) || null;
  const filteredWorkflowLogs = useMemo(
    () => logsStatusFilter === 'all' ? workflowLogs : workflowLogs.filter((run) => run.status === logsStatusFilter),
    [workflowLogs, logsStatusFilter]
  );
  const selectedRun = useMemo(
    () => filteredWorkflowLogs.find((run) => run.id === selectedRunId) || filteredWorkflowLogs[0] || null,
    [filteredWorkflowLogs, selectedRunId]
  );

  const getRunDurationMs = (run: WorkflowRunLog) => {
    const started = new Date(run.startedAt).getTime();
    const finished = new Date(run.finishedAt).getTime();
    if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return 0;
    return finished - started;
  };

  const getStepDurationMs = (step: WorkflowRunStep) => {
    const started = new Date(step.startedAt || '').getTime();
    const finished = new Date(step.finishedAt || '').getTime();
    if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return 0;
    return finished - started;
  };

  const formatDuration = (durationMs: number) => {
    if (!durationMs) return '0ms';
    if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
    const seconds = durationMs / 1000;
    if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const buildRunSummary = (runs: WorkflowRunLog[]) => {
    const total = runs.length;
    const success = runs.filter((run) => run.status === 'success').length;
    const failed = runs.filter((run) => run.status === 'failed').length;
    const running = runs.filter((run) => run.status === 'running').length;
    const avgDuration = total
      ? runs.reduce((sum, run) => sum + getRunDurationMs(run), 0) / total
      : 0;
    const lastRun = [...runs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0] || null;
    return {
      total,
      success,
      failed,
      running,
      successRate: total ? Math.round((success / total) * 100) : 0,
      avgDuration,
      lastRun,
    };
  };

  const globalRunSummary = useMemo(() => buildRunSummary(workflowRunMetrics), [workflowRunMetrics]);
  const runsByWorkflow = useMemo(() => {
    const map = new Map<string, WorkflowRunLog[]>();
    workflowRunMetrics.forEach((run) => {
      const current = map.get(run.workflowId) || [];
      current.push(run);
      map.set(run.workflowId, current);
    });
    return map;
  }, [workflowRunMetrics]);
  const activeLogsSummary = useMemo(() => buildRunSummary(workflowLogs), [workflowLogs]);

  const loadWorkflowRunMetrics = async () => {
    setMetricsLoading(true);
    try {
      const response = await fetch('/api/workflow-runs?limit=200');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to load workflow metrics.');
      setWorkflowRunMetrics(Array.isArray(payload.runs) ? payload.runs : []);
    } catch {
      setWorkflowRunMetrics([]);
    } finally {
      setMetricsLoading(false);
    }
  };

  const loadWorkflowLogs = async (
    workflowId: string,
    preferredRunId = selectedRunId,
    preferredFilter: WorkflowLogStatusFilter = logsStatusFilter
  ) => {
    setLogsLoading(true);
    setLogsError('');
    try {
      const response = await fetch(`/api/workflow-runs?workflowId=${encodeURIComponent(workflowId)}&limit=50`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to load workflow logs.');
      const runs = Array.isArray(payload.runs) ? payload.runs : [];
      setWorkflowLogs(runs);
      const visibleRuns = preferredFilter === 'all' ? runs : runs.filter((run: WorkflowRunLog) => run.status === preferredFilter);
      setSelectedRunId((current) => {
        if (preferredRunId && runs.some((run: WorkflowRunLog) => run.id === preferredRunId)) return preferredRunId;
        if (visibleRuns.some((run: WorkflowRunLog) => run.id === current)) return current;
        return visibleRuns[0]?.id || '';
      });
      loadWorkflowRunMetrics();
    } catch (error) {
      setWorkflowLogs([]);
      setSelectedRunId('');
      setLogsError(error instanceof Error ? error.message : 'Failed to load workflow logs.');
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflowRunMetrics();
  }, []);

  useEffect(() => {
    const workflowId = searchParams.get('workflowId');
    if (!workflowId || !workflows.some((workflow) => workflow.id === workflowId)) return;
    openLogs(workflowId, searchParams.get('runId') || '', 'all');
    setSearchParams({}, {replace: true});
  }, [searchParams, workflows, setSearchParams]);

  useEffect(() => {
    if (!selectedRun && filteredWorkflowLogs.length > 0) {
      setSelectedRunId(filteredWorkflowLogs[0].id);
    }
  }, [filteredWorkflowLogs, selectedRun]);

  const openLogs = (workflowId: string, runId = '', filter: WorkflowLogStatusFilter = 'all') => {
    setLogsWorkflowId(workflowId);
    setLogsStatusFilter(filter);
    setWorkflowLogs([]);
    setSelectedRunId(runId);
    setLogsError('');
    loadWorkflowLogs(workflowId, runId, filter);
  };

  const closeLogs = () => {
    setLogsWorkflowId(null);
    setWorkflowLogs([]);
    setSelectedRunId('');
    setLogsStatusFilter('all');
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
      loadWorkflowRunMetrics();
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

  const findLatestRunByStatus = (runs: WorkflowRunLog[], status: WorkflowLogStatusFilter) => {
    const visibleRuns = status === 'all' ? runs : runs.filter((run) => run.status === status);
    return [...visibleRuns].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0] || null;
  };

  const globalLatestFailedRun = useMemo(() => findLatestRunByStatus(workflowRunMetrics, 'failed'), [workflowRunMetrics]);
  const globalLastRun = globalRunSummary.lastRun;

  const copyJson = async (label: string, value: unknown) => {
    try {
      await navigator.clipboard.writeText(formatJson(value));
      notifySuccess(`${label} copied.`);
    } catch {
      notifySuccess(`${label} ready to copy.`);
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

  const downloadWorkflow = (workflow: Workflow) => {
    const json = exportWorkflowToJson(workflow);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${workflow.name.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase() || 'workflow'}_workflow.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notifySuccess('Workflow exported successfully.');
  };

  const handleImportWorkflow = () => {
    try {
      const workflow = importWorkflowFromJson(importText, window.location.origin);
      addWorkflow(workflow);
      setShowImportModal(false);
      setImportText('');
      setImportError('');
      notifySuccess('Workflow imported as disabled draft.');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to import workflow.');
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportText(await file.text());
    setImportError('');
    event.target.value = '';
  };

  const createFromTemplate = (template: WorkflowTemplate) => {
    const workflow = createWorkflowFromTemplate(template, window.location.origin);
    addWorkflow(workflow);
    setShowTemplateModal(false);
    notifySuccess('Workflow template added as draft.');
  };

  const marketplaceTemplates = useMemo(() => WORKFLOW_TEMPLATES.map((template) => {
    const triggerCount = template.workflow.nodes.filter((node) => node.type === 'trigger').length;
    const conditionCount = template.workflow.nodes.filter((node) => node.type === 'condition').length;
    const actionCount = template.workflow.nodes.filter((node) => node.type === 'action').length;
    const category = template.tags.includes('control')
      ? 'control'
      : template.tags.includes('access') || template.tags.includes('nfc')
        ? 'access'
        : template.tags.includes('mqtt')
          ? 'ingest'
          : template.tags.includes('report') || template.tags.includes('schedule')
            ? 'reporting'
            : 'monitoring';
    const difficulty = template.workflow.nodes.length >= 4 || conditionCount > 0
      ? 'Advanced'
      : template.workflow.nodes.length >= 3
        ? 'Standard'
        : 'Starter';
    const industry = template.tags.includes('access')
      ? 'Access Control'
      : template.tags.includes('mqtt')
        ? 'Industrial IoT'
        : template.tags.includes('control')
          ? 'Operations'
          : template.tags.includes('report')
            ? 'Management'
            : 'Maintenance';
    const featured = ['access-control', 'threshold-if-control', 'device-offline-notify'].includes(template.id);
    return {
      ...template,
      category,
      difficulty,
      industry,
      featured,
      triggerCount,
      conditionCount,
      actionCount,
    };
  }), []);
  const templateCategories = useMemo(() => [
    { id: 'all', label: 'All' },
    { id: 'monitoring', label: 'Monitoring' },
    { id: 'control', label: 'Control' },
    { id: 'access', label: 'Access' },
    { id: 'ingest', label: 'MQTT / Ingest' },
    { id: 'reporting', label: 'Reporting' },
  ], []);
  const filteredMarketplaceTemplates = useMemo(() => {
    const search = templateSearch.trim().toLowerCase();
    return marketplaceTemplates.filter((template) => (
      (templateCategory === 'all' || template.category === templateCategory)
      && (!search || [
        template.name,
        template.description,
        template.industry,
        template.difficulty,
        ...template.tags,
      ].join(' ').toLowerCase().includes(search))
    ));
  }, [marketplaceTemplates, templateCategory, templateSearch]);
  const selectedMarketplaceTemplate = marketplaceTemplates.find((template) => template.id === selectedTemplateId)
    || filteredMarketplaceTemplates[0]
    || marketplaceTemplates[0];

  useEffect(() => {
    if (!filteredMarketplaceTemplates.length) return;
    if (!filteredMarketplaceTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(filteredMarketplaceTemplates[0].id);
    }
  }, [filteredMarketplaceTemplates, selectedTemplateId]);

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
      case 'run_workflow': return <GitMerge className="h-4 w-4 text-orange-500" />;
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
        <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-0">
          <button
            onClick={() => setShowTemplateModal(true)}
            type="button"
            className="inline-flex items-center gap-x-2 rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Package className="-ml-0.5 h-5 w-5 text-orange-500" aria-hidden="true" />
            Template Marketplace
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            type="button"
            className="inline-flex items-center gap-x-2 rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Upload className="-ml-0.5 h-5 w-5 text-slate-500" aria-hidden="true" />
            Import JSON
          </button>
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Total Runs', value: String(globalRunSummary.total), detail: metricsLoading ? 'Refreshing...' : 'Recent 200 logs', onClick: undefined },
          { label: 'Success Rate', value: `${globalRunSummary.successRate}%`, detail: `${globalRunSummary.success} successful`, onClick: undefined },
          {
            label: 'Failed Runs',
            value: String(globalRunSummary.failed),
            detail: globalLatestFailedRun ? 'Click to inspect latest failure' : `${globalRunSummary.running} running`,
            onClick: globalLatestFailedRun ? () => openLogs(globalLatestFailedRun.workflowId, globalLatestFailedRun.id, 'failed') : undefined,
          },
          { label: 'Avg Duration', value: formatDuration(globalRunSummary.avgDuration), detail: 'Across loaded runs', onClick: undefined },
          {
            label: 'Last Run',
            value: globalLastRun ? globalLastRun.status : 'None',
            detail: globalLastRun ? new Date(globalLastRun.startedAt).toLocaleString() : 'No execution yet',
            onClick: globalLastRun ? () => openLogs(globalLastRun.workflowId, globalLastRun.id, 'all') : undefined,
          },
        ].map((metric) => (
          <button
            key={metric.label}
            type="button"
            onClick={metric.onClick}
            disabled={!metric.onClick}
            className={cn(
              "rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors dark:border-slate-800 dark:bg-[#1c2128]",
              metric.onClick && "hover:border-orange-300 hover:bg-orange-50/40 dark:hover:border-orange-500/40 dark:hover:bg-orange-500/10",
              !metric.onClick && "cursor-default"
            )}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{metric.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{metric.value}</div>
            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{metric.detail}</div>
          </button>
        ))}
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
          {workflows.map((workflow) => {
            const workflowRuns = runsByWorkflow.get(workflow.id) || [];
            const workflowSummary = buildRunSummary(workflowRuns);
            const workflowLatestFailed = findLatestRunByStatus(workflowRuns, 'failed');
            return (
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
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <span>Draft v{workflow.draftVersion || 0}</span>
                      <span>Published v{workflow.publishedVersion || 0}</span>
                      <span>{workflow.versionHistory?.length || 0} versions</span>
                      {workflow.publishedAt && <span>{new Date(workflow.publishedAt).toLocaleString()}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-medium">
                      <span className={cn("rounded-full border px-2 py-0.5 uppercase", statusClassName(workflowSummary.lastRun?.status))}>
                        {workflowSummary.lastRun ? workflowSummary.lastRun.status : 'no runs'}
                      </span>
                      <button
                        type="button"
                        onClick={() => openLogs(workflow.id)}
                        className="text-slate-500 underline-offset-2 hover:text-orange-600 hover:underline dark:text-slate-400 dark:hover:text-orange-300"
                      >
                        {workflowSummary.total} runs
                      </button>
                      <span className="text-slate-500 dark:text-slate-400">{workflowSummary.successRate}% success</span>
                      <button
                        type="button"
                        disabled={!workflowLatestFailed}
                        onClick={() => workflowLatestFailed && openLogs(workflow.id, workflowLatestFailed.id, 'failed')}
                        className={cn(
                          "underline-offset-2",
                          workflowLatestFailed
                            ? "text-slate-500 hover:text-red-600 hover:underline dark:text-slate-400 dark:hover:text-red-300"
                            : "cursor-default text-slate-500 dark:text-slate-400"
                        )}
                      >
                        {workflowSummary.failed} failures
                      </button>
                      <span className="text-slate-500 dark:text-slate-400">avg {formatDuration(workflowSummary.avgDuration)}</span>
                      {workflowSummary.lastRun && (
                        <button
                          type="button"
                          onClick={() => openLogs(workflow.id, workflowSummary.lastRun?.id || '', 'all')}
                          className="text-slate-500 underline-offset-2 hover:text-orange-600 hover:underline dark:text-slate-400 dark:hover:text-orange-300"
                        >
                          last {new Date(workflowSummary.lastRun.startedAt).toLocaleString()}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadWorkflow(workflow)}
                    className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title="Export workflow"
                  >
                    <Download className="h-4 w-4" />
                  </button>
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
            );
          })}
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1c2128]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                  <Upload className="h-4 w-4 text-orange-500" />
                  Import Workflow JSON
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Imported workflows are saved as disabled drafts with regenerated IDs and webhook endpoints.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportText('');
                  setImportError('');
                }}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  JSON File
                </span>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportFile}
                  className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:file:bg-slate-800 dark:file:text-slate-200"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Paste Export JSON
                </span>
                <textarea
                  value={importText}
                  onChange={(event) => {
                    setImportText(event.target.value);
                    setImportError('');
                  }}
                  placeholder='{"kind":"ai-iot-dashboard.workflow","version":1,...}'
                  className="h-72 w-full rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-100 outline-none focus:border-orange-500 dark:border-slate-700"
                />
              </label>

              {importError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {importError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportText('');
                  setImportError('');
                }}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportWorkflow}
                disabled={!importText.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                Import as Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1c2128]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                  <Package className="h-4 w-4 text-orange-500" />
                  Workflow Template Marketplace
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Browse industrial workflow starters, preview their nodes, then create a disabled draft and bind real devices before publishing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[360px_1fr]">
              <aside className="min-h-0 overflow-y-auto border-b border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/20 lg:border-b-0 lg:border-r">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={templateSearch}
                    onChange={(event) => setTemplateSearch(event.target.value)}
                    placeholder="Search templates, tags, industry..."
                    className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {templateCategories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setTemplateCategory(category.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                        templateCategory === category.id
                          ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300"
                          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                      )}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 space-y-3">
                  {filteredMarketplaceTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(template.id)}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-colors",
                        selectedMarketplaceTemplate?.id === template.id
                          ? "border-orange-300 bg-orange-50/70 dark:border-orange-500/40 dark:bg-orange-500/10"
                          : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-800/80"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {template.featured && <Star className="h-3.5 w-3.5 fill-orange-500 text-orange-500" />}
                            <h4 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{template.name}</h4>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{template.description}</p>
                        </div>
                        <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                          {template.difficulty}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {template.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                  {filteredMarketplaceTemplates.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      No templates match the current filters.
                    </div>
                  )}
                </div>
              </aside>

              <main className="min-h-0 overflow-y-auto p-5">
                {selectedMarketplaceTemplate && (
                  <div className="space-y-5">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/40">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {selectedMarketplaceTemplate.featured && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                                <Star className="h-3 w-3 fill-orange-500 text-orange-500" />
                                Featured
                              </span>
                            )}
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                              {selectedMarketplaceTemplate.industry}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                              {selectedMarketplaceTemplate.difficulty}
                            </span>
                          </div>
                          <h4 className="mt-3 text-xl font-semibold text-slate-900 dark:text-white">{selectedMarketplaceTemplate.name}</h4>
                          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">{selectedMarketplaceTemplate.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => createFromTemplate(selectedMarketplaceTemplate)}
                          className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-500"
                        >
                          <Plus className="h-4 w-4" />
                          Create Draft
                        </button>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-4">
                        {[
                          { label: 'Triggers', value: selectedMarketplaceTemplate.triggerCount },
                          { label: 'Conditions', value: selectedMarketplaceTemplate.conditionCount },
                          { label: 'Actions', value: selectedMarketplaceTemplate.actionCount },
                          { label: 'Nodes', value: selectedMarketplaceTemplate.workflow.nodes.length },
                        ].map((metric) => (
                          <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/60">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{metric.label}</div>
                            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{metric.value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {selectedMarketplaceTemplate.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/40">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h5 className="text-sm font-semibold text-slate-900 dark:text-white">Workflow Preview</h5>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Review the generated trigger/action chain before creating a draft.</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          Disabled draft after install
                        </span>
                      </div>
                      <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="flex min-w-max items-start gap-4">
                          {selectedMarketplaceTemplate.workflow.nodes.filter((node) => node.type === 'trigger').map((node, index, triggers) => (
                            <React.Fragment key={node.id}>
                              {index > 0 && <div className="mt-12 text-[10px] font-semibold uppercase text-slate-400">OR</div>}
                              {renderPreviewCard(node)}
                              {index === triggers.length - 1 && <ArrowRight className="mt-12 h-4 w-4 text-slate-400" />}
                            </React.Fragment>
                          ))}
                          {buildPreviewItems(selectedMarketplaceTemplate.workflow.nodes).map((item, index) => (
                            <React.Fragment key={`${item.type}-${index}`}>
                              {index > 0 && <ArrowRight className="mt-12 h-4 w-4 text-slate-400" />}
                              {item.type === 'branchGroup'
                                ? renderBranchPreview(item)
                                : (
                                  <div className="flex items-start gap-3">
                                    {item.nodes.map((node, nodeIndex) => (
                                      <React.Fragment key={node.id}>
                                        {nodeIndex > 0 && <ArrowRight className="mt-12 h-4 w-4 text-slate-400" />}
                                        {renderPreviewCard(node)}
                                      </React.Fragment>
                                    ))}
                                  </div>
                                )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </main>
            </div>
          </div>
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
                <div className="mb-3 flex flex-wrap gap-1">
                  {(['all', 'success', 'failed', 'running'] as WorkflowLogStatusFilter[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        setLogsStatusFilter(status);
                        const nextRun = findLatestRunByStatus(workflowLogs, status);
                        setSelectedRunId(nextRun?.id || '');
                      }}
                      className={cn(
                        "rounded-md border px-2 py-1 text-[10px] font-semibold uppercase transition-colors",
                        logsStatusFilter === status
                          ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300"
                          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                {logsLoading && workflowLogs.length === 0 ? (
                  <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                    Loading workflow logs...
                  </div>
                ) : workflowLogs.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                    No logs yet. Trigger this workflow once to record a run.
                  </div>
                ) : filteredWorkflowLogs.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                    No {logsStatusFilter} runs in the loaded logs.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredWorkflowLogs.map((run) => (
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
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">Loaded Runs</span>
                        <span className="mt-2 block text-xl font-bold text-slate-900 dark:text-white">{activeLogsSummary.total}</span>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">Success Rate</span>
                        <span className="mt-2 block text-xl font-bold text-slate-900 dark:text-white">{activeLogsSummary.successRate}%</span>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">Failures</span>
                        <span className="mt-2 block text-xl font-bold text-slate-900 dark:text-white">{activeLogsSummary.failed}</span>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">Avg Duration</span>
                        <span className="mt-2 block text-xl font-bold text-slate-900 dark:text-white">{formatDuration(activeLogsSummary.avgDuration)}</span>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
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
                        <span className="block text-xs text-slate-500 dark:text-slate-400">Version</span>
                        <span className="mt-2 block text-sm font-semibold text-slate-900 dark:text-white">v{selectedRun.workflowVersion || 1}</span>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">Started</span>
                        <span className="mt-2 block text-sm font-semibold text-slate-900 dark:text-white">{new Date(selectedRun.startedAt).toLocaleString()}</span>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">Finished</span>
                        <span className="mt-2 block text-sm font-semibold text-slate-900 dark:text-white">{new Date(selectedRun.finishedAt).toLocaleString()}</span>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">Duration</span>
                        <span className="mt-2 block text-sm font-semibold text-slate-900 dark:text-white">{formatDuration(getRunDurationMs(selectedRun))}</span>
                      </div>
                    </div>

                    <section>
                      <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Execution Flow</h4>
                      <div className="space-y-3">
                        {(selectedRun.steps || []).map((step, index) => {
                          const stepFailed = step.status === 'failed';
                          const stepError = step.error ?? (stepFailed ? step.output : undefined);
                          return (
                          <div
                            key={`${step.nodeId || step.nodeName || 'step'}-${index}`}
                            className={cn(
                              "rounded-lg border bg-white p-4 dark:bg-slate-900/60",
                              stepFailed
                                ? "border-red-300 shadow-sm shadow-red-500/10 dark:border-red-500/40"
                                : "border-slate-200 dark:border-slate-800"
                            )}
                          >
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
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                <span className="rounded-md border border-slate-200 px-2 py-1 dark:border-slate-700">
                                  {formatDuration(getStepDurationMs(step))}
                                </span>
                                {stepFailed && (
                                  <button
                                    type="button"
                                    onClick={() => copyJson('Error', stepError)}
                                    className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                                  >
                                    <Copy className="h-3 w-3" />
                                    Copy Error
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                              <div>
                                <div className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                                  <span>Input</span>
                                  <button
                                    type="button"
                                    onClick={() => copyJson('Input', step.input)}
                                    className="inline-flex items-center gap-1 rounded text-[10px] text-slate-500 hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-300"
                                  >
                                    <Copy className="h-3 w-3" />
                                    Copy
                                  </button>
                                </div>
                                <pre className="max-h-56 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-200">{formatJson(step.input)}</pre>
                              </div>
                              <div>
                                <div className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                                  <span>{stepFailed ? 'Error / Output' : 'Output'}</span>
                                  <button
                                    type="button"
                                    onClick={() => copyJson(stepFailed ? 'Error / Output' : 'Output', stepFailed ? stepError : step.output)}
                                    className="inline-flex items-center gap-1 rounded text-[10px] text-slate-500 hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-300"
                                  >
                                    <Copy className="h-3 w-3" />
                                    Copy
                                  </button>
                                </div>
                                <pre className={cn(
                                  "max-h-56 overflow-auto rounded-md p-3 text-xs",
                                  stepFailed
                                    ? "bg-red-950/80 text-red-100"
                                    : "bg-slate-950 text-slate-200"
                                )}>{formatJson(stepFailed ? stepError : step.output)}</pre>
                              </div>
                            </div>
                          </div>
                        );
                        })}
                        {(!selectedRun.steps || selectedRun.steps.length === 0) && (
                          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            This run has no recorded steps.
                          </div>
                        )}
                      </div>
                    </section>

                    <section>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Trigger Event</h4>
                        <button
                          type="button"
                          onClick={() => copyJson('Trigger Event', selectedRun.event)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-orange-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-orange-300"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy Event
                        </button>
                      </div>
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
