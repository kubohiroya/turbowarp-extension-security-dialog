// SPDX-License-Identifier: GPL-3.0-or-later
// From turbowarp-plus-editor/test/extension-host/load-errors.test.ts at e03bf25.
// The original test license is retained; see LICENSE.GPL-3.0 in this directory.
const test = require('node:test');
const assert = require('node:assert/strict');
const {describeExtensionLoadFailure, extensionLoadErrors} = require('../dist/load-errors.cjs');

test('the description names the extension and every cause', () => {
    // LoaderError passes {cause: undefined} to Error, which leaves an own property holding undefined.
    const cause = Object.assign(new Error('Sandbox extension did not register', {cause: undefined}),
        {code: 'REGISTRATION_TIMEOUT', extensionId: 'kubohiroyaassetcache'});
    const error = Object.assign(new Error('Extension load failed', {cause}),
        {name: 'LoaderError', code: 'LOAD_FAILED'});
    const described = describeExtensionLoadFailure(error);
    assert.equal(described.message, [
        'Extension kubohiroyaassetcache could not be loaded, so the project was not opened.',
        'LoaderError: Extension load failed [LOAD_FAILED]',
        '  Error: Sandbox extension did not register [REGISTRATION_TIMEOUT]'
    ].join('\n'));
    assert.equal(described.cause, error);
    assert.equal(described.stack, error.stack);
});

test('the description covers aggregate failures, unnamed extensions and cyclic causes', () => {
    const first = new Error('rollback failed');
    const error = new AggregateError([new Error('load failed'), first], 'Host could not restore registration state');
    first.cause = error;
    assert.equal(describeExtensionLoadFailure(error).message, [
        'An extension could not be loaded, so the project was not opened.',
        'AggregateError: Host could not restore registration state',
        '  Error: load failed',
        '  Error: rollback failed'
    ].join('\n'));
});

test('the host recognises loader refusals without treating failures as cancellation', () => {
    assert.equal(extensionLoadErrors.isCancelled({code: 'TRUST_DENIED'}), true);
    assert.equal(extensionLoadErrors.isCancelled({code: 'CANCELLED'}), true);
    assert.equal(extensionLoadErrors.isCancelled({code: 'FETCH_FAILED'}), false);
    assert.equal(extensionLoadErrors.isCancelled(null), false);
});
