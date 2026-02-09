import { type Context, Logger, h } from 'koishi'
import type Config from './config'
import { createLogger, setLoggerLevel } from './utils/logger'
import { formatError } from './utils/formatter'
import {
  initClients,
  generateAuthUrlForUser,
  waitForAuthAndFetchData,
  cancelAuthSession,
  setMainLogger,
  processSaveData,
  formatB20Text,
  generateB20Image
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

  // 主命令：查分
  ctx
    .command('milthm', 'Milthm 查分器')
    .alias('mlt')
    .option('text', '-t 仅显示文本结果')
    .action(async ({ session, options }) => {
      const userId = session.userId

      try {
        // 生成授权链接
        const { url } = await generateAuthUrlForUser(userId)

        // 发送授权链接给用户
        await session.send(
          `请点击以下链接完成授权（60秒内有效）：\n${url}\n\n授权完成后，我将自动为您获取数据...`
        )

        // 等待授权并获取数据
        const data = await waitForAuthAndFetchData(userId, config)

        logger.info('开始处理存档数据', { userId })

        // 处理存档数据，计算 B20
        const b20Result = processSaveData(ctx, data.saveData.content)

        if (b20Result.best20.length === 0) {
          return '未找到有效的成绩数据'
        }

        // 如果指定了 -t 参数，只返回文本
        if (options?.text) {
          return formatB20Text(b20Result)
        }

        // 生成图片
        logger.info('开始生成查分图片', { userId })

        // 提取用户信息传给图片生成器
        const b20UserInfo = {
          username:
            data.userInfo?.preferred_username || data.userInfo?.name || '',
          nickname: data.userInfo?.nickname || '',
          userId: data.userInfo?.sub || ''
        }

        const imageBuffer = await generateB20Image(ctx, b20Result, b20UserInfo)

        return h.image(imageBuffer, 'image/png')
      } catch (error) {
        logger.error('查分失败', { error, userId })
        return formatError(error)
      }
    })

  // 取消授权命令
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
}

function setupLogger(config: Config) {
  if (config.isLog) {
    setLoggerLevel(Logger.DEBUG)
  }
}

export * from './config'
