const {test} = require('node:test');
const assert = require('node:assert/strict');
const {installBatchExtensionLoader, isExtensionSecurityCancelled} = require('../dist/turbowarp.cjs');

function fakeVM({builtins = [], loaded = []} = {}) {
    const calls = [];
    const known = new Set(loaded);
    const vm = {
        extensionManager: {
            securityManager: {getSandboxMode: () => 'worker'},
            isExtensionLoaded: id => known.has(id),
            isBuiltinExtension: id => builtins.includes(id),
            loadExtensionIdSync: id => calls.push(['builtin', id]),
            getExtensionURLs: () => ({existing: 'https://example.test/existing.js'}),
            async loadExtensionURL(url) {
                calls.push(['url', url, vm.extensionManager.securityManager.getSandboxMode(url)]);
            }
        },
        clear: () => calls.push(['clear']),
        loadProject: async input => {
            calls.push(['project', input]);
            return vm._loadExtensions(new Set(vm.pending || []), vm.pendingURLs || new Map());
        },
        _loadExtensions: async () => calls.push(['original'])
    };
    return {vm, calls, manager: vm.extensionManager, security: vm.extensionManager.securityManager};
}

const answerAll = decision => async entries =>
    new Map(entries.map(entry => [entry.key, decision]));

test('every extension is asked about together, and the chosen mode reaches the load', async () => {
    const {vm, calls} = fakeVM();
    let asked = null;
    const uninstall = installBatchExtensionLoader(vm, async entries => {
        asked = entries;
        return new Map(entries.map(entry => [entry.key, {execution: 'unsandboxed'}]));
    }, {known: 'https://example.test/known.js'});
    await vm._loadExtensions(new Set(['a', 'known']), new Map([['a', 'https://example.test/a.js']]));
    assert.deepEqual(asked.map(entry => entry.source.url).sort(),
        ['https://example.test/a.js', 'https://example.test/known.js']);
    // The mode chosen for the batch is what the VM sees while that batch loads.
    assert.deepEqual(calls.filter(call => call[0] === 'url').map(call => call[2]), ['unsandboxed', 'unsandboxed']);
    uninstall();
});

test('a refused extension is not loaded, and keeps its address for saving', async () => {
    const {vm, manager} = fakeVM();
    const uninstall = installBatchExtensionLoader(vm, answerAll({execution: 'deny'}), {});
    await vm._loadExtensions(new Set(['a']), new Map([['a', 'https://example.test/a.js']]));
    assert.equal(manager.getExtensionURLs().a, 'https://example.test/a.js');
    assert.equal(manager.getExtensionURLs().existing, 'https://example.test/existing.js');
    vm.clear();
    assert.equal(manager.getExtensionURLs().a, undefined);
    uninstall();
});

test('saying no cancels the load and is told apart from a fault', async () => {
    const {vm, calls} = fakeVM();
    const uninstall = installBatchExtensionLoader(vm, async () => null, {});
    await assert.rejects(
        vm._loadExtensions(new Set(['a']), new Map([['a', 'https://example.test/a.js']])),
        error => isExtensionSecurityCancelled(error));
    assert.equal(calls.some(call => call[0] === 'url'), false);
    uninstall();
});

test('the batch mode does not outlive the batch', async () => {
    const {vm, security} = fakeVM();
    const uninstall = installBatchExtensionLoader(vm, answerAll({execution: 'unsandboxed'}), {});
    await vm._loadExtensions(new Set(['a']), new Map([['a', 'https://example.test/a.js']]));
    // A later load must ask again rather than inherit what the last batch chose.
    assert.equal(security.getSandboxMode('https://example.test/a.js'), 'worker');
    uninstall();
});

test('rows the host collects are asked about but loaded by the host, not here', async () => {
    const {vm, calls} = fakeVM();
    let handed = null;
    const plus = {key: 'plusid', ids: ['plusid'],
        source: {kind: 'remote-cacheable', url: 'https://example.test/plus.js', sha256: 'a'.repeat(64)}};
    const uninstall = installBatchExtensionLoader(vm, answerAll({execution: 'sandboxed', loading: 'remote-cacheable'}),
        {}, null, {collectEntries: async () => [plus], applyDecisions: value => {handed = value;}});
    vm.pending = ['a'];
    vm.pendingURLs = new Map([['a', 'https://example.test/a.js']]);
    await vm.loadProject('bytes');
    assert.deepEqual([...handed.keys()].sort(), ['https://example.test/a.js', 'plusid']);
    // The Loader owns the Plus row, so this module loads only the ordinary one.
    assert.deepEqual(calls.filter(call => call[0] === 'url').map(call => call[1]),
        ['https://example.test/a.js']);
    uninstall();
});

test('a project of trusted rows opens without putting a question', async () => {
    const {vm, calls} = fakeVM();
    let asked = 0;
    const trusted = {key: 'vouched', ids: ['vouched'], state: {trusted: true},
        source: {kind: 'remote-cacheable', url: 'https://example.test/v.js', sha256: 'a'.repeat(64)}};
    const uninstall = installBatchExtensionLoader(vm, async () => {
        asked++;
        return null;
    }, {}, null, {collectEntries: async () => [trusted]});
    vm.pending = [];
    vm.pendingURLs = new Map();
    await vm.loadProject('bytes');
    assert.equal(asked, 0);
    assert.equal(calls.some(call => call[0] === 'url'), false);
    uninstall();
});

test('what the opener decided is remembered per project, and a storage failure is not an error', async () => {
    const {vm} = fakeVM();
    const written = new Map();
    const storage = {
        fallbackLoading: 'remote-cacheable',
        read: async () => new Map(),
        write: async (key, decisions) => {
            written.set(key, decisions);
            return true;
        }
    };
    const uninstall = installBatchExtensionLoader(vm, answerAll({execution: 'sandboxed'}), {}, storage,
        {identify: async () => 'project-1'});
    vm.pending = ['a'];
    vm.pendingURLs = new Map([['a', 'https://example.test/a.js']]);
    await vm.loadProject('bytes');
    assert.equal(written.get('project-1').get('https://example.test/a.js').execution, 'sandboxed');

    const failing = {...storage, write: async () => {
        throw new Error('no storage');
    }};
    const second = fakeVM();
    const stop = installBatchExtensionLoader(second.vm, answerAll({execution: 'sandboxed'}), {}, failing,
        {identify: async () => 'project-2'});
    second.vm.pending = ['a'];
    second.vm.pendingURLs = new Map([['a', 'https://example.test/a.js']]);
    await second.vm.loadProject('bytes');
    stop();
    uninstall();
});

test('uninstalling puts the VM back as it was', async () => {
    const {vm, security, manager} = fakeVM();
    const before = {load: vm._loadExtensions, mode: security.getSandboxMode,
        urls: manager.getExtensionURLs, clear: vm.clear, project: vm.loadProject};
    const uninstall = installBatchExtensionLoader(vm, answerAll({execution: 'sandboxed'}), {});
    assert.notEqual(vm._loadExtensions, before.load);
    uninstall();
    assert.equal(vm._loadExtensions, before.load);
    assert.equal(security.getSandboxMode, before.mode);
    assert.equal(manager.getExtensionURLs, before.urls);
    assert.equal(vm.clear, before.clear);
    assert.equal(vm.loadProject, before.project);
});
