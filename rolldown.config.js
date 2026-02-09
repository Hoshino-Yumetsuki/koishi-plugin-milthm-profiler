import { defineConfig } from 'rolldown'
import pkg from './package.json' with { type: 'json' }
import { dts } from 'rolldown-plugin-dts'
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

const external = new RegExp(
  `^(node:|${[...Object.getOwnPropertyNames(pkg.devDependencies ? pkg.devDependencies : []), ...Object.getOwnPropertyNames(pkg.dependencies ? pkg.dependencies : [])].join('|')})`
)

const config = {
  input: './src/index.ts'
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
    plugins: [copyAssetsPlugin]
  },
  {
    ...config,
    output: [{ file: 'lib/index.cjs', format: 'cjs', minify: true }],
    external: external
  },
  {
    ...config,
    output: [{ dir: 'lib', format: 'es' }],
    plugins: [dts({ emitDtsOnly: true })],
    external: external
  }
])
