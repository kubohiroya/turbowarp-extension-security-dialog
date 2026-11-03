const {test} = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');

test('the public build info identifies the package and source revision', () => {
    const root = path.resolve(__dirname, '..');
    const manifest = require('../package.json');
    const info = require('@kubohiroya/turbowarp-extension-security-dialog/build-info');
    assert.equal(info.name, manifest.name);
    assert.equal(info.version, manifest.version);
    assert.match(info.revision, /^[a-f0-9]{40}$/);
    assert.equal(info.revision, execFileSync('git', ['rev-parse', 'HEAD'],
        {cwd: root, encoding: 'utf8'}).trim());
    assert.ok(['commit', 'working-tree'].includes(info.sourceState));
});
