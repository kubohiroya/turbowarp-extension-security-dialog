const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
    parseExtensionMetadata, getExtensionDescription, unsandboxedRequirement,
    decodeExtensionDataURL, loadExtensionInfo
} = require('../dist/index.cjs');

const source = `/**
 * @name Example
 * @id exampleid
 * @author Someone
 * @description An example extension
 * @description ja 例の拡張
 * @version 1.2.3
 * @unsandboxed required
 * @authorURL http://creator.test/
 * @repository https://example.test/repo
 * @docsURL not a url
 */
Scratch.extensions.register({});`;

test('an extension describes itself in text, and nothing here runs it', () => {
    const metadata = parseExtensionMetadata(source);
    assert.equal(metadata.name, 'Example');
    assert.equal(metadata.version, '1.2.3');
    assert.equal(metadata.description, 'An example extension');
    assert.equal(metadata.descriptions.ja, '例の拡張');
    assert.equal(metadata.authorURL, 'http://creator.test/');
    assert.equal(metadata.repository, 'https://example.test/repo');
    // A malformed address is dropped rather than shown as if it were one.
    assert.equal(metadata.docsURL, undefined);
    assert.deepEqual(parseExtensionMetadata('no comment here'), {});
});

test('the description follows the reader, falling back by language then default', () => {
    const metadata = parseExtensionMetadata(source);
    assert.equal(getExtensionDescription(metadata, 'ja'), '例の拡張');
    assert.equal(getExtensionDescription(metadata, 'ja-JP'), '例の拡張');
    assert.equal(getExtensionDescription(metadata, 'fr'), 'An example extension');
    assert.equal(getExtensionDescription({}, 'ja'), '');
});

test('the sandbox claim is read as a claim, with anything unrecognised left unknown', () => {
    assert.equal(unsandboxedRequirement({unsandboxed: 'Required'}), 'required');
    assert.equal(unsandboxedRequirement({unsandboxed: 'optional'}), 'optional');
    assert.equal(unsandboxedRequirement({unsandboxed: 'no'}), 'not-needed');
    assert.equal(unsandboxedRequirement({unsandboxed: 'perhaps'}), 'unknown');
    assert.equal(unsandboxedRequirement({}), 'unknown');
});

// A project may carry the extension itself as a data: URL so stock TurboWarp can open it. The
// bytes are already in hand, so the row's description must still be readable without a fetch.
test('an extension carried as a data URL is read without the network, base64 or not', async () => {
    const text = '/**\n * @name Inline\n * @description Carried inline\n */';
    const base64 = `data:application/javascript;base64,${Buffer.from(text, 'utf8').toString('base64')}`;
    const percent = `data:application/javascript,${encodeURIComponent(text)}`;
    assert.equal(decodeExtensionDataURL(base64), text);
    assert.equal(decodeExtensionDataURL(percent), text);
    for (const url of [base64, percent]) {
        const info = await loadExtensionInfo(url, new AbortController().signal);
        assert.equal(info.source, text);
        assert.equal(info.metadata.name, 'Inline');
        assert.equal(getExtensionDescription(info.metadata, 'en'), 'Carried inline');
    }
    assert.throws(() => decodeExtensionDataURL('data:application/javascript'), /Not a data URL/u);
});

test('a data URL already decoded is dropped when the request is abandoned', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        loadExtensionInfo('data:application/javascript,void%200', controller.signal), /aborted/u);
});
