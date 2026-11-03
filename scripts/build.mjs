import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await fs.mkdir(path.join(root, 'dist'), {recursive: true});
const {name, version} = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('A full source revision is required.');
const sourceState = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--',
    'src', 'assets/common.svg', 'scripts', 'package.json', 'pnpm-lock.yaml', 'README.md', 'README.ja.md',
    'NOTICE.md', 'LICENSE'],
{cwd: root, encoding: 'utf8'}).trim() ? 'working-tree' : 'commit';
await fs.writeFile(path.join(root, 'dist/build-info.json'),
    JSON.stringify({name, version, revision, sourceState}, null, 2) + '\n');
const banner = `data:image/svg+xml;base64,${(await fs.readFile(path.join(root, 'assets/common.svg'))).toString('base64')}`;
for (const [format, extension] of [['esm','mjs'], ['cjs','cjs']]) {
    await build({
        absWorkingDir: root,
        entryPoints: ['src/index.js','src/react.jsx','src/turbowarp.js'],
        outdir: 'dist', outExtension: {'.js': `.${extension}`}, bundle: true,
        format, platform: 'browser', target: ['es2017'], external: ['react','react-dom'],
        define: {__SECURITY_COMMON_BANNER__: JSON.stringify(banner)}, sourcemap: false
    });
}
const css = await fs.readFile(path.join(root, 'src/review.css'), 'utf8');
await fs.writeFile(path.join(root, 'styles.css'), css);
await fs.writeFile(path.join(root, 'webpack4.css'), css.replace(/\.twextsec-[\w-]+/g, value => `:global(${value})`));
await fs.writeFile(path.join(root, 'react.js'), "module.exports = require('./dist/react.cjs');\n");
await fs.writeFile(path.join(root, 'turbowarp.js'), "module.exports = require('./dist/turbowarp.cjs');\n");
// review-types carries the vocabulary the other three declarations import, so it ships too.
for (const name of ['index','react','turbowarp','review-types']) {
    await fs.copyFile(path.join(root, `src/${name}.d.ts`), path.join(root, `dist/${name}.d.ts`));
}
