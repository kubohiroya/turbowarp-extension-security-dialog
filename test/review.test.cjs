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
const cacheableRow = (key, extra) => row(key, {kind: 'remote-cacheable', url: `https://example.test/${key}.js`, sha256: 'a'.repeat(64)}, extra);

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
    const view = render({mode: 'open', entries: [cacheableRow('a'), cacheableRow('b')]});
    // Opening has no ticks: the project already names its extensions.
    assert.equal(view.host.querySelector('input[type="checkbox"]'), null);
    view.click('twextsec-cancel');
    assert.equal(view.answer, null);
    view.unmount();
});

test('a trusted row is stated, not asked about, and keeps its loading choice', () => {
    const view = render({
        mode: 'open',
        entries: [cacheableRow('vouched', {state: {trusted: true}})]
    });
    const row = view.rowFor('vouched');
    assert.match(row.textContent, /📕 In the catalog/);
    assert.equal(view.radio('vouched', 'execution', 'sandboxed'), null);
    assert.notEqual(view.radio('vouched', 'loading', 'remote-non-cacheable'), null);
    view.click('twextsec-complete');
    assert.deepEqual(view.answer.get('vouched'), {execution: 'unsandboxed', loading: 'remote-cacheable'});
    view.unmount();
});

test('a row the opener cannot change states how it loads instead of asking', () => {
    const view = render({
        mode: 'open',
        entries: [
            row('fixed', {kind: 'remote-non-cacheable', url: 'https://example.test/f.js', sha256: 'a'.repeat(64)}),
            row('carried', {kind: 'embedded-data', sha256: 'b'.repeat(64)})
        ]
    });
    assert.equal(view.radio('fixed', 'loading', 'remote-cacheable'), null);
    assert.match(view.rowFor('fixed').querySelector('.twextsec-loading-fixed').textContent,
        /Fetch each time/);
    assert.match(view.rowFor('carried').querySelector('.twextsec-loading-fixed').textContent,
        /as a data address/);
    // No row here has a copy to decline, so the bulk control offers no choice either.
    assert.equal(view.host.querySelector('input[name="loading-all"]'), null);
    view.click('twextsec-complete');
    assert.equal(view.answer.get('fixed').loading, 'remote-non-cacheable');
    assert.equal(view.answer.get('carried').loading, 'embedded-data');
    view.unmount();
});

test('adding offers all four forms, because adding is authoring', () => {
    const view = render({mode: 'add', entries: [catalogRow('a')]});
    for (const form of ['remote-cacheable', 'remote-non-cacheable', 'embedded-file', 'embedded-data']) {
        assert.notEqual(view.radio('a', 'loading', form), null, form);
        assert.notEqual(view.host.querySelector(`input[name="loading-all"][value="${form}"]`), null, form);
    }
    view.unmount();
});

