// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {before, after, test} from 'node:test';
import {chromium} from '@playwright/test';
import JSZip from '@turbowarp/jszip';

// This optional suite uses the actual pinned Editor, GUI and VM, not a replacement dialog frame.
const base = process.env.TWEXTSEC_EDITOR_URL;
const editorRevision = process.env.TWEXTSEC_EDITOR_REVISION;
const securityRevision = process.env.TWEXTSEC_SECURITY_REVISION;
const galleryOrigin = 'https://extensions.turbowarp.org/';
const gallery = [
    {slug: '-SIPC-/consoles', id: 'sipcconsole', name: 'Consoles', image: 'images/-SIPC-/consoles.svg'},
    {slug: 'Lily/TempVariables2', id: 'lmsTempVars2', name: 'Temporary Variables', image: 'images/Lily/TempVariables2.svg'},
    {slug: 'text', id: 'strings', name: 'Text', image: 'images/text.svg'}
];
const source = (id: string, name: string) => `// Name: ${name}\n// ID: ${id}\n` +
    'globalThis.__galleryReviewExecuted = (globalThis.__galleryReviewExecuted || 0) + 1;\n' +
    `Scratch.extensions.register({getInfo(){return {id:${JSON.stringify(id)},name:${JSON.stringify(name)},` +
    'blocks:[{opcode:"value",blockType:Scratch.BlockType.REPORTER,text:"fixture"}]};},value(){return 1;}});';
const familyCode = source('familyfixture', 'Family fixture');
const familyDigest = createHash('sha256').update(familyCode).digest('hex');
const inline = (code: string) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const familyURL = 'https://family.test/familyfixture.js';
const unlistedURL = 'https://unlisted.test/reviewfixture.js';
let browser;
before(async () => {
    if (!base) return;
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Use a local pinned preview');
    for (const revision of [editorRevision, securityRevision]) assert.match(revision || '', /^[a-f0-9]{40}$/);
    const response = await fetch(new URL('preview-manifest.json', base));
    assert.equal(response.status, 200);
    const manifest = await response.json();
    assert.equal(manifest.hostCommit, editorRevision);
    assert.equal(manifest.commit, '60b87e2f2503206847f509285aa4de3cee3670c7');
    assert.equal(manifest.securityPreview.revision, securityRevision);
    browser = await chromium.launch({headless: true});
});
after(async () => {await browser?.close();});

async function projectURL() {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"/>';
    const assetId = createHash('md5').update(svg).digest('hex');
    const extensions = [...gallery.map(item => ({id: item.id, url: galleryOrigin + item.slug + '.js'})),
        {id: 'familyfixture', url: inline(familyCode)}, {id: 'reviewfixture', url: unlistedURL}];
    const project = {targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, comments: {},
        blocks: Object.fromEntries(extensions.map((item, index) => [item.id, {opcode: item.id + '_value', next: null,
            parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 40, y: 40 + index * 80}])),
        currentCostume: 0, costumes: [{name: 'Blank', assetId, dataFormat: 'svg', md5ext: `${assetId}.svg`,
            rotationCenterX: 240, rotationCenterY: 180}], sounds: [], volume: 100, tempo: 60,
        videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null}], monitors: [],
    extensions: extensions.map(item => item.id), extensionURLs: Object.fromEntries(extensions.map(item => [item.id, item.url])),
    meta: {semver: '3.0.0', vm: '0.2.0', agent: 'gallery-review-integration'}};
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project));
    zip.file(`${assetId}.svg`, svg);
    return `data:application/octet-stream;base64,${await zip.generateAsync({type: 'base64', compression: 'DEFLATE'})}`;
}

