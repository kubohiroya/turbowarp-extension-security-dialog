// SPDX-License-Identifier: MPL-2.0
const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><main></main>', {url: 'https://editor.test/', pretendToBeVisual: true});
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Element']) {
    Object.defineProperty(globalThis, name, {value: dom.window[name], configurable: true});
}
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.MessageChannel = undefined;
const React = require('react');
const ReactDOM = require('react-dom');
const {act, Simulate} = require('react-dom/test-utils');
const {ExtensionDevelopment} = require('../dist/react.cjs');
const applied = 'a'.repeat(64);
const session = {token: 'active-session', id: 'example', directory: '/work/example', enabled: true,
    appliedDigest: applied, mode: 'artifact', execution: 'sandboxed',
    sourceHeader: '// Name: Example\n// ID: example\n// Version: 1.0.0\nthrow new Error("Do not execute");'};
const host = document.querySelector('main');
const click = element => act(() => Simulate.click(element));
const button = label => [...host.querySelectorAll('button')].find(element => element.textContent === label);

function fixture(overrides = {}) {
    const calls = [];
    let props = {capabilities: {localDevelopment: true, sourceBuild: false}, sessions: [session], locale: 'en',
        onAdd: mode => calls.push(['add', mode]), onToggle: (...args) => calls.push(['toggle', ...args]),
        onRemove: token => calls.push(['remove', token]), onClose: () => calls.push(['close']), ...overrides};
    const render = () => act(() => {ReactDOM.render(React.createElement(ExtensionDevelopment, props), host);});
    render();
    return {calls, update: update => {props = {...props, ...update}; render();},
        close: () => act(() => {ReactDOM.unmountComponentAtNode(host);})};
}
after(() => dom.window.close());

test('Web and unconfirmed capabilities expose no local-development controls or side effects', () => {
    for (const capabilities of [undefined, {localDevelopment: false, sourceBuild: true}]) {
        const view = fixture({capabilities});
        assert.equal(host.textContent, '');
        assert.deepEqual(view.calls, []);
        view.close();
    }
});

test('source build is offered only by an explicit host capability and connecting asks the host once', () => {
    const view = fixture();
    assert.equal(button('Connect a TypeScript folder…'), undefined);
    click(button('Connect a build folder…'));
    view.update({capabilities: {localDevelopment: true, sourceBuild: true}});
    click(button('Connect a TypeScript folder…'));
    assert.deepEqual(view.calls, [['add', 'artifact'], ['add', 'source']]);
    view.close();
});

test('waiting, failed compilation and runtime diagnostics never replace the host-reported applied build', () => {
    const view = fixture();
    assert.match(host.textContent, /Last applied build: aaaaaaaaaaaa/);
    for (const update of [
        {waiting: true}, {waiting: true, buildError: 'LOCAL_EXTENSION_COMPILE_FAILED'},
        {diagnostic: {file: 'src/index.ts', line: 12, column: 4, sha256: applied}}
    ]) {
        view.update({sessions: [{...session, ...update}]});
        assert.equal(host.querySelector('[data-applied-digest]').dataset.appliedDigest, applied);
    }
    assert.match(host.textContent, /Runtime error: src\/index.ts:12:4/);
    assert.doesNotMatch(host.textContent, /Build failed/);
    view.update({sessions: [{...session, error: 'LOCAL_EXTENSION_APPLY_FAILED'}]});
    assert.match(host.textContent, /Development operation failed/);
    assert.match(host.textContent, /Automatic updates enabled/);
    assert.equal(host.querySelector('input').checked, true);
    assert.deepEqual(view.calls, []);
    view.close();
});

test('pause and disconnect request only their own session and wait for the host snapshot', () => {
    const other = {...session, token: 'second-session', id: 'other', directory: '/work/other'};
    const view = fixture({sessions: [session, other]});
    const checkboxes = host.querySelectorAll('input[type=checkbox]');
    act(() => Simulate.change(checkboxes[0]));
    assert.equal(checkboxes[0].checked, true);
    view.update({sessions: [{...session, enabled: false}, other]});
    assert.equal(host.querySelector('input[type=checkbox]').checked, false);
    click(button('Disconnect folder'));
    assert.deepEqual(view.calls, [['toggle', 'active-session', false], ['remove', 'active-session']]);
    assert.equal(host.querySelectorAll('.twextsec-row').length, 2);
    assert.equal(host.querySelectorAll('input[type=checkbox]')[1].checked, true);
    view.close();
});