test('a bulk choice reaches only the rows that have it to make', () => {
    const view = render({
        mode: 'open',
        entries: [cacheableRow('a'), cacheableRow('vouched', {state: {trusted: true}})]
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

test('a required row in a mixed batch still warns about sandboxed execution without blocking', () => {
    const view = render({
        mode: 'open',
        entries: [cacheableRow('a', {metadata: {unsandboxed: 'required', name: 'Needs it'}}), cacheableRow('ordinary')]
    });
    assert.match(view.rowFor('a').textContent, /says it needs to run without the sandbox/);
    assert.notEqual(view.rowFor('a').querySelector('.twextsec-contradiction'), null);
    view.click('twextsec-complete');
    assert.equal(view.answer.get('a').execution, 'sandboxed');
    view.unmount();
});

test('a row that failed to load says so, and the rest stay answerable', () => {
    const view = render({
        mode: 'open',
        entries: [cacheableRow('a', {state: {error: {code: 'DIGEST_MISMATCH', message: 'no match'}}}),
            cacheableRow('b')]
    });
    assert.equal(view.rowFor('a').getAttribute('data-failed'), 'true');
    assert.match(view.rowFor('a').textContent, /DIGEST_MISMATCH/);
    view.click('twextsec-complete');
    assert.deepEqual([...view.answer.keys()].sort(), ['a', 'b']);
    view.unmount();
});

test('without a failure the screen offers no retry and says nothing about the network', () => {
    const view = render({mode: 'open', entries: [cacheableRow('a')], onRetry: () => {}});
    assert.equal(view.host.querySelector('.twextsec-failed'), null);
    assert.equal(view.host.querySelector('[data-testid="twextsec-retry"]'), null);
    assert.doesNotMatch(view.host.textContent, /network problem/);
    view.unmount();
});

test('a failure worth retrying offers to try again, and the button asks the host', () => {
    let retried = 0;
    const view = render({
        mode: 'open',
        entries: [cacheableRow('a')],
        failure: {code: 'LOAD_FAILED', message: 'offline', retryable: true},
        onRetry: () => {retried++;}
    });
    const shown = view.host.querySelector('.twextsec-failed');
    assert.match(shown.textContent, /LOAD_FAILED offline/);
    assert.match(shown.textContent, /may be a network problem/);
    const button = view.host.querySelector('[data-testid="twextsec-retry"]');
    assert.equal(button.textContent, 'Try again');
    view.click('twextsec-retry');
    assert.equal(retried, 1);
    // Retrying is not an answer: the screen stays open and has completed nothing.
    assert.equal(view.answer, undefined);
    view.unmount();
});

test('the retry wording follows the locale', () => {
    const view = render({
        mode: 'open',
        locale: 'ja',
        entries: [cacheableRow('a')],
        failure: {code: 'TIMEOUT', message: 'slow', retryable: true},
        onRetry: () => {}
    });
    assert.match(view.host.textContent, /通信の問題の可能性があります/);
    assert.equal(view.host.querySelector('[data-testid="twextsec-retry"]').textContent, 'もう一度試す');
    view.unmount();
});

test('a retryable failure with nowhere to send the retry offers none', () => {
    const view = render({
        mode: 'open',
        entries: [cacheableRow('a')],
        failure: {code: 'TIMEOUT', message: 'slow', retryable: true}
    });
    assert.match(view.host.querySelector('.twextsec-failed').textContent, /TIMEOUT slow/);
    assert.equal(view.host.querySelector('[data-testid="twextsec-retry"]'), null);
    assert.doesNotMatch(view.host.textContent, /network problem/);
    view.unmount();
});

test('a failure not worth retrying is stated without any retry wording', () => {
    // The same code a dropped connection gives: the host's boolean decides, not the code.
    const view = render({
        mode: 'open',
        entries: [cacheableRow('a')],
        failure: {code: 'LOAD_FAILED', message: 'registered a different ID', retryable: false},
        onRetry: () => {}
    });
    assert.match(view.host.querySelector('.twextsec-failed').textContent,
        /LOAD_FAILED registered a different ID/);
    assert.equal(view.host.querySelector('[data-testid="twextsec-retry"]'), null);
    assert.doesNotMatch(view.host.textContent, /network problem|Try again/);
    view.unmount();
});

test('a row error follows the same rule as the whole-load failure', () => {
    let retried = 0;
    const view = render({
        mode: 'open',
        entries: [
            cacheableRow('a', {state: {error: {code: 'FETCH_FAILED', message: '503', retryable: true}}}),
            cacheableRow('b', {state: {error: {code: 'FETCH_FAILED', message: '404', retryable: false}}}),
            cacheableRow('c', {state: {error: {code: 'TRUST_DENIED', message: 'no'}}})
        ],
        onRetry: () => {retried++;}
    });
    const retryIn = key => view.rowFor(key).querySelector('[data-testid="twextsec-retry"]');
    assert.notEqual(retryIn('a'), null);
    assert.match(view.rowFor('a').textContent, /may be a network problem/);
    assert.equal(retryIn('b'), null);
    assert.equal(retryIn('c'), null);
    assert.doesNotMatch(view.rowFor('b').textContent + view.rowFor('c').textContent, /network problem/);
    act(() => {Simulate.click(retryIn('a'));});
    assert.equal(retried, 1);
    view.unmount();
});

for (const locale of ['en', 'ja']) {
    for (const mode of ['add', 'open']) {
        test(`${locale}/${mode}: absent and null failures preserve the original markup`, () => {
            const props = {mode, locale, entries: [cacheableRow('a')]};
            const original = render(props);
            const markup = original.host.innerHTML;
            original.unmount();
            for (const failure of [undefined, null]) {
                const view = render({...props, failure, onRetry: () => assert.fail('Unexpected retry')});
                assert.equal(view.host.innerHTML, markup);
                view.unmount();
            }
        });

        for (const retryable of [true, false, undefined]) {
            test(`${locale}/${mode}: message-only failure with retryable=${retryable}`, () => {
                let retries = 0;
                const failure = {message: locale === 'ja' ? '取得できませんでした' : 'Could not fetch'};
                if (retryable !== undefined) failure.retryable = retryable;
                const view = render({mode, locale, entries: [cacheableRow('a')], failure,
                    onRetry: () => {retries++;}});
                const alert = view.host.querySelector('[role="alert"]');
                assert.ok(alert.textContent.includes(failure.message));
                assert.equal(view.rowFor('a').querySelector('.twextsec-failed'), null);
                const button = alert.querySelector('[data-testid="twextsec-retry"]');
                const note = alert.querySelector('.twextsec-retry-note');
                if (retryable === true) {
                    assert.equal(button.textContent, locale === 'ja' ? 'もう一度試す' : 'Try again');
                    assert.equal(note.textContent, locale === 'ja' ?
                        '通信の問題の可能性があります。' : 'This may be a network problem.');
                    view.click('twextsec-retry');
                    assert.equal(retries, 1);
                    assert.equal(view.answer, undefined);
                } else {
                    assert.equal(button, null);
                    assert.equal(note, null);
                    assert.equal(retries, 0);
                }
                view.unmount();
            });
        }
    }
}

test('the creator name is shown as the extension own claim', () => {
    const view = render({
        mode: 'open',
        entries: [cacheableRow('a', {metadata: {author: 'Someone'}})]
    });
    assert.match(view.rowFor('a').textContent, /Someone/);
    assert.match(view.rowFor('a').textContent, /not verified/);
    view.unmount();
});

test('opening uses the frame the host supplies, and adding renders in place', () => {
    const Frame = props => React.createElement('div', {'data-testid': 'frame'}, props.children);
    const opened = render({mode: 'open', entries: [cacheableRow('a')], DialogFrame: Frame});
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
    const entry = cacheableRow('a', {metadata: {name: 'A', banner: 'https://example.test/a.png'}});
    const first = render({mode: 'open', entries: [entry], previewCache: cache});
    await act(async () => {await new Promise(resolve => setTimeout(resolve, 0));});
    assert.equal(first.host.querySelector('.twextsec-preview').getAttribute('src'), 'blob:preview');
    assert.equal(first.host.querySelector('.twextsec-preview').className, 'twextsec-preview');
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
    const entry = cacheableRow('a', {metadata: {name: 'A', banner: 'https://example.test/a.png'}});
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
    const view = render({mode: 'open', entries: [cacheableRow('a', {metadata: {name: 'A'}})]});
    await act(async () => {await new Promise(resolve => setTimeout(resolve, 0));});
    const image = view.rowFor('a').querySelector('.twextsec-preview');
    // The fallback travels inside the bundle, so there is nothing to fetch or keep.
    assert.match(image.getAttribute('src'), /^data:image\/svg\+xml;base64,/);
    // It is only an icon, so it is drawn at icon size rather than as a banner.
    assert.equal(image.className, 'twextsec-preview twextsec-preview-fallback');
    assert.deepEqual(fetched, []);
    view.unmount();
});

test('a row whose address carries the whole extension says so instead of printing it', () => {
    const bundle = `data:application/javascript;base64,${'QQ'.repeat(4000)}`;
    const view = render({
        mode: 'open',
        entries: [{key: bundle, ids: ['inline'], source: {kind: 'legacy', url: bundle}}]
    });
    const label = view.rows()[0].querySelector('.twextsec-source').textContent;
    // Printing the address would put the whole bundle in the row.
    assert.equal(label, 'Written into the project as a data address');
    assert.ok(!label.includes('base64'));
    view.unmount();
});

test('all-required opening batches show one preset execution choice in both languages, while caching stays independent', () => {
    for (const locale of ['ja', 'en']) {
        const entries = [cacheableRow('a'),
            row('b', {kind: 'embedded-data', url: 'data:text/javascript,unused'})]
            .map(entry => ({...entry, metadata: {unsandboxed: 'required'}}));
        let instance;
        const view = render({mode: 'open', locale, entries, ref: value => {instance = value;}});
        assert.equal(view.host.querySelector('input[name="execution-all"]'), null);
        assert.equal(view.host.querySelectorAll('input[name^="execution-"]').length, 2);
        for (const key of ['a', 'b']) assert.equal(view.radio(key, 'execution', 'unsandboxed').checked, true);
        assert.match(view.host.querySelector('.twextsec-intro').textContent,
            locale === 'ja' ? /選択済み/ : /already selected/);
        assert.equal(view.answer, undefined);
        act(() => {
            instance.handleBulkExecution({target: {value: 'deny'}});
            instance.decide('a', {execution: 'sandboxed'});
        });
        assert.equal(view.radio('a', 'execution', 'unsandboxed').checked, true);
        const cache = view.radio('a', 'loading', 'remote-non-cacheable');
        act(() => {cache.checked = true; Simulate.change(cache);});
        assert.equal(view.radio('a', 'execution', 'unsandboxed').checked, true);
        view.click('twextsec-complete');
        assert.deepEqual(view.answer.get('a'), {execution: 'unsandboxed', loading: 'remote-non-cacheable'});
        view.unmount();
        const cancel = render({mode: 'open', locale, entries});
        cancel.click('twextsec-cancel');
        assert.equal(cancel.answer, null);
        cancel.unmount();
    }
});

test('an embedded all-required batch has no bulk controls and still waits for OK', () => {
    const view = render({mode: 'open', entries: [row('a', {kind: 'embedded-file'},
        {metadata: {unsandboxed: 'required'}})]});
    assert.equal(view.host.querySelector('.twextsec-bulk'), null);
    assert.equal(view.answer, undefined);
    view.click('twextsec-complete');
    assert.equal(view.answer.get('a').execution, 'unsandboxed');
    view.unmount();
});

test('late descriptions preset only once the whole batch is required, without executing it', async () => {
    const pending = new Map();
    const view = render({mode: 'open', entries: [cacheableRow('a'), cacheableRow('b')],
        loadInfo: url => new Promise(resolve => pending.set(url, resolve))});
    assert.equal(view.radio('a', 'execution', 'sandboxed').checked, true);
    await act(async () => {pending.get('https://example.test/a.js')({metadata: {unsandboxed: 'required'}});});
    assert.equal(view.radio('a', 'execution', 'sandboxed').checked, true);
    await act(async () => {pending.get('https://example.test/b.js')({metadata: {unsandboxed: 'required'}});});
    assert.equal(view.host.querySelector('input[value="deny"]'), null);
    assert.equal(view.host.querySelector('input[name="execution-all"]'), null);
    assert.equal(view.radio('a', 'execution', 'unsandboxed').checked, true);
    assert.equal(view.radio('b', 'execution', 'unsandboxed').checked, true);
    assert.equal(view.answer, undefined);
    view.unmount();
});

test('a row says its ID once: beside its name, or as the heading when it has none', async () => {
    const view = render({mode: 'open', entries: [
        cacheableRow('a', {metadata: {name: 'A'}}), cacheableRow('b', {metadata: {}})
    ]});
    assert.equal(view.rowFor('a').querySelector('.twextsec-id').textContent, 'a');
    assert.equal(view.rowFor('b').querySelector('strong').textContent, 'b');
    assert.equal(view.rowFor('b').querySelector('.twextsec-id'), null);
    view.unmount();
});
