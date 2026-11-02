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
const {ExtensionReview} = require('../dist/react.cjs');

const row = (key, source, extra = {}) => ({key, ids: [key], source, ...extra});
const catalogRow = (key, extra) => row(key, {kind: 'catalog', url: `https://example.test/${key}.js`}, extra);
const referenceRow = (key, extra) => row(key, {kind: 'reference', url: `https://example.test/${key}.js`, sha256: 'a'.repeat(64)}, extra);

function render(props) {
    const host = document.getElementById('app');
    let answer;
    act(() => {
        ReactDOM.render(React.createElement(ExtensionReview, {
            locale: 'en', onComplete: value => {answer = value;}, ...props
        }), host);
    });
    return {
        host,
        get answer() { return answer; },
        rows: () => Array.from(host.querySelectorAll('.twextsec-row')),
        rowFor: key => host.querySelector(`.twextsec-row[data-key="${key}"]`),
        radio: (key, group, value) => host.querySelector(
            `input[name="${group}-${key}"][value="${value}"]`),
        click: testid => act(() => {Simulate.click(host.querySelector(`[data-testid="${testid}"]`));}),
        unmount: () => act(() => {ReactDOM.unmountComponentAtNode(host);})
    };
}

test('adding lists the catalog, and ticking one row pulls in what it needs', () => {
    const view = render({
        mode: 'add',
        entries: [catalogRow('base'), catalogRow('app', {dependencies: ['base']})]
    });
    assert.equal(view.rows().length, 2);
    const tick = key => act(() => {
        const box = view.rowFor(key).querySelector('input[type="checkbox"]');
        box.checked = !box.checked;
        Simulate.change(box);
    });
    tick('app');
    const base = view.rowFor('base').querySelector('input[type="checkbox"]');
    assert.equal(base.checked, true);
    // A dependency cannot be unticked, so the list says who required it instead.
    assert.equal(base.disabled, true);
    assert.match(view.rowFor('base').textContent, /Needed by app/);
    view.click('twextsec-complete');
    assert.deepEqual([...view.answer.keys()].sort(), ['app', 'base']);
    view.unmount();
});

test('adding answers only for the rows that were chosen', () => {
    const view = render({mode: 'add', entries: [catalogRow('a'), catalogRow('b')]});
    act(() => {
        const box = view.rowFor('a').querySelector('input[type="checkbox"]');
        box.checked = true;
        Simulate.change(box);
    });
    view.click('twextsec-complete');
    assert.deepEqual([...view.answer.keys()], ['a']);
    view.unmount();
});

test('opening answers for every row, and cancelling answers for none', () => {
    const view = render({mode: 'open', entries: [referenceRow('a'), referenceRow('b')]});
    // Opening has no ticks: the project already names its extensions.
    assert.equal(view.host.querySelector('input[type="checkbox"]'), null);
    view.click('twextsec-cancel');
    assert.equal(view.answer, null);
    view.unmount();
});

test('a trusted row is stated, not asked about, and keeps its loading choice', () => {
    const view = render({
        mode: 'open',
        entries: [referenceRow('vouched', {state: {trusted: true}})]
    });
    const row = view.rowFor('vouched');
    assert.match(row.textContent, /Listed in the catalog/);
    assert.equal(view.radio('vouched', 'execution', 'sandboxed'), null);
    assert.notEqual(view.radio('vouched', 'loading', 'remote'), null);
    view.click('twextsec-complete');
    assert.deepEqual(view.answer.get('vouched'), {execution: 'unsandboxed', loading: 'cached'});
    view.unmount();
});

test('a bulk choice reaches only the rows that have it to make', () => {
    const view = render({
        mode: 'open',
        entries: [referenceRow('a'), referenceRow('vouched', {state: {trusted: true}})]
    });
    act(() => {
        const all = view.host.querySelector('input[name="execution-all"][value="deny"]');
        all.checked = true;
        Simulate.change(all);
    });
    view.click('twextsec-complete');
    assert.equal(view.answer.get('a').execution, 'deny');
    // The trusted row has no execution choice, so a bulk choice cannot reach it.
    assert.equal(view.answer.get('vouched').execution, 'unsandboxed');
    view.unmount();
});

test('choosing the sandbox against the extension own claim warns without blocking', () => {
    const view = render({
        mode: 'open',
        entries: [referenceRow('a', {metadata: {unsandboxed: 'required', name: 'Needs it'}})]
    });
    assert.match(view.rowFor('a').textContent, /Says it needs to run without the sandbox/);
    assert.notEqual(view.rowFor('a').querySelector('.twextsec-contradiction'), null);
    view.click('twextsec-complete');
    assert.equal(view.answer.get('a').execution, 'sandboxed');
    view.unmount();
});

