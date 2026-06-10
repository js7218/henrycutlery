/**
 * User Data Management API
 * GDPR/Privacy compliance - Users can view and request deletion of their data
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJWT } from '@/lib/auth';
import { safeUserDisplay, removeL1Fields, maskL2Fields } from '@/lib/masking';
import { logSecurityEvent } from '@/lib/sanitizedLogger';
import { findUnsafeUrl } from '@/lib/ssrfProtection';

// Mock user database
const mockUsers = new Map<string, {
  id: string;
  email: string;
  name: string;
  phone: string;
  passwordHash: string;
  addresses: Array<{
    id: string;
    name: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    detail: string;
  }>;
  orders: Array<{
    id: string;
    total: number;
    status: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}>();

/**
 * GET /api/user/data
 * Get user's own data (for GDPR compliance)
 */
export async function GET(request: NextRequest) {
  try {
    // Get token from cookie or header
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value ||
                  request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      );
    }

    // Verify token
    const payload = verifyJWT(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: '认证已过期，请重新登录' },
        { status: 401 }
      );
    }

    // Get user from database (mock)
    const user = mockUsers.get(payload.userId);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      );
    }

    // Check if user is deleted
    if (user.deletedAt) {
      return NextResponse.json(
        { success: false, error: '用户已被删除' },
        { status: 404 }
      );
    }

    // Build user data response (masked for display)
    const userData = {
      // Basic info - masked
      id: user.id,
      name: user.name ? maskL2Fields({ name: user.name }).name : null,
      email: user.email ? maskL2Fields({ email: user.email }).email : null,
      phone: user.phone ? maskL2Fields({ phone: user.phone }).phone : null,
      
      // Addresses - masked
      addresses: user.addresses.map(addr => ({
        id: addr.id,
        name: addr.name ? maskL2Fields({ name: addr.name }).name : null,
        phone: addr.phone ? maskL2Fields({ phone: addr.phone }).phone : null,
        fullAddress: `${addr.province}${addr.city}${addr.district}${addr.detail.substring(0, 5)}***`,
      })),
      
      // Order summary - minimal data
      orderCount: user.orders.length,
      recentOrders: user.orders.slice(-5).map(order => ({
        id: order.id,
        total: order.total,
        status: order.status,
        date: order.createdAt,
      })),
      
      // Account info
      memberSince: user.createdAt,
      lastUpdated: user.updatedAt,
    };

    // Log access
    logSecurityEvent({
      type: 'USER_DATA_ACCESSED',
      severity: 'medium',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userId: payload.userId,
      path: '/api/user/data',
      details: {
        action: 'view_own_data',
      },
    });

    return NextResponse.json({
      success: true,
      data: userData,
      message: '数据获取成功',
    });

  } catch (error) {
    console.error('Error fetching user data:', error);
    return NextResponse.json(
      { success: false, error: '获取数据失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/user/data
 * Request account deletion (soft delete for GDPR compliance)
 */
export async function DELETE(request: NextRequest) {
  try {
    let requestBody: unknown = null;
    try {
      requestBody = await request.clone().json();
    } catch {
      requestBody = null;
    }

    const unsafeUrl = findUnsafeUrl(requestBody);
    if (unsafeUrl) {
      return NextResponse.json(
        { success: false, error: 'Unsafe URL rejected', code: 'SSRF_BLOCKED' },
        { status: 400 }
      );
    }

    // Get token
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value ||
                  request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      );
    }

    // Verify token
    const payload = verifyJWT(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: '认证已过期，请重新登录' },
        { status: 401 }
      );
    }

    // Get user
    const user = mockUsers.get(payload.userId);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户不存在' },
        { status: 404 }
      );
    }

    // Check if already deleted
    if (user.deletedAt) {
      return NextResponse.json(
        { success: false, error: '账户已申请删除' },
        { status: 400 }
      );
    }

    // Soft delete - mark for deletion
    // Data will be permanently deleted after 30 days
    user.deletedAt = new Date().toISOString();
    user.updatedAt = new Date().toISOString();

    // Log deletion request
    logSecurityEvent({
      type: 'USER_DATA_DELETION_REQUESTED',
      severity: 'high',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userId: payload.userId,
      path: '/api/user/data',
      details: {
        action: 'soft_delete_requested',
        scheduledPermanentDeletion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: '删除请求已提交，账户将在30天后永久删除',
      data: {
        deletedAt: user.deletedAt,
        permanentDeletionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

  } catch (error) {
    console.error('Error deleting user data:', error);
    return NextResponse.json(
      { success: false, error: '删除请求失败' },
      { status: 500 }
    );
  }
}
