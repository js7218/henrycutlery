'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, BookOpen, Database, FlaskConical, Inbox, Loader2, MessageSquare, Package, ReceiptText, Scale, Search, ShieldX, Sparkles, Trash2, TrendingUp, Truck, Users } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatDate, formatPrice, cn } from '@/lib/utils';
import SeoReviewPanel from '@/components/admin/SeoReviewPanel';
import HealthBanner from '@/components/admin/HealthBanner';
import AdminHint from '@/components/admin/AdminHint';

type Tab = 'dashboard' | 'customers' | 'reviews' | 'inquiries' | 'seo' | 'security';

type Customer = {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  addressCount: number;
  orderCount: number;
  createdAt: string;
};

type CustomerDetail = {
  customer: Customer;
  addresses: Array<{
    id: string;
    name: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    detail: string;
    is_default: boolean;
  }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    totalAmount: number;
    status: string;
    paymentMethod: string;
    trackingNumber?: string;
    createdAt: string;
  }>;
};

type Review = {
  id: string;
  productId: string;
  userId: string;
  author: string;
  rating: number;
  content: string;
  status: 'pending' | 'approved' | 'rejected';
  riskScore: number;
  riskReason: string;
  createdAt: string;
};

type Inquiry = {
  id: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  company: string;
  items: Array<{ productId: string; productName: string; price: number; quantity: number; lineTotal: number }>;
  totalAmount: number;
  startDate: string;
  expectedDelivery: string;
  customization: string;
  notes: string;
  reason: string;
  companyCheck: { status: string; note: string; sources: string[] } | null;
  status: 'new' | 'quoted' | 'sample_sent' | 'won' | 'closed';
  createdAt: string;
};

const inquiryStatusLabels: Record<Inquiry['status'], string> = {
  new: 'New',
  quoted: 'Quoted',
  sample_sent: 'Sample Sent',
  won: 'Won',
  closed: 'Closed',
};

const tabs: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'reviews', label: 'Reviews', icon: MessageSquare },
  { id: 'inquiries', label: 'Inquiries', icon: Inbox },
  { id: 'seo', label: 'SEO', icon: Sparkles },
  { id: 'security', label: 'Security', icon: Database },
];

