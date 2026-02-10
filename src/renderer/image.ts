/**
 *   .cardcover: 450×136px, border-radius 23px, padding 10px
 *   .cardimgcover: 204.444×115px, border-radius 15px, margin-right 8px
 *   .cardtext: width 205px, padding 5px
 *   .grade: max-width 50px
 *   .gradetext: font-size 2em, flex align-items center
 *   .down: grid gap 30px, padding 40px 40px 10px 10px
 *   category bar: 6×18px rounded
 *   .split-title: 3px solid #d1d8ff
 */

import { Renderer } from '@takumi-rs/wasm/node'
import { image, container, text as textNode } from '@takumi-rs/helpers'
import type { Context } from 'koishi'
import type { ProcessedScore, B20Result } from '../utils/processor'
import { loadConstantData } from '../utils/constant-loader'
import Vips from 'wasm-vips'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

// 用户信息接口
export interface B20UserInfo {
  username?: string
  nickname?: string
  userId?: string
}

// 全局状态
let assetsPath = ''
let renderer: Renderer | null = null
let vipsInstance: any = null

const pngCache = new Map<string, Uint8Array>()

export function setB20AssetsPath(dirname: string) {
  assetsPath = dirname
}

// 初始化

async function initVips() {
  if (vipsInstance) return vipsInstance
  vipsInstance = await Vips({ dynamicLibraries: ['vips-heif.wasm'] })
  vipsInstance.concurrency(1)
  vipsInstance.Cache.max(0)
  return vipsInstance
}

async function initRenderer() {
  if (renderer) return renderer
  renderer = new Renderer()
  const fontDirs = [
    ['Chill Round', 'ChillRoundF v3.0.ttf'],
    ['alimamafangyuanti', 'AlimamaFangYuanTiVF-Thin.ttf']
  ]
  for (const [dir, file] of fontDirs) {
    try {
      const fontPath = path.join(assetsPath, 'assets', 'fonts', dir, file)
      const fontBuffer = await fs.readFile(fontPath)
      renderer.loadFont(new Uint8Array(fontBuffer))
    } catch {
      // font not available
    }
  }
  return renderer
}

// AVIF → PNG

async function convertAvifToPng(avifBuffer: Buffer): Promise<Uint8Array> {
  const vips = await initVips()
  let img: any = null
  try {
    img = vips.Image.newFromBuffer(avifBuffer)
    const pngBuffer = img.writeToBuffer('.png', { compression: 6 })
    return new Uint8Array(pngBuffer)
  } finally {
    if (img) {
      try {
        img[Symbol.dispose]()
      } catch {}
    }
  }
}

async function loadAvifImage(relativePath: string): Promise<Uint8Array | null> {
  const cached = pngCache.get(relativePath)
  if (cached) return cached
  const fullPath = path.join(assetsPath, 'assets', relativePath)
  try {
    const avifBuffer = await fs.readFile(fullPath)
    const pngData = await convertAvifToPng(avifBuffer)
    if (pngCache.size < 200) pngCache.set(relativePath, pngData)
    return pngData
  } catch {
    return null
  }
}

function registerImage(r: Renderer, key: string, data: Uint8Array) {
  r.putPersistentImage({ src: key, data })
}

