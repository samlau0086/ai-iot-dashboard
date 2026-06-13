import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, KeyRound, PackageCheck, ScanLine, ShieldCheck, Wand2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { buildProvisionedDevice, findManufacturedDeviceByClaimToken, findManufacturedDeviceByIdentity, isClaimCodeValid } from '../lib/deviceProvisioning';
import { useAppStore, type ProvisioningAuditLog } from '../lib/store';
import { notifySuccess } from '../lib/toast';
import { getUserAppProfile } from '../lib/featureAccess';
import { getDeviceIcon } from '../lib/icons';
import { cn } from '../lib/utils';

const provisionLogId = () => `provision-log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function ClaimDevice() {
  const navigate = useNavigate();
  const { token } = useParams();
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

  const identityInputRef = useRef<HTMLInputElement | null>(null);
  const isSimpleProfile = getUserAppProfile(currentUser) === 'simple';
  const isPrivileged = ['Owner', 'Admin'].includes(currentUser?.role || '');
  const availableSites = useMemo(() => (
    isPrivileged
      ? sites
      : currentUser?.siteId
        ? sites.filter((site) => site.id === currentUser.siteId)
        : sites.slice(0, 1)
  ), [currentUser?.siteId, isPrivileged, sites]);
  const defaultSiteId = (isPrivileged ? activeSiteId : currentUser?.siteId) || availableSites[0]?.id || sites[0]?.id || 'factory-a';
  const tokenManufacturedDevice = useMemo(
    () => findManufacturedDeviceByClaimToken(manufacturedDevices, token),
    [manufacturedDevices, token]
  );

  const [identity, setIdentity] = useState('');
  const [claimCode, setClaimCode] = useState('');
  const [siteId, setSiteId] = useState(defaultSiteId);
  const [message, setMessage] = useState('');
  const [claimedDeviceId, setClaimedDeviceId] = useState('');

  const trimmedIdentity = identity.trim();
  const matchedManufacturedDevice = tokenManufacturedDevice || findManufacturedDeviceByIdentity(manufacturedDevices, trimmedIdentity);
  const matchedDeviceModel = matchedManufacturedDevice
    ? deviceModels.find((item) => item.id === matchedManufacturedDevice.modelId)
    : null;
  const selectedSite = availableSites.find((site) => site.id === siteId) || availableSites[0] || sites[0];
  const previewDevice = matchedManufacturedDevice && matchedDeviceModel && selectedSite
    ? buildProvisionedDevice(matchedManufacturedDevice, matchedDeviceModel, selectedSite)
    : null;
  const PreviewIcon = previewDevice ? getDeviceIcon(previewDevice.icon) : PackageCheck;
  const claimCodeRequired = Boolean(matchedManufacturedDevice?.claimCode);

  useEffect(() => {
    if (!tokenManufacturedDevice) return;
    setIdentity(tokenManufacturedDevice.serialNumber || tokenManufacturedDevice.imei || tokenManufacturedDevice.mac || '');
  }, [tokenManufacturedDevice]);

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
    if (token && !tokenManufacturedDevice) {
      setMessage('This claim link is invalid or has been regenerated.');
      writeAudit('claim_failed', 'failed', 'Invalid claim token.');
      return;
    }
    if (!tokenManufacturedDevice && !trimmedIdentity) {
      setMessage('Scan or enter MAC / IMEI / Serial Number first.');
      return;
    }

    const manufacturedDevice = tokenManufacturedDevice || findManufacturedDeviceByIdentity(manufacturedDevices, trimmedIdentity);
    if (!manufacturedDevice) {
      setMessage(token ? 'This claim link is invalid or has been regenerated.' : 'No manufactured device matched this identity.');
      writeAudit('claim_failed', 'failed', token ? 'Invalid claim token.' : 'No manufactured device matched this identity.');
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

    if (manufacturedDevice.claimCode && !claimCode.trim()) {
      setMessage('Enter the Claim Code printed on the device label.');
      writeAudit('claim_failed', 'failed', 'Claim Code is required.', manufacturedDevice.id);
      return;
    }

    if (manufacturedDevice.claimCode && !isClaimCodeValid(manufacturedDevice.claimCode, claimCode)) {
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
    if (isSimpleProfile) {
      navigate(`/devices/${newDevice.id}`, { state: { from: '/claim', justClaimed: true } });
    }
  };

  return (
    <div className={cn('mx-auto space-y-6', isSimpleProfile ? 'max-w-3xl pb-10' : 'max-w-5xl')}>
      <div className={cn('flex flex-col gap-2 border-b border-slate-200 pb-5 dark:border-slate-800', isSimpleProfile && 'border-0 pb-0')}>
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-10 w-10 items-center justify-center bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
            isSimpleProfile ? 'rounded-2xl' : 'rounded-md'
          )}>
            <PackageCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className={cn('font-bold text-slate-900 dark:text-white', isSimpleProfile ? 'text-2xl' : 'text-2xl')}>{isSimpleProfile ? 'Add Device' : 'Claim Device'}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isSimpleProfile
                ? 'Scan or enter the code on your device label to finish setup.'
                : 'Bind a manufactured device to this dashboard by Claim Link or MAC, IMEI, Serial Number.'}
            </p>
          </div>
        </div>
      </div>

      <div className={cn('grid gap-6', isSimpleProfile ? 'grid-cols-1' : 'lg:grid-cols-[1.1fr_0.9fr]')}>
        <section className={cn(
          'border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#1c2128]',
          isSimpleProfile ? 'rounded-3xl' : 'rounded-lg'
        )}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-orange-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">{isSimpleProfile ? 'Device Setup' : 'Device Claim'}</h2>
            </div>
            <button
              type="button"
              onClick={() => identityInputRef.current?.focus()}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ScanLine className="h-4 w-4" />
              Scan
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">MAC / IMEI / Serial Number</label>
              <input
                ref={identityInputRef}
                value={identity}
                onChange={(event) => setIdentity(event.target.value)}
                readOnly={Boolean(tokenManufacturedDevice)}
                placeholder="SN202606130001"
                className={cn(
                  'mt-1 block w-full border-0 bg-slate-50 px-3 font-mono text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 read-only:cursor-not-allowed read-only:opacity-70 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700',
                  isSimpleProfile ? 'h-14 rounded-2xl py-3 text-base' : 'rounded-md py-2 text-sm'
                )}
              />
              {token && (
                <p className="mt-1 text-xs text-slate-500">
                  {tokenManufacturedDevice ? 'Loaded from Claim Link. Verify the Claim Code to continue.' : 'Claim Link token was not found.'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Claim Code {claimCodeRequired ? '' : '(if printed on label)'}
              </label>
              <input
                value={claimCode}
                onChange={(event) => setClaimCode(event.target.value)}
                placeholder="CLM-XXXX-XXXX"
                className={cn(
                  'mt-1 block w-full border-0 bg-slate-50 px-3 font-mono uppercase text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700',
                  isSimpleProfile ? 'h-14 rounded-2xl py-3 text-base' : 'rounded-md py-2 text-sm'
                )}
              />
              <p className="mt-1 text-xs text-slate-500">
                {claimCodeRequired ? 'Required for this device.' : 'Leave blank when the device label does not include a Claim Code.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Target Site</label>
              <select
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
                disabled={!isPrivileged}
                className={cn(
                  'mt-1 block w-full border-0 bg-slate-50 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 disabled:cursor-not-allowed disabled:opacity-70 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700',
                  isSimpleProfile ? 'h-12 rounded-2xl text-base' : 'rounded-md py-2 text-sm'
                )}
              >
                {availableSites.map((site) => (
                  <option key={site.id} value={site.id}>{site.name} / {site.tenantName}</option>
                ))}
              </select>
              {!isPrivileged && (
                <p className="mt-1 text-xs text-slate-500">This device will be added to your assigned Site.</p>
              )}
            </div>

            {(trimmedIdentity || token) && (
              <div className={cn(
                'border p-4',
                previewDevice
                  ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                  : 'border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10',
                isSimpleProfile ? 'rounded-2xl' : 'rounded-lg'
              )}>
                {previewDevice && matchedDeviceModel ? (
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-orange-600 ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-slate-800">
                      <PreviewIcon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900 dark:text-white">{previewDevice.name}</p>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-slate-950 dark:text-emerald-300">
                          Matched
                        </span>
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                        <div>Model: {matchedDeviceModel.name}</div>
                        <div>Type: {matchedDeviceModel.deviceType.replace(/_/g, ' ')}</div>
                        <div>Data: {matchedDeviceModel.dataSource.toUpperCase()} / {matchedDeviceModel.protocol || previewDevice.config?.protocol || '-'}</div>
                        <div>Site: {selectedSite?.name || previewDevice.siteId}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 text-sm text-amber-800 dark:text-amber-200">
                    <Wand2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">No inventory match yet.</p>
                      <p className="mt-1 text-xs">Check the MAC / IMEI / Serial Number, or ask an administrator to import this manufactured device first.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleClaim}
              className={cn(
                'inline-flex w-full items-center justify-center gap-2 bg-orange-600 px-4 font-semibold text-white shadow-sm hover:bg-orange-500',
                isSimpleProfile ? 'h-14 rounded-2xl text-base' : 'rounded-md py-2.5 text-sm'
              )}
            >
              <ShieldCheck className="h-4 w-4" />
              {isSimpleProfile ? 'Add Device' : 'Claim Device'}
            </button>
          </div>

          {message && (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              {message}
            </div>
          )}

          {claimedDeviceId && !isSimpleProfile && (
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

        {!isSimpleProfile && <aside className="rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Claim Flow
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <div className="rounded-md bg-white p-3 dark:bg-slate-950">1. Match inventory by Claim Link token, MAC, IMEI, or Serial Number.</div>
            <div className="rounded-md bg-white p-3 dark:bg-slate-950">2. Verify the Claim Code generated in Settings -> Provisioning.</div>
            <div className="rounded-md bg-white p-3 dark:bg-slate-950">3. Create the platform device from the model template.</div>
            <div className="rounded-md bg-white p-3 dark:bg-slate-950">4. Mark inventory as claimed and write an audit log.</div>
          </div>
        </aside>}
      </div>
    </div>
  );
}
