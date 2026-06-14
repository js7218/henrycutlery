import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Shield, Truck, Award } from 'lucide-react';
import OemOdmCard from '@/components/home/OemOdmCard';

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
        <Image
          src="/products/collection/the-best-collection-1.jpeg"
          alt="Premium collector knife"
          fill
          priority
          className="object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/90 to-background" />
        <div className="relative z-10 px-4 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className="text-center lg:text-left">
            <h1 className="text-5xl md:text-7xl font-bold text-gold-gradient mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
              ADAM CUTLERY
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 mb-4">
              Premium Knives & Professional Cutlery
            </p>
            <p className="text-gray-400 mb-4 max-w-2xl mx-auto lg:mx-0">
              Crafting excellence since 2024. We specialize in high-quality folding knives, 
              hunting knives, and kitchen cutlery with precision engineering and premium materials.
            </p>
            <p className="text-gray-300 mb-8 max-w-2xl mx-auto lg:mx-0">
              Premium knife manufacturing, OEM wholesale, and high-end collectible cutlery for global buyers.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link
                href="/products"
                className="inline-flex items-center justify-center px-8 py-4 bg-gold text-background font-semibold rounded-lg hover:bg-goldLight transition-colors"
              >
                Browse Products
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
              <Link
                href="/products?category=folding"
                className="inline-flex items-center justify-center px-8 py-4 border border-gold text-gold font-semibold rounded-lg hover:bg-gold/10 transition-colors"
              >
                Folding Knives
              </Link>
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-gold/30 shadow-2xl">
              <Image
                src="/products/collection/the-best-collection-1.jpeg"
                alt="The best collection knife"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Factory Section */}
      <section className="py-20 px-4 bg-surface">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gold-gradient mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
            Our Factory
          </h2>
          <p className="text-center text-gray-400 max-w-4xl mx-auto mb-12 text-lg leading-relaxed">
            We have a professional manufacturing team and technology to produce various types of cutting tool products. We can accept OEM customization services. As long as you send us your design drawings and plans, we can provide you with preferential quotations and high-quality production plans according to your needs, and customize products specifically for you to help you explore a wider market.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
            <OemOdmCard />
            <div className="p-5 bg-background rounded-xl border border-border">
              <h3 className="text-gold font-semibold mb-2">Wholesale Supply</h3>
              <p className="text-sm text-gray-400">MOQ-based pricing, sample confirmation, and production planning for international buyers.</p>
            </div>
            <div className="p-5 bg-background rounded-xl border border-border">
              <h3 className="text-gold font-semibold mb-2">Quality Control</h3>
              <p className="text-sm text-gray-400">Material selection, machining, polishing, inspection, and secure packing before shipment.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              '/images/factory1.jpg',
              '/images/factory2.jpg',
              '/images/factory3.jpg',
              '/images/factory4.jpg',
              '/images/factory6.jpg',
              '/images/factory7.jpg',
              '/images/factory8.jpg',
            ].map((src, index) => (
              <div key={index} className="relative aspect-[4/3] rounded-xl overflow-hidden border border-border">
                <img
                  src={src}
                  alt={`Factory ${index + 1}`}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-8 bg-surface rounded-xl border border-border">
              <Shield className="w-12 h-12 text-gold mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">Premium Quality</h3>
              <p className="text-gray-400">CNC machined D2 steel blades with titanium handles for ultimate durability.</p>
            </div>
            <div className="text-center p-8 bg-surface rounded-xl border border-border">
              <Truck className="w-12 h-12 text-gold mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">Global Shipping</h3>
              <p className="text-gray-400">Worldwide delivery with secure packaging and tracking.</p>
            </div>
            <div className="text-center p-8 bg-surface rounded-xl border border-border">
              <Award className="w-12 h-12 text-gold mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">Wholesale MOQ</h3>
              <p className="text-gray-400">Competitive pricing with MOQ starting from 200 pieces.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-20 px-4 bg-surface">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gold-gradient mb-12" style={{ fontFamily: 'Playfair Display, serif' }}>
            Our Collections
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: 'Kitchen', desc: 'Professional chef knives', href: '/products?category=kitchen' },
              { name: 'Folding', desc: 'EDC & tactical folders', href: '/products?category=folding' },
              { name: 'Collection', desc: 'High-end collected knives', href: '/products?category=collection' },
              { name: 'Hunting', desc: 'Field dressing & skinning', href: '/products?category=hunting' },
            ].map((cat) => (
              <Link
                key={cat.name}
                href={cat.href}
                className="group p-8 bg-background rounded-xl border border-border hover:border-gold transition-colors text-center"
              >
                <h3 className="text-xl font-semibold text-foreground group-hover:text-gold transition-colors mb-2">
                  {cat.name}
                </h3>
                <p className="text-gray-400">{cat.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gold-gradient mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
            Ready to Order?
          </h2>
          <p className="text-gray-400 mb-8 text-lg">
            Browse our full catalog and place your wholesale order today.
            Minimum order quantities apply.
          </p>
          <Link
            href="/products"
            className="inline-flex items-center justify-center px-8 py-4 bg-gold text-background font-semibold rounded-lg hover:bg-goldLight transition-colors"
          >
            View All Products
            <ArrowRight className="w-5 h-5 ml-2" />
          </Link>
        </div>
      </section>
    </div>
  );
}
