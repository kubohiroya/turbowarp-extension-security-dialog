const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {createCatalogResourceResolver, parseExtensionCatalog} = require('../dist/index.cjs');
const {createProjectSecurityReview} = require('../dist/project-review.cjs');
const url = 'https://example.test/camera@1.0.0.js';
const source = '// ID: camera\nthrow new Error("never execute");';
const sha256 = createHash('sha256').update(source).digest('hex');
const declaration = {schemaVersion: 1, resources: [{type: 'camera', usage: 'required',
    purpose: {en: 'Read shared frames', ja: '共有映像を読む'}, via: ['@kubohiroya/turbowarp-camera-source']}]};
const catalog = {read: async () => ({catalog: {schemaVersion: 1,
    extensions: [{id: 'camera', package: '@owner/camera', version: '1.0.0', url, sha256, resourceDeclaration: declaration}]}})};
const entry = (source, extra = {}) => ({key: 'camera', ids: ['camera'], source, ...extra});
const signal = () => new AbortController().signal;

test('catalog parsing preserves absence, reviewed empty, and valid declarations, and rejects invalid claims', () => {
    const items = parseExtensionCatalog({extensions: [
        {id: 'old', url: 'https://example.test/old'},
        {id: 'empty', url: 'https://example.test/empty', resourceDeclaration: {schemaVersion: 1, resources: []}},
        {id: 'camera', url, resourceDeclaration: declaration}
    ]});
    assert.equal(Object.hasOwn(items[0].metadata, 'resourceDeclaration'), false);
    assert.deepEqual(items[1].metadata.resourceDeclaration.resources, []);
    assert.deepEqual(items[2].metadata.resourceDeclaration, declaration);
    assert.throws(() => parseExtensionCatalog({extensions: [{id: 'bad', url,
        resourceDeclaration: {schemaVersion: 1, resources: [{type: 'camera', usage: 'conditional', purpose: {en: 'read'}}]}}]}));
});

test('remote, cached, embedded file/data and legacy inline code use matching catalog declarations', async () => {
    const resolve = createCatalogResourceResolver(catalog);
    for (const sourceSpec of [
        {kind: 'catalog', url, sha256}, {kind: 'legacy', url},
        {kind: 'remote-cacheable', url, sha256}, {kind: 'remote-non-cacheable', url, sha256},
        {kind: 'embedded-file', sha256}, {kind: 'embedded-data', sha256},
        {kind: 'legacy', url: `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`}
    ]) assert.deepEqual(await resolve(entry(sourceSpec), signal()), declaration);
});

test('ID/package-name claims, wrong URLs, versions and digests cannot borrow a declaration', async () => {
    const resolve = createCatalogResourceResolver(catalog);
    for (const row of [
        entry({kind: 'legacy', url: 'https://other.test/camera.js'}, {metadata: {package: '@owner/camera', resourceDeclaration: declaration}}),
        entry({kind: 'remote-cacheable', url, sha256: 'b'.repeat(64)}),
        entry({kind: 'embedded-file', sha256: 'b'.repeat(64)}),
        entry({kind: 'legacy', url: `data:text/javascript,${encodeURIComponent(source+'changed')}`}),
        entry({kind: 'legacy', url}, {ids: ['wrong']})
    ]) assert.equal(await resolve(row, signal()), undefined);
    assert.equal(await resolve(entry({kind: 'legacy', url}), AbortSignal.abort()), undefined);
    assert.equal(await createCatalogResourceResolver({read: async () => {throw Error('offline');}})(entry({kind: 'legacy', url}), signal()), undefined);
});

test('the actual open-project port supplies declarations before asking, and drops project-forged metadata', async () => {
    let callback, shown;
    const host = createProjectSecurityReview({catalog, trusted: {isTrustedURL: async () => false},
        pendingReview: () => null, reviewedArchive: () => undefined, duringApproval: (_vm, fn) => fn(), styles: {}})
        .createSecurityReview({install: (_vm, fn) => {callback = fn; return () => {};}});
    host.installBatchLoader({vm: {}, defaultURLs: {}, isTrusted: () => false, bannerFor: () => undefined,
        showReview: (rows, decisions) => {shown = rows; return decisions;}});
    await callback([entry({kind: 'legacy', url}), entry({kind: 'legacy', url: 'https://other.test/camera.js'},
        {key: 'forged', metadata: {resourceDeclaration: {schemaVersion: 1, resources: []}}})]);
    assert.deepEqual(shown[0].metadata.resourceDeclaration, declaration);
    assert.equal(shown[1].metadata.resourceDeclaration, undefined);
});

test('a project carrying a variant build is matched to its extension and its declaration', async () => {
    const variant = '// ID: camera\n// playback build\n';
    const variantSHA = createHash('sha256').update(variant).digest('hex');
    const resolve = createCatalogResourceResolver({read: async () => ({catalog: {schemaVersion: 1, extensions: [
        {id: 'camera', url, sha256, resourceDeclaration: declaration,
            variants: [{url: 'https://example.test/camera-playback@1.0.0.js', sha256: variantSHA}]}]}})});
    assert.deepEqual(await resolve(entry({kind: 'embedded-file', sha256: variantSHA}), signal()), declaration);
    assert.deepEqual(await resolve(entry({kind: 'legacy', url: `data:text/javascript,${encodeURIComponent(variant)}`}), signal()), declaration);
    assert.equal(await resolve(entry({kind: 'embedded-file', sha256: 'e'.repeat(64)}), signal()), undefined);
});
