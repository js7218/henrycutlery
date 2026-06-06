'use client';

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { CartItem, Product, User, Order, Address } from '@/types';
import { generateOrderNumber } from '@/lib/utils';

interface AppState {
  cart: CartItem[];
  user: User | null;
  orders: Order[];
  isAgeVerified: boolean;
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
  | { type: 'SET_DEFAULT_ADDRESS'; addressId: string };

const initialState: AppState = {
  cart: [],
  user: null,
  orders: [],
  isAgeVerified: false,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ADD_TO_CART': {
      const existingItem = state.cart.find(
        (item) => item.product.id === action.product.id
      );
      if (existingItem) {
        return {
          ...state,
          cart: state.cart.map((item) =>
            item.product.id === action.product.id
              ? { ...item, quantity: item.quantity + (action.quantity || 1) }
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
      return {
        ...state,
        cart: state.cart.filter((item) => item.product.id !== action.productId),
      };
    case 'UPDATE_QUANTITY':
      if (action.quantity <= 0) {
        return {
          ...state,
          cart: state.cart.filter((item) => item.product.id !== action.productId),
        };
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
      return { ...state, user: action.user };
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
      return {
        ...state,
        user: {
          ...state.user,
          addresses: [...state.user.addresses, action.address],
        },
      };
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
  register: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  createOrder: (address: Address, paymentMethod: 'wechat' | 'alipay' | 'card') => Order;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    const savedCart = localStorage.getItem('knife-cart');
    const savedUser = localStorage.getItem('knife-user');
    const savedOrders = localStorage.getItem('knife-orders');
    const savedAge = localStorage.getItem('knife-age-verified');

    if (savedCart) {
      const cart = JSON.parse(savedCart);
      cart.forEach((item: CartItem) => {
        dispatch({ type: 'ADD_TO_CART', product: item.product, quantity: item.quantity - 1 });
      });
    }
    if (savedUser) {
      dispatch({ type: 'SET_USER', user: JSON.parse(savedUser) });
    }
    if (savedOrders) {
      dispatch({ type: 'SET_ORDERS', orders: JSON.parse(savedOrders) });
    }
    if (savedAge) {
      dispatch({ type: 'SET_AGE_VERIFIED', verified: true });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('knife-cart', JSON.stringify(state.cart));
  }, [state.cart]);

  useEffect(() => {
    if (state.user) {
      localStorage.setItem('knife-user', JSON.stringify(state.user));
    } else {
      localStorage.removeItem('knife-user');
    }
  }, [state.user]);

  useEffect(() => {
    localStorage.setItem('knife-orders', JSON.stringify(state.orders));
  }, [state.orders]);

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

  const login = async (email: string, password: string): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Detect admin by email prefix or domain
    const isAdminEmail = email.toLowerCase().includes('admin@') || 
                          email.toLowerCase().startsWith('admin');
    
    const mockUser: User = {
      id: 'u001',
      email,
      name: email.split('@')[0],
      phone: '138****8888',
      role: isAdminEmail ? 'admin' : 'user',
      addresses: [
        {
          id: 'a001',
          name: '张三',
          phone: '13812345678',
          province: '北京市',
          city: '北京市',
          district: '朝阳区',
          detail: '建国路88号1号楼1501',
          isDefault: true,
        },
      ],
      orders: [],
      favorites: [],
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'SET_USER', user: mockUser });
    return true;
  };

  const register = async (name: string, email: string, password: string): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    // New users default to 'user' role (not admin)
    const mockUser: User = {
      id: `u${Date.now()}`,
      email,
      name,
      role: 'user',
      addresses: [],
      orders: [],
      favorites: [],
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'SET_USER', user: mockUser });
    return true;
  };

  const logout = () => {
    dispatch({ type: 'SET_USER', user: null });
  };

  const createOrder = (address: Address, paymentMethod: 'wechat' | 'alipay' | 'card'): Order => {
    const order: Order = {
      id: `o${Date.now()}`,
      orderNumber: generateOrderNumber(),
      items: state.cart.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        productImage: item.product.images[0],
        price: item.product.price,
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
    return order;
  };

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
        register,
        logout,
        createOrder,
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
