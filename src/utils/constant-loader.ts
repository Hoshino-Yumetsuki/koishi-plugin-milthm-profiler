import constantDataRaw from '../data/constantData.json'

export interface ConstantDataEntry {
  constantv3: number // V3 定数（第一个元素）
  constantv2?: number // V2 定数（第二个元素，可选）
  difficulty: string // 'CL' | 'CB' | 'SK' | 'DZ' | 'SP'
  name: string
  bpm: number | null
  noteCount: number
}

// 全局缓存
let constantDataCache: Map<string, ConstantDataEntry> | null = null

/**
 * 加载定数数据
 */
export function loadConstantData(): Map<string, ConstantDataEntry> {
  if (constantDataCache) {
    return constantDataCache
  }

  const dataMap = new Map<string, ConstantDataEntry>()

  for (const [chartId, values] of Object.entries(constantDataRaw)) {
    const arr = values as any[]

    // 数据格式有两种:
    // 1. [constantv3, constantv2, difficulty, name, bpm, noteCount, ...]
    // 2. [constantv3, difficulty, name, bpm, noteCount, ...]
    let constantv3 = 0
    let constantv2 = 0
    let difficulty = ''
    let name = ''
    let bpm = null
    let noteCount = 0

    if (
      typeof arr[0] === 'number' &&
      typeof arr[1] === 'number' &&
      typeof arr[2] === 'string'
    ) {
      // 格式 1: 有 constantv2
      constantv3 = arr[0]
      constantv2 = arr[1]
      difficulty = arr[2]
      name = arr[3] || '未知曲目'
      bpm = arr[4]
      noteCount = arr[5] || 0
    } else if (typeof arr[0] === 'number' && typeof arr[1] === 'string') {
      // 格式 2: 只有 constantv3
      constantv3 = arr[0]
      constantv2 = arr[0] // 如果没有 v2，默认使用 v3
      difficulty = arr[1]
      name = arr[2] || '未知曲目'
      bpm = arr[3]
      noteCount = arr[4] || 0
    }

    dataMap.set(chartId, {
      constantv3,
      constantv2,
      difficulty: difficulty || 'CB',
      name,
      bpm,
      noteCount
    })
  }

  constantDataCache = dataMap
  return dataMap
}

/**
 * 难度代码转换为可读名称
 */
export function difficultyToName(diff: string): string {
  const map: Record<string, string> = {
    CL: 'CELESTIAL',
    CB: 'CHERISH',
    SK: 'SEEKER',
    DZ: 'DAZE',
    SP: 'SPECIAL',
    'CB*': 'CHERISH*',
    'SK*': 'SEEKER*',
    'DZ*': 'DAZE*'
  }
  return map[diff] || diff
}
