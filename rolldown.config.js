import { defineConfig } from 'rolldown'
import pkg from './package.json' with { type: 'json' }
import { dts } from 'rolldown-plugin-dts'
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
  readFileSync
} from 'node:fs'
import { join, dirname, resolve } from 'node:path'

const external = new RegExp(
  `^(node:|${[...Object.getOwnPropertyNames(pkg.devDependencies ? pkg.devDependencies : []), ...Object.getOwnPropertyNames(pkg.dependencies ? pkg.dependencies : [])].join('|')})`
)

const config = {
  input: './src/index.ts'
}

const VIRTUAL_CONSTANTS_ID = 'virtual:milthm-constants'
const RESOLVED_CONSTANTS_ID = `\0${VIRTUAL_CONSTANTS_ID}`
const UPSTREAM_CONSTANT_JS = resolve(
  './third_party/milthm-calculator-web/js/constant.js'
)

const VIRTUAL_COVERS_ID = 'virtual:milthm-covers'
const RESOLVED_COVERS_ID = `\0${VIRTUAL_COVERS_ID}`
const UPSTREAM_OUT_JSON = resolve('./third_party/MilResource/resource/out.json')

/**
 * 在构建期间执行上游 constant.js，将 constantsData 序列化为 JSON
 * 并作为虚拟 ESM 模块捆绑进产物，无需运行时额外读取文件。
 */
const milthmConstantsPlugin = {
  name: 'milthm-constants',
  resolveId(id) {
    if (id === VIRTUAL_CONSTANTS_ID) return RESOLVED_CONSTANTS_ID
  },
  load(id) {
    if (id !== RESOLVED_CONSTANTS_ID) return

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

/**
 * 在构建期间解析 out.json，将 BeatmapId → WebP文件名 映射序列化为 JSON
 * 并作为虚拟 ESM 模块捆绑进产物，运行时直接用 chart_id 查找封面。
 */
const milthmCoversPlugin = {
  name: 'milthm-covers',
  resolveId(id) {
    if (id === VIRTUAL_COVERS_ID) return RESOLVED_COVERS_ID
  },
  load(id) {
    if (id !== RESOLVED_COVERS_ID) return

    if (!existsSync(UPSTREAM_OUT_JSON)) {
      console.warn(
        `[milthm-covers] 找不到 out.json: ${UPSTREAM_OUT_JSON}，封面映射将为空`
      )
      return `export default {}`
    }

    const chapters = JSON.parse(readFileSync(UPSTREAM_OUT_JSON, 'utf-8'))
    const coverMap = {}

    for (const chapter of chapters) {
      for (const song of chapter.Songs ?? []) {
        const uri = song.SharingMetaData?.IllustrationUri ?? ''
        if (!uri) continue

        const rawFilename = uri.split('/').pop() ?? ''
        const decoded = decodeURIComponent(rawFilename)
        const webpFilename = decoded.replace(/\.milimg$/i, '.webp')

        for (const level of song.Levels ?? []) {
          const beatmapId = (level.BeatmapId ?? '').trim()
          if (beatmapId) coverMap[beatmapId] = webpFilename
        }
      }
    }

    console.log(
      `\u2713 milthm-covers: 已捆绑 ${Object.keys(coverMap).length} 条封面映射`
    )

    return `export default ${JSON.stringify(coverMap)}`
  }
}

const copyAssetsPlugin = {
  name: 'copy-assets',
  buildEnd() {
    const assetsSourceDir = './assets'
    const assetsTargetDir = './lib/assets'

    if (!existsSync(assetsSourceDir)) {
      console.log('⚠️  assets 目录不存在，跳过复制')
      console.log('   请先运行: yarn convert')
    } else {
      try {
        copyDir(assetsSourceDir, assetsTargetDir)
        console.log('✓ Assets 已复制到 lib/')
      } catch (err) {
        console.error('✗ 复制 assets 失败:', err)
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
  }
}

export default defineConfig([
  {
    ...config,
    output: [{ file: 'lib/index.mjs', format: 'es', minify: true }],
    external: external,
    plugins: [milthmConstantsPlugin, milthmCoversPlugin, copyAssetsPlugin]
  },
  {
    ...config,
    output: [{ file: 'lib/index.cjs', format: 'cjs', minify: true }],
    external: external,
    plugins: [milthmConstantsPlugin, milthmCoversPlugin]
  },
  {
    ...config,
    output: [{ dir: 'lib', format: 'es' }],
    plugins: [
      milthmConstantsPlugin,
      milthmCoversPlugin,
      dts({ emitDtsOnly: true })
    ],
    external: external
  }
])