function getCoverFileName(songName: string): string {
  return songName.replace(/[#?><*"|/\\:]/g, '')
}

function getLevelIconName(item: ProcessedScore): string {
  if (item.bestLevel === 0) return '0'
  if (item.bestLevel === 6 || item.bestLevel === 7) return '6'
  if (Array.isArray(item.achievedStatus) && item.achievedStatus.includes(5))
    return `${item.bestLevel}0`
  if (Array.isArray(item.achievedStatus) && item.achievedStatus.includes(4))
    return `${item.bestLevel}1`
  return `${item.bestLevel}`
}

function isV3Highlight(item: ProcessedScore): boolean {
  return (
    item.isV3 ||
    item.bestLevel <= 1 ||
    item.score >= 1005000 ||
    (Array.isArray(item.achievedStatus) &&
      (item.achievedStatus.includes(2) || item.achievedStatus.includes(5)))
  )
}

/**
 * 类别色条颜色 (CSS 渐变取近似中间色)
 * .CB: linear-gradient(45deg, #6479f1, #9567e9) → #7A73ED
 * .CL: linear-gradient(45deg, #727272, #d3d3d3) → #A3A3A3
 * .DZ: linear-gradient(45deg, #93dbdb, #b2b5c5) → #A3C8D0
 * .SK: linear-gradient(45deg, #6584e2, #9cb8ec) → #809EE7
 * .SP: #FFFFFF
 * .UN: linear-gradient(45deg, #1a1da7, #4d77ec) → #344DCA
 */
function getCategoryColor(cat: string): string {
  switch (cat) {
    case 'CB':
      return '#7A73ED'
    case 'CL':
      return '#A3A3A3'
    case 'DZ':
      return '#A3C8D0'
    case 'SK':
      return '#809EE7'
    case 'SP':
      return '#FFFFFF'
    default:
      return '#344DCA'
  }
}

/**
 * 分数颜色 (新 UI CSS 类名对应)
 * .R (bestLevel=0): 渐变 #9A6EFA→#92C5FA → 兼容色 #969BFA
 * .AP (iconName ends '0'): 渐变 #A174FA→#E4D7FE → 兼容色 #BFA0FC
 * .FC (iconName ends '1'): 白色
 * 普通: 白色
 */
function getScoreColor(item: ProcessedScore): string {
  const iconName = getLevelIconName(item)
  if (iconName === '0' || iconName === '0-1') return '#969BFA'
  if (iconName.length > 1 && iconName[1] === '0') return '#BFA0FC'
  return '#FFFFFF'
}

/**
 * 星标计算
 */
function calculateStars(items: ProcessedScore[]): number {
  let maxConstant = -Infinity
  for (const item of items) {
    if (Array.isArray(item.achievedStatus) && item.achievedStatus.includes(5)) {
      if (item.constantv3 > maxConstant) maxConstant = item.constantv3
    }
  }
  if (maxConstant >= 240) return 114514
  if (maxConstant >= 200) return 9
  if (maxConstant >= 180) return 8
  if (maxConstant >= 160) return 7
  if (maxConstant >= 140) return 6
  if (maxConstant >= 120) return 5
  if (maxConstant >= 100) return 4
  if (maxConstant >= 12) return 3
  if (maxConstant >= 9) return 2
  if (maxConstant >= 6) return 1
  return 0
}

/**
 * 目标分推算
 */
function findScore(
  constant: number,
  target: number,
  errorReturn = 'No remaining'
): string {
  if (target <= 0) return '0600000'
  if (target > constant + 1.5) return errorReturn

  if (target >= constant) {
    if (target === constant + 1.5) return '1000000'
    return String(Math.ceil(850000 + (target - constant) * 100000)).padStart(
      7,
      '0'
    )
  }

  if (target >= Math.max(0, 0.5 * constant - 1.5)) {
    const denominator = constant / 300000 + 1 / 100000
    const score = (target + (constant * 11) / 6 + 8.5) / denominator
    return String(Math.min(Math.ceil(score), 849999)).padStart(7, '0')
  }

  if (Math.abs(constant - 3) < 1e-6) return '0600000'
  const score = 600000 + (target * 200000) / (constant - 3)
  return String(Math.min(Math.ceil(score), 699999)).padStart(7, '0')
}

/**
 * 检查 Top20 是否全部满足 V3 条件
 */
function checkTop20V3Condition(items: ProcessedScore[]): boolean {
  if (items.length === 0) return true
  const top20 = items.slice(0, Math.min(20, items.length))
  return top20.every(
    (it) =>
      it.isV3 ||
      it.bestLevel <= 1 ||
      it.score >= 1005000 ||
      (Array.isArray(it.achievedStatus) &&
        (it.achievedStatus.includes(2) || it.achievedStatus.includes(5)))
  )
}

function limitText(str: string, len: number): string {
  let l = 0
  const chars = [...str]
  for (let i = 0; i < chars.length; i++) {
    const code = chars[i].charCodeAt(0)
    if (code > 255) l += 2
    else if (/[A-Z]/.test(chars[i]) && chars[i] !== 'I') l += 1.5
    else l += 1
    if (l >= len) return `${str.slice(0, Math.max(i - 2, 0))}...`
  }
  return str
}

// 布局

const CANVAS_W = 1000

// 头部
const HEADER_PAD = 40

// 卡片网格 (.down padding: 40px 40px 10px 40px, gap: 30px)
const GRID_PAD_X = 40
const GRID_PAD_TOP = 10
const GRID_GAP = 30

// 卡片 (.cardcover: 450×136, border-radius 23, padding 10)
const CARD_W = 450
const CARD_H = 136
const CARD_RADIUS = 23
const CARD_PAD = 10

// 封面 (.cardimgcover: 204.444×115, border-radius 15, margin-right 8)
const COVER_W = 204
const COVER_H = 115
const COVER_RADIUS = 15
const COVER_MR = 8

// 文字区 (.cardtext: width 205, padding 5)
const TEXT_PAD = 5

// 段位图标 (.grade max-width 50, margin -10, margin-top -8)
const GRADE_ICON_W = 40

// 类别色条
const CAT_BAR_W = 6
const CAT_BAR_H = 18

// OVERFLOW 分割线区域高度
const SPLIT_H = 50

// 生成函数

export interface ChartProgress {
  CL: { all: number; ap: number; fc: number; cl: number }
  CB: { all: number; ap: number; fc: number; cl: number }
  SK: { all: number; ap: number; fc: number; cl: number }
  DZ: { all: number; ap: number; fc: number; cl: number }
}

export async function generateB20Image(
  _ctx: Context,
  result: B20Result,
  userInfo?: B20UserInfo
): Promise<Buffer> {
  const r = await initRenderer()
  await initVips()

  const items = result.best20
  const cardCount = items.length
  const b20Count = Math.min(cardCount, 20)
  const overflowCount = Math.max(0, cardCount - 20)

  // 网格: 2 列
  const cols = 2
  const b20Rows = Math.ceil(b20Count / cols)
  const overflowRows = Math.ceil(overflowCount / cols)

  // 头部区域高度
  const headerH = 260

  // B20 卡片区域高度
  const b20GridH = GRID_PAD_TOP + b20Rows * (CARD_H + GRID_GAP)

  // OVERFLOW 区域
  const overflowH =
    overflowCount > 0 ? SPLIT_H + overflowRows * (CARD_H + GRID_GAP) : 0

  // 底部
  const footerH = 90

  const canvasH = headerH + b20GridH + overflowH + footerH

  // ===== 1. 加载背景 =====
  const bgNames = [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    '11',
    '12',
    '13',
    '14',
    '15'
  ]
  const bgFile = bgNames[Math.floor(Math.random() * bgNames.length)]
  const bgPng = await loadAvifImage(`backgrounds/${bgFile}.avif`)
  if (bgPng) registerImage(r, 'bg', bgPng)

  // ===== 2. 预加载封面和段位图标 =====
  const coverKeys: (string | null)[] = []
  const iconKeys: (string | null)[] = []
  const registeredIcons = new Set<string>()

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    // 封面
    const coverFileName = getCoverFileName(item.name)
    const coverKey = `cover_${i}`
    const coverPng = await loadAvifImage(`covers/${coverFileName}.avif`)
    if (coverPng) {
      registerImage(r, coverKey, coverPng)
      coverKeys.push(coverKey)
    } else {
      coverKeys.push(null)
    }
    // 段位图标
    const iconName = getLevelIconName(item)
    const iconKey = `icon_${iconName}`
    if (!registeredIcons.has(iconKey)) {
      const iconPng = await loadAvifImage(`covers/${iconName}.avif`)
      if (iconPng) {
        registerImage(r, iconKey, iconPng)
        registeredIcons.add(iconKey)
      }
    }
    iconKeys.push(registeredIcons.has(iconKey) ? iconKey : null)
  }

  // ===== 3. 构建布局 =====
  const children: any[] = []

  // --- 背景 ---
  if (bgPng) {
    children.push(
      image({
        src: 'bg',
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          width: CANVAS_W,
          height: canvasH
        }
      })
    )
  }

  // --- 暗色蒙层 (main background-color: #0009 → 60% opacity) ---
  children.push(
    container({
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: CANVAS_W,
        height: canvasH,
        backgroundColor: 'rgba(0,0,0,0.6)'
      }
    })
  )

  // --- 头部渐变遮罩 (.cover: linear-gradient to top #000B) ---
  children.push(
    container({
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: CANVAS_W,
        height: headerH,
        backgroundColor: 'rgba(0,0,0,0.35)'
      }
    })
  )

  // ===== 预加载星标图片 =====
  const starCount = calculateStars(result.allScores || items)
  let starImageKey: string | null = null
  if (starCount > 0) {
    const starPng = await loadAvifImage(`covers/${starCount}-star.avif`)
    if (starPng) {
      starImageKey = `star_${starCount}`
      registerImage(r, starImageKey, starPng)
    }
  }

  // ===== 头部内容 =====
  buildHeader(children, result, userInfo, items, starImageKey)

  // ===== B20 卡片 =====
  const gridStartY = headerH

  for (let i = 0; i < b20Count; i++) {
    const colIdx = i % cols
    const rowIdx = Math.floor(i / cols)
    const cardX = GRID_PAD_X + colIdx * (CARD_W + GRID_GAP)
    const cardY = gridStartY + GRID_PAD_TOP + rowIdx * (CARD_H + GRID_GAP)
    buildCard(
      children,
      items[i],
      i,
      cardX,
      cardY,
      coverKeys[i],
      iconKeys[i],
      result.averageRating,
      items
    )
  }

  // ===== OVERFLOW 分割线 + 卡片 =====
  if (overflowCount > 0) {
    const splitY = gridStartY + b20GridH
    buildOverflowSplit(children, splitY)

    const overflowGridY = splitY + SPLIT_H
    for (let i = 20; i < cardCount; i++) {
      const oi = i - 20
      const colIdx = oi % cols
      const rowIdx = Math.floor(oi / cols)
      const cardX = GRID_PAD_X + colIdx * (CARD_W + GRID_GAP)
      const cardY = overflowGridY + rowIdx * (CARD_H + GRID_GAP)
      buildCard(
        children,
        items[i],
        i,
        cardX,
        cardY,
        coverKeys[i],
        iconKeys[i],
        result.averageRating,
        items
      )
    }
  }

  // 底部 footer
  buildFooter(children, canvasH, footerH)

  // 根容器
  const root = container({
    children,
    style: {
      position: 'relative',
      width: CANVAS_W,
      height: canvasH,
      display: 'block',
      backgroundColor: '#191820'
    }
  })

  const buffer = r.render(root, {
    width: CANVAS_W,
    height: canvasH,
    format: 'png'
  })
  return Buffer.from(buffer)
}

