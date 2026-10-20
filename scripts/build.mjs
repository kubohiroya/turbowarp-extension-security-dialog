import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await fs.mkdir(path.join(root, 'dist'), {recursive: true});
const banner = `data:image/svg+xml;base64,${(await fs.readFile(path.join(root, 'assets/common.svg'))).toString('base64')}`;
for (const [format, extension] of [['esm','mjs'], ['cjs','cjs']]) {
    await build({
        absWorkingDir: root, entryPoints: ['src/index.js','src/react.jsx','src/turbowarp.js'],
        outdir: 'dist', outExtension: {'.js': `.${extension}`}, bundle: true,
        format, platform: 'browser', target: ['es2017'], external: ['react','react-dom','@turbowarp/jszip'],
        define: {__SECURITY_COMMON_BANNER__: JSON.stringify(banner)}, sourcemap: false
    });
}
const css = await fs.readFile(path.join(root, 'src/react.css'), 'utf8');
await fs.writeFile(path.join(root, 'styles.css'), css);
await fs.writeFile(path.join(root, 'webpack4.css'), css.replace(/\.twextsec-[\w-]+/g, value => `:global(${value})`));
await fs.writeFile(path.join(root, 'react.js'), "module.exports = require('./dist/react.cjs');\n");
await fs.writeFile(path.join(root, 'turbowarp.js'), "module.exports = require('./dist/turbowarp.cjs');\n");
for (const name of ['index','react','turbowarp']) {
    await fs.copyFile(path.join(root, `src/${name}.d.ts`), path.join(root, `dist/${name}.d.ts`));
}
