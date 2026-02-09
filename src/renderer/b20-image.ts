/**
 * B20 图片生成器
 * 使用 takumi-rs + wasm-vips 生成查分图片
 * 精确对齐 milthm-calculator-web 的 downloadImage (MilAerno 新 UI)
 *
 * 参考 CSS 关键尺寸:
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
import Vips from 'wasm-vips'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

/* ===== 用户信息接口 ===== */
export interface B20UserInfo {
  username?: string
  nickname?: string
  userId?: string
}

/* ===== 全局状态 ===== */
let assetsPath = ''
let renderer: Renderer | null = null
let vipsInstance: any = null

const pngCache = new Map<string, Uint8Array>()

export function setB20AssetsPath(dirname: string) {
  assetsPath = dirname
}

/* ===== 初始化 ===== */

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
      /* font not available */
    }
  }
  return renderer
}

/* ===== AVIF → PNG ===== */

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
      } catch {
        /* */
      }
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

/* ===== 辅助函数 ===== */

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
 * 星标计算 (web downloadImage 逻辑)
 */
function calculateStars(items: ProcessedScore[]): number {
  let maxConstant = -Infinity
  for (const item of items) {
    if (Array.isArray(item.achievedStatus) && item.achievedStatus.includes(5)) {
      if (item.constantv3 > maxConstant) maxConstant = item.constantv3
    }
  }
  if (maxConstant >= 12) return 3
  if (maxConstant >= 9) return 2
  if (maxConstant >= 6) return 1
  return 0
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

/* ===== 布局常量 (MilAerno 新 UI) ===== */

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

/* ===== 主生成函数 ===== */

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

  // ===== 头部内容 =====
  buildHeader(children, result, userInfo, items)

  // ===== B20 卡片 =====
  const gridStartY = headerH

  for (let i = 0; i < b20Count; i++) {
    const colIdx = i % cols
    const rowIdx = Math.floor(i / cols)
    const cardX = GRID_PAD_X + colIdx * (CARD_W + GRID_GAP)
    const cardY = gridStartY + GRID_PAD_TOP + rowIdx * (CARD_H + GRID_GAP)
    buildCard(children, items[i], i, cardX, cardY, coverKeys[i], iconKeys[i])
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
      buildCard(children, items[i], i, cardX, cardY, coverKeys[i], iconKeys[i])
    }
  }

  // ===== 底部 footer =====
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
  items: ProcessedScore[]
) {
  const username = userInfo?.username || userInfo?.nickname || 'UNKNOWN'
  const starCount = calculateStars(items)

  // 左上: 标题 h1 (2.5em ≈ 40px)
  children.push(
    container({
      style: { position: 'absolute', top: HEADER_PAD, left: HEADER_PAD },
      children: [
        textNode('Milthm-Calculator', { fontSize: 40, color: '#ffffff' })
      ]
    })
  )

  // 信息文本 (.texts, line-height 1.7em ≈ 27px per line, font-size ~16px)
  let infoY = HEADER_PAD + 58
  children.push(
    container({
      style: { position: 'absolute', top: infoY, left: HEADER_PAD + 3 },
      children: [
        textNode('Generated by milthm-profiler (Koishi)', {
          fontSize: 14,
          color: '#cfccdb'
        })
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

  // Chart Progress 简化 (无法获取全谱面进度, 显示总数)
  infoY += 24
  children.push(
    container({
      style: { position: 'absolute', top: infoY, left: HEADER_PAD + 3 },
      children: [
        textNode(`总谱面数: ${result.totalScores}`, {
          fontSize: 13,
          color: '#c4c4c4'
        })
      ]
    })
  )

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

  // "REALITY" 白底圆角框 (.reality-content)
  const badgeLeft = rightX - realityTotalW
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
      style: { position: 'absolute', left: badgeLeft + 10, top: realityY + 4 },
      children: [textNode('REALITY', { fontSize: 12, color: '#000000' })]
    })
  )

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

  // 星标
  if (starCount > 0) {
    const starStr = '★'.repeat(starCount)
    children.push(
      container({
        style: {
          position: 'absolute',
          left: rightX - estimateTextW(starStr, 20),
          top: realityY + 30
        },
        children: [textNode(starStr, { fontSize: 20, color: '#FFD700' })]
      })
    )
  }

  // TOP20 AVG + Date (右侧下方, line-height 1.7em)
  const rightInfoY = realityY + (starCount > 0 ? 55 : 35)
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

  // Tip (底部左侧, 简单版)
  const tipY = HEADER_PAD + 145
  children.push(
    container({
      style: { position: 'absolute', left: HEADER_PAD + 3, top: tipY },
      children: [
        textNode('Tip: 查分上 https://mhtlim.top/', {
          fontSize: 13,
          color: '#ffffff'
        })
      ]
    })
  )
}

/* ===== 卡片构建 ===== */

function buildCard(
  children: any[],
  item: ProcessedScore,
  index: number,
  cardX: number,
  cardY: number,
  coverKey: string | null,
  iconKey: string | null
) {
  const highlight = isV3Highlight(item)

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
  children.push(
    container({
      style: { position: 'absolute', left: textX + 9, top: row3Y },
      children: [
        textNode('>> Goal: -', {
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
  const ratingText = `${item.category} ${constText} > ${item.singleRating.toFixed(2)}`
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
    'Generated by Milthm-Calculator | Theme MilAerno Designed by xzadudu179'
  const footerW = estimateTextW(footerText, 13)
  children.push(
    container({
      style: {
        position: 'absolute',
        left: (CANVAS_W - footerW) / 2,
        top: footerY + 25
      },
      children: [
        textNode(footerText, { fontSize: 13, color: 'rgba(255,255,255,0.77)' })
      ]
    })
  )

  // 副 footer 文字
  const now = new Date()
  const dateStr = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`
  const subText = `milthm-profiler (Koishi) · ${dateStr}`
  const subW = estimateTextW(subText, 11)
  children.push(
    container({
      style: {
        position: 'absolute',
        left: (CANVAS_W - subW) / 2,
        top: footerY + 50
      },
      children: [
        textNode(subText, { fontSize: 11, color: 'rgba(255,255,255,0.4)' })
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
