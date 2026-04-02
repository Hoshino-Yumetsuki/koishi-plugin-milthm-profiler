/// <reference path="../env.d.ts" />
import constantsData from 'virtual:milthm-constants'

interface ConstantDataObjectEntry {
  constant?: number
  constantv3?: number
  category?: string
  name?: string
  yct?: number
}

type ConstantDataRawEntry =
  | [number?, number?, string?, string?, number?, ...unknown[]]
  | ConstantDataObjectEntry

function isObjectEntry(
  entry: ConstantDataRawEntry
): entry is ConstantDataObjectEntry {
  return !Array.isArray(entry)
}

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

  for (const [chartId, rawEntry] of Object.entries(
    constantsData as Record<string, ConstantDataRawEntry>
  )) {
    let constant = 0
    let constantv3 = 0
    let difficulty = ''
    let name = '未知曲目'
    let noteCount: number | undefined

    if (isObjectEntry(rawEntry)) {
      constant = rawEntry.constant ?? 0
      constantv3 = rawEntry.constantv3 ?? rawEntry.constant ?? 0
      difficulty = rawEntry.category ?? ''
      name = rawEntry.name || '未知曲目'
      noteCount = rawEntry.yct
    } else {
      const [rawConstant, rawConstantV3, rawDifficulty, rawName, rawNoteCount] =
        rawEntry

      const arr: [number?, number?, string?, string?, number?] = [
        rawConstant,
        rawConstantV3,
        rawDifficulty,
        rawName,
        rawNoteCount
      ]

      if (typeof arr[1] !== 'number') {
        arr.splice(1, 0, arr[0])
      }

      // 解析后数组格式统一为:
      // [constant, constantv3, category, name, yct, ad, ae, af, ag]
      constant = arr[0] ?? 0
      constantv3 = arr[1] ?? 0
      difficulty = arr[2] ?? ''
      name = arr[3] || '未知曲目'
      noteCount = arr[4]
    }

    // yct 字段：如果不存在则取 ceil(constantv3 * 20)
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
