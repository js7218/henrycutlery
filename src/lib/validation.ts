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
  { message: '输入包含非法字符' }
);

const noCommandInjection = z.string().refine(
  (val) => !containsCommandInjection(val),
  { message: '输入包含非法字符' }
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
    .min(1, '邮箱不能为空')
    .max(255, '邮箱长度不能超过255个字符')
    .email('请输入有效的邮箱地址')
    .transform((val) => val.toLowerCase().trim()),
  
  password: z
    .string()
    .min(1, '密码不能为空')
    .max(128, '密码长度不能超过128个字符'),
    
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
    .min(1, '邮箱不能为空')
    .max(255, '邮箱长度不能超过255个字符')
    .email('请输入有效的邮箱地址')
    .transform((val) => val.toLowerCase().trim()),
  
  password: z
    .string()
    .min(8, '密码至少8个字符')
    .max(128, '密码长度不能超过128个字符')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/,
      '密码必须包含大小写字母、数字和特殊字符'
    ),
  
  confirmPassword: z
    .string()
    .min(1, '请确认密码'),
  
  name: z
    .string()
    .min(2, '姓名至少2个字符')
    .max(50, '姓名不能超过50个字符')
    .transform((val) => val.trim()),
  
  phone: z
    .string()
    .optional()
    .refine(
      (val) => !val || validatePhone(val),
      { message: '请输入有效的手机号码' }
    ),
}).refine((data) => data.password === data.confirmPassword, {
  message: '两次输入的密码不一致',
  path: ['confirmPassword'],
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Password change schema
 */
export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, '请输入当前密码'),
  
  newPassword: z
    .string()
    .min(8, '新密码至少8个字符')
    .max(128, '新密码不能超过128个字符')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/,
      '密码必须包含大小写字母、数字和特殊字符'
    ),
  
  confirmPassword: z
    .string()
    .min(1, '请确认新密码'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: '两次输入的密码不一致',
  path: ['confirmPassword'],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: '新密码不能与当前密码相同',
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
    .min(2, '收货人姓名至少2个字符')
    .max(50, '收货人姓名不能超过50个字符')
    .transform((val) => val.trim()),
  
  phone: z
    .string()
    .min(1, '手机号码不能为空')
    .refine((val) => validatePhone(val), {
      message: '请输入有效的手机号码',
    }),
  
  province: z
    .string()
    .min(1, '请选择省份')
    .max(20, '省份名称不能超过20个字符')
    .transform((val) => val.trim()),
  
  city: z
    .string()
    .min(1, '请选择城市')
    .max(20, '城市名称不能超过20个字符')
    .transform((val) => val.trim()),
  
  district: z
    .string()
    .min(1, '请选择区县')
    .max(20, '区县名称不能超过20个字符')
    .transform((val) => val.trim()),
  
  detail: z
    .string()
    .min(5, '详细地址至少5个字符')
    .max(200, '详细地址不能超过200个字符')
    .transform((val) => val.trim()),
  
  isDefault: z.boolean().default(false),
  
  postalCode: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^\d{6}$/.test(val),
      { message: '请输入有效的6位邮政编码' }
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
    .max(100, '搜索关键词不能超过100个字符')
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
    .refine((val) => !val || val >= 0, { message: '价格不能为负数' }),
  
  maxPrice: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .refine((val) => !val || val >= 0, { message: '价格不能为负数' }),
  
  brand: z
    .string()
    .max(50, '品牌名称不能超过50个字符')
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
    .refine((val) => val >= 1, { message: '页码必须大于0' }),
  
  limit: z
    .string()
    .optional()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 1 && val <= 100, { message: '每页数量必须在1-100之间' }),
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
    .min(1, '请选择收货地址'),
  
  paymentMethod: z
    .enum(['wechat', 'alipay', 'card', 'bank_transfer']),
  
  remark: z
    .string()
    .max(500, '备注不能超过500个字符')
    .transform((val) => val.trim())
    .optional()
    .or(z.literal('')),
  
  couponCode: z
    .string()
    .max(50, '优惠券码不能超过50个字符')
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
    .min(1, 'ID不能为空')
    .max(50, 'ID格式不正确')
    .regex(/^[a-zA-Z0-9_-]+$/, 'ID格式不正确'),
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
    .refine((val) => val >= 1, { message: '页码必须大于0' }),
  
  limit: z
    .string()
    .optional()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 1 && val <= 100, { message: '每页数量必须在1-100之间' }),
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
    console.error('Validation error:', error);
    return {
      success: false,
      errors: [{ field: 'unknown', message: '验证过程出错' }],
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
