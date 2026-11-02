const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
    parseExtensionMetadata, getExtensionDescription, unsandboxedRequirement
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
