const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

test('build provenance uses its own checkout, and requires an explicit pin for an archive', async () => {
    const {readBuildSource} = await import('../scripts/build-source.mjs');
    const root = path.resolve(__dirname, '..');
    const expected = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
    assert.equal(readBuildSource(root, 'a'.repeat(40)).revision, expected);
    await fs.mkdir(path.join(root, 'dist'), {recursive: true});
    const archive = await fs.mkdtemp(path.join(root, 'dist', 'archive-source-'));
    try {
        for (const invalid of ['', 'main', 'a'.repeat(39), 'g'.repeat(40)]) {
            assert.throws(() => readBuildSource(archive, invalid), /full TWEXTSEC_SOURCE_REVISION/);
        }
        assert.deepEqual(readBuildSource(archive, 'b'.repeat(40)),
            {revision: 'b'.repeat(40), sourceState: 'git-archive'});
    } finally {
        await fs.rm(archive, {recursive: true, force: true});
    }
});
