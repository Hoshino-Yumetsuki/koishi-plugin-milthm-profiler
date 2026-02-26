/// <reference path="../env.d.ts" />
import constantsData from 'virtual:milthm-constants'

export interface ConstantDataEntry {
  constant: number // V2 定数（旧版）
  constantv3: number // V3 定数（新版，4.0+）
  difficulty: string // 'CL' | 'CB' | 'SK' | 'DZ' | 'SP' | 'Ø' | 'CB*' | 'SK*' | 'DZ*'
  name: string
  noteCount: number // yct 字段（物量估算）
}

let constantDataCache: Map<string, ConstantDataEntry> | null = null

export function loadConstantData(): Map<string, ConstantDataEntry> {
  if (constantDataCache) {
    return constantDataCache
  }

  const dataMap = new Map<string, ConstantDataEntry>()

  for (const [chartId, rawArr] of Object.entries(constantsData)) {
    const arr = [...rawArr]

    if (typeof arr[1] !== 'number') {
      arr.splice(1, 0, arr[0])
    }

    // 解析后数组格式统一为:
    // [constant, constantv3, category, name, yct, ad, ae, af, ag]
    const constant = (arr[0] as number) ?? 0
    const constantv3 = (arr[1] as number) ?? 0
    const difficulty = (arr[2] as string) ?? ''
    const name = (arr[3] as string) || '未知曲目'

    // yct 字段：如果不存在则取 ceil(constantv3 * 20)
    let noteCount = arr[4] as number | undefined
    if (noteCount == null) {
      noteCount = constantv3 != null ? Math.ceil(constantv3 * 20) : 0
    }

    dataMap.set(chartId, {
      constant,
      constantv3,
      difficulty: difficulty || 'CB',
      name,
      noteCount
    })
  }

  constantDataCache = dataMap
  return dataMap
}

export function difficultyToName(diff: string): string {
  const map: Record<string, string> = {
    CL: 'CELESTIAL',
    CB: 'CHERISH',
    SK: 'SEEKER',
    DZ: 'DAZE',
    SP: 'SPECIAL',
    'CB*': 'CHERISH*',
    'SK*': 'SEEKER*',
    'DZ*': 'DAZE*',
    Ø: 'Ø'
  }
  return map[diff] || diff
}
