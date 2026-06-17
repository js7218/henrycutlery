'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ShoppingCart, 
  Heart, 
  Share2, 
  Mail,
  Images,
  Truck, 
  Shield, 
  RotateCcw,
  ChevronRight,
  Check,
  Minus,
  Plus,
  ArrowLeft,
  Star
} from 'lucide-react';
import { getProductById, products } from '@/data/products';
import { useApp } from '@/context/AppContext';
import { formatPrice, cn } from '@/lib/utils';
import { buildSafeMailtoLink, getSafeCategoryPath } from '@/lib/safeNavigation';
import ProductImageGallery from '@/components/product/ProductImageGallery';
import ProductCard from '@/components/product/ProductCard';

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;
  const product = getProductById(productId);
  
  const { addToCart, state, toggleFavorite } = useApp();
  const [quantity, setQuantity] = useState(product?.moq || 1);
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'reviews'>('reviews');
  const [shareMessage, setShareMessage] = useState('');
  const [reviews, setReviews] = useState<Array<{ id: string; author: string; rating: number; content: string; createdAt: string }>>([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewContent, setReviewContent] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  
  // Use ref to access product inside useCallback without adding to deps (rebuild trigger)
  const productRef = useRef(product);
  productRef.current = product;
  
  // Hold-to-repeat refs - MUST be before any conditional returns
  const incrementIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const decrementIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const incrementTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const decrementTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Hold-to-increment logic - MUST be before any conditional returns
  const stopIncrement = useCallback(() => {
    if (incrementTimeoutRef.current) {
      clearTimeout(incrementTimeoutRef.current);
      incrementTimeoutRef.current = null;
    }
    if (incrementIntervalRef.current) {
      clearInterval(incrementIntervalRef.current);
      incrementIntervalRef.current = null;
    }
  }, []);

  const stopDecrement = useCallback(() => {
    if (decrementTimeoutRef.current) {
      clearTimeout(decrementTimeoutRef.current);
      decrementTimeoutRef.current = null;
    }
    if (decrementIntervalRef.current) {
      clearInterval(decrementIntervalRef.current);
      decrementIntervalRef.current = null;
    }
  }, []);

  // Hold-to-increment - uses productRef to avoid conditional hook issue
  const startIncrement = useCallback(() => {
    const p = productRef.current;
    if (!p) return;
    if (quantity >= p.stock) return;
    setQuantity(prev => Math.min(p.stock, prev + 1));
    
    incrementTimeoutRef.current = setTimeout(() => {
      incrementIntervalRef.current = setInterval(() => {
        setQuantity(prev => {
          if (prev >= p.stock) {
            stopIncrement();
            return prev;
          }
          return Math.min(p.stock, prev + 1);
        });
      }, 80);
    }, 300);
  }, [quantity, stopIncrement]);

  // Hold-to-decrement - uses productRef to avoid conditional hook issue
  const startDecrement = useCallback(() => {
    const p = productRef.current;
    if (!p) return;
    const minQty = p.moq || 1;
    if (quantity <= minQty) return;
    setQuantity(prev => Math.max(minQty, prev - 1));
    
    decrementTimeoutRef.current = setTimeout(() => {
      decrementIntervalRef.current = setInterval(() => {
        setQuantity(prev => {
          const min = p.moq || 1;
          if (prev <= min) {
            stopDecrement();
            return prev;
          }
          return Math.max(min, prev - 1);
        });
      }, 80);
    }, 300);
  }, [quantity, stopDecrement]);

  // Cleanup on unmount - MUST be before any conditional returns
  useEffect(() => {
    return () => {
      stopIncrement();
      stopDecrement();
    };
  }, [stopIncrement, stopDecrement]);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.success && Array.isArray(data.reviews)) {
          setReviews(data.reviews);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [productId]);
  
  // Conditional return MUST be after all Hooks
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

  const isFavorite = state.user?.favorites.includes(productId) || false;
  
  // Get related products
  const relatedProducts = products
    .filter(p => p.category === product?.category && p.id !== productId)
    .slice(0, 4);

  const handleAddToCart = () => {
    const moq = product.moq || 1;
    const finalQty = quantity >= moq ? quantity : moq;
    addToCart(product, finalQty);
  };

  const handleShare = async () => {
    if (!product) return;
    const productUrl = `${window.location.origin}/product/${encodeURIComponent(product.id)}`;
    setShareMessage('');

    try {
      if (navigator.share) {
        await navigator.share({
          title: product.name,
          text: `${product.name} - ${formatPrice(product.price)}`,
          url: productUrl,
        });
        setShareMessage('Share sheet opened.');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(productUrl);
        setShareMessage('Product link copied.');
      } else {
        const input = document.createElement('input');
        input.value = productUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        setShareMessage('Product link copied.');
      }
    } catch {
      setShareMessage('Copy failed. Please copy the browser address manually.');
    }

    window.setTimeout(() => setShareMessage(''), 2500);
  };

  const buildMailtoLink = (type: 'contact' | 'photos') => {
    const productUrl = `https://adamcutlery.com/product/${encodeURIComponent(product.id)}`;
    const subject =
      type === 'photos'
        ? `More photos request: ${product.name}`
        : `Product inquiry: ${product.name}`;
    const body =
      type === 'photos'
        ? `Hello,\n\nI am interested in ${product.name}.\nCould you please send me more photos, details, and available packaging information?\n\nProduct link:\n${productUrl}\n\nThank you.`
        : `Hello,\n\nI am interested in ${product.name}.\nCould you please send me more details about price, availability, MOQ, shipping, and lead time?\n\nProduct link:\n${productUrl}\n\nThank you.`;

    return buildSafeMailtoLink({
      to: process.env.NEXT_PUBLIC_BUSINESS_EMAIL || 'info@adamcutlery.com',
      subject,
      body,
    });
  };

  const handleSubmitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    setReviewError('');
    setReviewMessage('');
    if (!state.user) {
      setReviewError('Please sign in before submitting a review.');
      return;
    }
    if (reviewContent.trim().length < 8) {
      setReviewError('Please write at least 8 characters.');
      return;
    }
    setReviewLoading(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          rating: reviewRating,
          content: reviewContent.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setReviewError(data.error || 'Review submission failed.');
        return;
      }
      setReviewMessage(data.message || 'Review submitted.');
      setReviewContent('');
      if (data.status === 'approved') {
        const list = await fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`, { cache: 'no-store' }).then((r) => r.json());
        if (list?.success) setReviews(list.reviews || []);
      }
    } catch {
      setReviewError('Network error. Please try again.');
    } finally {
      setReviewLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
      {/* Back Button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-gray-400 hover:text-gold transition-colors mb-4 group"
      >
        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-medium">Back</span>
      </button>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-400 mb-8">
        <Link href="/" className="hover:text-gold transition-colors">Home</Link>
        <ChevronRight className="w-4 h-4" />
        <Link href="/products" className="hover:text-gold transition-colors">All Products</Link>
        <ChevronRight className="w-4 h-4" />
        <Link href={getSafeCategoryPath(product.category)} className="hover:text-gold transition-colors capitalize">
          {product.category === 'kitchen' && 'Kitchen'}
          {product.category === 'folding' && 'Folding'}
          {product.category === 'collection' && 'Collection'}
          {product.category === 'hunting' && 'Hunting'}
          {product.category === 'damascus' && 'Damascus'}
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gold">{product.name.toUpperCase()}</span>
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
              {product.name.toUpperCase()}
            </h1>
            <div className="flex items-center gap-4 mb-4">
              {product.isNew && (
                <span className="px-3 py-1 bg-gold/20 text-gold text-xs font-medium rounded-full">
                  New Arrival
                </span>
              )}
              {product.stock <= 5 && product.stock > 0 && (
                <span className="px-3 py-1 bg-orange-500/20 text-orange-400 text-xs font-medium rounded-full">
                  Only {product.stock} left
                </span>
              )}
              {product.stock === 0 && (
                <span className="px-3 py-1 bg-red-500/20 text-red-400 text-xs font-medium rounded-full">
                  Out of Stock
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
                    Save {formatPrice(product.originalPrice - product.price)}
                  </span>
                </>
              )}
            </div>
            <p className="text-sm text-gray-400">{product.description}</p>
          </div>

          {/* Quick Specs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-surfaceLight rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Blade Length</p>
              <p className="text-foreground font-medium">{product.specs.bladeLength}</p>
            </div>
            <div className="p-4 bg-surfaceLight rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Blade Material</p>
              <p className="text-foreground font-medium">{product.specs.bladeMaterial}</p>
            </div>
            <div className="p-4 bg-surfaceLight rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Handle Material</p>
              <p className="text-foreground font-medium">{product.specs.handleMaterial}</p>
            </div>
            <div className="p-4 bg-surfaceLight rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Overall Length</p>
              <p className="text-foreground font-medium">{product.specs.totalLength}</p>
            </div>
          </div>

          {/* Quantity & Actions */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">Quantity</span>
              <div className="flex items-center border border-border rounded-lg select-none">
                <button
                  onMouseDown={startDecrement}
                  onMouseUp={stopDecrement}
                  onMouseLeave={stopDecrement}
                  onTouchStart={startDecrement}
                  onTouchEnd={stopDecrement}
                  className="p-3 text-gray-400 hover:text-gold transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(product.moq || 1, Math.min(product.stock, parseInt(e.target.value) || 1)))}
                  className="w-16 text-center bg-transparent text-foreground border-none focus:outline-none"
                />
                <button
                  onMouseDown={startIncrement}
                  onMouseUp={stopIncrement}
                  onMouseLeave={stopIncrement}
                  onTouchStart={startIncrement}
                  onTouchEnd={stopIncrement}
                  disabled={quantity >= product.stock}
                  className="p-3 text-gray-400 hover:text-gold transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <span className="text-sm text-gray-500">Stock: {product.stock} pcs</span>
            </div>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleAddToCart}
                disabled={product.stock === 0}
                className="flex-1 min-w-[200px] flex items-center justify-center gap-2 py-4 bg-gold text-background font-medium rounded-lg hover:bg-goldLight transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShoppingCart className="w-5 h-5" />
                Add to Cart
              </button>
              <button
                onClick={() => toggleFavorite(product.id)}
                disabled={!state.user}
                title={state.user ? (isFavorite ? 'Remove from favorites' : 'Add to favorites') : 'Sign in to favorite'}
                className="p-4 border border-border rounded-lg text-gray-400 hover:text-red-400 hover:border-red-400 transition-colors disabled:opacity-60"
              >
                <Heart className={cn("w-5 h-5", isFavorite && "fill-red-400 text-red-400")} />
              </button>
              <button
                onClick={handleShare}
                className="p-4 border border-border rounded-lg text-gray-400 hover:text-gold hover:border-gold transition-colors"
              >
                <Share2 className="w-5 h-5" />
              </button>
            </div>
            {shareMessage && (
              <p className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold">
                {shareMessage}
              </p>
            )}
            <button
              onClick={() => setActiveTab('reviews')}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-left text-gray-300 hover:border-gold hover:text-gold transition-colors"
            >
              Customer Reviews / Write a Review
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href={buildMailtoLink('contact')}
                className="flex items-center justify-center gap-2 py-3 px-4 border border-gold/60 text-gold rounded-lg hover:bg-gold/10 transition-colors"
              >
                <Mail className="w-5 h-5" />
                Contact Email
              </a>
              <a
                href={buildMailtoLink('photos')}
                className="flex items-center justify-center gap-2 py-3 px-4 border border-border text-gray-300 rounded-lg hover:border-gold hover:text-gold transition-colors"
              >
                <Images className="w-5 h-5" />
                Ask for More Photos
              </a>
            </div>
          </div>

          {/* Service Guarantees */}
          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-border">
            <div className="flex flex-col items-center text-center">
              <Truck className="w-5 h-5 text-gold mb-2" />
              <p className="text-xs text-gray-400">Free Shipping</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <Shield className="w-5 h-5 text-gold mb-2" />
              <p className="text-xs text-gray-400">Genuine Product</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <RotateCcw className="w-5 h-5 text-gold mb-2" />
              <p className="text-xs text-gray-400">7-Day Return</p>
            </div>
          </div>
        </div>
      </div>

      {/* Product Details Tabs */}
      <div className="mb-16">
        <div className="flex border-b border-border">
          {[
            { id: 'description', label: 'Product Details' },
            { id: 'specs', label: 'Specifications' },
            { id: 'reviews', label: `Reviews / Write a Review${reviews.length ? ` (${reviews.length})` : ''}` },
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
              <h3 className="text-xl font-semibold text-foreground mb-4">Product Description</h3>
              <p className="text-gray-300 leading-relaxed mb-8">{product.longDescription}</p>
              
              <h3 className="text-xl font-semibold text-foreground mb-4">Product Features</h3>
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
              <h3 className="text-xl font-semibold text-foreground mb-6">Detailed Specifications</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(product.specs).map(([key, value]) => (
                  <div key={key} className="flex justify-between p-4 bg-surfaceLight rounded-lg">
                    <span className="text-gray-400">
                      {key === 'bladeLength' && 'Blade Length'}
                      {key === 'totalLength' && 'Overall Length'}
                      {key === 'bladeMaterial' && 'Blade Material'}
                      {key === 'handleMaterial' && 'Handle Material'}
                      {key === 'weight' && 'Weight'}
                      {key === 'hardness' && 'Hardness'}
                    </span>
                    <span className="text-foreground font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'reviews' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold text-foreground mb-4">Customer Reviews</h3>
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id} className="rounded-lg border border-border bg-surface p-4">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="font-medium text-foreground">{review.author}</p>
                        <div className="flex text-gold">
                          {Array.from({ length: 5 }).map((_, index) => (
                            <Star key={index} className={cn('h-4 w-4', index < review.rating && 'fill-gold')} />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap">{review.content}</p>
                    </div>
                  ))}
                  {reviews.length === 0 && (
                    <div className="rounded-lg border border-border bg-surface p-6 text-center">
                      <p className="text-gray-400">No approved reviews yet</p>
                      <p className="text-sm text-gray-500 mt-2">Be the first to review this product</p>
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={handleSubmitReview} className="rounded-lg border border-border bg-surface p-6">
                <h3 className="text-xl font-semibold text-foreground mb-4">Write a Review</h3>
                {!state.user && (
                  <p className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">
                    Please sign in before submitting a review.
                  </p>
                )}
                {reviewError && <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{reviewError}</p>}
                {reviewMessage && <p className="mb-4 rounded-lg bg-green-500/10 p-3 text-sm text-green-400">{reviewMessage}</p>}
                <label className="mb-2 block text-sm text-gray-400">Rating</label>
                <select
                  value={reviewRating}
                  onChange={(event) => setReviewRating(Number(event.target.value))}
                  className="mb-4 w-full rounded-lg border border-border bg-surfaceLight px-3 py-2 text-foreground focus:border-gold focus:outline-none"
                >
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option key={rating} value={rating}>{rating} Star</option>
                  ))}
                </select>
                <label className="mb-2 block text-sm text-gray-400">Review</label>
                <textarea
                  value={reviewContent}
                  onChange={(event) => setReviewContent(event.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="Share your experience with this product..."
                  className="mb-4 w-full rounded-lg border border-border bg-surfaceLight px-3 py-2 text-foreground placeholder:text-gray-500 focus:border-gold focus:outline-none"
                />
                <button
                  disabled={reviewLoading || !state.user}
                  className="w-full rounded-lg bg-gold py-3 font-medium text-background hover:bg-goldLight disabled:opacity-60"
                >
                  {reviewLoading ? 'Submitting...' : 'Submit Review'}
                </button>
                <p className="mt-3 text-xs text-gray-500">
                  Reviews with spam, links, attacks, abuse, or suspicious content may be held for admin review or rejected.
                </p>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-8" style={{ fontFamily: 'Playfair Display, serif' }}>
            Related Products
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