/* ===== 头部构建 ===== */

function buildHeader(
  children: any[],
  result: B20Result,
  userInfo: B20UserInfo | undefined,
  items: ProcessedScore[],
  starImageKey: string | null
) {
  const username = userInfo?.username || userInfo?.nickname || 'UNKNOWN'
  const starCount = calculateStars(result.allScores || items)
  const isRealityV3 = checkTop20V3Condition(items)

  // 计算 Chart Progress (使用所有成绩而不仅是 best20)
  const progress = calculateChartProgress(result.allScores || items)

  // 左上: 标题 h1 (2.5em ≈ 40px)
  children.push(
    container({
      style: { position: 'absolute', top: HEADER_PAD, left: HEADER_PAD },
      children: [
        textNode('Milthm Profiler', { fontSize: 40, color: '#ffffff' })
      ]
    })
  )

  // 信息文本 (.texts, line-height 1.7em)
  let infoY = HEADER_PAD + 58
  children.push(
    container({
      style: { position: 'absolute', top: infoY, left: HEADER_PAD + 3 },
      children: [
        textNode(
          'Generated From: https://github.com/Hoshino-Yumetsuki/koishi-plugin-milthm-profiler',
          { fontSize: 14, color: '#cfccdb' }
        )
      ]
    })
  )
  infoY += 24
  children.push(
    container({
      style: { position: 'absolute', top: infoY, left: HEADER_PAD + 3 },
      children: [
        textNode('Chart Progress:', { fontSize: 14, color: '#ffffff' })
      ]
    })
  )

  // Chart Progress 详情 (两列四行: CL/CB 左列, SK/DZ 右列)
  infoY += 22
  const categories: Array<{
    key: keyof typeof progress
    color: string
    label: string
  }> = [
    { key: 'CL', color: '#A3A3A3', label: 'CL' },
    { key: 'CB', color: '#7A73ED', label: 'CB' },
    { key: 'SK', color: '#809EE7', label: 'SK' },
    { key: 'DZ', color: '#A3C8D0', label: 'DZ' }
  ]

  // 左列: CL, CB
  for (let ci = 0; ci < 2; ci++) {
    const cat = categories[ci]
    const p = progress[cat.key]
    const rowY = infoY + ci * 22

    // 色条 (.prog-line 5×18)
    children.push(
      container({
        style: {
          position: 'absolute',
          left: HEADER_PAD + 10,
          top: rowY + 1,
          width: 5,
          height: 18,
          backgroundColor: cat.color,
          borderRadius: 100
        }
      })
    )

    // AP (紫色 #efbaff)
    const apText = `AP ${p.ap}`
    children.push(
      container({
        style: {
          position: 'absolute',
          left: HEADER_PAD + 22,
          top: rowY + 2
        },
        children: [textNode(apText, { fontSize: 12, color: '#efbaff' })]
      })
    )

    // FC (蓝色 #84C9FA)
    const fcText = `FC ${p.fc}`
    children.push(
      container({
        style: {
          position: 'absolute',
          left: HEADER_PAD + 82,
          top: rowY + 2
        },
        children: [textNode(fcText, { fontSize: 12, color: '#84C9FA' })]
      })
    )

    // CL (灰色 #c4c4c4)
    const clText = `CL ${p.cl}`
    children.push(
      container({
        style: {
          position: 'absolute',
          left: HEADER_PAD + 142,
          top: rowY + 2
        },
        children: [textNode(clText, { fontSize: 12, color: '#c4c4c4' })]
      })
    )

    // / total
    const totalText = `/ ${p.all}`
    children.push(
      container({
        style: {
          position: 'absolute',
          left: HEADER_PAD + 198,
          top: rowY + 2
        },
        children: [textNode(totalText, { fontSize: 12, color: '#ffffff' })]
      })
    )
  }

  // 右列: SK, DZ
  const rightColOffset = 260
  for (let ci = 0; ci < 2; ci++) {
    const cat = categories[ci + 2]
    const p = progress[cat.key]
    const rowY = infoY + ci * 22

    // 色条
    children.push(
      container({
        style: {
          position: 'absolute',
          left: HEADER_PAD + rightColOffset + 10,
          top: rowY + 1,
          width: 5,
          height: 18,
          backgroundColor: cat.color,
          borderRadius: 100
        }
      })
    )

    // AP
    const apText = `AP ${p.ap}`
    children.push(
      container({
        style: {
          position: 'absolute',
          left: HEADER_PAD + rightColOffset + 22,
          top: rowY + 2
        },
        children: [textNode(apText, { fontSize: 12, color: '#efbaff' })]
      })
    )

    // FC
    const fcText = `FC ${p.fc}`
    children.push(
      container({
        style: {
          position: 'absolute',
          left: HEADER_PAD + rightColOffset + 82,
          top: rowY + 2
        },
        children: [textNode(fcText, { fontSize: 12, color: '#84C9FA' })]
      })
    )

    // CL
    const clText = `CL ${p.cl}`
    children.push(
      container({
        style: {
          position: 'absolute',
          left: HEADER_PAD + rightColOffset + 142,
          top: rowY + 2
        },
        children: [textNode(clText, { fontSize: 12, color: '#c4c4c4' })]
      })
    )

    // / total
    const totalText = `/ ${p.all}`
    children.push(
      container({
        style: {
          position: 'absolute',
          left: HEADER_PAD + rightColOffset + 198,
          top: rowY + 2
        },
        children: [textNode(totalText, { fontSize: 12, color: '#ffffff' })]
      })
    )
  }

  // 具体 AP/FC/CL 数字统计行
  infoY += 50

  // 右上: 用户名 (.name font-size 1.5em = 24px, text-align right)
  const rightX = CANVAS_W - HEADER_PAD
  children.push(
    container({
      style: {
        position: 'absolute',
        top: HEADER_PAD + 5,
        left: rightX - estimateTextW(username, 24)
      },
      children: [textNode(username, { fontSize: 24, color: '#ffffff' })]
    })
  )

  // Reality 徽章 (flex row-reverse)
  const realityY = HEADER_PAD + 40
  const realityVal = result.averageRating.toFixed(2)
  const realityNumW = estimateTextW(realityVal, 21)
  const realityBadgeW = 75
  const realityTotalW = realityBadgeW + 13 + realityNumW

  // "REALITY" 圆角框 — V3 使用紫色渐变背景，否则白底
  const badgeLeft = rightX - realityTotalW
  if (isRealityV3) {
    // V3 样式: .reality-v3 — 紫色发光背景
    children.push(
      container({
        style: {
          position: 'absolute',
          left: badgeLeft,
          top: realityY,
          width: realityBadgeW,
          height: 23,
          backgroundColor: '#5B3FD9',
          borderRadius: 12
        }
      })
    )
    children.push(
      container({
        style: {
          position: 'absolute',
          left: badgeLeft + 10,
          top: realityY + 4
        },
        children: [textNode('REALITY', { fontSize: 12, color: '#ffffff' })]
      })
    )
  } else {
    // 普通样式: 白色背景
    children.push(
      container({
        style: {
          position: 'absolute',
          left: badgeLeft,
          top: realityY,
          width: realityBadgeW,
          height: 23,
          backgroundColor: '#ffffff',
          borderRadius: 12
        }
      })
    )
    children.push(
      container({
        style: {
          position: 'absolute',
          left: badgeLeft + 10,
          top: realityY + 4
        },
        children: [textNode('REALITY', { fontSize: 12, color: '#000000' })]
      })
    )
  }

  // Reality 数值 (.reality-text 1.3em, font-weight 600)
  children.push(
    container({
      style: {
        position: 'absolute',
        left: badgeLeft + realityBadgeW + 13,
        top: realityY - 1
      },
      children: [textNode(realityVal, { fontSize: 21, color: '#ffffff' })]
    })
  )

  // 星标 (使用对应星级图标)
  if (starCount > 0 && starImageKey) {
    const starImgW = 80
    children.push(
      image({
        src: starImageKey,
        style: {
          position: 'absolute',
          left: rightX - starImgW,
          top: realityY + 28,
          width: starImgW
        }
      })
    )
  }

  // TOP20 AVG + Date (右侧下方, line-height 1.7em)
  const rightInfoY = realityY + (starCount > 0 ? 60 : 35)
  const avgText = `TOP20 AVG ${result.averageRating.toFixed(5)}`
  children.push(
    container({
      style: {
        position: 'absolute',
        left: rightX - estimateTextW(avgText, 15),
        top: rightInfoY
      },
      children: [textNode(avgText, { fontSize: 15, color: '#ffffff' })]
    })
  )

  const now = new Date()
  const dateStr = `At ${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`
  children.push(
    container({
      style: {
        position: 'absolute',
        left: rightX - estimateTextW(dateStr, 15),
        top: rightInfoY + 26
      },
      children: [textNode(dateStr, { fontSize: 15, color: '#ffffff' })]
    })
  )

  // Tip (底部左侧)
  // const tipY = infoY + 10
  // children.push(
  // container({
  // style: { position: 'absolute', left: HEADER_PAD + 3, top: tipY },
  // children: [
  // textNode('Tip: 查分上 https://mhtlim.top/', {
  // fontSize: 13,
  // color: '#ffffff'
  // })
  // ]
  // })
  // )
}

