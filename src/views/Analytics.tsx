import React, { useMemo, useState } from 'react';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { Plus } from 'lucide-react';
import { ChartRenderer } from '../components/ChartRenderer';

export function Analytics() {
  const { language, theme, charts, addChart, removeChart, devices } = useAppStore();
  const t = translations[language];
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [metricKey, setMetricKey] = useState('');

  const metricOptions = useMemo(() => {
    const targetDevices = selectedDeviceIds.length
      ? devices.filter((device) => selectedDeviceIds.includes(device.id))
      : devices;
    const metrics = new Set<string>();
    targetDevices.forEach((device) => {
      Object.keys(device.metrics || {}).forEach((metric) => metrics.add(metric));
    });

    return Array.from(metrics).sort();
  }, [devices, selectedDeviceIds]);

  const getChartDevices = (deviceIds?: string[]) => {
    if (!deviceIds?.length) return devices;
    const selectedIds = new Set(deviceIds);
    return devices.filter((device) => selectedIds.has(device.id));
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setSelectedDeviceIds([]);
    setMetricKey('');
  };

  const handleAddSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    addChart({
      id: Math.random().toString(36).substring(7),
      title: formData.get('title') as string,
      type: formData.get('type') as any,
      dataSource: formData.get('dataSource') as any,
      deviceIds: selectedDeviceIds,
      metricKey: formData.get('metricKey') as string || metricKey || metricOptions[0],
    });
    closeAddModal();
  };

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t.nav.analytics}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Dynamically monitor and analyze operational statistics.
          </p>
        </div>
        <button 
          type="button" 
          onClick={() => setShowAddModal(true)}
          className="inline-flex mt-4 sm:mt-0 items-center gap-x-2 rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 border border-orange-500"
        >
          <Plus className="-ml-0.5 h-4 w-4" aria-hidden="true" />
          Add Chart
        </button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {charts.map((chartConf) => (
          <div key={chartConf.id} className="bg-white dark:bg-[#1c2128] p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm relative group">
            <button 
              onClick={() => removeChart(chartConf.id)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10 block"
            >
              ×
            </button>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200">{chartConf.title}</h3>
            <p className="mt-1 mb-5 text-xs font-mono text-slate-500 dark:text-slate-400">
              {chartConf.metricKey || 'default metric'} / {chartConf.deviceIds?.length ? `${chartConf.deviceIds.length} devices` : 'all devices'}
            </p>
            <div className="h-80 w-full">
               <ChartRenderer chartConf={chartConf} theme={theme} devices={getChartDevices(chartConf.deviceIds)} />
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity z-[100]" aria-hidden="true" onClick={closeAddModal}>
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"></div>
            </div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white dark:bg-[#1c2128] rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-slate-200 dark:border-slate-800 relative z-[110]">
              <form onSubmit={handleAddSubmit}>
                <div className="px-4 pt-5 pb-4 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-slate-900 dark:text-white mb-4">Add Analytics Chart</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Chart Title</label>
                      <input required type="text" name="title" className="mt-1 block w-full rounded border-0 py-1.5 px-3 text-slate-900 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 outline-none focus:ring-2 focus:ring-orange-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Data Source</label>
                      <select name="dataSource" className="mt-1 block w-full rounded border-0 py-1.5 px-3 text-slate-900 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 outline-none focus:ring-2 focus:ring-orange-500 sm:text-sm">
                        <option value="energy">Energy Metrics</option>
                        <option value="devices">Device Health</option>
                        <option value="alerts">Alert Frequency</option>
                        <option value="solar">Solar Production</option>
                        <option value="coldStorage">Cold Storage Temperature</option>
                        <option value="waterPump">Water Pump Pressure</option>
                        <option value="airCompressor">Air Compressor Pressure</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Chart Type</label>
                      <select name="type" className="mt-1 block w-full rounded border-0 py-1.5 px-3 text-slate-900 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 outline-none focus:ring-2 focus:ring-orange-500 sm:text-sm">
                        <option value="bar">Bar Chart</option>
                        <option value="line">Line Chart</option>
                        <option value="pie">Pie Chart</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bind Devices</label>
                      <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                        {devices.map((device) => (
                          <label key={device.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={selectedDeviceIds.includes(device.id)}
                              onChange={(event) => {
                                setSelectedDeviceIds((current) => (
                                  event.target.checked
                                    ? [...current, device.id]
                                    : current.filter((id) => id !== device.id)
                                ));
                              }}
                              className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                            <span className="min-w-0 truncate">{device.name}</span>
                            <span className="ml-auto shrink-0 font-mono text-xs text-slate-400">{device.type}</span>
                          </label>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty to bind all devices.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Metric</label>
                      <select
                        name="metricKey"
                        value={metricKey || metricOptions[0] || ''}
                        onChange={(event) => setMetricKey(event.target.value)}
                        className="mt-1 block w-full rounded border-0 py-1.5 px-3 text-slate-900 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 outline-none focus:ring-2 focus:ring-orange-500 sm:text-sm"
                      >
                        {metricOptions.map((metric) => (
                          <option key={metric} value={metric}>{metric}</option>
                        ))}
                        {metricOptions.length === 0 && (
                          <option value="">No metrics available</option>
                        )}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 sm:px-6 sm:flex sm:flex-row-reverse border-t border-slate-200 dark:border-slate-800">
                  <button type="submit" className="w-full inline-flex justify-center rounded border border-transparent px-4 py-2 bg-orange-600 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none sm:ml-3 sm:w-auto">Add</button>
                  <button type="button" onClick={closeAddModal} className="mt-3 w-full inline-flex justify-center rounded border border-slate-300 dark:border-slate-700 px-4 py-2 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 sm:mt-0 sm:ml-3 sm:w-auto">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
