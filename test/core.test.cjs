const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseExtensionMetadata, decodeExtensionDataURL, getPreviewCandidates, getGitHubRepository} =
    require('../dist/index.cjs');
const {installBatchExtensionLoader, isExtensionSecurityCancelled} = require('../dist/turbowarp.cjs');
const {projectFingerprint, fingerprint, restoreChoices, encodeChoices, readPreferences, writePreferences} =
    require('../dist/index.cjs');

function fixture(review, preferences) {
    const modes = [];
    const starts = [];
    const security = {getSandboxMode: () => 'legacy'};
    const manager = {securityManager: security, isExtensionLoaded: () => false,
        isBuiltinExtension: id => id === 'pen', loadExtensionIdSync: id => starts.push(id),
        getExtensionURLs: () => ({existing: 'https://existing.test/e.js'}),
        loadExtensionURL: async url => {starts.push(url); modes.push([url, security.getSandboxMode(url)]);}};
    const vm = {extensionManager: manager, clear: () => {}, _loadExtensions: () => 'legacy',
        loadProject: function(input) {this.clear(); return this._loadExtensions(input.ids, input.urls);}};
    const restore = installBatchExtensionLoader(vm, review, {defaulted: 'https://default.test/e.js'}, preferences);
    return {vm, manager, security, restore, starts, modes};
}

test('metadata is read from header comments without executing the source', () => {
    globalThis.securitySourceExecuted = false;
    const source = '// Name: 紙芝居\n// Author: Someone\n// Version: 1\n// Banner: ./banner.png\n' +
        'globalThis.securitySourceExecuted = true;\n// Name: injected';
    assert.deepEqual(parseExtensionMetadata(source), {name:'紙芝居',author:'Someone',version:'1',banner:'./banner.png'});
    assert.equal(globalThis.securitySourceExecuted, false);
    assert.equal(decodeExtensionDataURL(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`), source);
    assert.equal(decodeExtensionDataURL(`data:text/javascript,${encodeURIComponent(source)}`), source);
});

test('updated time is declarative optional metadata, retaining the author-provided value', () => {
    for (const key of ['Updated','Updated at','Updated-at','Last updated','Last-updated','Last modified','Last-modified','UpdatedAt']) {
        assert.deepEqual(parseExtensionMetadata(`// ${key}: 2026-10-19T10:30:00+09:00\nvoid 0;`),
            {updatedAt:'2026-10-19T10:30:00+09:00'});
    }
    assert.deepEqual(parseExtensionMetadata('// Version: 1\nvoid 0;\n// Updated: injected'),{version:'1'});
});

test('bundled notices retain the enclosing extension metadata and author alias', () => {
    const source = '// Name: Kamishibai DSL 4.0 Runtime\n' +
        '// ID: kubohiroyakamishibai4\n// Description: Static bundle of 8 TurboWarp extensions.\n' +
        '// By: Hiroya Kubo\n// License: See the bundled extension notices below.\n' +
        '// Unsandboxed: required\n//\n// Bundled extensions:\n' +
        '// - Name: Asset Cache\n//   ID: assetcache\n//   Description: Nested description\n' +
        '//   Author: Nested author\n//   License: MPL-2.0\n//   Unsandboxed: optional\nvoid 0;';
    assert.deepEqual(parseExtensionMetadata(source), {
        name:'Kamishibai DSL 4.0 Runtime', id:'kubohiroyakamishibai4',
        description:'Static bundle of 8 TurboWarp extensions.', author:'Hiroya Kubo',
        license:'See the bundled extension notices below.', unsandboxed:'required'
    });
});

test('real image candidates prefer a gallery banner, then declared banner and GitHub, then common artwork', () => {
    const entry = {url:'https://cdn.jsdelivr.net/gh/owner/repository@v1/extension.js', banner:'https://gallery.test/banner.png'};
    assert.deepEqual(getPreviewCandidates(entry, {banner:'./header.png'}, '/common.svg'), [
        'https://gallery.test/banner.png', 'https://cdn.jsdelivr.net/gh/owner/repository@v1/header.png',
        'https://opengraph.githubassets.com/extension-security/owner/repository', '/common.svg'
    ]);
    assert.equal(getGitHubRepository('https://github.com/owner/repository.git'), 'owner/repository');
    assert.equal(getGitHubRepository('https://github.com.evil.test/owner/repository'), null);
    assert.deepEqual(getPreviewCandidates({url:'data:text/javascript,hello'}, {banner:'javascript:alert(1)'}, '/common.svg'), ['/common.svg']);
});

