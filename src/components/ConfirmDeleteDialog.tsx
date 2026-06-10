import React, { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import type { ConfirmDeleteRequest } from '../lib/confirm';

export function ConfirmDeleteDialog() {
  const [request, setRequest] = useState<ConfirmDeleteRequest | null>(null);

  useEffect(() => {
    const onConfirmDelete = (event: Event) => {
      const customEvent = event as CustomEvent<ConfirmDeleteRequest>;
      setRequest(customEvent.detail);
    };
    window.addEventListener('app-confirm-delete', onConfirmDelete);
    return () => window.removeEventListener('app-confirm-delete', onConfirmDelete);
  }, []);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(false);
      if (event.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request]);

  const close = (confirmed: boolean) => {
    if (!request) return;
    request.resolve(confirmed);
    setRequest(null);
  };

  if (!request) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Cancel delete" onClick={() => close(false)} />
      <div className="relative w-full max-w-md overflow-hidden rounded-lg border border-slate-700 bg-white shadow-2xl dark:bg-[#1c2128]">
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-full bg-red-500/12 text-red-500">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">{request.title}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Delete <span className="font-semibold text-slate-800 dark:text-slate-200">{request.itemName}</span>?
            </p>
          </div>
          <button type="button" onClick={() => close(false)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{request.description}</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/40">
          <button type="button" onClick={() => close(false)} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
            {request.cancelLabel}
          </button>
          <button type="button" onClick={() => close(true)} className="inline-flex items-center gap-2 rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500">
            <Trash2 className="h-4 w-4" />
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
