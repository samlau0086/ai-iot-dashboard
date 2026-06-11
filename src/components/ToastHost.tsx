import React, { useEffect, useState } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { ToastEventDetail } from '../lib/toast';
import { cn } from '../lib/utils';

type ToastItem = Required<Pick<ToastEventDetail, 'id' | 'level' | 'message'>> & {
  title?: string;
};

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastEventDetail>).detail;
      const toast: ToastItem = {
        id: detail.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        level: detail.level || 'info',
        title: detail.title,
        message: detail.message,
      };
      setToasts((current) => [toast, ...current].slice(0, 4));
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, 2800);
    };

    window.addEventListener('app-toast', handleToast);
    return () => window.removeEventListener('app-toast', handleToast);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = toast.level === 'success' ? CheckCircle2 : toast.level === 'error' ? XCircle : Info;
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg dark:bg-[#1c2128]',
              toast.level === 'success' && 'border-emerald-200 dark:border-emerald-500/30',
              toast.level === 'error' && 'border-red-200 dark:border-red-500/30',
              toast.level === 'info' && 'border-slate-200 dark:border-slate-700'
            )}
          >
            <Icon className={cn(
              'mt-0.5 h-5 w-5 shrink-0',
              toast.level === 'success' && 'text-emerald-500',
              toast.level === 'error' && 'text-red-500',
              toast.level === 'info' && 'text-sky-500'
            )} />
            <div className="min-w-0 flex-1">
              {toast.title && <p className="text-sm font-semibold text-slate-900 dark:text-white">{toast.title}</p>}
              <p className="text-sm text-slate-600 dark:text-slate-300">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
