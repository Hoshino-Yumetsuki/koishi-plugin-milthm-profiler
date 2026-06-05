import type {
  NyaProfilerGenResponse,
  NyaProfilerPollResponse,
  NyaProfilerQueryResponse
} from '../types'

const NYA_PROFILER_BASE_URL = 'https://renya.mhtlim.top/api/external'

export class NyaProfilerClient {
  constructor(
    private apiKey: string,
    private logger: any
  ) {}

  /**
   * 生成授权链接
   */
  async generateAuthUrl(): Promise<{ url: string; uuid: string }> {
    const url = `${NYA_PROFILER_BASE_URL}/gen`

    this.logger.debug('请求生成授权链接')

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Referer: 'https://renya.mhtlim.top/'
        }
      })
      const responseText = await response.text()

      if (!response.ok) {
        this.logger.debug({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseText
        })
        throw new Error(`生成授权链接失败: HTTP ${response.status}`)
      }

      let data: NyaProfilerGenResponse
      try {
        data = JSON.parse(responseText)
      } catch {
        this.logger.debug({ status: response.status, body: responseText })
        throw new Error('生成授权链接响应解析失败，请开启 debug 日志查看详情')
      }

      if (data.result !== '200') {
        this.logger.debug({ body: responseText })
        throw new Error(`生成授权链接失败: ${data.message}`)
      }

      this.logger.debug('成功生成授权链接', {
        uuid: data.details.uuid,
        url: data.details.url
      })

      return {
        url: data.details.url,
        uuid: data.details.uuid
      }
    } catch (error) {
      this.logger.error('生成授权链接时发生错误', { error })
      throw error
    }
  }

  /**
   * 轮询授权状态（单次）
   */
  async pollAuthStatus(
    uuid: string
  ): Promise<{ status: string; username?: string }> {
    const url =
      `${NYA_PROFILER_BASE_URL}/poll?` + `uuid=${encodeURIComponent(uuid)}`

    this.logger.debug(`轮询授权状态: uuid=${uuid}`)

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Referer: 'https://renya.mhtlim.top/'
        }
      })
      const responseText = await response.text()

      if (!response.ok) {
        this.logger.debug({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseText
        })
        throw new Error(`轮询授权状态失败: HTTP ${response.status}`)
      }

      let data: NyaProfilerPollResponse
      try {
        data = JSON.parse(responseText)
      } catch {
        this.logger.debug({ status: response.status, body: responseText })
        throw new Error('轮询授权状态响应解析失败，请开启 debug 日志查看详情')
      }

      return {
        status: data.details.status,
        username: data.details.username
      }
    } catch (error) {
      this.logger.error('轮询授权状态时发生错误', { error })
      throw error
    }
  }

  /**
   * 等待授权完成（轮询直到成功/失败/超时）
   */
  async waitForAuth(
    uuid: string,
    timeout: number = 300,
    interval: number = 5
  ): Promise<{ username: string }> {
    const startTime = Date.now()
    const timeoutMs = timeout * 1000
    const intervalMs = interval * 1000

    this.logger.info(
      `开始轮询授权状态，超时时间: ${timeout}秒，轮询间隔: ${interval}秒`
    )

    while (Date.now() - startTime < timeoutMs) {
      try {
        const result = await this.pollAuthStatus(uuid)

        if (result.status === 'authorized' && result.username) {
          this.logger.info('用户已完成授权', { username: result.username })
          return { username: result.username }
        }

        if (result.status === 'rejected') {
          throw new Error('用户拒绝了授权请求')
        }

        // pending or pending_consent - keep waiting
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      } catch (error) {
        if (error instanceof Error && error.message === '用户拒绝了授权请求') {
          throw error
        }
        this.logger.error('轮询过程中发生错误', { error })
        throw error
      }
    }

    throw new Error('授权超时，用户未在规定时间内完成授权')
  }

  /**
   * 查询用户数据（B20、rating 等）
   */
  async queryUserData(username: string): Promise<NyaProfilerQueryResponse> {
    const url =
      `${NYA_PROFILER_BASE_URL}/query?` +
      `username=${encodeURIComponent(username)}`

    this.logger.debug(`查询用户数据: username=${username}`)

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Referer: 'https://renya.mhtlim.top/'
        }
      })
      const responseText = await response.text()

      let data: NyaProfilerQueryResponse
      try {
        data = JSON.parse(responseText)
      } catch {
        this.logger.debug({ status: response.status, body: responseText })
        throw new Error('查询用户数据响应解析失败，请开启 debug 日志查看详情')
      }

      // 401 with needAuth means token expired, need re-authorization
      // 404 means user has no authorization record for this app
      // 429 means daily download limit reached
      if (!response.ok) {
        if (response.status === 401 && data.details?.needAuth) {
          this.logger.warn('用户令牌已过期，需要重新授权', { username })
          return data
        }
        if (response.status === 404) {
          this.logger.warn('用户未授权，需要引导授权', { username })
          return {
            result: '404',
            message: data.message,
            details: { needAuth: true }
          } as NyaProfilerQueryResponse
        }
        if (response.status === 429) {
          this.logger.warn('今日下载次数已达上限', { username })
          throw new Error('今日存档下载次数已达上限，请明天再试')
        }
        throw new Error(`查询用户数据失败: ${data.message}`)
      }

      this.logger.debug('成功查询用户数据', {
        username: data.details.username,
        totalScores: data.details.totalScores
      })

      return data
    } catch (error) {
      this.logger.error('查询用户数据时发生错误', { error })
      throw error
    }
  }
}
