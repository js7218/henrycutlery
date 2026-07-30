'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Shield, Truck, Award, Factory, Globe2, Wrench } from 'lucide-react';
import UniversalReveal, { RevealChild } from '@/components/animation/UniversalReveal';
import ScrollReveal from '@/components/animation/ScrollReveal';
import ImageReveal from '@/components/animation/ImageReveal';
import HorizontalPinScroll, { HorizontalPanel } from '@/components/animation/HorizontalPinScroll';
import { products } from '@/data/products';
import { formatPrice } from '@/lib/utils';

export default function Home() {
  const heroRef = useRef<HTMLElement>(null);
  const [show, setShow] = useState(false);

  // Trigger entrance animations after a short delay (age verification modal
  // is typically dismissed by then). Also listen for the age-verified event.
  useEffect(() => {
    // If already verified (returning visitor), show immediately
    try {
      if (sessionStorage.getItem('age_verified') === 'true') {
        setShow(true);
        return;
      }
    } catch {}

    // Listen for age verification event
    const handler = () => {
      setShow(true);
    };
    window.addEventListener('age-verified', handler);

    // Fallback: show after 3 seconds regardless
    const timer = setTimeout(() => setShow(true), 3000);

    return () => {
      window.removeEventListener('age-verified', handler);
      clearTimeout(timer);
    };
  }, []);

  // Inline style helper: animates from hidden to visible based on `show` state
  const animStyle = (delay: number, extraFrom: Record<string, string> = {}) => ({
    opacity: show ? 1 : 0,
    transform: show
      ? 'translateY(0) scale(1)'
      : `translateY(50px) scale(0.95)`,
    filter: show ? 'blur(0px)' : 'blur(8px)',
    transition: `opacity 0.8s ${delay}s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.8s ${delay}s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.6s ${delay}s ease`,
    willChange: 'opacity, transform, filter',
  });

  const imgAnimStyle = {
    opacity: show ? 1 : 0,
    transform: show ? 'scale(1) rotate(0deg)' : 'scale(1.25) rotate(2deg)',
    transition: 'opacity 1.2s 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 1.2s 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    willChange: 'opacity, transform',
  };

  return (
    <div className="min-h-screen">
      {/* ===== HERO ===== */}
      <section ref={heroRef} className="relative min-h-[90vh] flex items-center overflow-hidden">
        {/* Parallax background */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/products/collection/the-best-collection-1.jpeg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-25"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background/85 to-background/40" />
        </div>

        <div className="relative z-10 w-full px-4 md:px-8 lg:px-16 max-w-7xl mx-auto pt-20 pb-16">
          <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8 lg:gap-16 items-center">
            {/* Left: Text — React state driven inline styles */}
            <div className="order-2 lg:order-1">
              <p
                style={animStyle(0.1)}
                className="text-gold text-sm tracking-[0.3em] uppercase mb-6"
              >
                Premium Cutlery Manufacturing
              </p>
              <h1
                className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-[0.95]"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                <span className="block text-gold-gradient" style={animStyle(0.2)}>
                  ADAM
                </span>
                <span className="block text-foreground" style={animStyle(0.35)}>
                  CUTLERY
                </span>
              </h1>
              <p
                style={animStyle(0.5)}
                className="text-xl md:text-2xl text-gray-300 mb-4 max-w-xl"
              >
                Precision-forged blades for global wholesale.
              </p>
              <p
                style={animStyle(0.6)}
                className="text-gray-400 mb-10 max-w-xl leading-relaxed"
              >
                From Damascus chef knives to titanium folding blades, we manufacture
                premium cutlery with CNC precision. OEM customization, competitive MOQ
                pricing, and worldwide shipping.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/products"
                  style={animStyle(0.75)}
                  className="inline-flex items-center justify-center px-8 py-4 bg-gold text-background font-semibold rounded-lg animate-glow-pulse"
                >
                  Browse Products
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
                <Link
                  href="/products?category=folding"
                  style={animStyle(0.85)}
                  className="inline-flex items-center justify-center px-8 py-4 border border-gold/50 text-gold font-semibold rounded-lg animate-border-glow"
                >
                  Folding Knives
                </Link>
              </div>
            </div>

            {/* Right: Image */}
            <div className="order-1 lg:order-2 relative" style={imgAnimStyle}>
              <div className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-gold/20 shadow-2xl">
                <Image
                  src="/products/collection/the-best-collection-1.jpeg"
                  alt="The Best Collection knife"
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />
              </div>
              {/* Floating accent */}
              <div className="absolute -bottom-6 -left-6 bg-surface/90 backdrop-blur-md border border-gold/20 rounded-xl p-5 shadow-xl hidden md:block animate-hero-float">
                <p className="text-3xl font-bold text-gold">500+</p>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Global Clients</p>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 hidden md:block">
          <div className="w-6 h-10 border-2 border-gold/30 rounded-full flex items-start justify-center p-1.5">
            <div className="w-1 h-2 bg-gold/50 rounded-full animate-bounce" />
          </div>
        </div>
      </section>

      {/* ===== STATS BAR ===== */}
      <section className="border-y border-border bg-surface/50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
          <UniversalReveal stagger={0.1} className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '500+', label: 'Global Clients' },
              { value: '15+', label: 'Years Experience' },
              { value: '50+', label: 'Countries Shipped' },
              { value: '100+', label: 'Product Styles' },
            ].map((stat, i) => (
              <RevealChild key={i}>
                <div>
                  <p className="text-3xl md:text-4xl font-bold text-gold animate-stat-pulse">
                    {stat.value}
                  </p>
                  <p className="text-xs md:text-sm text-gray-400 uppercase tracking-wider mt-1">
                    {stat.label}
                  </p>
                </div>
              </RevealChild>
            ))}
          </UniversalReveal>
        </div>
      </section>

      {/* ===== FACTORY ===== */}
      <section className="py-24 px-4 md:px-8 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1fr_1.3fr] gap-12 lg:gap-20 items-center mb-16">
            <UniversalReveal anim="slide-left">
              <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4">Our Factory</p>
              <h2
                className="text-4xl md:text-5xl font-bold text-foreground mb-6 leading-tight"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                Precision manufacturing for global brands
              </h2>
              <p className="text-gray-400 leading-relaxed mb-6">
                We have a professional manufacturing team and technology to produce various types
                of cutting tool products. We accept OEM customization services. Send us your design
                drawings and plans, and we will provide preferential quotations and high-quality
                production plans.
              </p>
              <div className="flex flex-wrap gap-3">
                {['OEM', 'ODM', 'Wholesale', 'Custom Design'].map((tag) => (
                  <span
                    key={tag}
                    className="px-4 py-1.5 border border-gold/30 text-gold/80 text-sm rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </UniversalReveal>

            <UniversalReveal anim="slide-right" className="grid grid-cols-2 gap-4">
              {[
                { icon: Factory, title: 'In-House Production', desc: 'Full CNC machining, heat treatment, and quality control under one roof.' },
                { icon: Wrench, title: 'Custom Engineering', desc: 'From design drawings to finished product, we handle every step.' },
                { icon: Shield, title: 'Quality Assurance', desc: 'Material selection, machining, polishing, inspection, and secure packing.' },
                { icon: Globe2, title: 'Global Export', desc: 'Worldwide shipping with tracking and customs documentation support.' },
              ].map((item, i) => (
                <RevealChild key={i} delay={i * 0.1}>
                  <div className="p-5 bg-surface rounded-xl border border-border hover-soft-glow">
                    <item.icon className="w-7 h-7 text-gold mb-3 animate-icon-pulse" />
                    <h3 className="text-foreground font-semibold text-sm mb-1">{item.title}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                  </div>
                </RevealChild>
              ))}
            </UniversalReveal>
          </div>

          {/* Factory images */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { src: '/images/factory1.jpg', span: 'col-span-2 row-span-2' },
              { src: '/images/factory2.jpg', span: '' },
              { src: '/images/factory3.jpg', span: '' },
              { src: '/images/factory4.jpg', span: '' },
              { src: '/images/factory6.jpg', span: '' },
              { src: '/images/factory7.jpg', span: 'col-span-2' },
              { src: '/images/factory8.jpg', span: '' },
            ].map((img, i) => (
              <ScrollReveal
                key={i}
                direction="scale"
                delay={i * 0.08}
                className={img.span}
              >
                <ImageReveal direction={i % 2 === 0 ? 'left' : 'right'} duration={1} delay={i * 0.05} scrollTrigger start="top 85%" className={`relative rounded-xl overflow-hidden border border-border ${i === 0 ? 'aspect-square md:aspect-[4/3]' : 'aspect-[4/3]'}`}>
                  <Image
                    src={img.src}
                    alt={`Factory ${i + 1}`}
                    fill
                    loading="lazy"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover hover:scale-110 transition-transform duration-700"
                  />
                </ImageReveal>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CATEGORIES ===== */}
      <section className="py-24 px-4 md:px-8 bg-surface/30">
        <div className="max-w-7xl mx-auto">
          <UniversalReveal className="text-center mb-16">
            <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4">Our Collections</p>
            <h2
              className="text-4xl md:text-5xl font-bold text-gold-gradient"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Explore by Category
            </h2>
          </UniversalReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 auto-rows-[200px]">
            <UniversalReveal anim="scale-in" className="md:col-span-2 lg:col-span-2 row-span-2">
              <Link
                href="/products?category=collection"
                className="group relative h-full block rounded-2xl overflow-hidden border border-gold/20 animate-border-glow"
              >
                <Image
                  src="/products/collection/the-best-collection-1.jpeg"
                  alt="Collection"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <div className="absolute bottom-0 left-0 p-8">
                  <h3 className="text-2xl font-bold text-foreground mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>
                    Collection
                  </h3>
                  <p className="text-gray-400 text-sm">High-end collectible knives</p>
                  <span className="inline-flex items-center text-gold text-sm mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    Explore <ArrowRight className="w-4 h-4 ml-1" />
                  </span>
                </div>
              </Link>
            </UniversalReveal>

            {[
              { name: 'Folding', desc: 'EDC & tactical folders', href: '/products?category=folding', img: '/images/ti.jpg' },
              { name: 'Kitchen', desc: 'Professional chef knives', href: '/products?category=kitchen', img: '/images/ca1d285711b90eaa22a99762c802bd48.jpg' },
              { name: 'Hunting', desc: 'Field dressing & skinning', href: '/products?category=hunting', img: '/images/hunting1.jpg' },
            ].map((cat, i) => (
              <UniversalReveal key={cat.name} anim="fade-up" className={`${i === 0 ? 'lg:col-start-3' : ''}`}>
                <Link
                  href={cat.href}
                  className="group relative h-full block rounded-2xl overflow-hidden border border-border hover:border-gold/40 transition-colors"
                >
                  <Image
                    src={cat.img}
                    alt={cat.name}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-5">
                    <h3 className="text-lg font-bold text-foreground group-hover:text-gold transition-colors">
                      {cat.name}
                    </h3>
                    <p className="text-gray-400 text-xs">{cat.desc}</p>
                  </div>
                </Link>
              </UniversalReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="py-24 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <UniversalReveal className="text-center mb-16">
            <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4">Why Choose Us</p>
            <h2
              className="text-4xl md:text-5xl font-bold text-foreground"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Built for wholesale buyers
            </h2>
          </UniversalReveal>

          <UniversalReveal stagger={0.15} className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Shield,
                title: 'Premium Materials',
                desc: 'CNC machined D2 steel, M390 powder steel, Damascus patterns, and titanium handles. Spectral analysis verification available.',
              },
              {
                icon: Truck,
                title: 'Global Logistics',
                desc: 'Worldwide delivery with secure packaging, tracking, and customs documentation. We ship to 50+ countries.',
              },
              {
                icon: Award,
                title: 'Competitive MOQ',
                desc: 'Flexible minimum order quantities starting from 100 pieces. Sample confirmation and production planning for international buyers.',
              },
            ].map((feat, i) => (
              <RevealChild key={i}>
                <div className="p-8 bg-surface rounded-2xl border border-border hover-soft-glow h-full">
                  <div className="w-14 h-14 rounded-xl bg-gold/10 flex items-center justify-center mb-6 animate-icon-pulse" style={{ animationDelay: `${i * 0.3}s` }}>
                    <feat.icon className="w-7 h-7 text-gold" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">{feat.title}</h3>
                  <p className="text-gray-400 leading-relaxed">{feat.desc}</p>
                </div>
              </RevealChild>
            ))}
          </UniversalReveal>
        </div>
      </section>

      {/* ===== PRODUCT SHOWCASE ===== */}
      <section className="py-20 md:py-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 md:px-8 mb-10 md:mb-16">
          <UniversalReveal>
            <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4 text-center md:text-left">
              Signature Collection
            </p>
            <h2
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground text-center md:text-left"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Crafted to perfection
            </h2>
            <p className="text-gray-400 mt-4 text-center md:text-left max-w-2xl">
              Scroll to explore our finest blades — each forged with precision and passion.
            </p>
          </UniversalReveal>
        </div>

        <HorizontalPinScroll panels={5} gap={32} className="hidden md:block">
          {products.slice(0, 8).map((product) => (
            <HorizontalPanel key={product.id}>
              <Link href={`/products/${product.id}`} className="group block relative aspect-[3/4] rounded-2xl overflow-hidden border border-border hover:border-gold/40 transition-colors">
                <Image
                  src={product.images[0] || '/products/test-product-placeholder.png'}
                  alt={product.name}
                  fill
                  sizes="(max-width: 1024px) 40vw, 30vw"
                  className="object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <p className="text-gold text-xs tracking-wider uppercase mb-2">{product.category}</p>
                  <h3 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                    {product.name.toUpperCase()}
                  </h3>
                  <span className="text-2xl font-bold text-gold">{formatPrice(product.price)}</span>
                </div>
              </Link>
            </HorizontalPanel>
          ))}
        </HorizontalPinScroll>

        {/* Mobile: horizontal scroll */}
        <div className="md:hidden flex gap-4 overflow-x-auto snap-x snap-mandatory px-4 pb-4 scrollbar-hide">
          {products.slice(0, 8).map((product, i) => (
            <div
              key={product.id}
              className="flex-shrink-0 w-[80vw] snap-center animate-card-enter"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <Link href={`/products/${product.id}`} className="group block relative aspect-[3/4] rounded-2xl overflow-hidden border border-border active:border-gold/40 transition-colors">
                <Image
                  src={product.images[0] || '/products/test-product-placeholder.png'}
                  alt={product.name}
                  fill
                  sizes="80vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <p className="text-gold text-xs tracking-wider uppercase mb-2">{product.category}</p>
                  <h3 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                    {product.name.toUpperCase()}
                  </h3>
                  <span className="text-2xl font-bold text-gold">{formatPrice(product.price)}</span>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="py-24 px-4 md:px-8 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Image
            src="/products/collection/the-best-collection-3.jpeg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-15"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background/90 to-background" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <UniversalReveal>
            <h2
              className="text-4xl md:text-5xl font-bold text-gold-gradient mb-6"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Ready to Order?
            </h2>
            <p className="text-gray-400 mb-10 text-lg leading-relaxed">
              Browse our full catalog and place your wholesale order today.
              Minimum order quantities apply per product.
            </p>
            <Link
              href="/products"
              className="inline-flex items-center justify-center px-10 py-4 bg-gold text-background font-semibold rounded-lg text-lg animate-glow-pulse"
            >
              View All Products
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </UniversalReveal>
        </div>
      </section>
    </div>
  );
}