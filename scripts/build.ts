import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readBuildSource} from './build-source.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await fs.mkdir(path.join(root, 'dist'), {recursive: true});
const {name, version} = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const {revision, sourceState} = readBuildSource(root);
await fs.writeFile(path.join(root, 'dist/build-info.json'),
    JSON.stringify({name, version, revision, sourceState}, null, 2) + '\n');
const dataURI = async (file: string) => `data:image/svg+xml;base64,${(await fs.readFile(path.join(root, file))).toString('base64')}`;
const banner = await dataURI('assets/common.svg');
const trustedBadge = await dataURI('assets/trusted.svg');
for (const [format, extension] of [['esm','mjs'], ['cjs','cjs']] as const) {
    await build({
        absWorkingDir: root,
        entryPoints: ['src/index.ts','src/react.tsx','src/turbowarp.ts'],
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
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
    '--project', path.join(root, 'tsconfig.json'), '--noEmit', 'false', '--declaration', '--emitDeclarationOnly',
    '--outDir', path.join(root, 'dist'), '--rootDir', path.join(root, 'src')], {stdio: 'inherit'});
