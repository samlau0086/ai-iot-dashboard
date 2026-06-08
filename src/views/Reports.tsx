import React, { useState } from 'react';
import { FileText, Download, Calendar, Mail, FileDown } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { deriveAlertsFromDevices } from '../lib/derivedData';

type ReportItem = {
  id: string;
  name: string;
  date: string;
  type: string;
  size: string;
  content: string;
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
  const blob = new Blob([toCsv(report.rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${report.name.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const getCsvSize = (rows: string[][]) => {
  const bytes = new Blob([toCsv(rows)]).size;
  if (bytes < 1024) return `${bytes} B`;

  return `${(bytes / 1024).toFixed(1)} KB`;
};

export function Reports() {
  const { language, devices } = useAppStore();
  const t = translations[language];
  const alerts = deriveAlertsFromDevices(devices);

  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [reports, setReports] = useState<ReportItem[]>([
    { id: 'sample-energy', name: 'Weekly Energy Summary', date: 'Oct 25, 2026', type: 'CSV', size: '2.4 KB', content: 'Energy', rows: [['Report', 'Sample report']] },
    { id: 'sample-uptime', name: 'Monthly Equipment Uptime', date: 'Oct 01, 2026', type: 'CSV', size: '1.1 KB', content: 'Devices', rows: [['Report', 'Sample report']] },
    { id: 'sample-alerts', name: 'Alerts & Incidents Log', date: 'Sep 30, 2026', type: 'CSV', size: '4.5 KB', content: 'Alerts', rows: [['Report', 'Sample report']] },
  ]);

  const buildReportRows = (content: string, range: string) => {
    const generatedAt = new Date().toISOString();

    if (content === 'Devices') {
      return [
        ['Report', 'Device Health'],
        ['Range', range],
        ['Generated At', generatedAt],
        [],
        ['Device ID', 'Name', 'Type', 'Status', 'Tags', 'Last Seen', 'Firmware', 'External Device ID', 'Metric', 'Value'],
        ...devices.flatMap((device) => {
          const metrics = Object.entries(device.metrics || {});
          const base = [
            device.id,
            device.name,
            device.type,
            device.status,
            (device.tags || []).join('|'),
            device.lastSeen,
            device.firmwareVersion,
            device.config?.externalDeviceId || device.id,
          ];

          return metrics.length
            ? metrics.map(([metric, value]) => [...base, metric, String(value)])
            : [[...base, '', '']];
        }),
      ];
    }

    if (content === 'Alerts') {
      return [
        ['Report', 'Alerts & Anomalies'],
        ['Range', range],
        ['Generated At', generatedAt],
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
    }

    const totalEnergy = devices.reduce((sum, device) => sum + (Number(device.metrics.energy) || Number(device.metrics.energy_today) || 0), 0);
    const totalPower = devices.reduce((sum, device) => sum + (Number(device.metrics.power) || 0), 0);

    return [
      ['Report', 'Energy Usage'],
      ['Range', range],
      ['Generated At', generatedAt],
      [],
      ['Metric', 'Value'],
      ['Total Devices', String(devices.length)],
      ['Online Devices', String(devices.filter((device) => device.status === 'online').length)],
      ['Active Alerts', String(alerts.filter((alert) => alert.status === 'active').length)],
      ['Total Energy Today (kWh)', totalEnergy.toFixed(2)],
      ['Total Power (W)', totalPower.toFixed(2)],
      [],
      ['Device ID', 'Name', 'Type', 'Energy Today (kWh)', 'Power (W)', 'Status'],
      ...devices.map((device) => [
        device.id,
        device.name,
        device.type,
        String(device.metrics.energy || device.metrics.energy_today || ''),
        String(device.metrics.power || ''),
        device.status,
      ]),
    ];
  };

  const handleGenerate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const range = formData.get('range') as string;
    const content = formData.get('content') as string;
    const rows = buildReportRows(content, range);
    const report: ReportItem = {
      id: `report-${Date.now()}`,
      name: `Custom ${content} Report`,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      type: 'CSV',
      size: getCsvSize(rows),
      content,
      rows,
    };
    
    setReports([report, ...reports]);
    setShowGenerateModal(false);
    downloadCsv(report);
  };

  return (
    <div className="space-y-6 relative">
      <div className="sm:flex sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t.reports.title}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {t.reports.desc}
          </p>
        </div>
        <button 
          type="button" 
          onClick={() => setShowGenerateModal(true)}
          className="inline-flex mt-4 sm:mt-0 items-center gap-x-2 rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 border border-orange-500"
        >
          <Calendar className="-ml-0.5 h-4 w-4" aria-hidden="true" />
          {t.reports.generate}
        </button>
      </div>

      <div className="mt-8 overflow-hidden bg-white dark:bg-[#1c2128] border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
        <ul role="list" className="divide-y divide-slate-100 dark:divide-slate-800/50">
          {reports.map((report) => (
            <li key={report.id} className="flex items-center justify-between gap-x-6 px-4 py-5 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors sm:px-6">
              <div className="flex gap-x-4">
                <div className="h-10 w-10 flex-none rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                  <FileText className="h-5 w-5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-auto">
                  <p className="text-sm font-semibold leading-6 text-slate-900 dark:text-slate-300">
                    <a href="#" className="hover:text-orange-600 dark:hover:text-orange-500 transition-colors">{report.name}</a>
                  </p>
                  <p className="mt-1 flex text-xs leading-5 text-slate-500 font-mono">
                    {t.reports.generatedOn} {report.date} – {report.type} ({report.size})
                  </p>
                </div>
              </div>
              <div className="flex flex-none items-center gap-x-4">
                <button type="button" className="hidden sm:inline-flex text-sm font-semibold leading-6 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white items-center gap-2">
                  <Mail className="h-4 w-4" /> {t.reports.email}
                </button>
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
        </ul>
      </div>

      {showGenerateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity z-[100]" aria-hidden="true" onClick={() => setShowGenerateModal(false)}>
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"></div>
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
                          Current basic export format: CSV
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
