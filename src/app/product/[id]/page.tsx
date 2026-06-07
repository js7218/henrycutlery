'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ShoppingCart, 
  Heart, 
  Share2, 
  Truck, 
  Shield, 
  RotateCcw,
  ChevronRight,
  Check,
  Minus,
  Plus
} from 'lucide-react';
import { getProductById, products } from '@/data/products';
import { useApp } from '@/context/AppContext';
import { formatPrice, cn } from '@/lib/utils';
import ProductImageGallery from '@/components/product/ProductImageGallery';
import ProductCard from '@/components/product/ProductCard';

export default function ProductDetailPage() {
  const params = useParams();
  const productId = params.id as string;
  const product = getProductById(productId);
  
  const { addToCart, state } = useApp();
  const [quantity, setQuantity] = useState(product?.moq || 1);
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'reviews'>('description');
  
  const isFavorite = state.user?.favorites.includes(productId) || false;

  // Get related products
  const relatedProducts = products
    .filter(p => p.category === product?.category && p.id !== productId)
    .slice(0, 4);

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-20">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Product not found</h1>
          <Link href="/products" className="btn-primary">
            Back to Products
          </Link>
        </div>
      </div>
    );
  }

  const handleAddToCart = () => {
    const moq = product.moq || 1;
    const finalQty = quantity >= moq ? quantity : moq;
    addToCart(product, finalQty);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-400 mb-8">
        <Link href="/" className="hover:text-gold transition-colors">Home</Link>
        <ChevronRight className="w-4 h-4" />
        <Link href="/products" className="hover:text-gold transition-colors">All Products</Link>
        <ChevronRight className="w-4 h-4" />
        <Link href={`/products?category=${product.category}`} className="hover:text-gold transition-colors capitalize">
          {product.category === 'kitchen' && 'Kitchen'}
          {product.category === 'folding' && 'Folding'}
          {product.category === 'fixed' && 'Fixed'}
          {product.category === 'hunting' && 'Hunting'}
          {product.category === 'damascus' && 'Damascus'}
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gold">{product.name}</span>
      </nav>

      {/* Product Main */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
        {/* Image Gallery */}
        <div>
          <ProductImageGallery images={product.images} productName={product.name} />
        </div>

        {/* Product Info */}
        <div className="space-y-6">
          {/* Brand & Title */}
          <div>
            <p className="text-sm text-steel uppercase tracking-wider mb-2">{product.brand}</p>
            <h1 className="text-3xl font-bold text-foreground mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
              {product.name}
            </h1>
            <div className="flex items-center gap-4 mb-4">
              {product.isNew && (
                <span className="px-3 py-1 bg-gold/20 text-gold text-xs font-medium rounded-full">
                  新品上架
                </span>
              )}
              {product.stock <= 5 && product.stock > 0 && (
                <span className="px-3 py-1 bg-orange-500/20 text-orange-400 text-xs font-medium rounded-full">
                  仅剩 {product.stock} 件
                </span>
              )}
              {product.stock === 0 && (
                <span className="px-3 py-1 bg-red-500/20 text-red-400 text-xs font-medium rounded-full">
                  已售罄
                </span>
              )}
            </div>
          </div>

          {/* Price */}
          <div className="p-6 bg-surface rounded-lg border border-border">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-4xl font-bold text-gold">{formatPrice(product.price)}</span>
              {product.originalPrice && (
                <>
                  <span className="text-xl text-gray-500 line-through">{formatPrice(product.originalPrice)}</span>
                  <span className="text-sm text-red-400">
                    节省 {formatPrice(product.originalPrice - product.price)}
                  </span>
                </>
              )}
            </div>
            <p className="text-sm text-gray-400">{product.description}</p>
          </div>

          {/* Quick Specs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-surfaceLight rounded-lg">
              <p className="text-xs text-gray-500 mb-1">刃长</p>
              <p className="text-foreground font-medium">{product.specs.bladeLength}</p>
            </div>
            <div className="p-4 bg-surfaceLight rounded-lg">
              <p className="text-xs text-gray-500 mb-1">刃材</p>
              <p className="text-foreground font-medium">{product.specs.bladeMaterial}</p>
            </div>
            <div className="p-4 bg-surfaceLight rounded-lg">
              <p className="text-xs text-gray-500 mb-1">柄材</p>
              <p className="text-foreground font-medium">{product.specs.handleMaterial}</p>
            </div>
            <div className="p-4 bg-surfaceLight rounded-lg">
              <p className="text-xs text-gray-500 mb-1">总长</p>
              <p className="text-foreground font-medium">{product.specs.totalLength}</p>
            </div>
          </div>

          {/* Quantity & Actions */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">数量</span>
              <div className="flex items-center border border-border rounded-lg">
                <button
                  onClick={() => setQuantity(Math.max(product.moq || 1, quantity - 1))}
                  className="p-3 text-gray-400 hover:text-gold transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(product.stock, parseInt(e.target.value) || 1)))}
                  className="w-16 text-center bg-transparent text-foreground border-none focus:outline-none"
                />
                <button
                  onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                  disabled={quantity >= product.stock}
                  className="p-3 text-gray-400 hover:text-gold transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <span className="text-sm text-gray-500">Stock {product.stock} 件</span>
            </div>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleAddToCart}
                disabled={product.stock === 0}
                className="flex-1 min-w-[200px] flex items-center justify-center gap-2 py-4 bg-gold text-background font-medium rounded-lg hover:bg-goldLight transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShoppingCart className="w-5 h-5" />
                加入购物车
              </button>
              <button className="p-4 border border-border rounded-lg text-gray-400 hover:text-red-400 hover:border-red-400 transition-colors">
                <Heart className={cn("w-5 h-5", isFavorite && "fill-red-400 text-red-400")} />
              </button>
              <button className="p-4 border border-border rounded-lg text-gray-400 hover:text-gold hover:border-gold transition-colors">
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Service Guarantees */}
          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-border">
            <div className="flex flex-col items-center text-center">
              <Truck className="w-5 h-5 text-gold mb-2" />
              <p className="text-xs text-gray-400">全国包邮</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <Shield className="w-5 h-5 text-gold mb-2" />
              <p className="text-xs text-gray-400">正品保障</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <RotateCcw className="w-5 h-5 text-gold mb-2" />
              <p className="text-xs text-gray-400">7天退换</p>
            </div>
          </div>
        </div>
      </div>

      {/* Product Details Tabs */}
      <div className="mb-16">
        <div className="flex border-b border-border">
          {[
            { id: 'description', label: '商品详情' },
            { id: 'specs', label: '规格参数' },
            { id: 'reviews', label: '用户评价' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                'px-8 py-4 text-sm font-medium transition-colors relative',
                activeTab === tab.id 
                  ? 'text-gold' 
                  : 'text-gray-400 hover:text-foreground'
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold" />
              )}
            </button>
          ))}
        </div>

        <div className="py-8">
          {activeTab === 'description' && (
            <div className="prose prose-invert max-w-none">
              <h3 className="text-xl font-semibold text-foreground mb-4">商品描述</h3>
              <p className="text-gray-300 leading-relaxed mb-8">{product.longDescription}</p>
              
              <h3 className="text-xl font-semibold text-foreground mb-4">产品特点</h3>
              <ul className="space-y-3">
                {product.tags.map((tag, index) => (
                  <li key={index} className="flex items-center gap-2 text-gray-300">
                    <Check className="w-4 h-4 text-gold" />
                    {tag}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeTab === 'specs' && (
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-6">详细规格</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(product.specs).map(([key, value]) => (
                  <div key={key} className="flex justify-between p-4 bg-surfaceLight rounded-lg">
                    <span className="text-gray-400">
                      {key === 'bladeLength' && '刃长'}
                      {key === 'totalLength' && '总长'}
                      {key === 'bladeMaterial' && '刃材'}
                      {key === 'handleMaterial' && '柄材'}
                      {key === 'weight' && '重量'}
                      {key === 'hardness' && '硬度'}
                    </span>
                    <span className="text-foreground font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="text-center py-12">
              <p className="text-gray-400">暂无用户评价</p>
              <p className="text-sm text-gray-500 mt-2">购买后可发表评价</p>
            </div>
          )}
        </div>
      </div>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-8" style={{ fontFamily: 'Playfair Display, serif' }}>
            相关推荐
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {relatedProducts.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
