import type { Context } from 'koishi'
import {
  parseSaveData,
  calculateSingleRating,
  calculateAverageRating,
  getRank
} from './calculator'
import { loadConstantData, difficultyToName } from './constant-loader'

export interface ChartInfo {
  chart_id: string
  name: string
  difficulty: string // EASY, NORMAL, HARD, EXPERT
  constant: number
}

export interface ProcessedScore {
  chart_id: string
  name: string
  difficulty: string // CELESTIAL, CHERISH, SEEKER, DAZE, SPECIAL
  category: string // 原始难度代码: CL, CB, SK, DZ, SP
  constant: number
  constantv3: number
  score: number
  accuracy: number
  perfect_count: number
  good_count: number
  bad_count: number
  miss_count: number
  played_at: string
  // 计算得出
  singleRating: number
  rank: string
  isFC: boolean
  isAP: boolean
  // 原始存档字段（用于渲染）
  isV3: boolean
  bestLevel: number
  achievedStatus: number[]
}

export interface B20Result {
  best20: ProcessedScore[]
  allScores: ProcessedScore[]
  averageRating: number
  totalScores: number
}

/**
 * 处理存档数据，计算 B20
 */
export function processSaveData(_ctx: Context, saveContent: string): B20Result {
  // 解析存档
  const scores = parseSaveData(saveContent)

  if (scores.length === 0) {
    return {
      best20: [],
      allScores: [],
      averageRating: 0,
      totalScores: 0
    }
  }

  // 加载定数数据库
  const constantData = loadConstantData()

  const processedScores: ProcessedScore[] = []

  for (const score of scores) {
    // 根据 chart_id 查找定数
    const chartInfo = constantData.get(score.chart_id)

    if (!chartInfo || chartInfo.constantv3 <= 0) {
      // 跳过特殊谱面或没有定数的谱面
      continue
    }

    // 判断是否使用 V3 Rating（参考 milthm-calculator-web 逻辑）
    const useV3 =
      score.isV3 || // 来自 SongRecordsV3
      (score.bestLevel !== undefined && score.bestLevel <= 1) || // 满分等级
      score.score >= 1005000 || // AP 分数
      (score.achievedStatus &&
        (score.achievedStatus.includes(2) || score.achievedStatus.includes(5))) // 特殊成就

    // 根据条件选择定数和计算方式
    const constant = useV3
      ? chartInfo.constantv3
      : chartInfo.constantv2 || chartInfo.constantv3
    const singleRating = calculateSingleRating(constant, score.score)
    const rank = getRank(score.score)

    // FC/AP 判断
    const isAP = score.score >= 1005000
    const isFC = score.score >= 995000

    processedScores.push({
      chart_id: score.chart_id,
      name: chartInfo.name,
      difficulty: difficultyToName(chartInfo.difficulty),
      category: chartInfo.difficulty,
      constant: constant,
      constantv3: chartInfo.constantv3,
      score: score.score,
      accuracy: score.accuracy,
      perfect_count: score.perfect_count,
      good_count: score.good_count,
      bad_count: score.bad_count,
      miss_count: score.miss_count,
      played_at: score.played_at,
      singleRating,
      rank,
      isFC,
      isAP,
      isV3: !!score.isV3,
      bestLevel: score.bestLevel ?? 6,
      achievedStatus: score.achievedStatus || []
    })
  }

  // 按每个谱面保留最高分
  const bestScores = new Map<string, ProcessedScore>()
  for (const score of processedScores) {
    const existing = bestScores.get(score.chart_id)
    if (!existing || score.score > existing.score) {
      bestScores.set(score.chart_id, score)
    }
  }

  // 排序并取 B20
  const allBest = Array.from(bestScores.values())
  const best20 = allBest
    .sort((a, b) => b.singleRating - a.singleRating)
    .slice(0, 20)

  const ratings = best20.map((s) => s.singleRating)
  const averageRating = calculateAverageRating(ratings)

  return {
    best20,
    allScores: allBest,
    averageRating,
    totalScores: allBest.length
  }
}

/**
 * 获取评级对应的 Emoji
 */
function _getRankEmoji(rank: string): string {
  const emojiMap: Record<string, string> = {
    'S++': '🏆',
    'S+': '🥇',
    S: '🥈',
    A: '🥉',
    B: '📘',
    C: '📙',
    D: '📕',
    F: '💀'
  }
  return emojiMap[rank] || '⭐'
}
