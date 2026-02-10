import type { Context, Logger } from 'koishi'
import type Config from './config'
import { NyaProfilerClient } from './api/nya-profiler'
import { MilthmOIDCClient } from './api/milthm-oidc'
import { SessionManager } from './utils/session'
import { setB20AssetsPath } from './renderer/image'

let mainLogger: Logger | null = null

const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    if (meta) {
      mainLogger?.debug(message, meta)
    } else {
      mainLogger?.debug(message)
    }
  },
  info(message: string, meta?: Record<string, unknown>) {
    if (meta) {
      mainLogger?.info(message, meta)
    } else {
      mainLogger?.info(message)
    }
  },
  warn(message: string, meta?: Record<string, unknown>) {
    if (meta) {
      mainLogger?.warn(message, meta)
    } else {
      mainLogger?.warn(message)
    }
  },
  error(message: string, meta?: Record<string, unknown>) {
    if (meta) {
      mainLogger?.error(message, meta)
    } else {
      mainLogger?.error(message)
    }
  }
}

export function setMainLogger(newLogger: Logger) {
  mainLogger = newLogger
}

// 全局实例
let nyaProfilerClient: NyaProfilerClient | null = null
let milthmOIDCClient: MilthmOIDCClient | null = null
let sessionManager: SessionManager | null = null

export async function initClients(ctx: Context, config: Config) {
  logger.info('初始化 API 客户端')

  const clientLogger = ctx.logger('milthm-profiler:client')

  nyaProfilerClient = new NyaProfilerClient(
    config.nyaProfiler.clientId,
    config.nyaProfiler.secret,
    clientLogger
  )

  milthmOIDCClient = new MilthmOIDCClient(
    config.milthm.clientId,
    config.milthm.secret,
    clientLogger
  )

  sessionManager = new SessionManager()

  // 初始化图片渲染器
  setB20AssetsPath(__dirname)

  logger.info('API 客户端初始化完成')
}

export async function generateAuthUrlForUser(
  userId: string
): Promise<{ url: string; uuid: string }> {
  if (!nyaProfilerClient) {
    throw new Error('API 客户端未初始化')
  }

  if (!sessionManager) {
    throw new Error('会话管理器未初始化')
  }

  // 检查是否已有进行中的会话
  const existingSession = sessionManager.getSession(userId)
  if (existingSession && existingSession.status === 'pending') {
    logger.warn(`用户 ${userId} 已有进行中的授权会话`)
    return {
      url: existingSession.url,
      uuid: existingSession.uuid
    }
  }

  // 生成新的授权链接
  const { url, uuid } = await nyaProfilerClient.generateAuthUrl()

  // 创建会话
  sessionManager.createSession(userId, uuid, url)

  logger.info(`为用户 ${userId} 生成授权链接`, { uuid })

  return { url, uuid }
}

/**
 * 等待用户完成授权并获取数据
 */
export async function waitForAuthAndFetchData(
  userId: string,
  config: Config
): Promise<any> {
  if (!nyaProfilerClient || !milthmOIDCClient || !sessionManager) {
    throw new Error('API 客户端未初始化')
  }

  const session = sessionManager.getSession(userId)
  if (!session) {
    throw new Error('找不到用户的授权会话')
  }

  logger.info(`开始等待用户 ${userId} 完成授权`)

  try {
    // 轮询获取授权码
    const authCode = await nyaProfilerClient.pollAuthCode(
      session.uuid,
      config.pollTimeout,
      config.pollInterval
    )

    logger.info(`用户 ${userId} 已完成授权，获取到 auth code`)

    // 更新会话状态
    sessionManager.updateSessionStatus(userId, 'authorized')

    // 使用授权码换取访问令牌
    const tokenResponse = await milthmOIDCClient.exchangeToken(authCode)

    logger.info(`成功为用户 ${userId} 获取访问令牌`)

    // 验证 token 是否有效
    const tokenVerification = await milthmOIDCClient.verifyToken(
      tokenResponse.access_token
    )

    if (!tokenVerification.isValid) {
      logger.error(`Token 验证失败`, {
        userId,
        error: tokenVerification.error
      })
      throw new Error(`Token 已过期或无效: ${tokenVerification.error}`)
    }

    logger.info(`Token 验证成功`, { userId })

    // 获取用户信息（使用验证返回的信息，避免重复请求）
    const userInfo =
      tokenVerification.userInfo ||
      (await milthmOIDCClient.getUserInfo(tokenResponse.access_token))

    logger.info(`成功获取用户 ${userId} 的信息`)

    // 获取存档数据
    const saveDataInfo = await milthmOIDCClient.getUserSaveData(
      tokenResponse.access_token
    )

    logger.info(`成功获取用户 ${userId} 的存档数据`, {
      fileUrl: saveDataInfo.fileUrl
    })

    // 下载存档文件内容
    const saveContent = await milthmOIDCClient.downloadSaveFile(
      saveDataInfo.fileUrl
    )

    logger.info(`成功下载用户 ${userId} 的存档文件`, {
      contentLength: saveContent.length,
      preview: saveContent.substring(0, 500)
    })

    // 清理会话
    sessionManager.removeSession(userId)

    return {
      userInfo,
      saveData: {
        fileUrl: saveDataInfo.fileUrl,
        content: saveContent,
        rawData: saveDataInfo.rawData
      },
      tokenResponse
    }
  } catch (error) {
    logger.error(`用户 ${userId} 授权流程失败`, { error })

    // 根据错误类型设置不同的状态
    if (error.message?.includes('授权超时')) {
      sessionManager.updateSessionStatus(userId, 'timeout')
    } else {
      sessionManager.updateSessionStatus(userId, 'failed')
    }

    throw error
  }
}

/**
 * 取消用户的授权会话
 */
export function cancelAuthSession(userId: string): boolean {
  if (!sessionManager) {
    return false
  }

  const session = sessionManager.getSession(userId)
  if (session) {
    sessionManager.removeSession(userId)
    logger.info(`已取消用户 ${userId} 的授权会话`)
    return true
  }

  return false
}

/**
 * 获取用户的会话状态
 */
export function getSessionStatus(userId: string) {
  if (!sessionManager) {
    return null
  }

  return sessionManager.getSession(userId)
}

// 导出图片生成功能和数据处理
export { generateB20Image, setB20AssetsPath } from './renderer/image'
export type { B20UserInfo } from './renderer/image'
export { processSaveData } from './utils/processor'
export * from './utils/calculator'
