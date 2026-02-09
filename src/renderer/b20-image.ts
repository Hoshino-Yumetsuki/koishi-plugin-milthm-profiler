/**
 * B20 图片生成器
 * 使用 takumi-rs + wasm-vips 生成查分图片
 * 精确对齐 milthm-calculator-web 的 archiveDownloadImage / drawCards
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

// 图片缓存（PNG 数据）
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

  // 加载字体（优先 Arial 风格，回退到可用字体）
  const fontDirs = [
    ['Chill Round', 'ChillRoundF v3.0.ttf'],
    ['alimamafangyuanti', 'AlimamaFangYuanTiVF-Thin.ttf']
  ]

  for (const [dir, file] of fontDirs) {
    try {
      const fontPath = path.join(assetsPath, 'assets', 'fonts', dir, file)
      const fontBuffer = await fs.readFile(fontPath)
      renderer.loadFont(new Uint8Array(fontBuffer))
    } catch (_e) {
      // font not available, skip
    }
  }

  return renderer
}

/* ===== AVIF → PNG 转换 ===== */

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
      } catch (_e) {
        /* ignore */
      }
    }
  }
}

/* ===== 图片加载 ===== */

async function loadAvifImage(relativePath: string): Promise<Uint8Array | null> {
  const cacheKey = relativePath
  const cached = pngCache.get(cacheKey)
  if (cached) return cached

  const fullPath = path.join(assetsPath, 'assets', relativePath)
  try {
    const avifBuffer = await fs.readFile(fullPath)
    const pngData = await convertAvifToPng(avifBuffer)
    if (pngCache.size < 200) {
      pngCache.set(cacheKey, pngData)
    }
    return pngData
  } catch (_e) {
    return null
  }
}

function registerImage(r: Renderer, key: string, data: Uint8Array) {
  r.putPersistentImage({ src: key, data })
}

/**
 * 封面文件名（与 web 版 imgName 完全一致）
 */
