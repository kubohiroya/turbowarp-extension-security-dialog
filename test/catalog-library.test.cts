// SPDX-License-Identifier: MPL-2.0
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createCatalogLibrary} = require('../dist/catalog-library.cjs');

const entry = {id: 'example', url: 'https://example.test/extension.js', dependencies: [], metadata: {name: 'Example'}};
const fixture = (ports = {}) => {
    const calls = [];
    const vm = {extensionManager: {isExtensionLoaded: () => false, _loadedExtensions: new Map()}};
    const View = createCatalogLibrary({catalog: {read: async () => ({catalog: {extensions: []}})},
        readSettings: async () => ({decisions: new Map()}), applySettings: async () => [entry.id],
        loadExtensions: async () => [], loaderEnabled: true, isRetryable: () => true, styles: {}, ...ports});
    const view = new View({vm, locale: 'en', permissions: {}, onBusyChange: busy => calls.push(['busy', busy]),
        onCategorySelected: id => calls.push(['category', id]), onRequestClose: () => calls.push(['close'])});
    view.alive = true;
    view.controller = new AbortController();
    view.state.entries = [entry];
    view.setState = update => Object.assign(view.state, update);
    return {view, calls};
};
test('a disposed library aborts work and never navigates after a delayed apply', async () => {
    let finish;
    const {view, calls} = fixture({applySettings: () => new Promise(resolve => {finish = resolve;})});
    const pending = view.handleComplete(new Map([[entry.id, {execution: 'unsandboxed', loading: 'embedded-data'}]]));
    view.componentWillUnmount();
    assert.equal(view.controller.signal.aborted, true);
    finish([entry.id]);
    await pending;
    assert.deepEqual(calls, [['busy', true]]);
});
test('retry repeats the original selection and reports success through host callbacks', async () => {
    const selections = [];
    const {view, calls} = fixture({applySettings: async (_vm, selection) => {
        selections.push(selection.decisions);
        if (selections.length === 1) throw Object.assign(new Error('temporary'), {code: 'TEMPORARY'});
        return [entry.id];
    }});
    const decisions = new Map([[entry.id, {execution: 'unsandboxed', loading: 'embedded-file'}]]);
    await view.handleComplete(decisions);
    assert.equal(view.state.failure.retryable, true);
    await view.handleRetry();
    assert.deepEqual(selections, [decisions, decisions]);
    assert.deepEqual(calls.slice(-3), [['category', entry.id], ['close'], ['busy', false]]);
});
test('cancelling a selection closes the library without applying settings', async () => {
    const {view, calls} = fixture({applySettings: () => {throw new Error('must not apply');}});
    await view.handleComplete(null);
    assert.deepEqual(calls, [['close']]);
});

test('a published operation blocks catalog additions, retry and closing until it settles', async () => {
    let applications = 0;
    const {view, calls} = fixture({applySettings: async () => {applications++; return [entry.id];}});
    const decisions = new Map([[entry.id, {execution: 'sandboxed', loading: 'embedded-file'}]]);
    view.answered = decisions;
    view.state.publishedBusy = true;
    await view.handleComplete(null);
    await view.handleComplete(decisions);
    await view.handleRetry();
    assert.equal(applications, 0);
    assert.deepEqual(calls, []);
    view.state.publishedBusy = false;
    await view.handleRetry();
    assert.equal(applications, 1);
    assert.deepEqual(calls, [['busy', true], ['category', entry.id], ['close'], ['busy', false]]);
});

test('trusted preview icons decorate immutable parsed entries without changing catalog metadata', async () => {
    const catalogEntry = {id: 'preview', name: 'Preview', version: '1.0.0', url: 'https://example.test/preview.js',
        sha256: 'a'.repeat(64), unsandboxed: 'optional', dependencies: [], banner: 'https://example.test/original.svg'};
    const icon = 'data:image/svg+xml;base64,PHN2Zy8+';
    let settingsEntries;
    const {view} = fixture({catalog: {read: async () => ({catalog: {schemaVersion: 1, extensions: [catalogEntry]},
        icons: {preview: icon}})}, readSettings: async (_vm, entries) => {
        settingsEntries = entries;
        return {decisions: new Map()};
    }});
    await view.handleFetchCatalog();
    assert.equal(view.state.fetchError, false);
    assert.equal(view.state.entries[0].metadata.banner, icon);
    assert.equal(settingsEntries, view.state.entries);
    assert.equal(catalogEntry.banner, 'https://example.test/original.svg');
});
