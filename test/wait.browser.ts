import assert from 'node:assert/strict';
import {test, before, after} from 'node:test';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {build} from 'esbuild';

// The wait dialog is the one part of this package a real browser has to judge. jsdom has no
// showModal, no ::backdrop and no layout, so it can only confirm the element was created; whether
// the thing actually lands in the middle of the screen, above everything, in a page that links no
// stylesheet of ours, is exactly what 0.5.2 got wrong and what this checks.
const require = createRequire(process.env.TW_SECURITY_PLAYWRIGHT_PACKAGE || import.meta.url);
const {chromium} = require('@playwright/test');

const VIEWPORT = {width: 1000, height: 800};
let browser, server, base;

const entry = `
import {createExtensionWaitDialog} from './src/index.ts';
const wait = window.wait = createExtensionWaitDialog(document, 'ja', {delayMs: 30});
window.ready = true;
`;

before(async () => {
    const result = await build({
        stdin: {contents: entry, resolveDir: process.cwd()},
        bundle: true, write: false, format: 'iife', platform: 'browser',
        define: {__SECURITY_COMMON_BANNER__: JSON.stringify('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>')}
    });
    // No stylesheet and no reset: the single-HTML runtime and the packager page look like this.
    const html = '<!doctype html><html lang="ja"><meta charset="utf-8">' +
        '<body><p id="under">beneath</p><script src="/bundle.js"></script></body></html>';
    server = createServer((request, response) => {
        const bundle = request.url === '/bundle.js';
        response.setHeader('Content-Type', bundle ? 'text/javascript' : 'text/html');
        response.end(bundle ? result.outputFiles[0].text : html);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({headless: true});
});

after(async () => {
    await browser?.close();
    await new Promise(resolve => server?.close(resolve));
});

const open = async () => {
    const page = await browser.newPage({viewport: VIEWPORT});
    page.errors = [];
    page.on('pageerror', error => page.errors.push(error.message));
    await page.goto(base);
    await page.waitForFunction(() => window.ready, {}, {timeout: 5000});
    return page;
};
const dialogOf = page => page.locator('[data-testid="twextsec-wait"]');
const near = (actual, expected, label) =>
    assert.ok(Math.abs(actual - expected) < 2, `${label}: ${actual} should equal ${expected}`);

test('a wait that lasts takes the middle of a page that styles nothing itself', {timeout: 30000}, async () => {
    const page = await open();
    const dialog = dialogOf(page);
    await page.evaluate(() => window.wait.show({url: 'https://example.test/a.js', attempt: 2, attempts: 3}));
    await dialog.waitFor({state: 'visible'});
    const box = await dialog.boundingBox();
    near(box.x + box.width / 2, VIEWPORT.width / 2, 'centre x');
    near(box.y + box.height / 2, VIEWPORT.height / 2, 'centre y');
    // A dialog the browser never opened as a modal would sit in the flow and take the page's
    // own text with it; the backdrop is what says the rest of the page is out of reach.
    assert.equal(await dialog.evaluate(element => element.open), true);
    assert.equal(await page.evaluate(() =>
        getComputedStyle(document.querySelector('[data-testid="twextsec-wait"]')).position), 'fixed');
    assert.equal(await page.evaluate(() =>
        document.querySelectorAll('[data-twextsec-wait-style]').length), 1);
    assert.match(await dialog.textContent(), /再試行しています（2\/3）/u);
    assert.match(await dialog.textContent(), /https:\/\/example\.test\/a\.js/u);
    assert.deepEqual(page.errors, []);
    await page.close();
});

test('the wait offers no way out and nothing underneath it can be reached', {timeout: 30000}, async () => {
    const page = await open();
    const dialog = dialogOf(page);
    await page.evaluate(() => window.wait.show({url: 'https://example.test/a.js', attempt: 2, attempts: 3}));
    await dialog.waitFor({state: 'visible'});
    // Neither button exists on purpose: closing would not stop the fetch, and stopping one
    // halfway has no rollback behind it, so either would offer control that does not exist.
    assert.equal(await dialog.locator('button').count(), 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    assert.equal(await dialog.count(), 1);
    assert.equal(await dialog.evaluate(element => element.open), true);
    // The page beneath is covered, so a stray click cannot land on the project.
    assert.equal(await page.evaluate(() => {
        const {left, top} = document.getElementById('under').getBoundingClientRect();
        return document.elementFromPoint(left + 1, top + 1).id;
    }), '');
    await page.evaluate(() => window.wait.hide());
    await dialog.waitFor({state: 'detached'});
    assert.equal(await page.evaluate(() => document.getElementById('under').textContent), 'beneath');
    assert.deepEqual(page.errors, []);
    await page.close();
});

test('a wait shorter than the delay never reaches the screen', {timeout: 30000}, async () => {
    const page = await open();
    await page.evaluate(() => {
        window.wait.show({url: 'https://example.test/a.js', attempt: 2, attempts: 3});
        window.wait.hide();
    });
    // The shortest wait is one backoff. A modal that flashed for it would steal focus for nothing.
    await page.waitForTimeout(150);
    assert.equal(await dialogOf(page).count(), 0);
    assert.deepEqual(page.errors, []);
    await page.close();
});