/* ===== Chart Progress 计算 ===== */

function calculateChartProgress(items: ProcessedScore[]): ChartProgress {
  // 从 constantData 获取各难度总谱面数
  const constantData = loadConstantData()

  const progress: ChartProgress = {
    CL: { all: 0, ap: 0, fc: 0, cl: 0 },
    CB: { all: 0, ap: 0, fc: 0, cl: 0 },
    SK: { all: 0, ap: 0, fc: 0, cl: 0 },
    DZ: { all: 0, ap: 0, fc: 0, cl: 0 }
  }

  // 统计各难度总谱面数
  for (const [, entry] of constantData) {
    const cat = entry.difficulty as string
    if (cat === 'CL' || cat === 'CB' || cat === 'SK' || cat === 'DZ') {
      progress[cat].all++
    }
  }

  // 统计用户成绩
  for (const item of items) {
    const cat = item.category as string
    if (cat !== 'CL' && cat !== 'CB' && cat !== 'SK' && cat !== 'DZ') continue

    // CL (已通关): bestLevel !== 6
    if (item.bestLevel !== 6) {
      progress[cat as keyof ChartProgress].cl++
    }
    // AP: achievedStatus includes 5, 或 bestLevel === 0
    if (
      (Array.isArray(item.achievedStatus) && item.achievedStatus.includes(5)) ||
      item.bestLevel === 0
    ) {
      progress[cat as keyof ChartProgress].ap++
      progress[cat as keyof ChartProgress].fc++
    }
    // FC: achievedStatus includes 4, 或 bestLevel === 0
    else if (
      (Array.isArray(item.achievedStatus) && item.achievedStatus.includes(4)) ||
      item.bestLevel === 0
    ) {
      progress[cat as keyof ChartProgress].fc++
    }
  }

  return progress
}

