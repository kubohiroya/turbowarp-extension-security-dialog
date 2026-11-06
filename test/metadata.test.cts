const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
    parseExtensionMetadata, getExtensionDescription, unsandboxedRequirement,
    decodeExtensionDataURL, loadExtensionInfo
} = require('../dist/index.cjs');

test('a declared email contact is shown without making it a code source', () => {
    assert.equal(parseExtensionMetadata('// Author URL: mailto:creator@example.test\nvoid 0;').authorURL,
        'mailto:creator@example.test');
    assert.equal(parseExtensionMetadata('/**\n * @authorURL mailto:creator@example.test\n */').authorURL,
        'mailto:creator@example.test');
    assert.equal(parseExtensionMetadata('// Author URL: javascript:alert(1)\nvoid 0;').authorURL, undefined);
});

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

// TurboWarp's own extensions, and the gallery's, describe themselves in a run of `//` lines.
const header = `// Name: Security bundle fixture
// ID: securityfixture
// Description: Review the enclosing bundle metadata.
// Description[ja]: 囲んでいるバンドルの情報を確認します。
// By: Fixture Author <https://scratch.mit.edu/users/fixture/>
// License: MPL-2.0
// Unsandboxed: required
// Bundled extensions:
// - Name: Nested fixture
//   Description: Nested description
//   By: Nested author
(function (Scratch) {
  // Name: not a header any more
  Scratch.extensions.register({});
})(Scratch);`;

test('a TurboWarp header of comment lines is read like the documented block', () => {
    const metadata = parseExtensionMetadata(header);
    assert.equal(metadata.name, 'Security bundle fixture');
    assert.equal(metadata.id, 'securityfixture');
    assert.equal(metadata.description, 'Review the enclosing bundle metadata.');
    assert.equal(metadata.descriptions.ja, '囲んでいるバンドルの情報を確認します。');
    assert.equal(metadata.author, 'Fixture Author <https://scratch.mit.edu/users/fixture/>');
    assert.equal(metadata.license, 'MPL-2.0');
    assert.equal(unsandboxedRequirement(metadata), 'required');
    assert.equal(getExtensionDescription(metadata, 'ja-JP'), '囲んでいるバンドルの情報を確認します。');
});

test('what a bundle says about its members, and comments past the header, are not the extension\'s own', () => {
    const metadata = parseExtensionMetadata(header);
    assert.notEqual(metadata.description, 'Nested description');
    assert.notEqual(metadata.author, 'Nested author');
    assert.equal(parseExtensionMetadata('Scratch.extensions.register({});\n// Name: Late').name, undefined);
});

test('a header line is a claim like any other: addresses are checked, long values dropped, the block wins', () => {
    const metadata = parseExtensionMetadata([
        '// Name: Header name', '// Repository: not a url', '// Docs URL: https://docs.test/',
        `// License: ${'x'.repeat(5000)}`, '/**', ' * @name Block name', ' */', 'Scratch.extensions.register({});'
    ].join('\n'));
    // The documented block is the more deliberate statement where both say something.
    assert.equal(metadata.name, 'Block name');
    assert.equal(metadata.repository, undefined);
    assert.equal(metadata.docsURL, 'https://docs.test/');
    assert.equal(metadata.license, undefined);
});

test('a data URL carrying a TurboWarp header is described without running it', async () => {
    const info = await loadExtensionInfo(`data:text/javascript,${encodeURIComponent(header)}`);
    assert.equal(info.metadata.name, 'Security bundle fixture');
});
