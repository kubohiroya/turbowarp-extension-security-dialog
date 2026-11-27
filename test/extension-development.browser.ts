// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import {before, after, test} from 'node:test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const require = createRequire(import.meta.url);
const desktop = process.env.TWEXTSEC_DESKTOP_SOURCE;
let server, browser, base;
before(async () => {
    const css = await readFile('styles.css', 'utf8');
    const bundleFor = (legacy = false) => build({stdin: {contents: `
        import React from 'react';
        import ReactDOM from 'react-dom';
        import {ExtensionDevelopment} from './dist/react.mjs';
        ${desktop ? `import {LocalExtensionDevelopmentDialog as Adapter} from ${JSON.stringify(join(desktop,
            'src-renderer-webpack/editor/gui/local-extension-development-dialog.jsx'))};` : 'const Adapter = undefined;'}
        const params = new URLSearchParams(location.search);
        const calls = window.calls = [];
        const first = {token: 'first', id: 'example', directory: '/work/TypeScript/project', enabled: true,
            mode: 'source', execution: 'sandboxed', appliedDigest: 'a'.repeat(64),
            sourceHeader: '// Name: Example\\n// Version: 1.0.0\\n// Description: <script>window.executed = true</script>\\n'};
        const second = {...first, token: 'second', id: 'other', sourceHeader: '// Name: Other', directory: '/work/other'};
        let props = {locale: params.get('locale'), sessions: [first, second],
            kind: params.has('addon') ? 'addon' : undefined,
            capabilities: {localDevelopment: !params.has('web'), sourceBuild: params.has('source')},
            sourceBuild: params.has('source'), adding: false, errorText: code => code,
            onAdd: mode => {calls.push(['add', mode]); props = {...props, adding: true}; render();},
            onCancelAdd: () => calls.push(['cancel']),
            onClose: () => calls.push(['close']),
            onToggle: (token, enabled) => {calls.push(['toggle', token, enabled]); window.update(token, {enabled});},
            onRemove: token => calls.push(['remove', token]),
            onOpenSource: (token, point) => calls.push(['source', token, point])};
        function render() {
            const Component = params.has('adapter') ? Adapter : ExtensionDevelopment;
            ReactDOM.render(React.createElement(Component, props), document.querySelector('main'));
        }
        window.update = (token, patch) => {props = {...props, sessions: props.sessions.map(row =>
            row.token === token ? {...row, ...patch} : row)}; render();};
        window.setAdding = adding => {props = {...props, adding}; render();};
        render();
    `, resolveDir: process.cwd()}, bundle: true, write: false, platform: 'browser',
    alias: {react: require.resolve('react'), 'react-dom': require.resolve('react-dom'),
        '@kubohiroya/turbowarp-extension-security-dialog': join(process.cwd(), 'dist/index.mjs')},
    plugins: [{name: 'host-frame-fixture', setup(builder) {
        builder.onResolve({filter: /^@kubohiroya\/turbowarp-extension-security-dialog\/react$/}, () =>
            legacy ? {path: 'react', namespace: 'legacy-react'} : {path: join(process.cwd(), 'dist/react.mjs')});
        builder.onLoad({filter: /.*/, namespace: 'legacy-react'}, () => ({contents:
            `export {ExtensionRow} from ${JSON.stringify(join(process.cwd(), 'dist/react.mjs'))};`,
        resolveDir: process.cwd(), loader: 'js'}));
        builder.onResolve({filter: /^scratch-gui\/src\/components\/modal\/modal\.jsx$/}, () => ({path: 'modal', namespace: 'frame'}));
        builder.onLoad({filter: /.*/, namespace: 'frame'}, () => ({contents:
            `import React from 'react'; export default ({contentLabel, children}) =>
                React.createElement('div', {role:'dialog', 'aria-label':contentLabel}, children);`,
        resolveDir: process.cwd(), loader: 'jsx'}));
        builder.onResolve({filter: /\.css$/}, () => ({path: 'style', namespace: 'style'}));
        builder.onLoad({filter: /.*/, namespace: 'style'}, () => ({contents: 'export default {};', loader: 'js'}));
    }}]});
    const bundle = await bundleFor();
    const legacyBundle = desktop ? await bundleFor(true) : undefined;
    assert.equal(bundle.warnings.length, 0);
    if (legacyBundle) assert.equal(legacyBundle.warnings.length, 0);
    server = createServer((request, response) => {
        if (request.url === '/fixture.js' || request.url === '/legacy.js') {
            const selected = request.url === '/legacy.js' ? legacyBundle : bundle;
            response.writeHead(200, {'Content-Type': 'text/javascript'}).end(selected?.outputFiles[0].text);
        }
        else response.writeHead(200, {'Content-Type': 'text/html'}).end(`<!doctype html><meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}
            body{margin:8px;font:16px Arial;background:var(--ui-modal-background,#fff);color:var(--ui-modal-foreground,#263145)}
            </style><main></main><script>if(location.search.includes('dark')){
            document.body.style.setProperty('--ui-modal-background','#111');
            document.body.style.setProperty('--ui-modal-foreground','#eee');}</script><script src="${request.url.includes('legacy') ? '/legacy.js' : '/fixture.js'}"></script>`);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({headless: true});
});
after(async () => {await browser?.close(); if (server?.listening) await new Promise<void>(resolve => server.close(resolve));});

for (const adapter of desktop ? [false, true] : [false]) {
    for (const [locale, width, theme] of [['ja', 390, 'dark'], ['en', 320, 'light'], ['en', 1280, 'light']]) {
        test(`${adapter ? 'Desktop adapter' : 'shared component'} ${locale}/${width}: completed builds and failures preserve the active identity and require only explicit host operations`, async () => {
            const page = await browser.newPage({viewport: {width: Number(width), height: 850}});
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            const ja = locale === 'ja';
            try {
                await page.goto(`${base}/?locale=${locale}&theme=${theme}&source${adapter ? '&adapter' : ''}`);
                const first = page.locator('[data-session="first"]');
                const second = page.locator('[data-session="second"]');
                await first.waitFor();
                assert.deepEqual(await page.evaluate(() => window.calls), []);
                assert.equal(await page.evaluate(() => window.executed), undefined);
                const checkbox = first.getByRole('checkbox');
                await checkbox.focus();
                await checkbox.press('Space');
                assert.equal(await checkbox.isChecked(), false);
                assert.equal(await second.getByRole('checkbox').isChecked(), true);
                await page.evaluate(() => window.update('first', {enabled: true, waiting: true, buildError: 'LOCAL_EXTENSION_COMPILE_FAILED'}));
                assert.equal(await first.locator('[data-applied-digest]').getAttribute('data-applied-digest'), 'a'.repeat(64));
                assert.match(await first.innerText(), ja ? /ビルド失敗/ : /Build failed/);
                assert.doesNotMatch(await first.innerText(), ja ? /実行時エラー/ : /Runtime error/);
                await page.evaluate(() => window.update('first', {waiting: false, buildError: null,
                    diagnostic: {file: 'src/index.ts', line: 7, column: 4, sha256: 'a'.repeat(64)}}));
                assert.match(await first.innerText(), ja ? /実行時エラー/ : /Runtime error/);
                if (!adapter) await first.getByRole('button', {name: ja ? 'TypeScript の該当位置を開く' : 'Open TypeScript location'}).click();
                await page.evaluate(() => window.update('first', {appliedDigest: 'b'.repeat(64),
                    sourceHeader: '// Name: Example\n// Version: 2.0.0'}));
                assert.equal(await first.locator('[data-applied-digest]').getAttribute('data-applied-digest'), 'b'.repeat(64));
                assert.match(await first.innerText(), ja ? /以前のビルドの実行時エラー/ : /earlier build/);
                assert.equal(await first.getByRole('button', {name: ja ? 'TypeScript の該当位置を開く' : 'Open TypeScript location'}).count(), 0);
                assert.equal(await first.locator('.twextsec-failed').evaluate(element => getComputedStyle(element).color),
                    await page.locator('.twextsec-development').evaluate(element => getComputedStyle(element).color));
                await page.evaluate(() => {document.querySelector('.twextsec-development-scroll').scrollTop = 0; window.scrollTo(0, 0);});
                await page.screenshot({path: join(tmpdir(), `twextsec-development-normal-${adapter ? 'adapter' : 'shared'}-${locale}-${width}.png`)});
                await page.getByRole('button', {name: ja ? 'TypeScript フォルダを接続…' : 'Connect a TypeScript folder…'}).click();
                const cancel = page.getByRole('button', {name: ja ? '接続をキャンセル' : 'Cancel connecting'});
                await cancel.click();
                assert.equal(await cancel.isDisabled(), true);
                assert.equal(await page.getByRole('button', {name: ja ? '閉じる' : 'Close', exact: true}).isDisabled(), true);
                assert.equal(await checkbox.isDisabled(), true);
                await page.setViewportSize({width: Number(width), height: 568});
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
                const closeBox = await page.getByRole('button', {name: ja ? '閉じる' : 'Close', exact: true}).boundingBox();
                await page.screenshot({path: join(tmpdir(), `twextsec-development-${adapter ? 'adapter' : 'shared'}-${locale}-${width}.png`)});
                assert.ok(closeBox.y >= 0 && closeBox.y + closeBox.height <= 568, JSON.stringify(closeBox));
                await page.evaluate(() => window.setAdding(false));
                await first.getByRole('button', {name: ja ? 'フォルダの接続を解除' : 'Disconnect folder'}).click();
                await page.getByRole('button', {name: ja ? '閉じる' : 'Close', exact: true}).click();
                const calls = await page.evaluate(() => window.calls);
                assert.equal(calls.filter(call => call[0] === 'add').length, 1);
                assert.equal(calls.filter(call => call[0] === 'cancel').length, 1);
                assert.equal(calls.filter(call => call[0] === 'remove' && call[1] === 'first').length, 1);
                assert.equal(calls.filter(call => call[0] === 'close').length, 1);
                assert.deepEqual(errors, []);
            } finally {await page.close();}
        });
    }
}

test('the Desktop adapter keeps the existing add-on screen separate', {skip: !desktop}, async () => {
    const page = await browser.newPage();
    try {
        await page.goto(`${base}/?locale=en&adapter&addon`);
        await page.getByRole('dialog', {name: 'Editor Add-on Development Folders'}).waitFor();
        assert.equal(await page.locator('.twextsec-development').count(), 0);
        await page.getByRole('button', {name: 'Add Development Folder…', exact: true}).click();
        assert.deepEqual(await page.evaluate(() => window.calls), [['add', 'artifact']]);
    } finally {await page.close();}
});

test('the Desktop adapter retains its existing UI when the pinned shared package has no development export', {skip: !desktop}, async () => {
    const page = await browser.newPage();
    try {
        await page.goto(`${base}/?locale=en&adapter&legacy`);
        await page.getByRole('dialog', {name: 'Extension Development Folders'}).waitFor();
        assert.equal(await page.locator('.twextsec-development').count(), 0);
        await page.getByRole('button', {name: 'Add Development Folder…', exact: true}).click();
        assert.deepEqual(await page.evaluate(() => window.calls), [['add', 'artifact']]);
    } finally {await page.close();}
});

test('the Web fixture contains no local folder or source build controls', async () => {
    const page = await browser.newPage();
    try {
        await page.goto(`${base}/?locale=en&web&source`);
        assert.equal(await page.getByRole('button').count(), 0);
        assert.deepEqual(await page.evaluate(() => window.calls), []);
    } finally {await page.close();}
});
