import type {
  NyaProfilerGenResponse,
  NyaProfilerPollResponse,
  NyaProfilerQueryResponse
} from '../types';
import { MilthmErrorCode } from '../errors';

const NYA_PROFILER_BASE_URL = 'https://renya.mhtlim.top/api/external';

function buildHeaders(apiKey: string, acceptLanguage?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Referer: 'https://renya.mhtlim.top/'
  };
  if (acceptLanguage) {
    headers['Accept-Language'] = acceptLanguage;
  }
  return headers;
}

export class NyaProfilerClient {
  constructor(
    private apiKey: string,
    private logger: any
  ) {}

  /**
   * 生成授权链接
   */
  async generateAuthUrl(acceptLanguage?: string): Promise<{ url: string; uuid: string }> {
    const url = `${NYA_PROFILER_BASE_URL}/gen`;

    this.logger.debug('请求生成授权链接');

    try {
      const response = await fetch(url, {
        headers: buildHeaders(this.apiKey, acceptLanguage)
      });
      const responseText = await response.text();

      if (!response.ok) {
        this.logger.debug({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseText
        });
        throw new Error(`${MilthmErrorCode.AUTH_GEN_HTTP_FAILED}:${response.status}`);
      }

      let data: NyaProfilerGenResponse;
      try {
        data = JSON.parse(responseText);
      } catch {
        this.logger.debug({ status: response.status, body: responseText });
        throw new Error(MilthmErrorCode.AUTH_GEN_PARSE_FAILED);
      }

      if (data.result !== '200') {
        this.logger.debug({ body: responseText });
        throw new Error(`${MilthmErrorCode.AUTH_GEN_FAILED}:${data.message}`);
      }

      this.logger.debug('成功生成授权链接', {
        uuid: data.details.uuid,
        url: data.details.url
      });

      return {
        url: data.details.url,
        uuid: data.details.uuid
      };
    } catch (error) {
      this.logger.error('生成授权链接时发生错误', { error });
      throw error;
    }
  }

  /**
   * 轮询授权状态（单次）
   */
  async pollAuthStatus(uuid: string, acceptLanguage?: string): Promise<{ status: string; username?: string }> {
    const url = `${NYA_PROFILER_BASE_URL}/poll?` + `uuid=${encodeURIComponent(uuid)}`;

    this.logger.debug(`轮询授权状态: uuid=${uuid}`);

    try {
      const response = await fetch(url, {
        headers: buildHeaders(this.apiKey, acceptLanguage)
      });
      const responseText = await response.text();

      if (!response.ok) {
        this.logger.debug({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseText
        });
        throw new Error(`${MilthmErrorCode.AUTH_POLL_HTTP_FAILED}:${response.status}`);
      }

      let data: NyaProfilerPollResponse;
      try {
        data = JSON.parse(responseText);
      } catch {
        this.logger.debug({ status: response.status, body: responseText });
        throw new Error(MilthmErrorCode.AUTH_POLL_PARSE_FAILED);
      }

      return {
        status: data.details.status,
        username: data.details.username
      };
    } catch (error) {
      this.logger.error('轮询授权状态时发生错误', { error });
      throw error;
    }
  }

  /**
   * 等待授权完成（轮询直到成功/失败/超时）
   */
  async waitForAuth(
    uuid: string,
    timeout: number = 300,
    interval: number = 5,
    acceptLanguage?: string
  ): Promise<{ username: string }> {
    const startTime = Date.now();
    const timeoutMs = timeout * 1000;
    const intervalMs = interval * 1000;

    this.logger.info(`开始轮询授权状态，超时时间: ${timeout}秒，轮询间隔: ${interval}秒`);

    while (Date.now() - startTime < timeoutMs) {
      try {
        const result = await this.pollAuthStatus(uuid, acceptLanguage);

        if (result.status === 'authorized' && result.username) {
          this.logger.info('用户已完成授权', { username: result.username });
          return { username: result.username };
        }

        if (result.status === 'rejected') {
          throw new Error(MilthmErrorCode.AUTH_REJECTED);
        }

        // pending or pending_consent - keep waiting
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      } catch (error) {
        if (error instanceof Error && error.message === MilthmErrorCode.AUTH_REJECTED) {
          throw error;
        }
        this.logger.error('轮询过程中发生错误', { error });
        throw error;
      }
    }

    throw new Error(MilthmErrorCode.AUTH_TIMEOUT);
  }

  /**
   * 查询用户数据（B20、rating 等）
   */
  async queryUserData(username: string, acceptLanguage?: string): Promise<NyaProfilerQueryResponse> {
    const url = `${NYA_PROFILER_BASE_URL}/query?` + `username=${encodeURIComponent(username)}`;

    this.logger.debug(`查询用户数据: username=${username}`);

    try {
      const response = await fetch(url, {
        headers: buildHeaders(this.apiKey, acceptLanguage)
      });
      const responseText = await response.text();

      let data: NyaProfilerQueryResponse;
      try {
        data = JSON.parse(responseText);
      } catch {
        this.logger.debug({ status: response.status, body: responseText });
        throw new Error(MilthmErrorCode.QUERY_PARSE_FAILED);
      }

      // 401 with needAuth means token expired, need re-authorization
      // 404 means user has no authorization record for this app
      // 429 means daily download limit reached
      if (!response.ok) {
        if (response.status === 401 && data.details?.needAuth) {
          this.logger.warn('用户令牌已过期，需要重新授权', { username });
          return data;
        }
        if (response.status === 404) {
          this.logger.warn('用户未授权，需要引导授权', { username });
          return {
            result: '404',
            message: data.message,
            details: { needAuth: true }
          } as NyaProfilerQueryResponse;
        }
        if (response.status === 429) {
          this.logger.warn('今日下载次数已达上限', { username });
          throw new Error(MilthmErrorCode.QUERY_DAILY_LIMIT);
        }
        throw new Error(`${MilthmErrorCode.QUERY_FAILED}:${data.message}`);
      }

      this.logger.debug('成功查询用户数据', {
        username: data.details.username,
        totalScores: data.details.totalScores
      });

      return data;
    } catch (error) {
      this.logger.error('查询用户数据时发生错误', { error });
      throw error;
    }
  }
}
