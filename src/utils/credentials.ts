import fs from 'node:fs'
import path from 'node:path'

const PLUGIN_NAME = 'milthm-profiler'

/** 持久化保存的用户凭据（令牌信息） */
export interface UserCredentials {
  userId: string
  accessToken: string
  refreshToken?: string
  /** access_token 过期时间戳（毫秒） */
  expiresAt: number
  userInfo: any
  savedAt: number
}

/** 持久化保存的用户存档记录 */
export interface UserSaveRecord {
  userId: string
  /** 存档文件原始内容 */
  content: string
  userInfo: any
  /** 保存时间戳（毫秒） */
  savedAt: number
}

function getCredentialsPath(baseDir: string, userId: string): string {
  return path.join(
    baseDir,
    'data',
    PLUGIN_NAME,
    'credentials',
    `${userId}.json`
  )
}

function getSavePath(baseDir: string, userId: string): string {
  return path.join(baseDir, 'data', PLUGIN_NAME, 'saves', `${userId}.json`)
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function saveCredentials(
  baseDir: string,
  credentials: UserCredentials
): void {
  const filePath = getCredentialsPath(baseDir, credentials.userId)
  ensureDir(filePath)
  fs.writeFileSync(filePath, JSON.stringify(credentials, null, 2), 'utf-8')
}

export function loadCredentials(
  baseDir: string,
  userId: string
): UserCredentials | null {
  const filePath = getCredentialsPath(baseDir, userId)
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as UserCredentials
  } catch {
    return null
  }
}

export function saveRecord(baseDir: string, record: UserSaveRecord): void {
  const filePath = getSavePath(baseDir, record.userId)
  ensureDir(filePath)
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8')
}

export function loadRecord(
  baseDir: string,
  userId: string
): UserSaveRecord | null {
  const filePath = getSavePath(baseDir, userId)
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as UserSaveRecord
  } catch {
    return null
  }
}

export function deleteCredentials(baseDir: string, userId: string): boolean {
  const filePath = getCredentialsPath(baseDir, userId)
  if (!fs.existsSync(filePath)) return false
  fs.rmSync(filePath)
  return true
}

export function deleteRecord(baseDir: string, userId: string): boolean {
  const filePath = getSavePath(baseDir, userId)
  if (!fs.existsSync(filePath)) return false
  fs.rmSync(filePath)
  return true
}
