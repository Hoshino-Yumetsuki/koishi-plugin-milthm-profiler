import type { Context, Logger } from 'koishi';
import type Config from './config';
import { NyaProfilerClient } from './api/nya-profiler';
import { SessionManager } from './utils/session';
import { setB20AssetsPath } from './renderer/image';
import type { NyaProfilerQueryResponse, ProcessedScore, ChartProgress } from './types';
import { MilthmErrorCode } from './errors';
import fs from 'node:fs';
import path from 'node:path';

let mainLogger: Logger | null = null;

const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    if (meta) {
      mainLogger?.debug(message, meta);
    } else {
      mainLogger?.debug(message);
    }
  },
  info(message: string, meta?: Record<string, unknown>) {
    if (meta) {
      mainLogger?.info(message, meta);
    } else {
      mainLogger?.info(message);
    }
  },
  warn(message: string, meta?: Record<string, unknown>) {
    if (meta) {
      mainLogger?.warn(message, meta);
    } else {
      mainLogger?.warn(message);
    }
  },
  error(message: string, meta?: Record<string, unknown>) {
    if (meta) {
      mainLogger?.error(message, meta);
    } else {
      mainLogger?.error(message);
    }
  }
};

export function setMainLogger(newLogger: Logger) {
  mainLogger = newLogger;
}

let nyaProfilerClient: NyaProfilerClient | null = null;
let sessionManager: SessionManager | null = null;
let koishiBaseDir: string | null = null;

const PLUGIN_NAME = 'milthm-profiler';

/**
 * 用户绑定记录：聊天平台 userId → milkloud username
 */
interface UserBinding {
  userId: string;
  milthmUsername: string;
  boundAt: number;
}

/**
 * 本地缓存的查询结果（避免重复消耗 milkloud 每日下载次数）
 */
export interface CachedQueryResult {
  userId: string;
  milthmUsername: string;
  best20: ProcessedScore[];
  extras: ProcessedScore[];
  averageRating: number;
  totalScores: number;
  starCount: number;
  chartProgress: ChartProgress;
  /** 缓存时间戳（毫秒） */
  cachedAt: number;
}

function getBindingsPath(baseDir: string, userId: string): string {
  return path.join(baseDir, 'data', PLUGIN_NAME, 'bindings', `${userId}.json`);
}

function getCachePath(baseDir: string, userId: string): string {
  return path.join(baseDir, 'data', PLUGIN_NAME, 'cache', `${userId}.json`);
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function saveBinding(baseDir: string, binding: UserBinding): void {
  const filePath = getBindingsPath(baseDir, binding.userId);
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(binding, null, 2), 'utf-8');
}

function loadBinding(baseDir: string, userId: string): UserBinding | null {
  const filePath = getBindingsPath(baseDir, userId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as UserBinding;
  } catch {
    return null;
  }
}

function deleteBinding(baseDir: string, userId: string): boolean {
  const filePath = getBindingsPath(baseDir, userId);
  if (!fs.existsSync(filePath)) return false;
  fs.rmSync(filePath);
  return true;
}

function saveCachedResult(baseDir: string, result: CachedQueryResult): void {
  const filePath = getCachePath(baseDir, result.userId);
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8');
}

function loadCachedResult(baseDir: string, userId: string): CachedQueryResult | null {
  const filePath = getCachePath(baseDir, userId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CachedQueryResult;
  } catch {
    return null;
  }
}

function deleteCachedResult(baseDir: string, userId: string): boolean {
  const filePath = getCachePath(baseDir, userId);
  if (!fs.existsSync(filePath)) return false;
  fs.rmSync(filePath);
  return true;
}

export async function initClients(ctx: Context, config: Config) {
  logger.info('初始化 API 客户端');

  koishiBaseDir = ctx.baseDir;

  const clientLogger = ctx.logger('milthm-profiler:client');

  nyaProfilerClient = new NyaProfilerClient(config.nyaProfiler.apiKey, clientLogger);

  sessionManager = new SessionManager();

  setB20AssetsPath(__dirname);

  logger.info('API 客户端初始化完成');
}

/**
 * 生成授权链接
 */
export async function generateAuthUrlForUser(
  userId: string,
  acceptLanguage?: string
): Promise<{ url: string; uuid: string }> {
  if (!nyaProfilerClient) {
    throw new Error(MilthmErrorCode.API_CLIENT_NOT_INIT);
  }

  if (!sessionManager) {
    throw new Error(MilthmErrorCode.SESSION_MANAGER_NOT_INIT);
  }

  const existingSession = sessionManager.getSession(userId);
  if (existingSession && existingSession.status === 'pending') {
    logger.warn(`用户 ${userId} 已有进行中的授权会话`);
    return {
      url: existingSession.url,
      uuid: existingSession.uuid
    };
  }

  const { url, uuid } = await nyaProfilerClient.generateAuthUrl(acceptLanguage);

  sessionManager.createSession(userId, uuid, url);

  logger.info(`为用户 ${userId} 生成授权链接`, { uuid });

  return { url, uuid };
}

