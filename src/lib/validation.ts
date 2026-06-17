/**
 * Input Validation Schemas
 * Zod-based validation for all user inputs
 */

import { z } from 'zod';
import {
  validateEmail,
  validatePhone,
  sanitizeInput,
} from './security';

function containsSQLInjection(input: string): boolean {
  const sqlPatterns = /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bALTER\b|\bEXEC\b|OR\s+1\s*=\s*1|'\s*OR\s|SLEEP\s*\(|BENCHMARK\s*\(|LOAD_FILE|INTO\s+OUTFILE|INFORMATION_SCHEMA)/i;
  return sqlPatterns.test(input);
}

function containsCommandInjection(input: string): boolean {
  const cmdPatterns = /(;|\||`|\$\(|\.\.\/|\.\.\\|\/etc\/passwd|\/bin\/(sh|bash)|\b(wget|curl|nc|ncat|python|perl)\b)/i;
  return cmdPatterns.test(input);
}

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Custom Zod validators
 */
const noSQLInjection = z.string().refine(
  (val) => !containsSQLInjection(val),
  { message: 'Input contains illegal characters' }
);

const noCommandInjection = z.string().refine(
  (val) => !containsCommandInjection(val),
  { message: 'Input contains illegal characters' }
);

// ============================================================================
// User Authentication Schemas
// ============================================================================

/**
 * Login validation schema
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .max(255, 'Email must not exceed 255 characters')
    .email('Please enter a valid email address')
    .transform((val) => val.toLowerCase().trim()),
  
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password must not exceed 128 characters'),
    
  // CSRF token
  csrfToken: z
    .string()
    .optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Registration validation schema
 */
export const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .max(255, 'Email must not exceed 255 characters')
    .email('Please enter a valid email address')
    .transform((val) => val.toLowerCase().trim()),
  
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/,
      'Password must contain uppercase, lowercase, numbers and special characters'
    ),
  
  confirmPassword: z
    .string()
    .min(1, 'Please confirm your password'),
  
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must not exceed 50 characters')
    .transform((val) => val.trim()),
  
  phone: z
    .string()
    .optional()
    .refine(
      (val) => !val || validatePhone(val),
      { message: 'Please enter a valid phone number' }
    ),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Password change schema
 */
export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Please enter your current password'),
  
  newPassword: z
    .string()
    .min(12, 'New password must be at least 12 characters')
    .max(128, 'New password must not exceed 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/,
      'Password must contain uppercase, lowercase, numbers and special characters'
    ),
  
  confirmPassword: z
    .string()
    .min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: 'New password cannot be the same as current password',
  path: ['newPassword'],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ============================================================================
// Address Schemas
// ============================================================================

/**
 * Address validation schema
 */
export const addressSchema = z.object({
  id: z.string().optional(),
  
  name: z
    .string()
    .min(2, 'Recipient name must be at least 2 characters')
    .max(50, 'Recipient name must not exceed 50 characters')
    .transform((val) => val.trim()),
  
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .refine((val) => validatePhone(val), {
      message: 'Please enter a valid phone number',
    }),
  
  province: z
    .string()
    .min(1, 'Please select a province')
    .max(20, 'Province must not exceed 20 characters')
    .transform((val) => val.trim()),
  
  city: z
    .string()
    .min(1, 'Please select a city')
    .max(20, 'City must not exceed 20 characters')
    .transform((val) => val.trim()),
  
  district: z
    .string()
    .min(1, 'Please select a district')
    .max(20, 'District must not exceed 20 characters')
    .transform((val) => val.trim()),
  
  detail: z
    .string()
    .min(5, 'Address must be at least 5 characters')
    .max(200, 'Address must not exceed 200 characters')
    .transform((val) => val.trim()),
  
  isDefault: z.boolean().default(false),
  
  postalCode: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^\d{6}$/.test(val),
      { message: 'Please enter a valid 6-digit postal code' }
    ),
});

export type AddressInput = z.infer<typeof addressSchema>;

// ============================================================================
// Search and Filter Schemas
// ============================================================================

/**
 * Product search validation schema
 */
export const searchSchema = z.object({
  q: z
    .string()
    .max(100, 'Search keyword must not exceed 100 characters')
    .transform((val) => val.trim())
    .optional()
    .or(z.literal('')),
  
  category: z
    .enum(['kitchen', 'folding', 'collection', 'hunting', 'damascus', ''])
    .optional()
    .default(''),
  
  minPrice: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .refine((val) => !val || val >= 0, { message: 'Price cannot be negative' }),
  
  maxPrice: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .refine((val) => !val || val >= 0, { message: 'Price cannot be negative' }),
  
  brand: z
    .string()
    .max(50, 'Brand name must not exceed 50 characters')
    .optional(),
  
  sort: z
    .enum(['price_asc', 'price_desc', 'newest', 'popular', ''])
    .optional()
    .default(''),
  
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 1, { message: 'Page number must be greater than 0' }),
  
  limit: z
    .string()
    .optional()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 1 && val <= 100, { message: 'Items per page must be between 1-100' }),
});

export type SearchInput = z.infer<typeof searchSchema>;

// ============================================================================
// Checkout Schemas
// ============================================================================

/**
 * Checkout validation schema
 */
export const checkoutSchema = z.object({
  addressId: z
    .string()
    .min(1, 'Please select a shipping address'),
  
  paymentMethod: z
    .enum(['wechat', 'alipay', 'card', 'bank_transfer']),
  
  remark: z
    .string()
    .max(500, 'Remark must not exceed 500 characters')
    .transform((val) => val.trim())
    .optional()
    .or(z.literal('')),
  
  couponCode: z
    .string()
    .max(50, 'Coupon code must not exceed 50 characters')
    .optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ============================================================================
// API Request Schemas
// ============================================================================

/**
 * Generic ID parameter schema
 */
export const idParamSchema = z.object({
  id: z
    .string()
    .min(1, 'ID is required')
    .max(50, 'Invalid ID format')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid ID format'),
});

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 1, { message: 'Page number must be greater than 0' }),
  
  limit: z
    .string()
    .optional()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 1 && val <= 100, { message: 'Items per page must be between 1-100' }),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// ============================================================================
// Validation Helper
// ============================================================================

/**
 * Validate data against schema with error handling
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): {
  success: boolean;
  data?: T;
  errors?: Array<{ field: string; message: string }>;
} {
  try {
    const result = schema.safeParse(data);
    
    if (result.success) {
      return { success: true, data: result.data };
    }
    
    const errors = result.error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }));
    
    return { success: false, errors };
  } catch (error) {
    // Only log error type/message, not raw error object which may contain input data
    console.error('Validation error:', error instanceof Error ? error.message : 'Unknown validation error');
    return {
      success: false,
      errors: [{ field: 'unknown', message: 'Validation process error' }],
    };
  }
}

// ============================================================================
// Validation Exports
// ============================================================================

export const validationSchemas = {
  login: loginSchema,
  register: registerSchema,
  changePassword: changePasswordSchema,
  address: addressSchema,
  search: searchSchema,
  checkout: checkoutSchema,
  idParam: idParamSchema,
  pagination: paginationSchema,
};

export default validationSchemas;
