import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Download, FileDown, FileText, RefreshCw } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { apiActorHeaders, apiJsonHeaders } from '../lib/apiAuth';
import { notify, notifySuccess } from '../lib/toast';

type ReportItem = {
  id: string;
  name: string;
  date: string;
  type: string;
  size: string;
  content: string;
  range?: string;
  siteId?: string;
  source?: string;
  workflowName?: string;
  rows: string[][];
};

const csvEscape = (value: unknown) => {
  const stringValue = String(value ?? '');
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

const toCsv = (rows: string[][]) => rows.map((row) => row.map(csvEscape).join(',')).join('\n');

const downloadCsv = (report: ReportItem) => {
  const blob = new Blob([toCsv(report.rows || [])], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${report.name.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const formatReportDate = (date: string) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date || '-';
  return parsed.toLocaleString();
};

export function Reports() {
  const { language, currentUser, activeSiteId, sites } = useAppStore();
  const t = translations[language];
  const activeSite = useMemo(() => sites.find((site) => site.id === activeSiteId), [activeSiteId, sites]);

  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadReports = async () => {
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams({ siteId: activeSiteId || 'All' });
      const response = await fetch(`/api/reports?${params.toString()}`, {
        headers: apiActorHeaders(currentUser),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Load failed: ${response.status}`);
      setReports(Array.isArray(payload.reports) ? payload.reports : []);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Failed to load reports.';
      setMessage(nextMessage);
      notify({ level: 'error', title: 'Reports', message: nextMessage });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, [activeSiteId]);

  const handleGenerate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const range = String(formData.get('range') || 'last7days');
    const content = String(formData.get('content') || 'Energy');

    try {
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: apiJsonHeaders(currentUser),
        body: JSON.stringify({
          name: `Custom ${content} Report`,
          range,
          content,
          siteId: activeSiteId || 'All',
          source: 'manual',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.report) throw new Error(payload.error || `Generate failed: ${response.status}`);
      setReports((current) => [payload.report, ...current.filter((item) => item.id !== payload.report.id)]);
      setShowGenerateModal(false);
      notifySuccess('Report generated successfully.');
      downloadCsv(payload.report);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'Failed to generate report.';
      setMessage(nextMessage);
      notify({ level: 'error', title: 'Reports', message: nextMessage });
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="sm:flex sm:items-center justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t.reports.title}
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {activeSite?.name ? `${activeSite.name} reports generated manually or by workflows.` : t.reports.desc}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
          <button
            type="button"
            onClick={loadReports}
            disabled={loading}
            className="inline-flex items-center gap-x-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowGenerateModal(true)}
            className="inline-flex items-center gap-x-2 rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 border border-orange-500"
          >
            <Calendar className="-ml-0.5 h-4 w-4" aria-hidden="true" />
            {t.reports.generate}
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {message}
        </div>
      )}

      <div className="mt-8 overflow-hidden bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
        <ul role="list" className="divide-y divide-slate-100 dark:divide-slate-800/50">
          {reports.map((report) => (
            <li key={report.id} className="flex items-center justify-between gap-x-6 px-4 py-5 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors sm:px-6">
              <div className="flex min-w-0 gap-x-4">
                <div className="h-10 w-10 flex-none rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                  <FileText className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-auto">
                  <p className="truncate text-sm font-semibold leading-6 text-slate-900 dark:text-slate-300">
                    {report.name}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs leading-5 text-slate-500 font-mono">
                    <span>{t.reports.generatedOn} {formatReportDate(report.date)}</span>
                    <span>{report.type} ({report.size})</span>
                    <span>{report.content}</span>
                    {report.source && <span>{report.source}</span>}
                    {report.workflowName && <span>{report.workflowName}</span>}
                  </p>
                </div>
              </div>
              <div className="flex flex-none items-center gap-x-4">
                <button
                  type="button"
                  onClick={() => downloadCsv(report)}
                  className="rounded bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm flex items-center gap-2"
                >
                  <Download className="h-4 w-4" /> {t.reports.download}
                </button>
              </div>
            </li>
          ))}
          {!loading && reports.length === 0 && (
            <li className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              No reports yet. Generate one manually or add a Report node to a workflow.
            </li>
          )}
          {loading && (
            <li className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading reports...
            </li>
          )}
        </ul>
      </div>

      {showGenerateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity z-[100]" aria-hidden="true" onClick={() => setShowGenerateModal(false)}>
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block align-bottom bg-white dark:bg-[#1c2128] rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-slate-200 dark:border-slate-800 relative z-[110]">
              <form onSubmit={handleGenerate}>
                <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-500/10 sm:mx-0 sm:h-10 sm:w-10">
                      <FileDown className="h-6 w-6 text-orange-600 dark:text-orange-500" aria-hidden="true" />
                    </div>
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                      <h3 className="text-lg leading-6 font-medium text-slate-900 dark:text-white" id="modal-title">
                        {t.reports.generate}
                      </h3>

                      <div className="mt-4 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date Range</label>
                          <select name="range" className="block w-full rounded border-0 py-1.5 text-slate-900 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 focus:ring-2 focus:ring-inset focus:ring-orange-500 sm:text-sm sm:leading-6 outline-none px-3">
                            <option value="last7days">Last 7 Days</option>
                            <option value="last30days">Last 30 Days</option>
                            <option value="thisMonth">This Month</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Report Content</label>
                          <select name="content" className="block w-full rounded border-0 py-1.5 text-slate-900 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 focus:ring-2 focus:ring-inset focus:ring-orange-500 sm:text-sm sm:leading-6 outline-none px-3">
                            <option value="Energy">Energy Usage</option>
                            <option value="Alerts">Alerts & Anomalies</option>
                            <option value="Devices">Device Health</option>
                          </select>
                        </div>
                        <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                          Report will be saved to backend and downloaded as CSV.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 sm:px-6 sm:flex sm:flex-row-reverse border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="submit"
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-orange-600 text-base font-medium text-white hover:bg-orange-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Generate
                  </button>
                  <button
                    type="button"
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-slate-300 dark:border-slate-700 shadow-sm px-4 py-2 bg-white dark:bg-slate-800 text-base font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                    onClick={() => setShowGenerateModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
