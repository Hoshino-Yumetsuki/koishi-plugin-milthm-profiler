import type { Context } from 'koishi'
import {
  parseSaveData,
  calculateSingleRating,
  calculateSingleRatingV2,
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

    // 三路分支计算 singleRating（与 milthm-calculator-web 一致）
    // 1. isV3 → 用 V3 公式（realityv3）+ V3 定数
    // 2. useV3 但非 isV3 → 直接给 constantv3 + 1.5（V3 满分值）
    // 3. 其他 → 用 V2 公式（reality）+ V2 定数
    let singleRating: number
    let constant: number
    if (score.isV3) {
      constant = chartInfo.constantv3
      singleRating = calculateSingleRating(constant, score.score)
    } else if (useV3) {
      constant = chartInfo.constantv3
      singleRating = constant > 1e-5 ? constant + 1.5 : 0
    } else {
      constant = chartInfo.constant
      singleRating = calculateSingleRatingV2(constant, score.score)
    }
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

  // 按每个谱面合并记录（与 milthm-calculator-web mergeSongVersions 一致）
  const bestScores = new Map<string, ProcessedScore>()
  for (const score of processedScores) {
    const existing = bestScores.get(score.chart_id)
    if (!existing) {
      bestScores.set(score.chart_id, score)
    } else {
      // 合并策略：
      // - singleRating: 取最高（V2 和 V3 谁高用谁）
      // - score: 取最高
      // - accuracy: 取最高
      // - bestLevel: 取最小（等级越低越好）
      // - achievedStatus: 取并集
      // - isV3: 逻辑或
      if (score.singleRating > existing.singleRating) {
        // 用更高 rating 的记录作为基础
        const merged = { ...score }
        merged.score = Math.max(existing.score, score.score)
        merged.accuracy = Math.max(existing.accuracy, score.accuracy)
        merged.bestLevel = Math.min(existing.bestLevel, score.bestLevel)
        merged.achievedStatus = [
          ...new Set([...existing.achievedStatus, ...score.achievedStatus])
        ]
        merged.isV3 = existing.isV3 || score.isV3
        bestScores.set(score.chart_id, merged)
      } else {
        // 保留已有记录但合并字段
        existing.score = Math.max(existing.score, score.score)
        existing.accuracy = Math.max(existing.accuracy, score.accuracy)
        existing.bestLevel = Math.min(existing.bestLevel, score.bestLevel)
        existing.achievedStatus = [
          ...new Set([...existing.achievedStatus, ...score.achievedStatus])
        ]
        existing.isV3 = existing.isV3 || score.isV3
      }
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
