const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>',
    {url: 'http://localhost/', pretendToBeVisual: true});
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Element', 'history', 'location', 'HTMLCollection', 'NodeList']) {
    Object.defineProperty(globalThis, name, {value: dom.window[name], configurable: true});
}
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.MessageChannel = undefined;
const React = require('react');
const ReactDOM = require('react-dom');
const {act, Simulate} = require('react-dom/test-utils');
const {ExtensionSelectionList, ExtensionSecurityDialog} = require('../dist/react.cjs');
const wait = ms => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const app = () => document.getElementById('app');
const unmount = () => act(() => { ReactDOM.unmountComponentAtNode(app()); });
const render = (Component, props) => act(() => { ReactDOM.render(React.createElement(Component, props), app()); });
const row = id => document.querySelector(`article[data-extension-id="${id}"]`);
const change = element => act(() => { Simulate.change(element); });
const click = element => act(() => { Simulate.click(element); });
const entries = () => ['base', 'parent', 'other'].map(id => ({id, ids: [id], url: `https://catalog.test/${id}.js`,
    dependencies: id === 'parent' ? ['base'] : [], metadata: {name: `Name ${id}`, unsandboxed: 'optional'}}));

test('loaded checks and actual execution/distribution state restore independently from ID records and URL maps', () => {
    const items = entries();
    const completed = [];
    render(ExtensionSelectionList, {entries: items, loadedIds: ['base'], enableDistribution: true,
        initialChoices: new Map([[items[0].url, 'sandboxed'], [items[1].url, 'unsandboxed']]),
        initialDistributions: {base: 'embedded'}, locale: 'ja',
        onComplete: (...args) => completed.push(args), onCancel() {}});
    assert.equal(row('base').querySelector('[type="checkbox"]').checked, true);
    assert.equal(row('base').querySelector('[type="checkbox"]').disabled, true);
    assert.equal(row('base').querySelector('[value="sandboxed"]').checked, true);
    assert.equal(row('base').querySelector('[value="sandboxed"]').disabled, false);
    assert.equal(row('base').querySelector('[data-distribution="embedded"]').checked, true);
    assert.equal(row('other').querySelector('[data-distribution="remote"]').checked, true);
    change(row('base').querySelector('[data-distribution="remote"]'));
    assert.equal(row('base').querySelector('[value="sandboxed"]').checked, true);
    change(row('parent').querySelector('[type="checkbox"]'));
    click([...document.querySelectorAll('button')].find(button => button.textContent === '拡張の設定を適用'));
    assert.deepEqual(completed[0][0].map(entry => entry.id), ['parent'], 'legacy first argument excludes loaded IDs');
    const settings = completed[0][1];
    assert.deepEqual(settings.entries.map(entry => entry.id), ['base', 'parent']);
    assert.deepEqual([...settings.distributions], [['base', 'remote'], ['parent', 'remote']]);
    assert.equal(settings.choices.get(items[0].url), 'sandboxed');
    assert.equal(settings.choices.get(items[1].url), 'unsandboxed');
    unmount();
});

test('bulk distribution reaches filtered-out packages, permits row overrides and never changes execution choices', () => {
    const items = entries();
    const props = {entries: items, loadedIds: ['base'], enableDistribution: true,
        initialChoices: {base: 'sandboxed', parent: 'unsandboxed', other: 'sandboxed'},
        onComplete() {}, onCancel() {}};
    render(ExtensionSelectionList, {...props, filterQuery: 'parent'});
    change(row('parent').querySelector('[type="checkbox"]'));
    click(document.querySelector('button[data-distribution="embedded"]'));
    assert.equal(row('parent').dataset.distribution, 'embedded');
    change(row('parent').querySelector('[data-distribution="remote"]'));
    render(ExtensionSelectionList, props);
    assert.equal(row('base').dataset.distribution, 'embedded');
    assert.equal(row('parent').dataset.distribution, 'remote');
    assert.equal(row('other').dataset.distribution, 'embedded');
    for (const [id, mode] of [['base', 'sandboxed'], ['parent', 'unsandboxed'], ['other', 'sandboxed']]) {
        assert.equal(row(id).querySelector(`[value="${mode}"]`).checked, true);
    }
    unmount();
});

test('distribution feature defaults off and preserves the exact legacy callback shape', () => {
    const completed = [];
    render(ExtensionSelectionList, {entries: entries(), onComplete: (...args) => completed.push(args), onCancel() {}});
    assert.equal(document.querySelectorAll('[data-distribution]').length, 0);
    assert.equal(document.querySelectorAll('[type="radio"]').length, 0);
    change(row('other').querySelector('[type="checkbox"]'));
    click([...document.querySelectorAll('button')].find(button => button.textContent === 'Load selected extensions'));
    assert.equal(completed[0].length, 1);
    assert.deepEqual(completed[0][0].map(entry => entry.id), ['other']);
    unmount();
});