test('all extension decisions are collected before any code starts; duplicate URLs load once', async () => {
    let accept;
    let entries;
    const f = fixture(value => {entries = value; return new Promise(resolve => {accept = resolve;});});
    const pending = f.vm._loadExtensions(['a','b','alias','pen','defaulted'], new Map([
        ['a','https://a.test/e.js'],['b','https://b.test/e.js'],['alias','https://a.test/e.js']
    ]));
    await Promise.resolve();
    assert.deepEqual(f.starts, []);
    assert.deepEqual(entries[0].ids, ['a','alias']);
    accept(new Map(entries.map(entry => [entry.url, entry.ids[0] === 'a' ? 'unsandboxed' : 'deny'])));
    await pending;
    assert.deepEqual(f.starts, ['pen','https://a.test/e.js']);
    assert.deepEqual(f.modes, [['https://a.test/e.js','unsandboxed']]);
    assert.equal(f.security.getSandboxMode('https://a.test/e.js'), 'legacy');
    assert.equal(f.manager.getExtensionURLs().b, 'https://b.test/e.js');
    f.vm.clear();
    assert.equal(f.manager.getExtensionURLs().b, undefined);
    f.restore();
    assert.equal(f.vm._loadExtensions(), 'legacy');
});

test('refusing every extension continues, cancellation starts no code, and partial decisions fail closed', async () => {
    for (const decision of ['deny', null, 'missing']) {
        const f = fixture(entries => decision === null ? null : new Map(decision === 'missing' ? [] : entries.map(e => [e.url,decision])));
        const pending = f.vm._loadExtensions(['a'], new Map([['a','https://a.test/e.js']]));
        if (decision === null) await assert.rejects(pending, isExtensionSecurityCancelled);
        else if (decision === 'missing') await assert.rejects(pending, /decision is missing/);
        else await pending;
        assert.deepEqual(f.starts, []);
        f.restore();
    }
});

test('parallel allowed loads finish or fail before their sandbox mode scope is released', async () => {
    const f = fixture(entries => new Map(entries.map(e => [e.url,'sandboxed'])));
    let finish;
    const started = [];
    f.manager.loadExtensionURL = async url => {
        started.push(url);
        assert.equal(f.security.getSandboxMode(url), 'iframe');
        if (url.includes('a.test')) throw new Error('load failed');
        await new Promise(resolve => {finish = resolve;});
        assert.equal(f.security.getSandboxMode(url), 'iframe');
    };
    const pending = f.vm._loadExtensions(['a','b'], new Map([['a','https://a.test/e.js'],['b','https://b.test/e.js']]));
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    assert.equal(started.length, 2);
    finish();
    await assert.rejects(pending, /load failed/);
    assert.equal(f.security.getSandboxMode('https://b.test/e.js'), 'legacy');
    f.restore();
});

test('project keys ignore ZIP/build bookkeeping but distinguish same-name projects and extension changes', async () => {
    const project = {targets:[],extensions:['a'],extensionURLs:{a:'https://a.test/1.js'},meta:{agent:'old'}};
    const key = await projectFingerprint(project);
    assert.equal(key, await projectFingerprint({meta:{agent:'new'},extensionURLs:project.extensionURLs,extensions:['a'],targets:[]}));
    assert.notEqual(key, await projectFingerprint({...project, targets:[{name:'other project'}]}));
    assert.notEqual(key, await projectFingerprint({...project, extensionURLs:{a:'https://a.test/2.js'}}));
    const JSZip = require('@turbowarp/jszip');
    const zip = new JSZip().file('project.json', JSON.stringify(project));
    assert.equal(key, await projectFingerprint(await zip.generateAsync({type:'uint8array'})));
});

