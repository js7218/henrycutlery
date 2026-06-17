'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { 
  User, 
  Package, 
  Heart, 
  MapPin, 
  Settings, 
  ChevronRight,
  Trash2,
  Edit,
  Plus,
  LogOut,
  ShoppingBag
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { formatPrice, formatDate, cn } from '@/lib/utils';
import { products } from '@/data/products';
import ProductCard from '@/components/product/ProductCard';

type Tab = 'orders' | 'favorites' | 'addresses' | 'settings';

const tabs = [
  { id: 'orders' as Tab, label: '我的订单', icon: Package },
  { id: 'favorites' as Tab, label: '我的收藏', icon: Heart },
  { id: 'addresses' as Tab, label: '收货地址', icon: MapPin },
  { id: 'settings' as Tab, label: '账户设置', icon: Settings },
];

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-20 text-center text-gray-400">加载中...</div>}>
      <ProfileContent />
    </Suspense>
  );
}

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, logout, dispatch } = useApp();
  
  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<any>(null);
  const [addressForm, setAddressForm] = useState({
    name: '',
    phone: '',
    province: '',
    city: '',
    district: '',
    detail: '',
    isDefault: false,
  });

  useEffect(() => {
    const tab = searchParams.get('tab') as Tab;
    if (tab && tabs.some(t => t.id === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!state.user) {
      router.push('/login');
    }
  }, [state.user, router]);

  if (!state.user) {
    return null;
  }

  const favoriteProducts = state.user ? products.filter(p => state.user?.favorites.includes(p.id)) : [];

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: '待支付', color: 'text-yellow-400' },
    paid: { label: '已支付', color: 'text-blue-400' },
    processing: { label: '处理中', color: 'text-blue-400' },
    shipped: { label: '已发货', color: 'text-purple-400' },
    delivered: { label: '已完成', color: 'text-green-400' },
    cancelled: { label: '已取消', color: 'text-red-400' },
  };

  const handleSaveAddress = () => {
    if (editingAddress) {
      dispatch({
        type: 'UPDATE_ADDRESS',
        address: { ...addressForm, id: editingAddress.id },
      });
    } else {
      dispatch({
        type: 'ADD_ADDRESS',
        address: { ...addressForm, id: `a${Date.now()}` },
      });
    }
    setShowAddressForm(false);
    setEditingAddress(null);
    setAddressForm({
      name: '',
      phone: '',
      province: '',
      city: '',
      district: '',
      detail: '',
      isDefault: false,
    });
  };

  const handleEditAddress = (address: any) => {
    setEditingAddress(address);
    setAddressForm(address);
    setShowAddressForm(true);
  };

  const handleDeleteAddress = (addressId: string) => {
    dispatch({ type: 'DELETE_ADDRESS', addressId });
  };

  const handleSetDefaultAddress = (addressId: string) => {
    dispatch({ type: 'SET_DEFAULT_ADDRESS', addressId });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <aside className="lg:w-64 flex-shrink-0">
          {/* User Info */}
          <div className="bg-surface border border-border rounded-lg p-6 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gold/20 flex items-center justify-center">
                <User className="w-8 h-8 text-gold" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">{state.user.name}</h2>
                <p className="text-sm text-gray-400">{state.user.email}</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="bg-surface border border-border rounded-lg overflow-hidden">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-6 py-4 text-left transition-colors',
                  activeTab === tab.id 
                    ? 'bg-gold/10 text-gold border-l-2 border-gold' 
                    : 'text-gray-400 hover:bg-surfaceLight hover:text-foreground'
                )}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
                {tab.id === 'orders' && state.orders.length > 0 && (
                  <span className="ml-auto px-2 py-0.5 bg-gold/20 text-gold text-xs rounded-full">
                    {state.orders.length}
                  </span>
                )}
                {tab.id === 'favorites' && state.user && state.user.favorites.length > 0 && (
                  <span className="ml-auto px-2 py-0.5 bg-gold/20 text-gold text-xs rounded-full">
                    {state.user.favorites.length}
                  </span>
                )}
              </button>
            ))}
            <div className="border-t border-border">
              <button
                onClick={() => {
                  logout();
                  router.push('/');
                }}
                className="w-full flex items-center gap-3 px-6 py-4 text-left text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                退出登录
              </button>
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1">
          {/* Orders Tab */}
          {activeTab === 'orders' && (
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
                我的订单
              </h1>
              
              {state.orders.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-12 text-center">
                  <ShoppingBag className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-400 mb-2">暂无订单</h3>
                  <p className="text-sm text-gray-500 mb-6">快去选购心仪的刀具吧</p>
                  <Link href="/products" className="btn-primary">
                    浏览商品
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {state.orders.map(order => (
                    <div key={order.id} className="bg-surface border border-border rounded-lg p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b border-border">
                        <div>
                          <p className="text-sm text-gray-400">订单号</p>
                          <p className="font-mono text-foreground">{order.orderNumber}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-400">下单时间</p>
                          <p className="text-foreground">{formatDate(order.createdAt)}</p>
                        </div>
                        <div>
                          <p className={cn('font-medium', statusLabels[order.status].color)}>
                            {statusLabels[order.status].label}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-400">订单金额</p>
                          <p className="text-lg font-semibold text-gold">{formatPrice(order.totalAmount)}</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-4">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-3 bg-surfaceLight rounded-lg p-3">
                            <div className="relative w-16 h-16 rounded overflow-hidden">
                              <Image
                                src={item.productImage}
                                alt={item.productName}
                                fill
                                className="object-cover"
                              />
                            </div>
                            <div>
                              <p className="text-sm text-foreground line-clamp-1">{item.productName}</p>
                              <p className="text-xs text-gray-400">x{item.quantity}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Favorites Tab */}
          {activeTab === 'favorites' && (
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
                我的收藏
              </h1>
              
              {favoriteProducts.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-12 text-center">
                  <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-400 mb-2">暂无收藏</h3>
                  <p className="text-sm text-gray-500 mb-6">在商品详情页点击爱心即可收藏</p>
                  <Link href="/products" className="btn-primary">
                    浏览商品
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {favoriteProducts.map(product => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Addresses Tab */}
          {activeTab === 'addresses' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>
                  收货地址
                </h1>
                {!showAddressForm && (
                  <button
                    onClick={() => {
                      setShowAddressForm(true);
                      setEditingAddress(null);
                      setAddressForm({
                        name: '',
                        phone: '',
                        province: '',
                        city: '',
                        district: '',
                        detail: '',
                        isDefault: false,
                      });
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gold text-background rounded-lg hover:bg-goldLight transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    新增地址
                  </button>
                )}
              </div>

              {showAddressForm && (
                <div className="bg-surface border border-gold/50 rounded-lg p-6 mb-6">
                  <h3 className="font-semibold text-foreground mb-4">
                    {editingAddress ? '编辑地址' : '新增地址'}
                  </h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <input
                      placeholder="收货人姓名"
                      value={addressForm.name}
                      onChange={e => setAddressForm({ ...addressForm, name: e.target.value })}
                      className="input-field col-span-2 md:col-span-1"
                    />
                    <input
                      placeholder="手机号码"
                      value={addressForm.phone}
                      onChange={e => setAddressForm({ ...addressForm, phone: e.target.value })}
                      className="input-field col-span-2 md:col-span-1"
                    />
                    <input
                      placeholder="省份"
                      value={addressForm.province}
                      onChange={e => setAddressForm({ ...addressForm, province: e.target.value })}
                      className="input-field"
                    />
                    <input
                      placeholder="城市"
                      value={addressForm.city}
                      onChange={e => setAddressForm({ ...addressForm, city: e.target.value })}
                      className="input-field"
                    />
                    <input
                      placeholder="区县"
                      value={addressForm.district}
                      onChange={e => setAddressForm({ ...addressForm, district: e.target.value })}
                      className="input-field"
                    />
                    <input
                      placeholder="详细地址"
                      value={addressForm.detail}
                      onChange={e => setAddressForm({ ...addressForm, detail: e.target.value })}
                      className="input-field col-span-2"
                    />
                  </div>
                  <label className="flex items-center gap-2 mb-6 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addressForm.isDefault}
                      onChange={e => setAddressForm({ ...addressForm, isDefault: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-600 bg-surfaceLight text-gold"
                    />
                    <span className="text-sm text-gray-400">设为默认地址</span>
                  </label>
                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        setShowAddressForm(false);
                        setEditingAddress(null);
                      }}
                      className="px-6 py-2 border border-border rounded-lg text-gray-400 hover:text-foreground"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveAddress}
                      className="px-6 py-2 bg-gold text-background rounded-lg hover:bg-goldLight"
                    >
                      保存
                    </button>
                  </div>
                </div>
              )}

              {state.user.addresses.length === 0 && !showAddressForm ? (
                <div className="bg-surface border border-border rounded-lg p-12 text-center">
                  <MapPin className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-400 mb-2">暂无收货地址</h3>
                  <p className="text-sm text-gray-500">点击上方按钮添加收货地址</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {state.user.addresses.map(address => (
                    <div
                      key={address.id}
                      className={cn(
                        'bg-surface border rounded-lg p-5 relative',
                        address.isDefault ? 'border-gold' : 'border-border'
                      )}
                    >
                      {address.isDefault && (
                        <span className="absolute top-3 right-3 px-2 py-0.5 bg-gold/20 text-gold text-xs rounded">
                          默认
                        </span>
                      )}
                      <h3 className="font-medium text-foreground pr-16">{address.name}</h3>
                      <p className="text-sm text-gray-400 mt-1">{address.phone}</p>
                      <p className="text-sm text-gray-400 mt-1">
                        {address.province} {address.city} {address.district}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">{address.detail}</p>
                      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
                        <button
                          onClick={() => handleEditAddress(address)}
                          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gold transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                          编辑
                        </button>
                        {!address.isDefault && (
                          <button
                            onClick={() => handleSetDefaultAddress(address.id)}
                            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gold transition-colors"
                          >
                            设为默认
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteAddress(address.id)}
                          className="flex items-center gap-1 text-sm text-gray-400 hover:text-red-400 transition-colors ml-auto"
                        >
                          <Trash2 className="w-4 h-4" />
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
                账户设置
              </h1>
              
              <div className="bg-surface border border-border rounded-lg divide-y divide-border">
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-foreground">用户名</h3>
                    <p className="text-sm text-gray-400">{state.user.name}</p>
                  </div>
                  <button className="text-gold text-sm hover:underline">修改</button>
                </div>
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-foreground">邮箱</h3>
                    <p className="text-sm text-gray-400">{state.user.email}</p>
                  </div>
                  <button className="text-gold text-sm hover:underline">修改</button>
                </div>
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-foreground">手机号码</h3>
                    <p className="text-sm text-gray-400">{state.user.phone || '未绑定'}</p>
                  </div>
                  <button className="text-gold text-sm hover:underline">绑定</button>
                </div>
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-foreground">密码</h3>
                    <p className="text-sm text-gray-400">••••••••</p>
                  </div>
                  <button className="text-gold text-sm hover:underline">修改</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