function getCoverFileName(songName: string): string {
  return songName
    .replace(/#/g, '')
    .replace(/\?/g, '')
    .replace(/>/g, '')
    .replace(/</g, '')
    .replace(/\*/g, '')
    .replace(/"/g, '')
    .replace(/\|/g, '')
    .replace(/\//g, '')
    .replace(/\\/g, '')
    .replace(/:/g, '')
}

/**
 * 等级图标名（与 web 版 getLevelIconName 完全一致）
 */
function getLevelIconName(item: ProcessedScore): string {
  if (item.bestLevel === 0) return '0'
  if (item.bestLevel === 6 || item.bestLevel === 7) return '6'
  if (Array.isArray(item.achievedStatus) && item.achievedStatus.includes(5))
    return `${item.bestLevel}0`
  if (Array.isArray(item.achievedStatus) && item.achievedStatus.includes(4))
    return `${item.bestLevel}1`
  return `${item.bestLevel}`
}

/**
 * V3 高亮判定（与 web 版完全一致）
 */
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
 * 星标计算（与 web 版一致：AP 最高定数）
 */
function calculateStars(items: ProcessedScore[]): string {
  let maxConstant = -Infinity
  for (const item of items) {
    if (Array.isArray(item.achievedStatus) && item.achievedStatus.includes(5)) {
      if (item.constantv3 > maxConstant) maxConstant = item.constantv3
    }
  }
  if (maxConstant > 12) return '☆☆☆'
  if (maxConstant > 9) return '☆☆'
  if (maxConstant > 6) return '☆'
  return ''
}

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

  // ===== 画布尺寸（web 版 archiveDownloadImage 逻辑） =====
  const width = 1200
  const baseHeight = 2200
  const newHeight = 400 + Math.ceil(cardCount / 2) * 165
  const canvasHeight = Math.max(baseHeight, newHeight)

  // ===== drawCards 常量 =====
  const cardW = 442,
    cardH = 130,
    imgW = 185,
    imgH = 104,
    iconSize = 91
  const x0 = 110,
    y0 = 350,
    col = 520,
    row = 162.5

  // ===== 1. 加载随机背景 =====
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

  // ===== 2. 预加载所有封面图和段位图标 =====
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

  // --- 背景图（铺满） ---
  if (bgPng) {
    children.push(
      image({
        src: 'bg',
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          width,
          height: canvasHeight
        }
      })
    )
  } else {
    // web 版 fallback: 纯黑背景
    children.push(
      container({
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          width,
          height: canvasHeight,
          backgroundColor: '#000000'
        }
      })
    )
  }

  // --- 头部半透明底 (0, 50, 1200, 200) ---
  children.push(
    container({
      style: {
        position: 'absolute',
        top: 50,
        left: 0,
        width,
        height: 200,
        backgroundColor: 'rgba(128,128,128,0.3)'
      }
    })
  )

  // --- 斜线（用细长矩形模拟，从 (550,250) 到 (650,50) 对角线） ---
  // 斜线长度 = sqrt(100^2 + 200^2) ≈ 224px，角度 = atan(200/100) ≈ 63.4°
  // takumi-rs 不支持 transform:rotate，用一组小矩形逼近
  const lineSteps = 40
  for (let s = 0; s <= lineSteps; s++) {
    const t = s / lineSteps
    const lx = 550 + t * 100
    const ly = 250 - t * 200
    children.push(
      container({
        style: {
          position: 'absolute',
          left: lx - 1,
          top: ly - 1,
          width: 4,
          height: 4,
          backgroundColor: 'rgba(255,255,255,0.8)'
        }
      })
    )
  }

  // ===== 头部文字 =====
  // Web 版使用 canvas textBaseline='alphabetic'（默认）
  // 换算: takumi top = canvas_y - fontSize * 0.76

  // 左侧标题: 50px at (100, 95)
  children.push(
    container({
      style: { position: 'absolute', top: 57, left: 100 },
      children: [
        textNode('Milthm-calculator', { fontSize: 50, color: '#ffffff' })
      ]
    })
  )

  // 左侧链接: 25px at (100, 125/153/181/207)
  const links = [
    { text: 'https://mhtlim.top/', y: 125 },
    { text: 'http://k9.lv/c/', y: 153 },
    { text: 'https://milcalc.netlify.app/', y: 181 },
    { text: 'https://mkzi-nya.github.io/c/', y: 207 }
  ]
  for (const link of links) {
    children.push(
      container({
        style: { position: 'absolute', top: link.y - 19, left: 100 },
        children: [textNode(link.text, { fontSize: 25, color: '#ffffff' })]
      })
    )
  }

  // 左侧 "←查分上这里" 30px at (400, 130)
  children.push(
    container({
      style: { position: 'absolute', top: 107, left: 400 },
      children: [textNode('←查分上这里', { fontSize: 30, color: '#ffffff' })]
    })
  )
  // "这几个网址都行" 20px at (440, 155)
  children.push(
    container({
      style: { position: 'absolute', top: 140, left: 440 },
      children: [textNode('这几个网址都行', { fontSize: 20, color: '#ffffff' })]
    })
  )

  // 右侧: 25px 字体, alphabetic 基线
  const star = calculateStars(items)
  const username = userInfo?.username || ''
  const nickname = userInfo?.nickname || ''
  const uid = userInfo?.userId || ''

  // 星标 at (660, 75) → top = 75 - 19 = 56
  if (star) {
    children.push(
      container({
        style: { position: 'absolute', top: 56, left: 660 },
        children: [textNode(star, { fontSize: 25, color: '#ffffff' })]
      })
    )
  }

  // Player at (660, 100) → top = 81
  const playerText = username
    ? `Player: ${username}${nickname ? `  (${nickname})` : ''}`
    : 'Player: -'
  children.push(
    container({
      style: { position: 'absolute', top: 81, left: 660 },
      children: [textNode(playerText, { fontSize: 25, color: '#ffffff' })]
    })
  )

  // userID at (660, 128) → top = 109
  children.push(
    container({
      style: { position: 'absolute', top: 109, left: 660 },
      children: [
        textNode(`userID: ${uid || '-'}`, { fontSize: 25, color: '#ffffff' })
      ]
    })
  )

  // Reality at (660, 160) → top = 141
  children.push(
    container({
      style: { position: 'absolute', top: 141, left: 660 },
      children: [
        textNode(`Reality: ${result.averageRating.toFixed(2)}`, {
          fontSize: 25,
          color: '#ffffff'
        })
      ]
    })
  )

  // Date at (660, 190) → top = 171
  const now = new Date()
  const dateStr = `${now.toISOString().split('T')[0]} ${now.toTimeString().split(' ')[0]}`
  children.push(
    container({
      style: { position: 'absolute', top: 171, left: 660 },
      children: [
        textNode(`Date: ${dateStr}`, { fontSize: 25, color: '#ffffff' })
      ]
    })
  )

  // Updated (milthm-profiler 水印) 20px at (100, 230) → top ≈ 215
  children.push(
    container({
      style: { position: 'absolute', top: 215, left: 100 },
      children: [
        textNode('Generated by milthm-profiler (Koishi)', {
          fontSize: 20,
          color: '#ffffff'
        })
      ]
    })
  )

  // ===== B20 卡片 =====
  // Web 版 drawCards 中设置了 textBaseline='top'，所以 canvas y 坐标 = top
  // 可以直接使用 web 版坐标

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    const x = x0 + (i % 2) * col
    const y = y0 + Math.floor(i / 2) * row - (i % 2 ? 0 : 50)

    const highlight = isV3Highlight(item)

    // 卡底
    children.push(
      container({
        style: {
          position: 'absolute',
          left: x,
          top: y,
          width: cardW,
          height: cardH,
          backgroundColor: highlight
            ? 'rgba(128,128,128,0.5)'
            : 'rgba(128,128,128,0.2)'
        }
      })
    )

    // 封面图 at (x+13, y+13, 185×104)
    if (coverKeys[i]) {
      children.push(
        image({
          src: coverKeys[i]!,
          style: {
            position: 'absolute',
            left: x + 13,
            top: y + 13,
            width: imgW,
            height: imgH
          }
        })
      )
    }

    // 段位图标 at (x+351, y+26, 91×91)
    if (iconKeys[i]) {
      children.push(
        image({
          src: iconKeys[i]!,
          style: {
            position: 'absolute',
            left: x + 351,
            top: y + 26,
            width: iconSize,
            height: iconSize
          }
        })
      )
    }

    // 排名号 (textAlign='right', textBaseline='top') at (x+cardW-10, y+7)
    // takumi 不支持 textAlign right，用估算的左偏移:
    // "#20" 约 3 字符 × 17px × 0.6 ≈ 30px 宽
    const rankStr = `#${i + 1}`
    const rankCharWidth = rankStr.length * 10 // 17px font, ~10px per char
    children.push(
      container({
        style: {
          position: 'absolute',
          left: x + cardW - 10 - rankCharWidth,
          top: y + 7
        },
        children: [
          textNode(rankStr, {
            fontSize: 17,
            color: i < 20 ? '#FAFAFA' : '#C9C9C9'
          })
        ]
      })
    )

    // 歌名 (textBaseline='top') at (x+212, y+23), 25px→10px 自适应
    // Web 版缩到 ctx.measureText(name).width <= 200
    // 我们估算：25px 字体下约 13px/ascii字符, 25px/中文字符
    // 先尝试用 limitText 截断到大致宽度
    const displayName = limitTextForWidth(item.name, 200, 25)
    children.push(
      container({
        style: { position: 'absolute', left: x + 212, top: y + 23 },
        children: [
          textNode(displayName.text, {
            fontSize: displayName.fontSize,
            color: '#ffffff'
          })
        ]
      })
    )

    // 分数 (textBaseline='top') at (x+208, y+52), 39px
    // AP: 渐变 #99C5FB → #D8C3FA (takumi 不支持渐变, 用中间色近似)
    // FC: #90CAEF, 普通: #FFFFFF
    const scoreStr = String(item.score).padStart(7, '0')
    const scoreColor = getScoreColor(item)
    children.push(
      container({
        style: { position: 'absolute', left: x + 208, top: y + 52 },
        children: [textNode(scoreStr, { fontSize: 39, color: scoreColor })]
      })
    )

    // 目标分 13px at (x+212, y+86), textBaseline='top'
    // Web 版调用 findScore()，我们简化为 ">>-"
    children.push(
      container({
        style: { position: 'absolute', left: x + 212, top: y + 86 },
        children: [textNode('>>-', { fontSize: 13, color: '#ffffff' })]
      })
    )

    // 评级/常数/Rating/准确率行 20px at (x+208, y+98), textBaseline='top'
    const acc = `${(item.accuracy * 100 || 0).toFixed(2)}%`
    const constText = item.constantv3.toFixed(1)
    const ratingLine = `${item.category} ${constText} > ${item.singleRating.toFixed(2)}   ${acc}`
    children.push(
      container({
        style: { position: 'absolute', left: x + 208, top: y + 98 },
        children: [textNode(ratingLine, { fontSize: 20, color: '#ffffff' })]
      })
    )
  }

  // ===== 底部水印 =====
  const footerY = y0 + Math.ceil(cardCount / 2) * row + 80
  children.push(
    container({
      style: { position: 'absolute', left: width / 2 - 200, top: footerY },
      children: [
        textNode('Milthm-Calculator by mkZH0740', {
          fontSize: 16,
          color: '#666666'
        })
      ]
    })
  )

  // 根容器
  const root = container({
    children,
    style: {
      position: 'relative',
      width,
      height: canvasHeight,
      display: 'block',
      backgroundColor: '#000000'
    }
  })

  // 渲染为 PNG
  const buffer = r.render(root, { width, height: canvasHeight, format: 'png' })
  return Buffer.from(buffer)
}

