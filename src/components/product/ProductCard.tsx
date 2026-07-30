'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Heart, ShoppingCart, Sparkles, Tag } from 'lucide-react';
import { Product } from '@/types';
import { formatPrice, cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { getSafeProductPath } from '@/lib/safeNavigation';
import TiltCard from '@/components/animation/TiltCard';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addToCart, state, toggleFavorite } = useApp();
  const [imageSrc, setImageSrc] = useState(product.images[0] || '/products/test-product-placeholder.png');
  const [justAdded, setJustAdded] = useState(false);
  const isFavorite = state.user?.favorites.includes(product.id) || false;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  };

  return (
    <Link href={getSafeProductPath(product.id)} className="group block">
      <TiltCard maxTilt={6} scale={1.02} className="relative bg-surface border border-border rounded-lg overflow-hidden card-hover hover-soft-glow active:scale-[0.98] transition-transform duration-150">
        {/* Image Container */}
        <div className="relative aspect-[4/3] overflow-hidden bg-surfaceLight">
          <Image
            src={imageSrc}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-110 active:scale-95"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            onError={() => setImageSrc('/products/test-product-placeholder.png')}
          />
          
          {/* Badges */}
          <div className="absolute top-3 left-3 flex flex-col space-y-2 z-10">
            {product.isNew && (
              <span className="flex items-center px-2 py-1 bg-gold text-background text-xs font-medium rounded shadow-lg">
                <Sparkles className="w-3 h-3 mr-1" />
                NEW
              </span>
            )}
            {product.originalPrice && (
              <span className="flex items-center px-2 py-1 bg-red-500/90 text-white text-xs font-medium rounded shadow-lg">
                <Tag className="w-3 h-3 mr-1" />
                SALE
              </span>
            )}
          </div>

          {/* Quick Actions - always visible on mobile, hover on desktop */}
          <div className="absolute top-3 right-3 flex flex-col space-y-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFavorite(product.id);
              }}
              disabled={!state.user}
              title={state.user ? (isFavorite ? 'Remove from favorites' : 'Add to favorites') : 'Sign in to favorite'}
              className="p-2 bg-background/80 backdrop-blur-sm rounded-full text-gray-400 hover:text-gold active:scale-90 transition-all disabled:opacity-60"
            >
              <Heart className={cn("w-5 h-5", isFavorite && "fill-gold text-gold")} />
            </button>
          </div>

          {/* Add to Cart Button - mobile: always visible at bottom, desktop: slides up on hover */}
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/95 to-transparent sm:translate-y-full sm:group-hover:translate-y-0 transition-transform duration-300 z-10">
            <button
              onClick={handleAddToCart}
              className={cn(
                "w-full py-2.5 text-sm font-medium rounded flex items-center justify-center space-x-2 transition-all btn-comfort active:scale-95",
                justAdded
                  ? "bg-green-500 text-white"
                  : "bg-gold text-background hover:bg-goldLight"
              )}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>
                {justAdded
                  ? 'Added!'
                  : product.moq
                    ? `Add to Cart (MOQ: ${product.moq})`
                    : 'Add to Cart'}
              </span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 relative" style={{ transform: 'translateZ(20px)' }}>
          {/* Brand */}
          <p className="text-xs text-steel uppercase tracking-wider mb-1">
            {product.brand}
          </p>
          
          {/* Name */}
          <h3 className="text-foreground font-medium mb-2 line-clamp-1 group-hover:text-gold group-active:text-gold transition-colors">
            {product.name.toUpperCase()}
          </h3>

          {/* Specs */}
          <p className="text-xs text-gray-500 mb-3">
            {product.specs.bladeLength} · {product.specs.bladeMaterial}
          </p>

          {/* Price */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline space-x-2">
              <span className="text-lg font-semibold text-gold">
                {formatPrice(product.price)}
              </span>
              {product.originalPrice && (
                <span className="text-sm text-gray-500 line-through">
                  {formatPrice(product.originalPrice)}
                </span>
              )}
            </div>
            {product.stock <= 5 && product.stock > 0 && (
              <span className="text-xs text-orange-400">Only {product.stock} left</span>
            )}
          </div>
        </div>
      </TiltCard>
    </Link>
  );
}
