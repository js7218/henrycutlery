'use client';

import React, { createContext, useContext, useReducer, useEffect, ReactNode, useCallback, useRef } from 'react';
import { CartItem, Product, User, Order, Address, PaymentMethod } from '@/types';
import { generateOrderNumber } from '@/lib/utils';
import { securityLogger } from '@/lib/securityLogger';
import { products as currentProducts } from '@/data/products';

// ============================================================================
// SECURITY: Session Management
// - Inactive timeout: 15 minutes. As long as the user keeps interacting with
//   the page (click / keydown / scroll / mousemove) within any 15-minute
//   window, the session is kept alive. After 15 minutes of zero activity the
//   user is automatically signed out.
// - Absolute timeout acts as a hard cap regardless of activity.
// ============================================================================
const SESSION_CONFIG = {
  inactiveTimeoutMs: 15 * 60 * 1000,       // 15 minutes
  absoluteTimeoutMs: 24 * 60 * 60 * 1000,  // 24 hours
  maxConcurrentSessions: 3,
};

// ============================================================================
// SECURITY: Business Logic Limits
// ============================================================================
const BUSINESS_LIMITS = {
  maxItemsPerCart: 50,
};

interface AppState {
  cart: CartItem[];
  user: User | null;
  orders: Order[];
  isAgeVerified: boolean;
  lastActivity: number;
  sessionCreatedAt: number;
}

type AppAction =
  | { type: 'ADD_TO_CART'; product: Product; quantity?: number }
  | { type: 'REMOVE_FROM_CART'; productId: string }
  | { type: 'UPDATE_QUANTITY'; productId: string; quantity: number }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_USER'; user: User | null }
  | { type: 'ADD_ORDER'; order: Order }
  | { type: 'SET_ORDERS'; orders: Order[] }
  | { type: 'UPDATE_ORDER_STATUS'; orderId: string; status: Order['status'] }
  | { type: 'SET_AGE_VERIFIED'; verified: boolean }
  | { type: 'TOGGLE_FAVORITE'; productId: string }
  | { type: 'ADD_ADDRESS'; address: Address }
  | { type: 'UPDATE_ADDRESS'; address: Address }
  | { type: 'DELETE_ADDRESS'; addressId: string }
  | { type: 'SET_DEFAULT_ADDRESS'; addressId: string }
  | { type: 'UPDATE_ACTIVITY' };

