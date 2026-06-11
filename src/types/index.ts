export interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  originalPrice?: number;
  description: string;
  longDescription: string;
  category: ProductCategory;
  subcategory?: string;
  images: string[];
  specs: ProductSpecs;
  stock: number;
  featured: boolean;
  isNew: boolean;
  tags: string[];
  moq?: number;
  // Per-product free-shipping flag. When true, this item contributes $0 to the
  // shipping fee calculation regardless of cart subtotal.
  freeShipping?: boolean;
}

export type ProductCategory = 
  | 'kitchen' 
  | 'folding' 
  | 'fixed' 
  | 'hunting' 
  | 'damascus' | 'multitool' | 'edc' | 'tactical' | 'boning';

export interface ProductSpecs {
  bladeLength: string;
  totalLength: string;
  bladeMaterial: string;
  handleMaterial: string;
  weight: string;
  hardness?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  addresses: Address[];
  orders: Order[];
  favorites: string[];
  createdAt: string;
  role?: 'user' | 'admin';
  // SECURITY: Session token for horizontal privilege checks
  sessionToken?: string;
}

export interface Address {
  id: string;
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  shippingAddress: Address;
  paymentMethod: PaymentMethod;
  createdAt: string;
  role?: 'user' | 'admin';
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  productImage: string;
  price: number;
  quantity: number;
}

export type OrderStatus = 
  | 'pending' 
  | 'paid' 
  | 'processing' 
  | 'shipped' 
  | 'delivered' 
  | 'cancelled';

export type PaymentMethod = 'bank_transfer' | 'wechat' | 'alipay' | 'card';

export interface FilterOptions {
  category?: ProductCategory;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'price-asc' | 'price-desc' | 'name' | 'newest';
}

export interface AgeVerification {
  isVerified: boolean;
  verifiedAt?: string;
}