/**
 * 使用已有的授权链接和 uuid 注册会话并等待授权完成
 * 用于 renya 返回 needAuth + url + uuid 的场景（token 过期重新授权）
 */
export async function registerAndWaitForAuth(
  userId: string,
  url: string,
  uuid: string,
  config: Config,
  acceptLanguage?: string
): Promise<{ username: string }> {
  if (!sessionManager) {
    throw new Error(MilthmErrorCode.SESSION_MANAGER_NOT_INIT);
  }

  // 注册到 sessionManager 以便 waitForAuthAndBind 能找到
  sessionManager.createSession(userId, uuid, url);

  return await waitForAuthAndBind(userId, config, acceptLanguage);
}

/**
 * 等待用户完成授权并保存绑定关系
 */
export async function waitForAuthAndBind(
  userId: string,
  config: Config,
  acceptLanguage?: string
): Promise<{ username: string }> {
  if (!nyaProfilerClient || !sessionManager || !koishiBaseDir) {
    throw new Error(MilthmErrorCode.API_CLIENT_NOT_INIT);
  }

  const session = sessionManager.getSession(userId);
  if (!session) {
    throw new Error(MilthmErrorCode.AUTH_SESSION_NOT_FOUND);
  }

  logger.info(`开始等待用户 ${userId} 完成授权`);

  try {
    const { username } = await nyaProfilerClient.waitForAuth(
      session.uuid,
      config.pollTimeout,
      config.pollInterval,
      acceptLanguage
    );

    logger.info(`用户 ${userId} 已完成授权`, { milthmUsername: username });

    saveBinding(koishiBaseDir, {
      userId,
      milthmUsername: username,
      boundAt: Date.now()
    });

    sessionManager.removeSession(userId);

    return { username };
  } catch (error) {
    logger.error(`用户 ${userId} 授权流程失败`, { error });

    if (error instanceof Error && error.message === MilthmErrorCode.AUTH_TIMEOUT) {
      sessionManager.updateSessionStatus(userId, 'timeout');
    } else {
      sessionManager.updateSessionStatus(userId, 'failed');
    }

    throw error;
  }
}

/**
 * 查询用户数据（通过 renya 代理）并缓存结果
 */
export async function queryUserData(userId: string, acceptLanguage?: string): Promise<NyaProfilerQueryResponse> {
  if (!nyaProfilerClient || !koishiBaseDir) {
    throw new Error(MilthmErrorCode.API_CLIENT_NOT_INIT);
  }

  const binding = loadBinding(koishiBaseDir, userId);
  if (!binding) {
    throw new Error(MilthmErrorCode.BINDING_NOT_FOUND);
  }

  const response = await nyaProfilerClient.queryUserData(binding.milthmUsername, acceptLanguage);

  if (response.result === '200' && response.details) {
    saveCachedResult(koishiBaseDir, {
      userId,
      milthmUsername: binding.milthmUsername,
      best20: response.details.best20,
      extras: response.details.extras,
      averageRating: response.details.averageRating,
      totalScores: response.details.totalScores,
      starCount: response.details.starCount,
      chartProgress: response.details.chartProgress,
      cachedAt: Date.now()
    });
    logger.info(`已缓存用户 ${userId} 的查询结果`);
  }

  return response;
}

/**
 * 获取本地缓存的查询结果
 */
export function getCachedResult(userId: string): CachedQueryResult | null {
  if (!koishiBaseDir) return null;
  return loadCachedResult(koishiBaseDir, userId);
}

/**
 * 获取本地绑定记录
 */
export function getLocalBinding(userId: string): UserBinding | null {
  if (!koishiBaseDir) return null;
  return loadBinding(koishiBaseDir, userId);
}

/**
 * 取消用户的授权会话
 */
export function cancelAuthSession(userId: string): boolean {
  if (!sessionManager) {
    return false;
  }

  const session = sessionManager.getSession(userId);
  if (session) {
    sessionManager.removeSession(userId);
    logger.info(`已取消用户 ${userId} 的授权会话`);
    return true;
  }

  return false;
}

/**
 * 登出用户，删除本地绑定数据和缓存
 */
export function logoutUser(userId: string): { hadBinding: boolean } {
  if (!koishiBaseDir) {
    throw new Error(MilthmErrorCode.PLUGIN_NOT_INIT);
  }

  if (sessionManager) {
    const session = sessionManager.getSession(userId);
    if (session) {
      sessionManager.removeSession(userId);
    }
  }

  const hadBinding = deleteBinding(koishiBaseDir, userId);
  deleteCachedResult(koishiBaseDir, userId);

  logger.info(`用户 ${userId} 已登出`, { hadBinding });

  return { hadBinding };
}

/**
 * 获取用户的会话状态
 */
export function getSessionStatus(userId: string) {
  if (!sessionManager) {
    return null;
  }

  return sessionManager.getSession(userId);
}

export { generateB20Image, setB20AssetsPath } from './renderer/image';
export type { B20UserInfo } from './renderer/image';
export * from './utils/calculator';
