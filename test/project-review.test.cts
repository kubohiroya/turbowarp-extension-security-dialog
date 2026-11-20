const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createProjectSecurityReview} = require('../dist/project-review.cjs');
const {reviewRows} = require('../dist/catalog-library.cjs');

const familyURL = 'https://family.test/extension.js';
const galleryURL = 'https://extensions.turbowarp.org/text.js';
function fixture() {
    let review;
    let rows;
    const trusted = {isTrustedURL: async url => url === familyURL, isTrustedCode: async () => true};
    const project = createProjectSecurityReview({trusted, pendingReview: () => null,
        reviewedArchive: () => undefined, duringApproval: (_vm, run) => run(), styles: {}});
    const host = project.createSecurityReview({install: (_vm, callback) => {review = callback; return () => {};}});
    host.installBatchLoader({vm: {}, defaultURLs: {}, isTrusted: url => url === galleryURL,
        bannerFor: () => undefined, showReview: (entries, initial) => {rows = entries; return initial;}});
    return {project, review: entries => review(entries), get rows() {return rows;}};
}

test('gallery execution trust and Plus catalog membership remain independent', async () => {
    const view = fixture();
    const entries = [galleryURL, familyURL, 'https://unlisted.test/extension.js'].map(url => ({
        key: url, ids: ['same-id'], source: {kind: 'legacy', url}, metadata: {plusFamily: true}
    }));
    const answers = await view.review(entries);
    assert.deepEqual(view.rows[0].state, {trusted: true, plusFamily: false});
    assert.deepEqual(view.rows[1].state, {trusted: true, plusFamily: true});
    assert.equal(view.rows[2].state, undefined);
    assert.equal(answers.get(galleryURL).execution, 'unsandboxed');
    assert.equal(answers.get(familyURL).execution, 'unsandboxed');
    assert.equal(answers.get(entries[2].key).execution, 'sandboxed');
});

test('verified Plus manifest rows and the host Plus catalog carry family membership', async () => {
    const view = fixture();
    const rows = await view.project.plusReviewRows({extensions: [{id: 'plus',
        source: {type: 'remote-cacheable', url: familyURL}, sha256: 'a'.repeat(64), dependencies: []}]},
        {isTrustedCode: async () => true});
    assert.deepEqual(rows[0].state, {trusted: true, plusFamily: true});
    const unverified = await view.project.plusReviewRows({extensions: [{id: 'plus',
        source: {type: 'remote-cacheable', url: familyURL}, sha256: 'b'.repeat(64), dependencies: []}]},
        {isTrustedCode: async () => false});
    assert.equal(unverified[0].state, undefined);
    const catalog = reviewRows([{id: 'plus', url: familyURL, metadata: {}}],
        {extensionManager: {isExtensionLoaded: () => false}});
    assert.deepEqual(catalog[0].state, {trusted: true, plusFamily: true, loaded: false});
});