test('loaded-only rows can submit distribution changes, while busy blocks every editable control', () => {
    const completed = [];
    const props = {entries: entries(), loadedIds: ['base'], enableDistribution: true,
        initialChoices: {base: 'sandboxed'}, onComplete: (...args) => completed.push(args), onCancel() {}};
    render(ExtensionSelectionList, props);
    change(row('base').querySelector('[data-distribution="embedded"]'));
    const apply = [...document.querySelectorAll('button')].find(button => button.textContent === 'Apply extension settings');
    assert.equal(apply.disabled, false);
    click(apply);
    assert.deepEqual(completed[0][0], []);
    assert.deepEqual([...completed[0][1].distributions], [['base', 'embedded']]);
    render(ExtensionSelectionList, {...props, busy: true});
    assert.ok([...document.querySelectorAll('input,button')].every(element => element.disabled));
    unmount();
});

test('required execution constraints remain intact while distribution stays independent', () => {
    const items = entries();
    items[0].metadata.unsandboxed = 'required';
    render(ExtensionSelectionList, {entries: items, loadedIds: ['base'], enableDistribution: true, onComplete() {}, onCancel() {}});
    assert.equal(row('base').querySelector('[value="unsandboxed"]').checked, true);
    assert.equal(row('base').querySelector('[value="sandboxed"]').disabled, true);
    assert.equal(row('base').querySelector('[value="deny"]'), null);
    change(row('base').querySelector('[data-distribution="embedded"]'));
    assert.equal(row('base').querySelector('[value="unsandboxed"]').checked, true);
    unmount();
});

test('security review returns distribution as a separate optional result and never evaluates metadata source', async () => {
    const items = entries().slice(0, 2);
    const completed = [];
    render(ExtensionSecurityDialog, {entries: items, enableDistribution: true, locale: 'ja',
        initialChoices: {base: 'sandboxed', parent: 'unsandboxed'},
        initialDistributions: new Map([[items[0].url, 'embedded']]),
        loadInfo: async () => ({metadata: {}, source: 'globalThis.distributionSourceExecuted=true'}),
        onComplete: (...args) => completed.push(args)});
    await wait(0);
    assert.equal(document.querySelector('article [value="sandboxed"]').checked, true);
    assert.equal(document.querySelector('article [data-distribution="embedded"]').checked, true);
    click(document.querySelector('button[data-distribution="remote"]'));
    await wait(760);
    click([...document.querySelectorAll('button')].find(button => button.textContent === 'OK'));
    assert.equal(completed[0][0].get(items[0].url), 'sandboxed');
    assert.equal(completed[0][0].get(items[1].url), 'unsandboxed');
    assert.deepEqual([...completed[0][1].distributions], [['base', 'remote'], ['parent', 'remote']]);
    assert.equal(globalThis.distributionSourceExecuted, undefined);
    unmount();
});

test('optional packages require an execution choice, and execution bulk leaves distribution untouched', () => {
    const items = entries();
    items[0].metadata.unsandboxed = 'required';
    render(ExtensionSelectionList, {entries: items, enableDistribution: true, onComplete() {}, onCancel() {}});
    change(row('parent').querySelector('[type="checkbox"]'));
    const apply = () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Apply extension settings');
    assert.equal(apply().disabled, true);
    click(document.querySelector('button[data-distribution="embedded"]'));
    click(document.querySelector('button[data-execution="sandboxed"]'));
    assert.equal(apply().disabled, false);
    assert.equal(row('base').querySelector('[value="unsandboxed"]').checked, true, 'required packages retain their only valid execution mode');
    assert.equal(row('parent').querySelector('[value="sandboxed"]').checked, true);
    assert.ok([...document.querySelectorAll('article')].every(element => element.dataset.distribution === 'embedded'));
    unmount();
});

test('late catalog rows restore actual state while existing row edits survive filtering and prop updates', () => {
    const items = entries();
    const props = {enableDistribution: true, loadedIds: ['base'],
        initialChoices: {base: 'sandboxed', parent: 'unsandboxed'},
        initialDistributions: {base: 'embedded', parent: 'embedded'}, onComplete() {}, onCancel() {}};
    render(ExtensionSelectionList, {...props, entries: [items[0]]});
    change(row('base').querySelector('[data-distribution="remote"]'));
    render(ExtensionSelectionList, {...props, entries: items});
    assert.equal(row('base').querySelector('[data-distribution="remote"]').checked, true);
    assert.equal(row('parent').querySelector('[data-distribution="embedded"]').checked, true);
    assert.equal(row('parent').querySelector('[value="unsandboxed"]').checked, true);
    unmount();
});

test('hidden selection and review execution radios use distinct names and unique requirement IDs', async () => {
    const items = entries().slice(0, 1);
    items[0].metadata.unsandboxed = 'required';
    act(() => { ReactDOM.render(React.createElement('div', {},
        React.createElement('div', {hidden: true}, React.createElement(ExtensionSelectionList, {
            entries: items, enableDistribution: true, onComplete() {}, onCancel() {}})),
        React.createElement(ExtensionSecurityDialog, {entries: items, enableDistribution: true,
            initialChoices: {base: 'unsandboxed'}, loadInfo: async () => ({metadata: items[0].metadata}), onComplete() {}})), app()); });
    await wait(0);
    const selected = [...document.querySelectorAll('input[value="unsandboxed"]')];
    assert.equal(selected.length, 2);
    assert.notEqual(selected[0].name, selected[1].name);
    assert.ok(selected.every(input => input.checked));
    const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
    assert.equal(new Set(ids).size, ids.length);
    unmount();
});

