const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createCatalogPreviewResolver} = require('../dist/index.cjs');
const url = 'https://example.test/plus.js';
const banner = 'https://example.test/assets/banner.svg';
const icon = 'https://example.test/assets/block-icon.svg';
const sha256 = 'a'.repeat(64);
const signal = () => new AbortController().signal;
const row = (source, extra = {}) => ({key: 'plus', ids: ['plus'], source,
    state: {plusFamily: true, trusted: true}, ...extra});

test('a family catalog supplies its declared banner or curated block SVG for remote and embedded rows', async () => {
    let reads = 0;
    const resolve = createCatalogPreviewResolver({read: async () => {
        reads++;
        return {catalog: {extensions: [{id: 'plus', url, sha256, banner}]}, icons: {plus: icon}};
    }});
    assert.deepEqual(await Promise.all([
        resolve(row({kind: 'legacy', url}), signal()),
        resolve(row({kind: 'remote-cacheable', url, sha256}), signal()),
        resolve(row({kind: 'embedded-file', sha256}), signal()),
        resolve(row({kind: 'embedded-data', sha256}), signal())
    ]), [icon, icon, icon, icon]);
    assert.equal(reads, 1);
    const declared = createCatalogPreviewResolver({read: async () => ({catalog: {extensions: [{id: 'plus', url, banner}]}})});
    assert.equal(await declared(row({kind: 'legacy', url}), signal()), banner);
});

test('matching an ID alone or a mismatched digest never supplies family artwork', async () => {
    const resolve = createCatalogPreviewResolver({read: async () => ({catalog: {extensions: [{id: 'plus', url, sha256, banner: icon}]}})});
    for (const entry of [
        row({kind: 'legacy', url: 'https://other.test/plus.js'}),
        row({kind: 'legacy', url: `data:text/javascript,${url}`}),
        row({kind: 'remote-cacheable', url, sha256: 'b'.repeat(64)}),
        row({kind: 'embedded-file', sha256: 'b'.repeat(64)}),
        row({kind: 'legacy', url}, {ids: ['different']}),
        row({kind: 'legacy', url}, {state: {trusted: true}})
    ]) assert.equal(await resolve(entry, signal()), undefined);
});

test('a missing, broken or cancelled catalog leaves a usable fallback', async () => {
    const entry = row({kind: 'legacy', url});
    assert.equal(await createCatalogPreviewResolver()(entry, signal()), undefined);
    for (const read of [async () => {throw new Error('offline');}, async () => ({catalog: {extensions: 'invalid'}})]) {
        assert.equal(await createCatalogPreviewResolver({read})(entry, signal()), undefined);
    }
    const controller = new AbortController(); controller.abort();
    const resolve = createCatalogPreviewResolver({read: async () => {throw new Error('must not read');}});
    assert.equal(await resolve(entry, controller.signal), undefined);
});
