import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readBuildSource} from './build-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await fs.mkdir(path.join(root, 'dist'), {recursive: true});
const {name, version} = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const {revision, sourceState} = readBuildSource(root);
await fs.writeFile(path.join(root, 'dist/build-info.json'),
    JSON.stringify({name, version, revision, sourceState}, null, 2) + '\n');
const dataURI = async file => `data:image/svg+xml;base64,${(await fs.readFile(path.join(root, file))).toString('base64')}`;
const banner = await dataURI('assets/common.svg');
const trustedBadge = await dataURI('assets/trusted.svg');
for (const [format, extension] of [['esm','mjs'], ['cjs','cjs']]) {
    await build({
        absWorkingDir: root,
        entryPoints: ['src/index.js','src/react.jsx','src/turbowarp.js'],
        outdir: 'dist', outExtension: {'.js': `.${extension}`}, bundle: true,
        format, platform: 'browser', target: ['es2017'], external: ['react','react-dom'],
        define: {__SECURITY_COMMON_BANNER__: JSON.stringify(banner),
            __SECURITY_TRUSTED_BADGE__: JSON.stringify(trustedBadge)}, sourcemap: false
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
