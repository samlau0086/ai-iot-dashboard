import React from 'react';
import { useAppStore } from '../lib/store';
import { translations } from '../lib/i18n';
import { AlertTriangle } from 'lucide-react';

interface DeviceConfirmDeleteProps {
  deviceId: string;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  tone?: 'danger' | 'warning';
}

export function DeviceConfirmDelete({ deviceId, onClose, onConfirm, title, description, confirmLabel, tone = 'danger' }: DeviceConfirmDeleteProps) {
  const { language, devices } = useAppStore();
  const t = translations[language].devices;
  const device = devices.find(d => d.id === deviceId);

  if (!device) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity z-[100]" aria-hidden="true" onClick={onClose}>
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-[#1c2128] rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-slate-200 dark:border-slate-800 relative z-[110]">
          <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className={tone === 'danger'
                ? 'mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-500/10 sm:mx-0 sm:h-10 sm:w-10'
                : 'mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-500/10 sm:mx-0 sm:h-10 sm:w-10'
              }>
                <AlertTriangle className={tone === 'danger' ? 'h-6 w-6 text-red-600 dark:text-red-500' : 'h-6 w-6 text-amber-600 dark:text-amber-400'} aria-hidden="true" />
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 className="text-lg leading-6 font-medium text-slate-900 dark:text-white" id="modal-title">
                  {title || t.deleteConfirmTitle}
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {description || t.deleteConfirmDesc}
                  </p>
                  <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-200 dark:border-slate-700">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-300">{device.name}</p>
                    <p className="text-xs text-slate-500 font-mono mt-1">{device.id}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 sm:px-6 sm:flex sm:flex-row-reverse border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              className={tone === 'danger'
                ? 'w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm'
                : 'w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-orange-600 text-base font-medium text-white hover:bg-orange-500 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm'
              }
              onClick={onConfirm}
            >
              {confirmLabel || t.form.delete}
            </button>
            <button
              type="button"
              className="mt-3 w-full inline-flex justify-center rounded-md border border-slate-300 dark:border-slate-700 shadow-sm px-4 py-2 bg-white dark:bg-slate-800 text-base font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={onClose}
            >
              {t.form.cancel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
