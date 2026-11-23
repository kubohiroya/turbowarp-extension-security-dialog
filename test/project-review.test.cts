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

test('a data: address is a Plus family row only when the catalog lists its exact bytes', async () => {
    const {createHash} = require('node:crypto');
    const code = '// Name: Plus\nthrow new Error("Do not run");';
    const listedCode = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
    const percentCode = `data:text/javascript,${encodeURIComponent(code)}`;
    const otherCode = `data:text/javascript;base64,${Buffer.from(`${code}\n`).toString('base64')}`;
    const digest = createHash('sha256').update(code).digest('hex');
    const listedURL = 'https://cdn.example.test/plus@1.0.0/plus.js';
    const asked = [];
    const trusted = {
        isTrustedURL: async () => false,
        isTrustedCode: async code => {asked.push(code); return code.actualSHA256 === digest;}
    };
    const catalog = {read: async () => ({catalog: {extensions: [{id: 'plus', url: listedURL, sha256: digest}]}})};
    let review;
    let rows;
    const project = createProjectSecurityReview({catalog, trusted, pendingReview: () => null,
        reviewedArchive: () => undefined, duringApproval: (_vm, run) => run(), styles: {}});
    project.createSecurityReview({install: (_vm, callback) => {review = callback; return () => {};}})
        .installBatchLoader({vm: {}, defaultURLs: {}, isTrusted: () => false, bannerFor: () => undefined,
            showReview: (entries, initial) => {rows = entries; return initial;}});
    const entries = [listedCode, percentCode, otherCode].map((url, index) => ({
        key: `row${index}`, ids: ['plus'], source: {kind: 'legacy', url}
    }));
    const answers = await review(entries);
    assert.deepEqual(asked[0], {source: {type: 'embedded-data'}, actualSHA256: digest});
    for (const row of rows.slice(0, 2)) {
        assert.deepEqual(row.state, {trusted: true, plusFamily: true, listedURL});
        assert.equal(row.source.sha256, digest);
    }
    assert.equal(rows[2].state, undefined);
    assert.equal('sha256' in rows[2].source, false);
    assert.equal(answers.get('row0').execution, 'unsandboxed');
    assert.equal(answers.get('row2').execution, 'sandboxed');
});

test('embedded Plus manifest rows vouched by digest name the catalog address', async () => {
    const digest = 'c'.repeat(64);
    const listedURL = 'https://cdn.example.test/plus@1.0.0/plus.js';
    const catalog = {read: async () => ({catalog: {extensions: [{id: 'plus', url: listedURL, sha256: digest}]}})};
    const project = createProjectSecurityReview({catalog, trusted: {isTrustedURL: async () => false,
        isTrustedCode: async () => true}, pendingReview: () => null, reviewedArchive: () => undefined,
    duringApproval: (_vm, run) => run(), styles: {}});
    const rows = await project.plusReviewRows({extensions: [{id: 'plus', source: {type: 'embedded-data'},
        sha256: digest, dependencies: []}]}, {isTrustedCode: async () => true});
    assert.deepEqual(rows[0].state, {trusted: true, plusFamily: true, listedURL});
});

const embeddedRow = async (source, spec = {}) => {
    const bytes = new TextEncoder().encode(source);
    const digest = Buffer.from(await globalThis.crypto.subtle.digest('SHA-256', bytes)).toString('hex');
    const project = createProjectSecurityReview({trusted: {isTrustedURL: async () => false,
        isTrustedCode: async () => false}, pendingReview: () => null, reviewedArchive: () => undefined,
    duringApproval: (_vm, run) => run(), styles: {}});
    const rows = await project.plusReviewRows({extensions: [{id: 'kamishibai', source: {type: 'embedded-file',
        path: 'extensions/kamishibai.js'}, sha256: digest, dependencies: [], ...spec}]},
    {isTrustedCode: async () => false}, async path => (path === 'extensions/kamishibai.js' ? bytes : new Uint8Array()));
    return rows[0];
};

test('embedded Plus manifest rows show the picture, creator and description their header declares', async () => {
    const row = await embeddedRow([
        '// Name: Kamishibai Runtime',
        '// ID: kamishibai',
        '// Description: Runs a story.',
        '// Description[ja]: 物語を実行します。',
        '// By: Example Author',
        '// Author URL: https://example.test/author',
        '// Banner: data:image/svg+xml,%3Csvg%2F%3E',
        '// Unsandboxed: required',
        '(function(){})();'
    ].join('\n'), {version: '4.0.6'});
    assert.equal(row.metadata.name, 'Kamishibai Runtime');
    assert.equal(row.metadata.author, 'Example Author');
    assert.equal(row.metadata.authorURL, 'https://example.test/author');
    assert.equal(row.metadata.banner, 'data:image/svg+xml,%3Csvg%2F%3E');
    assert.equal(row.metadata.descriptions.ja, '物語を実行します。');
    assert.equal(row.metadata.version, '4.0.6');
    assert.equal(row.metadata.id, 'kamishibai');
});

test('the manifest publisher wins, and a header describing another ID lends only its name', async () => {
    const source = '// Name: Bundle\n// ID: kamishibai\n// By: Header Author\n(function(){})();';
    assert.equal((await embeddedRow(source, {publisher: 'Manifest Publisher'})).metadata.author, 'Manifest Publisher');
    const other = await embeddedRow('// Name: Other\n// ID: other\n// By: Someone\n// Banner: https://x.test/a.png\n(function(){})();');
    assert.deepEqual(other.metadata, {id: 'kamishibai', name: 'Other'});
});

test('an embedded row drops a picture that is neither HTTPS nor a data: image', async () => {
    const row = await embeddedRow('// Name: K\n// Banner: javascript:alert(1)\n(function(){})();');
    assert.equal(row.metadata.banner, undefined);
});

test('embedded bytes that do not match the pinned digest describe nothing', async () => {
    const project = createProjectSecurityReview({trusted: {isTrustedURL: async () => false,
        isTrustedCode: async () => false}, pendingReview: () => null, reviewedArchive: () => undefined,
    duringApproval: (_vm, run) => run(), styles: {}});
    const rows = await project.plusReviewRows({extensions: [{id: 'k', source: {type: 'embedded-file', path: 'k.js'},
        sha256: 'd'.repeat(64), dependencies: []}]}, {isTrustedCode: async () => false},
    async () => new TextEncoder().encode('// Name: Liar\n// By: Liar\n'));
    assert.deepEqual(rows[0].metadata, {id: 'k'});
});
