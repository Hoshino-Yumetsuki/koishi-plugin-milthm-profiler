// Nya Profiler API 响应类型
export interface NyaProfilerGenResponse {
  result: string
  message: string
  details: {
    url: string
    uuid: string
  }
}

export interface NyaProfilerPollResponse {
  result: string
  message: string
  details: {
    status: 'pending' | 'pending_consent' | 'authorized' | 'rejected'
    username?: string
  }
}

export interface ChartProgressEntry {
  all: number
  ap: number
  fc: number
  cl: number
}

export interface ChartProgress {
  CL: ChartProgressEntry
  CB: ChartProgressEntry
  SK: ChartProgressEntry
  DZ: ChartProgressEntry
}

export interface NyaProfilerQueryResponse {
  result: string
  message: string
  details: {
    username: string
    best20: ProcessedScore[]
    extras: ProcessedScore[]
    averageRating: number
    totalScores: number
    starCount: number
    chartProgress: ChartProgress
    /** Present when token expired and re-auth is needed */
    needAuth?: boolean
    url?: string
    uuid?: string
  }
}

export interface ProcessedScore {
  chart_id: string
  name: string
  difficulty: string
  category: string
  constant: number
  constantv3: number
  score: number
  accuracy: number
  perfect_count: number
  good_count: number
  bad_count: number
  miss_count: number
  played_at: string
  singleRating: number
  rank: string
  isFC: boolean
  isAP: boolean
  isV3: boolean
  bestLevel: number
  achievedStatus: number[]
}

// 授权会话类型
export interface AuthSession {
  userId: string
  uuid: string
  url: string
  timestamp: number
  status: 'pending' | 'authorized' | 'failed' | 'timeout'
}
