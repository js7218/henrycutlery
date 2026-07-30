'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Shield, Truck, Award, Factory, Globe2, Wrench } from 'lucide-react';
import { gsap, useGSAP, ScrollTrigger, onAgeVerified } from '@/lib/gsap';
import ScrollReveal from '@/components/animation/ScrollReveal';
import MagneticButton from '@/components/animation/MagneticButton';

export default function Home() {
  const heroRef = useRef<HTMLElement>(null);
  const sweepRef = useRef<HTMLDivElement>(null);
  const [animReady, setAnimReady] = useState(false);

  // Wait for age verification before running entrance animations
  useEffect(() => {
    onAgeVerified(() => setAnimReady(true));
  }, []);

  // Hero entrance + scroll animations (responsive via matchMedia)
  useGSAP(
    () => {
      if (!animReady) return;

      // ---- Gold sweep across screen on load ----
      if (sweepRef.current) {
        const sweep = gsap.timeline();
        sweep
          .set(sweepRef.current, { scaleX: 0, transformOrigin: 'left center' })
          .to(sweepRef.current, { scaleX: 1, duration: 0.8, ease: 'power2.inOut' })
          .to(sweepRef.current, { opacity: 0, duration: 0.4, ease: 'power2.out' });
      }

      // ---- Entrance timeline (uses fromTo for reliability) ----
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: 0.2 });

      tl.fromTo('.hero-eyebrow', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, onStart: () => markDone('.hero-eyebrow') })
        .fromTo('.hero-title-line', { y: 120, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.2, duration: 1.1, onStart: () => markDone('.hero-title-line') }, '-=0.3')
        .fromTo('.hero-sub', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, onStart: () => markDone('.hero-sub') }, '-=0.5')
        .fromTo('.hero-desc', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, onStart: () => markDone('.hero-desc') }, '-=0.5')
        .fromTo('.hero-cta', { y: 40, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.15, duration: 0.7, onStart: () => markDone('.hero-cta') }, '-=0.4')
        .fromTo('.hero-image', { scale: 1.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.5, ease: 'power2.out', onStart: () => markDone('.hero-image') }, '-=1.2')
        .to('.hero-image > div', {
          boxShadow: '0 0 40px rgba(201, 169, 98, 0.3)',
          duration: 1.5,
          ease: 'power2.inOut',
          yoyo: true,
          repeat: 1,
        }, '-=0.5');

      // ---- Responsive animations via matchMedia ----
      const mm = gsap.matchMedia();

      // Desktop / tablet (≥768px): parallax + scrub
      mm.add('(min-width: 768px)', () => {
        gsap.to('.hero-bg', {
          yPercent: 30,
          ease: 'none',
          scrollTrigger: {
            trigger: heroRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: 1,
          },
        });
      });

      // All devices: stats counter
      mm.add(
        {
          isDesktop: '(min-width: 768px)',
          isMobile: '(max-width: 767px)',
        },
        (ctx) => {
          const stats = document.querySelectorAll('[data-counter]');
          stats.forEach((stat) => {
            const target = parseInt(stat.getAttribute('data-counter') || '0', 10);
            const obj = { val: 0 };
            gsap.to(obj, {
              val: target,
              duration: ctx.isMobile ? 1.2 : 2,
              ease: 'power2.out',
              scrollTrigger: { trigger: stat, start: 'top 90%', once: true },
              onUpdate: () => {
                stat.textContent = Math.floor(obj.val).toLocaleString();
              },
            });
          });
        }
      );

      // Refresh ScrollTrigger after entrance animation settles
      setTimeout(() => ScrollTrigger.refresh(), 500);
    },
    { scope: heroRef, dependencies: [animReady] }
  );

  /** Mark elements as animation-done so the safety net skips them */
  function markDone(selector: string) {
    document.querySelectorAll(selector).forEach((el) => {
      el.setAttribute('data-gsap-done', 'true');
    });
  }

  return (
    <div className="min-h-screen">
      {/* ===== HERO: Asymmetric split layout with parallax ===== */}
      <section ref={heroRef} className="relative min-h-[90vh] flex items-center overflow-hidden">
        {/* Gold sweep on page load */}
        <div
          ref={sweepRef}
          className="fixed inset-0 z-[200] pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(201, 169, 98, 0.15) 50%, transparent 100%)',
          }}
        />
        {/* Parallax background */}
        <div className="hero-bg absolute inset-0 z-0">
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
            {/* Left: Text */}
            <div className="order-2 lg:order-1">
              <p className="hero-eyebrow text-gold text-sm tracking-[0.3em] uppercase mb-6" data-gsap-anim>
                Premium Cutlery Manufacturing
              </p>
              <h1
                className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-[0.95]"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                <span className="hero-title-line block text-gold-gradient" data-gsap-anim>ADAM</span>
                <span className="hero-title-line block text-foreground" data-gsap-anim>CUTLERY</span>
              </h1>
              <p className="hero-sub text-xl md:text-2xl text-gray-300 mb-4 max-w-xl" data-gsap-anim>
                Precision-forged blades for global wholesale.
              </p>
              <p className="hero-desc text-gray-400 mb-10 max-w-xl leading-relaxed" data-gsap-anim>
                From Damascus chef knives to titanium folding blades, we manufacture
                premium cutlery with CNC precision. OEM customization, competitive MOQ
                pricing, and worldwide shipping.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <MagneticButton
                  href="/products"
                  className="hero-cta inline-flex items-center justify-center px-8 py-4 bg-gold text-background font-semibold rounded-lg hover:bg-goldLight transition-colors"
                >
                  Browse Products
                  <ArrowRight className="w-5 h-5 ml-2" />
                </MagneticButton>
                <MagneticButton
                  href="/products?category=folding"
                  className="hero-cta inline-flex items-center justify-center px-8 py-4 border border-gold/50 text-gold font-semibold rounded-lg hover:bg-gold/10 transition-colors"
                >
                  Folding Knives
                </MagneticButton>
              </div>
            </div>

            {/* Right: Image */}
            <div className="hero-image order-1 lg:order-2 relative" data-gsap-anim>
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
              <div className="absolute -bottom-6 -left-6 bg-surface/90 backdrop-blur-md border border-gold/20 rounded-xl p-5 shadow-xl hidden md:block">
                <p className="text-3xl font-bold text-gold" data-counter="500">0</p>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: 500, label: 'Global Clients', suffix: '+' },
              { value: 15, label: 'Years Experience', suffix: '+' },
              { value: 50, label: 'Countries Shipped', suffix: '+' },
              { value: 100, label: 'Product Styles', suffix: '+' },
            ].map((stat, i) => (
              <ScrollReveal key={i} direction="up" delay={i * 0.1}>
                <div>
                  <p className="text-3xl md:text-4xl font-bold text-gold">
                    <span data-counter={stat.value}>0</span>{stat.suffix}
                  </p>
                  <p className="text-xs md:text-sm text-gray-400 uppercase tracking-wider mt-1">
                    {stat.label}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FACTORY: Asymmetric with parallax ===== */}
      <section className="py-24 px-4 md:px-8 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1fr_1.3fr] gap-12 lg:gap-20 items-center mb-16">
            <ScrollReveal direction="left">
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
            </ScrollReveal>

            <ScrollReveal direction="right" delay={0.2}>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: Factory, title: 'In-House Production', desc: 'Full CNC machining, heat treatment, and quality control under one roof.' },
                  { icon: Wrench, title: 'Custom Engineering', desc: 'From design drawings to finished product, we handle every step.' },
                  { icon: Shield, title: 'Quality Assurance', desc: 'Material selection, machining, polishing, inspection, and secure packing.' },
                  { icon: Globe2, title: 'Global Export', desc: 'Worldwide shipping with tracking and customs documentation support.' },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="p-5 bg-surface rounded-xl border border-border hover:border-gold/40 transition-colors group"
                  >
                    <item.icon className="w-7 h-7 text-gold mb-3 group-hover:scale-110 transition-transform" />
                    <h3 className="text-foreground font-semibold text-sm mb-1">{item.title}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </ScrollReveal>
          </div>

          {/* Factory images with parallax */}
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
                <div className={`relative rounded-xl overflow-hidden border border-border ${i === 0 ? 'aspect-square md:aspect-[4/3]' : 'aspect-[4/3]'}`}>
                  <Image
                    src={img.src}
                    alt={`Factory ${i + 1}`}
                    fill
                    loading="lazy"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover hover:scale-110 transition-transform duration-700"
                  />
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CATEGORIES: Bento grid, not equal cards ===== */}
      <section className="py-24 px-4 md:px-8 bg-surface/30">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal direction="up">
            <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4 text-center">Our Collections</p>
            <h2
              className="text-4xl md:text-5xl font-bold text-center text-gold-gradient mb-16"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Explore by Category
            </h2>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 auto-rows-[200px]">
            {/* Large card */}
            <ScrollReveal direction="up" className="md:col-span-2 lg:col-span-2 row-span-2">
              <Link
                href="/products?category=collection"
                className="group relative h-full block rounded-2xl overflow-hidden border border-gold/20"
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
            </ScrollReveal>

            {/* Medium cards */}
            {[
              { name: 'Folding', desc: 'EDC & tactical folders', href: '/products?category=folding', img: '/images/ti.jpg' },
              { name: 'Kitchen', desc: 'Professional chef knives', href: '/products?category=kitchen', img: '/images/ca1d285711b90eaa22a99762c802bd48.jpg' },
              { name: 'Hunting', desc: 'Field dressing & skinning', href: '/products?category=hunting', img: '/images/hunting1.jpg' },
            ].map((cat, i) => (
              <ScrollReveal key={cat.name} direction="up" delay={0.15 * (i + 1)}>
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
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES: Horizontal scroll-like layout ===== */}
      <section className="py-24 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <ScrollReveal direction="up">
            <div className="text-center mb-16">
              <p className="text-gold text-sm tracking-[0.3em] uppercase mb-4">Why Choose Us</p>
              <h2
                className="text-4xl md:text-5xl font-bold text-foreground"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                Built for wholesale buyers
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-6">
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
              <ScrollReveal key={i} direction="up" delay={i * 0.15}>
                <div className="p-8 bg-surface rounded-2xl border border-border hover:border-gold/40 transition-all duration-300 group h-full">
                  <div className="w-14 h-14 rounded-xl bg-gold/10 flex items-center justify-center mb-6 group-hover:bg-gold/20 transition-colors">
                    <feat.icon className="w-7 h-7 text-gold" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">{feat.title}</h3>
                  <p className="text-gray-400 leading-relaxed">{feat.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
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
          <ScrollReveal direction="up">
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
            <MagneticButton
              href="/products"
              className="inline-flex items-center justify-center px-10 py-4 bg-gold text-background font-semibold rounded-lg hover:bg-goldLight transition-colors text-lg"
            >
              View All Products
              <ArrowRight className="w-5 h-5 ml-2" />
            </MagneticButton>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
