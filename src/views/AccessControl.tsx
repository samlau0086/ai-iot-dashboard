import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Edit2, Eye, KeyRound, Plus, QrCode, RefreshCw, Trash2, X } from 'lucide-react';
import { useAppStore, type AccessCredential, type AccessDefinition } from '../lib/store';
import { cn } from '../lib/utils';

const createAccessDraft = (): AccessDefinition => ({
  id: `access-${Date.now()}`,
  name: 'New Access',
  enabled: true,
  method: 'qr',
  extraParams: { deviceId: 'DEV-001' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const createDefaultQrName = () => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const randomPart = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(2, 5).toUpperCase().padEnd(3, '0');
  return `QR-${datePart}-${randomPart}`;
};

type DurationUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'months';

const durationUnits: Array<{ value: DurationUnit; label: string; multiplier: number }> = [
  { value: 'seconds', label: 'Seconds', multiplier: 1 },
  { value: 'minutes', label: 'Minutes', multiplier: 60 },
  { value: 'hours', label: 'Hours', multiplier: 3600 },
  { value: 'days', label: 'Days', multiplier: 86400 },
  { value: 'months', label: 'Months', multiplier: 2592000 },
];

const durationToSeconds = (value: number, unit: DurationUnit) => {
  const multiplier = durationUnits.find((item) => item.value === unit)?.multiplier || 1;
  return Math.max(0, Math.round((Number(value) || 0) * multiplier));
};

const toDateTimeLocalValue = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const secondsToDuration = (seconds: number): { value: number; unit: DurationUnit } => {
  const normalized = Math.max(0, Number(seconds || 0));
  const unit = [...durationUnits].reverse().find((item) => normalized >= item.multiplier && normalized % item.multiplier === 0) || durationUnits[0];
  return { value: normalized / unit.multiplier, unit: unit.value };
};

export function AccessControl() {
  const {
    accesses,
    accessCredentials,
    updateAccess,
    setAccesses,
    setAccessCredentials,
  } = useAppStore();
  const [selectedAccessId, setSelectedAccessId] = useState(accesses[0]?.id || '');
  const [paramsDraft, setParamsDraft] = useState('{}');
  const [qrName, setQrName] = useState(createDefaultQrName());
  const [validMode, setValidMode] = useState<'duration' | 'until'>('duration');
  const [periodValue, setPeriodValue] = useState(1);
  const [periodUnit, setPeriodUnit] = useState<DurationUnit>('hours');
  const [validUntilInput, setValidUntilInput] = useState(toDateTimeLocalValue(new Date(Date.now() + 3600 * 1000)));
  const [refreshValue, setRefreshValue] = useState(0);
  const [refreshUnit, setRefreshUnit] = useState<DurationUnit>('minutes');
  const [maxUses, setMaxUses] = useState(1);
  const [lastLink, setLastLink] = useState('');
  const [lastLatestQrLink, setLastLatestQrLink] = useState('');
  const [credentialModal, setCredentialModal] = useState<{ mode: 'view' | 'edit'; credential: AccessCredential } | null>(null);
  const [credentialDraft, setCredentialDraft] = useState<Partial<AccessCredential>>({});
  const [credentialLink, setCredentialLink] = useState('');
  const [credentialLatestQrLink, setCredentialLatestQrLink] = useState('');
  const [message, setMessage] = useState('');

  const selectedAccess = accesses.find((access) => access.id === selectedAccessId) || accesses[0];
  const credentials = useMemo(
    () => accessCredentials.filter((credential) => credential.accessId === selectedAccess?.id),
    [accessCredentials, selectedAccess?.id]
  );

  useEffect(() => {
    if (!selectedAccessId && accesses[0]) setSelectedAccessId(accesses[0].id);
  }, [accesses, selectedAccessId]);

  useEffect(() => {
    if (selectedAccess) {
      setParamsDraft(JSON.stringify(selectedAccess.extraParams || {}, null, 2));
    }
  }, [selectedAccess?.id]);

  const syncAccesses = async () => {
    const response = await fetch('/api/accesses');
    if (!response.ok) return;
    const payload = await response.json();
    setAccesses(payload.accesses || []);
    setAccessCredentials(payload.credentials || []);
  };

  const patchAccess = (accessId: string, patch: Partial<AccessDefinition>) => {
    updateAccess(accessId, patch);
    fetch(`/api/accesses/${accessId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => undefined);
  };

  useEffect(() => {
    syncAccesses().catch(() => undefined);
  }, []);

  const saveParams = async () => {
    if (!selectedAccess) return;
    try {
      const extraParams = JSON.parse(paramsDraft || '{}');
      updateAccess(selectedAccess.id, { extraParams });
      await fetch(`/api/accesses/${selectedAccess.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraParams }),
      });
      setMessage('Access parameters saved.');
    } catch {
      setMessage('Extra parameters must be valid JSON.');
    }
  };

  const createAccess = async () => {
    const access = createAccessDraft();
    const response = await fetch('/api/accesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(access),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || 'Failed to create access.');
      return;
    }
    setAccesses(payload.accesses || [payload.access, ...accesses]);
    setSelectedAccessId(payload.access?.id || access.id);
    setMessage('Access created.');
  };

  const removeAccess = async (accessId: string) => {
    const response = await fetch(`/api/accesses/${accessId}`, { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || 'Failed to delete access.');
      return;
    }
    setAccesses(payload.accesses || []);
    setAccessCredentials(payload.credentials || []);
    setSelectedAccessId(payload.accesses?.[0]?.id || '');
  };

  const generateCredential = async () => {
    if (!selectedAccess) return;
    setMessage('');
    const computedPeriodSeconds = validMode === 'until'
      ? Math.max(30, Math.round((new Date(validUntilInput).getTime() - Date.now()) / 1000))
      : Math.max(30, durationToSeconds(periodValue, periodUnit));
    const computedRefreshSeconds = refreshValue > 0 ? durationToSeconds(refreshValue, refreshUnit) : 0;
    await fetch(`/api/accesses/${selectedAccess.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedAccess),
    });
    const response = await fetch(`/api/accesses/${selectedAccess.id}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'qr',
        name: qrName,
        periodSeconds: computedPeriodSeconds,
        validUntil: validMode === 'until' ? new Date(validUntilInput).toISOString() : undefined,
        refreshIntervalSeconds: computedRefreshSeconds,
        maxUses,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || 'Failed to generate QR link.');
      return;
    }
    setAccessCredentials(payload.credentials || []);
    setLastLink(payload.link || '');
    setLastLatestQrLink(payload.latestQrLink || '');
    setQrName(createDefaultQrName());
    setMessage(payload.latestQrLink ? 'QR link generated. Latest QR page is available for rotating displays.' : 'QR link generated.');
  };

  const updateCredential = async (credentialId: string, patch: Partial<AccessCredential>) => {
    const response = await fetch(`/api/access-credentials/${credentialId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const payload = await response.json();
    if (response.ok) setAccessCredentials(payload.credentials || []);
  };

  const openCredentialModal = async (mode: 'view' | 'edit', credential: AccessCredential) => {
    setCredentialModal({ mode, credential });
    setCredentialDraft({ ...credential });
    setCredentialLink('');
    setCredentialLatestQrLink('');
    setMessage('');
    if (mode === 'view') {
      const response = await fetch(`/api/access-credentials/${credential.id}/link`);
      const payload = await response.json();
      if (response.ok) {
        setCredentialLink(payload.link || '');
        setCredentialLatestQrLink(payload.latestQrLink || '');
        if (payload.credentials) setAccessCredentials(payload.credentials);
      } else {
        setMessage(payload.error || 'QR link is not available.');
      }
    }
  };

  const saveCredentialDraft = async () => {
    if (!credentialModal) return;
    await updateCredential(credentialModal.credential.id, {
      name: credentialDraft.name,
      enabled: credentialDraft.enabled,
      periodSeconds: Number(credentialDraft.periodSeconds || 3600),
      validUntil: credentialDraft.validUntil,
      refreshIntervalSeconds: Number(credentialDraft.refreshIntervalSeconds || 0),
      maxUses: Number(credentialDraft.maxUses || 1),
    });
    setCredentialModal(null);
    setCredentialDraft({});
    setMessage('QR credential updated.');
  };

  const deleteCredential = async (credentialId: string) => {
    const response = await fetch(`/api/access-credentials/${credentialId}`, { method: 'DELETE' });
    const payload = await response.json();
    if (response.ok) setAccessCredentials(payload.credentials || []);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-6 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <KeyRound className="h-6 w-6 text-orange-500" />
            Access Control
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage access entries, QR credentials, and workflow trigger parameters.
          </p>
        </div>
        <button
          type="button"
          onClick={createAccess}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
        >
          <Plus className="h-4 w-4" />
          Add Access
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#1c2128]">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Access Entries</h2>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {accesses.map((access) => (
              <button
                type="button"
                key={access.id}
                onClick={() => setSelectedAccessId(access.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                  selectedAccess?.id === access.id
                    ? 'bg-orange-50 dark:bg-orange-500/10'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{access.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{access.method.toUpperCase()}</span>
                </span>
                <span className={cn('h-2.5 w-2.5 rounded-full', access.enabled ? 'bg-emerald-500' : 'bg-slate-400')} />
              </button>
            ))}
            {accesses.length === 0 && (
              <div className="p-6 text-sm text-slate-500 dark:text-slate-400">No access entries yet.</div>
            )}
          </div>
        </section>

        {selectedAccess && (
          <section className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#1c2128]">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Name</label>
                    <input
                      value={selectedAccess.name}
                      onChange={(event) => patchAccess(selectedAccess.id, { name: event.target.value })}
                      className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Method</label>
                    <select
                      value={selectedAccess.method}
                      onChange={(event) => patchAccess(selectedAccess.id, { method: event.target.value as AccessDefinition['method'] })}
                      className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="qr">QR Link</option>
                      <option value="caller_id">Caller ID</option>
                      <option value="sms">SMS</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => patchAccess(selectedAccess.id, { enabled: !selectedAccess.enabled })}
                    className={cn(
                      'h-10 rounded border px-4 text-sm font-semibold',
                      selectedAccess.enabled
                        ? 'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                        : 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    )}
                  >
                    {selectedAccess.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAccess(selectedAccess.id)}
                    className="h-10 rounded border border-red-200 px-3 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Extra Parameters JSON</label>
                <textarea
                  value={paramsDraft}
                  onChange={(event) => setParamsDraft(event.target.value)}
                  rows={7}
                  className="mt-1 w-full rounded border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={saveParams}
                    className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-orange-600 dark:hover:bg-orange-500"
                  >
                    Save Parameters
                  </button>
                  {message && <span className="text-sm text-slate-500 dark:text-slate-400">{message}</span>}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#1c2128]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <QrCode className="h-4 w-4 text-orange-500" />
                  QR Code Credentials
                </h2>
                <button
                  type="button"
                  onClick={generateCredential}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <RefreshCw className="h-4 w-4" />
                  Generate QR Link
                </button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">QR Name</label>
                  <input
                    value={qrName}
                    onChange={(event) => setQrName(event.target.value)}
                    placeholder="QR-20260609-A1B"
                    className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Internal display name for this QR credential.</p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Validity</label>
                  <div className="mt-1 grid gap-2 sm:grid-cols-[8rem_1fr]">
                    <select
                      value={validMode}
                      onChange={(event) => setValidMode(event.target.value as 'duration' | 'until')}
                      className="h-10 rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="duration">Duration</option>
                      <option value="until">Valid Until</option>
                    </select>
                    {validMode === 'duration' ? (
                      <div className="grid grid-cols-[1fr_8rem] gap-2">
                        <input
                          type="number"
                          min={1}
                          value={periodValue}
                          onChange={(event) => setPeriodValue(Number(event.target.value))}
                          className="h-10 rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                        <select
                          value={periodUnit}
                          onChange={(event) => setPeriodUnit(event.target.value as DurationUnit)}
                          className="h-10 rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        >
                          {durationUnits.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                        </select>
                      </div>
                    ) : (
                      <input
                        type="datetime-local"
                        value={validUntilInput}
                        onChange={(event) => setValidUntilInput(event.target.value)}
                        className="h-10 rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Set how long this QR credential remains valid.</p>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Refresh Interval</label>
                  <div className="mt-1 grid grid-cols-[1fr_8rem] gap-2">
                    <input
                      type="number"
                      min={0}
                      value={refreshValue}
                      onChange={(event) => setRefreshValue(Number(event.target.value))}
                      className="h-10 rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <select
                      value={refreshUnit}
                      onChange={(event) => setRefreshUnit(event.target.value as DurationUnit)}
                      className="h-10 rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      {durationUnits.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                    </select>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Use 0 for no refresh. Rotating QR pages require Allowed Visits greater than 1.</p>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Allowed Visits</label>
                  <input
                    type="number"
                    min={1}
                    value={maxUses}
                    onChange={(event) => setMaxUses(Number(event.target.value))}
                    className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Maximum accepted scans during this QR period.</p>
                </div>
              </div>

              {lastLink && (
                <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-500/30 dark:bg-orange-500/10">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(lastLink)}`}
                      alt="Generated QR code"
                      className="h-40 w-40 rounded bg-white p-2"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">QR Access Link</p>
                      <p className="mt-2 break-all font-mono text-xs text-slate-700 dark:text-slate-200">{lastLink}</p>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(lastLink)}
                        className="mt-3 inline-flex items-center gap-2 rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500"
                      >
                        <Copy className="h-4 w-4" />
                        Copy Link
                      </button>
                      {lastLatestQrLink && (
                        <div className="mt-4 rounded border border-orange-200 bg-white/70 p-3 dark:border-orange-500/30 dark:bg-slate-950/40">
                          <p className="text-xs font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">Latest QR Page</p>
                          <p className="mt-2 break-all font-mono text-xs text-slate-700 dark:text-slate-200">{lastLatestQrLink}</p>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(lastLatestQrLink)}
                            className="mt-3 inline-flex items-center gap-2 rounded border border-orange-300 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50 dark:border-orange-500/40 dark:text-orange-300 dark:hover:bg-orange-500/10"
                          >
                            <Copy className="h-4 w-4" />
                            Copy Latest QR Page
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-900/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Usage</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Valid Until</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {credentials.map((credential) => (
                      <tr key={credential.id}>
                        <td className="px-3 py-2 text-slate-900 dark:text-white">{credential.name}</td>
                        <td className="px-3 py-2 text-slate-500">{credential.usedCount}/{credential.maxUses}</td>
                        <td className="px-3 py-2 text-slate-500">{new Date(credential.validUntil).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => openCredentialModal('view', credential)} className="mr-2 inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700">
                            <Eye className="h-3 w-3" />
                            View
                          </button>
                          <button type="button" onClick={() => openCredentialModal('edit', credential)} className="mr-2 inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700">
                            <Edit2 className="h-3 w-3" />
                            Edit
                          </button>
                          <button type="button" onClick={() => deleteCredential(credential.id)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 dark:border-red-500/30">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {credentials.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-500">No QR credentials generated.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>

      {credentialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-[#1c2128]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {credentialModal.mode === 'view' ? 'View QR Credential' : 'Edit QR Credential'}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{credentialModal.credential.name}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCredentialModal(null);
                  setCredentialDraft({});
                  setCredentialLink('');
                }}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {credentialModal.mode === 'view' ? (
              <div className="space-y-4 p-5">
                {credentialLink ? (
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(credentialLink)}`}
                      alt="QR credential"
                      className="h-44 w-44 rounded bg-white p-2"
                    />
                    <div className="min-w-0 flex-1">
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">QR Link</label>
                      <p className="mt-2 break-all rounded border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                        {credentialLink}
                      </p>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(credentialLink)}
                        className="mt-3 inline-flex items-center gap-2 rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500"
                      >
                        <Copy className="h-4 w-4" />
                        Copy Link
                      </button>
                      {credentialLatestQrLink && (
                        <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                          <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Latest QR Page</label>
                          <p className="mt-2 break-all font-mono text-xs text-slate-700 dark:text-slate-200">{credentialLatestQrLink}</p>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(credentialLatestQrLink)}
                            className="mt-3 inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Copy className="h-4 w-4" />
                            Copy Latest QR Page
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                    {message || 'QR link is not available for this credential.'}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded border border-slate-200 p-3 text-sm dark:border-slate-800">
                    <span className="block text-xs text-slate-500">Usage</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{credentialModal.credential.usedCount}/{credentialModal.credential.maxUses}</span>
                  </div>
                  <div className="rounded border border-slate-200 p-3 text-sm dark:border-slate-800">
                    <span className="block text-xs text-slate-500">Valid Until</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{new Date(credentialModal.credential.validUntil).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 p-5">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">QR Name</label>
                  <input
                    value={credentialDraft.name || ''}
                    onChange={(event) => setCredentialDraft((current) => ({ ...current, name: event.target.value }))}
                    className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Valid Period</label>
                    <div className="mt-1 grid grid-cols-[1fr_7.5rem] gap-2">
                      <input
                        type="number"
                        min={1}
                        value={secondsToDuration(Number(credentialDraft.periodSeconds || 3600)).value}
                        onChange={(event) => {
                          const currentUnit = secondsToDuration(Number(credentialDraft.periodSeconds || 3600)).unit;
                          setCredentialDraft((current) => ({ ...current, periodSeconds: durationToSeconds(Number(event.target.value), currentUnit) }));
                        }}
                        className="h-10 rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                      <select
                        value={secondsToDuration(Number(credentialDraft.periodSeconds || 3600)).unit}
                        onChange={(event) => {
                          const currentValue = secondsToDuration(Number(credentialDraft.periodSeconds || 3600)).value;
                          setCredentialDraft((current) => ({ ...current, periodSeconds: durationToSeconds(currentValue, event.target.value as DurationUnit) }));
                        }}
                        className="h-10 rounded border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        {durationUnits.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Refresh Interval</label>
                    <div className="mt-1 grid grid-cols-[1fr_7.5rem] gap-2">
                      <input
                        type="number"
                        min={0}
                        value={secondsToDuration(Number(credentialDraft.refreshIntervalSeconds || 0)).value}
                        onChange={(event) => {
                          const currentUnit = secondsToDuration(Number(credentialDraft.refreshIntervalSeconds || 0)).unit;
                          setCredentialDraft((current) => ({ ...current, refreshIntervalSeconds: durationToSeconds(Number(event.target.value), currentUnit) }));
                        }}
                        className="h-10 rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                      <select
                        value={secondsToDuration(Number(credentialDraft.refreshIntervalSeconds || 0)).unit}
                        onChange={(event) => {
                          const currentValue = secondsToDuration(Number(credentialDraft.refreshIntervalSeconds || 0)).value;
                          setCredentialDraft((current) => ({ ...current, refreshIntervalSeconds: durationToSeconds(currentValue, event.target.value as DurationUnit) }));
                        }}
                        className="h-10 rounded border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        {durationUnits.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Allowed Visits</label>
                    <input
                      type="number"
                      min={1}
                      value={credentialDraft.maxUses ?? 1}
                      onChange={(event) => setCredentialDraft((current) => ({ ...current, maxUses: Number(event.target.value) }))}
                      className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <label className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Enabled</span>
                  <input
                    type="checkbox"
                    checked={credentialDraft.enabled !== false}
                    onChange={(event) => setCredentialDraft((current) => ({ ...current, enabled: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-600"
                  />
                </label>
                <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCredentialModal(null)}
                    className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveCredentialDraft}
                    className="rounded bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
                  >
                    Save QR
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