/* ===== 工具函数 ===== */

/**
 * Web 版歌名自适应缩小:
 * 从 25px 开始，如果文本宽度 > maxWidth 就缩小字号到 10px
 * 估算: ascii 字符约 fontSize * 0.55, 中文约 fontSize * 1.0
 */
function limitTextForWidth(
  str: string,
  maxWidth: number,
  startSize: number
): { text: string; fontSize: number } {
  let fontSize = startSize
  while (fontSize > 10) {
    const w = estimateTextWidth(str, fontSize)
    if (w <= maxWidth) return { text: str, fontSize }
    fontSize--
  }
  // 10px 还超宽，截断
  return { text: limitText(str, 16), fontSize: 10 }
}

/**
 * 估算文本像素宽度
 */
function estimateTextWidth(str: string, fontSize: number): number {
  let w = 0
  for (const ch of str) {
    const code = ch.charCodeAt(0)
    if (code > 255) {
      w += fontSize * 1.0 // CJK
    } else if (/[A-Z]/.test(ch) && ch !== 'I') {
      w += fontSize * 0.65 // 大写字母略宽
    } else {
      w += fontSize * 0.55 // 普通 ASCII
    }
  }
  return w
}

/**
 * 截断歌名（与 web 版 limitText 一致）
 */
function limitText(str: string, len = 16): string {
  let l = 0
  const chars = [...str]
  for (let i = 0; i < chars.length; i++) {
    const code = chars[i].charCodeAt(0)
    if (code > 255) l += 2
    else if (/[A-Z]/.test(chars[i]) && chars[i] !== 'I') l += 1.5
    else l += 1

    if (l >= len) {
      return `${str.slice(0, Math.max(i - 2, 0))}...`
    }
  }
  return str
}

/**
 * 分数颜色（与 web 版 drawCards 一致）
 * AP (achievedStatus 含 5): 渐变 #99C5FB → #D8C3FA → 近似中间色 #B9B4ED
 * FC (achievedStatus 含 4): #90CAEF
 * 普通: #FFFFFF
 */
function getScoreColor(item: ProcessedScore): string {
  if (Array.isArray(item.achievedStatus) && item.achievedStatus.includes(5)) {
    return '#B9B4ED' // AP 渐变中间色 (无法用纯色完美还原渐变)
  }
  if (Array.isArray(item.achievedStatus) && item.achievedStatus.includes(4)) {
    return '#90CAEF'
  }
  return '#FFFFFF'
}
