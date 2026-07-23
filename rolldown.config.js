import { defineConfig } from 'rolldown';
import pkg from './package.json' with { type: 'json' };
import { dts } from 'rolldown-plugin-dts';
import { copyFileSync, mkdirSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const external = new RegExp(
  `^(node:|${[...Object.getOwnPropertyNames(pkg.devDependencies ? pkg.devDependencies : []), ...Object.getOwnPropertyNames(pkg.dependencies ? pkg.dependencies : [])].join('|')})`
);

const config = {
  input: './src/index.ts'
};

const VIRTUAL_CONSTANTS_ID = 'virtual:milthm-constants';
const RESOLVED_CONSTANTS_ID = `\0${VIRTUAL_CONSTANTS_ID}`;
const UPSTREAM_CONSTANT_JS = resolve('./third_party/milthm-calculator-web/js/constant.js');
const UPSTREAM_IMAGES_CSS = resolve('./third_party/milthm-calculator-web/images.css');

/**
 * 在构建期间执行上游 constant.js，将 constantsData 序列化为 JSON
 * 并作为虚拟 ESM 模块捆绑进产物，无需运行时额外读取文件。
 */
const milthmConstantsPlugin = {
  name: 'milthm-constants',
  resolveId(id) {
    if (id === VIRTUAL_CONSTANTS_ID) return RESOLVED_CONSTANTS_ID;
  },
  load(id) {
    if (id !== RESOLVED_CONSTANTS_ID) return;

    if (!existsSync(UPSTREAM_CONSTANT_JS)) {
      throw new Error(
        `[milthm-constants] 找不到上游定数文件: ${UPSTREAM_CONSTANT_JS}\n` +
          '请确保 milthm-calculator-web 子目录存在于插件根目录下。'
      );
    }

    const code = readFileSync(UPSTREAM_CONSTANT_JS, 'utf-8');

    // constant.js 使用 const 声明，通过 new Function
    // 在独立作用域内执行并提取兼容名称的定数对象。
    // eslint-disable-next-line typescript/no-implied-eval
    const fn = new Function(
      `${code}\nreturn typeof constantsData !== 'undefined' ? constantsData : constants;`
    );
    const data = fn();

    console.log(`✓ milthm-constants: 已捆绑 ${Object.keys(data).length} 条定数条目`);

    return `export default ${JSON.stringify(data)}`;
  }
};

const copyAssetsPlugin = {
  name: 'copy-assets',
  buildEnd() {
    const assetsSourceDir = './assets';
    const assetsTargetDir = './lib/assets';

    if (!existsSync(assetsSourceDir)) {
      console.log('⚠️  assets 目录不存在，跳过复制');
    } else {
      try {
        copyDir(assetsSourceDir, assetsTargetDir);
        console.log('✓ Assets 已复制到 lib/');
      } catch (err) {
        console.error('✗ 复制 assets 失败:', err);
      }
    }

    // always ship images.css for song covers (from calculator-web)
    try {
      mkdirSync(assetsTargetDir, { recursive: true });
      if (existsSync(UPSTREAM_IMAGES_CSS)) {
        copyFileSync(UPSTREAM_IMAGES_CSS, join(assetsTargetDir, 'images.css'));
        console.log('✓ images.css 已复制到 lib/assets/');
      } else if (existsSync('./assets/images.css')) {
        copyFileSync('./assets/images.css', join(assetsTargetDir, 'images.css'));
        console.log('✓ images.css 已从 assets/ 复制到 lib/assets/');
      } else {
        console.warn('⚠️  找不到 images.css，曲绘将不可用');
      }
    } catch (err) {
      console.error('✗ 复制 images.css 失败:', err);
    }

    function copyDir(src, dest) {
      mkdirSync(dest, { recursive: true });
      const entries = readdirSync(src, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);

        if (entry.isDirectory()) {
          copyDir(srcPath, destPath);
        } else {
          mkdirSync(dirname(destPath), { recursive: true });
          copyFileSync(srcPath, destPath);
        }
      }
    }
  }
};

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
]);
