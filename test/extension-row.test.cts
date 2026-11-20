const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>',
    {url: 'http://localhost/', pretendToBeVisual: true});
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Element',
    'history', 'location', 'HTMLCollection', 'NodeList']) {
    Object.defineProperty(globalThis, name, {value: dom.window[name], configurable: true});
}
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
// React 16's browser scheduler keeps Node's native MessagePort referenced forever.
globalThis.MessageChannel = undefined;
const React = require('react');
const ReactDOM = require('react-dom');
const {act, Simulate} = require('react-dom/test-utils');
const {ExtensionRow} = require('../dist/react.cjs');

function renderRow(props) {
    const host = document.getElementById('app');
    act(() => {
        ReactDOM.render(React.createElement('ul', null, React.createElement(ExtensionRow, {locale: 'en', ...props})), host);
    });
    return {
        row: host.querySelector('.twextsec-row'),
        unmount: () => act(() => {ReactDOM.unmountComponentAtNode(host);})
    };
}

const metadata = {name: 'Pen Plus', author: 'Creator', authorURL: 'https://creator.example.test/', version: '2.0.0',
    repository: 'https://github.com/example/pen-plus', description: 'Draws lines.\nSee https://example.test/pen.'};

test('a row on its own shows the name, IDs, version, picture, description and creator', () => {
    const view = renderRow({metadata, ids: ['penplus']});
    const {row} = view;
    assert.equal(row.querySelector('.twextsec-head strong').textContent, 'Pen Plus');
    assert.equal(row.querySelector('.twextsec-id').textContent, 'penplus');
    assert.equal(row.querySelector('.twextsec-head a').href, 'https://github.com/example/pen-plus/releases/tag/v2.0.0');
    assert.notEqual(row.querySelector('.twextsec-preview, img'), null);
    assert.equal(row.querySelector('.twextsec-about').textContent, metadata.description);
    assert.equal(row.querySelector('.twextsec-contact a').getAttribute('href'), metadata.authorURL);
    assert.equal(row.querySelector('input[type="checkbox"]'), null);
    assert.equal(row.querySelector('.twextsec-trusted'), null);
    view.unmount();
});

test('without a name the row is headed by its IDs, and Japanese labels follow the locale', () => {
    const view = renderRow({metadata: {}, ids: ['first', 'second'], locale: 'ja'});
    assert.equal(view.row.querySelector('.twextsec-head strong').textContent, 'first, second');
    assert.equal(view.row.querySelector('.twextsec-id'), null);
    assert.doesNotMatch(view.row.querySelector('.twextsec-claim').textContent, /Creator/u);
    view.unmount();
});

test('a pick adds a checkbox, and the picture chooses the same way unless the pick is disabled', () => {
    let toggled = 0;
    const view = renderRow({metadata, pick: {checked: true, onToggle: () => {toggled++;}}});
    const box = view.row.querySelector('input[type="checkbox"]');
    assert.equal(box.checked, true);
    assert.equal(view.row.getAttribute('data-picking'), 'true');
    act(() => Simulate.change(box));
    act(() => Simulate.click(view.row.querySelector('.twextsec-preview-pick')));
    assert.equal(toggled, 2);
    view.unmount();

    const fixed = renderRow({metadata, pick: {checked: false, disabled: true, onToggle: () => {toggled++;}}});
    assert.equal(fixed.row.querySelector('input[type="checkbox"]').disabled, true);
    act(() => Simulate.click(fixed.row.querySelector('.twextsec-preview-pick')));
    assert.equal(toggled, 2);
    fixed.unmount();
});

test('the host adds its own attributes, details under the heading and content after the creator', () => {
    const view = renderRow({
        metadata, trusted: true, itemProps: {'data-key': 'pen', 'data-group': 'palette'},
        details: React.createElement('p', {className: 'host-detail'}, 'detail'),
        children: React.createElement('ul', {className: 'host-groups'}, React.createElement('li', null, 'Geometry'))
    });
    const {row} = view;
    assert.equal(row.getAttribute('data-key'), 'pen');
    assert.equal(row.getAttribute('data-group'), 'palette');
    assert.notEqual(row.querySelector('.twextsec-trusted'), null);
    const order = [...row.children].map(child => child.className);
    assert.ok(order.indexOf('host-detail') === order.indexOf('twextsec-head') + 1);
    assert.equal(order.at(-1), 'host-groups');
    view.unmount();
});

test('the Plus mark requires host-confirmed family membership rather than claimed metadata or trust alone', () => {
    const generic = renderRow({metadata: {...metadata, plusFamily: true}, trusted: true});
    const neutral = generic.row.querySelector('.twextsec-trusted');
    assert.equal(neutral.alt, 'Trusted by the host: runs without the sandbox');
    assert.doesNotMatch(Buffer.from(neutral.src.split(',')[1], 'base64').toString(), /TurboWarp/);
    generic.unmount();
    const family = renderRow({metadata, trusted: true, plusFamily: true});
    const badge = family.row.querySelector('.twextsec-trusted');
    assert.equal(badge.alt, 'TurboWarp Plus family');
    assert.match(Buffer.from(badge.src.split(',')[1], 'base64').toString(), /TurboWarp Plus/);
    family.unmount();
});
