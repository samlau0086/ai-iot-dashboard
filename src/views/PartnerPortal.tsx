import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Copy,
  CreditCard,
  Globe2,
  Handshake,
  Palette,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import {
  useAppStore,
  type PartnerBillingPlan,
  type PartnerCustomer,
  type PartnerInvoice,
  type PartnerProject,
  type User,
  type WhiteLabelConfig,
} from '../lib/store';
import { APP_PROFILE_OPTIONS, FEATURE_ACCESS_OPTIONS, getUserFeatureAccess, type AppProfile, type FeatureNavKey } from '../lib/featureAccess';
import { cn } from '../lib/utils';
import { confirmDelete } from '../lib/confirm';
import { notify, notifySuccess } from '../lib/toast';

const CUSTOMER_STATUSES: PartnerCustomer['status'][] = ['prospect', 'active', 'paused', 'archived'];
const CUSTOMER_PLANS: PartnerCustomer['plan'][] = ['starter', 'operations', 'automation', 'enterprise'];
const PROJECT_TYPES: PartnerProject['type'][] = ['deployment', 'maintenance', 'retrofit', 'integration', 'support'];
const PROJECT_STATUSES: PartnerProject['status'][] = ['draft', 'quoted', 'won', 'in_progress', 'delivered', 'lost'];
const BILLING_CYCLES: PartnerBillingPlan['billingCycle'][] = ['monthly', 'quarterly', 'yearly', 'one_time'];
const BILLING_PLAN_STATUSES: PartnerBillingPlan['status'][] = ['active', 'draft', 'archived'];
const INVOICE_STATUSES: PartnerInvoice['status'][] = ['draft', 'open', 'paid', 'overdue', 'void'];
const DOMAIN_STATUSES: WhiteLabelConfig['domainStatus'][] = ['not_configured', 'pending_dns', 'active', 'error'];
const CUSTOMER_ACCOUNT_ROLES = ['Customer', 'Operator', 'Viewer'] as const;

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const splitCsv = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

const money = (value?: number, currency = 'USD') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
  } catch {
    return `${currency || 'USD'} ${amount.toLocaleString('en-US')}`;
  }
};

