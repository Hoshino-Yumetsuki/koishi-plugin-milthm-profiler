import { type Context, Logger, h } from 'koishi'
import type Config from './config'
import { createLogger, setLoggerLevel } from './utils/logger'
import { MilthmApiError } from './api/milthm-oidc'
import {
  initClients,
  generateAuthUrlForUser,
  waitForAuthAndSaveData,
  refreshAndUpdateSaveData,
  cancelAuthSession,
  logoutUser,
  setMainLogger,
  processSaveData,
  generateB20Image,
  getLocalSaveRecord,
  getLocalCredentials
} from './core'

export let logger: Logger

export const name = 'milthm-profiler'

export function apply(ctx: Context, config: Config) {
  logger = createLogger(ctx)
  setupLogger(config)

  setMainLogger(logger)

  // 初始化 API 客户端
  ctx.on('ready', async () => {
    initClients(ctx, config)
    logger.info('Milthm Profiler 插件已就绪')
  })

  // 主命令：查分（使用本地存档）
  ctx
    .command('milthm', 'Milthm 查分器')
    .alias('mlt')
    .action(async ({ session }) => {
      const userId = session.userId

      try {
        // 加载本地存档
        const saveRecord = getLocalSaveRecord(userId)
        if (!saveRecord) {
          return '未找到本地存档，请先使用 milthm.update 命令拉取存档'
        }

        logger.info('开始处理本地存档数据', { userId })

        // 处理存档数据，计算 B20
        const b20Result = processSaveData(ctx, saveRecord.content)

        if (b20Result.best20.length === 0) {
          return '未找到有效的成绩数据'
        }

        // 生成图片
        logger.info('开始生成查分图片', { userId })

        // 提取用户信息传给图片生成器
        const b20UserInfo = {
          username:
            saveRecord.userInfo?.nickname ||
            saveRecord.userInfo?.preferred_username ||
            saveRecord.userInfo?.name ||
            '',
          nickname: saveRecord.userInfo?.nickname || '',
          userId: saveRecord.userInfo?.sub || ''
        }

        const imageBuffer = await generateB20Image(ctx, b20Result, b20UserInfo)

        const savedDate = new Date(saveRecord.savedAt).toLocaleString('zh-CN')
        await session.send(h.image(imageBuffer, 'image/png'))
        return `存档时间：${savedDate}（使用 milthm.update 可拉取最新存档）`
      } catch (error) {
        logger.error('查分失败', { error, userId })
        return `查分失败: ${error instanceof Error ? error.message : String(error)}`
      }
    })

  // 子命令：拉取最新存档
  ctx
    .command('milthm.update', '拉取最新存档')
    .alias('mlt.update')
    .action(async ({ session }) => {
      const userId = session.userId

      try {
        // 尝试使用已保存的 refresh_token
        const credentials = getLocalCredentials(userId)
        if (credentials?.refreshToken) {
          try {
            const result = await refreshAndUpdateSaveData(userId)
            const savedDate = new Date(result.savedAt).toLocaleString('zh-CN')
            const username =
              result.userInfo?.preferred_username ||
              result.userInfo?.name ||
              result.userInfo?.nickname ||
              ''
            return `存档拉取成功！用户：${username}，更新时间：${savedDate}`
          } catch (refreshError) {
            if (
              refreshError instanceof MilthmApiError &&
              (refreshError.status === 418 ||
                refreshError.apiCode === 'GameSaveDownloadLimitExceededError')
            ) {
              logger.info('用户存档下载次数达到上限，无需重新授权', {
                userId,
                status: refreshError.status,
                code: refreshError.apiCode
              })
              return '今日存档下载次数已达上限，请明天再试。'
            }

            logger.warn('使用 refresh_token 拉取失败，将重新进行授权', {
              error: refreshError
            })
          }
        }

        // 触发完整 OAuth 授权流程
        const { url } = await generateAuthUrlForUser(userId)
        const targetUser = session.username
          ? `${session.username} (${userId})`
          : userId
        await session.send(
          `已保存的授权信息已失效，需要重新授权...\n以下是用户 ${targetUser} 的绑定链接，请在浏览器中打开完成授权（5分钟内有效）：`
        )
        await session.send(url)

        const result = await waitForAuthAndSaveData(userId, config)
        const savedDate = new Date(result.savedAt).toLocaleString('zh-CN')
        const username =
          result.userInfo?.preferred_username ||
          result.userInfo?.name ||
          result.userInfo?.nickname ||
          ''
        return `存档拉取成功！用户：${username}，更新时间：${savedDate}`
      } catch (error) {
        logger.error('拉取存档失败', { error, userId })
        return `拉取存档失败: ${error instanceof Error ? error.message : String(error)}`
      }
    })

  // 子命令：取消授权
  ctx
    .command('milthm.cancel', '取消当前的授权请求')
    .alias('mlt.cancel')
    .action(({ session }) => {
      const userId = session.userId
      const cancelled = cancelAuthSession(userId)

      if (cancelled) {
        return '已取消授权请求'
      } else {
        return '当前没有进行中的授权请求'
      }
    })

  // 子命令：登出
  ctx
    .command('milthm.logout', '登出并清除本地授权及存档数据')
    .alias('mlt.logout')
    .action(({ session }) => {
      const userId = session.userId

      try {
        const { hadCredentials, hadRecord } = logoutUser(userId)

        if (!hadCredentials && !hadRecord) {
          return '当前没有已保存的授权或存档数据'
        }

        const parts: string[] = []
        if (hadCredentials) parts.push('授权信息')
        if (hadRecord) parts.push('本地存档')
        return `已成功登出，已清除：${parts.join('、')}。如需重新使用，请通过 milthm.update 重新授权。`
      } catch (error) {
        logger.error('登出失败', { error, userId })
        return `登出失败: ${error instanceof Error ? error.message : String(error)}`
      }
    })
}

function setupLogger(config: Config) {
  if (config.isLog) {
    setLoggerLevel(Logger.DEBUG)
  }
}

export * from './config'