// One-line reminder per tab, so staff who forgot the manual still know what to do.
const tabHints: Record<Tab, { section: string; text: string }> = {
  dashboard: {
    section: 'dashboard',
    text: '这页是总览：客户数、订单数、地址数、待审评论。点上方标签进入对应模块，表格里的数字点开就能看明细。',
  },
  customers: {
    section: 'customers',
    text: '按邮箱、姓名、电话、订单号搜索客户；点一行可看他的地址和历史订单。右侧垃圾桶是删客户：账号不能登录，但历史订单保留用于对账。',
  },
  reviews: {
    section: 'reviews',
    text: '客户评论先到这里等你审。Approve = 前台显示；Reject = 隐藏。拿不准就先放着，不会影响客户下单。',
  },
  inquiries: {
    section: 'inquiries',
    text: '批量询价单都在这。先回邮件报价，再回来改状态：New → Quoted → Sample Sent → Won / Closed。',
  },
  seo: {
    section: 'seo',
    text: '检查每个产品的标题和描述够不够完整。按红色提示补齐后点保存，前台搜索排名会更稳。',
  },
  security: {
    section: 'security',
    text: '这里看登录记录、封禁名单和异常情况；数据库密码轮换也在这一页。看不懂的先别动，截图发我。',
  },
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export default function AdminPage() {
  const { hasRole, isSessionReady } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [pinChecking, setPinChecking] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinConfigured, setPinConfigured] = useState(true);
  const [pin, setPin] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStatus, setReviewStatus] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [orderDrafts, setOrderDrafts] = useState<Record<string, { status: string; trackingNumber: string }>>({});
  const [savingOrderId, setSavingOrderId] = useState('');
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [inquiryStatus, setInquiryStatus] = useState<'all' | Inquiry['status']>('all');
  const [updatingInquiryId, setUpdatingInquiryId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // 必须等服务端会话加载完成后才能判断权限。
    // 之前这里用固定 200ms 延迟，会话慢于 200ms 时会把管理员误判为无权限。
    if (!isSessionReady) return;
    setIsAuthorized(hasRole('admin'));
    setIsLoading(false);
  }, [hasRole, isSessionReady]);

  useEffect(() => {
    if (!isAuthorized) return;
    let cancelled = false;
    setPinChecking(true);
    fetch('/api/admin/pin', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setPinConfigured(Boolean(data.configured));
        setPinVerified(Boolean(data.verified));
        if (!data.configured) {
          setError('ADMIN_PANEL_PIN is not configured in Vercel environment variables.');
        }
      })
      .catch(() => {
        if (!cancelled) setPinVerified(false);
      })
      .finally(() => {
        if (!cancelled) setPinChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthorized]);

  const loadCustomers = useCallback(async (search = query) => {
    setError('');
    try {
      const data = await fetchJson<{ customers: Customer[] }>(`/api/admin/customers?q=${encodeURIComponent(search)}&limit=50`);
      setCustomers(data.customers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers.');
    }
  }, [query]);

  const loadCustomerDetail = async (customerId: string) => {
    setError('');
    try {
      const data = await fetchJson<CustomerDetail>(`/api/admin/customers/${customerId}`);
      setSelected(data);
      setOrderDrafts(
        Object.fromEntries(
          data.orders.map((order) => [
            order.id,
            { status: order.status, trackingNumber: order.trackingNumber || '' },
          ])
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer detail.');
    }
  };

  const removeCustomer = async (customer: Customer) => {
    const confirmed = window.confirm(
      `Delete ${customer.email}?\n\nThe account can no longer sign in and disappears from search. Existing orders stay in the records for accounting.`
    );
    if (!confirmed) return;

    setError('');
    try {
      const res = await fetch(`/api/admin/customers?id=${encodeURIComponent(customer.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Delete failed.');
      }
      setCustomers((prev) => prev.filter((item) => item.id !== customer.id));
      setSelected((prev) => (prev && prev.customer.id === customer.id ? null : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const updateOrderDraft = (orderId: string, patch: Partial<{ status: string; trackingNumber: string }>) => {
    setOrderDrafts((prev) => ({
      ...prev,
      [orderId]: { ...(prev[orderId] || { status: '', trackingNumber: '' }), ...patch },
    }));
  };

  const saveOrder = async (orderId: string) => {
    const draft = orderDrafts[orderId];
    if (!draft) return;
    setError('');
    setSavingOrderId(orderId);
    try {
      await fetchJson('/api/order/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          status: draft.status,
          trackingNumber: draft.trackingNumber,
        }),
      });
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              orders: prev.orders.map((order) =>
                order.id === orderId
                  ? { ...order, status: draft.status, trackingNumber: draft.trackingNumber }
                  : order
              ),
            }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update order.');
    } finally {
      setSavingOrderId('');
    }
  };

  const loadReviews = useCallback(async (status = reviewStatus) => {
    setError('');
    try {
      const data = await fetchJson<{ reviews: Review[] }>(`/api/admin/reviews?status=${status}`);
      setReviews(data.reviews);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews.');
    }
  }, [reviewStatus]);

  const updateReview = async (id: string, action: 'approve' | 'reject' | 'delete') => {
    setError('');
    try {
      await fetchJson('/api/admin/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      await loadReviews();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update review.');
    }
  };

  const loadInquiries = useCallback(async (status = inquiryStatus) => {
    setError('');
    try {
      const data = await fetchJson<{ inquiries: Inquiry[] }>(`/api/admin/inquiries?status=${status}`);
      setInquiries(data.inquiries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inquiries.');
    }
  }, [inquiryStatus]);

  const updateInquiry = async (id: string, status: Inquiry['status']) => {
    setError('');
    setUpdatingInquiryId(id);
    try {
      await fetchJson(`/api/admin/inquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setInquiries((prev) => prev.map((inquiry) => (inquiry.id === id ? { ...inquiry, status } : inquiry)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update inquiry.');
    } finally {
      setUpdatingInquiryId('');
    }
  };

  const submitPin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setPinSubmitting(true);
    try {
      const data = await fetchJson<{ success: boolean }>('/api/admin/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (data.success) {
        setPinVerified(true);
        setPin('');
        await Promise.all([loadCustomers(''), loadReviews('pending'), loadInquiries('all')]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid admin PIN.');
    } finally {
      setPinSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isAuthorized || !pinVerified) return;
    loadCustomers('');
    loadReviews('pending');
    loadInquiries('all');
  }, [isAuthorized, pinVerified, loadCustomers, loadReviews, loadInquiries]);

  if (!isLoading && !isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
            <ShieldX className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
          <p className="text-gray-400 mb-6">You do not have permission to access the admin panel.</p>
          <Link href="/" className="inline-flex px-6 py-3 bg-gold text-background rounded-lg hover:bg-goldLight transition-colors">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold" />
      </div>
    );
  }

  if (pinChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold" />
      </div>
    );
  }

  if (!pinVerified) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <form onSubmit={submitPin} className="w-full max-w-md rounded-xl border border-border bg-surface p-8">
          <h1 className="mb-2 text-2xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>
            Admin PIN Required
          </h1>
          <p className="mb-6 text-sm text-gray-400">
            Your admin account is signed in. Enter the private admin panel PIN to continue.
          </p>
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {!pinConfigured && (
            <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">
              Add <code>ADMIN_PANEL_PIN</code> in Vercel Environment Variables, then redeploy.
            </div>
          )}
          <input
            type="password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="Admin panel PIN"
            autoComplete="off"
            disabled={pinSubmitting}
            className="mb-4 w-full rounded-lg border border-border bg-surfaceLight px-4 py-3 text-foreground placeholder:text-gray-500 focus:border-gold focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={pinSubmitting || !pin.trim()}
            className="flex w-full items-center justify-center rounded-lg bg-gold py-3 font-medium text-background hover:bg-goldLight disabled:opacity-60"
          >
            {pinSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Unlock Admin Panel'}
          </button>
          <Link href="/" className="mt-5 block text-center text-sm text-gray-400 hover:text-gold">
            Back to Store
          </Link>
        </form>
      </div>
    );
  }

  const totalOrders = customers.reduce((sum, customer) => sum + customer.orderCount, 0);
  const totalAddresses = customers.reduce((sum, customer) => sum + customer.addressCount, 0);
  const pendingReviews = reviews.filter((review) => review.status === 'pending').length;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-surface border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-gold-gradient" style={{ fontFamily: 'Playfair Display, serif' }}>
            ADAM CUTLERY <span className="text-sm text-steel">Admin</span>
          </Link>
          <Link href="/" className="text-sm text-gray-400 hover:text-gold transition-colors">Back to Store</Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {/* Wraps onto extra rows on narrow screens instead of hiding tabs
            behind a horizontal scroll. */}
        <div className="flex flex-wrap gap-2 mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap',
                activeTab === tab.id ? 'bg-gold text-background' : 'bg-surface border border-border text-gray-400 hover:text-foreground'
              )}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
          <Link
            href="/hc-control-2026/shipping"
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap bg-surface border border-border text-gray-400 hover:text-foreground"
          >
            <Truck className="w-5 h-5" />
            Shipping
          </Link>
          <Link
            href="/hc-control-2026/inventory"
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap bg-surface border border-border text-gray-400 hover:text-foreground"
          >
            <Package className="w-5 h-5" />
            Inventory
          </Link>
          <Link
            href="/hc-control-2026/compliance"
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap bg-surface border border-border text-gray-400 hover:text-foreground"
          >
            <Scale className="w-5 h-5" />
            Compliance
          </Link>
          <Link
            href="/hc-control-2026/shipping-market"
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap bg-surface border border-border text-gray-400 hover:text-foreground"
          >
            <TrendingUp className="w-5 h-5" />
            Rate Monitor
          </Link>
          <Link
            href="/hc-control-2026/samples"
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap bg-surface border border-border text-gray-400 hover:text-foreground"
          >
            <FlaskConical className="w-5 h-5" />
            Samples
          </Link>
          <Link
            href="/hc-control-2026/reconciliation"
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap bg-surface border border-border text-gray-400 hover:text-foreground"
          >
            <ReceiptText className="w-5 h-5" />
            Reconciliation
          </Link>
          <Link
            href="/hc-control-2026/guide"
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap bg-surface border border-border text-gray-400 hover:text-foreground"
          >
            <BookOpen className="w-5 h-5" />
            Guide
          </Link>
        </div>

        <HealthBanner />

        <div className="mt-4 mb-6">
          <AdminHint section={tabHints[activeTab].section}>{tabHints[activeTab].text}</AdminHint>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>Dashboard</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard label="Customers" value={customers.length} />
              <StatCard label="Orders" value={totalOrders} />
              <StatCard label="Addresses" value={totalAddresses} />
              <StatCard label="Pending Reviews" value={pendingReviews} />
            </div>
            <div className="bg-surface border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold text-foreground mb-3">What admins can do here</h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                In <strong>Customers</strong> you can search by email, name, phone, order number, or address keyword,
                and click a customer to see their saved addresses and order summary.
                In <strong>Reviews</strong> you can moderate product reviews; flagged or malicious comments stay hidden until approved.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>Customer Search</h1>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  loadCustomers(query);
                }}
                className="flex gap-2"
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Email / phone / order / address"
                    className="w-80 max-w-[70vw] pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold"
                  />
                </div>
                <button className="px-4 py-2 bg-gold text-background rounded-lg">Search</button>
              </form>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                {customers.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-start gap-3 p-4 border-b border-border"
                  >
                    <button
                      onClick={() => loadCustomerDetail(customer.id)}
                      className="flex-1 text-left hover:text-gold transition-colors"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-foreground font-medium">{customer.email}</p>
                          <p className="text-sm text-gray-400">{customer.name} · {customer.phone || 'No phone'}</p>
                        </div>
                        <p className="text-xs text-gray-500">{formatDate(customer.createdAt)}</p>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Addresses: {customer.addressCount} · Orders: {customer.orderCount}</p>
                    </button>
                    <button
                      onClick={() => removeCustomer(customer)}
                      title="Delete this customer account"
                      aria-label={`Delete ${customer.email}`}
                      className="shrink-0 rounded-lg border border-border px-2.5 py-2 text-gray-400 hover:text-red-400 hover:border-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {customers.length === 0 && <p className="p-6 text-gray-400">No customers found.</p>}
              </div>

              <div className="bg-surface border border-border rounded-xl p-6">
                {!selected ? (
                  <p className="text-gray-400">Select a customer to view addresses and orders.</p>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">{selected.customer.email}</h2>
                      <p className="text-sm text-gray-400">{selected.customer.name} · {selected.customer.phone || 'No phone'}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gold mb-3">Addresses</h3>
                      <div className="space-y-3">
                        {selected.addresses.map((address) => (
                          <div key={address.id} className="p-3 rounded-lg bg-surfaceLight text-sm">
                            <p className="text-foreground">{address.name} · {address.phone}</p>
                            <p className="text-gray-400">{address.province} {address.city} {address.district} {address.detail}</p>
                          </div>
                        ))}
                        {selected.addresses.length === 0 && <p className="text-gray-500 text-sm">No saved addresses.</p>}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gold mb-3">Orders</h3>
                      <div className="space-y-3">
                        {selected.orders.map((order) => {
                          const draft = orderDrafts[order.id] || { status: order.status, trackingNumber: order.trackingNumber || '' };
                          const editableStatuses = ['paid', 'shipped', 'delivered', 'cancelled'];
                          return (
                            <div key={order.id} className="p-3 rounded-lg bg-surfaceLight text-sm space-y-3">
                              <div className="flex justify-between gap-4">
                                <div>
                                  <p className="text-foreground font-mono">{order.orderNumber}</p>
                                  <p className="text-gray-400">{order.status} · {order.paymentMethod}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-gold">{formatPrice(order.totalAmount)}</p>
                                  <p className="text-xs text-gray-500">{formatDate(order.createdAt)}</p>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  value={draft.status}
                                  onChange={(event) => updateOrderDraft(order.id, { status: event.target.value })}
                                  className="px-2 py-1.5 bg-surface border border-border rounded text-foreground text-xs focus:outline-none focus:border-gold"
                                >
                                  {!editableStatuses.includes(draft.status) && (
                                    <option value={draft.status} disabled>{draft.status}</option>
                                  )}
                                  <option value="paid">paid</option>
                                  <option value="shipped">shipped</option>
                                  <option value="delivered">delivered</option>
                                  <option value="cancelled">cancelled</option>
                                </select>
                                <input
                                  value={draft.trackingNumber}
                                  onChange={(event) => updateOrderDraft(order.id, { trackingNumber: event.target.value })}
                                  placeholder="Tracking number"
                                  className="flex-1 min-w-[140px] px-2 py-1.5 bg-surface border border-border rounded text-foreground text-xs focus:outline-none focus:border-gold"
                                />
                                <button
                                  onClick={() => saveOrder(order.id)}
                                  disabled={savingOrderId === order.id}
                                  className="px-3 py-1.5 rounded bg-gold text-background text-xs disabled:opacity-60"
                                >
                                  {savingOrderId === order.id ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {selected.orders.length === 0 && <p className="text-gray-500 text-sm">No orders yet.</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>Review Moderation</h1>
              <select
                value={reviewStatus}
                onChange={(event) => {
                  const status = event.target.value as typeof reviewStatus;
                  setReviewStatus(status);
                  loadReviews(status);
                }}
                className="px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:border-gold"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="space-y-4">
              {reviews.map((review) => (
                <div key={review.id} className="bg-surface border border-border rounded-xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-foreground font-medium">{review.author} · {'★'.repeat(review.rating)}</p>
                      <p className="text-xs text-gray-500">Product: {review.productId} · Risk: {review.riskScore} · {review.riskReason}</p>
                    </div>
                    <span className={cn('px-2 py-1 rounded-full text-xs', review.status === 'approved' ? 'bg-green-500/10 text-green-400' : review.status === 'rejected' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400')}>
                      {review.status}
                    </span>
                  </div>
                  <p className="text-gray-300 mb-4 whitespace-pre-wrap">{review.content}</p>
                  <div className="flex gap-2">
                    <button onClick={() => updateReview(review.id, 'approve')} className="px-3 py-2 rounded bg-green-600 text-white text-sm">Approve</button>
                    <button onClick={() => updateReview(review.id, 'reject')} className="px-3 py-2 rounded bg-red-600 text-white text-sm">Reject</button>
                    <button onClick={() => updateReview(review.id, 'delete')} className="px-3 py-2 rounded border border-border text-gray-300 text-sm">Delete</button>
                  </div>
                </div>
              ))}
              {reviews.length === 0 && <p className="text-gray-400">No reviews in this status.</p>}
            </div>
          </div>
        )}

        {activeTab === 'inquiries' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>Bulk Order Inquiries</h1>
              <select
                value={inquiryStatus}
                onChange={(event) => {
                  const status = event.target.value as typeof inquiryStatus;
                  setInquiryStatus(status);
                  loadInquiries(status);
                }}
                className="px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:border-gold"
              >
                <option value="all">All</option>
                <option value="new">New</option>
                <option value="quoted">Quoted</option>
                <option value="sample_sent">Sample Sent</option>
                <option value="won">Won</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="space-y-4">
              {inquiries.map((inquiry) => (
                <div key={inquiry.id} className="bg-surface border border-border rounded-xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-foreground font-medium">
                        {inquiry.contactName}
                        {inquiry.company ? ` · ${inquiry.company}` : ''}
                      </p>
                      <p className="text-xs text-gray-500">
                        {inquiry.contactEmail} · {inquiry.contactPhone || 'No phone'} · {formatDate(inquiry.createdAt)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'px-2 py-1 rounded-full text-xs',
                        inquiry.status === 'won'
                          ? 'bg-green-500/10 text-green-400'
                          : inquiry.status === 'closed'
                            ? 'bg-gray-500/10 text-gray-400'
                            : inquiry.status === 'new'
                              ? 'bg-yellow-500/10 text-yellow-400'
                              : 'bg-blue-500/10 text-blue-300'
                      )}
                    >
                      {inquiryStatusLabels[inquiry.status]}
                    </span>
                  </div>

                  <div className="text-sm text-gray-300 space-y-1 mb-3">
                    {inquiry.items.map((item) => (
                      <p key={item.productId} className="flex justify-between gap-3">
                        <span>{item.productName} × {item.quantity}</span>
                        <span className="text-gold">{formatPrice(item.lineTotal)}</span>
                      </p>
                    ))}
                    <p className="text-foreground">Reference total: {formatPrice(inquiry.totalAmount)}</p>
                  </div>

                  {(inquiry.startDate || inquiry.expectedDelivery || inquiry.customization || inquiry.notes) && (
                    <div className="text-xs text-gray-400 space-y-1 mb-3">
                      {inquiry.startDate && <p>Start date: {inquiry.startDate}</p>}
                      {inquiry.expectedDelivery && <p>Delivery date: {inquiry.expectedDelivery}</p>}
                      {inquiry.customization && <p>Customization: {inquiry.customization}</p>}
                      {inquiry.notes && <p>Notes: {inquiry.notes}</p>}
                    </div>
                  )}

                  {inquiry.companyCheck && (
                    <p className="text-xs text-gray-400 mb-3">
                      Company: {inquiry.companyCheck.status} — {inquiry.companyCheck.note}
                    </p>
                  )}

                  <div className="flex items-center gap-3">
                    <select
                      value={inquiry.status}
                      onChange={(event) => updateInquiry(inquiry.id, event.target.value as Inquiry['status'])}
                      disabled={updatingInquiryId === inquiry.id}
                      className="px-3 py-2 bg-surfaceLight border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-gold disabled:opacity-60"
                    >
                      <option value="new">New</option>
                      <option value="quoted">Quoted</option>
                      <option value="sample_sent">Sample Sent</option>
                      <option value="won">Won</option>
                      <option value="closed">Closed</option>
                    </select>
                    {updatingInquiryId === inquiry.id && <span className="text-xs text-gray-500">Saving...</span>}
                  </div>
                </div>
              ))}
              {inquiries.length === 0 && <p className="text-gray-400">No inquiries in this status.</p>}
            </div>
          </div>
        )}

        {activeTab === 'seo' && <SeoReviewPanel />}

        {activeTab === 'security' && (
          <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>Neon Password Rotation</h1>
            <p className="text-gray-400">If you suspect the database URL, Vercel environment variables, or your GitHub token may be leaked, rotate the password using the steps below.</p>
            <ol className="list-decimal pl-6 space-y-3 text-gray-300">
              <li>Open the Neon console and select the <code>henrycutlery-db</code> project.</li>
              <li>Go to <strong>Roles</strong> and pick the database role used by the site.</li>
              <li>Click <strong>Reset password</strong> or <strong>Rotate password</strong> to generate a new credential.</li>
              <li>Back in the Vercel project, confirm that the Neon integration synced the new <code>DATABASE_URL</code> and <code>DATABASE_URL_UNPOOLED</code>.</li>
              <li>Trigger a fresh Vercel deployment so the new connection string takes effect.</li>
              <li>Once the old password is invalidated, test by registering and signing in on the live site.</li>
            </ol>
            <p className="text-sm text-yellow-300">Never share <code>DATABASE_URL</code>, <code>PGPASSWORD</code>, or GitHub tokens with anyone, and never commit them to source code.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-6">
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gold">{value}</p>
    </div>
  );
}
