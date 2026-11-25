// SPDX-License-Identifier: GPL-3.0-or-later
// From turbowarp-plus-editor/test/extension-host/unified-review.test.ts at 52cc9fc.
// The original test license is retained; see LICENSE.GPL-3.0 in this directory.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const JSZip = require('@turbowarp/jszip');
const {createProjectSecurityReview} = require('../dist/project-review.cjs');

test('review names come from verified ZIP source without executing header, literal, dynamic or tampered code', async () => {
    const sources = [
        {id: 'headerfixture', source: '// Name: Header name\nScratch.vm.unifiedExecuted = 1;'},
        {id: 'literalfixture', source: `Scratch.vm.unifiedExecuted = 1;
            class Other {getInfo() {return {id: 'other', name: 'Wrong name'};}}
            Scratch.extensions.register({getInfo() {return {id: 'literalfixture', name: 'Literal name'};}});`},
        {id: 'dynamicfixture', source: `Scratch.extensions.register({
            getInfo() {return {id: 'dynamicfixture', name: unknownName()};}
        });`},
        {id: 'tamperedfixture', source: '// Name: Unverified name\nScratch.vm.unifiedExecuted = 1;',
            sha256: '0'.repeat(64)}
    ];
    const zip = new JSZip();
    const extensions = sources.map(({id, source, sha256}) => {
        const path = `extensions/${id}.js`;
        zip.file(path, source);
        return {id, source: {type: 'embedded-file', path}, execution: 'unsandboxed',
            sha256: sha256 ?? createHash('sha256').update(source).digest('hex')};
    });
    zip.file('project.json', JSON.stringify({turboWarpPlus: {schemaVersion: 1, extensions}}));
    const archive = await JSZip.loadAsync(await zip.generateAsync({type: 'uint8array'}));
    // The real Loader codec supplies the normalized dependency array at this public boundary.
    const manifest = {schemaVersion: 1, extensions: extensions.map(spec => ({...spec, dependencies: []}))};
    const trusted = {isTrustedURL: async () => false, isTrustedCode: async () => false};
    const review = createProjectSecurityReview({trusted, pendingReview: () => null,
        reviewedArchive: () => undefined, duringApproval: (_vm, run) => run(), styles: {}});
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Scratch');
    const vm = {};
    Object.defineProperty(globalThis, 'Scratch', {configurable: true, value: {vm,
        extensions: {register: () => {throw new Error('Review must not execute extension code');}}}});
    try {
        const rows = await review.plusReviewRows(manifest, trusted, path => archive.file(path).async('uint8array'));
        assert.deepEqual(rows.map(entry => [entry.key, entry.metadata.name]), [
            ['headerfixture', 'Header name'],
            ['literalfixture', 'Literal name'],
            ['dynamicfixture', undefined],
            ['tamperedfixture', undefined]
        ]);
        assert.equal(vm.unifiedExecuted, undefined);
    } finally {
        if (descriptor) Object.defineProperty(globalThis, 'Scratch', descriptor);
        else delete globalThis.Scratch;
    }
});