test('incompatible loaded execution stays visible as actual state instead of silently showing elevated permission', () => {
    const items = entries();
    items[0].metadata.unsandboxed = 'required';
    render(ExtensionSelectionList, {entries: items, loadedIds: ['base'], enableDistribution: true,
        initialChoices: {base: 'sandboxed'}, onComplete() {}, onCancel() {}});
    assert.equal(row('base').querySelector('[value="sandboxed"]').checked, true);
    assert.equal(row('base').querySelector('[value="sandboxed"]').disabled, true);
    assert.equal(row('base').querySelector('[value="unsandboxed"]').checked, false);
    const apply = () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Apply extension settings');
    assert.equal(apply().disabled, true);
    change(row('base').querySelector('[value="unsandboxed"]'));
    assert.equal(apply().disabled, false);
    unmount();
});

test('selection offers two execution modes and loaded rows retain their checked state', () => {
    render(ExtensionSelectionList, {entries: entries(), loadedIds: ['base'], enableDistribution: true,
        initialChoices: {base: 'sandboxed'}, onComplete() {}, onCancel() {}});
    assert.equal(document.querySelector('[value="deny"]'), null);
    assert.equal(document.querySelector('button[data-execution="deny"]'), null);
    assert.equal(row('base').querySelectorAll('input[type="radio"]:not([data-distribution])').length, 2);
    assert.equal(row('base').querySelector('[value="sandboxed"]').checked, true);
    assert.equal(row('base').querySelector('[type="checkbox"]').checked, true);
    unmount();
});

test('unchecked rows cannot be configured or submitted, while bulk presets survive checking again', () => {
    const completed = [];
    render(ExtensionSelectionList, {entries: entries(), enableDistribution: true,
        onComplete: (...args) => completed.push(args), onCancel() {}});
    assert.ok([...row('other').querySelectorAll('[type="radio"]')].every(input => input.disabled));
    change(row('other').querySelector('[value="sandboxed"]'));
    assert.equal(row('other').querySelector('[value="sandboxed"]').checked, false);
    click(document.querySelector('button[data-execution="sandboxed"]'));
    click(document.querySelector('button[data-distribution="embedded"]'));
    change(row('other').querySelector('[type="checkbox"]'));
    assert.ok([...row('other').querySelectorAll('[type="radio"]')].every(input => !input.disabled));
    assert.equal(row('other').querySelector('[value="sandboxed"]').checked, true);
    assert.equal(row('other').querySelector('[data-distribution="embedded"]').checked, true);
    change(row('other').querySelector('[type="checkbox"]'));
    change(row('parent').querySelector('[type="checkbox"]'));
    click([...document.querySelectorAll('button')].find(button => button.textContent === 'Apply extension settings'));
    assert.deepEqual(completed[0][1].entries.map(entry => entry.id), ['base', 'parent']);
    assert.equal(completed[0][1].distributions.has('other'), false);
    unmount();
});

test('required dependencies cannot inherit a stale deny decision or be submitted without execution selection', () => {
    const completed = [];
    render(ExtensionSelectionList, {entries: entries(), enableDistribution: true,
        initialChoices: {base: 'deny', parent: 'unsandboxed'},
        onComplete: (...args) => completed.push(args), onCancel() {}});
    change(row('parent').querySelector('[type="checkbox"]'));
    const apply = () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Apply extension settings');
    assert.equal(row('base').dataset.selectionState, 'dependency');
    assert.equal(row('base').querySelector('[type="checkbox"]').checked, true);
    assert.equal(row('base').querySelector('[type="checkbox"]').disabled, true);
    assert.equal(apply().disabled, true);
    change(row('base').querySelector('[value="sandboxed"]'));
    assert.equal(apply().disabled, false);
    click(apply());
    assert.deepEqual(completed[0][1].entries.map(entry => entry.id), ['base', 'parent']);
    assert.ok([...completed[0][1].choices.values()].every(mode => mode !== 'deny'));
    change(row('parent').querySelector('[type="checkbox"]'));
    assert.equal(row('base').querySelector('[type="checkbox"]').checked, false);
    assert.ok([...row('base').querySelectorAll('[type="radio"]')].every(input => input.disabled));
    unmount();
});

test('project permission review retains explicit denial independently of the catalog selection UI', async () => {
    render(ExtensionSecurityDialog, {entries: entries().slice(0, 1), initialChoices: {base: 'deny'},
        loadInfo: async () => ({metadata: {}}), onComplete() {}});
    await wait(0);
    assert.equal(row('base').querySelector('[value="deny"]').checked, true);
    assert.equal(row('base').querySelectorAll('input[type="radio"]').length, 3);
    unmount();
});