test('a row that failed to load says so, and the rest stay answerable', () => {
    const view = render({
        mode: 'open',
        entries: [referenceRow('a', {state: {error: {code: 'DIGEST_MISMATCH', message: 'no match'}}}),
            referenceRow('b')]
    });
    assert.equal(view.rowFor('a').getAttribute('data-failed'), 'true');
    assert.match(view.rowFor('a').textContent, /DIGEST_MISMATCH/);
    view.click('twextsec-complete');
    assert.deepEqual([...view.answer.keys()].sort(), ['a', 'b']);
    view.unmount();
});

test('the creator name is shown as the extension own claim', () => {
    const view = render({
        mode: 'open',
        entries: [referenceRow('a', {metadata: {author: 'Someone'}})]
    });
    assert.match(view.rowFor('a').textContent, /Someone/);
    assert.match(view.rowFor('a').textContent, /not verified/);
    view.unmount();
});

test('opening uses the frame the host supplies, and adding renders in place', () => {
    const Frame = props => React.createElement('div', {'data-testid': 'frame'}, props.children);
    const opened = render({mode: 'open', entries: [referenceRow('a')], DialogFrame: Frame});
    assert.notEqual(opened.host.querySelector('[data-testid="frame"]'), null);
    opened.unmount();
    const added = render({mode: 'add', entries: [catalogRow('a')], DialogFrame: Frame});
    assert.equal(added.host.querySelector('[data-testid="frame"]'), null);
    added.unmount();
});

test('a preview is shown from the cache when there is one, and fetched once otherwise', async () => {
    const blobs = new Map();
    const fetched = [];
    const cache = {
        read: async url => blobs.get(url) || null,
        write: async (url, blob) => {
            blobs.set(url, blob);
            return true;
        }
    };
    globalThis.fetch = async url => {
        fetched.push(url);
        return {ok: true, blob: async () => new dom.window.Blob(['image'], {type: 'image/png'})};
    };
    globalThis.URL.createObjectURL = () => 'blob:preview';
    globalThis.URL.revokeObjectURL = () => {};
    const entry = referenceRow('a', {metadata: {name: 'A', banner: 'https://example.test/a.png'}});
    const first = render({mode: 'open', entries: [entry], previewCache: cache});
    await act(async () => {await new Promise(resolve => setTimeout(resolve, 0));});
    assert.equal(first.host.querySelector('.twextsec-preview').getAttribute('src'), 'blob:preview');
    assert.deepEqual(fetched, ['https://example.test/a.png']);
    first.unmount();

    const second = render({mode: 'open', entries: [entry], previewCache: cache});
    await act(async () => {await new Promise(resolve => setTimeout(resolve, 0));});
    // The second look costs nothing: the picture comes back from the browser, not the network.
    assert.deepEqual(fetched, ['https://example.test/a.png']);
    second.unmount();
});

test('a preview that cannot be fetched leaves the row exactly as it was', async () => {
    globalThis.fetch = async () => {
        throw new Error('offline');
    };
    const entry = referenceRow('a', {metadata: {name: 'A', banner: 'https://example.test/a.png'}});
    const view = render({mode: 'open', entries: [entry], previewCache: null});
    await act(async () => {await new Promise(resolve => setTimeout(resolve, 0));});
    assert.equal(view.host.querySelector('.twextsec-preview'), null);
    // The row is still readable and still answerable.
    assert.match(view.rowFor('a').textContent, /A/);
    view.click('twextsec-complete');
    assert.equal(view.answer.get('a').execution, 'sandboxed');
    view.unmount();
});

test('a row with no picture of its own still gets one, without touching the network', async () => {
    const fetched = [];
    globalThis.fetch = async url => {
        fetched.push(url);
        throw new Error('should not be called');
    };
    const view = render({mode: 'open', entries: [referenceRow('a', {metadata: {name: 'A'}})]});
    await act(async () => {await new Promise(resolve => setTimeout(resolve, 0));});
    const image = view.rowFor('a').querySelector('.twextsec-preview');
    // The fallback travels inside the bundle, so there is nothing to fetch or keep.
    assert.match(image.getAttribute('src'), /^data:image\/svg\+xml;base64,/);
    assert.deepEqual(fetched, []);
    view.unmount();
});
