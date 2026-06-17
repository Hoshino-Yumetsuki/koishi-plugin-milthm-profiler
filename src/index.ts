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
import { MilthmErrorCode } from './errors';
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

/** Error codes that carry a detail string (format: "CODE:detail") */
const DETAIL_CODES = new Set([
  MilthmErrorCode.AUTH_GEN_HTTP_FAILED,
  MilthmErrorCode.AUTH_GEN_FAILED,
  MilthmErrorCode.AUTH_POLL_HTTP_FAILED,
  MilthmErrorCode.QUERY_FAILED,
]);

function resolveErrorMessage(session: any, error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  for (const code of Object.values(MilthmErrorCode)) {
    if (msg === code) {
      return session.text(`errors.${toI18nKey(code)}`);
    }
    if (DETAIL_CODES.has(code) && msg.startsWith(code + ':')) {
      return session.text(`errors.${toI18nKey(code)}`, { detail: msg.slice(code.length + 1) });
    }
  }

  return session.text('errors.unknown', { detail: msg });
}

function toI18nKey(code: string): string {
  return code.toLowerCase().replace(/_/g, '-');
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

  const queryAction = async ({ session }: any) => {
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
  };

  ctx
    .command('milthm', 'Milthm 查分器')
    .action(queryAction);

  ctx
    .command('milthm.get', '查询已缓存的数据')
    .action(queryAction);

  ctx
    .command('milthm.update', '拉取最新数据（消耗每日下载次数）')
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

  // On Discord, make ALL plugin messages ephemeral (仅自己可见).
  //
  // The adapter defers interactions without flags:64, locking the ephemeral
  // state. We can't fix the defer retroactively, but followup messages (the
  // actual responses) CAN be ephemeral. We patch the Discord message encoder
  // to inject flags:64 into every message sent for our slash commands.
  setupDiscordEphemeral(ctx);
}

function setupDiscordEphemeral(ctx: Context) {
  const ephemeralSessions = new WeakSet<object>();

  // Step 1: Mark our command sessions as ephemeral in middleware
  ctx.middleware((session, next) => {
    if (session.platform === 'discord' && session.type === 'interaction/command') {
      const cmd = session.event?.argv?.name;
      if (cmd === 'milthm') {
        ephemeralSessions.add(session);
      }
    }
    return next();
  });

  // Step 2: Patch Discord message encoder to inject flags:64 for marked sessions
  const patchEncoder = (bot: any) => {
    if (bot.platform !== 'discord') return;
    const MessageEncoder = (bot.constructor as any).MessageEncoder;
    if (!MessageEncoder || MessageEncoder.__milthmPatched) return;
    MessageEncoder.__milthmPatched = true;

    const origFlush = MessageEncoder.prototype.flush;
    MessageEncoder.prototype.flush = async function () {
      if (ephemeralSessions.has(this.options?.session)) {
        this.addition = { ...this.addition, flags: 64 };
      }
      return origFlush.call(this);
    };
  };

  for (const bot of ctx.bots) patchEncoder(bot);
  ctx.on('bot-connect', patchEncoder);
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
