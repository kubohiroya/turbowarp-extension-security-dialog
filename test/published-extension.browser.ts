import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {after, before, test} from 'node:test';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

let server, browser, base;
before(async () => {
    const bundle = await build({stdin: {contents: `
        import React from 'react';
        import ReactDOM from 'react-dom';
        import {PublishedExtension} from './src/published-extension.tsx';
        const calls = window.calls = [];
        function wait(kind, signal, result) {
            calls.push(kind);
            signal.addEventListener('abort', () => calls.push(kind + ':abort'), {once: true});
            return new Promise(resolve => {window.finish = () => resolve(result);});
        }
        const candidate = {distribution: {id: 'sample', package: 'sample', version: '1.0.0', name: 'Sample',
            description: '<script>window.executed = true</script>', license: 'MIT', execution: 'sandboxed',
            bundle: {sha256: 'd'.repeat(64)}, resources: {}}, bytes: new Uint8Array(),
            source: {provider: 'github', repository: 'third-party/sample', tag: 'v1.0.0', commit: 'c'.repeat(40)}};
        ReactDOM.render(React.createElement(PublishedExtension, {
            locale: new URLSearchParams(location.search).get('locale'), blocked: false,
            allowReferenceAliases: location.search.includes('aliases'),
            resolve: (reference, {signal}) => wait('inspect:' + reference, signal, candidate),
            add: (candidate, {signal}) => wait('add:' + candidate.distribution.id, signal),
            onBusyChange: state => calls.push('busy:' + state),
            onAdded: id => calls.push('added:' + id)
        }), document.querySelector('main'));
    `, resolveDir: process.cwd()}, bundle: true, write: false, platform: 'browser'});
    server = createServer((request, response) => {
        if (request.url === '/fixture.js') response.writeHead(200, {'Content-Type': 'text/javascript'}).end(bundle.outputFiles[0].text);
        else response.writeHead(200, {'Content-Type': 'text/html'}).end('<!doctype html><meta charset="utf-8"><main></main><script src="/fixture.js"></script>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
});
after(async () => {
    await browser?.close();
    if (server?.listening) await new Promise<void>(resolve => server.close(resolve));
});

test('cancelled inspection ignores a late result and allows trying the same input again', async () => {
    const page = await browser.newPage();
    try {
        await page.goto(`${base}/?locale=ja`);
        const input = page.getByRole('textbox');
        const inspect = page.getByRole('button', {name: '確認', exact: true});
        await input.fill('sample@1.0.0');
        await inspect.click();
        await page.getByRole('button', {name: 'キャンセル', exact: true}).click();
        assert.equal(await page.getByRole('status').textContent(), 'キャンセル中…');
        assert.equal(await inspect.isDisabled(), true);
        await page.evaluate(() => window.finish());
        await page.getByRole('status').waitFor({state: 'hidden'});
        assert.equal(await page.getByRole('alert').count(), 0);
        assert.equal(await page.getByRole('button', {name: '公開拡張を追加'}).count(), 0);
        assert.equal(await input.inputValue(), 'sample@1.0.0');
        await inspect.click();
        await page.evaluate(() => window.finish());
        await page.getByRole('button', {name: '公開拡張を追加'}).waitFor();
        await page.getByText('GitHub: third-party/sample · v1.0.0').waitFor();
        await page.getByText('検証済み成果物の詳細').click();
        await page.getByText('c'.repeat(40), {exact: true}).waitFor();
        await page.getByText('d'.repeat(64), {exact: true}).waitFor();
        assert.equal(await page.evaluate(() => window.executed), undefined);
        assert.deepEqual(await page.evaluate(() => window.calls), [
            'inspect:sample@1.0.0', 'inspect:sample@1.0.0:abort', 'inspect:sample@1.0.0'
        ]);
    } finally { await page.close(); }
});

test('cancelled installation holds the busy guard until it settles and does not announce a late success', async () => {
    const page = await browser.newPage();
    try {
        await page.goto(`${base}/?locale=en&aliases`);
        const input = page.getByRole('textbox', {name: 'npm package or GitHub repository / Release'});
        await input.fill('https://github.com/third-party/sample');
        await page.getByRole('button', {name: 'Inspect', exact: true}).click();
        await page.evaluate(() => window.finish());
        const add = page.getByRole('button', {name: 'Add published extension'});
        await add.click();
        await page.getByRole('button', {name: 'Cancel', exact: true}).click();
        assert.equal(await add.isDisabled(), true);
        assert.deepEqual(await page.evaluate(() => window.calls), ['inspect:https://github.com/third-party/sample', 'busy:true', 'add:sample', 'add:sample:abort']);
        await page.evaluate(() => window.finish());
        await page.getByRole('status').waitFor({state: 'hidden'});
        assert.equal(await page.getByRole('alert').count(), 0);
        await add.click();
        await page.evaluate(() => window.finish());
        await page.waitForFunction(() => window.calls.includes('added:sample'));
        assert.deepEqual(await page.evaluate(() => window.calls), [
            'inspect:https://github.com/third-party/sample', 'busy:true', 'add:sample', 'add:sample:abort', 'busy:false',
            'busy:true', 'add:sample', 'busy:false', 'added:sample'
        ]);
    } finally { await page.close(); }
});
