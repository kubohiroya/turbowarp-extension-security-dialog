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
