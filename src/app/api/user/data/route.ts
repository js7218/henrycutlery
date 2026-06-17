import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { ensureDatabaseSchema, getPool, getUserAddresses, getUserOrders } from '@/lib/db';
import { maskL2Fields } from '@/lib/masking';
import { logSecurityEvent } from '@/lib/sanitizedLogger';
import { findUnsafeUrl } from '@/lib/ssrfProtection';

/**
 * GET /api/user/data
 * Get user's own data (for GDPR compliance)
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Please log in first.' },
        { status: 401 }
      );
    }

    await ensureDatabaseSchema();
    const userResult = await getPool().query(
      `SELECT id, email, name, phone, created_at, updated_at
         FROM users
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [authUser.id]
    );
    const user = userResult.rows[0];
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User does not exist.' },
        { status: 404 }
      );
    }

    const [addresses, orders] = await Promise.all([
      getUserAddresses(authUser.id),
      getUserOrders(authUser.id),
    ]);

    const userData = {
      id: user.id,
      name: user.name ? maskL2Fields({ name: user.name }).name : null,
      email: user.email ? maskL2Fields({ email: user.email }).email : null,
      phone: user.phone ? maskL2Fields({ phone: user.phone }).phone : null,
      addresses: addresses.map(addr => ({
        id: addr.id,
        name: addr.name ? maskL2Fields({ name: addr.name }).name : null,
        phone: addr.phone ? maskL2Fields({ phone: addr.phone }).phone : null,
        fullAddress: `${addr.province}${addr.city}${addr.district}${addr.detail.substring(0, 5)}***`,
      })),
      orderCount: orders.length,
      recentOrders: orders.slice(0, 5).map(order => ({
        id: order.id,
        total: order.totalAmount,
        status: order.status,
        date: order.createdAt,
      })),
      memberSince: user.created_at?.toISOString?.() || new Date().toISOString(),
      lastUpdated: user.updated_at?.toISOString?.() || new Date().toISOString(),
    };

    logSecurityEvent({
      type: 'USER_DATA_ACCESSED',
      severity: 'medium',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userId: authUser.id,
      path: '/api/user/data',
      details: {
        action: 'view_own_data',
      },
    });

    return NextResponse.json({
      success: true,
      data: userData,
      message: 'Data retrieved successfully.',
    });

  } catch (error) {
    console.error('Error fetching user data:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve data.' },
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

    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Please log in first.' },
        { status: 401 }
      );
    }

    await ensureDatabaseSchema();
    const result = await getPool().query(
      `UPDATE users
          SET deleted_at = COALESCE(deleted_at, NOW()),
              updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING deleted_at`,
      [authUser.id]
    );

    const user = result.rows[0];
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User does not exist or account deletion has already been requested.' },
        { status: 400 }
      );
    }

    logSecurityEvent({
      type: 'USER_DATA_DELETION_REQUESTED',
      severity: 'high',
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userId: authUser.id,
      path: '/api/user/data',
      details: {
        action: 'soft_delete_requested',
        scheduledPermanentDeletion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Deletion request submitted. Account will be permanently deleted after 30 days.',
      data: {
        deletedAt: user.deleted_at?.toISOString?.() || new Date().toISOString(),
        permanentDeletionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

  } catch (error) {
    console.error('Error deleting user data:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { success: false, error: 'Deletion request failed.' },
      { status: 500 }
    );
  }
}
