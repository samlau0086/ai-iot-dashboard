import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore, Workflow, WorkflowEdge, WorkflowNode, type AccessDefinition, type WorkflowVersionSnapshot } from '../lib/store';
import { translations } from '../lib/i18n';
import { 
  ArrowLeft, Plus, Save, Trash2, Play, Square,
  MessageCircle, Mail, Ticket, Power, Globe, FileText, BrainCircuit,
  Activity, Clock, Zap, PowerOff, ArrowDown, X, AlertTriangle, Settings,
  GitBranch, GitCommit, Settings2, Timer, ChevronDown, Radio, Wifi, Bell,
  Code2, Shuffle, Ruler, Database, Repeat2, Ban, Braces, Route, KeyRound, ListTree, RefreshCw, ChevronRight, Copy,
  History, RotateCcw, Search
} from 'lucide-react';
import { cn } from '../lib/utils';
import { buildControlParameters, getDeviceControlDefinitions } from '../lib/deviceControls';
import { confirmDelete } from '../lib/confirm';
import { notifySuccess } from '../lib/toast';
import { UnderDevelopmentBadge } from '../components/UnderDevelopmentBadge';

interface WorkflowEditorProps {
  workflowId: string;
  onBack: () => void;
}

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
  workflowVersion?: number;
  triggerType: string;
  eventSource: string;
  status: string;
  event: unknown;
  steps: WorkflowRunStep[];
  startedAt: string;
  finishedAt: string;
  dryRun?: boolean;
};

type WorkflowValidationIssue = {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  nodeId?: string;
  nodeName?: string;
  nodeType?: string;
};

const formatJsonValue = (value: unknown) => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
};

const isJsonContainer = (value: unknown) => Boolean(value && typeof value === 'object');
const isReferenceSafeKey = (key: string) => /^[A-Za-z0-9_$\u4e00-\u9fa5-]+$/.test(key);
const buildReferencePath = (baseReference: string, path: Array<string | number>) => {
  if (path.some((segment) => typeof segment === 'string' && !isReferenceSafeKey(segment))) return '';
  return path.length ? `${baseReference}.${path.join('.')}` : baseReference;
};

