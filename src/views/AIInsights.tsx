import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Download,
  FileText,
  Gauge,
  Route,
  Send,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react';
import { useAppStore, type Workflow } from '../lib/store';
import { translations } from '../lib/i18n';
import { deriveAlertsFromDevices } from '../lib/derivedData';
import { useRuntimeDevices } from '../hooks/useRuntimeDevices';
import { notifySuccess } from '../lib/toast';
import { cn } from '../lib/utils';
import { runAiCopilot, type AiCopilotAction, type AiCopilotResponse } from '../lib/aiCopilot';
import { getAccessibleDevices, getAccessibleSites } from '../lib/featureAccess';
import { apiJsonHeaders } from '../lib/apiAuth';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  response?: AiCopilotResponse;
};

const csvEscape = (value: unknown) => {
  const stringValue = String(value ?? '');
  if (/[",\n\r]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
  return stringValue;
};

const downloadCsv = (rows: string[][], fileName: string) => {
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const cloneWorkflow = (workflow: Workflow): Workflow => JSON.parse(JSON.stringify(workflow));

const getToneClassName = (tone: AiCopilotResponse['insights'][number]['tone']) => {
  if (tone === 'good') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300';
  if (tone === 'critical') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300';
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';
};

const quickPrompts = [
  { text: 'Summarize current site operations and risks.', icon: Gauge },
  { text: 'Which device is consuming the most power?', icon: Zap },
  { text: 'Analyze current anomalies and root causes.', icon: AlertTriangle },
  { text: 'Generate a workflow for the highest risk device.', icon: Sparkles },
  { text: 'Generate an operations report for this site.', icon: FileText },
];

const buildCopilotContextSummary = (context: {
  devices: any[];
  alerts: any[];
  workflows: any[];
  charts: any[];
  sites: any[];
  activeSiteId: string;
}) => ({
  activeSiteId: context.activeSiteId,
  devices: context.devices.slice(0, 80).map((device) => ({
    id: device.id,
    externalDeviceId: device.config?.externalDeviceId,
    name: device.name,
    type: device.type,
    status: device.status,
    siteId: device.siteId,
    lastSeen: device.lastSeen,
    metrics: device.metrics,
  })),
  alerts: context.alerts.slice(0, 80).map((alert) => ({
    id: alert.id,
    deviceId: alert.deviceId,
    level: alert.level,
    status: alert.status,
    message: alert.message,
    timestamp: alert.timestamp,
  })),
  workflows: context.workflows.slice(0, 40).map((workflow) => ({
    id: workflow.id,
    name: workflow.name,
    enabled: workflow.enabled,
    nodeCount: workflow.nodes?.length || 0,
  })),
  charts: context.charts.slice(0, 40).map((chart) => ({
    id: chart.id,
    title: chart.title,
    type: chart.type,
  })),
  sites: context.sites.map((site) => ({ id: site.id, name: site.name, tenantId: site.tenantId })),
});

const mergeExternalCopilotResponse = (
  localResponse: AiCopilotResponse,
  payload: any
): AiCopilotResponse => {
  if (!payload?.usedExternal || !payload.external) {
    return {
      ...localResponse,
      sources: [
        ...localResponse.sources,
        payload?.reason ? `External AI fallback: ${payload.reason}` : 'External AI fallback: provider not configured',
      ],
    };
  }

  const external = payload.external;
  const externalRecommendations = Array.isArray(external.recommendations)
    ? external.recommendations.map((item: unknown) => String(item)).filter(Boolean)
    : [];

  return {
    ...localResponse,
    title: external.title || localResponse.title,
    answer: external.answer || localResponse.answer,
    recommendations: externalRecommendations.length ? externalRecommendations : localResponse.recommendations,
    sources: [
      ...localResponse.sources,
      `External AI: ${payload.provider || 'provider'} / ${payload.model || 'model'}${payload.latencyMs ? ` (${payload.latencyMs} ms)` : ''}`,
    ],
  };
};

export function AIInsights() {
  const navigate = useNavigate();
  const {
    language,
    devices: storedDevices,
    workflows,
    charts,
    sites,
    activeSiteId,
    addWorkflow,
    currentUser,
  } = useAppStore();
  const accessibleSites = useMemo(() => getAccessibleSites(currentUser, sites), [currentUser, sites]);
  const accessibleStoredDevices = useMemo(() => getAccessibleDevices(currentUser, storedDevices), [currentUser, storedDevices]);
  const devices = useRuntimeDevices(accessibleStoredDevices);
  const alerts = useMemo(() => deriveAlertsFromDevices(devices), [devices]);
  const t = translations[language];
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'I can query devices, explain anomalies, prepare reports, and draft workflows from current dashboard data. Ask about a device, metric, alert, or site.',
    },
  ]);
  const [running, setRunning] = useState(false);

  const context = useMemo(() => ({
    devices,
    alerts,
    workflows,
    charts,
    sites: accessibleSites,
    activeSiteId,
  }), [accessibleSites, activeSiteId, alerts, charts, devices, workflows]);

  const executeAction = (action: AiCopilotAction) => {
    if (action.type === 'download_report') {
      downloadCsv(action.rows, action.fileName);
      notifySuccess('AI report downloaded successfully.');
      return;
    }

    if (action.type === 'open_device') {
      navigate(`/devices/${action.deviceId}`, { state: { from: '/ai-insights' } });
      return;
    }

    if (action.type === 'open_route') {
      navigate(action.route);
      return;
    }

    const workflow = cloneWorkflow(action.workflow);
    addWorkflow(workflow);
    notifySuccess('AI workflow draft created successfully.');
    navigate('/workflows');
  };

  const enhanceWithExternalAi = async (submitText: string, localResponse: AiCopilotResponse) => {
    try {
      const response = await fetch('/api/ai-copilot/chat', {
        method: 'POST',
        headers: apiJsonHeaders(currentUser),
        body: JSON.stringify({
          query: submitText,
          localResponse,
          contextSummary: buildCopilotContextSummary(context),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `External AI failed: ${response.status}`);
      return mergeExternalCopilotResponse(localResponse, payload);
    } catch (error) {
      return mergeExternalCopilotResponse(localResponse, {
        usedExternal: false,
        reason: error instanceof Error ? error.message : 'External AI request failed',
      });
    }
  };

  const submitPrompt = (textOverride?: string) => {
    const submitText = (textOverride || query).trim();
    if (!submitText || running) return;

    setRunning(true);
    setQuery('');
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: submitText,
    };

    setMessages((current) => [...current, userMessage]);

    window.setTimeout(() => {
      const localResponse = runAiCopilot(submitText, context);
      void enhanceWithExternalAi(submitText, localResponse).then((response) => {
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.answer,
          response,
        };
        setMessages((current) => [...current, assistantMessage]);
        setRunning(false);
      });
    }, 250);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    submitPrompt();
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="mb-6">
        <h1 className="flex flex-wrap items-center gap-2 font-sans text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-orange-600 shadow-sm">
            <BrainCircuit className="h-5 w-5 text-white" />
          </div>
          {t.ai.title}
          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
            Context Aware
          </span>
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Ask natural-language questions across devices, alerts, telemetry context, reports, and workflows.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#1c2128]">
          <div className="flex-1 space-y-6 overflow-y-auto bg-slate-50 p-6 dark:bg-transparent">
            {messages.map((msg) => (
              <div key={msg.id} className={cn('flex gap-4', msg.role === 'user' && 'flex-row-reverse')}>
                <div className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded border',
                  msg.role === 'user'
                    ? 'border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-700'
                    : 'border-orange-100 bg-orange-50 dark:border-orange-500/20 dark:bg-orange-500/10'
                )}>
                  {msg.role === 'assistant'
                    ? <BrainCircuit className="h-4 w-4 text-orange-600 dark:text-orange-500" />
                    : <span className="text-xs font-medium text-slate-700 dark:text-slate-300">U</span>}
                </div>

                <div className={cn(
                  'max-w-4xl rounded-lg border p-4 shadow-sm',
                  msg.role === 'user'
                    ? 'rounded-tr-sm border-slate-800 bg-slate-900 text-white dark:bg-slate-700 dark:text-slate-100'
                    : 'rounded-tl-sm border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300'
                )}>
                  {msg.response ? (
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                          {msg.response.title}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{msg.response.answer}</p>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {msg.response.insights.map((insight) => (
                          <div key={`${msg.id}-${insight.label}`} className={cn('rounded border px-3 py-2', getToneClassName(insight.tone))}>
                            <p className="text-[11px] uppercase tracking-wider opacity-70">{insight.label}</p>
                            <p className="mt-1 text-base font-bold">{insight.value}</p>
                          </div>
                        ))}
                      </div>

                      {msg.response.relatedDevices.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Related Devices</p>
                          <div className="space-y-2">
                            {msg.response.relatedDevices.map((device) => (
                              <button
                                key={device.id}
                                type="button"
                                onClick={() => navigate(`/devices/${device.id}`, { state: { from: '/ai-insights' } })}
                                className="flex w-full items-start justify-between gap-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-orange-300 hover:bg-orange-50 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-orange-500/40 dark:hover:bg-orange-500/10"
                              >
                                <span>
                                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">{device.name}</span>
                                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{device.reason}</span>
                                </span>
                                <span className={cn(
                                  'rounded px-2 py-0.5 text-xs font-semibold',
                                  device.status === 'online' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
                                  device.status === 'warning' && 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
                                  device.status === 'offline' && 'bg-red-500/10 text-red-600 dark:text-red-300'
                                )}>
                                  {device.status}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Recommendations</p>
                        <div className="space-y-2">
                          {msg.response.recommendations.map((recommendation) => (
                            <div key={recommendation} className="flex gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300">
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                              <span>{recommendation}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {msg.response.actions.map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            onClick={() => executeAction(action)}
                            title={action.description}
                            className={cn(
                              'inline-flex items-center gap-2 rounded border px-3 py-2 text-xs font-semibold transition',
                              action.type === 'create_workflow'
                                ? 'border-orange-500 bg-orange-600 text-white hover:bg-orange-500'
                                : 'border-slate-300 bg-white text-slate-700 hover:border-orange-300 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                            )}
                          >
                            {action.type === 'create_workflow' && <Route className="h-3.5 w-3.5" />}
                            {action.type === 'download_report' && <Download className="h-3.5 w-3.5" />}
                            {action.type === 'open_device' && <Wrench className="h-3.5 w-3.5" />}
                            {action.type === 'open_route' && <BarChart3 className="h-3.5 w-3.5" />}
                            {action.label}
                          </button>
                        ))}
                      </div>

                      <details className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                        <summary className="cursor-pointer font-semibold text-slate-600 dark:text-slate-300">Sources used</summary>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {msg.response.sources.map((source) => <li key={source}>{source}</li>)}
                        </ul>
                      </details>
                    </div>
                  ) : (
                    <div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                      {msg.id === 'welcome' && (
                        <div className="mt-4 grid gap-2 md:grid-cols-2">
                          {quickPrompts.map((prompt) => {
                            const Icon = prompt.icon;
                            return (
                              <button
                                key={prompt.text}
                                type="button"
                                onClick={() => submitPrompt(prompt.text)}
                                className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 dark:border-slate-700 dark:bg-[#1c2128] dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                <Icon className="h-3.5 w-3.5 text-orange-500" />
                                {prompt.text}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {running && (
              <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                <BrainCircuit className="h-4 w-4 animate-pulse text-orange-500" />
                Reading device context and composing answer...
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#1c2128]">
            <form className="relative" onSubmit={handleSubmit}>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.ai.placeholder}
                className="w-full rounded border border-slate-200 bg-slate-50 py-3 pl-4 pr-12 font-mono text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={running || !query.trim()}
                className="absolute right-2 top-2 rounded bg-orange-600 p-1.5 text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        <aside className="hidden min-h-0 space-y-4 lg:block">
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#1c2128]">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Copilot Tools</p>
            <div className="mt-3 space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <div className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">Natural-language device and metric query</div>
              <div className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">Anomaly and root-cause explanation</div>
              <div className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">CSV report generation</div>
              <div className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">Workflow draft generation</div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#1c2128]">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Current Context</p>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Devices</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">{devices.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Alerts</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">{alerts.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Workflows</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">{workflows.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Charts</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">{charts.length}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
