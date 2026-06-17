/**
 * Global API Error Handler
 * Centralized error handling for API routes
 */

import { NextRequest, NextResponse } from 'next/server';

// Custom error types
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export class ValidationError extends APIError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends APIError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTH_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends APIError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends APIError {
  constructor(resource: string = 'Resource') {
    super(`${resource} does not exist`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends APIError {
  constructor(retryAfter?: number) {
    super('Too many requests, please try again later', 429, 'RATE_LIMIT_EXCEEDED', { retryAfter });
    this.name = 'RateLimitError';
  }
}

// ============================================================================
// Error Handler
// ============================================================================

export interface ErrorHandlerOptions {
  includeStackTrace?: boolean;
  logErrors?: boolean;
}

const DEFAULT_OPTIONS: ErrorHandlerOptions = {
  includeStackTrace: false,
  logErrors: true,
};

/**
 * Handle API errors and return standardized response
 */
export function handleAPIError(
  error: unknown,
  options: ErrorHandlerOptions = DEFAULT_OPTIONS
): NextResponse {
  // Log error in development
  if (options.logErrors) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[API Error]', error instanceof Error ? error.message : 'Unknown error');
    } else {
      // In production, you might want to send to a logging service
      console.error('[API Error]', {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'Unknown',
      });
    }
  }
  
  // Handle known error types
  if (error instanceof APIError) {
    const body: Record<string, unknown> = {
      success: false,
      error: error.message,
      code: error.code,
      timestamp: Date.now(),
    };
    
    // Only include details in non-production or if explicitly allowed
    if (error.details && (options.includeStackTrace || process.env.NODE_ENV !== 'production')) {
      body.details = error.details;
    }
    
    return NextResponse.json(body, {
      status: error.statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
  
  // Handle standard errors
  if (error instanceof Error) {
    // Don't expose internal error messages in production
    const message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message;
    
    const body: Record<string, unknown> = {
      success: false,
      error: message,
      code: 'INTERNAL_ERROR',
      timestamp: Date.now(),
    };
    
    // Include stack trace only in development
    if (options.includeStackTrace && process.env.NODE_ENV !== 'production') {
      body.stack = error.stack;
    }
    
    return NextResponse.json(body, {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
  
  // Handle unknown errors
  return NextResponse.json(
    {
      success: false,
      error: 'An unknown error occurred',
      code: 'UNKNOWN_ERROR',
      timestamp: Date.now(),
    },
    {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Async wrapper for API route handlers
 * Catches errors and passes them to the error handler
 */
export function withErrorHandler<T extends (...args: unknown[]) => Promise<NextResponse>>(
  handler: T,
  options?: ErrorHandlerOptions
): T {
  return (async (...args: Parameters<T>): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleAPIError(error, options) as NextResponse;
    }
  }) as T;
}

// ============================================================================
// Request Validation Helpers
// ============================================================================

/**
 * Parse and validate JSON body
 */
export async function parseJSONBody<T>(
  request: NextRequest,
  maxSize: number = 10 * 1024
): Promise<T | null> {
  // Check content type
  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    throw new ValidationError('Content-Type must be application/json');
  }
  
  // Check size
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > maxSize) {
      throw new ValidationError(`Request body too large, maximum allowed ${maxSize} bytes`);
    }
  }
  
  try {
    const body = await request.json();
    
    // Prevent prototype pollution
    if (typeof body === 'object' && body !== null) {
      const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
      for (const key of dangerousKeys) {
        if (key in body) {
          throw new ValidationError('Request data contains illegal fields');
        }
      }
    }
    
    return body as T;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Invalid JSON data');
  }
}

/**
 * Get query parameters as typed object
 */
export function getQueryParams(request: NextRequest): URLSearchParams {
  return request.nextUrl.searchParams;
}

// ============================================================================
// Success Response Helpers
// ============================================================================

/**
 * Create paginated response
 */
export function paginatedResponse<T>(
  items: T[],
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }
): NextResponse {
  return NextResponse.json({
    success: true,
    data: items,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: pagination.totalPages,
      hasMore: pagination.page < pagination.totalPages,
    },
    timestamp: Date.now(),
  });
}

/**
 * Create success response with message
 */
export function successResponse<T>(
  data: T,
  message?: string
): NextResponse {
  return NextResponse.json({
    success: true,
    data,
    ...(message && { message }),
    timestamp: Date.now(),
  });
}

/**
 * Create created response (201)
 */
export function createdResponse<T>(
  data: T,
  message: string = 'Created successfully'
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      data,
      message,
      timestamp: Date.now(),
    },
    { status: 201 }
  );
}

/**
 * Create no content response (204)
 */
export function noContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

// ============================================================================
// Exports
// ============================================================================

export const errorHandler = {
  APIError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  handleAPIError,
  withErrorHandler,
  parseJSONBody,
  getQueryParams,
  paginatedResponse,
  successResponse,
  createdResponse,
  noContentResponse,
};

export default errorHandler;