function JsonTreeNode({
  label,
  value,
  path,
  baseReference,
  depth = 0,
  onCopy,
}: {
  label: string;
  value: unknown;
  path: Array<string | number>;
  baseReference: string;
  depth?: number;
  onCopy: (reference: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isContainer = isJsonContainer(value);
  const reference = buildReferencePath(baseReference, path);
  const entries = Array.isArray(value)
    ? value.map((item, index) => [index, item] as const)
    : isContainer
      ? Object.entries(value as Record<string, unknown>)
      : [];

  const handleCopy = () => {
    if (reference) onCopy(reference);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={handleCopy}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleCopy();
          }
        }}
        className={cn(
          "group flex min-w-0 items-start gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] leading-5 text-slate-200 hover:bg-slate-800/80",
          reference ? "cursor-copy" : "cursor-default"
        )}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        title={reference || 'This key cannot be referenced with dot notation'}
      >
        {isContainer ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((value) => !value);
            }}
            className="mt-0.5 rounded text-slate-400 hover:bg-slate-700 hover:text-slate-100"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="shrink-0 text-sky-300">{label}</span>
        <span className="shrink-0 text-slate-500">:</span>
        {isContainer ? (
          <span className="truncate text-slate-400">{Array.isArray(value) ? `[${entries.length} items]` : `{${entries.length} keys}`}</span>
        ) : (
          <span className="break-all text-orange-200">{typeof value === 'string' ? value : String(value)}</span>
        )}
        {reference && <Copy className="ml-auto mt-1 hidden h-3 w-3 shrink-0 text-slate-500 group-hover:block" />}
      </div>
      {isContainer && expanded && (
        <div>
          {entries.length === 0 ? (
            <div className="px-2 py-0.5 font-mono text-[11px] text-slate-500" style={{ paddingLeft: `${(depth + 1) * 14 + 6}px` }}>empty</div>
          ) : entries.map(([key, item]) => (
            <JsonTreeNode
              key={`${path.join('.')}.${String(key)}`}
              label={String(key)}
              value={item}
              path={[...path, key]}
              baseReference={baseReference}
              depth={depth + 1}
              onCopy={onCopy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function JsonInspector({
  value,
  baseReference,
  onReferenceSelect,
  failed,
}: {
  value: unknown;
  baseReference: string;
  onReferenceSelect?: (reference: string) => void;
  failed?: boolean;
}) {
  const [view, setView] = useState<'tree' | 'text'>('tree');
  const [copied, setCopied] = useState('');

  const copyReference = async (reference: string) => {
    if (onReferenceSelect) {
      onReferenceSelect(reference);
      return;
    }
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(reference);
      window.setTimeout(() => setCopied(''), 1400);
    } catch {
      setCopied('Copy failed');
      window.setTimeout(() => setCopied(''), 1400);
    }
  };

  return (
    <div className={cn("overflow-hidden rounded-md", failed ? "bg-red-950/80" : "bg-slate-950")}>
      <div className="flex items-center justify-between border-b border-slate-800 px-2 py-1">
        <div className="flex items-center gap-1">
          {(['tree', 'text'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setView(item)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-medium capitalize",
                view === item
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="max-w-[190px] truncate text-[10px] text-emerald-300">{copied}</span>
      </div>
      {view === 'text' ? (
        <pre className={cn("max-h-56 overflow-auto p-3 text-xs", failed ? "text-red-100" : "text-slate-200")}>{formatJsonValue(value)}</pre>
      ) : (
        <div className={cn("max-h-56 overflow-auto py-2", failed ? "text-red-100" : "text-slate-200")}>
          <JsonTreeNode label={baseReference.replace('$.', '')} value={value} path={[]} baseReference={baseReference} onCopy={copyReference} />
        </div>
      )}
    </div>
  );
}

const getPathValue = (target: unknown, pathExpression = '') => {
  if (!pathExpression) return target;
  return String(pathExpression)
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((current, key) => {
      if (current == null) return undefined;
      if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)];
      return typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined;
    }, target);
};

const workflowReferenceTokenRegex = /\$\.(?:([A-Za-z0-9_$\u4e00-\u9fa5-]+)\.)?(input|output)(?:\.([A-Za-z0-9_$\u4e00-\u9fa5.-]+))?/g;
const workflowFunctionHelpers = [
  { name: 'now', snippet: 'now()', description: 'Current timestamp as ISO string.' },
  { name: 'formatDate', snippet: 'formatDate($.input.receivedAt, "YYYY-MM-DD HH:mm:ss")', description: 'Format a date value.' },
  { name: 'toNumber', snippet: 'toNumber($.input.value)', description: 'Convert value to number.' },
  { name: 'round', snippet: 'round($.input.value, 2)', description: 'Round number to decimals.' },
  { name: 'contains', snippet: 'contains($.input.status, "alarm")', description: 'Check whether text contains keyword.' },
  { name: 'default', snippet: 'default($.input.deviceId, "UNKNOWN")', description: 'Fallback when value is empty.' },
  { name: 'upper', snippet: 'upper($.input.name)', description: 'Uppercase text.' },
  { name: 'lower', snippet: 'lower($.input.name)', description: 'Lowercase text.' },
];
const workflowFunctionNames = new Set(workflowFunctionHelpers.map((helper) => helper.name));
const workflowFunctionArity: Record<string, [number, number]> = {
  now: [0, 0],
  formatDate: [1, 2],
  toNumber: [1, 1],
  round: [1, 2],
  contains: [2, 2],
  default: [2, 2],
  upper: [1, 1],
  lower: [1, 1],
};

const splitWorkflowFunctionArgs = (argsText = '') => {
  const args: string[] = [];
  let current = '';
  let quote = '';
  let depth = 0;
  for (let index = 0; index < argsText.length; index += 1) {
    const char = argsText[index];
    const previous = argsText[index - 1];
    if (quote) {
      current += char;
      if (char === quote && previous !== '\\') quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim() || argsText.trim()) args.push(current.trim());
  return args;
};

const parseWorkflowFunctionCall = (expression: string) => {
  const match = String(expression || '').trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\(([\s\S]*)\)$/);
  if (!match) return null;
  return { name: match[1], args: splitWorkflowFunctionArgs(match[2]) };
};

const weekDayOptions = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const padTimePart = (value: number) => String(value).padStart(2, '0');

const parseScheduleTime = (value = '08:00') => {
  const [rawHour, rawMinute] = String(value || '08:00').split(':');
  const hour = Math.max(0, Math.min(Number(rawHour) || 0, 23));
  const minute = Math.max(0, Math.min(Number(rawMinute) || 0, 59));
  return { hour, minute };
};

const buildCronFromScheduleConfig = (config: Record<string, any>) => {
  const mode = config.scheduleMode || 'custom';
  const everyValue = Math.max(1, Math.min(Number(config.everyValue || 1) || 1, 999));
  const { hour, minute } = parseScheduleTime(config.time || '08:00');
  if (mode === 'every') {
    return config.everyUnit === 'hours'
      ? `${minute} */${everyValue} * * *`
      : `*/${Math.min(everyValue, 59)} * * * *`;
  }
  if (mode === 'daily') return `${minute} ${hour} * * *`;
  if (mode === 'weekly') {
    const weekdays = Array.isArray(config.weekdays) && config.weekdays.length > 0 ? config.weekdays : [1];
    return `${minute} ${hour} * * ${weekdays.join(',')}`;
  }
  if (mode === 'monthly') {
    const monthDay = Math.max(1, Math.min(Number(config.monthDay || 1) || 1, 31));
    return `${minute} ${hour} ${monthDay} * *`;
  }
  return String(config.crontab || '0 * * * *');
};

const cronFieldMatchesEditor = (field: string, value: number) => {
  const part = String(field || '*').trim();
  if (part === '*') return true;
  if (part.includes(',')) return part.split(',').some((item) => cronFieldMatchesEditor(item, value));
  if (part.startsWith('*/')) {
    const interval = Number(part.slice(2));
    return Number.isInteger(interval) && interval > 0 && value % interval === 0;
  }
  if (part.includes('-')) {
    const [start, end] = part.split('-').map(Number);
    return Number.isInteger(start) && Number.isInteger(end) && start <= value && value <= end;
  }
  return Number(part) === value;
};

const validateCronExpressionEditor = (expression: string) => {
  const parts = String(expression || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 5) return false;
  const ranges: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  const fieldIsValid = (field: string, min: number, max: number): boolean => {
    const part = String(field || '').trim();
    if (!part) return false;
    if (part === '*') return true;
    if (part.includes(',')) return part.split(',').every((item) => fieldIsValid(item, min, max));
    if (part.startsWith('*/')) {
      const interval = Number(part.slice(2));
      return Number.isInteger(interval) && interval >= 1 && interval <= Math.max(1, max - min + 1);
    }
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      return Number.isInteger(start) && Number.isInteger(end) && start >= min && end <= max && start <= end;
    }
    const value = Number(part);
    return Number.isInteger(value) && value >= min && value <= max;
  };
  return parts.every((part, index) => fieldIsValid(part, ranges[index][0], ranges[index][1]));
};

const cronMatchesDateEditor = (expression: string, date: Date) => {
  if (!validateCronExpressionEditor(expression)) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = String(expression).trim().split(/\s+/);
  return cronFieldMatchesEditor(minute, date.getMinutes())
    && cronFieldMatchesEditor(hour, date.getHours())
    && cronFieldMatchesEditor(dayOfMonth, date.getDate())
    && cronFieldMatchesEditor(month, date.getMonth() + 1)
    && (cronFieldMatchesEditor(dayOfWeek, date.getDay()) || (date.getDay() === 0 && cronFieldMatchesEditor(dayOfWeek, 7)));
};

const getNextCronRuns = (expression: string, count = 5) => {
  if (!validateCronExpressionEditor(expression)) return [];
  const runs: Date[] = [];
  const cursor = new Date();
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  const maxMinutes = 366 * 24 * 60;
  for (let index = 0; index < maxMinutes && runs.length < count; index += 1) {
    if (cronMatchesDateEditor(expression, cursor)) runs.push(new Date(cursor));
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return runs;
};

const resolveEditorReference = (
  reference: string,
  currentStep: WorkflowRunStep | null,
  run?: WorkflowRunLog | null,
) => {
  const match = String(reference || '').trim().match(/^\$\.(?:([A-Za-z0-9_$\u4e00-\u9fa5-]+)\.)?(input|output)(?:\.([A-Za-z0-9_$\u4e00-\u9fa5.-]+))?$/);
  if (!match) return undefined;
  const [, nodeName, section, pathExpression] = match;
  const sourceStep = nodeName
    ? (run?.steps || []).find((step) => step.nodeName === nodeName || step.nodeId === nodeName)
    : currentStep;
  if (!sourceStep) return undefined;
  return getPathValue(section === 'input' ? sourceStep.input : sourceStep.output, pathExpression || '');
};

const formatEditorDate = (value: unknown, format = 'iso') => {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number: number) => String(number).padStart(2, '0');
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };
  if (format === 'iso') return date.toISOString();
  if (format === 'date') return `${tokens.YYYY}-${tokens.MM}-${tokens.DD}`;
  if (format === 'time') return `${tokens.HH}:${tokens.mm}:${tokens.ss}`;
  return String(format).replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => tokens[token]);
};

const evaluateEditorFunction = (name: string, args: unknown[]) => {
  switch (name) {
    case 'now':
      return new Date().toISOString();
    case 'formatDate':
      return formatEditorDate(args[0], String(args[1] || 'iso'));
    case 'toNumber': {
      const number = Number(args[0]);
      return Number.isFinite(number) ? number : 0;
    }
    case 'round': {
      const decimals = Math.max(0, Math.min(Number(args[1] ?? 0) || 0, 10));
      const factor = 10 ** decimals;
      return Math.round((Number(args[0]) || 0) * factor) / factor;
    }
    case 'contains':
      return String(args[0] ?? '').includes(String(args[1] ?? ''));
    case 'default':
      return args[0] === undefined || args[0] === null || args[0] === '' ? args[1] : args[0];
    case 'upper':
      return String(args[0] ?? '').toUpperCase();
    case 'lower':
      return String(args[0] ?? '').toLowerCase();
    default:
      return undefined;
  }
};

const resolveEditorExpressionValue = (
  expression: string,
  currentStep: WorkflowRunStep | null,
  run?: WorkflowRunLog | null,
): unknown => {
  const trimmed = String(expression || '').trim();
  const wholeReference = resolveEditorReference(trimmed, currentStep, run);
  if (wholeReference !== undefined) return wholeReference;
  const call = parseWorkflowFunctionCall(trimmed);
  if (call && workflowFunctionNames.has(call.name)) {
    const args = call.args.map((arg) => {
      const value = arg.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
      if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
      if (value === 'true') return true;
      if (value === 'false') return false;
      if (value === 'null') return null;
      const directReference = resolveEditorReference(value, currentStep, run);
      if (directReference !== undefined) return directReference;
      if (/^\$\.(?:([A-Za-z0-9_$\u4e00-\u9fa5-]+)\.)?(input|output)(?:\.([A-Za-z0-9_$\u4e00-\u9fa5.-]+))?$/.test(value)) return undefined;
      const nested = resolveEditorExpressionValue(value, currentStep, run);
      return nested === undefined ? value : nested;
    });
    return evaluateEditorFunction(call.name, args);
  }
  return undefined;
};

const previewEditorExpression = (
  expression: unknown,
  currentStep: WorkflowRunStep | null,
  run?: WorkflowRunLog | null,
) => {
  if (typeof expression !== 'string' || (!expression.includes('$.') && !expression.includes('('))) return null;
  const whole = resolveEditorExpressionValue(expression, currentStep, run);
  if (whole !== undefined) return whole;
  return expression.replace(workflowReferenceTokenRegex, (match) => {
    const value = resolveEditorReference(match, currentStep, run);
    if (value === undefined || value === null) return match;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }).replace(/\b(now|formatDate|toNumber|round|contains|default|upper|lower)\(([^()]*)\)/g, (match) => {
    const value = resolveEditorExpressionValue(match, currentStep, run);
    if (value === undefined || value === null) return match;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
};

const getUnresolvedEditorReferences = (
  expression: unknown,
  currentStep: WorkflowRunStep | null,
  run?: WorkflowRunLog | null,
) => {
  if (typeof expression !== 'string' || !expression.includes('$.')) return [];
  const matches = Array.from(expression.matchAll(workflowReferenceTokenRegex)).map((match) => match[0]);
  return matches.filter((reference, index, items) => (
    items.indexOf(reference) === index && resolveEditorReference(reference, currentStep, run) === undefined
  ));
};

const getEditorFunctionIssues = (expression: unknown) => {
  if (typeof expression !== 'string' || !expression.includes('(')) return [];
  const issues: string[] = [];
  const matches = Array.from(expression.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\(([^()]*)\)/g));
  matches.forEach((match) => {
    const name = match[1];
    if (!workflowFunctionNames.has(name)) {
      if (expression.includes('$.')) issues.push(`Unknown function: ${name}()`);
      return;
    }
    const args = splitWorkflowFunctionArgs(match[2]);
    const [minArgs, maxArgs] = workflowFunctionArity[name] || [0, 99];
    if (args.length < minArgs || args.length > maxArgs) {
      issues.push(`${name}() expects ${minArgs === maxArgs ? minArgs : `${minArgs}-${maxArgs}`} argument(s), got ${args.length}`);
    }
  });
  return issues.filter((issue, index, items) => items.indexOf(issue) === index);
};

const getActionIcon = (type: string) => {
  switch (type) {
    case 'whatsapp': return <MessageCircle className="h-5 w-5 text-emerald-500" />;
    case 'email': return <Mail className="h-5 w-5 text-blue-500" />;
    case 'ticket': return <Ticket className="h-5 w-5 text-purple-500" />;
    case 'start_backup': return <Power className="h-5 w-5 text-orange-500" />;
    case 'stop_device': return <PowerOff className="h-5 w-5 text-red-500" />;
    case 'device_control': return <Settings2 className="h-5 w-5 text-orange-500" />;
    case 'webhook': return <Globe className="h-5 w-5 text-indigo-500" />;
    case 'access': return <KeyRound className="h-5 w-5 text-orange-500" />;
    case 'nfc_access': return <KeyRound className="h-5 w-5 text-cyan-500" />;
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
    case 'run_workflow': return <Route className="h-5 w-5 text-orange-500" />;
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
  threshold: { device: '', metric: 'temperature', condition: '>', value: 10, duration: '5m', cooldown: '60s', dedupeKey: '$.input.event.deviceId' },
  offline: { device: '', duration: '10m', cooldown: '10m', dedupeKey: '$.input.event.deviceId' },
  alert: { device: '', severity: 'critical', cooldown: '5m', dedupeKey: '$.input.event.deviceId' },
  schedule: { device: '', scheduleMode: 'every', everyValue: 1, everyUnit: 'hours', time: '08:00', weekdays: [1], monthDay: 1, crontab: '0 */1 * * *', cooldown: '0s', dedupeKey: '' },
  ai: { device: '', anomalyType: 'all', cooldown: '5m', dedupeKey: '$.input.event.deviceId' },
  webhook: { device: '', endpoint: '/api/v1/webhook/', cooldown: '0s', dedupeKey: '' },
  access: { accessId: '', cooldown: '0s', dedupeKey: '$.input.event.credentialId' },
  nfc_access: { accessId: '', cooldown: '0s', dedupeKey: '$.input.event.credentialId' },
  mqtt_message: { device: '', topic: 'sensors/+/data', payload_match: '{"status":"alert"}', cooldown: '30s', dedupeKey: '$.input.event.message.topic' },
  whatsapp: { target: '+1234567890', message: 'Alert triggered!' },
  email: { to: 'admin@factory.com', subject: 'Alert Notification' },
  ticket: { priority: 'high', assignee: 'maintenance' },
  start_backup: { target: '' },
  stop_device: { target: '' },
  device_control: { deviceSource: 'static', device: '', deviceExpression: '$.access_trigger.output.params.deviceId', controlId: '', value: '', parameterName: '', parameters: {} },
  report: { frequency: 'weekly', recipient: 'manager@factory.com' },
  ai_analyze: { prompt: 'Analyze possible causes for the event.' },
  delay: { duration: '60s' },
  mqtt_publish: { target: '', topic: 'control/device', payload: '{"cmd":"stop"}' },
  notification: { message: 'Alert triggered!' },
  debug: { expression: '', label: 'Debug snapshot' },
  set: { assignments: '{\n  "payload.status": "processed"\n}', mergeMode: 'merge' },
  function: { code: 'return { ...input.event, processedAt: new Date().toISOString() };' },
  run_workflow: { workflowSource: 'static', workflowId: '', triggerId: '', payloadSource: 'json', payloadJson: '{\n  "event": "$.input.event",\n  "previous": "$.input.previous"\n}', payloadExpression: '$.input', maxDepth: 5 },
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

const multilineConfigKeys = new Set(['assignments', 'code', 'rules', 'headers', 'body', 'mappings', 'payload', 'payloadJson', 'expression']);
const selectConfigOptions: Record<string, string[]> = {
  method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  mergeMode: ['merge', 'replace'],
  workflowSource: ['static', 'expression'],
  payloadSource: ['json', 'expression'],
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

function AccessSelect({ value, onChange, accesses }: { value: string; onChange: (val: string) => void; accesses: AccessDefinition[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = accesses.filter((access) => (
    access.name.toLowerCase().includes(normalizedSearch) ||
    access.id.toLowerCase().includes(normalizedSearch) ||
    access.method.toLowerCase().includes(normalizedSearch)
  ));
  const selected = accesses.find((access) => access.id === value);

  useEffect(() => {
    const handleClick = () => setIsOpen(false);
    if (isOpen) window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [isOpen]);

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="block w-full rounded-md border-0 py-2 pl-3 pr-10 text-left text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
      >
        {selected ? selected.name : 'Any Access'}
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-20 mx-auto mt-1 max-h-64 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm dark:bg-slate-800 dark:ring-slate-700">
          <div className="sticky top-0 z-10 bg-white px-3 py-2 dark:bg-slate-800">
            <input
              type="text"
              className="block w-full rounded-md border-0 py-1.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm sm:leading-6 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
              placeholder="Search access..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div
            className={cn("relative cursor-default select-none py-2 pl-3 pr-9 hover:bg-orange-50 dark:hover:bg-slate-700", !value && "bg-orange-50 dark:bg-slate-700")}
            onClick={() => { onChange(''); setIsOpen(false); }}
          >
            <div className="font-medium text-slate-800 dark:text-slate-100">Any Access</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Trigger when any enabled Access is used.</div>
          </div>
          {filtered.map((access) => (
            <div
              key={access.id}
              className={cn("relative cursor-default select-none py-2 pl-3 pr-9 hover:bg-orange-50 dark:hover:bg-slate-700", value === access.id && "bg-orange-50 dark:bg-slate-700")}
              onClick={() => { onChange(access.id); setIsOpen(false); }}
            >
              <div className="flex items-center gap-2">
                <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", access.enabled ? "bg-emerald-500" : "bg-slate-400")} />
                <span className={cn("block truncate", value === access.id ? "font-semibold" : "font-medium")}>
                  {access.name}
                </span>
              </div>
              <div className="mt-0.5 truncate pl-4 text-xs text-slate-500 dark:text-slate-400">
                {access.id} · {access.method.toUpperCase()}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
              No access entries found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkflowEditor({ workflowId, onBack }: WorkflowEditorProps) {
  const { language, workflows, addWorkflow, updateWorkflow, devices, accesses, currentUser } = useAppStore();
  const t = translations[language];
  const isNew = workflowId === 'new';

  const [draft, setDraft] = useState<Workflow>({
    id: `wf-${Date.now()}`,
    name: 'New Workflow',
    description: '',
    enabled: true,
    draftVersion: 0,
    publishedVersion: 0,
    runAlerting: {
      enabled: false,
      notifyOnFailure: true,
      consecutiveFailures: 3,
      failureRatePercent: 50,
      failureRateWindow: 10,
      avgDurationMs: 0,
      timeoutMs: 30000,
      cooldownMinutes: 10,
      notifySystem: true,
      notifyChannels: false,
    },
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
  const [selectedNodeDraft, setSelectedNodeDraft] = useState<WorkflowNode | null>(null);
  const [nodeSettingsDirty, setNodeSettingsDirty] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishNotes, setPublishNotes] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedVersionNumber, setSelectedVersionNumber] = useState<number | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationIssues, setValidationIssues] = useState<WorkflowValidationIssue[]>([]);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationSource, setValidationSource] = useState<'manual' | 'publish'>('manual');
  const [showNodeSearch, setShowNodeSearch] = useState(false);
  const [nodeSearchQuery, setNodeSearchQuery] = useState('');
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [workflowLogs, setWorkflowLogs] = useState<WorkflowRunLog[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const [showDryRun, setShowDryRun] = useState(false);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunError, setDryRunError] = useState('');
  const [dryRunTriggerId, setDryRunTriggerId] = useState('');
  const [dryRunEventText, setDryRunEventText] = useState('');
  const [nodeTestLoading, setNodeTestLoading] = useState(false);
  const [nodeTestError, setNodeTestError] = useState('');
  const [nodeTestStep, setNodeTestStep] = useState<WorkflowRunStep | null>(null);
  const [variablePicker, setVariablePicker] = useState<{ nodeId: string; key: string } | null>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimerRef = useRef<number | null>(null);

  const triggerNodes = draft.nodes.filter(n => n.type === 'trigger');
  const otherNodes = draft.nodes.filter(n => n.type !== 'trigger');
  const selectedRun = useMemo(
    () => workflowLogs.find((run) => run.id === selectedRunId) || workflowLogs[0] || null,
    [workflowLogs, selectedRunId]
  );
  const selectedNodeLastLog = useMemo(() => {
    if (!selectedNodeId) return null;
    for (const run of workflowLogs) {
      const step = (run.steps || []).find((item) => item.nodeId === selectedNodeId);
      if (step) return {run, step};
    }
    return null;
  }, [workflowLogs, selectedNodeId]);
  const runAlerting = {
    enabled: false,
    notifyOnFailure: true,
    consecutiveFailures: 3,
    failureRatePercent: 50,
    failureRateWindow: 10,
    avgDurationMs: 0,
    timeoutMs: 30000,
    cooldownMinutes: 10,
    notifySystem: true,
    notifyChannels: false,
    ...(draft.runAlerting || {}),
  };
  const cloneWorkflowNode = (node: WorkflowNode): WorkflowNode => JSON.parse(JSON.stringify(node));

  const isTriggerOnly = showSelector.isTriggerSelect || (showSelector.insertIndex === 0 && triggerNodes.length === 0);
  const isAfterTriggers = showSelector.insertIndex === triggerNodes.length;
  const showConditions = !isTriggerOnly && !showSelector.actionGroupId;

  const availableConditionTypes = Object.keys(t.workflows.conditionTypes);
  const branchConditionTypes = new Set(['if', 'elif', 'else', 'switch', 'case', 'default']);
  const branchRootTypes = new Set(['if', 'switch']);
  const terminalBranchTypes = new Set(['else', 'default']);
  const getBranchFamily = (type: string) => (['switch', 'case', 'default'].includes(type) ? 'switch' : 'if');
  const conditionTypesForSelector = showSelector.allowedConditionTypes || availableConditionTypes.filter((type) => !['elif', 'else', 'case', 'default'].includes(type));
  const triggerTypesForSelector = Array.from(new Set([...Object.keys(t.workflows.triggerTypes), 'access', 'nfc_access']));

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

  const loadWorkflowLogs = async () => {
    setLogsLoading(true);
    setLogsError('');
    try {
      const response = await fetch(`/api/workflow-runs?workflowId=${encodeURIComponent(draft.id)}&limit=50`);
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

  const clearWorkflowLogs = async () => {
    if (!(await confirmDelete({
      title: 'Clear workflow logs',
      itemName: draft.name || 'this workflow',
      description: 'All saved execution logs for this workflow will be removed.',
      confirmLabel: 'Clear Logs',
    }))) return;
    setLogsLoading(true);
    setLogsError('');
    try {
      const response = await fetch(`/api/workflow-runs?workflowId=${encodeURIComponent(draft.id)}`, { method: 'DELETE' });
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

  useEffect(() => {
    if (showLogs && workflowLogs.length === 0) loadWorkflowLogs();
  }, [showLogs, draft.id]);

  useEffect(() => {
    if (selectedNodeId) loadWorkflowLogs();
  }, [selectedNodeId, draft.id]);

  useEffect(() => {
    const node = draft.nodes.find((item) => item.id === selectedNodeId);
    setSelectedNodeDraft(node ? cloneWorkflowNode(node) : null);
    setNodeSettingsDirty(false);
    setNodeTestError('');
    setNodeTestStep(null);
    setVariablePicker(null);
  }, [selectedNodeId]);

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

  const versionHistory = useMemo(
    () => [...(draft.versionHistory || [])].sort((a, b) => b.version - a.version),
    [draft.versionHistory]
  );
  const selectedVersion = versionHistory.find((version) => version.version === selectedVersionNumber) || versionHistory[0] || null;

  const cloneWorkflowNodes = (nodes: WorkflowNode[] = []) => JSON.parse(JSON.stringify(nodes)) as WorkflowNode[];
  const cloneWorkflowEdges = (edges: WorkflowEdge[] = []) => JSON.parse(JSON.stringify(edges)) as WorkflowEdge[];

  const summarizeWorkflowNodes = (nodes: WorkflowNode[] = []) => ({
    nodeCount: nodes.length,
    triggerCount: nodes.filter((node) => node.type === 'trigger').length,
    conditionCount: nodes.filter((node) => node.type === 'condition').length,
    actionCount: nodes.filter((node) => node.type === 'action').length,
  });

  const createVersionSnapshot = (
    workflow: Workflow,
    version: number,
    publishedAt: string,
    notes: string
  ): WorkflowVersionSnapshot => {
    const summary = summarizeWorkflowNodes(workflow.nodes);
    return {
      version,
      publishedAt,
      publishedBy: currentUser?.name || currentUser?.email || 'Unknown User',
      notes: notes.trim(),
      name: workflow.name,
      description: workflow.description,
      nodes: cloneWorkflowNodes(workflow.nodes),
      edges: cloneWorkflowEdges(workflow.edges || []),
      ...summary,
    };
  };

  const getNodeCompareKey = (node: WorkflowNode) => node.id || node.name || `${node.type}:${node.config?.type}`;
  const compareDraftToVersion = (version: WorkflowVersionSnapshot | null) => {
    const currentNodes = draft.nodes || [];
    const previousNodes = version?.nodes || [];
    const currentMap = new Map(currentNodes.map((node) => [getNodeCompareKey(node), node]));
    const previousMap = new Map(previousNodes.map((node) => [getNodeCompareKey(node), node]));
    const added = currentNodes.filter((node) => !previousMap.has(getNodeCompareKey(node)));
    const removed = previousNodes.filter((node) => !currentMap.has(getNodeCompareKey(node)));
    const changed = currentNodes.filter((node) => {
      const previous = previousMap.get(getNodeCompareKey(node));
      return previous && JSON.stringify(previous) !== JSON.stringify(node);
    });

    return {
      draft: summarizeWorkflowNodes(currentNodes),
      version: summarizeWorkflowNodes(previousNodes),
      added,
      removed,
      changed,
    };
  };

  const formatNodeLabel = (node: WorkflowNode) => `${node.name || node.config?.type || node.id} (${node.type})`;
  const selectedVersionCompare = compareDraftToVersion(selectedVersion);
  const validationSummary = validationIssues.reduce((acc, issue) => {
    if (issue.severity === 'error') acc.errors += 1;
    else if (issue.severity === 'warning') acc.warnings += 1;
    else acc.info += 1;
    return acc;
  }, { errors: 0, warnings: 0, info: 0 });
  const validationCanPublish = validationSource === 'publish' && validationSummary.errors === 0 && validationIssues.length > 0;

  const severityClassName = (severity: WorkflowValidationIssue['severity']) => {
    switch (severity) {
      case 'error':
        return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300';
      case 'warning':
        return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300';
      default:
        return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300';
    }
  };

  const focusValidationIssue = (issue: WorkflowValidationIssue) => {
    if (!issue.nodeId) return;
    setSelectedNodeId(issue.nodeId);
    setShowValidationModal(false);
  };

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

  const buildWorkflowForSave = (publish = false, notes = ''): Workflow => {
    const usedNames = new Set<string>();
    let currentBranchRootName = '';
    const sourceNodes = selectedNodeDraft
      ? draft.nodes.map((node) => node.id === selectedNodeDraft.id ? selectedNodeDraft : node)
      : draft.nodes;
    const namedNodes = sourceNodes.map((node) => {
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
    const now = new Date().toISOString();
    const draftVersion = Number(draft.draftVersion || 0) + 1;
    const baseWorkflow: Workflow = { ...draft, nodes: namedNodes, edges: buildWorkflowEdges(), draftVersion, updatedAt: now };
    if (!publish) return baseWorkflow;
    const versionSnapshot = createVersionSnapshot(baseWorkflow, draftVersion, now, notes);
    const versionHistory = [
      ...(draft.versionHistory || []).filter((version) => version.version !== draftVersion),
      versionSnapshot,
    ].sort((a, b) => a.version - b.version);

    return {
      ...baseWorkflow,
      publishedVersion: draftVersion,
      publishedAt: now,
      versionHistory,
      publishedSnapshot: {
        name: versionSnapshot.name,
        description: versionSnapshot.description,
        nodes: versionSnapshot.nodes,
        edges: versionSnapshot.edges,
      },
    };
  };

  const persistWorkflowDraft = (workflowToSave: Workflow, message: string) => {
    if (isNew) {
      addWorkflow(workflowToSave);
    } else {
      updateWorkflow(draft.id, workflowToSave);
    }
    notifySuccess(message);
    onBack();
  };

  const handleSave = () => {
    persistWorkflowDraft(buildWorkflowForSave(false), 'Workflow draft saved successfully.');
  };

  const validateWorkflow = async (source: 'manual' | 'publish' = 'manual') => {
    setValidationLoading(true);
    setValidationSource(source);
    try {
      const response = await fetch('/api/workflows/validate', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({ workflow: buildWorkflowForSave(false) }),
      });
      const payload = await response.json();
      const issues = Array.isArray(payload.issues) ? payload.issues : [];
      setValidationIssues(issues);
      if (!response.ok) throw new Error(payload.error || 'Workflow validation failed.');
      if (source === 'manual' || issues.length > 0) setShowValidationModal(true);
      if (source === 'manual' && issues.length === 0) notifySuccess('Workflow validation passed.');
      return issues as WorkflowValidationIssue[];
    } catch (error) {
      const issue = {
        id: `validation-${Date.now()}`,
        severity: 'error' as const,
        code: 'validation.request_failed',
        message: error instanceof Error ? error.message : 'Workflow validation failed.',
      };
      setValidationIssues([issue]);
      setShowValidationModal(true);
      return [issue];
    } finally {
      setValidationLoading(false);
    }
  };

  const handlePublish = () => {
    setPublishNotes('');
    setShowPublishModal(true);
  };

  const publishWithoutValidation = () => {
    persistWorkflowDraft(buildWorkflowForSave(true, publishNotes), 'Workflow version published successfully.');
    setShowPublishModal(false);
    setShowValidationModal(false);
    setPublishNotes('');
  };

  const confirmPublish = async () => {
    const issues = await validateWorkflow('publish');
    const hasErrors = issues.some((issue) => issue.severity === 'error');
    const hasWarnings = issues.some((issue) => issue.severity === 'warning');
    if (hasErrors || hasWarnings) return;
    publishWithoutValidation();
  };

  const openVersionHistory = () => {
    setSelectedVersionNumber(versionHistory[0]?.version || null);
    setShowVersionHistory(true);
  };

  const rollbackVersionToDraft = async (version: WorkflowVersionSnapshot) => {
    if (!(await confirmDelete({
      title: `Restore version v${version.version} to draft`,
      itemName: draft.name || 'this workflow',
      description: 'The current editor draft will be replaced with this published snapshot. Existing published production version will not change until you publish again.',
      confirmLabel: 'Restore Draft',
    }))) return;
    const now = new Date().toISOString();
    setDraft({
      ...draft,
      name: version.name,
      description: version.description,
      nodes: cloneWorkflowNodes(version.nodes),
      edges: cloneWorkflowEdges(version.edges || []),
      draftVersion: Number(draft.draftVersion || 0) + 1,
      updatedAt: now,
    });
    setSelectedNodeId(null);
    setSelectedNodeDraft(null);
    notifySuccess(`Version v${version.version} restored into draft. Save or publish to keep it.`);
  };

  const getActionLabel = (type: string) => {
    if (type === 'access') return 'Access Trigger';
    if (type === 'nfc_access') return 'NFC Trigger';
    return (t.workflows.actionTypes as any)[type] || (t.workflows.conditionTypes as any)[type] || (t.workflows.triggerTypes as any)[type] || type;
  };

  const getNodeSearchText = (node: WorkflowNode) => {
    const config = node.config || {};
    const device = devices.find((item) => [config.device, config.target, config.deviceExpression].includes(item.id));
    const access = accesses.find((item) => item.id === config.accessId);
    return [
      node.id,
      node.name,
      node.type,
      config.type,
      getActionLabel(config.type),
      device?.id,
      device?.name,
      access?.id,
      access?.name,
      JSON.stringify(config),
    ].filter(Boolean).join(' ').toLowerCase();
  };

  const nodeSearchResults = useMemo(() => {
    const query = nodeSearchQuery.trim().toLowerCase();
    const nodes = draft.nodes.map((node, index) => ({ node, index, searchText: getNodeSearchText(node) }));
    if (!query) return nodes.slice(0, 12);
    return nodes.filter((item) => item.searchText.includes(query)).slice(0, 24);
  }, [draft.nodes, nodeSearchQuery, devices, accesses, language]);

  const focusNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setShowNodeSearch(false);
    setHighlightedNodeId(nodeId);
    window.requestAnimationFrame(() => {
      nodeRefs.current[nodeId]?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    });
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightedNodeId(null), 1800);
  };

  const updateNodeConfig = (nodeId: string, patch: Record<string, any>) => {
    if (selectedNodeDraft?.id === nodeId) {
      setSelectedNodeDraft({
        ...selectedNodeDraft,
        config: { ...selectedNodeDraft.config, ...patch },
      });
      setNodeSettingsDirty(true);
      return;
    }

    const newNodes = draft.nodes.map(n =>
      n.id === nodeId ? { ...n, config: { ...n.config, ...patch } } : n
    );
    setDraft({ ...draft, nodes: newNodes });
  };

  const updateRunAlerting = (patch: Partial<NonNullable<Workflow['runAlerting']>>) => {
    setDraft({
      ...draft,
      runAlerting: {
        ...runAlerting,
        ...patch,
      },
    });
  };

  const insertReferenceIntoConfig = (nodeId: string, key: string, reference: string) => {
    const targetNode = selectedNodeDraft?.id === nodeId
      ? selectedNodeDraft
      : draft.nodes.find((node) => node.id === nodeId);
    const currentValue = targetNode?.config?.[key];
    const nextValue = currentValue == null || currentValue === ''
      ? reference
      : `${String(currentValue)}${String(currentValue).endsWith(' ') ? '' : ' '}${reference}`;
    updateNodeConfig(nodeId, { [key]: nextValue });
    setVariablePicker(null);
  };

  const updateNodeDraft = (nodeId: string, patch: Partial<WorkflowNode>) => {
    if (selectedNodeDraft?.id === nodeId) {
      setSelectedNodeDraft({ ...selectedNodeDraft, ...patch });
      setNodeSettingsDirty(true);
      return;
    }

    setDraft({
      ...draft,
      nodes: draft.nodes.map((node) => node.id === nodeId ? { ...node, ...patch } : node),
    });
  };

  const saveNodeSettings = () => {
    if (!selectedNodeDraft) return;
    setDraft({
      ...draft,
      nodes: draft.nodes.map((node) => node.id === selectedNodeDraft.id ? selectedNodeDraft : node),
    });
    setNodeSettingsDirty(false);
    notifySuccess('Workflow node saved successfully.');
  };

  const resetNodeSettings = () => {
    const node = draft.nodes.find((item) => item.id === selectedNodeId);
    setSelectedNodeDraft(node ? cloneWorkflowNode(node) : null);
    setNodeSettingsDirty(false);
  };

  const testSelectedNode = async () => {
    if (!selectedNodeDraft) return;
    setNodeTestLoading(true);
    setNodeTestError('');
    setNodeTestStep(null);
    try {
      const testWorkflow = {
        ...buildWorkflowForSave(false),
      };
      const response = await fetch('/api/workflows/test-node', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          workflow: testWorkflow,
          nodeId: selectedNodeDraft.id,
          event: {
            message: {status: 'warning', temperature: 32, power: 1200},
            deviceId: devices[0]?.id || 'TEST-DEVICE',
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Node test failed.');
      setNodeTestStep(payload.step);
      notifySuccess('Workflow node test completed.');
    } catch (error) {
      setNodeTestError(error instanceof Error ? error.message : 'Node test failed.');
    } finally {
      setNodeTestLoading(false);
    }
  };

  const createDryRunSampleEvent = (triggerType = 'threshold') => {
    const deviceId = devices[0]?.id || 'DEV-001';
    const base = {
      receivedAt: new Date().toISOString(),
      deviceId,
      message: {
        temperature: 86,
        power: 1450,
        status: 'warning',
      },
    };
    if (triggerType === 'access' || triggerType === 'nfc_access') {
      return {
        type: 'access',
        source: triggerType === 'nfc_access' ? 'nfc' : 'qr',
        params: { deviceId, credentialGroups: ['operators'] },
        accessId: accesses[0]?.id || 'access-demo',
        accessName: accesses[0]?.name || 'Demo Access',
        credentialId: 'credential-demo',
        credentialName: triggerType === 'nfc_access' ? 'NFC-DEMO' : 'QR-DEMO',
        credentialGroups: ['operators'],
        receivedAt: base.receivedAt,
      };
    }
    if (triggerType === 'mqtt_message') {
      return {
        ...base,
        type: 'telemetry',
        source: 'mqtt:dry-run',
        topic: `devices/${deviceId}/telemetry`,
        message: {
          device_id: deviceId,
          temperature: 86,
          power: 1450,
          status: 'alert',
        },
      };
    }
    if (triggerType === 'offline') {
      return {
        ...base,
        type: 'telemetry',
        source: 'offline:dry-run',
        status: 'offline',
        message: { status: 'offline' },
      };
    }
    if (triggerType === 'schedule') {
      return {
        type: 'schedule',
        source: 'schedule:dry-run',
        scheduledAt: base.receivedAt,
        message: {},
      };
    }
    if (triggerType === 'webhook') {
      return {
        type: 'webhook',
        source: 'webhook:dry-run',
        payload: { deviceId, status: 'warning', temperature: 86 },
        message: { deviceId, status: 'warning', temperature: 86 },
        receivedAt: base.receivedAt,
      };
    }
    return {
      ...base,
      type: 'telemetry',
      source: 'telemetry:dry-run',
    };
  };

  const applyDryRunSample = (triggerType: string) => {
    setDryRunEventText(JSON.stringify(createDryRunSampleEvent(triggerType), null, 2));
    const matchingTrigger = triggerNodes.find((node) => node.config?.type === triggerType) || triggerNodes[0];
    if (matchingTrigger) setDryRunTriggerId(matchingTrigger.id);
    setDryRunError('');
  };

  const openDryRun = () => {
    const trigger = triggerNodes[0];
    setDryRunTriggerId(trigger?.id || '');
    setDryRunEventText(JSON.stringify(createDryRunSampleEvent(trigger?.config?.type || 'threshold'), null, 2));
    setDryRunError('');
    setShowDryRun(true);
  };

  const runWorkflowDryRun = async () => {
    setDryRunLoading(true);
    setDryRunError('');
    try {
      const event = JSON.parse(dryRunEventText || '{}');
      const response = await fetch('/api/workflows/dry-run', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          workflow: buildWorkflowForSave(false),
          triggerId: dryRunTriggerId,
          event,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Workflow dry run failed.');
      setWorkflowLogs([payload.run]);
      setSelectedRunId(payload.run.id);
      setShowDryRun(false);
      setShowLogs(true);
      notifySuccess('Workflow dry run completed.');
    } catch (error) {
      setDryRunError(error instanceof Error ? error.message : 'Workflow dry run failed.');
    } finally {
      setDryRunLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isModifier = event.ctrlKey || event.metaKey;
      if (isModifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowNodeSearch(true);
        setNodeSearchQuery('');
        return;
      }
      if (isModifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSave();
        return;
      }
      if (isModifier && event.key === 'Enter') {
        event.preventDefault();
        openDryRun();
        return;
      }
      if (event.key === 'Escape') {
        if (showNodeSearch) setShowNodeSearch(false);
        else if (showSelector.show) setShowSelector({ show: false, insertIndex: 0 });
        else if (showDryRun) setShowDryRun(false);
        else if (showValidationModal) setShowValidationModal(false);
        else if (showPublishModal) setShowPublishModal(false);
        else if (showVersionHistory) setShowVersionHistory(false);
        else if (showLogs) setShowLogs(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showNodeSearch, showSelector.show, showDryRun, showValidationModal, showPublishModal, showVersionHistory, showLogs, draft, selectedNodeDraft]);

  useEffect(() => () => {
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
  }, []);

  const buildWorkflowControlPatch = (deviceId: string, controlId?: string) => {
    const device = devices.find((item) => item.id === deviceId);
    const controls = getDeviceControlDefinitions(device);
    const control = controls.find((item) => item.id === controlId) || controls[0];
    if (!control) return { deviceSource: 'static', device: deviceId, controlId: '', value: '', parameterName: '', parameters: {} };

    const valueKey = control.valueType === 'parameter_group'
      ? ''
      : control.id;
    const controlValues = control.valueType === 'parameter_group'
      ? Object.fromEntries((control.fields || []).map((field) => [`${control.id}.${field.key}`, field.defaultValue ?? '']))
      : { [control.id]: control.defaultValue ?? (control.valueType === 'toggle' ? true : '') };
    const parameters = buildControlParameters(control, controlValues, 'parameter');

    return {
      device: deviceId,
      deviceSource: 'static',
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
        nodeConfig = { endpoint: createWebhookEndpoint(draft.id), expectedContent: '{"status": "error"}', cooldown: '0s', dedupeKey: '' };
      } else {
        nodeConfig = { endpoint: '/api/v1/webhook/' };
      }
    }

    const newNode: WorkflowNode = {
      id: `n-${Date.now()}`,
      name: ['access', 'nfc_access'].includes(type) && !draft.nodes.some((node) => node.name === (type === 'nfc_access' ? 'nfc_trigger' : 'access_trigger'))
        ? (type === 'nfc_access' ? 'nfc_trigger' : 'access_trigger')
        : getNodeDefaultName(type === 'access' ? 'access_trigger' : type === 'nfc_access' ? 'nfc_trigger' : type, draft.nodes),
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

  const deleteNode = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetNode = draft.nodes.find((node) => node.id === id);
    if (!(await confirmDelete({
      title: 'Delete workflow node',
      itemName: targetNode?.name || targetNode?.config?.type || 'this node',
      description: targetNode?.type === 'condition'
        ? 'Related branch nodes may also be removed.'
        : 'This node will be removed from the workflow graph.',
    }))) return;
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
        ref={(element) => {
          nodeRefs.current[node.id] = element;
        }}
        onClick={() => setSelectedNodeId(node.id)}
        className={cn(
          "w-80 shrink-0 rounded-xl border-2 p-4 flex items-center justify-between cursor-pointer transition-all bg-white dark:bg-[#1c2128] shadow-sm hover:shadow-md",
          isSelected ? "border-orange-500 ring-4 ring-orange-500/10 shadow-orange-500/10" : isTrigger ? "border-slate-200 dark:border-slate-700" : isCondition ? "border-indigo-200 dark:border-indigo-900/50" : isFlowControl ? "border-amber-200 dark:border-amber-500/30" : "border-slate-200 dark:border-slate-700",
          isTrigger && !isSelected && "border-orange-200 dark:border-orange-900/50",
          isCondition && !isSelected && !isLogic && "border-indigo-200 dark:border-indigo-900/50",
          isLogic && !isSelected && "border-purple-300 dark:border-purple-800",
          highlightedNodeId === node.id && "ring-4 ring-orange-400/60 shadow-lg shadow-orange-500/20 animate-pulse",
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
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="min-w-[12rem] flex-1 border-none bg-transparent p-0 text-base font-bold text-slate-900 placeholder:text-slate-400 focus:ring-0 dark:text-white sm:text-lg"
                  placeholder="Workflow Name"
                />
                <UnderDevelopmentBadge />
              </div>
              <input 
                type="text" 
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className="text-xs sm:text-sm font-medium bg-transparent border-none p-0 focus:ring-0 text-slate-500 dark:text-slate-400 placeholder:text-slate-300 dark:placeholder:text-slate-600 w-full"
                placeholder="Brief description of this workflow"
              />
              <div className="flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>Draft v{draft.draftVersion || 0}</span>
                <span>Published v{draft.publishedVersion || 0}</span>
                {draft.publishedAt && <span>{new Date(draft.publishedAt).toLocaleString()}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowNodeSearch(true);
                setNodeSearchQuery('');
              }}
              className="px-3 py-1.5 rounded-md border text-sm font-medium flex items-center gap-2 transition-colors bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Search className="h-4 w-4" />
              Search Nodes
            </button>
            <button
              type="button"
              onClick={openDryRun}
              className="px-3 py-1.5 rounded-md border text-sm font-medium flex items-center gap-2 transition-colors bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-500/20"
            >
              <Play className="h-4 w-4" />
              Dry Run
            </button>
            <button
              type="button"
              onClick={() => validateWorkflow('manual')}
              disabled={validationLoading}
              className="px-3 py-1.5 rounded-md border text-sm font-medium flex items-center gap-2 transition-colors bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-slate-700"
            >
              <AlertTriangle className={cn("h-4 w-4", validationLoading ? "text-slate-400" : "text-amber-500")} />
              {validationLoading ? 'Validating' : 'Validate'}
            </button>
            <button
              type="button"
              onClick={openVersionHistory}
              className="px-3 py-1.5 rounded-md border text-sm font-medium flex items-center gap-2 transition-colors bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <History className="h-4 w-4" />
              Versions
            </button>
            <button
              type="button"
              onClick={() => {
                setWorkflowLogs([]);
                setSelectedRunId('');
                setShowLogs(true);
              }}
              className="px-3 py-1.5 rounded-md border text-sm font-medium flex items-center gap-2 transition-colors bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <ListTree className="h-4 w-4" />
              Logs
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
              className="inline-flex items-center gap-x-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Save className="h-4 w-4" />
              Save Draft
            </button>
            <button
              onClick={handlePublish}
              className="inline-flex items-center gap-x-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 transition-colors"
            >
              <Save className="h-4 w-4" />
              Publish Version
            </button>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#151922] sm:px-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className={cn("h-4 w-4", runAlerting.enabled ? "text-orange-500" : "text-slate-400")} />
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Run Alerting</h2>
                  <span className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                    runAlerting.enabled
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400"
                  )}>
                    {runAlerting.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Notify operators when this workflow fails, runs too slowly, or crosses failure-rate thresholds.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={Boolean(runAlerting.enabled)}
                  onChange={(event) => updateRunAlerting({ enabled: event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900"
                />
                Enable alerting
              </label>
            </div>

            {runAlerting.enabled && (
              <div className="mt-4 grid gap-3 xl:grid-cols-6">
                <label className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={Boolean(runAlerting.notifyOnFailure)}
                      onChange={(event) => updateRunAlerting({ notifyOnFailure: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900"
                    />
                    Any failure
                  </span>
                  <span className="mt-2 block">Alert when a run status is failed.</span>
                </label>

                <label className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <span className="block font-semibold uppercase tracking-wider">Consecutive failures</span>
                  <input
                    type="number"
                    min={0}
                    value={runAlerting.consecutiveFailures || 0}
                    onChange={(event) => updateRunAlerting({ consecutiveFailures: Number(event.target.value || 0) })}
                    className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <span className="mt-1 block">0 disables this rule.</span>
                </label>

                <label className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <span className="block font-semibold uppercase tracking-wider">Failure rate %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={runAlerting.failureRatePercent || 0}
                    onChange={(event) => updateRunAlerting({ failureRatePercent: Number(event.target.value || 0) })}
                    className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <span className="mt-1 block">Measured over recent runs.</span>
                </label>

                <label className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <span className="block font-semibold uppercase tracking-wider">Rate window</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={runAlerting.failureRateWindow || 10}
                    onChange={(event) => updateRunAlerting({ failureRateWindow: Number(event.target.value || 10) })}
                    className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <span className="mt-1 block">Recent run count.</span>
                </label>

                <label className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <span className="block font-semibold uppercase tracking-wider">Avg duration ms</span>
                  <input
                    type="number"
                    min={0}
                    value={runAlerting.avgDurationMs || 0}
                    onChange={(event) => updateRunAlerting({ avgDurationMs: Number(event.target.value || 0) })}
                    className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <span className="mt-1 block">0 disables average duration.</span>
                </label>

                <label className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <span className="block font-semibold uppercase tracking-wider">Timeout ms</span>
                  <input
                    type="number"
                    min={0}
                    value={runAlerting.timeoutMs || 0}
                    onChange={(event) => updateRunAlerting({ timeoutMs: Number(event.target.value || 0) })}
                    className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <span className="mt-1 block">Alert when one run exceeds this.</span>
                </label>

                <label className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <span className="block font-semibold uppercase tracking-wider">Cooldown minutes</span>
                  <input
                    type="number"
                    min={0}
                    value={runAlerting.cooldownMinutes || 0}
                    onChange={(event) => updateRunAlerting({ cooldownMinutes: Number(event.target.value || 0) })}
                    className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <span className="mt-1 block">Avoid repeated alerts.</span>
                </label>

                <label className="flex min-h-[92px] items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={runAlerting.notifySystem !== false}
                    onChange={(event) => updateRunAlerting({ notifySystem: event.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900"
                  />
                  <span>
                    <span className="block font-semibold text-slate-700 dark:text-slate-200">System notification</span>
                    <span className="mt-2 block">Show in the top-right notification list.</span>
                  </span>
                </label>

                <label className="flex min-h-[92px] items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={Boolean(runAlerting.notifyChannels)}
                    onChange={(event) => updateRunAlerting({ notifyChannels: event.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900"
                  />
                  <span>
                    <span className="block font-semibold text-slate-700 dark:text-slate-200">Notification channels</span>
                    <span className="mt-2 block">Send to enabled Bark/Webhook channels.</span>
                  </span>
                </label>
              </div>
            )}
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
            {draft.nodes.map(originalNode => {
              if (originalNode.id !== selectedNodeId) return null;
              const node = selectedNodeDraft?.id === originalNode.id ? selectedNodeDraft : originalNode;
              const displayedStep = nodeTestStep || selectedNodeLastLog?.step || null;
              const displayedRunId = nodeTestStep ? 'Node test result' : selectedNodeLastLog?.run.id;
              const displayedStartedAt = nodeTestStep?.startedAt || selectedNodeLastLog?.run.startedAt || selectedNodeLastLog?.run.finishedAt;
              const referenceRun = selectedNodeLastLog?.run || null;
              const variableSources = [
                { label: 'Current Input', baseReference: '$.input', value: displayedStep?.input },
                { label: 'Current Output', baseReference: '$.output', value: displayedStep?.output },
                ...(referenceRun?.steps || []).flatMap((step) => {
                  const safeName = slugifyNodeName(step.nodeName || step.nodeId || '');
                  if (!safeName) return [];
                  return [
                    { label: `${safeName} input`, baseReference: `$.${safeName}.input`, value: step.input },
                    { label: `${safeName} output`, baseReference: `$.${safeName}.output`, value: step.output },
                  ];
                }),
              ].filter((source) => source.value !== undefined);
              const renderExpressionPreview = (value: unknown) => {
                const preview = previewEditorExpression(value, displayedStep, referenceRun);
                const unresolved = getUnresolvedEditorReferences(value, displayedStep, referenceRun);
                const functionIssues = getEditorFunctionIssues(value);
                if (preview === null && unresolved.length === 0 && functionIssues.length === 0) return null;
                return (
                  <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="mb-1 font-semibold text-slate-500 dark:text-slate-400">Preview</div>
                    {preview !== null && (
                      <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-700 dark:text-slate-200">{formatJsonValue(preview)}</pre>
                    )}
                    {unresolved.length > 0 && (
                      <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                        Unresolved: {unresolved.join(', ')}
                      </div>
                    )}
                    {functionIssues.length > 0 && (
                      <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                        Function: {functionIssues.join(', ')}
                      </div>
                    )}
                  </div>
                );
              };
              const renderVariablePicker = (key: string) => {
                if (variablePicker?.nodeId !== node.id || variablePicker.key !== key) return null;
                return (
                  <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50/60 p-2 dark:border-orange-500/30 dark:bg-orange-500/10">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-orange-700 dark:text-orange-300">Select a variable</div>
                      <button
                        type="button"
                        onClick={() => setVariablePicker(null)}
                        className="rounded p-1 text-orange-600 hover:bg-orange-100 dark:text-orange-300 dark:hover:bg-orange-500/20"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {variableSources.length === 0 ? (
                      <div className="rounded-md border border-dashed border-orange-200 bg-white/70 p-3 text-xs text-slate-500 dark:border-orange-500/30 dark:bg-slate-950/30 dark:text-slate-400">
                        Run Test Node or refresh logs to load available input/output variables.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {variableSources.map((source) => (
                          <div key={`${key}-${source.baseReference}`}>
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{source.label}</div>
                            <div className="max-h-72 overflow-auto rounded-md">
                              <JsonInspector
                                value={source.value}
                                baseReference={source.baseReference}
                                onReferenceSelect={(reference) => insertReferenceIntoConfig(node.id, key, reference)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 border-t border-orange-200 pt-2 dark:border-orange-500/20">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Function Helpers</div>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {workflowFunctionHelpers.map((helper) => (
                          <button
                            key={`${key}-${helper.name}`}
                            type="button"
                            onClick={() => insertReferenceIntoConfig(node.id, key, helper.snippet)}
                            className="rounded-md border border-orange-100 bg-white/80 px-2 py-1.5 text-left hover:border-orange-300 hover:bg-orange-100 dark:border-orange-500/20 dark:bg-slate-950/30 dark:hover:bg-orange-500/20"
                          >
                            <span className="block truncate font-mono text-[11px] font-semibold text-orange-700 dark:text-orange-300">{helper.snippet}</span>
                            <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">{helper.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              };
              
              return (
                <div key={node.id} className="space-y-6">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Node Test</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Runs this node with a sample event. Side-effect actions use dry-run mode.</p>
                      </div>
                      <button
                        type="button"
                        onClick={testSelectedNode}
                        disabled={nodeTestLoading}
                        className="inline-flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:cursor-default disabled:opacity-50 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20"
                      >
                        <Play className="h-3.5 w-3.5" />
                        {nodeTestLoading ? 'Testing...' : 'Test Node'}
                      </button>
                    </div>
                    {nodeSettingsDirty && (
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">The test will include the unsaved settings shown in this panel.</p>
                    )}
                    {nodeTestError && (
                      <p className="mt-2 text-xs text-red-600 dark:text-red-300">{nodeTestError}</p>
                    )}
                  </div>

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
                          updateNodeDraft(node.id, { name: newName });
                        }}
                        className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm sm:leading-6 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                      />
                    )}
                    <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                      Current node shortcuts: <span className="font-mono">$.input</span> / <span className="font-mono">$.output</span>. Full reference: <span className="font-mono">$.{node.type === 'condition' && ['elif', 'else', 'case', 'default'].includes(node.config.type) ? (getBranchRootName(node.id) || node.name || node.id) : (node.name || node.id)}.input</span> / <span className="font-mono">$.{node.type === 'condition' && ['elif', 'else', 'case', 'default'].includes(node.config.type) ? (getBranchRootName(node.id) || node.name || node.id) : (node.name || node.id)}.output</span>.
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
                    {node.config.type === 'schedule' ? (() => {
                      const scheduleMode = node.config.scheduleMode || 'custom';
                      const currentCron = scheduleMode === 'custom' ? node.config.crontab || '0 * * * *' : buildCronFromScheduleConfig(node.config);
                      const nextRuns = getNextCronRuns(currentCron, 5);
                      const updateScheduleConfig = (patch: Record<string, any>) => {
                        const nextConfig = { ...node.config, ...patch };
                        const nextCron = nextConfig.scheduleMode === 'custom'
                          ? nextConfig.crontab || node.config.crontab || '0 * * * *'
                          : buildCronFromScheduleConfig(nextConfig);
                        updateNodeConfig(node.id, { ...patch, crontab: nextCron });
                      };
                      const toggleWeekday = (day: number) => {
                        const current = Array.isArray(node.config.weekdays) ? node.config.weekdays : [1];
                        const next = current.includes(day)
                          ? current.filter((item: number) => item !== day)
                          : [...current, day].sort((a, b) => a - b);
                        updateScheduleConfig({ weekdays: next.length > 0 ? next : [day] });
                      };

                      return (
                        <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Schedule Mode</label>
                            <select
                              value={scheduleMode}
                              onChange={(event) => updateScheduleConfig({ scheduleMode: event.target.value })}
                              className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                            >
                              <option value="every">Every N minutes / hours</option>
                              <option value="daily">Daily at time</option>
                              <option value="weekly">Weekly on weekdays</option>
                              <option value="monthly">Monthly on day</option>
                              <option value="custom">Custom cron</option>
                            </select>
                          </div>

                          {scheduleMode === 'every' && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Every</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={node.config.everyUnit === 'hours' ? 23 : 59}
                                  value={node.config.everyValue || 1}
                                  onChange={(event) => updateScheduleConfig({ everyValue: Number(event.target.value) })}
                                  className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Unit</label>
                                <select
                                  value={node.config.everyUnit || 'hours'}
                                  onChange={(event) => updateScheduleConfig({ everyUnit: event.target.value })}
                                  className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                                >
                                  <option value="minutes">Minutes</option>
                                  <option value="hours">Hours</option>
                                </select>
                              </div>
                            </div>
                          )}

                          {(['daily', 'weekly', 'monthly'].includes(scheduleMode) || (scheduleMode === 'every' && node.config.everyUnit === 'hours')) && (
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                {scheduleMode === 'every' ? 'Run Minute' : 'Run Time'}
                              </label>
                              <input
                                type="time"
                                value={node.config.time || '08:00'}
                                onChange={(event) => updateScheduleConfig({ time: event.target.value })}
                                className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                              />
                            </div>
                          )}

                          {scheduleMode === 'weekly' && (
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Weekdays</label>
                              <div className="flex flex-wrap gap-2">
                                {weekDayOptions.map((day) => {
                                  const selected = (Array.isArray(node.config.weekdays) ? node.config.weekdays : [1]).includes(day.value);
                                  return (
                                    <button
                                      key={day.value}
                                      type="button"
                                      onClick={() => toggleWeekday(day.value)}
                                      className={cn(
                                        "rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors",
                                        selected
                                          ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"
                                          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400"
                                      )}
                                    >
                                      {day.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {scheduleMode === 'monthly' && (
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Day of Month</label>
                              <input
                                type="number"
                                min={1}
                                max={31}
                                value={node.config.monthDay || 1}
                                onChange={(event) => updateScheduleConfig({ monthDay: Number(event.target.value) })}
                                className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                              />
                            </div>
                          )}

                          {scheduleMode === 'custom' && (
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cron Expression</label>
                              <input
                                value={node.config.crontab || ''}
                                onChange={(event) => updateScheduleConfig({ crontab: event.target.value })}
                                placeholder="0 * * * *"
                                className="block w-full rounded-md border-0 py-2 font-mono text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                              />
                            </div>
                          )}

                          <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Generated Cron</span>
                              <code className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-orange-700 dark:bg-slate-900 dark:text-orange-300">{currentCron}</code>
                            </div>
                            {validateCronExpressionEditor(currentCron) ? (
                              <div className="mt-3 space-y-1">
                                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Next 5 runs</p>
                                {nextRuns.length > 0 ? nextRuns.map((run) => (
                                  <div key={run.toISOString()} className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                    {run.toLocaleString()}
                                  </div>
                                )) : (
                                  <div className="text-xs text-amber-600 dark:text-amber-300">No run found within one year.</div>
                                )}
                              </div>
                            ) : (
                              <div className="mt-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                                Invalid cron expression.
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })() : null}
                    {node.config.type === 'device_control' ? (() => {
                      const deviceSource = node.config.deviceSource || 'static';
                      const selectedDevice = deviceSource === 'static'
                        ? devices.find((device) => device.id === node.config.device)
                        : devices.find((device) => device.id === node.config.device || device.config?.externalDeviceId === node.config.device);
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
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Device Source</label>
                            <select
                              value={deviceSource}
                              onChange={(event) => updateNodeConfig(node.id, { deviceSource: event.target.value })}
                              className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                            >
                              <option value="static">Select / Enter Device ID</option>
                              <option value="expression">From workflow expression</option>
                            </select>
                          </div>

                          {deviceSource === 'expression' ? (
                            <div>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Device ID Expression</label>
                                <button
                                  type="button"
                                  onClick={() => setVariablePicker((current) => current?.nodeId === node.id && current.key === 'deviceExpression' ? null : { nodeId: node.id, key: 'deviceExpression' })}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  <Braces className="h-3 w-3" />
                                  Insert Variable
                                </button>
                              </div>
                              <input
                                value={node.config.deviceExpression || ''}
                                onChange={(event) => updateNodeConfig(node.id, { deviceExpression: event.target.value })}
                                placeholder="$.access_trigger.output.params.deviceId"
                                className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                              />
                              {renderVariablePicker('deviceExpression')}
                              {renderExpressionPreview(node.config.deviceExpression || '')}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Device</label>
                                <DeviceSelect
                                  value={devices.some((device) => device.id === node.config.device) ? node.config.device : ''}
                                  onChange={(deviceId) => updateNodeConfig(node.id, buildWorkflowControlPatch(deviceId))}
                                  devices={devices}
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Manual Device ID</label>
                                <input
                                  value={node.config.device || ''}
                                  onChange={(event) => updateNodeConfig(node.id, { device: event.target.value })}
                                  placeholder="Device ID or external device ID"
                                  className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                                />
                              </div>
                            </div>
                          )}

                          {deviceSource === 'expression' && (
                            <div>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Control Action ID</label>
                                <button
                                  type="button"
                                  onClick={() => setVariablePicker((current) => current?.nodeId === node.id && current.key === 'controlId' ? null : { nodeId: node.id, key: 'controlId' })}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  <Braces className="h-3 w-3" />
                                  Insert Variable
                                </button>
                              </div>
                              <input
                                value={node.config.controlId || ''}
                                onChange={(event) => updateNodeConfig(node.id, { controlId: event.target.value })}
                                placeholder="power_on, set_mode, set_pressure..."
                                className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                              />
                              {renderVariablePicker('controlId')}
                              {renderExpressionPreview(node.config.controlId || '')}
                            </div>
                          )}

                          {deviceSource === 'expression' && (
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Parameters JSON</label>
                              <textarea
                                value={JSON.stringify(node.config.parameters || {}, null, 2)}
                                onChange={(event) => {
                                  try {
                                    updateNodeConfig(node.id, { parameters: JSON.parse(event.target.value || '{}') });
                                  } catch {
                                    updateNodeConfig(node.id, { parametersText: event.target.value });
                                  }
                                }}
                                rows={4}
                                className="block w-full rounded-md border-0 py-2 font-mono text-xs text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                              />
                            </div>
                          )}

                          {deviceSource === 'static' && (
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
                          )}

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
                    {node.config.type === 'run_workflow' ? (() => {
                      const callableWorkflows = workflows.filter((workflow) => workflow.id !== draft.id);
                      const selectedWorkflow = callableWorkflows.find((workflow) => workflow.id === node.config.workflowId) || null;
                      const selectedWorkflowNodes = selectedWorkflow?.publishedSnapshot?.nodes || selectedWorkflow?.nodes || [];
                      const targetTriggers = selectedWorkflowNodes.filter((item) => item.type === 'trigger');
                      const payloadSource = node.config.payloadSource || 'json';
                      return (
                        <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Workflow Source</label>
                            <select
                              value={node.config.workflowSource || 'static'}
                              onChange={(event) => updateNodeConfig(node.id, { workflowSource: event.target.value })}
                              className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                            >
                              <option value="static">Select published workflow</option>
                              <option value="expression">From workflow ID expression</option>
                            </select>
                          </div>

                          {(node.config.workflowSource || 'static') === 'expression' ? (
                            <div>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Workflow ID Expression</label>
                                <button
                                  type="button"
                                  onClick={() => setVariablePicker((current) => current?.nodeId === node.id && current.key === 'workflowExpression' ? null : { nodeId: node.id, key: 'workflowExpression' })}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  <Braces className="h-3 w-3" />
                                  Insert Variable
                                </button>
                              </div>
                              <input
                                value={node.config.workflowExpression || ''}
                                onChange={(event) => updateNodeConfig(node.id, { workflowExpression: event.target.value })}
                                placeholder="$.input.payload.workflowId"
                                className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                              />
                              {renderVariablePicker('workflowExpression')}
                              {renderExpressionPreview(node.config.workflowExpression || '')}
                            </div>
                          ) : (
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target Workflow</label>
                              <select
                                value={node.config.workflowId || ''}
                                onChange={(event) => {
                                  const nextWorkflow = callableWorkflows.find((workflow) => workflow.id === event.target.value);
                                  const firstTrigger = (nextWorkflow?.publishedSnapshot?.nodes || nextWorkflow?.nodes || []).find((item) => item.type === 'trigger');
                                  updateNodeConfig(node.id, { workflowId: event.target.value, triggerId: firstTrigger?.id || '' });
                                }}
                                className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                              >
                                <option value="">Select workflow</option>
                                {callableWorkflows.map((workflow) => (
                                  <option key={workflow.id} value={workflow.id}>
                                    {workflow.name}{workflow.publishedSnapshot ? ` - v${workflow.publishedVersion || 1}` : ' - draft only'}
                                  </option>
                                ))}
                              </select>
                              {selectedWorkflow && !selectedWorkflow.publishedSnapshot && (
                                <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">Publish this workflow before production use. Draft-only workflows are allowed for local testing.</p>
                              )}
                            </div>
                          )}

                          {(node.config.workflowSource || 'static') === 'static' && (
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start From Trigger</label>
                              <select
                                value={node.config.triggerId || targetTriggers[0]?.id || ''}
                                onChange={(event) => updateNodeConfig(node.id, { triggerId: event.target.value })}
                                disabled={targetTriggers.length === 0}
                                className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 disabled:opacity-60 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                              >
                                {targetTriggers.map((trigger) => (
                                  <option key={trigger.id} value={trigger.id}>{trigger.name || getActionLabel(trigger.config?.type)}</option>
                                ))}
                                {targetTriggers.length === 0 && <option value="">No trigger available</option>}
                              </select>
                            </div>
                          )}

                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Payload Source</label>
                            <select
                              value={payloadSource}
                              onChange={(event) => updateNodeConfig(node.id, { payloadSource: event.target.value })}
                              className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                            >
                              <option value="json">Payload JSON</option>
                              <option value="expression">Payload Expression</option>
                            </select>
                          </div>

                          {payloadSource === 'expression' ? (
                            <div>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Payload Expression</label>
                                <button
                                  type="button"
                                  onClick={() => setVariablePicker((current) => current?.nodeId === node.id && current.key === 'payloadExpression' ? null : { nodeId: node.id, key: 'payloadExpression' })}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  <Braces className="h-3 w-3" />
                                  Insert Variable
                                </button>
                              </div>
                              <input
                                value={node.config.payloadExpression || ''}
                                onChange={(event) => updateNodeConfig(node.id, { payloadExpression: event.target.value })}
                                placeholder="$.input"
                                className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                              />
                              {renderVariablePicker('payloadExpression')}
                              {renderExpressionPreview(node.config.payloadExpression || '')}
                            </div>
                          ) : (
                            <div>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Payload JSON</label>
                                <button
                                  type="button"
                                  onClick={() => setVariablePicker((current) => current?.nodeId === node.id && current.key === 'payloadJson' ? null : { nodeId: node.id, key: 'payloadJson' })}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  <Braces className="h-3 w-3" />
                                  Insert Variable
                                </button>
                              </div>
                              <textarea
                                value={node.config.payloadJson || node.config.payload || '{}'}
                                rows={6}
                                onChange={(event) => updateNodeConfig(node.id, { payloadJson: event.target.value })}
                                className="block w-full resize-y rounded-md border-0 py-2 font-mono text-xs text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                              />
                              {renderVariablePicker('payloadJson')}
                              {renderExpressionPreview(node.config.payloadJson || node.config.payload || '')}
                            </div>
                          )}

                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Max Call Depth</label>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={node.config.maxDepth ?? 5}
                              onChange={(event) => updateNodeConfig(node.id, { maxDepth: Number(event.target.value) })}
                              className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                            />
                          </div>
                        </div>
                      );
                    })() : null}
                    {Object.entries(node.config).map(([key, value]) => {
                      if (node.config.type === 'schedule') return null;
                      if (node.config.type === 'device_control') return null;
                      if (node.config.type === 'run_workflow') return null;
                      if (key === 'type') return null;
                      if (key === 'executionPolicy') return null;

                      if (['access', 'nfc_access'].includes(node.config.type) && key === 'accessId') {
                        const accessOptions = node.config.type === 'nfc_access'
                          ? accesses.filter((access) => access.method === 'nfc' || access.method === 'nfc_basic')
                          : accesses;
                        return (
                          <div key={key}>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Access
                            </label>
                            <AccessSelect
                              value={value as string}
                              onChange={(accessId) => updateNodeConfig(node.id, { accessId })}
                              accesses={accessOptions}
                            />
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {node.config.type === 'nfc_access'
                                ? 'NFC trigger output includes Access extra parameters, tagId, and credentialGroups. Example: $.nfc_trigger.output.tagId or $.nfc_trigger.output.params.deviceId.'
                                : 'Access extra parameters are available from this trigger output, for example $.access_trigger.output.deviceId or $.access_trigger.output.params.deviceId.'}
                            </p>
                          </div>
                        );
                      }
                      
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
                                updateNodeConfig(node.id, { [key]: newDevice });
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
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">
                                {key.replace('_', ' ')}
                              </label>
                              <button
                                type="button"
                                onClick={() => setVariablePicker((current) => current?.nodeId === node.id && current.key === key ? null : { nodeId: node.id, key })}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                <Braces className="h-3 w-3" />
                                Insert Variable
                              </button>
                            </div>
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
                            {renderVariablePicker(key)}
                            {renderExpressionPreview(value)}
                          </div>
                        );
                      }
                      
                      return (
                        <div key={key}>
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">
                              {key === 'expectedContent' ? 'Match Content' : key.replace('_', ' ')}
                            </label>
                            {typeof value !== 'number' && !(node.type === 'trigger' && node.config.type === 'webhook' && key === 'endpoint') && (
                              <button
                                type="button"
                                onClick={() => setVariablePicker((current) => current?.nodeId === node.id && current.key === key ? null : { nodeId: node.id, key })}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                <Braces className="h-3 w-3" />
                                Insert Variable
                              </button>
                            )}
                          </div>
                          <input 
                            type={typeof value === 'number' ? 'number' : 'text'}
                            value={value as string | number}
                            readOnly={node.type === 'trigger' && node.config.type === 'webhook' && key === 'endpoint'}
                            onChange={(e) => {
                              const nextValue = typeof value === 'number' ? Number(e.target.value) : e.target.value;
                              updateNodeConfig(node.id, { [key]: nextValue });
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
                          {typeof value !== 'number' && renderVariablePicker(key)}
                          {renderExpressionPreview(value)}
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
                              retryBackoff: node.config.executionPolicy?.retryBackoff || 'fixed',
                              timeout: node.config.executionPolicy?.timeout || '30s',
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
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Backoff</label>
                            <select
                              value={node.config.executionPolicy?.retryBackoff || 'fixed'}
                              onChange={(event) => updateNodeConfig(node.id, {
                                executionPolicy: {
                                  ...(node.config.executionPolicy || {}),
                                  retryEnabled: true,
                                  retryBackoff: event.target.value,
                                },
                              })}
                              className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                            >
                              <option value="fixed">Fixed interval</option>
                              <option value="exponential">Exponential backoff</option>
                            </select>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Timeout</label>
                        <input
                          value={node.config.executionPolicy?.timeout ?? '30s'}
                          placeholder="30s, 5000ms, 2m"
                          onChange={(event) => updateNodeConfig(node.id, {
                            executionPolicy: {
                              ...(node.config.executionPolicy || {}),
                              timeout: event.target.value,
                            },
                          })}
                          className="block w-full rounded-md border-0 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-orange-600 sm:text-sm dark:bg-slate-800 dark:text-white dark:ring-slate-700"
                        />
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Examples: 5000ms, 30s, 2m. Empty means no timeout.</p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">On Failure</label>
                        <select
                          value={node.config.executionPolicy?.onFailure || 'stop'}
                          onChange={(event) => updateNodeConfig(node.id, {
                            executionPolicy: {
                              ...(node.config.executionPolicy || {}),
                              retryAttempts: node.config.executionPolicy?.retryAttempts ?? 3,
                              retryInterval: node.config.executionPolicy?.retryInterval ?? '10s',
                              retryBackoff: node.config.executionPolicy?.retryBackoff || 'fixed',
                              timeout: node.config.executionPolicy?.timeout || '30s',
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

                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Input / Output</label>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {nodeTestStep
                            ? 'Showing latest node test result.'
                            : selectedNodeLastLog
                              ? `Latest run: ${new Date(selectedNodeLastLog.run.startedAt || selectedNodeLastLog.run.finishedAt).toLocaleString()}`
                            : logsLoading
                              ? 'Loading node logs...'
                              : 'No run log found for this node yet.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={loadWorkflowLogs}
                        disabled={logsLoading}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-white disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", logsLoading && "animate-spin")} />
                        Refresh
                      </button>
                    </div>

                    {displayedStep && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={cn("rounded-full border px-2 py-0.5 font-medium", statusClassName(displayedStep.status))}>
                            {displayedStep.status || 'unknown'}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">{displayedRunId}</span>
                          {displayedStartedAt && <span className="text-slate-500 dark:text-slate-400">{new Date(displayedStartedAt).toLocaleString()}</span>}
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Input</div>
                          <JsonInspector value={displayedStep.input} baseReference="$.input" />
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Output</div>
                          <JsonInspector value={displayedStep.output} baseReference="$.output" failed={displayedStep.status === 'failed'} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Edit the parameters above to configure how this {node.type} behaves when executed in the workflow stream.
                    </p>
                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={resetNodeSettings}
                        disabled={!nodeSettingsDirty}
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={saveNodeSettings}
                        disabled={!nodeSettingsDirty}
                        className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-500 disabled:cursor-default disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                      >
                        <Save className="h-4 w-4" />
                        Save Node
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showNodeSearch && (
        <div className="absolute inset-0 z-50 flex items-start justify-center bg-slate-950/60 p-4 pt-20 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1c2128]">
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <Search className="h-5 w-5 text-orange-500" />
              <input
                autoFocus
                value={nodeSearchQuery}
                onChange={(event) => setNodeSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && nodeSearchResults[0]) {
                    event.preventDefault();
                    focusNode(nodeSearchResults[0].node.id);
                  }
                }}
                placeholder="Search nodes, devices, access entries, variables..."
                className="min-w-0 flex-1 border-none bg-transparent p-0 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-0 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowNodeSearch(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {nodeSearchResults.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No matching nodes.
                </div>
              ) : (
                <div className="space-y-1">
                  {nodeSearchResults.map(({ node, index }) => {
                    const device = devices.find((item) => [node.config?.device, node.config?.target, node.config?.deviceExpression].includes(item.id));
                    const access = accesses.find((item) => item.id === node.config?.accessId);
                    const configPreview = Object.entries(node.config || {})
                      .filter(([key]) => !['type', 'groupId', 'executionPolicy'].includes(key))
                      .slice(0, 4)
                      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
                      .join(', ');
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => focusNode(node.id)}
                        className="flex w-full items-start gap-3 rounded-lg border border-transparent p-3 text-left transition-colors hover:border-orange-200 hover:bg-orange-50 dark:hover:border-orange-500/30 dark:hover:bg-orange-500/10"
                      >
                        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                          {getActionIcon(node.config?.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">{node.name || getActionLabel(node.config?.type)}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              {node.type}
                            </span>
                            <span className="text-[10px] text-slate-400">#{index + 1}</span>
                          </div>
                          <div className="mt-1 truncate text-xs text-orange-600 dark:text-orange-400">
                            {getActionLabel(node.config?.type)}
                            {device && ` / ${device.name}`}
                            {access && ` / ${access.name}`}
                          </div>
                          {configPreview && (
                            <div className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {configPreview}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showValidationModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1c2128]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Workflow Validation
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Preflight checks catch missing bindings, invalid URLs, risky triggers, and external side effects before publishing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowValidationModal(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  ['Errors', validationSummary.errors, 'error'],
                  ['Warnings', validationSummary.warnings, 'warning'],
                  ['Info', validationSummary.info, 'info'],
                ] as Array<[string, number, WorkflowValidationIssue['severity']]>).map(([label, value, severity]) => (
                  <div key={label} className={cn("rounded-lg border p-4", severityClassName(severity))}>
                    <span className="block text-2xl font-bold">{value}</span>
                    <span className="mt-1 block text-xs font-semibold uppercase tracking-wider">{label}</span>
                  </div>
                ))}
              </div>

              {validationIssues.length === 0 ? (
                <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                  Validation passed. No blocking issues were found.
                </div>
              ) : (
                <div className="mt-5 space-y-2">
                  {validationIssues.map((issue) => (
                    <button
                      key={issue.id}
                      type="button"
                      onClick={() => focusValidationIssue(issue)}
                      className={cn(
                        "w-full rounded-lg border p-4 text-left transition-colors",
                        severityClassName(issue.severity),
                        issue.nodeId && "hover:ring-2 hover:ring-orange-500/30"
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-semibold uppercase dark:bg-slate-950/30">
                              {issue.severity}
                            </span>
                            <span className="font-mono text-[11px] opacity-80">{issue.code}</span>
                          </div>
                          <p className="mt-2 text-sm font-medium">{issue.message}</p>
                        </div>
                        {issue.nodeId && (
                          <span className="shrink-0 rounded-md bg-white/60 px-2 py-1 text-xs font-medium dark:bg-slate-950/30">
                            {issue.nodeName || issue.nodeId}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => validateWorkflow(validationSource)}
                disabled={validationLoading}
                className="mr-auto inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <RefreshCw className={cn("h-4 w-4", validationLoading && "animate-spin")} />
                Revalidate
              </button>
              <button
                type="button"
                onClick={() => setShowValidationModal(false)}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
              {validationCanPublish && (
                <button
                  type="button"
                  onClick={publishWithoutValidation}
                  className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
                >
                  <Save className="h-4 w-4" />
                  Publish Anyway
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showPublishModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1c2128]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                  <Save className="h-4 w-4 text-orange-500" />
                  Publish Workflow Version
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  This creates a published snapshot that production execution can use.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-4 gap-3">
                {Object.entries(summarizeWorkflowNodes(draft.nodes)).map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-slate-200 p-3 text-center dark:border-slate-800">
                    <span className="block text-lg font-bold text-slate-900 dark:text-white">{value}</span>
                    <span className="mt-1 block text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{key.replace('Count', '')}</span>
                  </div>
                ))}
              </div>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Publish Notes
                </span>
                <textarea
                  value={publishNotes}
                  onChange={(event) => setPublishNotes(event.target.value)}
                  placeholder="Describe what changed in this version."
                  className="h-32 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:border-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => validateWorkflow('manual')}
                disabled={validationLoading}
                className="mr-auto inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {validationLoading ? 'Validating' : 'Validate'}
              </button>
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPublish}
                disabled={validationLoading}
                className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {validationLoading ? 'Validating...' : 'Publish Version'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showVersionHistory && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1c2128]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                  <History className="h-4 w-4 text-orange-500" />
                  Version History
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Review published versions, compare against the current draft, or restore a version into draft.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowVersionHistory(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[340px_1fr]">
              <aside className="min-h-0 overflow-y-auto border-b border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/20 lg:border-b-0 lg:border-r">
                {versionHistory.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                    No published versions yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {versionHistory.map((version) => (
                      <button
                        key={version.version}
                        type="button"
                        onClick={() => setSelectedVersionNumber(version.version)}
                        className={cn(
                          "w-full rounded-lg border p-3 text-left transition-colors",
                          selectedVersion?.version === version.version
                            ? "border-orange-300 bg-orange-50 dark:border-orange-500/40 dark:bg-orange-500/10"
                            : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">v{version.version}</span>
                          {draft.publishedVersion === version.version && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {new Date(version.publishedAt).toLocaleString()}
                        </div>
                        <div className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                          {version.notes || 'No publish notes.'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </aside>

              <main className="min-h-0 overflow-y-auto p-5">
                {selectedVersion ? (
                  <div className="space-y-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Version v{selectedVersion.version}</h4>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Published by {selectedVersion.publishedBy || 'Unknown User'} on {new Date(selectedVersion.publishedAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => rollbackVersionToDraft(selectedVersion)}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Restore to Draft
                      </button>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                      {selectedVersion.notes || 'No publish notes.'}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-4">
                      {([
                        ['Nodes', selectedVersion.nodeCount],
                        ['Triggers', selectedVersion.triggerCount],
                        ['Conditions', selectedVersion.conditionCount],
                        ['Actions', selectedVersion.actionCount],
                      ] as Array<[string, number]>).map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                          <span className="block text-xs text-slate-500 dark:text-slate-400">{label}</span>
                          <span className="mt-2 block text-lg font-bold text-slate-900 dark:text-white">{value}</span>
                        </div>
                      ))}
                    </div>

                    <section className="rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                        <h5 className="text-sm font-semibold text-slate-900 dark:text-white">Compare Current Draft</h5>
                      </div>
                      <div className="grid gap-4 p-4 lg:grid-cols-2">
                        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Version v{selectedVersion.version}</div>
                          <pre className="text-xs text-slate-600 dark:text-slate-300">{formatJson(selectedVersionCompare.version)}</pre>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Current Draft</div>
                          <pre className="text-xs text-slate-600 dark:text-slate-300">{formatJson(selectedVersionCompare.draft)}</pre>
                        </div>
                      </div>
                      <div className="grid gap-4 border-t border-slate-200 p-4 dark:border-slate-800 lg:grid-cols-3">
                        {([
                          ['Added', selectedVersionCompare.added],
                          ['Removed', selectedVersionCompare.removed],
                          ['Changed', selectedVersionCompare.changed],
                        ] as Array<[string, WorkflowNode[]]>).map(([label, nodes]) => (
                          <div key={label}>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              {label} ({nodes.length})
                            </div>
                            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-2 dark:bg-slate-900/50">
                              {nodes.length === 0 ? (
                                <div className="px-2 py-3 text-xs text-slate-500 dark:text-slate-400">None</div>
                              ) : (
                                nodes.map((node) => (
                                  <div key={`${label}-${node.id}`} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                                    {formatNodeLabel(node)}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Publish this workflow to create the first version snapshot.
                  </div>
                )}
              </main>
            </div>
          </div>
        </div>
      )}

      {showDryRun && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1c2128]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                  <Play className="h-4 w-4 text-orange-500" />
                  Workflow Dry Run
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Simulate the current draft without sending notifications, calling webhooks, or controlling devices.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDryRun(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Trigger
                    </span>
                    <select
                      value={dryRunTriggerId}
                      onChange={(event) => {
                        setDryRunTriggerId(event.target.value);
                        const trigger = triggerNodes.find((node) => node.id === event.target.value);
                        if (trigger) setDryRunEventText(JSON.stringify(createDryRunSampleEvent(trigger.config?.type), null, 2));
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {triggerNodes.length === 0 && <option value="">No trigger configured</option>}
                      {triggerNodes.map((trigger) => (
                        <option key={trigger.id} value={trigger.id}>
                          {trigger.name || trigger.config?.type || trigger.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Sample Inputs
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ['threshold', 'Threshold'],
                        ['offline', 'Offline'],
                        ['mqtt_message', 'MQTT'],
                        ['access', 'Access QR'],
                        ['nfc_access', 'NFC'],
                        ['webhook', 'Webhook'],
                        ['schedule', 'Schedule'],
                      ].map(([type, label]) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => applyDryRunSample(type)}
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-orange-500/40 dark:hover:bg-orange-500/10 dark:hover:text-orange-300"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    Dry Run uses the same expression and branch logic as execution. External effects are converted into dry-run output objects.
                  </div>
                </div>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Trigger Event JSON
                  </span>
                  <textarea
                    value={dryRunEventText}
                    onChange={(event) => {
                      setDryRunEventText(event.target.value);
                      setDryRunError('');
                    }}
                    spellCheck={false}
                    className="h-[420px] w-full resize-none rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-slate-100 outline-none focus:border-orange-500 dark:border-slate-700"
                  />
                </label>
              </div>

              {dryRunError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {dryRunError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowDryRun(false)}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runWorkflowDryRun}
                disabled={dryRunLoading || triggerNodes.length === 0}
                className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {dryRunLoading ? 'Running...' : 'Run Simulation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLogs && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1c2128]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                  <ListTree className="h-4 w-4 text-orange-500" />
                  Logs
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{draft.name} - execution flow and errors</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadWorkflowLogs}
                  disabled={logsLoading}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <RefreshCw className={cn("h-4 w-4", logsLoading && "animate-spin")} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={clearWorkflowLogs}
                  disabled={logsLoading || workflowLogs.length === 0}
                  className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear Logs
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogs(false)}
                  className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[320px_1fr]">
              <aside className="min-h-0 overflow-y-auto border-b border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/20 lg:border-b-0 lg:border-r">
                {logsError && (
                  <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{logsError}</div>
                )}
                {logsLoading && workflowLogs.length === 0 ? (
                  <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Loading workflow logs...</div>
                ) : workflowLogs.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">No logs yet.</div>
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
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", statusClassName(run.status))}>{run.status}</span>
                            {run.dryRun && (
                              <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300">
                                Dry Run
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">{new Date(run.startedAt).toLocaleString()}</span>
                        </div>
                        <div className="mt-2 truncate text-xs font-mono text-slate-500 dark:text-slate-400">{run.triggerType} - {run.eventSource}</div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{run.steps?.length || 0} steps</div>
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
                        <span className={cn("mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold uppercase", statusClassName(selectedRun.status))}>{selectedRun.status}</span>
                        {selectedRun.dryRun && (
                          <span className="ml-2 mt-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-semibold uppercase text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300">
                            Dry Run
                          </span>
                        )}
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
                    </div>

                    <section>
                      <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Execution Flow</h4>
                      <div className="space-y-3">
                        {(selectedRun.steps || []).map((step, index) => (
                          <div key={`${step.nodeId || step.nodeName || 'step'}-${index}`} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{index + 1}</span>
                              <span className="font-semibold text-slate-900 dark:text-white">{step.nodeName || step.nodeId || 'Node'}</span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:bg-slate-800 dark:text-slate-400">{step.type || 'node'}</span>
                              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", statusClassName(step.status))}>{step.status || 'unknown'}</span>
                            </div>
                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                              <div>
                                <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Input</div>
                                <JsonInspector value={step.input} baseReference="$.input" />
                              </div>
                              <div>
                                <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">{step.status === 'failed' ? 'Error / Output' : 'Output'}</div>
                                <JsonInspector value={step.output} baseReference="$.output" failed={step.status === 'failed'} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Trigger Event</h4>
                      <pre className="max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-200">{formatJson(selectedRun.event)}</pre>
                    </section>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Select a run to inspect the execution flow.</div>
                )}
              </main>
            </div>
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
                    {triggerTypesForSelector.map(type => (
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
