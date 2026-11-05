const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {createExtensionWaitDialog} = require('../dist/index.cjs');

const fixture = () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
    return dom;
};
const shown = document => document.querySelector('[data-testid="twextsec-wait"]');
const settle = ms => new Promise(resolve => setTimeout(resolve, ms));

test('a wait shorter than the delay never opens a dialog', async () => {
    const dom = fixture();
    const dialog = createExtensionWaitDialog(dom.window.document, 'ja', {delayMs: 40});
    dialog.show({url: 'https://example.test/a.js', attempt: 2, attempts: 3});
    assert.equal(shown(dom.window.document), null);
    dialog.hide();
    await settle(80);
    // The shortest wait is one backoff; a dialog that flashed for it would be worse than nothing.
    assert.equal(shown(dom.window.document), null);
    dialog.dispose(); dom.window.close();
});

test('a wait that lasts opens a centred dialog naming the attempt and the source', async () => {
    const dom = fixture();
    const document = dom.window.document;
    const dialog = createExtensionWaitDialog(document, 'ja', {delayMs: 10});
    dialog.show({url: 'https://example.test/a.js', attempt: 2, attempts: 3});
    await settle(40);
    const element = shown(document);
    assert.equal(element.open, true);
    assert.match(element.textContent, /再試行しています（2\/3）/);
    assert.match(element.textContent, /https:\/\/example\.test\/a\.js/);
    assert.match(element.textContent, /開いていた作品に戻します/);
    // Neither button exists: closing would not stop the fetch, and stopping it has no rollback.
    assert.equal(element.querySelector('button'), null);
    dialog.show({url: 'https://example.test/a.js', attempt: 3, attempts: 3});
    assert.match(shown(document).textContent, /再試行しています（3\/3）/);
    dialog.hide();
    assert.equal(shown(document), null);
    dialog.dispose(); dom.window.close();
});

test('escape is refused, and disposal takes the dialog down and keeps it down', async () => {
    const dom = fixture();
    const document = dom.window.document;
    const dialog = createExtensionWaitDialog(document, 'en', {delayMs: 10});
    dialog.show({url: 'https://example.test/a.js', attempt: 2, attempts: 3});
    await settle(40);
    const element = shown(document);
    const cancel = new dom.window.Event('cancel', {cancelable: true});
    element.dispatchEvent(cancel);
    assert.equal(cancel.defaultPrevented, true);
    assert.equal(shown(document).open, true);
    assert.match(element.textContent, /Trying again \(2\/3\)/);
    dialog.dispose();
    assert.equal(shown(document), null);
    dialog.show({url: 'https://example.test/a.js', attempt: 2, attempts: 3});
    await settle(40);
    assert.equal(shown(document), null);
    dom.window.close();
});

test('the dialog brings its own styles, once per document', async () => {
    const dom = fixture();
    const document = dom.window.document;
    const first = createExtensionWaitDialog(document, 'en', {delayMs: 0});
    const second = createExtensionWaitDialog(document, 'en', {delayMs: 0});
    first.show({url: 'https://example.test/a.js', attempt: 2, attempts: 3});
    second.show({url: 'https://example.test/b.js', attempt: 2, attempts: 3});
    await settle(30);
    // A host that builds JavaScript only still gets a centred dialog, not an unstyled box.
    const injected = document.querySelectorAll('[data-twextsec-wait-style]');
    assert.equal(injected.length, 1);
    assert.match(injected[0].textContent, /\.twextsec-wait\{position:fixed/);
    first.dispose(); second.dispose(); dom.window.close();
});