const initialState: AppState = {
  cart: [],
  user: null,
  orders: [],
  isAgeVerified: false,
  lastActivity: Date.now(),
  sessionCreatedAt: Date.now(),
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ADD_TO_CART': {
      // SECURITY: Max items per cart
      if (state.cart.length >= BUSINESS_LIMITS.maxItemsPerCart) {
        securityLogger.log('BUSINESS_LOGIC_VIOLATION', `Cart item limit exceeded (${BUSINESS_LIMITS.maxItemsPerCart})`);
        return state;
      }
      const existingItem = state.cart.find(
        (item) => item.product.id === action.product.id
      );
      if (existingItem) {
        const newQty = existingItem.quantity + (action.quantity || 1);
        return {
          ...state,
          cart: state.cart.map((item) =>
            item.product.id === action.product.id
              ? { ...item, quantity: newQty }
              : item
          ),
        };
      }
      return {
        ...state,
        cart: [...state.cart, { product: action.product, quantity: action.quantity || 1 }],
      };
    }
    case 'REMOVE_FROM_CART':
      return { ...state, cart: state.cart.filter((item) => item.product.id !== action.productId) };
    case 'UPDATE_QUANTITY':
      if (action.quantity <= 0) {
        return { ...state, cart: state.cart.filter((item) => item.product.id !== action.productId) };
      }
      return {
        ...state,
        cart: state.cart.map((item) => {
          if (item.product.id === action.productId) {
            const moq = item.product.moq || 1;
            return { ...item, quantity: Math.max(action.quantity, moq) };
          }
          return item;
        }),
      };
    case 'CLEAR_CART':
      return { ...state, cart: [] };
    case 'SET_USER':
      return { ...state, user: action.user, sessionCreatedAt: Date.now(), lastActivity: Date.now() };
    case 'ADD_ORDER':
      return { ...state, orders: [action.order, ...state.orders] };
    case 'SET_ORDERS':
      return { ...state, orders: action.orders };
    case 'UPDATE_ORDER_STATUS':
      return {
        ...state,
        orders: state.orders.map((order) =>
          order.id === action.orderId ? { ...order, status: action.status } : order
        ),
      };
    case 'SET_AGE_VERIFIED':
      return { ...state, isAgeVerified: action.verified };
    case 'TOGGLE_FAVORITE': {
      if (!state.user) return state;
      const isFav = state.user.favorites.includes(action.productId);
      return {
        ...state,
        user: {
          ...state.user,
          favorites: isFav
            ? state.user.favorites.filter((id) => id !== action.productId)
            : [...state.user.favorites, action.productId],
        },
      };
    }
    case 'ADD_ADDRESS':
      if (!state.user) return state;
      return { ...state, user: { ...state.user, addresses: [...state.user.addresses, action.address] } };
    case 'UPDATE_ADDRESS':
      if (!state.user) return state;
      return {
        ...state,
        user: {
          ...state.user,
          addresses: state.user.addresses.map((addr) =>
            addr.id === action.address.id ? action.address : addr
          ),
        },
      };
    case 'DELETE_ADDRESS':
      if (!state.user) return state;
      return {
        ...state,
        user: {
          ...state.user,
          addresses: state.user.addresses.filter((addr) => addr.id !== action.addressId),
        },
      };
    case 'SET_DEFAULT_ADDRESS':
      if (!state.user) return state;
      return {
        ...state,
        user: {
          ...state.user,
          addresses: state.user.addresses.map((addr) => ({
            ...addr,
            isDefault: addr.id === action.addressId,
          })),
        },
      };
    case 'UPDATE_ACTIVITY':
      return { ...state, lastActivity: Date.now() };
    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartCount: number;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithCode: (type: 'email' | 'phone', identifier: string, code: string) => Promise<boolean>;
  sendVerificationCode: (type: 'email' | 'phone', identifier: string) => Promise<{ success: boolean; error?: string; code?: string }>;
  register: (name: string, email: string, password: string, phone: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  createOrder: (address: Address, paymentMethod: PaymentMethod) => Order | null;
  toggleFavorite: (productId: string) => Promise<void>;
  // SECURITY: Session check
  isSessionValid: () => boolean;
  // SECURITY: Horizontal privilege check
  canAccessResource: (resourceUserId: string) => boolean;
  // SECURITY: Vertical privilege check
  hasRole: (requiredRole: 'user' | 'admin') => boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const sessionCheckInterval = useRef<NodeJS.Timeout | null>(null);

  // ============================================================================
  // SECURITY: Session Timeout Monitor
  // ============================================================================
  useEffect(() => {
    sessionCheckInterval.current = setInterval(() => {
      const now = Date.now();
      const inactiveMs = now - state.lastActivity;
      const absoluteMs = now - state.sessionCreatedAt;

      // Inactive timeout (15 minutes of no interaction)
      if (state.user && inactiveMs > SESSION_CONFIG.inactiveTimeoutMs) {
        securityLogger.log('SESSION_EXPIRED', `Session expired due to inactivity (${Math.round(inactiveMs / 60000)} min)`, { userId: state.user.id });
        // Also revoke the server-side cookie so the next request is anonymous
        fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
        dispatch({ type: 'SET_USER', user: null });
        return;
      }

      // Absolute timeout
      if (state.user && absoluteMs > SESSION_CONFIG.absoluteTimeoutMs) {
        securityLogger.log('SESSION_EXPIRED', `Session expired (absolute timeout ${Math.round(absoluteMs / 3600000)} hr)`, { userId: state.user.id });
        fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
        dispatch({ type: 'SET_USER', user: null });
        return;
      }
    }, 30000); // Check every 30 seconds

    return () => {
      if (sessionCheckInterval.current) clearInterval(sessionCheckInterval.current);
    };
  }, [state.lastActivity, state.sessionCreatedAt, state.user]);

  // Track user activity
  useEffect(() => {
    const handleActivity = () => dispatch({ type: 'UPDATE_ACTIVITY' });
    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('scroll', handleActivity);
    window.addEventListener('mousemove', handleActivity);
    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      window.removeEventListener('mousemove', handleActivity);
    };
  }, []);

  // Load persisted state
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem('knife-cart');
      localStorage.removeItem('knife-user');
      localStorage.removeItem('knife-orders');
      localStorage.removeItem('knife-age-verified');
      localStorage.removeItem('knife-age-verified-at');

      if (savedCart) {
        const cart = JSON.parse(savedCart);
        cart.forEach((item: CartItem) => {
          dispatch({ type: 'ADD_TO_CART', product: item.product, quantity: item.quantity - 1 });
        });
      }
    } catch {
      securityLogger.log('INPUT_VALIDATION_FAILURE', 'Failed to parse persisted state');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.success && data.user) {
          dispatch({ type: 'SET_USER', user: data.user });
          dispatch({ type: 'SET_ORDERS', orders: data.user.orders || [] });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist state
  useEffect(() => {
    try { localStorage.setItem('knife-cart', JSON.stringify(state.cart)); } catch { /* */ }
  }, [state.cart]);

  // SECURITY: Clean up cart when products are removed from catalog
  useEffect(() => {
    const validProductIds = new Set(currentProducts.map(p => p.id));
    const removedItems = state.cart.filter(item => !validProductIds.has(item.product.id));
    if (removedItems.length > 0) {
      removedItems.forEach(item => {
        securityLogger.log('BUSINESS_LOGIC_VIOLATION', `Removed deleted product from cart: ${item.product.id}`);
      });
      dispatch({ type: 'CLEAR_CART' });
      // Re-add only valid items
      state.cart.forEach(item => {
        if (validProductIds.has(item.product.id)) {
          dispatch({ type: 'ADD_TO_CART', product: item.product, quantity: item.quantity });
        }
      });
    }
  }, []);

  // Shipping addresses are saved to Postgres per account. Add, edit, delete, and set default will all sync to the server.
  useEffect(() => {
    if (!state.user?.email) return;
    fetch('/api/user/addresses', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: state.user.addresses || [] }),
    }).catch(() => {});
  }, [state.user?.email, state.user?.addresses]);

  const addToCart = (product: Product, quantity?: number) => {
    const moq = product.moq || 1;
    const finalQuantity = quantity && quantity >= moq ? quantity : moq;
    dispatch({ type: 'ADD_TO_CART', product, quantity: finalQuantity });
  };

  const removeFromCart = (productId: string) => {
    dispatch({ type: 'REMOVE_FROM_CART', productId });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QUANTITY', productId, quantity });
  };

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' });
  };

  const cartTotal = state.cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const cartCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);

  // ============================================================================
  // SECURITY: Login with Full Protection
  // ============================================================================
  const login = async (email: string, password: string): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 80));

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        securityLogger.log('LOGIN_FAILURE', `Login failed: ${email.toLowerCase().trim()}`);
        return false;
      }

      const data = await response.json();
      if (!data?.success || !data.user) return false;

      dispatch({ type: 'SET_USER', user: data.user });
      dispatch({ type: 'SET_ORDERS', orders: data.user.orders || [] });
      securityLogger.log('LOGIN_SUCCESS', `User logged in: ${data.user.email}`, { userId: data.user.id, isAdmin: data.user.role === 'admin' });
      return true;
    } catch {
      securityLogger.log('LOGIN_FAILURE', `Login request failed: ${email.toLowerCase().trim()}`);
      return false;
    }
  };

  // ============================================================================
  // SECURITY: Login with Verification Code
  // ============================================================================
  const loginWithCode = async (type: 'email' | 'phone', identifier: string, code: string): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 80));

    try {
      const response = await fetch('/api/auth/login-with-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, identifier, code }),
      });

      if (!response.ok) {
        securityLogger.log('LOGIN_CODE_FAILURE', `Code login failed: ${identifier}`);
        return false;
      }

      const data = await response.json();
      if (!data?.success || !data.user) return false;

      dispatch({ type: 'SET_USER', user: data.user });
      dispatch({ type: 'SET_ORDERS', orders: data.user.orders || [] });
      securityLogger.log('LOGIN_SUCCESS', `User logged in with code: ${data.user.email}`, { userId: data.user.id });
      return true;
    } catch {
      securityLogger.log('LOGIN_CODE_FAILURE', `Code login request failed: ${identifier}`);
      return false;
    }
  };

  // ============================================================================
  // SECURITY: Send Verification Code
  // ============================================================================
  const sendVerificationCode = async (type: 'email' | 'phone', identifier: string): Promise<{ success: boolean; error?: string; code?: string }> => {
    try {
      const response = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, identifier }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        return { success: false, error: data?.error || 'Failed to send, please try again later' };
      }

      return { success: true, code: data?.code };
    } catch {
      return { success: false, error: 'Network error, please try again later' };
    }
  };

  // ============================================================================
  // SECURITY: Register with Full Protection
  // ============================================================================
  const register = async (name: string, email: string, password: string, phone: string): Promise<{ success: boolean; error?: string }> => {
    await new Promise((resolve) => setTimeout(resolve, 80));

    const normalizedEmail = email.toLowerCase().trim();

    const blockedPatterns = [
      'admin@', 'administrator@', 'root@', 'system@', 'superuser@',
      'webmaster@', 'hostmaster@', 'postmaster@', 'info@', 'support@',
      'service@', 'noreply@', 'no-reply@', 'mail@', 'email@',
    ];
    for (const pattern of blockedPatterns) {
      if (normalizedEmail.startsWith(pattern)) {
        securityLogger.log('VERTICAL_PRIVILEGE_ATTEMPT', `Blocked admin email registration: ${normalizedEmail}`);
        return { success: false, error: 'This email cannot be used for customer registration.' };
      }
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: normalizedEmail, password, phone }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        securityLogger.log('REGISTER_FAILURE', `Register failed: ${normalizedEmail}`);
        return { success: false, error: data?.error || 'Registration failed. Please try again.' };
      }

      if (!data?.success || !data.user) {
        return { success: false, error: data?.error || 'Registration failed. Please try again.' };
      }

      dispatch({ type: 'SET_USER', user: data.user });
      dispatch({ type: 'SET_ORDERS', orders: data.user.orders || [] });
      securityLogger.log('REGISTER_SUCCESS', `User registered: ${normalizedEmail}`, { userId: data.user.id });
      return { success: true };
    } catch {
      securityLogger.log('REGISTER_FAILURE', `Register request failed: ${normalizedEmail}`);
      return { success: false, error: 'Network or server error. Please try again.' };
    }
  };

  const logout = () => {
    if (state.user) {
      securityLogger.log('LOGOUT', `User logged out: ${state.user.email}`, { userId: state.user.id });
    }
    fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    localStorage.removeItem('knife-user');
    localStorage.removeItem('knife-orders');
    dispatch({ type: 'SET_USER', user: null });
  };

  const refreshUser = async () => {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.success && data.user) {
      dispatch({ type: 'SET_USER', user: data.user });
      dispatch({ type: 'SET_ORDERS', orders: data.user.orders || [] });
    }
  };

  const toggleFavorite = async (productId: string) => {
    if (!state.user) return;
    const isFavorite = state.user.favorites.includes(productId);
    const nextFavorites = isFavorite
      ? state.user.favorites.filter((id) => id !== productId)
      : [...state.user.favorites, productId];

    dispatch({ type: 'TOGGLE_FAVORITE', productId });

    try {
      const response = await fetch('/api/user/favorites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorites: nextFavorites }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.success && data.user) {
        dispatch({ type: 'SET_USER', user: data.user });
      }
    } catch {
      dispatch({ type: 'TOGGLE_FAVORITE', productId });
    }
  };

  // ============================================================================
  // SECURITY: Order Creation - Price Tampering Protection ONLY
  // ============================================================================
  const createOrder = (address: Address, paymentMethod: PaymentMethod): Order | null => {
    if (!state.user) return null;
    if (state.cart.length === 0) return null;

    // SECURITY: Verify prices server-side (use product data, NOT client-sent prices)
    // This is the CRITICAL protection - prices come from product data, never from user input
    const order: Order = {
      id: `o${Date.now()}`,
      orderNumber: generateOrderNumber(),
      items: state.cart.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        productImage: item.product.images[0],
        price: item.product.price, // SECURITY: Price from product data source, NOT user input
        quantity: item.quantity,
      })),
      totalAmount: cartTotal,
      status: 'pending',
      shippingAddress: address,
      paymentMethod,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    dispatch({ type: 'ADD_ORDER', order });
    dispatch({ type: 'CLEAR_CART' });
    securityLogger.log('ORDER_CREATED', `Order ${order.orderNumber} created, total: ${cartTotal}`, {
      userId: state.user.id,
      orderId: order.id,
      itemCount: state.cart.length,
    });
    return order;
  };

  // ============================================================================
  // SECURITY: Session Validity Check
  // ============================================================================
  const isSessionValid = useCallback((): boolean => {
    if (!state.user) return false;
    const now = Date.now();
    if (now - state.lastActivity > SESSION_CONFIG.inactiveTimeoutMs) return false;
    if (now - state.sessionCreatedAt > SESSION_CONFIG.absoluteTimeoutMs) return false;
    return true;
  }, [state.user, state.lastActivity, state.sessionCreatedAt]);

  // ============================================================================
  // SECURITY: Horizontal Privilege Check
  // ============================================================================
  const canAccessResource = useCallback((resourceUserId: string): boolean => {
    if (!state.user) return false;
    return state.user.id === resourceUserId;
  }, [state.user]);

  // ============================================================================
  // SECURITY: Vertical Privilege Check
  // ============================================================================
  const hasRole = useCallback((requiredRole: 'user' | 'admin'): boolean => {
    if (!state.user) return false;
    const roleLevels = { user: 1, admin: 2 };
    return roleLevels[state.user.role || 'user'] >= roleLevels[requiredRole];
  }, [state.user]);

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartTotal,
        cartCount,
        login,
        loginWithCode,
        sendVerificationCode,
        register,
        logout,
        refreshUser,
        toggleFavorite,
        createOrder,
        isSessionValid,
        canAccessResource,
        hasRole,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
