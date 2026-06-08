/**
 * Security Event Logger - 安全事件日志系统
 * Layer 4: Monitoring & Incident Response
 */

export type SecurityEventType =
  | 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGOUT'
  | 'REGISTER_SUCCESS' | 'REGISTER_FAILURE'
  | 'PASSWORD_CHANGE' | 'SESSION_EXPIRED'
  | 'ORDER_CREATED' | 'ORDER_MODIFIED' | 'ORDER_CANCELLED' | 'ORDER_FAILED'
  | 'PAYMENT_ATTEMPT' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILURE'
  | 'RATE_LIMIT_EXCEEDED' | 'IP_BLOCKED' | 'WAF_BLOCKED'
  | 'CSRF_VIOLATION' | 'PRIVILEGE_ESCALATION_ATTEMPT'
  | 'SQL_INJECTION_ATTEMPT' | 'XSS_ATTEMPT' | 'FILE_UPLOAD_ATTEMPT'
  | 'DDOS_DETECTED' | 'BRUTE_FORCE_DETECTED'
  | 'PRICE_TAMPERING_ATTEMPT' | 'INVALID_SESSION'
  | 'HORIZONTAL_PRIVILEGE_ATTEMPT' | 'VERTICAL_PRIVILEGE_ATTEMPT'
  | 'INPUT_VALIDATION_FAILURE' | 'BUSINESS_LOGIC_VIOLATION';

export type SeverityLevel = 'info' | 'warning' | 'error' | 'critical';

interface SecurityEvent {
  timestamp: string;
  eventType: SecurityEventType;
  severity: SeverityLevel;
  userId?: string;
  ip?: string;
  userAgent?: string;
  path?: string;
  method?: string;
  details: string;
  metadata?: Record<string, unknown>;
}

// Severity mapping
const EVENT_SEVERITY: Record<SecurityEventType, SeverityLevel> = {
  LOGIN_SUCCESS: 'info',
  LOGIN_FAILURE: 'warning',
  LOGOUT: 'info',
  REGISTER_SUCCESS: 'info',
  REGISTER_FAILURE: 'warning',
  PASSWORD_CHANGE: 'info',
  SESSION_EXPIRED: 'warning',
  ORDER_CREATED: 'info',
  ORDER_MODIFIED: 'info',
  ORDER_CANCELLED: 'info',
  ORDER_FAILED: 'error',
  PAYMENT_ATTEMPT: 'info',
  PAYMENT_SUCCESS: 'info',
  PAYMENT_FAILURE: 'warning',
  RATE_LIMIT_EXCEEDED: 'warning',
  IP_BLOCKED: 'error',
  WAF_BLOCKED: 'error',
  CSRF_VIOLATION: 'error',
  PRIVILEGE_ESCALATION_ATTEMPT: 'critical',
  SQL_INJECTION_ATTEMPT: 'critical',
  XSS_ATTEMPT: 'error',
  FILE_UPLOAD_ATTEMPT: 'warning',
  DDOS_DETECTED: 'critical',
  BRUTE_FORCE_DETECTED: 'error',
  PRICE_TAMPERING_ATTEMPT: 'critical',
  INVALID_SESSION: 'warning',
  HORIZONTAL_PRIVILEGE_ATTEMPT: 'critical',
  VERTICAL_PRIVILEGE_ATTEMPT: 'critical',
  INPUT_VALIDATION_FAILURE: 'warning',
  BUSINESS_LOGIC_VIOLATION: 'error',
};

// Alert thresholds
const ALERT_THRESHOLDS = {
  LOGIN_FAILURE: { count: 5, windowMs: 60000 },      // 5 failures per minute
  RATE_LIMIT_EXCEEDED: { count: 10, windowMs: 60000 }, // 10 per minute
  WAF_BLOCKED: { count: 3, windowMs: 60000 },           // 3 per minute
  PRICE_TAMPERING_ATTEMPT: { count: 1, windowMs: 0 },   // Any = alert
  PRIVILEGE_ESCALATION_ATTEMPT: { count: 1, windowMs: 0 },
  SQL_INJECTION_ATTEMPT: { count: 1, windowMs: 0 },
  DDOS_DETECTED: { count: 1, windowMs: 0 },
};

class SecurityLogger {
  private events: SecurityEvent[] = [];
  private maxEvents: number = 1000;
  private alertCounts: Record<string, { count: number; windowStart: number }> = {};

  log(
    eventType: SecurityEventType,
    details: string,
    metadata?: Record<string, unknown>
  ): void {
    const event: SecurityEvent = {
      timestamp: new Date().toISOString(),
      eventType,
      severity: EVENT_SEVERITY[eventType],
      details,
      metadata,
    };

    this.events.push(event);

    // Trim old events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Persist to localStorage (non-sensitive summary only)
    try {
      const summary = this.events.slice(-100).map(e => ({
        t: e.timestamp,
        type: e.eventType,
        sev: e.severity,
        msg: e.details,
      }));
      localStorage.setItem('security_log', JSON.stringify(summary));
    } catch {
      // Storage full or unavailable - fail silently
    }

    // Check alert thresholds
    this.checkAlert(eventType);
  }

  private checkAlert(eventType: SecurityEventType): void {
    const threshold = (ALERT_THRESHOLDS as Record<string, { count: number; windowMs: number }>)[eventType];
    if (!threshold) return;

    const now = Date.now();
    if (!this.alertCounts[eventType]) {
      this.alertCounts[eventType] = { count: 0, windowStart: now };
    }

    const entry = this.alertCounts[eventType];
    if (now - entry.windowStart > (threshold.windowMs || 60000)) {
      entry.count = 0;
      entry.windowStart = now;
    }

    entry.count++;

    if (entry.count >= threshold.count) {
      console.error(`[SECURITY ALERT] ${eventType} threshold reached: ${entry.count} occurrences`);
      // In production: send to monitoring service, email admin, etc.
    }
  }

  getEvents(filter?: { eventType?: SecurityEventType; severity?: SeverityLevel; limit?: number }): SecurityEvent[] {
    let filtered = [...this.events];
    if (filter?.eventType) {
      filtered = filtered.filter(e => e.eventType === filter.eventType);
    }
    if (filter?.severity) {
      filtered = filtered.filter(e => e.severity === filter.severity);
    }
    if (filter?.limit) {
      filtered = filtered.slice(-filter.limit);
    }
    return filtered;
  }

  getCriticalEvents(): SecurityEvent[] {
    return this.getEvents({ severity: 'critical' });
  }

  getRecentEvents(limit: number = 50): SecurityEvent[] {
    return this.getEvents({ limit });
  }

  clear(): void {
    this.events = [];
    this.alertCounts = {};
    try {
      localStorage.removeItem('security_log');
    } catch {
      // fail silently
    }
  }
}

// Singleton instance
export const securityLogger = new SecurityLogger();
export default securityLogger;
