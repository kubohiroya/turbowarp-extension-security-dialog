import assert from 'node:assert/strict';
import {test, before, after} from 'node:test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const origin = 'https://extensions.turbowarp.org/';
const extensions = [
    {slug: '-SIPC-/consoles', id: 'sipcconsole', name: 'Consoles', image: 'images/-SIPC-/consoles.svg'},
    {slug: 'Lily/TempVariables2', id: 'lmsTempVars2', name: 'Temporary Variables', image: 'images/Lily/TempVariables2.svg'},
    {slug: 'text', id: 'strings', name: 'Text', image: 'images/text.svg'}
];
let server, browser, base;
before(async () => {
    const bundle = await build({stdin: {contents: `
        import React from 'react';
        import ReactDOM from 'react-dom';
        import {createProjectSecurityReview} from './dist/project-review.mjs';
        const project = createProjectSecurityReview({
            trusted: {isTrustedURL: async url => url === 'https://family.test/plus.js'},
            catalog: {read: async () => ({catalog: {extensions: [{id: 'plus', url: 'https://family.test/plus.js',
                banner: 'https://family.test/assets/block-icon.svg'}]}})},
            pendingReview: () => null, reviewedArchive: () => undefined,
            duringApproval: (_vm, run) => run(), styles: {}
        });
        let batch;
        const review = project.createSecurityReview({install: (_vm, ask) => {batch = ask; return () => {};}});
        const params = new URLSearchParams(location.search);
        review.installBatchLoader({vm: {}, isTrusted: url => url.startsWith('${origin}'),
            bannerFor: () => undefined, defaultURLs: {},
            showReview: (entries, initialChoices) => {
                ReactDOM.render(review.render({entries, initialChoices, locale: params.get('locale'),
                    onComplete: answer => {window.answer = answer === null ? null : [...answer];}}), document.querySelector('main'));
                window.rows = entries;
                return new Promise(() => {});
            }});
        const entries = ${JSON.stringify(extensions)}.map(item => ({key: item.id, ids: [item.id],
            metadata: {name: item.name}, source: {kind: 'legacy', url: '${origin}' + item.slug + '.js'}}));
        entries.push({key: 'plus', ids: ['plus'], metadata: {name: 'Plus family'},
            source: {kind: 'legacy', url: 'https://family.test/plus.js'}});
        entries.push({key: 'other', ids: ['strings'], metadata: {name: 'Unlisted extension', banner: '/broken.svg'},
            source: {kind: 'legacy', url: 'https://other.test/text.js'}});
        batch(entries);
    `, resolveDir: process.cwd()}, tsconfigRaw: {}, bundle: true, write: false, format: 'iife', platform: 'browser'});
    const css = await readFile('styles.css', 'utf8');
    server = createServer((request, response) => {
        if (request.url === '/bundle.js') {
            response.setHeader('Content-Type', 'text/javascript');
            response.end(bundle.outputFiles[0].text);
        } else if (request.url === '/broken.svg') response.writeHead(404).end();
        else {
            response.setHeader('Content-Type', 'text/html');
            response.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
                <style>${css}body{font:16px Arial;background:#fff;color:#263145;padding:16px}
                body.dark{--ui-modal-background:#111;--ui-modal-foreground:#eee;background:#222;color:#eee}</style>
                <body><main></main><script>if(location.search.includes('dark'))document.body.className='dark'</script>
                <script src="/bundle.js"></script>`);
        }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({headless: true});
});
after(async () => {
    await browser?.close();
    if (server?.listening) await new Promise<void>(resolve => server.close(resolve));
});

for (const [locale, theme, width] of [['ja', 'dark', 1280], ['en', 'light', 390], ['ja', 'light', 320]]) {
    test(`${locale}/${theme}: project review shows gallery images without Plus attribution or executing code`, async () => {
        const context = await browser.newContext({viewport: {width: Number(width), height: 1050}});
        const page = await context.newPage();
        let catalogRequests = 0;
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route(`${origin}**`, async route => {
            const url = route.request().url();
            if (url.endsWith('extensions-v0.json')) {
                catalogRequests++;
                await route.fulfill({json: {extensions}});
            } else if (url.includes('/images/')) {
                const index = extensions.findIndex(item => url === `${origin}${item.image}`);
                await route.fulfill({contentType: 'image/svg+xml', body:
                    `<svg xmlns="http://www.w3.org/2000/svg" width="${80 + index}" height="40"><rect width="100%" height="100%" fill="#6370a2"/></svg>`});
            } else await route.abort(); // Source metadata unavailable; gallery pictures must still appear.
        });
        await page.route('https://family.test/**', route => route.request().url().endsWith('.svg') ?
            route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="8" fill="#7352d6"/><path d="M32 12v40M12 32h40" stroke="white" stroke-width="8"/></svg>'}) :
            route.fulfill({body: '// Name: Plus family\nwindow.extensionExecuted = true;'}));
        await page.route('https://other.test/**', route => route.fulfill({body: '// Name: Other\nwindow.extensionExecuted = true;'}));
        try {
            await page.goto(`${base}/?locale=${locale}&theme=${theme}`);
            for (let index = 0; index < extensions.length; index++) {
                const row = page.locator(`[data-key="${extensions[index].id}"]`);
                await row.locator('.twextsec-preview:not(.twextsec-preview-fallback)').waitFor();
                await page.waitForFunction(({id, size}) => {
                    const image = document.querySelector(`[data-key="${id}"] .twextsec-preview`) as HTMLImageElement;
                    return image?.complete && image.naturalWidth === size;
                }, {id: extensions[index].id, size: 80 + index});
                assert.doesNotMatch(await row.locator('.twextsec-trusted').getAttribute('alt'), /Plus/);
                const size = await row.locator('.twextsec-preview').boundingBox();
                assert.equal(size.width, 180);
                assert.equal(size.height, 90);
                const bottomSpace = await row.evaluate(row => {
                    const bottom = Math.max(...[...row.children].filter(child => getComputedStyle(child).display !== 'none')
                        .map(child => child.getBoundingClientRect().bottom));
                    return row.getBoundingClientRect().bottom - bottom;
                });
                assert.ok(Math.abs(bottomSpace - 9) < 1, `unexpected blank space below the row: ${bottomSpace}px`);
            }
            const family = page.locator('[data-key="plus"] .twextsec-preview:not(.twextsec-preview-fallback)');
            await family.waitFor();
            await page.waitForFunction(() => {
                const image = document.querySelector('[data-key="plus"] .twextsec-preview') as HTMLImageElement;
                return image?.complete && image.naturalWidth === 64 && image.naturalHeight === 64;
            });
            assert.deepEqual(await family.evaluate(image => {
                const style = getComputedStyle(image);
                return {fit: style.objectFit, position: style.objectPosition};
            }), {fit: 'contain', position: '50% 50%'});
            const familySize = await family.boundingBox();
            assert.equal(familySize.width / familySize.height, 2);
            assert.equal(familySize.width, 180);
            assert.equal(familySize.height, 90);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.screenshot({path: join(tmpdir(), `tw-gallery-review-${locale}-${width}.png`), fullPage: true});
            await page.locator('[data-key="other"] .twextsec-preview-fallback').waitFor();
            assert.equal(await page.locator('[data-key="other"] .twextsec-trusted').count(), 0);
            assert.match(await page.locator('[data-key="plus"] .twextsec-trusted').getAttribute('alt'), /Plus/);
            assert.equal(catalogRequests, 1);
            assert.equal(await page.evaluate(() => window.extensionExecuted), undefined);
            assert.equal(await page.evaluate(() => window.answer), undefined);
            assert.deepEqual(await page.evaluate(() => window.rows.slice(0, 3).map(row => row.state)),
                extensions.map(() => ({trusted: true, plusFamily: false})));
            await page.getByTestId('twextsec-cancel').click();
            assert.equal(await page.evaluate(() => window.answer), null);
            assert.deepEqual(errors, []);
        } finally {await context.close();}
    });
}
