import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Edit2, Eye, KeyRound, Plus, QrCode, RefreshCw, Trash2, X } from 'lucide-react';
import { useAppStore, type AccessCredential, type AccessDefinition } from '../lib/store';
import { cn } from '../lib/utils';
import { confirmDelete } from '../lib/confirm';

const createAccessDraft = (): AccessDefinition => ({
  id: `access-${Date.now()}`,
  name: 'New Access',
  enabled: true,
  method: 'qr',
  aesKey: '',
  credentialGroups: ['operators', 'maintenance'],
  grantedMessage: 'Access granted.',
  deniedMessage: 'Access denied.',
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

const createDefaultNfcName = () => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const randomPart = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(2, 5).toUpperCase().padEnd(3, '0');
  return `NFC-${datePart}-${randomPart}`;
};

const methodLabels: Record<AccessDefinition['method'], string> = {
  qr: 'QR Link',
  nfc_basic: 'NFC URL',
  nfc: 'NFC · NTAG424 DNA URL Based',
  caller_id: 'Caller ID',
  sms: 'SMS',
};

const isNfcCredentialType = (type?: string) => type === 'nfc' || type === 'nfc_basic';
const isNfcDnaCredentialType = (type?: string) => type === 'nfc';

function InlineTags({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Add tag...',
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const normalized = value || [];
  const addTag = (tag: string) => {
    const nextTag = tag.trim();
    if (!nextTag || normalized.includes(nextTag)) return;
    onChange([...normalized, nextTag]);
    setDraft('');
  };
  const removeTag = (tag: string) => onChange(normalized.filter((item) => item !== tag));
  const unusedSuggestions = suggestions.filter((item) => item && !normalized.includes(item));

  return (
    <div className="rounded border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap gap-2">
        {normalized.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="text-orange-500 hover:text-orange-700">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              addTag(draft);
            }
          }}
          onBlur={() => addTag(draft)}
          placeholder={placeholder}
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none dark:text-white"
        />
      </div>
      {unusedSuggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unusedSuggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:border-orange-300 hover:text-orange-600 dark:border-slate-700 dark:text-slate-300"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NfcCredentialVisual({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn(
      'flex shrink-0 flex-col items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-center text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300',
      compact ? 'h-36 w-36 p-3' : 'h-44 w-44 p-4'
    )}>
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute h-16 w-16 rounded-full border border-cyan-300/70" />
        <span className="absolute h-11 w-11 rounded-full border border-cyan-400/80" />
        <span className="absolute h-6 w-6 rounded-full border border-cyan-500" />
        <KeyRound className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
      </div>
      <div className="mt-3 text-xs font-semibold uppercase tracking-wider">NFC URL</div>
      <div className="mt-1 text-[11px] leading-4 text-cyan-700/80 dark:text-cyan-200/80">NFC Tag</div>
    </div>
  );
}

type DurationUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'months';

