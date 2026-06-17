'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ProductImageGalleryProps {
  images: string[];
  productName: string;
}

export default function ProductImageGallery({ images, productName }: ProductImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const safeImages = images.length > 0 ? images : ['/products/test-product-placeholder.png'];
  const currentSrc = failedImages[safeImages[currentIndex]]
    ? '/products/test-product-placeholder.png'
    : safeImages[currentIndex];

  useEffect(() => {
    setCurrentIndex(0);
    setFailedImages({});
  }, [images.join('|')]);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? safeImages.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === safeImages.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="space-y-4">
      {/* Main Image */}
      <div className="relative aspect-[4/3] bg-surfaceLight rounded-lg overflow-hidden">
        <Image
          src={currentSrc}
          alt={`${productName} - Image ${currentIndex + 1}`}
          fill
          className="object-cover"
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          onError={() => setFailedImages((prev) => ({ ...prev, [safeImages[currentIndex]]: true }))}
        />
        
        {/* Navigation Arrows */}
        {safeImages.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-background/80 backdrop-blur-sm rounded-full text-gray-400 hover:text-gold transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-background/80 backdrop-blur-sm rounded-full text-gray-400 hover:text-gold transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        {/* Image Counter */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-background/80 backdrop-blur-sm rounded-full text-sm text-gray-400">
          {currentIndex + 1} / {safeImages.length}
        </div>
      </div>

      {/* Thumbnails */}
      {safeImages.length > 1 && (
        <div className="flex space-x-3 overflow-x-auto pb-2">
          {safeImages.map((image, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`relative w-24 h-[72px] flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                index === currentIndex ? 'border-gold' : 'border-transparent hover:border-gray-600'
              }`}
            >
              <Image
                src={image}
                alt={`${productName} - Thumbnail ${index + 1}`}
                fill
                className="object-cover"
                sizes="96px"
                onError={() => setFailedImages((prev) => ({ ...prev, [image]: true }))}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
