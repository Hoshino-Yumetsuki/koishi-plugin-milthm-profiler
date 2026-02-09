import type { AuthSession } from '../types'

/**
 * 会话管理器
 * 用于管理用户的授权会话
 */
export class SessionManager {
  private sessions: Map<string, AuthSession> = new Map()

  /**
   * 创建新的授权会话
   * @param userId 用户ID
   * @param uuid 授权请求的UUID
   * @param url 授权链接
   * @returns 会话信息
   */
  createSession(userId: string, uuid: string, url: string): AuthSession {
    const session: AuthSession = {
      userId,
      uuid,
      url,
      timestamp: Date.now(),
      status: 'pending'
    }

    this.sessions.set(userId, session)
    return session
  }

  /**
   * 获取用户的会话
   * @param userId 用户ID
   * @returns 会话信息，如果不存在则返回 null
   */
  getSession(userId: string): AuthSession | null {
    return this.sessions.get(userId) || null
  }

  /**
   * 更新会话状态
   * @param userId 用户ID
   * @param status 新状态
   */
  updateSessionStatus(userId: string, status: AuthSession['status']): void {
    const session = this.sessions.get(userId)
    if (session) {
      session.status = status
    }
  }

  /**
   * 删除会话
   * @param userId 用户ID
   */
  removeSession(userId: string): void {
    this.sessions.delete(userId)
  }

  /**
   * 检查会话是否超时
   * @param userId 用户ID
   * @param timeoutMs 超时时间（毫秒）
   * @returns 是否超时
   */
  isSessionTimeout(userId: string, timeoutMs: number): boolean {
    const session = this.sessions.get(userId)
    if (!session) return true

    return Date.now() - session.timestamp > timeoutMs
  }

  /**
   * 清理所有超时的会话
   * @param timeoutMs 超时时间（毫秒）
   */
  cleanupTimeoutSessions(timeoutMs: number): void {
    for (const [userId, session] of this.sessions.entries()) {
      if (Date.now() - session.timestamp > timeoutMs) {
        this.sessions.delete(userId)
      }
    }
  }

  /**
   * 获取所有会话数量
   */
  getSessionCount(): number {
    return this.sessions.size
  }
}