for (const [locale, width, action] of [['ja', 1280, 'cancel'], ['en', 390, 'approve']]) {
    test(`${locale}: actual Editor reviews gallery images and family membership before VM execution (${action})`,
        {skip: !base, timeout: 90000}, async () => {
            const context = await browser.newContext({viewport: {width: Number(width), height: 900}});
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await context.route('https://kubohiroya.github.io/turbowarp-plus-packages/extensions-v1.json', route =>
                route.fulfill({json: {schemaVersion: 1, extensions: [{id: 'familyfixture', name: 'Family fixture',
                    version: '1.0.0', dependencies: [], url: familyURL, sha256: familyDigest,
                    banner: 'https://family.test/icon.svg'}]}}));
            await context.route(`${galleryOrigin}**`, route => {
                const url = route.request().url();
                if (url.endsWith('extensions-v0.json')) return route.fulfill({json: {extensions: gallery}});
                const item = gallery.find(item => url === `${galleryOrigin}${item.slug}.js`);
                if (item) return route.fulfill({contentType: 'text/javascript', body: source(item.id, item.name)});
                const imageIndex = gallery.findIndex(item => url === `${galleryOrigin}${item.image}`);
                if (imageIndex >= 0) {
                    return route.fulfill({contentType: 'image/svg+xml', body:
                        `<svg xmlns="http://www.w3.org/2000/svg" width="${80 + imageIndex}" height="40"><rect width="100%" height="40" fill="#6370a2"/></svg>`});
                }
                return route.abort();
            });
            await context.route('https://family.test/**', route => route.fulfill({contentType: 'image/svg+xml',
                body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>'}));
            await context.route(unlistedURL, route => route.fulfill({contentType: 'text/javascript',
                body: source('reviewfixture', 'Unlisted fixture')}));
            const target = new URL('editor.html', base);
            target.search = new URLSearchParams({lang: locale, project_url: await projectURL()}).toString();
            const review = page.locator('.twextsec-review[data-mode="open"]');
            const rows = review.locator('.twextsec-row');
            try {
                await page.goto(target.href);
                await review.waitFor();
                await page.waitForFunction(() => document.querySelectorAll('.twextsec-review .twextsec-row').length === 5);
                assert.equal(await rows.count(), 5);
                for (const [index, item] of gallery.entries()) {
                    const row = rows.filter({has: page.locator('.twextsec-id', {hasText: item.id})});
                    await row.locator('.twextsec-preview:not(.twextsec-preview-fallback)').waitFor();
                    // The real Editor stores image bytes and displays a blob: URL, so compare the image itself.
                    await page.waitForFunction(({image, width}) => image.complete && image.naturalWidth === width,
                        {image: await row.locator('.twextsec-preview').elementHandle(), width: 80 + index});
                    assert.doesNotMatch(await row.locator('.twextsec-trusted').getAttribute('alt'), /Plus/);
                }
                const family = rows.filter({has: page.locator('.twextsec-id', {hasText: 'familyfixture'})});
                assert.match(await family.locator('.twextsec-trusted').getAttribute('alt'), /Plus/);
                const unlisted = rows.filter({has: page.locator('.twextsec-id', {hasText: 'reviewfixture'})});
                await unlisted.locator('.twextsec-preview-fallback').waitFor();
                assert.equal(await unlisted.locator('.twextsec-trusted').count(), 0);
                assert.equal(await page.evaluate(() => globalThis.__galleryReviewExecuted || 0), 0);
                if (action === 'cancel') {
                    await review.getByTestId('twextsec-cancel').click();
                    await review.waitFor({state: 'hidden'});
                    assert.equal(await page.evaluate(() => globalThis.__galleryReviewExecuted || 0), 0);
                    assert.equal(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('reviewfixture')), false);
                } else {
                    await review.getByTestId('twextsec-individual').click();
                    await unlisted.getByRole('button', {name: 'Do not run', exact: true}).click();
                    await review.locator('.twextsec-warning-close').click();
                    await review.getByTestId('twextsec-complete').click();
                    await review.waitFor({state: 'hidden'});
                    await page.waitForFunction(() => ['sipcconsole', 'lmsTempVars2', 'strings', 'familyfixture']
                        .every(id => vm.extensionManager.isExtensionLoaded(id)));
                    assert.equal(await page.evaluate(() => globalThis.__galleryReviewExecuted || 0), 4);
                    assert.equal(await page.evaluate(() => vm.extensionManager.isExtensionLoaded('reviewfixture')), false);
                    // Extension registration precedes the end of loadProject and its IndexedDB transaction.
                    await page.waitForFunction(url => new Promise(resolve => {
                        const request = indexedDB.open('twextsec');
                        request.onerror = () => resolve(false);
                        request.onsuccess = () => {
                            const db = request.result;
                            if (!db.objectStoreNames.contains('decisions')) {db.close(); resolve(false); return;}
                            const read = db.transaction('decisions', 'readonly').objectStore('decisions').getAll();
                            read.onsuccess = () => {db.close(); resolve(read.result.some(record => record[url]?.execution === 'deny'));};
                            read.onerror = () => {db.close(); resolve(false);};
                        };
                    }), unlistedURL);
                    await page.reload();
                    await review.waitFor();
                    await review.getByTestId('twextsec-individual').click();
                    await unlisted.getByRole('button', {name: 'Do not run', exact: true}).waitFor();
                    assert.equal(await unlisted.getByRole('button', {name: 'Do not run', exact: true}).getAttribute('aria-pressed'), 'true');
                    assert.equal(await page.evaluate(() => globalThis.__galleryReviewExecuted || 0), 0);
                    await review.getByTestId('twextsec-cancel').click();
                    await review.waitFor({state: 'hidden'});
                }
                assert.deepEqual(errors, []);
            } finally {await context.close();}
        });
}
