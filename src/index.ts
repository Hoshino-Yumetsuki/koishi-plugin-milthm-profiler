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
import { zhCN } from './locales/zh-CN';
import { enUS } from './locales/en-US';
import { jaJP } from './locales/ja-JP';

export let logger: Logger;

export const name = 'milthm-profiler';

function sendAuthUrl(session: any, url: string) {
  return session.send(session.platform === 'discord' ? `<${url}>` : url);
}

export function apply(ctx: Context, config: Config) {
  logger = createLogger(ctx);
  setupLogger(config);

  setMainLogger(logger);

  ctx.i18n.define('zh-CN', zhCN);
  ctx.i18n.define('en-US', enUS);
  ctx.i18n.define('ja-JP', jaJP);

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
          return session.text('.no-binding');
        }

        const cached = getCachedResult(userId);
        if (!cached) {
          return session.text('.no-cache');
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
        return session.text('.cached-result', {
          rating: cached.averageRating.toFixed(4),
          date: cachedDate
        });
      } catch (error) {
        logger.error('查分失败', { error, userId });
        return session.text('.query-failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

  ctx
    .command('milthm.update', '拉取最新数据（消耗每日下载次数）')
    .alias('mlt.update')
    .action(async ({ session }) => {
      if (!session?.userId) return;
      const userId = session.userId;

      try {
        const binding = getLocalBinding(userId);
        if (binding) {
          logger.info('拉取最新数据', {
            userId,
            username: binding.milthmUsername
          });
          const response = await queryUserData(userId);

          if (response.details?.needAuth) {
            let authUrl: string;
            let waitFn: () => Promise<{ username: string }>;

            if (response.details.url && response.details.uuid) {
              authUrl = response.details.url;
              const uuid = response.details.uuid;
              waitFn = () => registerAndWaitForAuth(userId, authUrl, uuid, config);
            } else {
              const gen = await generateAuthUrlForUser(userId);
              authUrl = gen.url;
              waitFn = () => waitForAuthAndBind(userId, config);
            }

            await session.send(session.text('.auth-expired'));
            await sendAuthUrl(session, authUrl);

            const { username } = await waitFn();
            logger.info('重新授权成功', { userId, username });

            const retryResponse = await queryUserData(userId);
            if (retryResponse.result !== '200') {
              return session.text('.query-failed', { message: retryResponse.message });
            }
            return await renderAndSend(session, retryResponse, username);
          }

          if (response.result !== '200') {
            return session.text('.pull-failed', { message: response.message });
          }

          return await renderAndSend(session, response, binding.milthmUsername);
        }

        const { url } = await generateAuthUrlForUser(userId);
        const targetUser = session.username ? `${session.username} (${userId})` : userId;
        await session.send(
          session.text('.auth-prompt', { target: targetUser })
        );
        await sendAuthUrl(session, url);

        const { username } = await waitForAuthAndBind(userId, config);

        const response = await queryUserData(userId);
        if (response.result !== '200') {
          return session.text('.bind-success-but-pull-failed', {
            username,
            message: response.message
          });
        }

        return await renderAndSend(session, response, username);
      } catch (error) {
        logger.error('拉取数据失败', { error, userId });
        return session.text('.pull-failed-error', {
          error: error instanceof Error ? error.message : String(error)
        });
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
        return session.text('.cancelled');
      } else {
        return session.text('.none');
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
          return session.text('.no-binding');
        }

        return session.text('.success');
      } catch (error) {
        logger.error('登出失败', { error, userId });
        return session.text('.failed', {
          error: error instanceof Error ? error.message : String(error)
        });
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
    return session.text('.no-valid-scores');
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
  return session.text('.result-summary', {
    rating: averageRating.toFixed(4),
    date: cachedDate
  });
}

function setupLogger(config: Config) {
  if (config.isLog) {
    setLoggerLevel(Logger.DEBUG);
  }
}

export * from './config';
