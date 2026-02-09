import type { OIDCTokenResponse, MilthmUserData } from '../types'

const MILTHM_BASE_URL = 'https://milkloud.milthm.cn/api'
const TOKEN_ENDPOINT = `${MILTHM_BASE_URL}/oidc/oauth/token`
const USERINFO_ENDPOINT = `${MILTHM_BASE_URL}/oidc/userinfo`
const SAVE_DATA_ENDPOINT = `${MILTHM_BASE_URL}/v1/game/save`
const JWKS_ENDPOINT = `${MILTHM_BASE_URL}/oidc/keys`
const REDIRECT_URI = 'https://api.mhtl.im/_m/callback'

export class MilthmOIDCClient {
  constructor(
    private clientId: string,
    private clientSecret: string,
    private logger: any
  ) {}

  /**
   * 使用 access code 换取访问令牌
   * @param accessCode 从 nya profiler 获取的 access code
   * @returns 访问令牌响应
   */
  async exchangeToken(accessCode: string): Promise<OIDCTokenResponse> {
    this.logger.debug('开始使用 access code 换取访问令牌')

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: accessCode,
      redirect_uri: REDIRECT_URI,
      client_id: this.clientId,
      client_secret: this.clientSecret
    })

    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.logger.error('换取令牌失败', {
          status: response.status,
          error: errorText
        })
        throw new Error(`换取令牌失败: ${response.status} ${errorText}`)
      }

      const data: OIDCTokenResponse = await response.json()

      this.logger.debug('成功获取访问令牌', {
        token_type: data.token_type,
        expires_in: data.expires_in
      })

      return data
    } catch (error) {
      this.logger.error('换取令牌时发生错误', { error })
      throw error
    }
  }

  /**
   * 获取用户信息
   * @param accessToken 访问令牌
   * @returns 用户信息
   */
  async getUserInfo(accessToken: string): Promise<MilthmUserData> {
    this.logger.debug('开始获取用户信息')

    try {
      const response = await fetch(USERINFO_ENDPOINT, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.logger.error('获取用户信息失败', {
          status: response.status,
          error: errorText
        })
        throw new Error(`获取用户信息失败: ${response.status} ${errorText}`)
      }

      const data: MilthmUserData = await response.json()

      this.logger.debug('成功获取用户信息')

      return data
    } catch (error) {
      this.logger.error('获取用户信息时发生错误', { error })
      throw error
    }
  }

  /**
   * 验证 access token 是否有效
   * @param accessToken 访问令牌
   * @returns 验证结果和详细信息
   */
  async verifyToken(accessToken: string): Promise<{
    isValid: boolean
    error?: string
    userInfo?: MilthmUserData
  }> {
    this.logger.debug('开始验证 access token')

    try {
      // 方法1：尝试获取用户信息来验证 token
      const response = await fetch(USERINFO_ENDPOINT, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorData: any
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { message: errorText }
        }

        this.logger.warn('Token 验证失败', {
          status: response.status,
          error: errorData
        })

        return {
          isValid: false,
          error:
            errorData.code || errorData.message || `HTTP ${response.status}`
        }
      }

      const userInfo: MilthmUserData = await response.json()

      this.logger.debug('Token 验证成功')

      return {
        isValid: true,
        userInfo
      }
    } catch (error) {
      this.logger.error('验证 token 时发生错误', { error })
      return {
        isValid: false,
        error: String(error)
      }
    }
  }

  /**
   * 获取 JWKS（JSON Web Key Set）
   * @returns JWKS 数据
   */
  async getJWKS(): Promise<any> {
    this.logger.debug('开始获取 JWKS')

    try {
      const response = await fetch(JWKS_ENDPOINT, {
        method: 'GET'
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.logger.error('获取 JWKS 失败', {
          status: response.status,
          error: errorText
        })
        throw new Error(`获取 JWKS 失败: ${response.status} ${errorText}`)
      }

      const data = await response.json()

      this.logger.debug('成功获取 JWKS')

      return data
    } catch (error) {
      this.logger.error('获取 JWKS 时发生错误', { error })
      throw error
    }
  }

  /**
   * 获取用户存档数据
   * @param accessToken 访问令牌
   * @returns 存档文件 URL 和完整响应
   */
  async getUserSaveData(accessToken: string): Promise<{
    fileUrl: string
    rawData: any
  }> {
    this.logger.debug('开始获取用户存档数据')

    try {
      const response = await fetch(SAVE_DATA_ENDPOINT, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorData: any
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { message: errorText }
        }

        this.logger.error('获取存档数据失败', {
          status: response.status,
          error: errorData
        })

        // 检查是否是 token 过期错误
        if (
          errorData.code === 'TokenExpireError' ||
          response.status === 401 ||
          response.status === 418
        ) {
          throw new Error(
            `Token 已过期，请重新授权。错误信息: ${errorData.message || errorText}`
          )
        }

        throw new Error(
          `获取存档数据失败: ${response.status} ${errorData.message || errorText}`
        )
      }

      const data = await response.json()

      // 检查错误
      if (data.code?.includes('Error')) {
        this.logger.error('API 返回错误', { error: data })

        // 检查是否是 token 过期错误
        if (data.code === 'TokenExpireError') {
          throw new Error(`Token 已过期，请重新授权。错误信息: ${data.message}`)
        }

        throw new Error(`API 错误: ${JSON.stringify(data)}`)
      }

      // 提取 file_url
      if (!data.data || !data.data.file_url) {
        this.logger.error('响应中没有找到 file_url', { data })
        throw new Error('响应中没有找到存档文件 URL')
      }

      this.logger.debug('成功获取存档数据', {
        fileUrl: data.data.file_url
      })

      return {
        fileUrl: data.data.file_url,
        rawData: data
      }
    } catch (error) {
      this.logger.error('获取存档数据时发生错误', { error })
      throw error
    }
  }

  /**
   * 下载存档文件内容
   * @param fileUrl 存档文件 URL
   * @returns 存档文件内容
   */
  async downloadSaveFile(fileUrl: string): Promise<string> {
    this.logger.debug('开始下载存档文件', { fileUrl })

    try {
      const response = await fetch(fileUrl)

      if (!response.ok) {
        throw new Error(`下载存档文件失败: ${response.status}`)
      }

      const content = await response.text()

      this.logger.debug('成功下载存档文件', {
        size: content.length
      })

      return content
    } catch (error) {
      this.logger.error('下载存档文件时发生错误', { error })
      throw error
    }
  }
}
