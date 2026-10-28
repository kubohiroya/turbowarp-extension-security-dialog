const {test} = require('node:test');
const assert = require('node:assert/strict');
const {resolveExtensionSelection, parseExtensionCatalog, loadExtensionCatalog} = require('../dist/index.cjs');
const entries = [
    {id:'a', dependencies:['b','c']}, {id:'b', dependencies:['d']},
    {id:'c', dependencies:['d']}, {id:'d', dependencies:[]}, {id:'e', dependencies:['d']}
];
test('transitive and shared dependencies stay locked until every parent is removed', () => {
    let state=resolveExtensionSelection(entries,['a','e']);
    assert.deepEqual([...state.selected],['d','b','c','a','e']);
    assert.deepEqual([...state.required],['b','d','c']);
    assert.deepEqual(state.ordered.map(e=>e.id),['d','b','c','a','e']);
    state=resolveExtensionSelection(entries,['e']);
    assert.deepEqual([...state.selected],['d','e']);
    assert.deepEqual([...state.required],['d']);
    assert.equal(resolveExtensionSelection(entries).selected.size,0);
    assert.deepEqual(resolveExtensionSelection(entries,['a'],['d']).ordered.map(e=>e.id),['b','c','a']);
    assert.ok(resolveExtensionSelection(entries,['a','d']).required.has('d'));
});
test('missing, duplicate and cyclic dependencies cannot produce a load order', () => {
    assert.throws(()=>resolveExtensionSelection([{id:'a',dependencies:['b']}],['a']),/Missing/);
    assert.throws(()=>resolveExtensionSelection([{id:'a'},{id:'a'}]),/Duplicate/);
    assert.throws(()=>resolveExtensionSelection([{id:'a',dependencies:['b']},{id:'b',dependencies:['a']}],['a']),/Cyclic/);
});
const item = id => ({id,name:id,version:'1.2.3',url:`https://cdn.example/${id}.js`,dependencies:[]});
test('Pages contract validates dependency references, URL scheme, schema and duplicate IDs', () => {
    const parse=extensions=>parseExtensionCatalog({schemaVersion:1,extensions});
    const a={...item('a'),dependencies:['b'],descriptions:{ja:'日本語'},unsandboxed:'required'};
    const result=parse([a,item('b')]);
    assert.equal(result[0].metadata.descriptions.ja,'日本語');
    assert.deepEqual(result[0].dependencies,['b']);
    assert.throws(()=>parse([a]),/Missing/);
    assert.throws(()=>parse([item('a'),{...item('a'),url:'https://other.example/a.js'}]),/Duplicate/);
    assert.throws(()=>parse([{...item('a'),url:'http://example/a.js'}]),/HTTPS/);
    assert.throws(()=>parse([{...item('a'),url:'javascript:alert(1)'}]),/HTTPS/);
    assert.throws(()=>parseExtensionCatalog({schemaVersion:2,extensions:[]}),/Unsupported/);
    for (const id of [undefined,null,42,{},'bad-id','']) {
        assert.throws(()=>parse([{...item('a'),id}]),/Invalid/);
    }
    assert.throws(()=>parse([{...item('a'),dependencies:[null]}]),/Invalid/);
    assert.throws(()=>parse([{...item('a'),url:'https://user:password@example/a.js'}]),/HTTPS/);
    assert.throws(()=>parse([{...item('a'),banner:'http://example/banner.png'}]),/HTTPS/);
    assert.throws(()=>parse([{...item('a'),dependencies:['b']},{...item('b'),dependencies:['a']}]),/Cyclic/);
});
test('HTTPS fetch forwards abort signal and rejects HTTP failure', async () => {
    const original=globalThis.fetch;
    const controller=new AbortController();
    try {
        globalThis.fetch=async(url,options)=>{
            assert.equal(url,'https://catalog.example/extensions-v1.json');
            assert.equal(options.signal,controller.signal);
            assert.equal(options.credentials,'omit');
            return {ok:true,json:async()=>({schemaVersion:1,extensions:[item('a')]})};
        };
        assert.equal((await loadExtensionCatalog('https://catalog.example/extensions-v1.json',controller.signal))[0].id,'a');
        globalThis.fetch=async()=>({ok:false,status:503});
        await assert.rejects(loadExtensionCatalog('https://catalog.example/extensions-v1.json'),/503/);
    } finally { globalThis.fetch=original; }
});