type AccessEvent = {
  id: string;
  accessId?: string | null;
  accessName?: string;
  credentialId?: string | null;
  credentialName?: string;
  credentialType?: string;
  status: string;
  reason?: string | null;
  createdAt: string;
};

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
  const [credentialGroups, setCredentialGroups] = useState<string[]>([]);
  const [validMode, setValidMode] = useState<'duration' | 'until'>('duration');
  const [periodValue, setPeriodValue] = useState(1);
  const [periodUnit, setPeriodUnit] = useState<DurationUnit>('hours');
  const [validUntilInput, setValidUntilInput] = useState(toDateTimeLocalValue(new Date(Date.now() + 3600 * 1000)));
  const [refreshValue, setRefreshValue] = useState(0);
  const [refreshUnit, setRefreshUnit] = useState<DurationUnit>('minutes');
  const [maxUses, setMaxUses] = useState(1);
  const [rotateOnUse, setRotateOnUse] = useState(false);
  const [lastLink, setLastLink] = useState('');
  const [lastLatestQrLink, setLastLatestQrLink] = useState('');
  const [credentialModal, setCredentialModal] = useState<{ mode: 'view' | 'edit'; credential: AccessCredential } | null>(null);
  const [credentialDraft, setCredentialDraft] = useState<Partial<AccessCredential>>({});
  const [credentialLink, setCredentialLink] = useState('');
  const [credentialLatestQrLink, setCredentialLatestQrLink] = useState('');
  const [message, setMessage] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [accessEvents, setAccessEvents] = useState<AccessEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [eventCredentialFilter, setEventCredentialFilter] = useState('');
  const [activeAccessTab, setActiveAccessTab] = useState<'config' | 'qr' | 'records'>('config');
  const [credentialValidMode, setCredentialValidMode] = useState<'duration' | 'until'>('duration');

  const selectedAccess = accesses.find((access) => access.id === selectedAccessId) || accesses[0];
  const isNfcMethod = selectedAccess?.method === 'nfc' || selectedAccess?.method === 'nfc_basic';
  const isNfcDnaMethod = selectedAccess?.method === 'nfc';
  const selectedCredentialType = isNfcMethod ? (selectedAccess?.method || 'nfc_basic') : 'qr';
  const selectedAccessGroups = selectedAccess?.credentialGroups || [];
  const credentials = useMemo(
    () => accessCredentials.filter((credential) => credential.accessId === selectedAccess?.id),
    [accessCredentials, selectedAccess?.id]
  );
  const accessCredentialNames = useMemo(
    () => new Map(accessCredentials.map((credential) => [credential.id, credential.name])),
    [accessCredentials]
  );

  useEffect(() => {
    if (!selectedAccessId && accesses[0]) setSelectedAccessId(accesses[0].id);
  }, [accesses, selectedAccessId]);

  useEffect(() => {
    if (selectedAccess) {
      setParamsDraft(JSON.stringify(selectedAccess.extraParams || {}, null, 2));
      setQrName((selectedAccess.method === 'nfc' || selectedAccess.method === 'nfc_basic') ? createDefaultNfcName() : createDefaultQrName());
      setCredentialGroups([]);
    }
  }, [selectedAccess?.id, selectedAccess?.method]);

  const syncAccesses = async () => {
    const response = await fetch('/api/accesses');
    if (!response.ok) return;
    const payload = await response.json();
    setAccesses(payload.accesses || []);
    setAccessCredentials(payload.credentials || []);
  };

  const loadAccessEvents = async (accessId: string, credentialId = eventCredentialFilter) => {
    setEventsLoading(true);
    setEventsError('');
    try {
      const params = new URLSearchParams({ accessId, limit: '100' });
      if (credentialId) params.set('credentialId', credentialId);
      const response = await fetch(`/api/access-events?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to load access events.');
      setAccessEvents(Array.isArray(payload.events) ? payload.events : []);
    } catch (error) {
      setAccessEvents([]);
      setEventsError(error instanceof Error ? error.message : 'Failed to load access events.');
    } finally {
      setEventsLoading(false);
    }
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

  useEffect(() => {
    if (!selectedAccess?.id) {
      setAccessEvents([]);
      return;
    }
    loadAccessEvents(selectedAccess.id, eventCredentialFilter);
  }, [selectedAccess?.id, eventCredentialFilter]);

  useEffect(() => {
    if (eventCredentialFilter && !credentials.some((credential) => credential.id === eventCredentialFilter)) {
      setEventCredentialFilter('');
    }
  }, [credentials, eventCredentialFilter]);

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
    const access = accesses.find((item) => item.id === accessId);
    if (!(await confirmDelete({ title: 'Delete access', itemName: access?.name || 'this access', description: 'Credentials, QR/NFC links, and access records for this access will be removed.' }))) return;
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
    const computedRefreshSeconds = selectedCredentialType === 'nfc' || selectedCredentialType === 'nfc_basic' ? 0 : refreshValue > 0 ? durationToSeconds(refreshValue, refreshUnit) : 0;
    await fetch(`/api/accesses/${selectedAccess.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedAccess),
    });
    const response = await fetch(`/api/accesses/${selectedAccess.id}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: selectedCredentialType,
        name: qrName,
        groups: credentialGroups,
        periodSeconds: computedPeriodSeconds,
        validUntil: validMode === 'until' ? new Date(validUntilInput).toISOString() : undefined,
        refreshIntervalSeconds: computedRefreshSeconds,
        maxUses,
        rotateOnUse,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || 'Failed to generate credential link.');
      return;
    }
    setAccessCredentials(payload.credentials || []);
    setLastLink(payload.link || '');
    setLastLatestQrLink(payload.latestQrLink || '');
    setQrName(selectedCredentialType === 'nfc' || selectedCredentialType === 'nfc_basic' ? createDefaultNfcName() : createDefaultQrName());
    setCredentialGroups([]);
    setMessage(selectedCredentialType === 'nfc'
      ? 'NFC DNA URL generated. Write this URL to the NTAG424 DNA tag.'
      : selectedCredentialType === 'nfc_basic'
        ? 'NFC URL generated. Write this URL to the NFC tag.'
      : payload.latestQrLink ? 'QR link generated. Latest QR page is available for rotating displays.' : 'QR link generated.');
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

  const formatEventTime = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
  };

  const openCredentialModal = async (mode: 'view' | 'edit', credential: AccessCredential) => {
    setCredentialModal({ mode, credential });
    setCredentialDraft({ ...credential });
    setCredentialValidMode('duration');
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
        setMessage(payload.error || 'Credential link is not available.');
      }
    }
  };

  const saveCredentialDraft = async () => {
    if (!credentialModal) return;
    const nextPeriodSeconds = Number(credentialDraft.periodSeconds || 3600);
    await updateCredential(credentialModal.credential.id, {
      name: credentialDraft.name,
      enabled: credentialDraft.enabled,
      groups: credentialDraft.groups,
      periodSeconds: nextPeriodSeconds,
      validUntil: credentialValidMode === 'until'
        ? credentialDraft.validUntil
        : new Date(Date.now() + nextPeriodSeconds * 1000).toISOString(),
      refreshIntervalSeconds: Number(credentialDraft.refreshIntervalSeconds || 0),
      maxUses: Number(credentialDraft.maxUses || 1),
      rotateOnUse: Boolean(credentialDraft.rotateOnUse),
    });
    setCredentialModal(null);
    setCredentialDraft({});
    setMessage('Credential updated.');
  };

  const deleteCredential = async (credentialId: string) => {
    const credential = accessCredentials.find((item) => item.id === credentialId);
    if (!(await confirmDelete({ title: 'Delete credential', itemName: credential?.name || 'this credential', description: 'The credential link and related access logs will be removed.' }))) return;
    const response = await fetch(`/api/access-credentials/${credentialId}`, { method: 'DELETE' });
    const payload = await response.json();
    if (response.ok) {
      setAccessCredentials(payload.credentials || []);
      if (eventCredentialFilter === credentialId) setEventCredentialFilter('');
      if (selectedAccess?.id) loadAccessEvents(selectedAccess.id, eventCredentialFilter === credentialId ? '' : eventCredentialFilter);
    }
  };

  const clearAccessEvents = async () => {
    if (!selectedAccess) return;
    if (!(await confirmDelete({
      title: 'Clear access records',
      itemName: eventCredentialFilter ? 'records for the selected credential' : `all records for ${selectedAccess.name}`,
      description: 'Access history will be permanently cleared.',
    }))) return;
    const params = new URLSearchParams({ accessId: selectedAccess.id });
    if (eventCredentialFilter) params.set('credentialId', eventCredentialFilter);
    const response = await fetch(`/api/access-events?${params.toString()}`, { method: 'DELETE' });
    if (response.ok) {
      setAccessEvents([]);
      setMessage(eventCredentialFilter ? 'Credential access records cleared.' : 'Access records cleared.');
    } else {
      setEventsError('Failed to clear access records.');
    }
  };

  const copyToClipboard = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setMessage('Copied to clipboard.');
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? '' : current));
      }, 1800);
    } catch {
      setMessage('Copy failed. Please copy the link manually.');
    }
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
                onClick={() => {
                  setSelectedAccessId(access.id);
                  setActiveAccessTab('config');
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                  selectedAccess?.id === access.id
                    ? 'bg-orange-50 dark:bg-orange-500/10'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{access.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{methodLabels[access.method] || access.method.toUpperCase()}</span>
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
            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-[#1c2128]">
              {[
                { id: 'config', label: 'Access Config' },
                { id: 'qr', label: 'Credentials' },
                { id: 'records', label: 'Access Records' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveAccessTab(tab.id as typeof activeAccessTab)}
                  className={cn(
                    'rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                    activeAccessTab === tab.id
                      ? 'bg-orange-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeAccessTab === 'config' && (
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
                      <option value="nfc_basic">NFC URL</option>
                      <option value="nfc">NFC · NTAG424 DNA URL Based</option>
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

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {isNfcDnaMethod && (
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">AES Key</label>
                    <input
                      value={selectedAccess.aesKey || ''}
                      onChange={(event) => patchAccess(selectedAccess.id, { aesKey: event.target.value })}
                      placeholder="32 hex chars for AES-128 CMAC validation"
                      className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Used to verify NTAG424 DNA UID Mirror + Counter Mirror CMAC before triggering workflows.</p>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Available Credential Groups</label>
                  <div className="mt-1">
                    <InlineTags
                      value={selectedAccess.credentialGroups || []}
                      onChange={(credentialGroups) => patchAccess(selectedAccess.id, { credentialGroups })}
                      placeholder="operators, maintenance..."
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Credentials under this Access can be assigned to these groups. Workflows can read them from trigger output.</p>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Access Granted Message</label>
                  <input
                    value={selectedAccess.grantedMessage || ''}
                    onChange={(event) => patchAccess(selectedAccess.id, { grantedMessage: event.target.value })}
                    placeholder="Access granted."
                    className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Shown on the QR page after a successful access.</p>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Access Denied Message</label>
                  <input
                    value={selectedAccess.deniedMessage || ''}
                    onChange={(event) => patchAccess(selectedAccess.id, { deniedMessage: event.target.value })}
                    placeholder="Access denied."
                    className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Shown on the QR page when this Access rejects a scan.</p>
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
            )}

            {activeAccessTab === 'qr' && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#1c2128]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <QrCode className="h-4 w-4 text-orange-500" />
                  {isNfcMethod ? 'NFC Tag Credentials' : 'QR Code Credentials'}
                </h2>
                <button
                  type="button"
                  onClick={generateCredential}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <RefreshCw className="h-4 w-4" />
                  {isNfcMethod ? 'Generate NFC URL' : 'Generate QR Link'}
                </button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{isNfcMethod ? 'NFC Tag Name' : 'QR Name'}</label>
                  <input
                    value={qrName}
                    onChange={(event) => setQrName(event.target.value)}
                    placeholder={isNfcMethod ? 'NFC-20260609-A1B' : 'QR-20260609-A1B'}
                    className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Internal display name for this credential.</p>
                </div>
                <div className={isNfcMethod ? 'md:col-span-3' : ''}>
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Credential Groups</label>
                  <div className="mt-1">
                    <InlineTags
                      value={credentialGroups}
                      onChange={setCredentialGroups}
                      suggestions={selectedAccessGroups}
                      placeholder="Add group..."
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Included in QR/NFC Access trigger output as credentialGroups.</p>
                  {isNfcDnaMethod && (
                    <p className="mt-1 text-xs text-cyan-600 dark:text-cyan-300">Tag UID is auto-bound from the first verified NFC tap.</p>
                  )}
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
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Set how long this credential remains valid.</p>
                </div>
                {!isNfcMethod && (
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
                )}
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Allowed Visits</label>
                  <input
                    type="number"
                    min={1}
                    value={maxUses}
                    onChange={(event) => setMaxUses(Number(event.target.value))}
                    className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Maximum accepted visits during this credential period.</p>
                </div>
                {!isNfcMethod && (
                <label className="flex min-h-[5.5rem] items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                  <span>
                    <span className="block text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Invalidate QR After Scan</span>
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">After a successful scan, rotate the access link so the old QR code cannot be reused.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={rotateOnUse}
                    onChange={(event) => setRotateOnUse(event.target.checked)}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-orange-600 focus:ring-orange-600"
                  />
                </label>
                )}
              </div>

              {lastLink && (
                <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-500/30 dark:bg-orange-500/10">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                    {isNfcMethod ? (
                      <NfcCredentialVisual compact />
                    ) : (
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(lastLink)}`}
                        alt="Generated QR code"
                        className="h-40 w-40 rounded bg-white p-2"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">{isNfcMethod ? 'NFC URL' : 'QR Access Link'}</p>
                      <p className="mt-2 break-all font-mono text-xs text-slate-700 dark:text-slate-200">{lastLink}</p>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(lastLink, 'last-link')}
                        className="mt-3 inline-flex items-center gap-2 rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500"
                      >
                        {copiedKey === 'last-link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiedKey === 'last-link' ? 'Copied' : 'Copy Link'}
                      </button>
                      {lastLatestQrLink && (
                        <div className="mt-4 rounded border border-orange-200 bg-white/70 p-3 dark:border-orange-500/30 dark:bg-slate-950/40">
                          <p className="text-xs font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">Latest QR Page</p>
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(lastLatestQrLink)}`}
                            alt="Latest QR page code"
                            className="mt-3 h-36 w-36 rounded bg-white p-2"
                          />
                          <p className="mt-2 break-all font-mono text-xs text-slate-700 dark:text-slate-200">{lastLatestQrLink}</p>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(lastLatestQrLink, 'last-latest-link')}
                            className="mt-3 inline-flex items-center gap-2 rounded border border-orange-300 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50 dark:border-orange-500/40 dark:text-orange-300 dark:hover:bg-orange-500/10"
                          >
                            {copiedKey === 'last-latest-link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copiedKey === 'last-latest-link' ? 'Copied' : 'Copy Latest QR Page'}
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
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Type</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Groups / UID</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Usage</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Valid Until</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {credentials.map((credential) => (
                      <tr key={credential.id}>
                        <td className="px-3 py-2 text-slate-900 dark:text-white">{credential.name}</td>
                        <td className="px-3 py-2 text-slate-500 uppercase">{credential.type}</td>
                        <td className="px-3 py-2 text-slate-500">
                          <div className="flex flex-wrap gap-1">
                            {(credential.groups || []).map((group) => (
                              <span key={group} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] dark:bg-slate-800">{group}</span>
                            ))}
                          </div>
                          {credential.tagId && <div className="mt-1 font-mono text-[10px]">UID {credential.tagId}</div>}
                          {isNfcDnaCredentialType(credential.type) && (
                            <div className="mt-1 text-[10px] text-slate-400">last ctr {credential.lastCounter ?? '-'}</div>
                          )}
                        </td>
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
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-500">No credentials generated.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {activeAccessTab === 'records' && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#1c2128]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <Eye className="h-4 w-4 text-orange-500" />
                  Access Records
                </h2>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={eventCredentialFilter}
                    onChange={(event) => setEventCredentialFilter(event.target.value)}
                    className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="">All Credentials</option>
                    {credentials.map((credential) => (
                      <option key={credential.id} value={credential.id}>{credential.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => loadAccessEvents(selectedAccess.id, eventCredentialFilter)}
                    disabled={eventsLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className={cn("h-4 w-4", eventsLoading && "animate-spin")} />
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={clearAccessEvents}
                    disabled={eventsLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-500/30 dark:hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Records
                  </button>
                </div>
              </div>

              {eventsError && (
                <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {eventsError}
                </div>
              )}

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-900/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Credential</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Access Time</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Status</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {accessEvents.map((event) => (
                      <tr key={event.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900 dark:text-white">
                            {event.credentialName || (event.credentialId ? accessCredentialNames.get(event.credentialId) : '') || 'Unknown Credential'}
                          </div>
                          {event.credentialId && (
                            <div className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">{event.credentialId}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{formatEventTime(event.createdAt)}</td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            'rounded-full border px-2 py-0.5 text-xs font-semibold capitalize',
                            event.status === 'accepted'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
                          )}>
                            {event.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{event.reason || '-'}</td>
                      </tr>
                    ))}
                    {eventsLoading && accessEvents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-500">Loading access records...</td>
                      </tr>
                    )}
                    {!eventsLoading && accessEvents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-500">No QR access records yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </section>
        )}
      </div>

      {credentialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-[#1c2128]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {credentialModal.mode === 'view' ? 'View Credential' : 'Edit Credential'}
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
                    {isNfcCredentialType(credentialModal.credential.type) ? (
                      <NfcCredentialVisual />
                    ) : (
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(credentialLink)}`}
                        alt="QR credential"
                        className="h-44 w-44 rounded bg-white p-2"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{isNfcCredentialType(credentialModal.credential.type) ? 'NFC URL' : 'QR Link'}</label>
                      <p className="mt-2 break-all rounded border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                        {credentialLink}
                      </p>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(credentialLink, 'credential-link')}
                        className="mt-3 inline-flex items-center gap-2 rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500"
                      >
                        {copiedKey === 'credential-link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiedKey === 'credential-link' ? 'Copied' : 'Copy Link'}
                      </button>
                      {credentialLatestQrLink && (
                        <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                          <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Latest QR Page</label>
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(credentialLatestQrLink)}`}
                            alt="Latest QR page code"
                            className="mt-3 h-36 w-36 rounded bg-white p-2"
                          />
                          <p className="mt-2 break-all font-mono text-xs text-slate-700 dark:text-slate-200">{credentialLatestQrLink}</p>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(credentialLatestQrLink, 'credential-latest-link')}
                            className="mt-3 inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            {copiedKey === 'credential-latest-link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copiedKey === 'credential-latest-link' ? 'Copied' : 'Copy Latest QR Page'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                    {message || 'Credential link is not available for this credential.'}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {isNfcDnaCredentialType(credentialModal.credential.type) && (
                    <div className="rounded border border-slate-200 p-3 text-sm dark:border-slate-800">
                      <span className="block text-xs text-slate-500">Tag UID</span>
                      <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{credentialModal.credential.tagId || '-'}</span>
                    </div>
                  )}
                  {isNfcDnaCredentialType(credentialModal.credential.type) && (
                    <div className="rounded border border-slate-200 p-3 text-sm dark:border-slate-800">
                      <span className="block text-xs text-slate-500">Last Counter</span>
                      <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{credentialModal.credential.lastCounter ?? '-'}</span>
                    </div>
                  )}
                  {(credentialModal.credential.groups || []).length > 0 && (
                    <div className="rounded border border-slate-200 p-3 text-sm dark:border-slate-800">
                      <span className="block text-xs text-slate-500">Groups</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{(credentialModal.credential.groups || []).join(', ')}</span>
                    </div>
                  )}
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
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Credential Name</label>
                  <input
                    value={credentialDraft.name || ''}
                    onChange={(event) => setCredentialDraft((current) => ({ ...current, name: event.target.value }))}
                    className="mt-1 h-10 w-full rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Credential Groups</label>
                  <div className="mt-1">
                    <InlineTags
                      value={credentialDraft.groups || []}
                      onChange={(groups) => setCredentialDraft((current) => ({ ...current, groups }))}
                      suggestions={selectedAccessGroups}
                      placeholder="Add group..."
                    />
                  </div>
                  {isNfcDnaCredentialType(credentialModal.credential.type) && (
                    <p className="mt-1 text-xs text-cyan-600 dark:text-cyan-300">UID is auto-bound by the first verified tap and is not edited manually.</p>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Validity</label>
                    <div className="mt-1 grid gap-2 sm:grid-cols-[8rem_1fr]">
                      <select
                        value={credentialValidMode}
                        onChange={(event) => setCredentialValidMode(event.target.value as 'duration' | 'until')}
                        className="h-10 rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        <option value="duration">Duration</option>
                        <option value="until">Valid Until</option>
                      </select>
                      {credentialValidMode === 'duration' ? (
                        <div className="grid grid-cols-[1fr_7.5rem] gap-2">
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
                      ) : (
                        <input
                          type="datetime-local"
                          value={credentialDraft.validUntil ? toDateTimeLocalValue(new Date(credentialDraft.validUntil)) : toDateTimeLocalValue(new Date(Date.now() + Number(credentialDraft.periodSeconds || 3600) * 1000))}
                          onChange={(event) => setCredentialDraft((current) => ({ ...current, validUntil: new Date(event.target.value).toISOString() }))}
                          className="h-10 rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      )}
                    </div>
                  </div>
                  {!isNfcCredentialType(credentialModal.credential.type) && (
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
                  )}
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
                  {!isNfcCredentialType(credentialModal.credential.type) && (
                  <label className="flex items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                    <span>
                      <span className="block font-medium text-slate-700 dark:text-slate-300">Invalidate QR After Scan</span>
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Successful scans rotate the access link and invalidate the old QR code.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(credentialDraft.rotateOnUse)}
                      onChange={(event) => setCredentialDraft((current) => ({ ...current, rotateOnUse: event.target.checked }))}
                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-orange-600 focus:ring-orange-600"
                    />
                  </label>
                  )}
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
                    Save Credential
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