/* ===== 卡片构建 ===== */

function buildCard(
  children: any[],
  item: ProcessedScore,
  index: number,
  cardX: number,
  cardY: number,
  coverKey: string | null,
  iconKey: string | null,
  averageRating: number,
  allItems: ProcessedScore[]
) {
  const highlight = isV3Highlight(item)

  // --- 卡片阴影 (.cardcover box-shadow: 0 5px 5px #0b143377) ---
  children.push(
    container({
      style: {
        position: 'absolute',
        left: cardX + 2,
        top: cardY + 3,
        width: CARD_W - 4,
        height: CARD_H,
        backgroundColor: 'rgba(11,20,51,0.47)',
        borderRadius: CARD_RADIUS
      }
    })
  )

  // --- 卡片背景 (.cardcover) ---
  children.push(
    container({
      style: {
        position: 'absolute',
        left: cardX,
        top: cardY,
        width: CARD_W,
        height: CARD_H,
        backgroundColor: highlight
          ? 'rgba(47,46,77,0.85)'
          : 'rgba(48,48,63,0.85)',
        borderRadius: CARD_RADIUS
      }
    })
  )

  // --- 封面图 (.cardimgcover 204×115, 垂直居中) ---
  const coverX = cardX + CARD_PAD
  const coverY = cardY + (CARD_H - COVER_H) / 2
  if (coverKey) {
    children.push(
      container({
        style: {
          position: 'absolute',
          left: coverX,
          top: coverY,
          width: COVER_W,
          height: COVER_H,
          borderRadius: COVER_RADIUS,
          overflow: 'hidden'
        },
        children: [
          image({ src: coverKey, style: { width: COVER_W, height: COVER_H } })
        ]
      })
    )
  } else {
    children.push(
      container({
        style: {
          position: 'absolute',
          left: coverX,
          top: coverY,
          width: COVER_W,
          height: COVER_H,
          backgroundColor: 'rgba(80,80,100,0.5)',
          borderRadius: COVER_RADIUS
        }
      })
    )
  }

  // --- 文字区坐标 ---
  const textX = coverX + COVER_W + COVER_MR + TEXT_PAD
  const textStartY = cardY + CARD_PAD

  // --- 排名号 #N (右上, text-align right) ---
  const rankStr = `#${index + 1}`
  const rankColor = highlight
    ? 'rgba(203,190,255,0.93)'
    : 'rgba(221,227,255,0.79)'
  const rankW = estimateTextW(rankStr, 14)
  children.push(
    container({
      style: {
        position: 'absolute',
        left: cardX + CARD_W - CARD_PAD - rankW - 2,
        top: textStartY + 6
      },
      children: [textNode(rankStr, { fontSize: 14, color: rankColor })]
    })
  )

  // --- Row 1: 类别色条 + 歌名 ---
  const row1Y = textStartY + TEXT_PAD

  // 色条 (6×18, border-radius 5)
  children.push(
    container({
      style: {
        position: 'absolute',
        left: textX + 3,
        top: row1Y + 1,
        width: CAT_BAR_W,
        height: CAT_BAR_H,
        backgroundColor: getCategoryColor(item.category),
        borderRadius: 3
      }
    })
  )

  // 歌名 (h4.cardtitle, font-weight normal)
  const maxTitleLen = 21 - rankStr.length
  const songName = limitText(item.name, maxTitleLen)
  children.push(
    container({
      style: { position: 'absolute', left: textX + CAT_BAR_W + 10, top: row1Y },
      children: [textNode(songName, { fontSize: 14, color: '#ffffff' })]
    })
  )

  // --- Row 2: 段位图标 + 分数 (.gradetext 2em = 32px, flex) ---
  const row2Y = row1Y + CAT_BAR_H + 9 // padding-bottom 9px on title row

  // 段位图标 (.grade max-width 50, margin -10)
  if (iconKey) {
    children.push(
      image({
        src: iconKey,
        style: {
          position: 'absolute',
          left: textX - 5,
          top: row2Y - 5,
          width: GRADE_ICON_W,
          height: GRADE_ICON_W
        }
      })
    )
  }

  // 分数 (.score padding-left 10, font-size 2em = 32px)
  const scoreStr = String(item.score).padStart(7, '0')
  const scoreColor = getScoreColor(item)
  children.push(
    container({
      style: {
        position: 'absolute',
        left: textX + GRADE_ICON_W + 2,
        top: row2Y
      },
      children: [textNode(scoreStr, { fontSize: 28, color: scoreColor })]
    })
  )

  // --- Row 3: 目标分 (font-size 0.9em ≈ 14px, margin-left 9, margin-bottom 5) ---
  const row3Y = row2Y + 34

  // 计算目标分 (与 web getCardHtml 逻辑一致)
  const avg = averageRating
  const item20Rating = allItems.length > 19 ? allItems[19].singleRating : 0
  const ceilVal = Math.ceil(avg * 100 - 0.5) + 0.5
  let targetScoreText: string
  if (ceilVal !== avg * 100) {
    const target =
      (ceilVal - avg * 100) / 5 + Math.max(item.singleRating, item20Rating)
    targetScoreText = `>> Goal: ${findScore(item.constantv3, target)}`
  } else {
    targetScoreText = '>> Goal: No remaining'
  }

  children.push(
    container({
      style: { position: 'absolute', left: textX + 9, top: row3Y },
      children: [
        textNode(targetScoreText, {
          fontSize: 12,
          color: 'rgba(221,227,255,0.79)'
        })
      ]
    })
  )

  // --- Row 4: 准确率 + rating (space-between, font-size 0.85em ≈ 13.6px) ---
  const row4Y = row3Y + 19
  const acc = `${(item.accuracy * 100 || 0).toFixed(2)}%`
  children.push(
    container({
      style: { position: 'absolute', left: textX + 3, top: row4Y },
      children: [
        textNode(acc, { fontSize: 12, color: 'rgba(255,255,255,0.84)' })
      ]
    })
  )

  // rating (右对齐, V3 时为蓝色 #9ac9ff)
  const constText = item.constantv3.toFixed(1)
  const ratingText = `${item.category} ${constText} > ${item.singleRating.toFixed(5)}`
  const ratingColor = highlight ? '#9ac9ff' : 'rgba(255,255,255,0.84)'
  const ratingW = estimateTextW(ratingText, 12)
  children.push(
    container({
      style: {
        position: 'absolute',
        left: cardX + CARD_W - CARD_PAD - ratingW - 5,
        top: row4Y
      },
      children: [textNode(ratingText, { fontSize: 12, color: ratingColor })]
    })
  )
}

