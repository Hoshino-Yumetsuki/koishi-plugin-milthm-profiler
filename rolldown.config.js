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

const VIRTUAL_ID = 'virtual:milthm-constants'
const RESOLVED_ID = `\0${VIRTUAL_ID}`
const UPSTREAM_CONSTANT_JS = resolve('./milthm-calculator-web/js/constant.js')

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

    // constant.js 使用 const 声明且包含稀疏数组语法，通过 new Function
    // 在独立作用域内执行并提取 constantsData。
    // 文件末尾对 constants 对象的后处理必弻执行但不影响返回值。
    const fn = new Function(`${code}\nreturn constantsData;`)
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
