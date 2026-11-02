const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
    defaultDecision, initialDecisions, requiresReview, executionChoices, loadingChoices,
    contradictsDeclaration, isTrusted
} = require('../dist/index.cjs');

const row = (key, source, extra = {}) => ({key, ids: [key], source, ...extra});
const catalogRow = key => row(key, {kind: 'catalog', url: `https://example.test/${key}.js`});
const remoteRow = (key, kind) => row(key, {kind, url: `https://example.test/${key}.js`, sha256: 'a'.repeat(64)});
const cacheableRow = key => remoteRow(key, 'remote-cacheable');
const nonCacheableRow = key => remoteRow(key, 'remote-non-cacheable');
const embeddedRow = (key, kind = 'embedded-file') => row(key, {kind, sha256: 'b'.repeat(64)});
const legacyRow = key => row(key, {kind: 'legacy', url: `https://example.test/${key}.js`});

test('nothing starts outside the sandbox unless the catalog vouches for it', () => {
    assert.equal(defaultDecision(catalogRow('a'), 'add').execution, 'sandboxed');
    // An extension saying it needs to be outside must not thereby place itself outside.
    assert.equal(defaultDecision({...catalogRow('a'), metadata: {unsandboxed: 'required'}}, 'add').execution, 'sandboxed');
    const trusted = {...catalogRow('a'), state: {trusted: true}};
    assert.equal(defaultDecision(trusted, 'add').execution, 'unsandboxed');
    assert.deepEqual(executionChoices(trusted, 'open'), []);
    assert.equal(isTrusted(trusted), true);
});

test('refusing looks different when adding and when opening', () => {
    // Not adding is how refusing works in the catalog, so there is no third option there.
    assert.deepEqual(executionChoices(catalogRow('a'), 'add'), ['sandboxed', 'unsandboxed']);
    assert.deepEqual(executionChoices(cacheableRow('a'), 'open'), ['deny', 'sandboxed', 'unsandboxed']);
});

test('the only loading choice left to an opener is declining the copy', () => {
    // Adding an extension is authoring it, so all four forms are on offer there.
    assert.deepEqual(loadingChoices(catalogRow('a')),
        ['remote-cacheable', 'remote-non-cacheable', 'embedded-file', 'embedded-data']);
    assert.deepEqual(loadingChoices(cacheableRow('a')),
        ['remote-cacheable', 'remote-non-cacheable']);
    // The author already forbade the copy here, and there is no way to write permission back.
    assert.deepEqual(loadingChoices(nonCacheableRow('a')), []);
    assert.deepEqual(loadingChoices(embeddedRow('a', 'embedded-file')), []);
    assert.deepEqual(loadingChoices(embeddedRow('a', 'embedded-data')), []);
    assert.deepEqual(loadingChoices(legacyRow('a')), []);
});

test('a row with nothing to choose already loads the way its source is named', () => {
    assert.equal(defaultDecision(embeddedRow('a', 'embedded-file'), 'open').loading, 'embedded-file');
    assert.equal(defaultDecision(embeddedRow('a', 'embedded-data'), 'open').loading, 'embedded-data');
    assert.equal(defaultDecision(nonCacheableRow('a'), 'open').loading, 'remote-non-cacheable');
    // A custom extension address predates the whole idea, so it has no form at all.
    assert.equal(defaultDecision(legacyRow('a'), 'open').loading, undefined);
    assert.equal(defaultDecision(cacheableRow('a'), 'open').loading, 'remote-cacheable');
    assert.equal(defaultDecision(cacheableRow('a'), 'open', 'remote-non-cacheable').loading,
        'remote-non-cacheable');
    // A preference the row cannot honour leaves the row's own first choice standing.
    assert.equal(defaultDecision(cacheableRow('a'), 'open', 'embedded-file').loading, 'remote-cacheable');
});

test('a recorded answer is honoured only where it is still one of the choices', () => {
    const entries = [cacheableRow('ref'), embeddedRow('emb'), {...catalogRow('vouched'), state: {trusted: true}}];
    const recorded = new Map([
        ['ref', {execution: 'unsandboxed', loading: 'remote-non-cacheable'}],
        // The project moved to embedded bytes, so there is no copy left to decline.
        ['emb', {execution: 'sandboxed', loading: 'remote-non-cacheable'}],
        // The row has since become trusted, so a remembered refusal is no longer offered.
        ['vouched', {execution: 'deny'}]
    ]);
    const decisions = initialDecisions(entries, 'open', {recorded});
    assert.deepEqual(decisions.get('ref'), {execution: 'unsandboxed', loading: 'remote-non-cacheable'});
    assert.deepEqual(decisions.get('emb'), {execution: 'sandboxed', loading: 'embedded-file'});
    assert.deepEqual(decisions.get('vouched'), {execution: 'unsandboxed', loading: 'remote-cacheable'});
});

test('a project of trusted rows has nothing to ask, so no screen is owed', () => {
    const trusted = {...catalogRow('a'), state: {trusted: true}};
    assert.equal(requiresReview([trusted]), false);
    assert.equal(requiresReview([trusted, cacheableRow('b')]), true);
    assert.equal(requiresReview([]), false);
});

test('choosing the sandbox against the extension own claim is flagged, not blocked', () => {
    const entry = {...cacheableRow('a'), metadata: {unsandboxed: 'required'}};
    assert.equal(contradictsDeclaration(entry, {execution: 'sandboxed'}), true);
    assert.equal(contradictsDeclaration(entry, {execution: 'unsandboxed'}), false);
    assert.equal(contradictsDeclaration(cacheableRow('a'), {execution: 'sandboxed'}), false);
});