/* ===== OVERFLOW 分割线 ===== */

function buildOverflowSplit(children: any[], splitY: number) {
  // 竖条 (.line: 3px solid #d1d8ff, height 25px, border-radius 100)
  children.push(
    container({
      style: {
        position: 'absolute',
        left: GRID_PAD_X + 20,
        top: splitY + 10,
        width: 6,
        height: 25,
        backgroundColor: '#d1d8ff',
        borderRadius: 3
      }
    })
  )
  // "OVERFLOW" 文字 (h2, font-weight normal)
  children.push(
    container({
      style: { position: 'absolute', left: GRID_PAD_X + 34, top: splitY + 10 },
      children: [textNode('OVERFLOW', { fontSize: 22, color: '#d1d8ff' })]
    })
  )
  // 横线 (hr: background-color #bbc5ff, height 4, border-radius 100)
  children.push(
    container({
      style: {
        position: 'absolute',
        left: GRID_PAD_X + 170,
        top: splitY + 22,
        width: CANVAS_W - GRID_PAD_X * 2 - 170,
        height: 4,
        backgroundColor: '#bbc5ff',
        borderRadius: 2
      }
    })
  )
}

/* ===== Footer ===== */

function buildFooter(children: any[], canvasH: number, footerH: number) {
  const footerY = canvasH - footerH

  // 底部渐变遮罩 (footer: linear-gradient to bottom #0000→#000B)
  children.push(
    container({
      style: {
        position: 'absolute',
        left: 0,
        top: footerY,
        width: CANVAS_W,
        height: footerH,
        backgroundColor: 'rgba(0,0,0,0.4)'
      }
    })
  )

  // 主 footer 文字
  const footerText =
    'Generated by Milthm Profiler | Powered by Koishi Framework & Q78KG a.k.a. Hoshino Yumetsuki'
  const footerW = estimateTextW(footerText, 13)
  children.push(
    container({
      style: {
        position: 'absolute',
        left: (CANVAS_W - footerW) / 2,
        top: footerY + 15
      },
      children: [
        textNode(footerText, { fontSize: 13, color: 'rgba(255,255,255,0.77)' })
      ]
    })
  )

  // UA 行 (模拟浏览器 UA)
  const uaText = 'milthm-profiler (Koishi Plugin)'
  const uaW = estimateTextW(uaText, 10)
  children.push(
    container({
      style: {
        position: 'absolute',
        left: (CANVAS_W - uaW) / 2,
        top: footerY + 38
      },
      children: [
        textNode(uaText, { fontSize: 10, color: 'rgba(221,221,221,0.67)' })
      ]
    })
  )

  // Updated 时间戳行
  const now = new Date()
  const dateStr = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`
  const updatedText = `Updated at ${dateStr}`
  const updatedW = estimateTextW(updatedText, 10)
  children.push(
    container({
      style: {
        position: 'absolute',
        left: (CANVAS_W - updatedW) / 2,
        top: footerY + 56
      },
      children: [
        textNode(updatedText, { fontSize: 10, color: 'rgba(221,221,221,0.67)' })
      ]
    })
  )
}

/* ===== 文本宽度估算 ===== */

function estimateTextW(str: string, fontSize: number): number {
  let w = 0
  for (const ch of str) {
    const code = ch.charCodeAt(0)
    if (code > 255)
      w += fontSize * 1.0 // CJK / emoji
    else if (/[A-Z]/.test(ch) && ch !== 'I') w += fontSize * 0.7
    else if (/[a-z]/.test(ch)) w += fontSize * 0.55
    else if (/[0-9]/.test(ch)) w += fontSize * 0.6
    else if (ch === ' ') w += fontSize * 0.3
    else if (ch === '.') w += fontSize * 0.3
    else w += fontSize * 0.55
  }
  return w
}
