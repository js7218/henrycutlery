'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Filter, Grid, List, SlidersHorizontal, X } from 'lucide-react';
import { products, brands, categories } from '@/data/products';
import { ProductCategory } from '@/types';
import ProductCard from '@/components/product/ProductCard';
import { cn } from '@/lib/utils';

const priceRanges = [
  { label: '全部', min: 0, max: Infinity },
  { label: '500元以下', min: 0, max: 500 },
  { label: '500-1000元', min: 500, max: 1000 },
  { label: '1000-2000元', min: 1000, max: 2000 },
  { label: '2000-3000元', min: 2000, max: 3000 },
  { label: '3000元以上', min: 3000, max: Infinity },
];

const sortOptions = [
  { value: 'default', label: '默认排序' },
  { value: 'price-asc', label: '价格从低到高' },
  { value: 'price-desc', label: '价格从高到低' },
  { value: 'name', label: '按名称' },
  { value: 'newest', label: '最新上架' },
];

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-20 text-center text-gray-400">加载中...</div>}>
      <ProductsContent />
    </Suspense>
  );
}

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | ''>(
    (searchParams.get('category') as ProductCategory) || ''
  );
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedPriceRange, setSelectedPriceRange] = useState<number>(0);
  const [sortBy, setSortBy] = useState<string>('default');

  useEffect(() => {
    const category = searchParams.get('category');
    if (category) {
      setSelectedCategory(category as ProductCategory);
    }
  }, [searchParams]);

  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    // Category filter
    if (selectedCategory) {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }

    // Brand filter
    if (selectedBrand) {
      filtered = filtered.filter(p => p.brand === selectedBrand);
    }

    // Price range filter
    const range = priceRanges[selectedPriceRange];
    if (range.max !== Infinity) {
      filtered = filtered.filter(p => p.price >= range.min && p.price < range.max);
    } else {
      filtered = filtered.filter(p => p.price >= range.min);
    }

    // Sort
    switch (sortBy) {
      case 'price-asc':
        filtered.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        filtered.sort((a, b) => b.price - a.price);
        break;
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'newest':
        filtered.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
        break;
    }

    return filtered;
  }, [selectedCategory, selectedBrand, selectedPriceRange, sortBy]);

  const clearFilters = () => {
    setSelectedCategory('');
    setSelectedBrand('');
    setSelectedPriceRange(0);
    setSortBy('default');
  };

  const hasActiveFilters = selectedCategory || selectedBrand || selectedPriceRange !== 0;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
          全部商品
        </h1>
        <p className="text-gray-400">
          共找到 <span className="text-gold font-semibold">{filteredProducts.length}</span> 件商品
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-6 border-b border-border">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
              showFilters 
                ? 'border-gold text-gold bg-gold/5' 
                : 'border-border text-gray-400 hover:border-gold hover:text-gold'
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">筛选</span>
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-gold transition-colors"
            >
              <X className="w-4 h-4" />
              清除筛选
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-surface border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
          >
            {sortOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* View Mode */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'grid' ? 'bg-gold text-background' : 'text-gray-400 hover:text-gold'
              )}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'list' ? 'bg-gold text-background' : 'text-gray-400 hover:text-gold'
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Filters Sidebar */}
        {showFilters && (
          <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="sticky top-24 space-y-6">
              {/* Category */}
              <div>
                <h3 className="text-sm font-semibold text-gold mb-4">分类</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setSelectedCategory('')}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                      !selectedCategory 
                        ? 'bg-gold/10 text-gold' 
                        : 'text-gray-400 hover:bg-surfaceLight hover:text-foreground'
                    )}
                  >
                    全部
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id as ProductCategory)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between',
                        selectedCategory === cat.id 
                          ? 'bg-gold/10 text-gold' 
                          : 'text-gray-400 hover:bg-surfaceLight hover:text-foreground'
                      )}
                    >
                      <span>{cat.icon} {cat.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Brand */}
              <div>
                <h3 className="text-sm font-semibold text-gold mb-4">品牌</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setSelectedBrand('')}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                      !selectedBrand 
                        ? 'bg-gold/10 text-gold' 
                        : 'text-gray-400 hover:bg-surfaceLight hover:text-foreground'
                    )}
                  >
                    全部品牌
                  </button>
                  {brands.map(brand => (
                    <button
                      key={brand}
                      onClick={() => setSelectedBrand(brand)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                        selectedBrand === brand 
                          ? 'bg-gold/10 text-gold' 
                          : 'text-gray-400 hover:bg-surfaceLight hover:text-foreground'
                      )}
                    >
                      {brand}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range */}
              <div>
                <h3 className="text-sm font-semibold text-gold mb-4">价格区间</h3>
                <div className="space-y-2">
                  {priceRanges.map((range, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedPriceRange(index)}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                        selectedPriceRange === index 
                          ? 'bg-gold/10 text-gold' 
                          : 'text-gray-400 hover:bg-surfaceLight hover:text-foreground'
                      )}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Mobile Filters */}
        {showFilters && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowFilters(false)} />
            <div className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-2xl p-6 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold">筛选</h3>
                <button onClick={() => setShowFilters(false)} className="p-2">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Category */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gold mb-3">分类</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedCategory('')}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm',
                      !selectedCategory ? 'bg-gold text-background' : 'bg-surfaceLight text-gray-400'
                    )}
                  >
                    全部
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id as ProductCategory)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm',
                        selectedCategory === cat.id ? 'bg-gold text-background' : 'bg-surfaceLight text-gray-400'
                      )}
                    >
                      {cat.icon} {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mobile Brand */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gold mb-3">品牌</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedBrand('')}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm',
                      !selectedBrand ? 'bg-gold text-background' : 'bg-surfaceLight text-gray-400'
                    )}
                  >
                    全部
                  </button>
                  {brands.map(brand => (
                    <button
                      key={brand}
                      onClick={() => setSelectedBrand(brand)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm',
                        selectedBrand === brand ? 'bg-gold text-background' : 'bg-surfaceLight text-gray-400'
                      )}
                    >
                      {brand}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mobile Price */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gold mb-3">价格</h4>
                <div className="flex flex-wrap gap-2">
                  {priceRanges.map((range, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedPriceRange(index)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm',
                        selectedPriceRange === index ? 'bg-gold text-background' : 'bg-surfaceLight text-gray-400'
                      )}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={clearFilters}
                  className="flex-1 py-3 border border-border rounded-lg text-gray-400"
                >
                  清除筛选
                </button>
                <button
                  onClick={() => setShowFilters(false)}
                  className="flex-1 py-3 bg-gold text-background rounded-lg font-medium"
                >
                  应用筛选
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Products Grid */}
        <div className="flex-1">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Filter className="w-16 h-16 text-gray-600 mb-4" />
              <h3 className="text-xl font-medium text-gray-400 mb-2">暂无符合条件的商品</h3>
              <p className="text-sm text-gray-500 mb-6">试试调整筛选条件</p>
              <button onClick={clearFilters} className="btn-secondary">
                清除筛选
              </button>
            </div>
          ) : (
            <div className={cn(
              'grid gap-6',
              viewMode === 'grid' 
                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' 
                : 'grid-cols-1'
            )}>
              {filteredProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
