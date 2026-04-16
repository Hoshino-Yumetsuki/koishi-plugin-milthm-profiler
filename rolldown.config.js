import { defineConfig } from 'rolldown'
import pkg from './package.json' with { type: 'json' }
import { dts } from 'rolldown-plugin-dts'
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { join, dirname, resolve, basename, extname } from 'node:path'

const external = new RegExp(
  `^(node:|${[...Object.getOwnPropertyNames(pkg.devDependencies ? pkg.devDependencies : []), ...Object.getOwnPropertyNames(pkg.dependencies ? pkg.dependencies : [])].join('|')})`
)

const config = {
  input: './src/index.ts'
}

const VIRTUAL_ID = 'virtual:milthm-constants'
const RESOLVED_ID = `\0${VIRTUAL_ID}`
const UPSTREAM_CONSTANT_JS = resolve(
  './third_party/milthm-calculator-web/js/constant.js'
)
const UPSTREAM_AVIF_DIR = resolve(
  './third_party/mhtlim-static-files/public/avif'
)

function normalizeCoverFileName(input) {
  return input
    .normalize('NFC')
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .filter((char) => char.codePointAt(0) >= 0x20)
    .join('')
    .replace(/[　\s]+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
}

function createCollisionSuffix(input) {
  return [...input]
    .map((char) => char.codePointAt(0)?.toString(16).padStart(4, '0') ?? '0000')
    .join('-')
}

/**
 * 在构建期间执行上游 constant.js，将 constantsData 序列化为 JSON
 * 并作为虚拟 ESM 模块捆绑进产物，无需运行时额外读取文件。
 */
const milthmConstantsPlugin = {
  name: 'milthm-constants',
  resolveId(id) {
    if (id === VIRTUAL_ID) return RESOLVED_ID
  },
  load(id) {
    if (id !== RESOLVED_ID) return

    if (!existsSync(UPSTREAM_CONSTANT_JS)) {
      throw new Error(
        `[milthm-constants] 找不到上游定数文件: ${UPSTREAM_CONSTANT_JS}\n` +
          '请确保 milthm-calculator-web 子目录存在于插件根目录下。'
      )
    }

    const code = readFileSync(UPSTREAM_CONSTANT_JS, 'utf-8')

    // constant.js 使用 const 声明，通过 new Function
    // 在独立作用域内执行并提取兼容名称的定数对象。
    const fn = new Function(
      `${code}\nreturn typeof constantsData !== 'undefined' ? constantsData : constants;`
    )
    const data = fn()

    console.log(
      `\u2713 milthm-constants: 已捆绑 ${Object.keys(data).length} 条定数条目`
    )

    return `export default ${JSON.stringify(data)}`
  }
}

const copyAssetsPlugin = {
  name: 'copy-assets',
  buildEnd() {
    const assetsSourceDir = './assets'
    const assetsTargetDir = './lib/assets'
    const upstreamCoverTargetDir = './lib/assets/covers'

    if (!existsSync(assetsSourceDir)) {
      console.log('⚠️  assets 目录不存在，跳过复制')
      console.log('   请先运行: yarn convert:milthm')
    } else {
      try {
        copyDir(assetsSourceDir, assetsTargetDir)
        console.log('✓ Assets 已复制到 lib/')
      } catch (err) {
        console.error('✗ 复制 assets 失败:', err)
      }
    }

    if (!existsSync(UPSTREAM_AVIF_DIR)) {
      console.log('⚠️  上游 avif 目录不存在，跳过曲绘复制')
    } else {
      try {
        const coverMap = copyUpstreamCovers(
          UPSTREAM_AVIF_DIR,
          upstreamCoverTargetDir
        )
        const coverMapTargetPath = join(
          upstreamCoverTargetDir,
          'cover-map.json'
        )
        writeFileSync(coverMapTargetPath, JSON.stringify(coverMap, null, 2))
        console.log('✓ 上游曲绘已复制到 lib/assets/covers')
      } catch (err) {
        console.error('✗ 复制上游曲绘失败:', err)
      }
    }

    function copyDir(src, dest) {
      mkdirSync(dest, { recursive: true })
      const entries = readdirSync(src, { withFileTypes: true })

      for (const entry of entries) {
        const srcPath = join(src, entry.name)
        const destPath = join(dest, entry.name)

        if (entry.isDirectory()) {
          copyDir(srcPath, destPath)
        } else {
          mkdirSync(dirname(destPath), { recursive: true })
          copyFileSync(srcPath, destPath)
        }
      }
    }

    function copyUpstreamCovers(src, dest) {
      mkdirSync(dest, { recursive: true })
      const entries = readdirSync(src, { withFileTypes: true })
      const copied = new Map()
      const coverMap = {}

      for (const entry of entries) {
        if (!entry.isFile()) continue

        const extension = extname(entry.name).toLowerCase()
        if (extension !== '.avif') continue

        const sourcePath = join(src, entry.name)
        const sourceBaseName = basename(entry.name, extension)
        const normalizedBaseName =
          normalizeCoverFileName(sourceBaseName) || 'unknown'
        let normalizedFileName = `${normalizedBaseName}${extension}`
        let targetPath = join(dest, normalizedFileName)

        const previousSource = copied.get(normalizedFileName)
        if (previousSource && previousSource !== entry.name) {
          normalizedFileName = `${normalizedBaseName}__${createCollisionSuffix(sourceBaseName)}${extension}`
          targetPath = join(dest, normalizedFileName)
          console.warn(
            `⚠️  曲绘文件名归一化冲突: ${entry.name} -> ${normalizeCoverFileName(sourceBaseName)}${extension}, 改用 ${normalizedFileName}`
          )
        }

        copied.set(normalizedFileName, entry.name)
        copyFileSync(sourcePath, targetPath)
        coverMap[sourceBaseName] = normalizedFileName
      }

      return coverMap
    }
  }
}

export default defineConfig([
  {
    ...config,
    output: [{ file: 'lib/index.mjs', format: 'es', minify: true }],
    external: external,
    plugins: [milthmConstantsPlugin, copyAssetsPlugin]
  },
  {
    ...config,
    output: [{ file: 'lib/index.cjs', format: 'cjs', minify: true }],
    external: external,
    plugins: [milthmConstantsPlugin]
  },
  {
    ...config,
    output: [{ dir: 'lib', format: 'es' }],
    plugins: [milthmConstantsPlugin, dts({ emitDtsOnly: true })],
    external: external
  }
])
