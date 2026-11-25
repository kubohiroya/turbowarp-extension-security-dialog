// SPDX-License-Identifier: GPL-3.0-or-later
// From turbowarp-plus-editor/test/extension-host/batch-review.test.ts at b8a74d6.
// The original test license is retained; see LICENSE.GPL-3.0 in this directory.
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {createProjectSecurityReview} = require('../dist/project-review.cjs');
const {reviewedProjectArchive} = require('@kubohiroya/turbowarp-extension-loader/shared-project-archive');

// Supply the host ports without a GUI, VM, catalog or progress overlay.
const projectReview = createProjectSecurityReview({
    trusted: {listedDigests: new Set(), ready: async () => {}, isTrustedCode: async () => false,
        isTrustedURL: async () => false},
    pendingReview: () => null,
    reviewedArchive: reviewedProjectArchive,
    duringApproval: (_vm, run) => run(),
    styles: {}
});
const {createSecurityReview} = projectReview;

test('a cancelled review is a refusal, not a failure', () => {
    const review = createSecurityReview();
    assert.equal(review.isCancelled(Object.assign(new Error('x'), {code: 'OTHER'})), false);
    assert.equal(typeof review.render, 'function');
});

test('a project is named by its address when it has one, else by its content without volatile metadata', async () => {
    const {identifyProject} = projectReview;
    const base = {targets: [], extensions: [], meta: {agent: 'one'}};
    const sameContent = {...base, meta: {agent: 'two'}, projectVersion: 3};
    assert.match(await identifyProject(base), /^sha256:[0-9a-f]{64}$/);
    assert.equal(await identifyProject(JSON.stringify(sameContent)), await identifyProject(base));
    assert.notEqual(await identifyProject({...base, extensions: ['pen']}), await identifyProject(base));
    const uri = 'https://example.test/turbowarp-plus-projects/aa/aaaa/0193f0a1-2b3c-7d4e-8f01-2233445566aa.sb3';
    const addressed = {...base, turboWarpPlus: {schemaVersion: 1, uri, extensions: []}};
    assert.equal(await identifyProject(addressed), uri);
});

test('rows the catalog or the GUI vouches for are decided without the screen, and the rest are asked', async () => {
    const asked = [];
    let review;
    const install = (vm, callback) => { review = callback; return () => {}; };
    const security = createSecurityReview({install, storage: null, identify: async () => null,
        trusted: {listedDigests: new Set(), ready: async () => {}, isTrustedCode: async () => false, isTrustedURL: async url => url === 'https://catalog.test/listed.js'}});
    security.installBatchLoader({vm: {}, defaultURLs: {},
        isTrusted: url => url === 'https://gui.test/own.js',
        bannerFor: ({ids}) => (ids.includes('shown') ? 'banner.svg' : undefined),
        showReview: async (entries, initial) => { asked.push(entries, initial); return new Map(); }});
    const row = (key, url) => ({key: url, ids: [key], source: {kind: 'legacy', url}});
    const trustedOnly = await review([row('listed', 'https://catalog.test/listed.js'), row('own', 'https://gui.test/own.js')], new Map());
    assert.deepEqual([...trustedOnly.values()], [{execution: 'unsandboxed'}, {execution: 'unsandboxed'}]);
    assert.equal(asked.length, 0, 'nothing to ask, so the screen never opened');
    await review([row('listed', 'https://catalog.test/listed.js'), row('shown', 'https://elsewhere.test/x.js')], new Map());
    const [entries, initial] = asked;
    assert.deepEqual(entries.map(entry => Boolean(entry.state?.trusted)), [true, false]);
    assert.equal(entries[1].metadata.banner, 'banner.svg');
    assert.deepEqual(initial.get('https://elsewhere.test/x.js'), {execution: 'sandboxed'});
});