test('busy and unavailable sessions cannot toggle, while an unavailable session can be disconnected', () => {
    const view = fixture({sessions: [{...session, busy: true}]});
    assert.equal(host.querySelector('input').disabled, true);
    assert.equal(button('Disconnect folder').disabled, true);
    view.update({sessions: [{...session, enabled: false, unavailable: true}]});
    assert.equal(host.querySelector('input').disabled, true);
    assert.equal(button('Disconnect folder').disabled, false);
    assert.match(host.textContent, /Development session unavailable/);
    view.close();
});

test('cancelling connection is one request and all close paths stay blocked until the host settles', () => {
    let cancelFrame;
    const Frame = ({onCancel, children}) => {cancelFrame = onCancel; return React.createElement('div', null, children);};
    const view = fixture({adding: true, DialogFrame: Frame, onCancelAdd: () => view.calls.push(['cancel'])});
    act(() => cancelFrame());
    assert.equal(button('Close').disabled, true);
    assert.equal(host.querySelector('input').disabled, true);
    click(button('Cancel connecting'));
    assert.equal(button('Cancel connecting').disabled, true);
    assert.match(host.textContent, /Cancelling/);
    assert.deepEqual(view.calls, [['cancel']]);
    view.update({adding: false});
    act(() => cancelFrame());
    assert.deepEqual(view.calls, [['cancel'], ['close']]);
    view.update({adding: true});
    assert.equal(button('Cancel connecting').disabled, false);
    view.close();
});

test('navigation is an explicit host callback tied to the exact applied digest', () => {
    const calls = [];
    const view = fixture({sessions: [{...session, diagnostic: {file: 'src/example.ts', line: 3, column: 8, sha256: applied}}],
        onOpenSource: (...args) => calls.push(args)});
    assert.deepEqual(calls, []);
    click(button('Open TypeScript location'));
    assert.deepEqual(calls, [['active-session', {file: 'src/example.ts', line: 3, column: 8, sha256: applied}]]);
    for (const diagnostic of [
        {file: 'src/example.ts', line: 3, column: 8},
        {file: 'src/example.ts', line: 3, column: 8, sha256: 'b'.repeat(64)},
        {file: 'src/../private.ts', line: 1, column: 1},
        {file: 'file:///private/secret.ts', line: 1, column: 1},
        {file: 'https://example.test/source.ts', line: 1, column: 1},
        {file: 'src/example.ts', line: 0, column: 1},
        {file: 'src/example.ts', line: 1, column: Infinity}
    ]) {
        view.update({sessions: [{...session, diagnostic}]});
        assert.equal(button('Open TypeScript location'), undefined);
        assert.match(host.textContent, /Source navigation is unavailable/);
    }
    assert.equal(calls.length, 1);
    view.close();
});

test('missing build or execution information is shown as unknown, never inferred from metadata', () => {
    const view = fixture({sessions: [{...session, appliedDigest: undefined, execution: undefined,
        metadata: {name: 'Example', unsandboxed: 'required', plusFamily: true, banner: 'https://private.test/preview.svg'}}]});
    assert.match(host.textContent, /No applied build has been reported/);
    assert.match(host.textContent, /Execution mode not reported/);
    assert.equal(host.querySelector('.twextsec-trusted'), null);
    assert.equal(host.querySelector('img').getAttribute('src').includes('private.test'), false);
    view.close();
});

test('untrusted descriptions and paths stay text and Japanese labels preserve a reported unsandboxed warning', () => {
    const view = fixture({locale: 'ja-JP', sessions: [{...session, execution: 'unsandboxed',
        directory: '<script>globalThis.executed = true</script>',
        sourceHeader: '// Name: Example\n// Description[ja]: <img src=x onerror="globalThis.executed=true">\n' +
            'globalThis.executed = true;'}]});
    assert.match(host.textContent, /<script>/);
    assert.match(host.textContent, /<img/);
    assert.match(host.textContent, /その後のコード変更もこの権限/);
    assert.equal(host.querySelector('script'), null);
    assert.equal(globalThis.executed, undefined);
    assert.ok(button('閉じる'));
    view.close();
});
