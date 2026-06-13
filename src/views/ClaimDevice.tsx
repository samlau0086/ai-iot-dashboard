import React, { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, KeyRound, PackageCheck, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { buildProvisionedDevice, findManufacturedDeviceByIdentity, isClaimCodeValid } from '../lib/deviceProvisioning';
import { useAppStore, type ProvisioningAuditLog } from '../lib/store';
import { notifySuccess } from '../lib/toast';

const provisionLogId = () => `provision-log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function ClaimDevice() {
  const navigate = useNavigate();
  const {
    addDevice,
    addProvisioningAuditLog,
    activeSiteId,
    claimManufacturedDevice,
    currentUser,
    deviceModels,
    devices,
    manufacturedDevices,
    sites,
  } = useAppStore();

  const isPrivileged = ['Owner', 'Admin'].includes(currentUser?.role || '');
  const availableSites = useMemo(() => (
    isPrivileged ? sites : sites.filter((site) => site.id === currentUser?.siteId)
  ), [currentUser?.siteId, isPrivileged, sites]);
  const defaultSiteId = (isPrivileged ? activeSiteId : currentUser?.siteId) || availableSites[0]?.id || sites[0]?.id || 'factory-a';

  const [identity, setIdentity] = useState('');
  const [claimCode, setClaimCode] = useState('');
  const [siteId, setSiteId] = useState(defaultSiteId);
  const [message, setMessage] = useState('');
  const [claimedDeviceId, setClaimedDeviceId] = useState('');

  const writeAudit = (
    action: ProvisioningAuditLog['action'],
    result: ProvisioningAuditLog['result'],
    reason: string,
    manufacturedDeviceId?: string,
    platformDeviceId?: string
  ) => {
    addProvisioningAuditLog({
      id: provisionLogId(),
      manufacturedDeviceId,
      identity: identity.trim() || '-',
      action,
      result,
      reason,
      platformDeviceId,
      userId: currentUser?.id,
      userName: currentUser?.name,
      createdAt: new Date().toISOString(),
    });
  };

  const handleClaim = () => {
    setMessage('');
    setClaimedDeviceId('');
    const trimmedIdentity = identity.trim();
    if (!trimmedIdentity || !claimCode.trim()) {
      setMessage('Enter both MAC / IMEI / Serial Number and Claim Code.');
      return;
    }

    const manufacturedDevice = findManufacturedDeviceByIdentity(manufacturedDevices, trimmedIdentity);
    if (!manufacturedDevice) {
      setMessage('No manufactured device matched this identity.');
      writeAudit('claim_failed', 'failed', 'No manufactured device matched this identity.');
      return;
    }

    const model = deviceModels.find((item) => item.id === manufacturedDevice.modelId);
    if (!model) {
      setMessage('Matched inventory record, but its Device Model is missing.');
      writeAudit('claim_failed', 'failed', 'Matched inventory record, but its Device Model is missing.', manufacturedDevice.id);
      return;
    }

    if (manufacturedDevice.status === 'disabled') {
      setMessage('This manufactured device is disabled and cannot be claimed.');
      writeAudit('claim_failed', 'failed', 'This manufactured device is disabled and cannot be claimed.', manufacturedDevice.id);
      return;
    }

    if (manufacturedDevice.status === 'claimed' && manufacturedDevice.claimedDeviceId) {
      setMessage(`This device is already claimed by ${manufacturedDevice.claimedDeviceId}.`);
      writeAudit('claim_failed', 'failed', `Already claimed by ${manufacturedDevice.claimedDeviceId}.`, manufacturedDevice.id, manufacturedDevice.claimedDeviceId);
      return;
    }

    if (!isClaimCodeValid(manufacturedDevice.claimCode, claimCode)) {
      setMessage('Invalid Claim Code.');
      writeAudit('claim_failed', 'failed', 'Invalid Claim Code.', manufacturedDevice.id);
      return;
    }

    const selectedSite = availableSites.find((site) => site.id === siteId) || availableSites[0] || sites[0];
    if (!selectedSite) {
      setMessage('No available site for this user.');
      writeAudit('claim_failed', 'failed', 'No available site for this user.', manufacturedDevice.id);
      return;
    }

    const provisionedDevice = buildProvisionedDevice(manufacturedDevice, model, selectedSite);
    if (devices.some((device) => device.id === provisionedDevice.id)) {
      setMessage(`Platform device ${provisionedDevice.id} already exists.`);
      writeAudit('claim_failed', 'failed', `Platform device ${provisionedDevice.id} already exists.`, manufacturedDevice.id, provisionedDevice.id);
      return;
    }

    const newDevice = {
      ...provisionedDevice,
      siteId: selectedSite.id,
      tenantId: selectedSite.tenantId,
    };
    addDevice(newDevice);
    claimManufacturedDevice(manufacturedDevice.id, newDevice.id, newDevice.siteId, newDevice.tenantId, currentUser?.id);
    writeAudit('claim_success', 'success', 'Claimed through standalone claim page.', manufacturedDevice.id, newDevice.id);
    setClaimedDeviceId(newDevice.id);
    setMessage(`Device ${newDevice.name} claimed successfully.`);
    notifySuccess('Device claimed successfully.');
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-5 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
            <PackageCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Claim Device</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Bind a manufactured device to this dashboard by MAC, IMEI, or Serial Number.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#1c2128]">
          <div className="mb-5 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-orange-500" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Device Claim</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">MAC / IMEI / Serial Number</label>
              <input
                value={identity}
                onChange={(event) => setIdentity(event.target.value)}
                placeholder="SN202606130001"
                className="mt-1 block w-full rounded-md border-0 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Claim Code</label>
              <input
                value={claimCode}
                onChange={(event) => setClaimCode(event.target.value)}
                placeholder="CLM-XXXX-XXXX"
                className="mt-1 block w-full rounded-md border-0 bg-slate-50 px-3 py-2 font-mono text-sm uppercase text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Target Site</label>
              <select
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
                disabled={!isPrivileged}
                className="mt-1 block w-full rounded-md border-0 bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 disabled:cursor-not-allowed disabled:opacity-70 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
              >
                {availableSites.map((site) => (
                  <option key={site.id} value={site.id}>{site.name} / {site.tenantName}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleClaim}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
            >
              <ShieldCheck className="h-4 w-4" />
              Claim Device
            </button>
          </div>

          {message && (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              {message}
            </div>
          )}

          {claimedDeviceId && (
            <button
              type="button"
              onClick={() => navigate(`/devices/${claimedDeviceId}`, { state: { from: '/claim' } })}
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Open Device Details
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </section>

        <aside className="rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Claim Flow
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <div className="rounded-md bg-white p-3 dark:bg-slate-950">1. Match inventory by MAC, IMEI, or Serial Number.</div>
            <div className="rounded-md bg-white p-3 dark:bg-slate-950">2. Verify the Claim Code generated in Settings -> Provisioning.</div>
            <div className="rounded-md bg-white p-3 dark:bg-slate-950">3. Create the platform device from the model template.</div>
            <div className="rounded-md bg-white p-3 dark:bg-slate-950">4. Mark inventory as claimed and write an audit log.</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
