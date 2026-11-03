import assert from 'node:assert/strict';
import {test, before, after} from 'node:test';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

const require = createRequire(process.env.TW_SECURITY_PLAYWRIGHT_PACKAGE || import.meta.url);
const {chromium, devices} = require('@playwright/test');
let browser, server, base;

before(async () => {
    const result = await build({
        stdin: {contents: `
            import React from 'react';
            import ReactDOM from 'react-dom';
            import {ExtensionReview} from './dist/react.mjs';
            const locale = new URLSearchParams(location.search).get('locale');
            const entries = Array.from({length: 24}, (_, i) => ({key: 'extension' + i,
                ids: ['extension' + i], source: {kind: 'catalog', url: 'https://example.test/' + i},
                metadata: {name: 'Extension ' + i, version: '1.2.3-rc.1',
                    docsURL: 'https://example.github.io/extension/', repository: 'https://github.com/example/extension',
                    author: 'Creator', authorURL: 'mailto:creator@example.test',
                    description: 'First line\\nhttps://example.test/help#details\\ncontact@example.test'},
                state: {trusted: true}}));
            ReactDOM.render(React.createElement(ExtensionReview, {mode: 'add', entries, locale,
                previewCache: null, onComplete: answer => {window.answer = [...answer];}}),
                document.getElementById('app'));
        `, resolveDir: process.cwd()},
        bundle: true, write: false, format: 'iife', platform: 'browser'
    });
    const css = await readFile('styles.css', 'utf8');
    server = createServer((request, response) => {
        if (request.url === '/bundle.js') {
            response.setHeader('Content-Type', 'text/javascript');
            response.end(result.outputFiles[0].text);
        } else {
            response.setHeader('Content-Type', 'text/html');
            response.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
                <style>${css}
                body {margin: 0; font: 16px Arial; background: white; color: #263145;}
                body.dark {--ui-modal-foreground: #eee; --ui-modal-background: #111;
                    --ui-warning-background: #fff3cd; background: #222; color: #eee;}
                #app {height: 100dvh; overflow: auto; padding: 16px; box-sizing: border-box;}
                </style><body><main id="app"></main>
                <script>if(location.search.includes('dark')) document.body.className = 'dark';</script>
                <script src="/bundle.js"></script>`);
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({headless: true});
});

after(async () => {
    await browser?.close();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
});

const luminance = color => {
    const linear = color.match(/\d+/g).slice(0, 3).map(value => {
        const s = Number(value) / 255;
        return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
    });
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
};

for (const locale of ['en', 'ja']) for (const theme of ['light', 'dark']) {
    for (const mobile of [false, true]) {
        test(`${locale}/${theme}/${mobile ? 'mobile' : 'desktop'}: notice preserves the list and dismisses without changing decisions`,
            {timeout: 30000}, async () => {
                const context = await browser.newContext(mobile ? devices['Pixel 7'] :
                    {viewport: {width: 1280, height: 900}});
                const page = await context.newPage();
                await context.route('https://example.github.io/**', route => route.fulfill({body: 'Extension website'}));
                await context.route('https://github.com/example/**', route => route.fulfill({body: 'Release notes'}));
                const errors = [];
                page.on('pageerror', error => errors.push(error.message));
                await page.goto(`${base}/?locale=${locale}&theme=${theme}`);
                const checkbox = page.locator('[data-key="extension3"] input[type="checkbox"]');
                const row = page.locator('[data-key="extension3"]');
                for (const [selector, expected] of [
                    ['.twextsec-trusted-link', 'https://example.github.io/extension/'],
                    ['.twextsec-head a:not(.twextsec-trusted-link)', 'https://github.com/example/extension/releases/tag/v1.2.3-rc.1']
                ]) {
                    const link = row.locator(selector);
                    await link.focus();
                    const [popup] = await Promise.all([context.waitForEvent('page'), link.press('Enter')]);
                    await popup.waitForLoadState();
                    assert.equal(popup.url(), expected);
                    await popup.close();
                    assert.equal(await checkbox.isChecked(), false);
                }
                assert.equal(await row.locator('.twextsec-contact a').getAttribute('href'), 'mailto:creator@example.test');
                const about = row.locator('.twextsec-about');
                assert.equal(await about.textContent(), 'First line\nhttps://example.test/help#details\ncontact@example.test');
                assert.equal(await about.evaluate(element => getComputedStyle(element).whiteSpace), 'pre-wrap');
                assert.equal(await about.locator('a').count(), 2);
                await checkbox.scrollIntoViewIfNeeded();
                const before = await checkbox.boundingBox();
                const icon = await row.locator('.twextsec-preview').boundingBox();
                const name = await row.locator('strong').boundingBox();
                assert.ok(before.x + before.width < icon.x && icon.x + icon.width < name.x);
                assert.ok(Math.abs(before.y + before.height / 2 - (icon.y + icon.height / 2)) < 2);
                const scroll = await page.locator('#app').evaluate(element => element.scrollTop);
                await checkbox.check();
                const notice = page.locator('.twextsec-warning');
                await notice.waitFor({state: 'visible'});
                assert.deepEqual(await checkbox.boundingBox(), before);
                assert.equal(await page.locator('#app').evaluate(element => element.scrollTop), scroll);
                const rect = await notice.boundingBox();
                const viewport = page.viewportSize();
                assert.ok(rect.x >= 0 && rect.x + rect.width <= viewport.width);
                assert.ok(Math.abs(rect.y + rect.height - (viewport.height - 16)) < 2);
                const colors = await notice.evaluate(element => {
                    const style = getComputedStyle(element);
                    return {text: style.color, background: style.backgroundColor,
                        fits: element.scrollWidth === element.clientWidth && element.scrollHeight === element.clientHeight};
                });
                assert.ok(colors.fits);
                assert.equal(await page.locator('#app').evaluate(element => element.scrollWidth <= element.clientWidth), true);
                assert.ok((luminance(colors.text) + .05) / (luminance(colors.background) + .05) >= 7);
                const close = notice.getByRole('button', {name: locale === 'ja' ? '閉じる' : 'Close', exact: true});
                await close.focus();
                await page.keyboard.press('Enter');
                await notice.waitFor({state: 'detached'});
                assert.equal(await checkbox.isChecked(), true);
                assert.equal(await checkbox.evaluate(element => element === document.activeElement), true);
                assert.deepEqual(await checkbox.boundingBox(), before);
                await checkbox.uncheck();
                await checkbox.check();
                await notice.waitFor({state: 'visible'});
                if (process.env.TW_SECURITY_SCREENSHOT_DIR) {
                    await page.screenshot({path: `${process.env.TW_SECURITY_SCREENSHOT_DIR}/${locale}-${theme}-${mobile ? 'mobile' : 'desktop'}.png`});
                }
                await notice.getByRole('button').click();
                await page.getByTestId('twextsec-complete').click();
                assert.deepEqual(await page.evaluate(() => window.answer),
                    [['extension3', {execution: 'unsandboxed', loading: 'remote-cacheable'}]]);
                assert.deepEqual(errors, []);
                await context.close();
            });
    }
}
