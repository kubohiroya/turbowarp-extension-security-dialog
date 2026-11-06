import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';

const sourcePaths = ['src', 'assets/common.svg', 'scripts', 'package.json', 'pnpm-lock.yaml',
    'tsconfig.json', 'README.md', 'README.ja.md', 'NOTICE.md', 'LICENSE'];

/** npm may prepare a pinned GitHub archive without a .git directory. */
export function readBuildSource(root: string, archiveRevision = process.env.TWEXTSEC_SOURCE_REVISION) {
    if (existsSync(path.join(root, '.git'))) {
        const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
        if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('A full source revision is required.');
        const changed = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--',
            ...sourcePaths], {cwd: root, encoding: 'utf8'}).trim();
        return {revision, sourceState: changed ? 'working-tree' : 'commit'};
    }
    // The installer must pass the same immutable SHA it pins in its manifest and lockfile.
    // Never borrow a parent repository's revision or pretend the archive is a clean checkout.
    if (!/^[a-f0-9]{40}$/.test(archiveRevision || '')) {
        throw new Error('A Git archive build requires a full TWEXTSEC_SOURCE_REVISION.');
    }
    return {revision: archiveRevision, sourceState: 'git-archive'};
}