export function PartnerPortal() {
  const {
    partnerCustomers,
    partnerProjects,
    partnerBillingPlans,
    partnerInvoices,
    whiteLabelConfig,
    sites,
    users,
    devices,
    addPartnerCustomer,
    updatePartnerCustomer,
    deletePartnerCustomer,
    addPartnerProject,
    updatePartnerProject,
    deletePartnerProject,
    addPartnerBillingPlan,
    updatePartnerBillingPlan,
    deletePartnerBillingPlan,
    addPartnerInvoice,
    updatePartnerInvoice,
    deletePartnerInvoice,
    updateWhiteLabelConfig,
    addUser,
    updateUser,
    deleteUser,
    approveUser,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'customers' | 'accounts' | 'projects' | 'billing' | 'branding' | 'permissions'>('customers');
  const [customerDraft, setCustomerDraft] = useState({
    name: '',
    contactName: '',
    email: '',
    phone: '',
    tenantId: '',
    status: 'prospect' as PartnerCustomer['status'],
    plan: 'starter' as PartnerCustomer['plan'],
    siteIds: '',
    notes: '',
  });
  const [projectDraft, setProjectDraft] = useState({
    customerId: partnerCustomers[0]?.id || '',
    name: '',
    type: 'deployment' as PartnerProject['type'],
    status: 'draft' as PartnerProject['status'],
    value: '',
    currency: 'USD',
    siteIds: '',
    ownerUserId: '',
    quoteNo: '',
    nextStep: '',
  });
  const [billingPlanDraft, setBillingPlanDraft] = useState({
    name: '',
    code: '',
    billingCycle: 'monthly' as PartnerBillingPlan['billingCycle'],
    basePrice: '',
    currency: 'USD',
    includedSites: '1',
    includedDevices: '10',
    overageDevicePrice: '',
    features: '',
    status: 'active' as PartnerBillingPlan['status'],
  });
  const [invoiceDraft, setInvoiceDraft] = useState({
    customerId: partnerCustomers[0]?.id || '',
    planId: partnerBillingPlans[0]?.id || '',
    invoiceNo: '',
    status: 'open' as PartnerInvoice['status'],
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    currency: 'USD',
    description: '',
    quantity: '1',
    unitPrice: '',
    tax: '0',
    notes: '',
  });
  const [accountDraft, setAccountDraft] = useState({
    customerId: partnerCustomers[0]?.id || '',
    name: '',
    email: '',
    password: '',
    role: 'Customer',
    appProfile: 'simple' as AppProfile,
    siteId: partnerCustomers[0]?.siteIds[0] || sites[0]?.id || 'factory-a',
    status: 'approved' as User['status'],
  });
  const [brandDraft, setBrandDraft] = useState(whiteLabelConfig);

  useEffect(() => {
    setBrandDraft(whiteLabelConfig);
  }, [whiteLabelConfig]);

  useEffect(() => {
    const customer = partnerCustomers.find((item) => item.id === accountDraft.customerId) || partnerCustomers[0];
    const fallbackSiteId = customer?.siteIds[0] || sites[0]?.id || 'factory-a';
    if (!accountDraft.customerId && customer) {
      setAccountDraft((current) => ({ ...current, customerId: customer.id, siteId: fallbackSiteId }));
      return;
    }
    if (customer && !customer.siteIds.includes(accountDraft.siteId)) {
      setAccountDraft((current) => ({ ...current, siteId: fallbackSiteId }));
    }
  }, [accountDraft.customerId, accountDraft.siteId, partnerCustomers, sites]);

  const siteById = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);
  const customerById = useMemo(() => new Map(partnerCustomers.map((customer) => [customer.id, customer])), [partnerCustomers]);
  const customerSiteIdsById = useMemo(() => new Map(partnerCustomers.map((customer) => [customer.id, new Set(customer.siteIds)])), [partnerCustomers]);
  const activeCustomers = partnerCustomers.filter((customer) => customer.status === 'active').length;
  const projectPipeline = partnerProjects
    .filter((project) => !['lost', 'delivered'].includes(project.status))
    .reduce((sum, project) => sum + (Number(project.value) || 0), 0);
  const openInvoiceTotal = partnerInvoices
    .filter((invoice) => ['open', 'overdue'].includes(invoice.status))
    .reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0);
  const paidInvoiceTotal = partnerInvoices
    .filter((invoice) => invoice.status === 'paid')
    .reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0);
  const managedSiteIds = new Set(partnerCustomers.flatMap((customer) => customer.siteIds));
  const managedDevices = devices.filter((device) => managedSiteIds.has(device.siteId || '')).length;
  const customerAccounts = users.filter((user) => (
    Boolean(user.customerId)
    || partnerCustomers.some((customer) => customer.siteIds.includes(user.siteId) && CUSTOMER_ACCOUNT_ROLES.includes(user.role as typeof CUSTOMER_ACCOUNT_ROLES[number]))
  ));

  const tabs = [
    { id: 'customers', label: 'Customers', icon: Building2 },
    { id: 'accounts', label: 'Customer Accounts', icon: UsersRound },
    { id: 'projects', label: 'Projects & Quotes', icon: Handshake },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'branding', label: 'White Label', icon: Palette },
    { id: 'permissions', label: 'RBAC Matrix', icon: ShieldCheck },
  ] as const;

  const handleAddCustomer = () => {
    if (!customerDraft.name.trim()) return;
    const tenantId = customerDraft.tenantId.trim() || customerDraft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    addPartnerCustomer({
      id: newId('customer'),
      name: customerDraft.name.trim(),
      contactName: customerDraft.contactName.trim(),
      email: customerDraft.email.trim(),
      phone: customerDraft.phone.trim(),
      tenantId,
      status: customerDraft.status,
      plan: customerDraft.plan,
      siteIds: splitCsv(customerDraft.siteIds),
      notes: customerDraft.notes.trim(),
      createdAt: new Date().toISOString(),
    });
    setCustomerDraft({ name: '', contactName: '', email: '', phone: '', tenantId: '', status: 'prospect', plan: 'starter', siteIds: '', notes: '' });
    notifySuccess('Customer created successfully.');
  };

  const handleAddAccount = () => {
    if (!accountDraft.customerId || !accountDraft.name.trim() || !accountDraft.email.trim()) return;
    const email = accountDraft.email.trim().toLowerCase();
    if (users.some((user) => user.email.toLowerCase() === email)) {
      notify({ level: 'error', title: 'Customer account', message: 'Email already exists. Please use another email.' });
      return;
    }

    const customer = customerById.get(accountDraft.customerId);
    const fallbackSiteId = customer?.siteIds[0] || sites[0]?.id || 'factory-a';
    const siteId = customer?.siteIds.includes(accountDraft.siteId) ? accountDraft.siteId : fallbackSiteId;

    addUser({
      id: newId('user'),
      name: accountDraft.name.trim(),
      email,
      password: accountDraft.password || 'password123',
      role: accountDraft.role,
      appProfile: accountDraft.appProfile,
      siteId,
      customerId: accountDraft.customerId,
      status: accountDraft.status,
      createdAt: new Date().toISOString(),
      approvedAt: accountDraft.status === 'approved' ? new Date().toISOString() : undefined,
    });
    setAccountDraft((current) => ({
      ...current,
      name: '',
      email: '',
      password: '',
      siteId,
      status: 'approved',
    }));
    notifySuccess('Customer account created successfully.');
  };

  const handleAccountFeatureAccessChange = (user: User, key: FeatureNavKey, enabled: boolean) => {
    updateUser(user.id, {
      featureAccess: {
        ...(user.featureAccess || {}),
        [key]: enabled,
      },
    });
  };

  const resetAccountFeatureAccess = (userId: string) => {
    updateUser(userId, { featureAccess: undefined });
  };

  const handleAccountControlAccessChange = (user: User, patch: NonNullable<User['controlAccess']>) => {
    updateUser(user.id, {
      controlAccess: {
        ...(user.controlAccess || {}),
        ...patch,
      },
    });
  };

  const resetAccountControlAccess = (userId: string) => {
    updateUser(userId, { controlAccess: undefined });
  };

  const handleAccountDataAccessChange = (user: User, patch: NonNullable<User['dataAccess']>) => {
    updateUser(user.id, {
      dataAccess: {
        ...(user.dataAccess || {}),
        ...patch,
      },
    });
  };

  const resetAccountDataAccess = (userId: string) => {
    updateUser(userId, { dataAccess: undefined });
  };

  const handleAddProject = () => {
    if (!projectDraft.name.trim()) return;
    addPartnerProject({
      id: newId('project'),
      customerId: projectDraft.customerId,
      name: projectDraft.name.trim(),
      type: projectDraft.type,
      status: projectDraft.status,
      value: Number(projectDraft.value) || undefined,
      currency: projectDraft.currency.trim() || 'USD',
      siteIds: splitCsv(projectDraft.siteIds),
      ownerUserId: projectDraft.ownerUserId,
      quoteNo: projectDraft.quoteNo.trim(),
      nextStep: projectDraft.nextStep.trim(),
      createdAt: new Date().toISOString(),
    });
    setProjectDraft({
      customerId: partnerCustomers[0]?.id || '',
      name: '',
      type: 'deployment',
      status: 'draft',
      value: '',
      currency: 'USD',
      siteIds: '',
      ownerUserId: '',
      quoteNo: '',
      nextStep: '',
    });
    notifySuccess('Project created successfully.');
  };

  const handleAddBillingPlan = () => {
    if (!billingPlanDraft.name.trim()) return;
    const code = billingPlanDraft.code.trim() || billingPlanDraft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    addPartnerBillingPlan({
      id: newId('plan'),
      name: billingPlanDraft.name.trim(),
      code,
      billingCycle: billingPlanDraft.billingCycle,
      basePrice: Number(billingPlanDraft.basePrice) || 0,
      currency: billingPlanDraft.currency.trim() || 'USD',
      includedSites: Number(billingPlanDraft.includedSites) || undefined,
      includedDevices: Number(billingPlanDraft.includedDevices) || undefined,
      overageDevicePrice: Number(billingPlanDraft.overageDevicePrice) || undefined,
      features: splitCsv(billingPlanDraft.features),
      status: billingPlanDraft.status,
      createdAt: new Date().toISOString(),
    });
    setBillingPlanDraft({
      name: '',
      code: '',
      billingCycle: 'monthly',
      basePrice: '',
      currency: 'USD',
      includedSites: '1',
      includedDevices: '10',
      overageDevicePrice: '',
      features: '',
      status: 'active',
    });
    notifySuccess('Billing plan created successfully.');
  };

  const handleAddInvoice = () => {
    const selectedPlan = partnerBillingPlans.find((plan) => plan.id === invoiceDraft.planId);
    const description = invoiceDraft.description.trim() || selectedPlan?.name || '';
    if (!invoiceDraft.customerId || !description) return;
    const quantity = Number(invoiceDraft.quantity) || 1;
    const unitPrice = Number(invoiceDraft.unitPrice) || selectedPlan?.basePrice || 0;
    const tax = Number(invoiceDraft.tax) || 0;
    const subtotal = quantity * unitPrice;
    const total = subtotal + tax;
    const invoiceNo = invoiceDraft.invoiceNo.trim() || `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    addPartnerInvoice({
      id: newId('invoice'),
      invoiceNo,
      customerId: invoiceDraft.customerId,
      planId: invoiceDraft.planId || undefined,
      status: invoiceDraft.status,
      issueDate: invoiceDraft.issueDate,
      dueDate: invoiceDraft.dueDate,
      paidAt: invoiceDraft.status === 'paid' ? new Date().toISOString() : undefined,
      currency: invoiceDraft.currency.trim() || 'USD',
      subtotal,
      tax,
      total,
      notes: invoiceDraft.notes.trim(),
      lineItems: [{
        id: newId('invoice-line'),
        description,
        quantity,
        unitPrice,
        amount: subtotal,
      }],
      createdAt: new Date().toISOString(),
    });
    setInvoiceDraft((current) => ({
      ...current,
      invoiceNo: '',
      status: 'open',
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      description: '',
      quantity: '1',
      unitPrice: '',
      tax: '0',
      notes: '',
    }));
    notifySuccess('Invoice created successfully.');
  };

  const saveBranding = () => {
    updateWhiteLabelConfig(brandDraft);
    notifySuccess('White label configuration saved successfully.');
  };

  const copyDnsHint = async () => {
    const domain = brandDraft.customDomain || 'iot.customer-domain.com';
    const hint = `CNAME ${domain} -> your-dashboard-domain.com`;
    try {
      await navigator.clipboard.writeText(hint);
      notifySuccess('DNS hint copied.');
    } catch {
      notifySuccess(hint, 'DNS hint');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            <Handshake className="h-6 w-6 text-orange-500" />
            Partner / White Label
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Manage customer accounts, projects, branding, domains, and delivery permissions for partner-led deployments.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 xl:grid-cols-7">
          {[
            ['Customers', partnerCustomers.length],
            ['Active', activeCustomers],
            ['Accounts', customerAccounts.length],
            ['Managed Sites', managedSiteIds.size],
            ['Devices', managedDevices],
            ['Open Invoices', money(openInvoiceTotal, 'USD')],
            ['Paid Revenue', money(paidInvoiceTotal, 'USD')],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#1c2128]">
              <p className="text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#1c2128]">
        <div className="border-b border-slate-200 dark:border-slate-800">
          <nav className="-mb-px flex overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'inline-flex items-center gap-2 border-b-2 px-5 py-4 text-sm font-medium transition-colors',
                  activeTab === tab.id
                    ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400'
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-5 sm:p-6">
          {activeTab === 'customers' && (
            <div className="space-y-6">
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30 lg:grid-cols-4">
                <input value={customerDraft.name} onChange={(event) => setCustomerDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Customer name" className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                <input value={customerDraft.contactName} onChange={(event) => setCustomerDraft((current) => ({ ...current, contactName: event.target.value }))} placeholder="Contact name" className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                <input value={customerDraft.email} onChange={(event) => setCustomerDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                <input value={customerDraft.phone} onChange={(event) => setCustomerDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                <input value={customerDraft.tenantId} onChange={(event) => setCustomerDraft((current) => ({ ...current, tenantId: event.target.value }))} placeholder="Tenant ID, auto if blank" className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                <select value={customerDraft.status} onChange={(event) => setCustomerDraft((current) => ({ ...current, status: event.target.value as PartnerCustomer['status'] }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">
                  {CUSTOMER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <select value={customerDraft.plan} onChange={(event) => setCustomerDraft((current) => ({ ...current, plan: event.target.value as PartnerCustomer['plan'] }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">
                  {CUSTOMER_PLANS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                </select>
                <input value={customerDraft.siteIds} onChange={(event) => setCustomerDraft((current) => ({ ...current, siteIds: event.target.value }))} placeholder="Site IDs, comma separated" className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                <textarea value={customerDraft.notes} onChange={(event) => setCustomerDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" rows={2} className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700 lg:col-span-3" />
                <button type="button" onClick={handleAddCustomer} className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500">
                  <Plus className="h-4 w-4" />
                  Add Customer
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Sites</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {partnerCustomers.map((customer) => (
                      <tr key={customer.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <input value={customer.name} onChange={(event) => updatePartnerCustomer(customer.id, { name: event.target.value })} className="block w-56 rounded border-0 bg-transparent px-2 py-1 font-semibold text-slate-900 ring-1 ring-transparent focus:ring-orange-500 dark:text-white" />
                          <input value={customer.tenantId} onChange={(event) => updatePartnerCustomer(customer.id, { tenantId: event.target.value })} className="mt-1 block w-56 rounded border-0 bg-transparent px-2 py-1 font-mono text-xs text-slate-500 ring-1 ring-transparent focus:ring-orange-500" />
                        </td>
                        <td className="px-4 py-3">
                          <input value={customer.contactName || ''} onChange={(event) => updatePartnerCustomer(customer.id, { contactName: event.target.value })} className="block w-44 rounded border-0 bg-transparent px-2 py-1 text-slate-700 ring-1 ring-transparent focus:ring-orange-500 dark:text-slate-300" />
                          <input value={customer.email || ''} onChange={(event) => updatePartnerCustomer(customer.id, { email: event.target.value })} className="mt-1 block w-44 rounded border-0 bg-transparent px-2 py-1 text-xs text-slate-500 ring-1 ring-transparent focus:ring-orange-500" />
                        </td>
                        <td className="px-4 py-3">
                          <select value={customer.plan} onChange={(event) => updatePartnerCustomer(customer.id, { plan: event.target.value as PartnerCustomer['plan'] })} className="rounded-md border-0 bg-transparent px-2 py-1 ring-1 ring-slate-300 focus:ring-orange-500 dark:ring-slate-700">
                            {CUSTOMER_PLANS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input value={customer.siteIds.join(', ')} onChange={(event) => updatePartnerCustomer(customer.id, { siteIds: splitCsv(event.target.value) })} className="w-64 rounded border-0 bg-transparent px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-300 focus:ring-orange-500 dark:text-slate-300 dark:ring-slate-700" />
                          <div className="mt-1 flex flex-wrap gap-1">
                            {customer.siteIds.map((siteId) => (
                              <span key={siteId} className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{siteById.get(siteId)?.name || siteId}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select value={customer.status} onChange={(event) => updatePartnerCustomer(customer.id, { status: event.target.value as PartnerCustomer['status'] })} className="rounded-md border-0 bg-transparent px-2 py-1 ring-1 ring-slate-300 focus:ring-orange-500 dark:ring-slate-700">
                            {CUSTOMER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={async () => {
                            if (await confirmDelete({ title: 'Delete customer', itemName: customer.name, description: 'Customer profile will be removed. Existing sites and devices are not deleted.' })) deletePartnerCustomer(customer.id);
                          }} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'accounts' && (
            <div className="space-y-6">
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30 lg:grid-cols-4">
                <select
                  value={accountDraft.customerId}
                  onChange={(event) => {
                    const customer = customerById.get(event.target.value);
                    setAccountDraft((current) => ({
                      ...current,
                      customerId: event.target.value,
                      siteId: customer?.siteIds[0] || sites[0]?.id || current.siteId,
                    }));
                  }}
                  className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700"
                >
                  <option value="">Select customer</option>
                  {partnerCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
                <input value={accountDraft.name} onChange={(event) => setAccountDraft((current) => ({ ...current, name: event.target.value }))} placeholder="User name" className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                <input value={accountDraft.email} onChange={(event) => setAccountDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                <input value={accountDraft.password} onChange={(event) => setAccountDraft((current) => ({ ...current, password: event.target.value }))} placeholder="Initial password, default password123" className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700" />
                <select value={accountDraft.siteId} onChange={(event) => setAccountDraft((current) => ({ ...current, siteId: event.target.value }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">
                  {(customerById.get(accountDraft.customerId)?.siteIds || sites.map((site) => site.id)).map((siteId) => (
                    <option key={siteId} value={siteId}>{siteById.get(siteId)?.name || siteId}</option>
                  ))}
                </select>
                <select value={accountDraft.role} onChange={(event) => setAccountDraft((current) => ({ ...current, role: event.target.value }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">
                  {CUSTOMER_ACCOUNT_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <select value={accountDraft.appProfile} onChange={(event) => setAccountDraft((current) => ({ ...current, appProfile: event.target.value as AppProfile }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">
                  {APP_PROFILE_OPTIONS.map((profile) => <option key={profile.value} value={profile.value}>{profile.label}</option>)}
                </select>
                <select value={accountDraft.status} onChange={(event) => setAccountDraft((current) => ({ ...current, status: event.target.value as User['status'] }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:text-slate-200 dark:ring-slate-700">
                  {['approved', 'pending', 'rejected'].map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <button type="button" onClick={handleAddAccount} className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500 lg:col-span-4">
                  <UserPlus className="h-4 w-4" />
                  Add Customer Account
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Account</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Site</th>
                      <th className="px-4 py-3">Role / Profile</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {customerAccounts.map((user) => {
                      const inferredCustomer = user.customerId
                        ? customerById.get(user.customerId)
                        : partnerCustomers.find((customer) => customer.siteIds.includes(user.siteId));
                      const allowedSiteIds = inferredCustomer?.siteIds || sites.map((site) => site.id);
                      return (
                        <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3">
                            <input value={user.name} onChange={(event) => updateUser(user.id, { name: event.target.value })} className="block w-52 rounded border-0 bg-transparent px-2 py-1 font-semibold text-slate-900 ring-1 ring-transparent focus:ring-orange-500 dark:text-white" />
                            <input value={user.email} onChange={(event) => updateUser(user.id, { email: event.target.value })} className="mt-1 block w-52 rounded border-0 bg-transparent px-2 py-1 text-xs text-slate-500 ring-1 ring-transparent focus:ring-orange-500" />
                          </td>
                          <td className="px-4 py-3">
                            <select value={user.customerId || inferredCustomer?.id || ''} onChange={(event) => {
                              const nextCustomer = customerById.get(event.target.value);
                              updateUser(user.id, {
                                customerId: event.target.value || undefined,
                                siteId: nextCustomer?.siteIds[0] || user.siteId,
                              });
                            }} className="rounded-md border-0 bg-transparent px-2 py-1 ring-1 ring-slate-300 focus:ring-orange-500 dark:ring-slate-700">
                              <option value="">Unassigned</option>
                              {partnerCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select value={user.siteId} onChange={(event) => updateUser(user.id, { siteId: event.target.value })} className="rounded-md border-0 bg-transparent px-2 py-1 ring-1 ring-slate-300 focus:ring-orange-500 dark:ring-slate-700">
                              {allowedSiteIds.map((siteId) => <option key={siteId} value={siteId}>{siteById.get(siteId)?.name || siteId}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select value={user.role} onChange={(event) => updateUser(user.id, { role: event.target.value })} className="block rounded-md border-0 bg-transparent px-2 py-1 ring-1 ring-slate-300 focus:ring-orange-500 dark:ring-slate-700">
                              {CUSTOMER_ACCOUNT_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                            </select>
                            <select value={user.appProfile || 'simple'} onChange={(event) => updateUser(user.id, { appProfile: event.target.value as AppProfile })} className="mt-2 block rounded-md border-0 bg-transparent px-2 py-1 text-xs ring-1 ring-slate-300 focus:ring-orange-500 dark:ring-slate-700">
                              {APP_PROFILE_OPTIONS.map((profile) => <option key={profile.value} value={profile.value}>{profile.label}</option>)}
                            </select>
                            <details className="mt-2 w-72 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/40">
                              <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">
                                Module access
                              </summary>
                              <div className="mt-2 grid grid-cols-2 gap-1">
                                {FEATURE_ACCESS_OPTIONS.filter((option) => option.key !== 'profile').map((option) => (
                                  <label key={option.key} className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[10px] text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900">
                                    <input
                                      type="checkbox"
                                      checked={getUserFeatureAccess(user)[option.key]}
                                      onChange={(event) => handleAccountFeatureAccessChange(user, option.key, event.target.checked)}
                                      className="h-3 w-3 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                                    />
                                    <span className="truncate" title={option.description}>{option.label}</span>
                                  </label>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => resetAccountFeatureAccess(user.id)}
                                className="mt-2 text-[10px] font-semibold text-orange-600 hover:text-orange-500"
                              >
                                Reset to profile defaults
                              </button>
                            </details>
                            <details className="mt-2 w-72 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/40">
                              <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">
                                Control access
                              </summary>
                              <label className="mt-2 flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={user.controlAccess?.enabled !== false}
                                  onChange={(event) => handleAccountControlAccessChange(user, { enabled: event.target.checked })}
                                  className="h-3 w-3 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                                />
                                Allow control commands
                              </label>
                              <label className="mt-2 block text-[10px] text-slate-500">
                                Allowed Device IDs
                                <input
                                  value={(user.controlAccess?.deviceIds || []).join(', ')}
                                  onChange={(event) => handleAccountControlAccessChange(user, { deviceIds: splitCsv(event.target.value) })}
                                  placeholder={devices.filter((device) => allowedSiteIds.includes(device.siteId || '')).slice(0, 3).map((device) => device.id).join(', ') || 'empty = all devices'}
                                  className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                              </label>
                              <label className="mt-2 block text-[10px] text-slate-500">
                                Allowed Action IDs
                                <input
                                  value={(user.controlAccess?.actionIds || []).join(', ')}
                                  onChange={(event) => handleAccountControlAccessChange(user, { actionIds: splitCsv(event.target.value) })}
                                  placeholder="power_on, power_off, set_relay"
                                  className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => resetAccountControlAccess(user.id)}
                                className="mt-2 text-[10px] font-semibold text-orange-600 hover:text-orange-500"
                              >
                                Reset control access
                              </button>
                            </details>
                            <details className="mt-2 w-72 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/40">
                              <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">
                                Data access
                              </summary>
                              <label className="mt-2 flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={user.dataAccess?.enabled !== false}
                                  onChange={(event) => handleAccountDataAccessChange(user, { enabled: event.target.checked })}
                                  className="h-3 w-3 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                                />
                                Allow device data access
                              </label>
                              <label className="mt-2 block text-[10px] text-slate-500">
                                Allowed Site IDs
                                <input
                                  value={(user.dataAccess?.siteIds || []).join(', ')}
                                  onChange={(event) => handleAccountDataAccessChange(user, { siteIds: splitCsv(event.target.value) })}
                                  placeholder={allowedSiteIds.join(', ') || 'empty = customer site'}
                                  className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                              </label>
                              <label className="mt-2 block text-[10px] text-slate-500">
                                Allowed Device IDs
                                <input
                                  value={(user.dataAccess?.deviceIds || []).join(', ')}
                                  onChange={(event) => handleAccountDataAccessChange(user, { deviceIds: splitCsv(event.target.value) })}
                                  placeholder={devices.filter((device) => allowedSiteIds.includes(device.siteId || '')).slice(0, 3).map((device) => device.id).join(', ') || 'empty = site scope'}
                                  className="mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => resetAccountDataAccess(user.id)}
                                className="mt-2 text-[10px] font-semibold text-orange-600 hover:text-orange-500"
                              >
                                Reset data access
                              </button>
                            </details>
                          </td>
                          <td className="px-4 py-3">
                            <select value={user.status} onChange={(event) => updateUser(user.id, { status: event.target.value as User['status'] })} className="rounded-md border-0 bg-transparent px-2 py-1 ring-1 ring-slate-300 focus:ring-orange-500 dark:ring-slate-700">
                              {['approved', 'pending', 'rejected'].map((status) => <option key={status} value={status}>{status}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {user.status !== 'approved' && (
                              <button type="button" onClick={() => approveUser(user.id, user.role, user.siteId, user.appProfile)} className="mr-2 rounded px-2 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
                                Approve
                              </button>
                            )}
                            <button type="button" onClick={async () => {
                              if (await confirmDelete({ title: 'Delete customer account', itemName: user.email, description: 'This login account will be removed. Customer, site, and device data are not deleted.' })) deleteUser(user.id);
                            }} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'projects' && (
            <div className="space-y-6">
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30 lg:grid-cols-4">
                <select value={projectDraft.customerId} onChange={(event) => setProjectDraft((current) => ({ ...current, customerId: event.target.value }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700">
                  <option value="">Unassigned customer</option>
                  {partnerCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
                <input value={projectDraft.name} onChange={(event) => setProjectDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Project name" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                <select value={projectDraft.type} onChange={(event) => setProjectDraft((current) => ({ ...current, type: event.target.value as PartnerProject['type'] }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700">
                  {PROJECT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <select value={projectDraft.status} onChange={(event) => setProjectDraft((current) => ({ ...current, status: event.target.value as PartnerProject['status'] }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700">
                  {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <input value={projectDraft.value} onChange={(event) => setProjectDraft((current) => ({ ...current, value: event.target.value }))} placeholder="Quote value" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                <input value={projectDraft.currency} onChange={(event) => setProjectDraft((current) => ({ ...current, currency: event.target.value }))} placeholder="Currency" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                <input value={projectDraft.quoteNo} onChange={(event) => setProjectDraft((current) => ({ ...current, quoteNo: event.target.value }))} placeholder="Quote No" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                <select value={projectDraft.ownerUserId} onChange={(event) => setProjectDraft((current) => ({ ...current, ownerUserId: event.target.value }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700">
                  <option value="">No owner</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
                <input value={projectDraft.siteIds} onChange={(event) => setProjectDraft((current) => ({ ...current, siteIds: event.target.value }))} placeholder="Site IDs" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700 lg:col-span-2" />
                <input value={projectDraft.nextStep} onChange={(event) => setProjectDraft((current) => ({ ...current, nextStep: event.target.value }))} placeholder="Next step" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                <button type="button" onClick={handleAddProject} className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500">
                  <Plus className="h-4 w-4" />
                  Add Project
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                <p className="text-xs uppercase tracking-wider text-slate-500">Open pipeline</p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{money(projectPipeline, 'USD')}</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {partnerProjects.map((project) => (
                  <div key={project.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <input value={project.name} onChange={(event) => updatePartnerProject(project.id, { name: event.target.value })} className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-base font-semibold text-slate-900 ring-1 ring-transparent focus:ring-orange-500 dark:text-white" />
                        <p className="mt-1 text-xs text-slate-500">{customerById.get(project.customerId)?.name || 'Unassigned customer'} / {project.quoteNo || 'No quote'}</p>
                      </div>
                      <button type="button" onClick={async () => {
                        if (await confirmDelete({ title: 'Delete project', itemName: project.name, description: 'Project and quote tracking data will be removed.' })) deletePartnerProject(project.id);
                      }} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <select value={project.status} onChange={(event) => updatePartnerProject(project.id, { status: event.target.value as PartnerProject['status'] })} className="rounded-md border-0 bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-orange-500 dark:bg-slate-900 dark:ring-slate-700">
                        {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                      <select value={project.type} onChange={(event) => updatePartnerProject(project.id, { type: event.target.value as PartnerProject['type'] })} className="rounded-md border-0 bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-orange-500 dark:bg-slate-900 dark:ring-slate-700">
                        {PROJECT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                      <input value={project.value || ''} onChange={(event) => updatePartnerProject(project.id, { value: Number(event.target.value) || undefined })} className="rounded-md border-0 bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-orange-500 dark:bg-slate-900 dark:ring-slate-700" />
                      <input value={project.nextStep || ''} onChange={(event) => updatePartnerProject(project.id, { nextStep: event.target.value })} placeholder="Next step" className="rounded-md border-0 bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-orange-500 dark:bg-slate-900 dark:ring-slate-700" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Plans', partnerBillingPlans.length],
                  ['Invoices', partnerInvoices.length],
                  ['Open', money(openInvoiceTotal, 'USD')],
                  ['Paid', money(paidInvoiceTotal, 'USD')],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                    <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
                    <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
                <section className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <CreditCard className="h-4 w-4 text-orange-500" />
                      Billing Plans
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <input value={billingPlanDraft.name} onChange={(event) => setBillingPlanDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Plan name" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <input value={billingPlanDraft.code} onChange={(event) => setBillingPlanDraft((current) => ({ ...current, code: event.target.value }))} placeholder="Plan code, auto if blank" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <select value={billingPlanDraft.billingCycle} onChange={(event) => setBillingPlanDraft((current) => ({ ...current, billingCycle: event.target.value as PartnerBillingPlan['billingCycle'] }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700">
                        {BILLING_CYCLES.map((cycle) => <option key={cycle} value={cycle}>{cycle}</option>)}
                      </select>
                      <select value={billingPlanDraft.status} onChange={(event) => setBillingPlanDraft((current) => ({ ...current, status: event.target.value as PartnerBillingPlan['status'] }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700">
                        {BILLING_PLAN_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                      <input value={billingPlanDraft.basePrice} onChange={(event) => setBillingPlanDraft((current) => ({ ...current, basePrice: event.target.value }))} placeholder="Base price" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <input value={billingPlanDraft.currency} onChange={(event) => setBillingPlanDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} placeholder="Currency" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <input value={billingPlanDraft.includedSites} onChange={(event) => setBillingPlanDraft((current) => ({ ...current, includedSites: event.target.value }))} placeholder="Included sites" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <input value={billingPlanDraft.includedDevices} onChange={(event) => setBillingPlanDraft((current) => ({ ...current, includedDevices: event.target.value }))} placeholder="Included devices" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <input value={billingPlanDraft.overageDevicePrice} onChange={(event) => setBillingPlanDraft((current) => ({ ...current, overageDevicePrice: event.target.value }))} placeholder="Overage price / device" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <input value={billingPlanDraft.features} onChange={(event) => setBillingPlanDraft((current) => ({ ...current, features: event.target.value }))} placeholder="Features, comma separated" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <button type="button" onClick={handleAddBillingPlan} className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500 md:col-span-2">
                        <Plus className="h-4 w-4" />
                        Add Plan
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {partnerBillingPlans.map((plan) => (
                      <div key={plan.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <input value={plan.name} onChange={(event) => updatePartnerBillingPlan(plan.id, { name: event.target.value, updatedAt: new Date().toISOString() })} className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-base font-semibold text-slate-900 ring-1 ring-transparent focus:ring-orange-500 dark:text-white" />
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span className="font-mono">{plan.code}</span>
                              <span>{plan.billingCycle}</span>
                              <span>{money(plan.basePrice, plan.currency)}</span>
                            </div>
                          </div>
                          <button type="button" onClick={async () => {
                            if (await confirmDelete({ title: 'Delete billing plan', itemName: plan.name, description: 'Existing invoices will keep their amounts, but their plan link will be cleared.' })) deletePartnerBillingPlan(plan.id);
                          }} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <select value={plan.status} onChange={(event) => updatePartnerBillingPlan(plan.id, { status: event.target.value as PartnerBillingPlan['status'], updatedAt: new Date().toISOString() })} className="rounded-md border-0 bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-orange-500 dark:bg-slate-900 dark:ring-slate-700">
                            {BILLING_PLAN_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                          <select value={plan.billingCycle} onChange={(event) => updatePartnerBillingPlan(plan.id, { billingCycle: event.target.value as PartnerBillingPlan['billingCycle'], updatedAt: new Date().toISOString() })} className="rounded-md border-0 bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-orange-500 dark:bg-slate-900 dark:ring-slate-700">
                            {BILLING_CYCLES.map((cycle) => <option key={cycle} value={cycle}>{cycle}</option>)}
                          </select>
                          <input value={plan.basePrice} onChange={(event) => updatePartnerBillingPlan(plan.id, { basePrice: Number(event.target.value) || 0, updatedAt: new Date().toISOString() })} className="rounded-md border-0 bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-orange-500 dark:bg-slate-900 dark:ring-slate-700" />
                          <input value={plan.currency} onChange={(event) => updatePartnerBillingPlan(plan.id, { currency: event.target.value.toUpperCase(), updatedAt: new Date().toISOString() })} className="rounded-md border-0 bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-orange-500 dark:bg-slate-900 dark:ring-slate-700" />
                          <input value={plan.includedSites || ''} onChange={(event) => updatePartnerBillingPlan(plan.id, { includedSites: Number(event.target.value) || undefined, updatedAt: new Date().toISOString() })} placeholder="Included sites" className="rounded-md border-0 bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-orange-500 dark:bg-slate-900 dark:ring-slate-700" />
                          <input value={plan.includedDevices || ''} onChange={(event) => updatePartnerBillingPlan(plan.id, { includedDevices: Number(event.target.value) || undefined, updatedAt: new Date().toISOString() })} placeholder="Included devices" className="rounded-md border-0 bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-orange-500 dark:bg-slate-900 dark:ring-slate-700" />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1">
                          {plan.features.map((feature) => (
                            <span key={feature} className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{feature}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      <ReceiptText className="h-4 w-4 text-orange-500" />
                      Invoices
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <select value={invoiceDraft.customerId} onChange={(event) => setInvoiceDraft((current) => ({ ...current, customerId: event.target.value }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700">
                        <option value="">Select customer</option>
                        {partnerCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                      </select>
                      <select value={invoiceDraft.planId} onChange={(event) => {
                        const plan = partnerBillingPlans.find((item) => item.id === event.target.value);
                        setInvoiceDraft((current) => ({
                          ...current,
                          planId: event.target.value,
                          currency: plan?.currency || current.currency,
                          unitPrice: plan ? String(plan.basePrice) : current.unitPrice,
                          description: current.description || plan?.name || '',
                        }));
                      }} className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700">
                        <option value="">No plan</option>
                        {partnerBillingPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                      </select>
                      <input value={invoiceDraft.invoiceNo} onChange={(event) => setInvoiceDraft((current) => ({ ...current, invoiceNo: event.target.value }))} placeholder="Invoice no, auto if blank" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <select value={invoiceDraft.status} onChange={(event) => setInvoiceDraft((current) => ({ ...current, status: event.target.value as PartnerInvoice['status'] }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700">
                        {INVOICE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                      <input type="date" value={invoiceDraft.issueDate} onChange={(event) => setInvoiceDraft((current) => ({ ...current, issueDate: event.target.value }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <input type="date" value={invoiceDraft.dueDate} onChange={(event) => setInvoiceDraft((current) => ({ ...current, dueDate: event.target.value }))} className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <input value={invoiceDraft.description} onChange={(event) => setInvoiceDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Line item description" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <input value={invoiceDraft.quantity} onChange={(event) => setInvoiceDraft((current) => ({ ...current, quantity: event.target.value }))} placeholder="Quantity" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <input value={invoiceDraft.unitPrice} onChange={(event) => setInvoiceDraft((current) => ({ ...current, unitPrice: event.target.value }))} placeholder="Unit price" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <input value={invoiceDraft.tax} onChange={(event) => setInvoiceDraft((current) => ({ ...current, tax: event.target.value }))} placeholder="Tax" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <input value={invoiceDraft.currency} onChange={(event) => setInvoiceDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} placeholder="Currency" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <input value={invoiceDraft.notes} onChange={(event) => setInvoiceDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" className="rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                      <button type="button" onClick={handleAddInvoice} className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500 md:col-span-3">
                        <Plus className="h-4 w-4" />
                        Add Invoice
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                        <tr>
                          <th className="px-4 py-3">Invoice</th>
                          <th className="px-4 py-3">Customer</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Due</th>
                          <th className="px-4 py-3 text-right">Total</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {partnerInvoices.map((invoice) => (
                          <tr key={invoice.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                            <td className="px-4 py-3">
                              <input value={invoice.invoiceNo} onChange={(event) => updatePartnerInvoice(invoice.id, { invoiceNo: event.target.value, updatedAt: new Date().toISOString() })} className="block w-40 rounded border-0 bg-transparent px-2 py-1 font-semibold text-slate-900 ring-1 ring-transparent focus:ring-orange-500 dark:text-white" />
                              <p className="mt-1 text-xs text-slate-500">{partnerBillingPlans.find((plan) => plan.id === invoice.planId)?.name || invoice.lineItems[0]?.description || 'No plan'}</p>
                            </td>
                            <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{customerById.get(invoice.customerId)?.name || 'Unassigned'}</td>
                            <td className="px-4 py-3">
                              <select value={invoice.status} onChange={(event) => {
                                const status = event.target.value as PartnerInvoice['status'];
                                updatePartnerInvoice(invoice.id, {
                                  status,
                                  paidAt: status === 'paid' ? invoice.paidAt || new Date().toISOString() : undefined,
                                  updatedAt: new Date().toISOString(),
                                });
                              }} className="rounded-md border-0 bg-transparent px-2 py-1 ring-1 ring-slate-300 focus:ring-orange-500 dark:ring-slate-700">
                                {INVOICE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{invoice.dueDate || '-'}</td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">{money(invoice.total, invoice.currency)}</td>
                            <td className="px-4 py-3 text-right">
                              <button type="button" onClick={async () => {
                                if (await confirmDelete({ title: 'Delete invoice', itemName: invoice.invoiceNo, description: 'This invoice record will be permanently removed.' })) deletePartnerInvoice(invoice.id);
                              }} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeTab === 'branding' && (
            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Product Name</span>
                  <input value={brandDraft.productName} onChange={(event) => setBrandDraft((current) => ({ ...current, productName: event.target.value }))} className="mt-1 block w-full rounded-md border-0 bg-slate-50 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Company Name</span>
                  <input value={brandDraft.companyName} onChange={(event) => setBrandDraft((current) => ({ ...current, companyName: event.target.value }))} className="mt-1 block w-full rounded-md border-0 bg-slate-50 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Logo URL</span>
                  <input value={brandDraft.logoUrl || ''} onChange={(event) => setBrandDraft((current) => ({ ...current, logoUrl: event.target.value }))} placeholder="https://..." className="mt-1 block w-full rounded-md border-0 bg-slate-50 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Primary Color</span>
                  <input type="color" value={brandDraft.primaryColor} onChange={(event) => setBrandDraft((current) => ({ ...current, primaryColor: event.target.value }))} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-slate-50 px-2 dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Support Email</span>
                  <input value={brandDraft.supportEmail || ''} onChange={(event) => setBrandDraft((current) => ({ ...current, supportEmail: event.target.value }))} className="mt-1 block w-full rounded-md border-0 bg-slate-50 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Custom Domain</span>
                  <input value={brandDraft.customDomain || ''} onChange={(event) => setBrandDraft((current) => ({ ...current, customDomain: event.target.value }))} placeholder="dash.customer.com" className="mt-1 block w-full rounded-md border-0 bg-slate-50 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Domain Status</span>
                  <select value={brandDraft.domainStatus} onChange={(event) => setBrandDraft((current) => ({ ...current, domainStatus: event.target.value as WhiteLabelConfig['domainStatus'] }))} className="mt-1 block w-full rounded-md border-0 bg-slate-50 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700">
                    {DOMAIN_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Portal Subtitle</span>
                  <input value={brandDraft.portalTitle || ''} onChange={(event) => setBrandDraft((current) => ({ ...current, portalTitle: event.target.value }))} className="mt-1 block w-full rounded-md border-0 bg-slate-50 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-orange-500 dark:bg-slate-950 dark:ring-slate-700" />
                </label>
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <button type="button" onClick={saveBranding} className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500">
                    <CheckCircle2 className="h-4 w-4" />
                    Save White Label
                  </button>
                  <button type="button" onClick={copyDnsHint} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    <Copy className="h-4 w-4" />
                    Copy DNS Hint
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-950 p-5 text-white dark:border-slate-800">
                <div className="flex items-center gap-3">
                  {brandDraft.logoUrl ? (
                    <img src={brandDraft.logoUrl} alt={brandDraft.productName} className="h-11 w-11 rounded-lg object-contain" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg" style={{ backgroundColor: `${brandDraft.primaryColor}22`, color: brandDraft.primaryColor }}>
                      <Globe2 className="h-6 w-6" />
                    </div>
                  )}
                  <div>
                    <p className="text-lg font-bold">{brandDraft.productName || 'AI IoT Dashboard'}</p>
                    <p className="text-xs text-slate-400">{brandDraft.companyName || 'Partner Company'}</p>
                  </div>
                </div>
                <div className="mt-8 rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Portal</p>
                  <p className="mt-2 text-xl font-semibold">{brandDraft.portalTitle || 'Industrial Monitoring Platform'}</p>
                  <p className="mt-3 text-sm text-slate-400">{brandDraft.customDomain || 'No custom domain configured'}</p>
                  <span className="mt-4 inline-flex rounded-full px-2 py-1 text-xs font-semibold" style={{ backgroundColor: `${brandDraft.primaryColor}22`, color: brandDraft.primaryColor }}>
                    {brandDraft.domainStatus}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-300">
                Partner / White Label uses the existing role and App Profile model. Use Customer Accounts or Settings {'->'} Users to assign roles, bind Sites, and override module access per user.
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Typical Use</th>
                      <th className="px-4 py-3">Recommended App Profile</th>
                      <th className="px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {[
                      ['Owner / Admin', 'Platform operator', 'Full Platform', 'Can manage users, settings, Partner Portal, devices, workflows, and data sources.'],
                      ['Partner', 'System integrator / reseller', 'Full Platform', 'Can manage customer delivery records and white-label setup.'],
                      ['Engineer', 'Implementation team', 'Automation / SCADA', 'Good fit for deployment, workflow, SCADA, raw data, and device diagnostics.'],
                      ['Operator', 'Customer operations', 'Operations Dashboard', 'Daily monitoring, analytics, alerts, reports, and controlled operations.'],
                      ['Customer', 'Simple device user', 'Simple Device App', 'Device list, claim flow, profile, and device operations only.'],
                    ].map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell) => <td key={cell} className="px-4 py-3 text-slate-700 dark:text-slate-300">{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
