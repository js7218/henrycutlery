'use client';

import { useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Shield, Truck, Award, Factory, Globe2, Wrench } from 'lucide-react';
import UniversalReveal, { RevealChild } from '@/components/animation/UniversalReveal';
import ScrollReveal from '@/components/animation/ScrollReveal';
import ImageReveal from '@/components/animation/ImageReveal';
import HorizontalPinScroll, { HorizontalPanel } from '@/components/animation/HorizontalPinScroll';
import ThreeDImage from '@/components/animation/ThreeDImage';
import ThreeDButton from '@/components/animation/ThreeDButton';
import { products } from '@/data/products';
import { formatPrice } from '@/lib/utils';

export default function Home() {
  const heroRef = useRef<HTMLElement>(null);

  return (
    <div className="min-h-screen">
      {/* ===== HERO ===== */}
      <section ref={heroRef} className="relative min-h-[90vh] flex items-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <ThreeDImage
            src="/products/collection/the-best-collection-1.jpeg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-25"
            maxTilt={0}
            glare={false}
            edgeHighlight={false}
            floatSpeed={0}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background/85 to-background/40" />
        </div>

        <div className="relative z-10 w-full px-4 md:px-8 lg:px-16 max-w-7xl mx-auto pt-20 pb-16">
          <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8 lg:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <p className="text-gold text-sm tracking-[0.3em] uppercase mb-6 hero-enter-1">
                Yangjiang, China · Est. 2009
              </p>
              <h1
                className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-[0.95]"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                <span className="block text-gold-gradient hero-enter-2">
                  ADAM
                </span>
                <span className="block text-foreground hero-enter-3">
                  CUTLERY
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-300 mb-4 max-w-xl hero-enter-4">
                We make knives people actually carry.
              </p>
              <p className="text-gray-400 mb-10 max-w-xl leading-relaxed hero-enter-5">
                Not a drop-shipper, not a middleman. We run a forge in Yangjiang
                and ship direct to buyers in 50+ countries. D2, M390, Damascus
                — whatever steel your market needs, we'll build it.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 hero-enter-6">
                <ThreeDButton
                  href="/products"
                  variant="cta"
                  size="lg"
                  showArrow
                  depth={8}
                >
                  See what we make
                </ThreeDButton>
                <ThreeDButton
                  href="/products?category=folding"
                  variant="outline"
                  size="lg"
                  depth={5}
                >
                  Folding knives
                </ThreeDButton>
              </div>
            </div>

            <div className="order-1 lg:order-2 relative hero-enter-img">
              <ThreeDImage
                src="/products/collection/the-best-collection-1.jpeg"
                alt="The Best Collection knife"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 40vw"
                maxTilt={12}
                containerClassName="aspect-[3/4] rounded-2xl overflow-hidden border border-gold/20 shadow-2xl"
              />
              <div className="absolute -bottom-6 -left-6 bg-surface/90 backdrop-blur-md border border-gold/20 rounded-xl p-5 shadow-xl hidden md:block animate-hero-float z-20">
                <p className="text-3xl font-bold text-gold">500+</p>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Buyers worldwide</p>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 hidden md:block">
          <div className="w-6 h-10 border-2 border-gold/30 rounded-full flex items-start justify-center p-1.5">
            <div className="w-1 h-2 bg-gold/50 rounded-full animate-bounce" />
          </div>
        </div>
      </section>

      {/* ===== STATS BAR ===== */}
      <section className="border-y border-border bg-surface/50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-10">
          <UniversalReveal stagger={0.1} className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '15', label: 'years at the forge' },
              { value: '50+', label: 'countries shipped to' },
              { value: '100+', label: 'blade styles in catalog' },
              { value: 'HRC 58-60', label: 'our standard hardness' },
            ].map((stat, i) => (
              <RevealChild key={i}>
                <div>
                  <p className="text-2xl md:text-3xl font-bold text-gold">
                    {stat.value}
                  </p>
                  <p className="text-xs md:text-sm text-gray-400 mt-1">
                    {stat.label}
                  </p>
                </div>
              </RevealChild>
            ))}
          </UniversalReveal>
        </div>
      </section>

      {/* ===== FACTORY ===== */}
      <section className="py-20 md:py-28 px-4 md:px-8 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1fr_1.3fr] gap-12 lg:gap-20 items-center mb-16">
            <UniversalReveal anim="slide-left">
              <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4">The Workshop</p>
              <h2
                className="text-4xl md:text-5xl font-bold text-foreground mb-6 leading-tight"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                We don't outsource the hard parts.
              </h2>
              <p className="text-gray-400 leading-relaxed mb-6">
                Heat treatment, CNC grinding, polishing, assembly — all done in-house.
                That means we control the hardness, the edge geometry, and the finish
                down to the last detail. Send us a drawing or a sample knife, and we'll
                quote you within 48 hours. No back-and-forth with trading companies.
              </p>
              <div className="flex flex-wrap gap-3">
                {['OEM', 'ODM', 'Wholesale', 'Custom steel'].map((tag) => (
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
                { icon: Factory, title: 'In-house production', desc: 'CNC, heat treat, QC — one roof, one team.' },
                { icon: Wrench, title: 'Custom engineering', desc: 'Send a drawing, get a quote in 48 hours.' },
                { icon: Shield, title: 'Material verification', desc: 'Spectral analysis on every steel batch. HRC tested.' },
                { icon: Globe2, title: 'Direct export', desc: 'We ship to your warehouse. Customs docs included.' },
              ].map((item, i) => (
                <RevealChild key={i} delay={i * 0.1}>
                  <div className="p-5 bg-surface rounded-xl border border-border hover-soft-glow">
                    <item.icon className="w-7 h-7 text-gold mb-3" />
                    <h3 className="text-foreground font-semibold text-sm mb-1">{item.title}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                  </div>
                </RevealChild>
              ))}
            </UniversalReveal>
          </div>

          {/* Factory images — 3D */}
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
                <ImageReveal direction={i % 2 === 0 ? 'left' : 'right'} duration={1} delay={i * 0.05} scrollTrigger start="top 85%">
                  <ThreeDImage
                    src={img.src}
                    alt={`Factory ${i + 1}`}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    maxTilt={10}
                    scale={1.02}
                    containerClassName={`rounded-xl overflow-hidden border border-border ${i === 0 ? 'aspect-square md:aspect-[4/3]' : 'aspect-[4/3]'}`}
                  />
                </ImageReveal>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CATEGORIES ===== */}
      <section className="py-16 md:py-20 px-4 md:px-8 bg-surface/30">
        <div className="max-w-7xl mx-auto">
          <UniversalReveal className="mb-12">
            <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4">Browse</p>
            <h2
              className="text-4xl md:text-5xl font-bold text-gold-gradient"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              What are you looking for?
            </h2>
          </UniversalReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 auto-rows-[200px]">
            <UniversalReveal anim="scale-in" className="md:col-span-2 lg:col-span-2 row-span-2">
              <Link
                href="/products?category=collection"
                className="group relative h-full block rounded-2xl overflow-hidden border border-gold/20 animate-border-glow"
              >
                <ThreeDImage
                  src="/products/collection/the-best-collection-1.jpeg"
                  alt="Collection"
                  fill
                  fillContainer
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  maxTilt={8}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <div className="absolute bottom-0 left-0 p-8">
                  <h3 className="text-2xl font-bold text-foreground mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>
                    Collection
                  </h3>
                  <p className="text-gray-400 text-sm">One-off pieces and limited runs</p>
                  <span className="inline-flex items-center text-gold text-sm mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    See them <ArrowRight className="w-4 h-4 ml-1" />
                  </span>
                </div>
              </Link>
            </UniversalReveal>

            {[
              { name: 'Folding', desc: 'EDC and tactical', href: '/products?category=folding', img: '/products/titanium-alloy-1.jpeg' },
              { name: 'Kitchen', desc: 'Chef and prep knives', href: '/products?category=kitchen', img: '/products/kitchen-chef-1.jpeg' },
              { name: 'Hunting', desc: 'Skinners and camp knives', href: '/products?category=hunting', img: '/products/hunting-new-5.jpeg' },
            ].map((cat, i) => (
              <UniversalReveal key={cat.name} anim="fade-up" className={`${i === 0 ? 'lg:col-start-3' : ''}`}>
                <Link
                  href={cat.href}
                  className="group relative h-full block rounded-2xl overflow-hidden border border-border hover:border-gold/40 transition-colors"
                >
                  <ThreeDImage
                    src={cat.img}
                    alt={cat.name}
                    fill
                    fillContainer
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    maxTilt={8}
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
      <section className="py-20 md:py-24 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <UniversalReveal className="mb-12">
            <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4">The details</p>
            <h2
              className="text-4xl md:text-5xl font-bold text-foreground max-w-2xl"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              What you get when you order from us
            </h2>
          </UniversalReveal>

          <UniversalReveal stagger={0.15} className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Shield,
                title: 'Real steel, verified',
                desc: 'D2, M390, Damascus, 14C28N — we test every batch with spectral analysis before it hits the grinder. You get a material certificate with your order.',
              },
              {
                icon: Truck,
                title: 'Shipped to your door',
                desc: 'We handle export, customs paperwork, and tracking. Most orders arrive in 7-15 days depending on your country. We have shipped to over 50 countries without a lost package.',
              },
              {
                icon: Award,
                title: 'Flexible quantities',
                desc: 'Folding knives start at 100 pieces. Kitchen knives can go up to 1,200 per order. Collection pieces are available individually. Samples available before committing.',
              },
            ].map((feat, i) => (
              <RevealChild key={i}>
                <div className="p-8 bg-surface rounded-2xl border border-border hover-soft-glow h-full card-3d">
                  <div className="w-14 h-14 rounded-xl bg-gold/10 flex items-center justify-center mb-6">
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
      <section className="py-16 md:py-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 md:px-8 mb-10 md:mb-14">
          <UniversalReveal>
            <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4 text-center md:text-left">
              Catalog
            </p>
            <h2
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground text-center md:text-left"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              A few of our blades
            </h2>
            <p className="text-gray-400 mt-4 text-center md:text-left max-w-2xl">
              Each one is a production model we currently ship. Swipe through to get a feel.
            </p>
          </UniversalReveal>
        </div>

        <HorizontalPinScroll panels={5} gap={32} className="hidden md:block">
          {products.slice(0, 8).map((product) => (
            <HorizontalPanel key={product.id}>
              <Link href={`/products/${product.id}`} className="group block relative aspect-[3/4] rounded-2xl overflow-hidden border border-border hover:border-gold/40 transition-colors">
                <ThreeDImage
                  src={product.images[0] || '/products/test-product-placeholder.png'}
                  alt={product.name}
                  fill
                  fillContainer
                  sizes="(max-width: 1024px) 40vw, 30vw"
                  maxTilt={10}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <p className="text-gold text-xs tracking-wider uppercase mb-2">{product.category}</p>
                  <h3 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                    {product.name}
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
                <ThreeDImage
                  src={product.images[0] || '/products/test-product-placeholder.png'}
                  alt={product.name}
                  fill
                  fillContainer
                  sizes="80vw"
                  maxTilt={0}
                  glare={false}
                  edgeHighlight={false}
                  floatSpeed={0}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <p className="text-gold text-xs tracking-wider uppercase mb-2">{product.category}</p>
                  <h3 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                    {product.name}
                  </h3>
                  <span className="text-2xl font-bold text-gold">{formatPrice(product.price)}</span>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="py-20 md:py-28 px-4 md:px-8 relative overflow-hidden">
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
              Got a project in mind?
            </h2>
            <p className="text-gray-400 mb-10 text-lg leading-relaxed">
              Whether you need 100 pieces or 10,000, browse the catalog and
              send us what you're looking for. We'll get back to you with
              pricing and a timeline.
            </p>
            <ThreeDButton
              href="/products"
              variant="cta"
              size="xl"
              showArrow
              depth={10}
            >
              Browse the catalog
            </ThreeDButton>
          </UniversalReveal>
        </div>
      </section>
    </div>
  );
}