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
  { id: 'orders' as Tab, label: 'My Orders', icon: Package },
  { id: 'favorites' as Tab, label: 'My Favorites', icon: Heart },
  { id: 'addresses' as Tab, label: 'Addresses', icon: MapPin },
  { id: 'settings' as Tab, label: 'Account Settings', icon: Settings },
];

function validAddressPart(value?: string, min = 2, max = 100) {
  const clean = (value || '').trim();
  return clean.length >= min &&
    clean.length <= max &&
    !/^(n\/a|na|none|null|undefined|省份|城市|地区|province|city|district)$/i.test(clean);
}

function validInternationalPhone(phone?: string) {
  return /^\+[1-9]\d{0,3}\s?[0-9][0-9\s().-]{5,30}$/.test((phone || '').trim());
}

function getAddressError(address: { name: string; phone: string; province: string; city: string; district: string; detail: string }) {
  if (!validAddressPart(address.name, 2, 100)) return 'Please enter a valid name.';
  if (!validInternationalPhone(address.phone)) return 'Please enter phone number with country code, e.g. +86 13800138000.';
  if (!validAddressPart(address.province)) return 'Please enter a valid province/state.';
  if (!validAddressPart(address.city)) return 'Please enter a valid city.';
  if (!validAddressPart(address.district)) return 'Please enter a valid district/area.';
  if (!validAddressPart(address.detail, 5, 300)) return 'Please enter a complete detailed address.';
  return '';
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-20 text-center text-gray-400">Loading...</div>}>
      <ProfileContent />
    </Suspense>
  );
}

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, logout, dispatch, refreshUser } = useApp();

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
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [addressError, setAddressError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

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

  useEffect(() => {
    if (state.user) {
      setProfileName(state.user.name || '');
      setProfilePhone(state.user.phone || '');
    }
  }, [state.user]);

  if (!state.user) {
    return null;
  }

  const favoriteProducts = state.user ? products.filter(p => state.user?.favorites.includes(p.id)) : [];

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pending Payment', color: 'text-yellow-400' },
    paid: { label: 'Paid', color: 'text-blue-400' },
    processing: { label: 'Processing', color: 'text-blue-400' },
    shipped: { label: 'Shipped', color: 'text-purple-400' },
    delivered: { label: 'Completed', color: 'text-green-400' },
    cancelled: { label: 'Cancelled', color: 'text-red-400' },
  };

  const handleSaveAddress = () => {
    const error = getAddressError(addressForm);
    if (error) {
      setAddressError(error);
      return;
    }
    setAddressError('');
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

  const saveProfile = async () => {
    setSettingsError('');
    setSettingsMessage('');
    setSavingProfile(true);
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'profile',
          name: profileName,
          phone: profilePhone,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        setSettingsError(data.error || 'Failed to update account information.');
        return;
      }
      if (data.user) {
        dispatch({ type: 'SET_USER', user: data.user });
      } else {
        await refreshUser();
      }
      setSettingsMessage('Account information updated.');
    } catch {
      setSettingsError('Network error. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    setSettingsError('');
    setSettingsMessage('');
    if (newPassword !== confirmPassword) {
      setSettingsError('New passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'password',
          currentPassword,
          newPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        setSettingsError(data.error || 'Failed to update password.');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSettingsMessage('Password updated successfully.');
    } catch {
      setSettingsError('Network error. Please try again.');
    } finally {
      setSavingPassword(false);
    }
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
                Logout
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
                My Orders
              </h1>
              
              {state.orders.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-12 text-center">
                  <ShoppingBag className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-400 mb-2">No Orders Yet</h3>
                  <p className="text-sm text-gray-500 mb-6">Go shop for your favorite knives</p>
                  <Link href="/products" className="btn-primary">
                    Browse Products
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {state.orders.map(order => (
                    <div key={order.id} className="bg-surface border border-border rounded-lg p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b border-border">
                        <div>
                          <p className="text-sm text-gray-400">Order Number</p>
                          <p className="font-mono text-foreground">{order.orderNumber}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-400">Order Date</p>
                          <p className="text-foreground">{formatDate(order.createdAt)}</p>
                        </div>
                        <div>
                          <p className={cn('font-medium', statusLabels[order.status].color)}>
                            {statusLabels[order.status].label}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-400">Total</p>
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
                              <p className="text-sm text-foreground line-clamp-1">{item.productName.toUpperCase()}</p>
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
                My Favorites
              </h1>
              
              {favoriteProducts.length === 0 ? (
                <div className="bg-surface border border-border rounded-lg p-12 text-center">
                  <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-400 mb-2">No Favorites</h3>
                  <p className="text-sm text-gray-500 mb-6">Click the heart icon on product pages to add favorites</p>
                  <Link href="/products" className="btn-primary">
                    Browse Products
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
                  Shipping Addresses
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
                    Add Address
                  </button>
                )}
              </div>

              {showAddressForm && (
                <div className="bg-surface border border-gold/50 rounded-lg p-6 mb-6">
                  <h3 className="font-semibold text-foreground mb-4">
                    {editingAddress ? 'Edit Address' : 'Add New Address'}
                  </h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <input
                      placeholder="Name"
                      value={addressForm.name}
                      onChange={e => setAddressForm({ ...addressForm, name: e.target.value })}
                      className="input-field col-span-2 md:col-span-1"
                    />
                    <input
                      placeholder="Phone Number, e.g. +86 13800138000"
                      value={addressForm.phone}
                      onChange={e => setAddressForm({ ...addressForm, phone: e.target.value })}
                      className="input-field col-span-2 md:col-span-1"
                    />
                    <input
                      placeholder="Province"
                      value={addressForm.province}
                      onChange={e => setAddressForm({ ...addressForm, province: e.target.value })}
                      className="input-field"
                    />
                    <input
                      placeholder="City"
                      value={addressForm.city}
                      onChange={e => setAddressForm({ ...addressForm, city: e.target.value })}
                      className="input-field"
                    />
                    <input
                      placeholder="District"
                      value={addressForm.district}
                      onChange={e => setAddressForm({ ...addressForm, district: e.target.value })}
                      className="input-field"
                    />
                    <input
                      placeholder="Detailed Address"
                      value={addressForm.detail}
                      onChange={e => setAddressForm({ ...addressForm, detail: e.target.value })}
                      className="input-field col-span-2"
                    />
                  </div>
                  {addressError && (
                    <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                      {addressError}
                    </p>
                  )}
                  <label className="flex items-center gap-2 mb-6 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addressForm.isDefault}
                      onChange={e => setAddressForm({ ...addressForm, isDefault: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-600 bg-surfaceLight text-gold"
                    />
                    <span className="text-sm text-gray-400">Set as default address</span>
                  </label>
                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        setShowAddressForm(false);
                        setEditingAddress(null);
                      }}
                      className="px-6 py-2 border border-border rounded-lg text-gray-400 hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveAddress}
                      className="px-6 py-2 bg-gold text-background rounded-lg hover:bg-goldLight"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {state.user.addresses.length === 0 && !showAddressForm ? (
                <div className="bg-surface border border-border rounded-lg p-12 text-center">
                  <MapPin className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-400 mb-2">No Addresses</h3>
                  <p className="text-sm text-gray-500">Click the button above to add a shipping address</p>
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
                          Default
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
                          Edit
                        </button>
                        {!address.isDefault && (
                          <button
                            onClick={() => handleSetDefaultAddress(address.id)}
                            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gold transition-colors"
                          >
                            Set as Default
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteAddress(address.id)}
                          className="flex items-center gap-1 text-sm text-gray-400 hover:text-red-400 transition-colors ml-auto"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
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
                Account Settings
              </h1>

              {settingsError && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                  {settingsError}
                </div>
              )}
              {settingsMessage && (
                <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-300">
                  {settingsMessage}
                </div>
              )}

              <div className="space-y-6">
                <div className="bg-surface border border-border rounded-lg p-6">
                  <h3 className="font-medium text-foreground mb-4">Account Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Username</label>
                      <input
                        value={profileName}
                        onChange={(event) => setProfileName(event.target.value)}
                        className="input-field"
                        maxLength={100}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Phone Number</label>
                      <input
                        value={profilePhone}
                        onChange={(event) => setProfilePhone(event.target.value)}
                        className="input-field"
                        maxLength={20}
                        placeholder="Phone number"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm text-gray-400 mb-2">Email</label>
                      <input value={state.user.email} disabled className="input-field opacity-70" />
                      <p className="mt-2 text-xs text-gray-500">Email cannot be changed for account security.</p>
                    </div>
                  </div>
                  <button
                    onClick={saveProfile}
                    disabled={savingProfile}
                    className="mt-5 px-6 py-2 bg-gold text-background rounded-lg hover:bg-goldLight disabled:opacity-60"
                  >
                    {savingProfile ? 'Saving...' : 'Save Account Information'}
                  </button>
                </div>

                <div className="bg-surface border border-border rounded-lg p-6">
                  <h3 className="font-medium text-foreground mb-4">Change Password</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Current Password</label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        className="input-field"
                        autoComplete="current-password"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        className="input-field"
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        className="input-field"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <button
                    onClick={savePassword}
                    disabled={savingPassword}
                    className="mt-5 px-6 py-2 bg-gold text-background rounded-lg hover:bg-goldLight disabled:opacity-60"
                  >
                    {savingPassword ? 'Saving...' : 'Update Password'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
