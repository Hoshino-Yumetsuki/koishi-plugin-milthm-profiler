import type { NyaProfilerGenResponse, NyaProfilerFetchResponse } from '../types'

const NYA_PROFILER_BASE_URL = 'https://renya.mhtl.im/api/external'

export class NyaProfilerClient {
  constructor(
    private apiKey: string,
    private logger: any
  ) {}

  /**
   * 生成授权链接
   */
  async generateAuthUrl(): Promise<{ url: string; uuid: string }> {
    const url = `${NYA_PROFILER_BASE_URL}/gen?api_key=${encodeURIComponent(this.apiKey)}`

    this.logger.debug(`请求生成授权链接: ${url}`)

    try {
      const response = await fetch(url, {
        headers: { Referer: 'https://nya.mhtl.im/' }
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
        uuid: data.details.code,
        url: data.details.url
      })

      return {
        url: data.details.url,
        uuid: data.details.code
      }
    } catch (error) {
      this.logger.error('生成授权链接时发生错误', { error })
      throw error
    }
  }

  /**
   * 获取授权信息（单次）
   */
  async fetchAuthCode(uuid: string): Promise<string | null> {
    const url =
      `${NYA_PROFILER_BASE_URL}/fetch?` +
      `api_key=${encodeURIComponent(this.apiKey)}&` +
      `uuid=${encodeURIComponent(uuid)}`

    this.logger.debug(`请求获取授权信息: uuid=${uuid}`)

    try {
      const response = await fetch(url, {
        headers: { Referer: 'https://renya.mhtl.im/' }
      })
      const responseText = await response.text()

      if (!response.ok) {
        this.logger.debug({
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseText
        })
        throw new Error(`获取授权信息失败: HTTP ${response.status}`)
      }

      let data: NyaProfilerFetchResponse
      try {
        data = JSON.parse(responseText)
      } catch {
        this.logger.debug({ status: response.status, body: responseText })
        throw new Error('获取授权信息响应解析失败，请开启 debug 日志查看详情')
      }

      if (data.result === '404') {
        return null
      }

      if (data.result !== '200') {
        this.logger.debug({ body: responseText })
        throw new Error(`获取授权信息失败: ${data.message}`)
      }

      this.logger.debug('成功获取授权 code', { code: data.details.data })
      return data.details.data
    } catch (error) {
      this.logger.error('获取授权信息时发生错误', { error })
      throw error
    }
  }

  /**
   * 轮询授权信息
   */
  async pollAuthCode(
    uuid: string,
    timeout: number = 60,
    interval: number = 2
  ): Promise<string> {
    const startTime = Date.now()
    const timeoutMs = timeout * 1000
    const intervalMs = interval * 1000

    this.logger.info(
      `开始轮询授权信息，超时时间: ${timeout}秒，轮询间隔: ${interval}秒`
    )

    while (Date.now() - startTime < timeoutMs) {
      try {
        const code = await this.fetchAuthCode(uuid)
        if (code) {
          this.logger.info('用户已完成授权')
          return code
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      } catch (error) {
        this.logger.error('轮询过程中发生错误', { error })
        throw error
      }
    }

    throw new Error('授权超时，用户未在规定时间内完成授权')
  }
}
