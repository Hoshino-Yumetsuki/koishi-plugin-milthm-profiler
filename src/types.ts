// Nya Profiler API 响应类型
export interface NyaProfilerGenResponse {
  result: string
  message: string
  details: {
    url: string
    code: string
    client_id: string
  }
}

export interface NyaProfilerFetchResponse {
  result: string
  message: string
  details: {
    data: string
  }
}

// Milthm OIDC 令牌响应类型
export interface OIDCTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

// 授权会话类型
export interface AuthSession {
  userId: string
  uuid: string
  url: string
  timestamp: number
  status: 'pending' | 'authorized' | 'failed' | 'timeout'
}

// Milthm 用户数据类型（根据实际 API 调整）
export interface MilthmUserData {
  // TODO: 根据实际的 Milthm API 响应定义
  [key: string]: any
}
