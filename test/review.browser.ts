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
            const opening = new URLSearchParams(location.search).has('open');
            const entries = Array.from({length: 24}, (_, i) => ({key: 'extension' + i,
                ids: ['extension' + i], source: {kind: opening ? 'remote-cacheable' : 'catalog', url: 'https://example.test/' + i},
                metadata: {name: 'Extension ' + i, version: '1.2.3-rc.1',
                    ...(i === 0 ? {banner: 'http://localhost:' + location.port + '/preview.svg'} : {}),
                    docsURL: 'https://example.github.io/extension/', repository: 'https://github.com/example/extension',
                    author: 'Creator', authorURL: 'mailto:creator@example.test',
                    description: 'First line\\nhttps://example.test/help#details\\ncontact@example.test'},
                state: {trusted: !opening}}));
            ReactDOM.render(React.createElement(ExtensionReview, {mode: opening ? 'open' : 'add', entries, locale,
                previewCache: null, onComplete: answer => {window.answer = answer === null ? null : [...answer];}}),
                document.getElementById('app'));
        `, resolveDir: process.cwd()},
        bundle: true, write: false, format: 'iife', platform: 'browser'
    });
    const css = await readFile('styles.css', 'utf8');
    server = createServer((request, response) => {
        if (request.url === '/bundle.js') {
            response.setHeader('Content-Type', 'text/javascript');
            response.end(result.outputFiles[0].text);
        } else if (request.url === '/preview.svg') {
            // A displayable image without CORS permission to read/cache its bytes.
            response.setHeader('Content-Type', 'image/svg+xml');
            response.end('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#7352d6"/></svg>');
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

for (const locale of ['en', 'ja']) for (const theme of ['light', 'dark']) for (const width of [1280, 390, 320]) {
    test(`opening/${locale}/${theme}/${width}: overview, individual buttons, keyboard and explicit permission`,
        {timeout: 30000}, async () => {
            const context = await browser.newContext({viewport: {width, height: 900}});
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            try {
                await page.goto(`${base}/?open&locale=${locale}&theme=${theme}`);
                const first = page.locator('[data-key="extension0"]');
                await page.waitForFunction(() => {
                    const image = document.querySelector('[data-key="extension0"] .twextsec-preview');
                    return image?.complete && image.naturalWidth === 40;
                });
                assert.equal(await first.locator('.twextsec-preview-fallback').count(), 0);
                assert.equal(await first.locator('input, button').count(), 0);
                assert.equal(await page.locator('.twextsec-open-actions button').count(), 3);
                assert.equal(await page.getByTestId('twextsec-complete').count(), 0);
                assert.equal(await page.evaluate(() => window.answer), undefined);
                if (locale === 'ja' && theme === 'light' && width === 1280) {
                    await page.screenshot({path: '/private/tmp/tw-review-overview.png'});
                }
                await page.getByTestId('twextsec-individual').click();
                const individual = page.getByTestId('twextsec-individual');
                assert.equal(await individual.isDisabled(), true);
                assert.equal(await individual.getAttribute('aria-pressed'), 'true');
                assert.equal(await individual.evaluate(element => {
                    const style = getComputedStyle(element);
                    return style.backgroundColor !== getComputedStyle(element.parentElement).backgroundColor && style.opacity === '1';
                }), true);
                const group = first.locator('.twextsec-execution');
                assert.equal(await group.getByRole('button').count(), 3);
                assert.equal(await group.locator('input, .twextsec-choice-icon').count(), 0);
                assert.equal(await group.locator('[aria-pressed="true"]').count(), 1);
                const deny = group.locator('[data-execution="deny"]');
                await deny.click();
                assert.equal(await deny.getAttribute('aria-pressed'), 'true');
                await deny.press('ArrowRight');
                const sandbox = group.locator('[data-execution="sandboxed"]');
                assert.equal(await sandbox.getAttribute('aria-pressed'), 'true');
                assert.equal(await sandbox.evaluate(element => element === document.activeElement), true);
                assert.equal(await page.evaluate(() => window.answer), undefined);
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
                const bounds = await group.boundingBox();
                assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
                if (locale === 'ja' && theme === 'light' && width === 1280) {
                    await page.screenshot({path: '/private/tmp/tw-review-individual.png'});
                }
                await page.getByTestId('twextsec-complete').click();
                const answer = await page.evaluate(() => window.answer);
                assert.equal(answer.find(([key]) => key === 'extension0')[1].execution, 'sandboxed');
                assert.deepEqual(errors, []);
                await page.reload();
                await page.getByTestId('twextsec-enable-all').click();
                assert.equal(await page.evaluate(() => window.answer.every(([, value]) => value.execution === 'unsandboxed')), true);
            } finally {await context.close();}
        });
}

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
                const actions = page.locator('.twextsec-actions');
                const initialActions = await actions.boundingBox();
                assert.ok(initialActions.y >= 0 && initialActions.y + initialActions.height <= page.viewportSize().height);
                assert.equal(await page.getByTestId('twextsec-cancel').isVisible(), true);
                assert.equal(await page.getByTestId('twextsec-complete').isVisible(), true);
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
                const scroller = page.locator('.twextsec-scroll');
                const scroll = await scroller.evaluate(element => element.scrollTop);
                await checkbox.check();
                const notice = page.locator('.twextsec-warning');
                await notice.waitFor({state: 'visible'});
                assert.deepEqual(await checkbox.boundingBox(), before);
                assert.equal(await scroller.evaluate(element => element.scrollTop), scroll);
                assert.deepEqual(await actions.boundingBox(), initialActions);
                const rect = await notice.boundingBox();
                const viewport = page.viewportSize();
                assert.ok(rect.x >= 0 && rect.x + rect.width <= viewport.width);
                assert.ok(rect.y + rect.height <= initialActions.y - 8);
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
                await scroller.evaluate(element => {element.scrollTop = element.scrollHeight;});
                assert.deepEqual(await actions.boundingBox(), initialActions);
                const last = await page.locator('.twextsec-row').last().boundingBox();
                assert.ok(last.y + last.height <= initialActions.y);
                if (process.env.TW_SECURITY_SCREENSHOT_DIR) {
                    await page.screenshot({path: `${process.env.TW_SECURITY_SCREENSHOT_DIR}/${locale}-${theme}-${mobile ? 'mobile' : 'desktop'}.png`});
                }
                // The snackbar must not intercept the permanently visible action buttons.
                await page.getByTestId('twextsec-complete').click();
                assert.deepEqual(await page.evaluate(() => window.answer),
                    [['extension3', {execution: 'unsandboxed', loading: 'remote-cacheable'}]]);
                await page.getByTestId('twextsec-cancel').focus();
                await page.keyboard.press('Enter');
                assert.equal(await page.evaluate(() => window.answer), null);
                assert.deepEqual(errors, []);
                await context.close();
            });
    }
}

for (const viewport of [{width: 700, height: 360}, {width: 320, height: 480}]) {
    test(`${viewport.width}x${viewport.height}: actions remain reachable in short dialogs`, async () => {
        const page = await browser.newPage({viewport});
        try {
            await page.goto(`${base}/?locale=ja&theme=dark`);
            const actions = page.locator('.twextsec-actions');
            const before = await actions.boundingBox();
            assert.ok(before.y >= 0 && before.y + before.height <= viewport.height);
            await page.locator('.twextsec-row').first().locator('input[type="checkbox"]').check();
            const notice = await page.locator('.twextsec-warning').boundingBox();
            assert.ok(notice.y >= 0 && notice.y + notice.height <= before.y - 8);
            await page.locator('.twextsec-scroll').evaluate(element => {element.scrollTop = element.scrollHeight;});
            assert.deepEqual(await actions.boundingBox(), before);
            await page.getByTestId('twextsec-complete').focus();
            await page.keyboard.press('Enter');
            assert.deepEqual(await page.evaluate(() => window.answer),
                [['extension0', {execution: 'unsandboxed', loading: 'remote-cacheable'}]]);
        } finally {
            await page.close();
        }
    });
}
