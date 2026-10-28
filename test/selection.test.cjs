const {test} = require('node:test');
const assert = require('node:assert/strict');
const {resolveExtensionSelection, parseExtensionCatalog, loadExtensionCatalog} = require('../dist/index.cjs');
const item = id => ({id,name:id,version:'1.2.3',url:`https://cdn.example/${id}.js`,dependencies:[]});
const entries = [
    {id:'a', dependencies:['b','c']}, {id:'b', dependencies:['d']},
    {id:'c', dependencies:['d']}, {id:'d', dependencies:[]}, {id:'e', dependencies:['d']}
];
test('transitive and shared dependencies stay locked until every parent is removed', () => {
    let state=resolveExtensionSelection(entries,['a','e']);
    assert.deepEqual([...state.selected],['d','b','c','a','e']);
    assert.deepEqual([...state.required],['b','d','c']);
    assert.deepEqual([...state.requiredBy.get('d')],['a','e']);
    assert.deepEqual([...state.requiredBy.get('b')],['a']);
    assert.equal(state.requiredBy.has('a'),false);
    assert.deepEqual(state.ordered.map(e=>e.id),['d','b','c','a','e']);
    state=resolveExtensionSelection(entries,['e']);
    assert.deepEqual([...state.selected],['d','e']);
    assert.deepEqual([...state.required],['d']);
    assert.deepEqual([...state.requiredBy.get('d')],['e']);
    assert.equal(resolveExtensionSelection(entries).selected.size,0);
    assert.deepEqual(resolveExtensionSelection(entries,['a'],['d']).ordered.map(e=>e.id),['b','c','a']);
    assert.ok(resolveExtensionSelection(entries,['a','d']).required.has('d'));
    assert.deepEqual([...resolveExtensionSelection(entries,['a','d']).requiredBy.get('d')],['a']);
});

test('catalog categories resolve in declared dashboard order without changing the array API', () => {
    const categories=[{id:'data-tools',title:'Data',titleJa:'データ'},{id:'media',title:'Media'}];
    const parsed=parseExtensionCatalog({schemaVersion:1,categories,extensions:[
        {...item('a'),category:'media'},{...item('b'),category:'data-tools'},item('legacy')
    ]});
    assert.ok(Array.isArray(parsed));
    assert.deepEqual(parsed[0].category,{id:'media',title:'Media',order:1});
    assert.deepEqual(parsed[1].category,{id:'data-tools',title:'Data',titleJa:'データ',order:0});
    assert.equal(parsed[2].category,undefined);
    assert.equal(parseExtensionCatalog({schemaVersion:1,extensions:[item('legacy')]})[0].category,undefined);
    const parse=(categoryList,category='media')=>parseExtensionCatalog({
        schemaVersion:1,categories:categoryList,extensions:[{...item('a'),category}]
    });
    assert.throws(()=>parse(categories,'missing'),/Missing extension category/);
    assert.throws(()=>parse(categories,5),/Missing extension category/);
    assert.throws(()=>parse(undefined),/Missing extension category/);
    assert.throws(()=>parse({media:'Media'}),/Invalid/);
    assert.throws(()=>parse([categories[1],categories[1]]),/Duplicate/);
    for(const category of [{id:5,title:'Title'},{id:'bad id',title:'Title'},{id:'media',title:''},
        {id:'media',title:'Title',titleJa:5}]) {
        assert.throws(()=>parse([category]),/Invalid/);
    }
});
test('missing, duplicate and cyclic dependencies cannot produce a load order', () => {
    assert.throws(()=>resolveExtensionSelection([{id:'a',dependencies:['b']}],['a']),/Missing/);
    assert.throws(()=>resolveExtensionSelection([{id:'a'},{id:'a'}]),/Duplicate/);
    assert.throws(()=>resolveExtensionSelection([{id:'a',dependencies:['b']},{id:'b',dependencies:['a']}],['a']),/Cyclic/);
});
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

test('catalog documentation and npm package metadata are validated without replacing the loading URL', () => {
    const parse=extension=>parseExtensionCatalog({schemaVersion:1,extensions:[{...item('bubble'),...extension}]})[0];
    const scoped=parse({docsURL:'https://kubohiroya.github.io/turbowarp-plus-packages/bubble',
        package:'  @kubohiroya/bubble  '});
    assert.equal(scoped.url,'https://cdn.example/bubble.js');
    assert.equal(scoped.metadata.docsURL,'https://kubohiroya.github.io/turbowarp-plus-packages/bubble');
    assert.equal(scoped.metadata.package,'@kubohiroya/bubble');
    assert.equal(parse({package:'bubble-tools.js'}).metadata.package,'bubble-tools.js');
    assert.equal(parse({docsURL:'https://docs.example'}).metadata.docsURL,'https://docs.example/');
    const legacy=parse({});
    assert.equal(legacy.metadata.docsURL,undefined);
    assert.equal(legacy.metadata.package,undefined);
    assert.equal(legacy.url,item('bubble').url);
    for(const docsURL of [null,'','http://docs.example','javascript:alert(1)','https://user:password@docs.example']) {
        assert.throws(()=>parse({docsURL}),/HTTPS/);
    }
    for(const name of [null,42,'',' ','Bubble','@scope','@scope/name@1.0.0','name@1.0.0',
        '@scope/name/path','../package','@scope/../package','bad name','name?query','name#fragment',
        'https://npmjs.com/package/bubble','node_modules','favicon.ico','a'.repeat(215)]) {
        assert.throws(()=>parse({package:name}),/Invalid npm package/);
    }
});

test('catalog author links allow explicit HTTP or HTTPS metadata and preserve the author text', () => {
    const parse=extension=>parseExtensionCatalog({schemaVersion:1,extensions:[{...item('bubble'),...extension}]})[0];
    const author='Example Author <author@example.test>';
    const linked=parse({author,authorURL:'https://author.example'});
    assert.equal(linked.metadata.author,author);
    assert.equal(linked.metadata.authorURL,'https://author.example/');
    assert.equal(parse({author,authorURL:'http://author.example'}).metadata.authorURL,'http://author.example/');
    assert.equal(linked.url,item('bubble').url);
    const legacy=parse({author});
    assert.equal(legacy.metadata.author,author);
    assert.equal(legacy.metadata.authorURL,undefined);
    assert.equal(parse({}).metadata.authorURL,undefined);
    for(const authorURL of [null,'','javascript:alert(1)','data:text/html,test','ftp://author.example',
        'https://user:password@author.example','http://user:password@author.example']) {
        assert.throws(()=>parse({author,authorURL}),/HTTPS/);
    }
});
