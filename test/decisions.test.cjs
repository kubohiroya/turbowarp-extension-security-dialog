const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
    defaultDecision, initialDecisions, requiresReview, executionChoices, loadingChoices,
    contradictsDeclaration, isTrusted
} = require('../dist/index.cjs');

const row = (key, source, extra = {}) => ({key, ids: [key], source, ...extra});
const catalogRow = key => row(key, {kind: 'catalog', url: `https://example.test/${key}.js`});
const referenceRow = key => row(key, {kind: 'reference', url: `https://example.test/${key}.js`, sha256: 'a'.repeat(64)});
const embeddedRow = key => row(key, {kind: 'embedded', sha256: 'b'.repeat(64)});
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
    assert.deepEqual(executionChoices(referenceRow('a'), 'open'), ['deny', 'sandboxed', 'unsandboxed']);
});

test('only a reference has somewhere else to load from', () => {
    assert.deepEqual(loadingChoices(catalogRow('a')), ['cached', 'remote', 'embedded']);
    assert.deepEqual(loadingChoices(referenceRow('a')), ['cached', 'remote']);
    assert.deepEqual(loadingChoices(embeddedRow('a')), []);
    assert.deepEqual(loadingChoices(legacyRow('a')), []);
    assert.equal(defaultDecision(embeddedRow('a'), 'open').loading, 'embedded');
    assert.equal(defaultDecision(legacyRow('a'), 'open').loading, undefined);
    assert.equal(defaultDecision(referenceRow('a'), 'open').loading, 'cached');
    assert.equal(defaultDecision(referenceRow('a'), 'open', 'remote').loading, 'remote');
});

test('a recorded answer is honoured only where it is still one of the choices', () => {
    const entries = [referenceRow('ref'), embeddedRow('emb'), {...catalogRow('vouched'), state: {trusted: true}}];
    const recorded = new Map([
        ['ref', {execution: 'unsandboxed', loading: 'remote'}],
        // The project moved to embedded bytes, so a remembered remote is no longer offered.
        ['emb', {execution: 'sandboxed', loading: 'remote'}],
        // The row has since become trusted, so a remembered refusal is no longer offered.
        ['vouched', {execution: 'deny'}]
    ]);
    const decisions = initialDecisions(entries, 'open', {recorded});
    assert.deepEqual(decisions.get('ref'), {execution: 'unsandboxed', loading: 'remote'});
    assert.deepEqual(decisions.get('emb'), {execution: 'sandboxed', loading: 'embedded'});
    assert.deepEqual(decisions.get('vouched'), {execution: 'unsandboxed', loading: 'cached'});
});

test('a project of trusted rows has nothing to ask, so no screen is owed', () => {
    const trusted = {...catalogRow('a'), state: {trusted: true}};
    assert.equal(requiresReview([trusted]), false);
    assert.equal(requiresReview([trusted, referenceRow('b')]), true);
    assert.equal(requiresReview([]), false);
});

test('choosing the sandbox against the extension own claim is flagged, not blocked', () => {
    const entry = {...referenceRow('a'), metadata: {unsandboxed: 'required'}};
    assert.equal(contradictsDeclaration(entry, {execution: 'sandboxed'}), true);
    assert.equal(contradictsDeclaration(entry, {execution: 'unsandboxed'}), false);
    assert.equal(contradictsDeclaration(referenceRow('a'), {execution: 'sandboxed'}), false);
});
