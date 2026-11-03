const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseExtensionCatalog, reviewURL} = require('../dist/index.cjs');

const entry = (id, extra = {}) => ({id, url: `https://example.test/${id}.js`, ...extra});
const catalog = (extensions, extra = {}) => ({schemaVersion: 1, extensions, ...extra});

test('a catalog resolves categories and keeps its own order', () => {
    const entries = parseExtensionCatalog(catalog(
        [entry('b', {category: 'tools'}), entry('a')],
        {categories: [{id: 'tools', title: 'Tools', titleJa: '道具'}]}
    ));
    assert.deepEqual(entries.map(item => item.id), ['b', 'a']);
    assert.deepEqual(entries[0].category, {id: 'tools', title: 'Tools', titleJa: '道具', order: 0});
    assert.equal(entries[1].category, undefined);
    assert.equal(Object.isFrozen(entries[0]), true);
});

test('a catalog that would mislead the screen is refused, not repaired', () => {
    const cases = [
        [catalog([entry('a'), entry('a')]), /Duplicate extension a/],
        [catalog([entry('a'), {id: 'b', url: 'https://example.test/a.js'}]), /Duplicate extension URL/],
        [catalog([entry('a', {dependencies: ['missing']})]), /depends on missing/],
        [catalog([entry('a', {dependencies: ['b']}), entry('b', {dependencies: ['a']})]), /Dependency cycle/],
        [catalog([{id: 'a', url: 'http://example.test/a.js'}]), /must be HTTPS/],
        [catalog([{id: 'a', url: 'https://user:pw@example.test/a.js'}]), /without credentials/],
        [catalog([{id: 'a', url: 'https://example.test/a.js#x'}]), /without credentials or a fragment/],
        [catalog([entry('a', {sha256: 'nope'})]), /Invalid sha256/],
        [catalog([entry('a', {category: 'absent'})]), /Unknown category/],
        [catalog([entry('a-b')]), /Invalid extension id/],
        [{schemaVersion: 2, extensions: []}, /Unsupported catalog schema/]
    ];
    for (const [data, message] of cases) assert.throws(() => parseExtensionCatalog(data), message);
});

test('the dashboard catalog states its metadata beside the URL', () => {
    const [item] = parseExtensionCatalog(catalog([entry('a', {
        name: 'A', description: 'About A', descriptions: {ja: 'Aの説明'}, author: 'Creator',
        banner: 'https://example.test/a.svg', package: '@owner/a', version: '1.0.0'
    })]));
    assert.equal(item.metadata.name, 'A');
    assert.equal(item.metadata.descriptions.ja, 'Aの説明');
    assert.equal(item.metadata.author, 'Creator');
    assert.equal(item.metadata.banner, 'https://example.test/a.svg');
    // The row's own address and digest are not metadata.
    assert.equal(item.metadata.url, undefined);
});

test('declared metadata is carried through, and only a creator page may be plain HTTP', () => {
    const [item] = parseExtensionCatalog(catalog([entry('a', {metadata: {
        name: 'A', authorURL: 'http://creator.test/', repository: 'https://example.test/a',
        descriptions: {ja: '説明', 'pt-BR': 'descricao'}
    }})]));
    assert.equal(item.metadata.authorURL, 'http://creator.test/');
    assert.equal(item.metadata.descriptions.ja, '説明');
    assert.throws(() => parseExtensionCatalog(catalog([entry('a', {
        metadata: {repository: 'http://example.test/a'}
    })])), /must be HTTPS/);
    assert.throws(() => reviewURL('https://example.test/#x', 'URL'), /fragment/);
});
