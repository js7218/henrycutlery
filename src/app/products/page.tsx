'use client';
import { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Filter, Grid, List, SlidersHorizontal, X, Search } from 'lucide-react';
import { products, brands, categories } from '@/data/products';
import { ProductCategory } from '@/types';
import ProductCard from '@/components/product/ProductCard';
import { cn } from '@/lib/utils';

const priceRanges = [
  { label: 'All', min: 0, max: Infinity },
  { label: 'Under $500', min: 0, max: 500 },
  { label: '$500 - $1,000', min: 500, max: 1000 },
  { label: '$1,000 - $2,000', min: 1000, max: 2000 },
  { label: '$2,000 - $3,000', min: 2000, max: 3000 },
  { label: 'Above $3,000', min: 3000, max: Infinity },
];

const sortOptions = [
  { value: 'default', label: 'Default Sort' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'name', label: 'By Name' },
  { value: 'newest', label: 'Newest Arrivals' },
];

// Brands to remove from filter
const removedBrands = new Set([
  'Buck', 'Benchmade', 'Spyderco', 'Kershaw', 'Cold Steel', 
  'Victorinox', 'Gerber', 'Zero Tolerance', 'CRKT', 'Microtech', 
  'SOG', 'Emerson', 'Mercer Culinary', 'Miyabi'
]);

// Filter out removed brands
const filteredBrands = brands.filter(brand => !removedBrands.has(brand));

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-20 text-center text-gray-400">Loading...</div>}>
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
  const [searchQuery, setSearchQuery] = useState<string>(
    searchParams.get('search') || ''
  );

  useEffect(() => {
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    if (category) {
      setSelectedCategory(category as ProductCategory);
    }
    if (search) {
      setSearchQuery(search);
    }
  }, [searchParams]);

  const filteredProducts = useMemo(() => {
    let filtered = [...products];
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.brand.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        (p.tags && p.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }
    
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
  }, [selectedCategory, selectedBrand, selectedPriceRange, sortBy, searchQuery]);

  const clearFilters = () => {
    setSelectedCategory('');
    setSelectedBrand('');
    setSelectedPriceRange(0);
    setSortBy('default');
    setSearchQuery('');
    router.push('/products');
  };

  const hasActiveFilters = selectedCategory || selectedBrand || selectedPriceRange !== 0 || searchQuery !== '';

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
          All Products
        </h1>
        <p className="text-gray-400">
          Found <span className="text-gold font-semibold">{filteredProducts.length}</span> products
        </p>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, brand, category..."
            className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gold transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
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
            <span className="hidden sm:inline">Filter</span>
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-gold transition-colors"
            >
              <X className="w-4 h-4" />
              Clear Filters
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
                <h3 className="text-sm font-semibold text-gold mb-4">Category</h3>
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
                    All
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
                <h3 className="text-sm font-semibold text-gold mb-4">Brand</h3>
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
                    All Brands
                  </button>
                  {filteredBrands.map(brand => (
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
                <h3 className="text-sm font-semibold text-gold mb-4">Price Range</h3>
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
                <h3 className="text-lg font-semibold">Filter</h3>
                <button onClick={() => setShowFilters(false)} className="p-2">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Mobile Category */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gold mb-3">Category</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedCategory('')}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm',
                      !selectedCategory ? 'bg-gold text-background' : 'bg-surfaceLight text-gray-400'
                    )}
                  >
                    All
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
                <h4 className="text-sm font-semibold text-gold mb-3">Brand</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedBrand('')}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm',
                      !selectedBrand ? 'bg-gold text-background' : 'bg-surfaceLight text-gray-400'
                    )}
                  >
                    All
                  </button>
                  {filteredBrands.map(brand => (
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
                <h4 className="text-sm font-semibold text-gold mb-3">Price</h4>
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
                  Clear Filters
                </button>
                <button
                  onClick={() => setShowFilters(false)}
                  className="flex-1 py-3 bg-gold text-background rounded-lg font-medium"
                >
                  Apply Filters
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
              <h3 className="text-xl font-medium text-gray-400 mb-2">No products found</h3>
              <p className="text-sm text-gray-500 mb-6">Try adjusting your filters</p>
              <button onClick={clearFilters} className="btn-secondary">
                Clear Filters
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
