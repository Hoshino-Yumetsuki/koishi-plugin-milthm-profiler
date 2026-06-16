import type { AuthSession } from '../types';

export class SessionManager {
  private sessions: Map<string, AuthSession> = new Map();

  createSession(userId: string, uuid: string, url: string): AuthSession {
    const session: AuthSession = {
      userId,
      uuid,
      url,
      timestamp: Date.now(),
      status: 'pending'
    };

    this.sessions.set(userId, session);
    return session;
  }

  getSession(userId: string): AuthSession | null {
    return this.sessions.get(userId) || null;
  }

  updateSessionStatus(userId: string, status: AuthSession['status']): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.status = status;
    }
  }

  removeSession(userId: string): void {
    this.sessions.delete(userId);
  }

  isSessionTimeout(userId: string, timeoutMs: number): boolean {
    const session = this.sessions.get(userId);
    if (!session) return true;

    return Date.now() - session.timestamp > timeoutMs;
  }

  cleanupTimeoutSessions(timeoutMs: number): void {
    for (const [userId, session] of this.sessions.entries()) {
      if (Date.now() - session.timestamp > timeoutMs) {
        this.sessions.delete(userId);
      }
    }
  }

  getSessionCount(): number {
    return this.sessions.size;
  }
}