test('preferences hash extension URLs and restore defaults only for matching extensions', async () => {
    const decisions = new Map([['data:text/javascript,source','unsandboxed'], ['https://b.test/e.js','deny']]);
    const encoded = await encodeChoices(decisions);
    assert.equal(JSON.stringify(encoded).includes('source'), false);
    const restored = await restoreChoices([{url:'data:text/javascript,source'}, {url:'https://new.test/e.js'}], encoded);
    assert.equal(restored.get('data:text/javascript,source'), 'unsandboxed');
    assert.equal(restored.get('https://new.test/e.js'), undefined);
    assert.equal(encoded[await fingerprint('https://b.test/e.js')], 'deny');
});

test('only successfully opened projects save confirmed choices; cancellation and load failure do not overwrite defaults', async () => {
    const saved = [];
    const preferences = {projectFingerprint: async () => 'project-a', readPreferences: async () => ({saved:true}),
        restoreChoices: async (entries, value) => {assert.equal(value.saved,true); return new Map(entries.map(e=>[e.url,'sandboxed']));},
        encodeChoices: async value => Object.fromEntries(value), writePreferences: async (...args) => saved.push(args)};
    let cancel = false;
    const f = fixture((entries, defaults) => {assert.equal(defaults.get(entries[0].url),'sandboxed'); return cancel ? null : new Map(entries.map(e=>[e.url,'deny']));}, preferences);
    const input = {ids:['a'], urls:new Map([['a','https://a.test/e.js']])};
    await f.vm.loadProject(input);
    assert.deepEqual(saved, [['project-a', {'https://a.test/e.js':'deny'}]]);
    cancel = true;
    await assert.rejects(f.vm.loadProject(input), isExtensionSecurityCancelled);
    assert.equal(saved.length,1);
    f.restore();
});

test('unavailable IndexedDB is nonfatal', async () => {
    assert.deepEqual(await readPreferences('key'), {});
    assert.equal(await writePreferences('key', {}), false);
});

test('localized descriptions are declarative and cannot leak from bundled member notices', () => {
    const {getExtensionDescription} = require('../dist/index.cjs');
    const metadata = parseExtensionMetadata('// Name: Bundle\n// Description: Default\n' +
        '// Description[JA]: 日本語\n// Description[ja]: ignored duplicate\n' +
        '// Description[ja-JP]: 日本向け\n// Description[bad_locale]: ignored\n' +
        '// Description[de]: \n// Bundled extensions:\n// - Name: Nested\n' +
        '//   Description[fr]: Nested French\n// Description[en]: Nested English\n' +
        'throw new Error("Do not execute");\n// Description[es]: Code comment');
    assert.deepEqual(metadata, {name:'Bundle',description:'Default',descriptions:{ja:'日本語','ja-jp':'日本向け'}});
    assert.equal(getExtensionDescription(metadata,'JA-jp'),'日本向け');
    assert.equal(getExtensionDescription(metadata,'ja-Hira'),'日本語');
    for (const locale of ['en','fr','de','es','bad_locale',undefined,null,{}]) {
        assert.equal(getExtensionDescription(metadata,locale),'Default');
    }
    assert.equal(getExtensionDescription({},'ja'),'');
    assert.equal(getExtensionDescription({description:'Legacy'},'ja'),'Legacy');
});

test('localized descriptions also support block-comment headers and embedded source URLs', () => {
    const source = '/*\n * Description: English\n * Description[ja]: 日本語\n */\nthrow 0;';
    const {getExtensionDescription} = require('../dist/index.cjs');
    const metadata = parseExtensionMetadata(decodeExtensionDataURL('data:text/javascript;base64,' + Buffer.from(source).toString('base64')));
    assert.equal(getExtensionDescription(metadata,'ja-JP'),'日本語');
    assert.equal(getExtensionDescription(metadata,'en-US'),'English');
    assert.deepEqual(parseExtensionMetadata('//   Description[ja]: Nested notice\nvoid 0;'),{});
});
