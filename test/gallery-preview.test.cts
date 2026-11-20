const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createGalleryPreviewResolver} = require('../dist/index.cjs');
const origin = 'https://extensions.turbowarp.org/';
const items = [
    {slug: '-SIPC-/consoles', id: 'sipcconsole', image: 'images/-SIPC-/consoles.svg'},
    {slug: 'Lily/TempVariables2', id: 'lmsTempVars2', image: 'images/Lily/TempVariables2.svg'},
    {slug: 'text', id: 'strings', image: 'images/text.svg'}
];

test('the reported gallery extensions resolve their actual images in one catalog request', async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push([url, options]);
        return {ok: true, json: async () => ({extensions: items})};
    });
    const resolve = createGalleryPreviewResolver();
    const signal = new AbortController().signal;
    assert.deepEqual(await Promise.all(items.map(item => resolve(`${origin}${item.slug}.js`, signal))),
        items.map(item => `${origin}${item.image}`));
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], `${origin}generated-metadata/extensions-v0.json`);
    assert.equal(calls[0][1].credentials, 'omit');
    assert.equal(calls[0][1].referrerPolicy, 'no-referrer');
    for (const url of ['https://other.test/text.js', 'https://extensions.turbowarp.org.evil.test/text.js',
        `${origin}text.js?modified`, `${origin}text.js#modified`, `${origin}unlisted.js`, 'data:text/javascript,x']) {
        assert.equal(await resolve(url, signal), undefined);
    }
    assert.equal(calls.length, 1);
});

test('missing, external and ambiguous catalog images produce no attribution', async t => {
    t.mock.method(globalThis, 'fetch', async () => ({ok: true, json: async () => ({extensions: [
        ...items, {slug: 'text', image: 'images/wrong.svg'},
        {slug: 'absent'}, {slug: 'external', image: 'https://elsewhere.test/icon.svg'},
        {slug: 'active', image: 'javascript:alert(1)'}, null
    ]})}));
    const resolve = createGalleryPreviewResolver();
    for (const slug of ['text', 'absent', 'external', 'active']) {
        assert.equal(await resolve(`${origin}${slug}.js`, new AbortController().signal), undefined);
    }
});

test('unavailable catalogs and cancellation do not prevent review', async t => {
    for (const response of [{ok: false}, {ok: true, json: async () => {throw new Error('bad JSON');}}]) {
        const mock = t.mock.method(globalThis, 'fetch', async () => response);
        assert.equal(await createGalleryPreviewResolver()(`${origin}text.js`, new AbortController().signal), undefined);
        mock.mock.restore();
    }
    t.mock.method(globalThis, 'fetch', async (_url, {signal}) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('cancelled')), {once: true});
    }));
    const controller = new AbortController();
    const pending = createGalleryPreviewResolver()(`${origin}text.js`, controller.signal);
    controller.abort();
    assert.equal(await pending, undefined);
});
