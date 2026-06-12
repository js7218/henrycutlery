'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Database, Loader2, MessageSquare, Search, ShieldX, Users } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatDate, formatPrice, cn } from '@/lib/utils';

type Tab = 'dashboard' | 'customers' | 'reviews' | 'security';

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

const tabs: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'reviews', label: 'Reviews', icon: MessageSquare },
  { id: 'security', label: 'Security', icon: Database },
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export default function AdminPage() {
  const { hasRole } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStatus, setReviewStatus] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [error, setError] = useState('');

  useEffect(() => {
    const checkAuthorization = async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      setIsAuthorized(hasRole('admin'));
      setIsLoading(false);
    };
    checkAuthorization();
  }, [hasRole]);

  const loadCustomers = useCallback(async (search = query) => {
    setError('');
    try {
      const data = await fetchJson<{ customers: Customer[] }>(`/api/admin/customers?q=${encodeURIComponent(search)}&limit=50`);
      setCustomers(data.customers);
    } catch (err) {
      setError(err instanceof Error ? err.message : '客户查询失败');
    }
  }, [query]);

  const loadCustomerDetail = async (customerId: string) => {
    setError('');
    try {
      const data = await fetchJson<CustomerDetail>(`/api/admin/customers/${customerId}`);
      setSelected(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '客户详情加载失败');
    }
  };

  const loadReviews = useCallback(async (status = reviewStatus) => {
    setError('');
    try {
      const data = await fetchJson<{ reviews: Review[] }>(`/api/admin/reviews?status=${status}`);
      setReviews(data.reviews);
    } catch (err) {
      setError(err instanceof Error ? err.message : '评论加载失败');
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
      setError(err instanceof Error ? err.message : '评论更新失败');
    }
  };

  useEffect(() => {
    if (!isAuthorized) return;
    loadCustomers('');
    loadReviews('pending');
  }, [isAuthorized, loadCustomers, loadReviews]);

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
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
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
              <h2 className="text-lg font-semibold text-foreground mb-3">管理员可以看什么</h2>
              <p className="text-gray-400 text-sm leading-6">
                在 Customers 里可以按邮箱、姓名、手机号、订单号、地址关键词搜索客户；点客户后可以查看该账号的收货地址和订单摘要。
                在 Reviews 里可以审核评论，恶意评论不会公开展示。
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
                  <button
                    key={customer.id}
                    onClick={() => loadCustomerDetail(customer.id)}
                    className="w-full text-left p-4 border-b border-border hover:bg-surfaceLight transition-colors"
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
                        {selected.orders.map((order) => (
                          <div key={order.id} className="p-3 rounded-lg bg-surfaceLight text-sm flex justify-between gap-4">
                            <div>
                              <p className="text-foreground font-mono">{order.orderNumber}</p>
                              <p className="text-gray-400">{order.status} · {order.paymentMethod}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-gold">{formatPrice(order.totalAmount)}</p>
                              <p className="text-xs text-gray-500">{formatDate(order.createdAt)}</p>
                            </div>
                          </div>
                        ))}
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

        {activeTab === 'security' && (
          <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>Neon 密码轮换流程</h1>
            <p className="text-gray-400">如果怀疑数据库连接串、Vercel 环境变量或 GitHub token 泄漏，就按这个流程轮换。</p>
            <ol className="list-decimal pl-6 space-y-3 text-gray-300">
              <li>进入 Neon 控制台，打开 `henrycutlery-db`。</li>
              <li>进入 `Roles`，选择网站正在使用的数据库 role。</li>
              <li>点击 `Reset password` 或 `Rotate password`，生成新密码。</li>
              <li>回到 Vercel 项目，确认 Neon Integration 已把新的 `DATABASE_URL` / `DATABASE_URL_UNPOOLED` 同步到环境变量。</li>
              <li>重新部署一次 Vercel，让新连接串生效。</li>
              <li>旧密码失效后，用网站注册/登录测试数据库是否正常。</li>
            </ol>
            <p className="text-sm text-yellow-300">不要把 `DATABASE_URL`、`PGPASSWORD`、GitHub token 发给别人，也不要写进源码。</p>
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
