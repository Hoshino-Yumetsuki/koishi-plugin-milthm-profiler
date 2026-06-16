import { type Context, Logger, h } from 'koishi';
import type Config from './config';
import { createLogger, setLoggerLevel } from './utils/logger';
import {
  initClients,
  generateAuthUrlForUser,
  waitForAuthAndBind,
  registerAndWaitForAuth,
  queryUserData,
  cancelAuthSession,
  logoutUser,
  setMainLogger,
  generateB20Image,
  getLocalBinding,
  getCachedResult
} from './core';
import type { NyaProfilerQueryResponse } from './types';

export let logger: Logger;

export const name = 'milthm-profiler';

export function apply(ctx: Context, config: Config) {
  logger = createLogger(ctx);
  setupLogger(config);

  setMainLogger(logger);

  ctx.on('ready', async () => {
    initClients(ctx, config);
    logger.info('Milthm Profiler 插件已就绪');
  });

  ctx
    .command('milthm', 'Milthm 查分器')
    .alias('mlt')
    .action(async ({ session }) => {
      if (!session?.userId) return;
      const userId = session.userId;

      try {
        const binding = getLocalBinding(userId);
        if (!binding) {
          return '未绑定 Milthm 账号，请先使用 milthm.update 命令进行授权绑定';
        }

        const cached = getCachedResult(userId);
        if (!cached) {
          return '未找到本地缓存数据，请先使用 milthm.update 拉取数据';
        }

        logger.info('使用本地缓存生成查分图', {
          userId,
          username: cached.milthmUsername,
          cachedAt: new Date(cached.cachedAt).toLocaleString('zh-CN')
        });

        const b20UserInfo = {
          username: cached.milthmUsername,
          nickname: cached.milthmUsername,
          userId: ''
        };

        const b20Result = {
          best20: cached.best20,
          extras: cached.extras,
          allScores: [] as any[],
          averageRating: cached.averageRating,
          totalScores: cached.totalScores,
          starCount: cached.starCount,
          chartProgress: cached.chartProgress
        };

        const imageBuffer = await generateB20Image(null, b20Result, b20UserInfo);
        await session.send(h.image(imageBuffer, 'image/png'));

        const cachedDate = new Date(cached.cachedAt).toLocaleString('zh-CN');
        return `Rating: ${cached.averageRating.toFixed(4)}\n数据时间：${cachedDate}（使用 milthm.update 可拉取最新数据）`;
      } catch (error) {
        logger.error('查分失败', { error, userId });
        return `查分失败: ${error instanceof Error ? error.message : String(error)}`;
      }
    });

  ctx
    .command('milthm.update', '拉取最新数据（消耗每日下载次数）')
    .alias('mlt.update')
    .action(async ({ session }) => {
      if (!session?.userId) return;
      const userId = session.userId;

      try {
        // 检查是否已绑定
        const binding = getLocalBinding(userId);
        if (binding) {
          // 已绑定，直接查询最新数据
          logger.info('拉取最新数据', {
            userId,
            username: binding.milthmUsername
          });
          const response = await queryUserData(userId);

          // 需要重新授权
          if (response.details?.needAuth) {
            let authUrl: string;
            let waitFn: () => Promise<{ username: string }>;

            if (response.details.url && response.details.uuid) {
              // renya 已生成授权链接和 uuid，直接使用并轮询
              authUrl = response.details.url;
              const uuid = response.details.uuid;
              waitFn = () => registerAndWaitForAuth(userId, authUrl, uuid, config);
            } else {
              // 需要自行生成新的授权链接
              const gen = await generateAuthUrlForUser(userId);
              authUrl = gen.url;
              waitFn = () => waitForAuthAndBind(userId, config);
            }

            await session.send('授权已过期，请在浏览器中打开以下链接重新授权（5分钟内有效）：');
            await session.send(authUrl);

            const { username } = await waitFn();
            logger.info('重新授权成功', { userId, username });

            const retryResponse = await queryUserData(userId);
            if (retryResponse.result !== '200') {
              return `查询失败: ${retryResponse.message}`;
            }
            return await renderAndSend(session, retryResponse, username);
          }

          if (response.result !== '200') {
            return `拉取失败: ${response.message}`;
          }

          return await renderAndSend(session, response, binding.milthmUsername);
        }

        // 未绑定，触发完整授权流程
        const { url } = await generateAuthUrlForUser(userId);
        const targetUser = session.username ? `${session.username} (${userId})` : userId;
        await session.send(
          `请在浏览器中打开以下链接完成授权绑定（5分钟内有效）：\n用户: ${targetUser}`
        );
        await session.send(url);

        const { username } = await waitForAuthAndBind(userId, config);

        const response = await queryUserData(userId);
        if (response.result !== '200') {
          return `绑定成功（${username}），但拉取数据失败: ${response.message}`;
        }

        return await renderAndSend(session, response, username);
      } catch (error) {
        logger.error('拉取数据失败', { error, userId });
        return `拉取数据失败: ${error instanceof Error ? error.message : String(error)}`;
      }
    });

  ctx
    .command('milthm.cancel', '取消当前的授权请求')
    .alias('mlt.cancel')
    .action(({ session }) => {
      if (!session?.userId) return;
      const userId = session.userId;
      const cancelled = cancelAuthSession(userId);

      if (cancelled) {
        return '已取消授权请求';
      } else {
        return '当前没有进行中的授权请求';
      }
    });

  ctx
    .command('milthm.logout', '登出并清除本地绑定数据')
    .alias('mlt.logout')
    .action(({ session }) => {
      if (!session?.userId) return;
      const userId = session.userId;

      try {
        const { hadBinding } = logoutUser(userId);

        if (!hadBinding) {
          return '当前没有已绑定的账号';
        }

        return '已成功登出，绑定数据已清除。如需重新使用，请通过 milthm.update 重新授权。';
      } catch (error) {
        logger.error('登出失败', { error, userId });
        return `登出失败: ${error instanceof Error ? error.message : String(error)}`;
      }
    });
}

async function renderAndSend(
  session: any,
  response: NyaProfilerQueryResponse,
  username: string
): Promise<string> {
  const { best20, averageRating } = response.details;

  if (!best20 || best20.length === 0) {
    return '未找到有效的成绩数据';
  }

  logger.info('开始生成查分图片', { username });

  const b20UserInfo = {
    username,
    nickname: username,
    userId: ''
  };

  const b20Result = {
    best20,
    extras: response.details.extras || [],
    allScores: [] as any[],
    averageRating,
    totalScores: response.details.totalScores || best20.length,
    starCount: response.details.starCount,
    chartProgress: response.details.chartProgress
  };

  const imageBuffer = await generateB20Image(null, b20Result, b20UserInfo);
  await session.send(h.image(imageBuffer, 'image/png'));

  const cachedDate = new Date().toLocaleString('zh-CN');
  return `Rating: ${averageRating.toFixed(4)}\n数据时间：${cachedDate}`;
}

function setupLogger(config: Config) {
  if (config.isLog) {
    setLoggerLevel(Logger.DEBUG);
  }
}

export * from './config';
