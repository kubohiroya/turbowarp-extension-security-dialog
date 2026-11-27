import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {after, before, test} from 'node:test';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';

let server, browser, base;
before(async () => {
    const css = await readFile('src/review.css', 'utf8');
    const bundle = await build({stdin: {contents: `
        import React from 'react';
        import ReactDOM from 'react-dom';
        import {PublishedExtension} from './src/published-extension.tsx';
        const calls = window.calls = [];
        const params = new URLSearchParams(location.search);
        function wait(kind, signal, result) {
            calls.push(kind);
            signal.addEventListener('abort', () => calls.push(kind + ':abort'), {once: true});
            return new Promise((resolve, reject) => {
                window.finish = () => resolve(result);
                window.fail = () => reject({code: 'NOT_FOUND'});
            });
        }
        const candidate = {distribution: {id: 'sample', package: 'sample', version: '1.0.0', name: 'Sample',
            description: '<script>window.executed = true</script>', license: 'MIT', execution: 'sandboxed',
            bundle: {sha256: 'd'.repeat(64)}, resources: {}}, bytes: new Uint8Array(),
            source: {provider: 'github', repository: 'third-party/sample', tag: 'v1.0.0', commit: 'c'.repeat(40)}};
        function resolved(reference) {
            if (params.has('legacy')) return {...candidate, source: undefined};
            if (!params.has('versions')) return candidate;
            const npm = params.get('provider') === 'npm';
            const tag = npm ? reference.slice(reference.lastIndexOf('@') + 1) : reference.split('/').at(-1);
            const version = tag.replace(/^v/, '');
            return {...candidate, distribution: {...candidate.distribution, version,
                package: npm ? '@third-party/sample' : 'sample'},
                source: npm ? {provider: 'npm'} : {...candidate.source, tag}};
        }
        ReactDOM.render(React.createElement(PublishedExtension, {
            locale: params.get('locale'), blocked: false,
            allowReferenceAliases: location.search.includes('aliases'),
            resolve: (reference, {signal}) => wait('inspect:' + reference, signal, resolved(reference)),
            add: (candidate, {signal}) => {
                window.requestedAddition = candidate.distribution.version;
                return wait('add:' + candidate.distribution.id, signal);
            },
            onBusyChange: state => calls.push('busy:' + state),
            onAdded: id => calls.push('added:' + id)
        }), document.querySelector('main'));
        window.unmount = () => ReactDOM.unmountComponentAtNode(document.querySelector('main'));
    `, resolveDir: process.cwd()}, bundle: true, write: false, platform: 'browser'});
    server = createServer((request, response) => {
        if (request.url === '/fixture.js') response.writeHead(200, {'Content-Type': 'text/javascript'}).end(bundle.outputFiles[0].text);
        else response.writeHead(200, {'Content-Type': 'text/html'}).end(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<style>' + css + 'body{font:16px Arial;margin:8px;background:var(--ui-modal-background,#fff);color:var(--ui-modal-foreground,#263145)}</style>' +
            '<main></main><script>if(location.search.includes("dark")){document.body.style.setProperty("--ui-modal-background","#111");' +
            'document.body.style.setProperty("--ui-modal-foreground","#eee");}</script><script src="/fixture.js"></script>');
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
        assert.deepEqual(await page.evaluate(() => window.calls), [
            'busy:true', 'inspect:sample@1.0.0', 'inspect:sample@1.0.0:abort'
        ]);
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
            'busy:true', 'inspect:sample@1.0.0', 'inspect:sample@1.0.0:abort', 'busy:false',
            'busy:true', 'inspect:sample@1.0.0', 'busy:false'
        ]);
    } finally { await page.close(); }
});

test('disposing an inspection aborts it and ignores late completion callbacks', async () => {
    const page = await browser.newPage();
    try {
        await page.goto(`${base}/?locale=en`);
        await page.getByRole('textbox').fill('sample@1.0.0');
        await page.getByRole('button', {name: 'Inspect', exact: true}).click();
        await page.evaluate(async () => {
            window.unmount();
            window.finish();
            await new Promise(resolve => setTimeout(resolve, 0));
        });
        assert.equal(await page.locator('main').textContent(), '');
        assert.deepEqual(await page.evaluate(() => window.calls), [
            'busy:true', 'inspect:sample@1.0.0', 'inspect:sample@1.0.0:abort'
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
        assert.deepEqual(await page.evaluate(() => window.calls), ['busy:true', 'inspect:https://github.com/third-party/sample',
            'busy:false', 'busy:true', 'add:sample', 'add:sample:abort']);
        await page.evaluate(() => window.finish());
        await page.getByRole('status').waitFor({state: 'hidden'});
        assert.equal(await page.getByRole('alert').count(), 0);
        await add.click();
        await page.evaluate(() => window.finish());
        await page.waitForFunction(() => window.calls.includes('added:sample'));
        assert.deepEqual(await page.evaluate(() => window.calls), [
            'busy:true', 'inspect:https://github.com/third-party/sample', 'busy:false',
            'busy:true', 'add:sample', 'add:sample:abort', 'busy:false',
            'busy:true', 'add:sample', 'busy:false', 'added:sample'
        ]);
    } finally { await page.close(); }
});

test('an older host without provenance retains inspection, addition and returning to the same input', async () => {
    const page = await browser.newPage();
    try {
        await page.goto(`${base}/?locale=en&legacy`);
        await page.getByRole('textbox').fill('sample@1.0.0');
        await page.getByRole('button', {name: 'Inspect', exact: true}).click();
        await page.evaluate(() => window.finish());
        const add = page.getByRole('button', {name: 'Add published extension'});
        await add.waitFor();
        assert.equal(await add.isEnabled(), true);
        assert.equal(await page.getByRole('textbox').count(), 0);
        await page.getByRole('button', {name: 'Back to source'}).click();
        assert.equal(await page.getByRole('textbox').inputValue(), 'sample@1.0.0');
        assert.equal(await page.evaluate(() => window.requestedAddition), undefined);
    } finally {await page.close();}
});

for (const [locale, provider, width, theme] of [['ja', 'npm', 390, 'dark'], ['en', 'github', 320, 'light']]) {
    test(`${locale}/${provider}: choosing another version requires inspection, preserves retries and returns to its source`, async () => {
        const page = await browser.newPage({viewport: {width: Number(width), height: 800}});
        const ja = locale === 'ja';
        const initial = provider === 'npm' ? '@third-party/sample@1.0.0' :
            'https://github.com/third-party/sample/releases/tag/v1.0.0';
        const next = provider === 'npm' ? '@third-party/sample@2.0.0' :
            'https://github.com/third-party/sample/releases/tag/v2.0.0';
        const inspectName = ja ? '確認' : 'Inspect';
        const addName = ja ? '公開拡張を追加' : 'Add published extension';
        const versionName = provider === 'npm' ? 'npm の正確な版' : 'Release tag';
        try {
            await page.goto(`${base}/?locale=${locale}&provider=${provider}&theme=${theme}&versions`);
            const input = page.getByRole('textbox');
            await input.fill(initial);
            await input.press('Enter');
            await page.evaluate(() => window.finish());
            const version = page.getByRole('textbox', {name: versionName, exact: true});
            await version.fill('https://localhost:9999/build');
            await version.press('Enter');
            assert.equal(await page.getByRole('button', {name: ja ? 'この版を確認' : 'Inspect version', exact: true}).isDisabled(), true);
            assert.equal(await page.evaluate(() => window.calls.filter(call => call.startsWith('inspect:')).length), 1);
            await version.fill(provider === 'npm' ? '2.0.0' : 'v2.0.0');
            const add = page.getByRole('button', {name: addName, exact: true});
            const inspect = page.getByRole('button', {name: ja ? 'この版を確認' : 'Inspect version', exact: true});
            assert.equal(await add.isDisabled(), true);
            await version.press('Enter');
            await page.getByRole('button', {name: ja ? 'キャンセル' : 'Cancel', exact: true}).click();
            assert.equal(await inspect.isDisabled(), true);
            await page.evaluate(() => window.finish());
            await page.getByRole('status').waitFor({state: 'hidden'});
            assert.equal(await add.isDisabled(), true);
            assert.equal(await version.inputValue(), provider === 'npm' ? '2.0.0' : 'v2.0.0');
            await inspect.click();
            await page.evaluate(() => window.fail());
            await page.getByRole('alert').waitFor();
            assert.equal(await add.isDisabled(), true);
            await inspect.click();
            await page.evaluate(() => window.finish());
            await page.getByRole('status').waitFor({state: 'hidden'});
            assert.equal(await add.isEnabled(), true);
            assert.equal(await page.evaluate(() => window.requestedAddition), undefined);
            assert.equal(await page.evaluate(() => window.executed), undefined);
            await page.getByRole('button', {name: ja ? '配布元の入力に戻る' : 'Back to source', exact: true}).click();
            const source = page.getByRole('textbox');
            assert.equal(await source.inputValue(), next);
            assert.equal(await source.evaluate(element => element === document.activeElement), true);
            await page.getByRole('button', {name: inspectName, exact: true}).click();
            await page.evaluate(() => window.finish());
            await page.getByRole('status').waitFor({state: 'hidden'});
            await page.getByText(ja ? '検証済み成果物の詳細' : 'Verified artifact details').click();
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            const colors = await page.locator('section').evaluate(element => ({
                foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor
            }));
            assert.deepEqual(colors, theme === 'dark' ?
                {foreground: 'rgb(238, 238, 238)', background: 'rgb(17, 17, 17)'} :
                {foreground: 'rgb(38, 49, 69)', background: 'rgb(255, 255, 255)'});
            await add.click();
            await page.evaluate(() => window.finish());
            await page.waitForFunction(() => window.calls.includes('added:sample'));
            assert.equal(await page.evaluate(() => window.requestedAddition), '2.0.0');
            const calls = await page.evaluate(() => window.calls);
            assert.equal(calls.filter(value => value === 'add:sample').length, 1);
            assert.equal(calls.filter(value => value === 'added:sample').length, 1);
            assert.equal(calls.filter(value => value === 'inspect:' + next).length, 4);
        } finally { await page.close(); }
    });
}
