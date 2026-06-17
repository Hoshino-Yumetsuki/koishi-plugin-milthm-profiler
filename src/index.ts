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

/** Build Accept-Language header value from Koishi session locales */
function getAcceptLanguage(session: any): string | undefined {
  const locales: string[] | undefined = session?.locales;
  if (!locales || locales.length === 0) return undefined;
  return locales.join(', ');
}

function sendAuthUrl(session: any, url: string) {
  // Koishi's Discord adapter escapes _ to \_ in all message content,
  // which gets URL-encoded to %5C_ and breaks OAuth param names.
  // Pre-encode _ as %5F: the server correctly decodes it back to _.
  const safe = url.replace(/_/g, '%5F');
  return session.send(safe);
}

/** Map hardcoded Chinese error messages from core.ts / nya-profiler.ts to i18n keys. */
const ERROR_MAP: Record<string, string> = {
  'API 客户端未初始化': '.error-api-not-init',
  '会话管理器未初始化': '.error-session-not-init',
  '找不到用户的授权会话': '.error-session-not-found',
  '未找到绑定记录，请先使用 milthm.update 命令授权绑定': '.error-no-binding',
  '插件未初始化': '.error-plugin-not-init',
  '用户拒绝了授权请求': '.error-auth-rejected',
  '授权超时，用户未在规定时间内完成授权': '.error-auth-timeout',
  '今日存档下载次数已达上限，请明天再试': '.error-daily-limit',
  '生成授权链接响应解析失败，请开启 debug 日志查看详情': '.error-gen-auth-parse-failed',
  '轮询授权状态响应解析失败，请开启 debug 日志查看详情': '.error-poll-parse-failed',
  '查询用户数据响应解析失败，请开启 debug 日志查看详情': '.error-query-parse-failed',
};

/** Dynamic error patterns: [regex, i18n key, capture group name for {detail}] */
const ERROR_PATTERNS: [RegExp, string][] = [
  [/^生成授权链接失败: (.+)$/, '.error-gen-auth-failed'],
  [/^轮询授权状态失败: (.+)$/, '.error-poll-failed'],
  [/^查询用户数据失败: (.+)$/, '.error-query-failed-detail'],
];

function resolveErrorMessage(session: any, error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  // exact match
  if (ERROR_MAP[msg]) return session.text(ERROR_MAP[msg]);
  // dynamic patterns
  for (const [pattern, key] of ERROR_PATTERNS) {
    const m = msg.match(pattern);
    if (m) return session.text(key, { detail: m[1] });
  }
  return msg;
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
          error: resolveErrorMessage(session, error)
        });
      }
    });

  ctx
    .command('milthm.update', '拉取最新数据（消耗每日下载次数）')
    .alias('mlt.update')
    .action(async ({ session }) => {
      if (!session?.userId) return;
      const userId = session.userId;
      const acceptLanguage = getAcceptLanguage(session);

      try {
        const binding = getLocalBinding(userId);
        if (binding) {
          logger.info('拉取最新数据', {
            userId,
            username: binding.milthmUsername
          });
          const response = await queryUserData(userId, acceptLanguage);

          if (response.details?.needAuth) {
            let authUrl: string;
            let waitFn: () => Promise<{ username: string }>;

            if (response.details.url && response.details.uuid) {
              authUrl = response.details.url;
              const uuid = response.details.uuid;
              waitFn = () => registerAndWaitForAuth(userId, authUrl, uuid, config, acceptLanguage);
            } else {
              const gen = await generateAuthUrlForUser(userId, acceptLanguage);
              authUrl = gen.url;
              waitFn = () => waitForAuthAndBind(userId, config, acceptLanguage);
            }

            await session.send(session.text('.auth-expired'));
            await sendAuthUrl(session, authUrl);

            const { username } = await waitFn();
            logger.info('重新授权成功', { userId, username });

            const retryResponse = await queryUserData(userId, acceptLanguage);
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

        const { url } = await generateAuthUrlForUser(userId, acceptLanguage);
        const targetUser = session.username ? `${session.username} (${userId})` : userId;
        await session.send(
          session.text('.auth-prompt', { target: targetUser })
        );
        await sendAuthUrl(session, url);

        const { username } = await waitForAuthAndBind(userId, config, acceptLanguage);

        const response = await queryUserData(userId, acceptLanguage);
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
          error: resolveErrorMessage(session, error)
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
          error: resolveErrorMessage(session, error)
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
