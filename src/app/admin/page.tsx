'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useApp } from '@/context/AppContext';
import { ShieldX, Loader2 } from 'lucide-react';
import { 
  Package, 
  ShoppingCart, 
  Users, 
  BarChart3, 
  Plus, 
  Edit, 
  Trash2,
  Search,
  Eye,
  ChevronDown,
  CheckCircle,
  Clock,
  Truck,
  XCircle
} from 'lucide-react';
import { products as initialProducts } from '@/data/products';
import { formatPrice, formatDate, cn } from '@/lib/utils';
import { Product, Order, ProductCategory } from '@/types';

type Tab = 'products' | 'orders' | 'dashboard';

const tabs = [
  { id: 'dashboard' as Tab, label: '数据概览', icon: BarChart3 },
  { id: 'products' as Tab, label: '商品管理', icon: Package },
  { id: 'orders' as Tab, label: '订单管理', icon: ShoppingCart },
];

// Mock orders
const mockOrders: Order[] = [
  {
    id: 'o001',
    orderNumber: 'ORDM8K2N4P1',
    items: [
      { productId: 'p001', productName: '大马士革钢主厨刀', productImage: 'https://images.unsplash.com/photo-1593618998160-e34014e67546?w=800', price: 2999, quantity: 1 },
      { productId: 'p004', productName: '日式三德刀', productImage: 'https://images.unsplash.com/photo-1588854337221-4cf9fa96059c?w=800', price: 1299, quantity: 1 },
    ],
    totalAmount: 4298,
    status: 'processing',
    shippingAddress: {
      id: 'a001',
      name: '张三',
      phone: '13812345678',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      detail: '建国路88号1号楼1501',
      isDefault: true,
    },
    paymentMethod: 'wechat',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
  },
  {
    id: 'o002',
    orderNumber: 'ORDN5T7Q2R',
    items: [
      { productId: 'p002', productName: '战术折刀-暗影', productImage: 'https://images.unsplash.com/photo-1606755456206-b25206cde27e?w=800', price: 1899, quantity: 1 },
    ],
    totalAmount: 1899,
    status: 'shipped',
    shippingAddress: {
      id: 'a002',
      name: '李四',
      phone: '13987654321',
      province: '上海市',
      city: '上海市',
      district: '浦东新区',
      detail: '世纪大道1000号',
      isDefault: false,
    },
    paymentMethod: 'alipay',
    createdAt: '2024-01-14T15:20:00Z',
    updatedAt: '2024-01-15T09:00:00Z',
  },
  {
    id: 'o003',
    orderNumber: 'ORDP3V8S4T',
    items: [
      { productId: 'p006', productName: '博伊刀-猛犸', productImage: 'https://images.unsplash.com/photo-1533310266094-8898a03807dd?w=800', price: 3499, quantity: 1 },
    ],
    totalAmount: 3499,
    status: 'delivered',
    shippingAddress: {
      id: 'a003',
      name: '王五',
      phone: '13765432109',
      province: '广东省',
      city: '深圳市',
      district: '南山区',
      detail: '科技园南路88号',
      isDefault: true,
    },
    paymentMethod: 'card',
    createdAt: '2024-01-10T08:45:00Z',
    updatedAt: '2024-01-13T16:30:00Z',
  },
  {
    id: 'o004',
    orderNumber: 'ORDQ9W1U6V',
    items: [
      { productId: 'p013', productName: '大马士革钢匕首-龙牙', productImage: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=800', price: 4299, quantity: 1 },
    ],
    totalAmount: 4299,
    status: 'pending',
    shippingAddress: {
      id: 'a004',
      name: '赵六',
      phone: '13612345678',
      province: '浙江省',
      city: '杭州市',
      district: '西湖区',
      detail: '文三路120号',
      isDefault: true,
    },
    paymentMethod: 'wechat',
    createdAt: '2024-01-16T11:00:00Z',
    updatedAt: '2024-01-16T11:00:00Z',
  },
];

export default function AdminPage() {
  const { state } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedOrderStatus, setSelectedOrderStatus] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [productForm, setProductForm] = useState<Partial<Product>>({
    name: '',
    brand: '',
    price: 0,
    description: '',
    longDescription: '',
    category: 'kitchen' as ProductCategory,
    images: [''],
    specs: {
      bladeLength: '',
      totalLength: '',
      bladeMaterial: '',
      handleMaterial: '',
      weight: '',
    },
    stock: 0,
    featured: false,
    isNew: false,
    tags: [],
  });

  // Role verification on mount
  useEffect(() => {
    const checkAuthorization = async () => {
      // Simulate loading delay for security
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const user = state.user;
      if (user && user.role === 'admin') {
        setIsAuthorized(true);
      } else {
        setIsAuthorized(false);
      }
      setIsLoading(false);
    };
    
    checkAuthorization();
  }, [state.user]);

  // Access denied view
  if (!isLoading && !isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
            <ShieldX className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">访问被拒绝</h1>
          <p className="text-gray-400 mb-6">您没有权限访问管理后台</p>
          <Link 
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gold text-background rounded-lg hover:bg-goldLight transition-colors"
          >
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  // Loading view
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-gold mx-auto mb-4" />
          <p className="text-gray-400">验证权限中...</p>
        </div>
      </div>
    );
  }

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.brand.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredOrders = orders.filter(o => {
    if (selectedOrderStatus !== 'all' && o.status !== selectedOrderStatus) return false;
    if (searchQuery && !o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleSaveProduct = () => {
    if (editingProduct) {
      setProducts(products.map(p => p.id === editingProduct.id ? { ...editingProduct, ...productForm } as Product : p));
    } else {
      const newProduct: Product = {
        id: `p${Date.now()}`,
        name: productForm.name || '',
        brand: productForm.brand || '',
        price: productForm.price || 0,
        description: productForm.description || '',
        longDescription: productForm.longDescription || '',
        category: productForm.category || 'kitchen',
        images: productForm.images || [''],
        specs: productForm.specs || { bladeLength: '', totalLength: '', bladeMaterial: '', handleMaterial: '', weight: '' },
        stock: productForm.stock || 0,
        featured: productForm.featured || false,
        isNew: productForm.isNew || false,
        tags: productForm.tags || [],
      };
      setProducts([...products, newProduct]);
    }
    setShowProductModal(false);
    setEditingProduct(null);
    setProductForm({
      name: '', brand: '', price: 0, description: '', longDescription: '', category: 'kitchen',
      images: [''], specs: { bladeLength: '', totalLength: '', bladeMaterial: '', handleMaterial: '', weight: '' },
      stock: 0, featured: false, isNew: false, tags: [],
    });
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductForm(product);
    setShowProductModal(true);
  };

  const handleDeleteProduct = (productId: string) => {
    if (confirm('确定要删除这个商品吗？')) {
      setProducts(products.filter(p => p.id !== productId));
    }
  };

  const handleUpdateOrderStatus = (orderId: string, status: Order['status']) => {
    setOrders(orders.map(o => o.id === orderId ? { ...o, status, updatedAt: new Date().toISOString() } : o));
  };

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: '待支付', color: 'text-yellow-400 bg-yellow-400/10', icon: Clock },
    paid: { label: '已支付', color: 'text-blue-400 bg-blue-400/10', icon: CheckCircle },
    processing: { label: '处理中', color: 'text-purple-400 bg-purple-400/10', icon: Package },
    shipped: { label: '已发货', color: 'text-orange-400 bg-orange-400/10', icon: Truck },
    delivered: { label: '已完成', color: 'text-green-400 bg-green-400/10', icon: CheckCircle },
    cancelled: { label: '已取消', color: 'text-red-400 bg-red-400/10', icon: XCircle },
  };

  // Stats
  const totalRevenue = orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.totalAmount, 0);
  const totalProducts = products.length;
  const totalOrders = orders.length;
  const pendingOrders = orders.filter(o => o.status === 'pending').length;

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Header */}
      <header className="bg-surface border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl font-bold text-gold-gradient" style={{ fontFamily: 'Playfair Display, serif' }}>
                BLADE
              </span>
              <span className="text-sm text-steel">管理后台</span>
            </Link>
            <Link href="/" className="text-sm text-gray-400 hover:text-gold transition-colors">
              返回前台
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap',
                activeTab === tab.id 
                  ? 'bg-gold text-background' 
                  : 'bg-surface border border-border text-gray-400 hover:text-foreground'
              )}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>
              数据概览
            </h1>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-surface border border-border rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-lg bg-gold/20 flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-gold" />
                  </div>
                </div>
                <p className="text-sm text-gray-400 mb-1">总收入</p>
                <p className="text-2xl font-bold text-gold">{formatPrice(totalRevenue)}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Package className="w-6 h-6 text-blue-400" />
                  </div>
                </div>
                <p className="text-sm text-gray-400 mb-1">商品数量</p>
                <p className="text-2xl font-bold text-foreground">{totalProducts}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <ShoppingCart className="w-6 h-6 text-purple-400" />
                  </div>
                </div>
                <p className="text-sm text-gray-400 mb-1">订单总数</p>
                <p className="text-2xl font-bold text-foreground">{totalOrders}</p>
              </div>
              <div className="bg-surface border border-border rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-yellow-400" />
                  </div>
                </div>
                <p className="text-sm text-gray-400 mb-1">待处理订单</p>
                <p className="text-2xl font-bold text-foreground">{pendingOrders}</p>
              </div>
            </div>

            {/* Recent Orders */}
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">最近订单</h2>
              <div className="bg-surface border border-border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-surfaceLight">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">订单号</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">金额</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">状态</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {orders.slice(0, 5).map(order => (
                      <tr key={order.id} className="hover:bg-surfaceLight transition-colors">
                        <td className="px-6 py-4 font-mono text-sm text-foreground">{order.orderNumber}</td>
                        <td className="px-6 py-4 text-gold font-medium">{formatPrice(order.totalAmount)}</td>
                        <td className="px-6 py-4">
                          <span className={cn('px-2 py-1 rounded-full text-xs font-medium', statusConfig[order.status].color)}>
                            {statusConfig[order.status].label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-400">{formatDate(order.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Products Tab */}
        {activeTab === 'products' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>
                商品管理
              </h1>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    placeholder="搜索商品..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold"
                  />
                </div>
                <button
                  onClick={() => {
                    setEditingProduct(null);
                    setProductForm({
                      name: '', brand: '', price: 0, description: '', longDescription: '', category: 'kitchen',
                      images: [''], specs: { bladeLength: '', totalLength: '', bladeMaterial: '', handleMaterial: '', weight: '' },
                      stock: 0, featured: false, isNew: false, tags: [],
                    });
                    setShowProductModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gold text-background rounded-lg hover:bg-goldLight transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  添加商品
                </button>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-surfaceLight">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">商品</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">分类</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">价格</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">库存</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredProducts.map(product => (
                    <tr key={product.id} className="hover:bg-surfaceLight transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative w-12 h-12 rounded overflow-hidden bg-background">
                            <Image src={product.images[0]} alt={product.name} fill className="object-cover" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{product.name}</p>
                            <p className="text-sm text-gray-400">{product.brand}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400 capitalize">{product.category}</td>
                      <td className="px-6 py-4 text-gold font-medium">{formatPrice(product.price)}</td>
                      <td className="px-6 py-4">
                        <span className={product.stock < 10 ? 'text-orange-400' : 'text-gray-400'}>
                          {product.stock}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditProduct(product)}
                            className="p-2 text-gray-400 hover:text-gold transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product.id)}
                            className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>
                订单管理
              </h1>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    placeholder="搜索订单号..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold"
                  />
                </div>
                <select
                  value={selectedOrderStatus}
                  onChange={(e) => setSelectedOrderStatus(e.target.value)}
                  className="px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:border-gold"
                >
                  <option value="all">全部状态</option>
                  <option value="pending">待支付</option>
                  <option value="paid">已支付</option>
                  <option value="processing">处理中</option>
                  <option value="shipped">已发货</option>
                  <option value="delivered">已完成</option>
                  <option value="cancelled">已取消</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              {filteredOrders.map(order => (
                <div key={order.id} className="bg-surface border border-border rounded-lg p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b border-border">
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-foreground">{order.orderNumber}</span>
                      <span className={cn('px-2 py-1 rounded-full text-xs font-medium', statusConfig[order.status].color)}>
                        {statusConfig[order.status].label}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-gold font-semibold">{formatPrice(order.totalAmount)}</p>
                      <p className="text-xs text-gray-400">{formatDate(order.createdAt)}</p>
                    </div>
                  </div>

                  <div className="space-y-3 mb-4">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="relative w-12 h-12 rounded overflow-hidden">
                          <Image src={item.productImage} alt={item.productName} fill className="object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground line-clamp-1">{item.productName}</p>
                          <p className="text-xs text-gray-400">x{item.quantity}</p>
                        </div>
                        <p className="text-sm text-gold">{formatPrice(item.price)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border">
                    <div className="text-sm">
                      <p className="text-gray-400">
                        {order.shippingAddress.name} · {order.shippingAddress.phone}
                      </p>
                      <p className="text-gray-500">
                        {order.shippingAddress.province} {order.shippingAddress.city} {order.shippingAddress.district}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleUpdateOrderStatus(order.id, 'paid')}
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
                          >
                            确认支付
                          </button>
                          <button
                            onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                            className="px-4 py-2 border border-red-500 text-red-400 rounded hover:bg-red-500/10 transition-colors text-sm"
                          >
                            取消订单
                          </button>
                        </>
                      )}
                      {order.status === 'paid' && (
                        <button
                          onClick={() => handleUpdateOrderStatus(order.id, 'processing')}
                          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors text-sm"
                        >
                          开始处理
                        </button>
                      )}
                      {order.status === 'processing' && (
                        <button
                          onClick={() => handleUpdateOrderStatus(order.id, 'shipped')}
                          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors text-sm"
                        >
                          确认发货
                        </button>
                      )}
                      {order.status === 'shipped' && (
                        <button
                          onClick={() => handleUpdateOrderStatus(order.id, 'delivered')}
                          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm"
                        >
                          确认收货
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowProductModal(false)} />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-surface border border-border rounded-xl">
            <div className="sticky top-0 bg-surface p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">
                {editingProduct ? '编辑商品' : '添加商品'}
              </h2>
              <button onClick={() => setShowProductModal(false)} className="text-gray-400 hover:text-foreground">
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">商品名称</label>
                  <input
                    value={productForm.name}
                    onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">品牌</label>
                  <input
                    value={productForm.brand}
                    onChange={e => setProductForm({ ...productForm, brand: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">价格</label>
                  <input
                    type="number"
                    value={productForm.price}
                    onChange={e => setProductForm({ ...productForm, price: Number(e.target.value) })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">库存</label>
                  <input
                    type="number"
                    value={productForm.stock}
                    onChange={e => setProductForm({ ...productForm, stock: Number(e.target.value) })}
                    className="input-field"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">分类</label>
                <select
                  value={productForm.category}
                  onChange={e => setProductForm({ ...productForm, category: e.target.value as ProductCategory })}
                  className="input-field"
                >
                  <option value="kitchen">厨刀</option>
                  <option value="folding">折刀</option>
                  <option value="fixed">直刀</option>
                  <option value="hunting">猎刀</option>
                  <option value="damascus">大马士革</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">简短描述</label>
                <input
                  value={productForm.description}
                  onChange={e => setProductForm({ ...productForm, description: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">详细描述</label>
                <textarea
                  value={productForm.longDescription}
                  onChange={e => setProductForm({ ...productForm, longDescription: e.target.value })}
                  rows={3}
                  className="input-field resize-none"
                />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productForm.featured}
                    onChange={e => setProductForm({ ...productForm, featured: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-600 bg-surfaceLight text-gold"
                  />
                  <span className="text-sm text-gray-400">精选推荐</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productForm.isNew}
                    onChange={e => setProductForm({ ...productForm, isNew: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-600 bg-surfaceLight text-gold"
                  />
                  <span className="text-sm text-gray-400">新品上架</span>
                </label>
              </div>
            </div>
            <div className="sticky bottom-0 bg-surface p-6 border-t border-border flex justify-end gap-4">
              <button
                onClick={() => setShowProductModal(false)}
                className="px-6 py-2 border border-border rounded-lg text-gray-400 hover:text-foreground"
              >
                取消
              </button>
              <button
                onClick={handleSaveProduct}
                className="px-6 py-2 bg-gold text-background rounded-lg hover:bg-goldLight"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
