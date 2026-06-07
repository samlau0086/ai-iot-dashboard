import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { 
  GitMerge, GitBranch, GitCommit, Settings2, Timer, Plus, Play, Square, Trash2, Edit2, 
  MessageCircle, Mail, Ticket, Power, Globe,
  FileText, BrainCircuit, Activity, AlertTriangle,
  Clock, Zap, PowerOff, ArrowRight, Radio, Wifi, Bell
} from 'lucide-react';
import { cn } from '../lib/utils';
import { WorkflowEditor } from './WorkflowEditor';

export function Workflows() {
  const { language, workflows, updateWorkflow, deleteWorkflow } = useAppStore();
  const t = translations[language];
  const [editingId, setEditingId] = useState<string | null>(null);

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
    // @ts-ignore
    return t.workflows.actionTypes[type] || t.workflows.conditionTypes[type] || t.workflows.triggerTypes[type] || type;
  };

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <GitMerge className="h-6 w-6 text-orange-600 dark:text-orange-500" />
            {t.workflows.title}
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
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => deleteWorkflow(workflow.id)} className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-600 hover:border-red-200 dark:hover:bg-slate-800 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Workflow Canvas Preview */}
              <div className="p-6 bg-slate-50/30 dark:bg-[#16191f] overflow-x-auto">
                <div className="flex items-center gap-4 min-w-max">
                  {/* Triggers Group */}
                  <div className="flex flex-col gap-3">
                    {workflow.nodes.filter(n => n.type === 'trigger').map(node => (
                      <div key={node.id} className="w-48 rounded-lg border p-3 flex flex-col gap-2 transition-all shadow-sm bg-white dark:bg-[#1c2128] border-orange-200 dark:border-orange-500/30 ring-1 ring-orange-500/10">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md bg-orange-50 dark:bg-orange-500/10">
                            {getActionIcon(node.config.type)}
                          </div>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-1">
                            {getActionLabel(node.config.type)}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-50/50 dark:bg-slate-900/30 p-2 rounded line-clamp-2">
                          {Object.entries(node.config).filter(([k]) => k !== 'type').map(([k, v]) => `${k}: ${v}`).join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>

                  {workflow.nodes.filter(n => n.type === 'trigger').length > 0 && workflow.nodes.filter(n => n.type !== 'trigger').length > 0 && (
                    <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0" />
                  )}

                  {/* Other Nodes */}
                  {workflow.nodes.filter(n => n.type !== 'trigger').map((node, index, arr) => {
                    const isCondition = node.type === 'condition';
                    return (
                      <React.Fragment key={node.id}>
                        <div className={cn(
                          "w-48 rounded-lg border p-3 flex flex-col gap-2 transition-all shadow-sm bg-white dark:bg-[#1c2128]",
                          isCondition ? "border-indigo-200 dark:border-indigo-500/30 ring-1 ring-indigo-500/10" : "border-slate-200 dark:border-slate-800"
                        )}>
                          <div className="flex items-center gap-2">
                            <div className={cn("p-1.5 rounded-md", isCondition ? "bg-indigo-50 dark:bg-indigo-500/10" : "bg-slate-50 dark:bg-slate-800/50")}>
                              {getActionIcon(node.config.type)}
                            </div>
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-1">
                              {getActionLabel(node.config.type)}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-50/50 dark:bg-slate-900/30 p-2 rounded line-clamp-2">
                            {Object.entries(node.config).filter(([k]) => k !== 'type').map(([k, v]) => `${k}: ${v}`).join(', ')}
                          </div>
                        </div>
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
    </div>
  );
}
