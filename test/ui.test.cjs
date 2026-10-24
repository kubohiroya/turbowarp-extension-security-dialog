const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {url:'http://localhost/',pretendToBeVisual:true});
for (const name of ['window','document','navigator','HTMLElement','Node','Element','history','location','HTMLCollection','NodeList']) {
    Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
}
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
// React 16's browser scheduler keeps Node's native MessagePort referenced forever.
// Use its timer fallback in JSDOM so the test worker can exit naturally.
globalThis.MessageChannel = undefined;
const React = require('react');
const ReactDOM = require('react-dom');
const {act, Simulate} = require('react-dom/test-utils');
const {ExtensionSecurityDialog} = require('../dist/react.cjs');
const wait = ms => act(async () => {await new Promise(resolve => setTimeout(resolve,ms));});
const buttons = () => Array.from(document.querySelectorAll('button'));
function click(text) {
    const button = buttons().find(item=>item.textContent===text);
    assert.ok(button,`button ${text} exists`);assert.equal(button.disabled,false);
    act(()=>Simulate.click(button));
}

test('asynchronous metadata/images/new rows preserve choices and detail state; source mounts only after Details', async () => {
    const pending = new Map();
    const completed = [];
    let instance;
    const entry = url => ({url, ids:[url.includes('a.test')?'a':'b']});
    const a = entry('https://a.test/e.js');const b = entry('https://b.test/e.js');
    const loadInfo = url => new Promise(resolve=>pending.set(url,resolve));
    function render(entries) {act(()=>{ReactDOM.render(React.createElement(ExtensionSecurityDialog,{
        ref:value=>{instance=value;}, entries,locale:'ja',loadInfo,onComplete:value=>completed.push(value),
        initialChoices:new Map([[a.url,'sandboxed']])}),document.getElementById('app'));});}
    render([a,b]);await wait(0);
    assert.match(document.querySelector('.twextsec-intro').textContent,/実行方法を選んでください（取得中でも選択できます）/);
    assert.doesNotMatch(document.querySelector('.twextsec-note').textContent,/取得中でも選択/);
    assert.doesNotMatch(document.querySelector('article').textContent,/更新日時/);
    assert.equal(document.querySelectorAll('textarea').length,0);
    assert.equal(document.querySelectorAll('input:checked').length,1);
    const radios=Array.from(document.querySelectorAll('input'));
    act(()=>Simulate.change(radios.find(item=>item.dataset.index==='1'&&item.value==='deny')));
    act(()=>pending.get(a.url)({metadata:{name:'Extension A',banner:'https://images.test/a.png',updatedAt:'2026-10-19T10:30:00+09:00'},source:'globalThis.shouldNeverExecute = true;'}));
    await wait(0);
    assert.equal(instance.state.choices[a.url],'sandboxed');assert.equal(instance.state.choices[b.url],'deny');
    assert.match(document.querySelector('article').textContent,/更新日時 2026-10-19T10:30:00\+09:00/);
    assert.doesNotMatch(document.querySelectorAll('article')[1].textContent,/更新日時/);
    assert.equal(document.querySelectorAll('textarea').length,0);
    click('詳細');await wait(0);
    assert.match(document.querySelector('textarea').value,/shouldNeverExecute/);
    assert.equal(globalThis.shouldNeverExecute,undefined);
    const image=document.querySelector('img');act(()=>Simulate.error(image));
    assert.match(document.querySelector('img').getAttribute('src'),/^data:image\/svg\+xml;base64,/);
    assert.equal(instance.state.choices[a.url],'sandboxed');
    const c={url:'https://c.test/e.js',ids:['c']};render([a,b,c]);await wait(0);
    assert.equal(instance.state.expanded[a.url],true);assert.equal(instance.state.choices[b.url],'deny');
    assert.equal(instance.state.choices[c.url],undefined);
    assert.equal(document.querySelectorAll('textarea').length,1);
    act(()=>pending.get(b.url)({metadata:{name:'Extension B'},source:'B'}));await wait(0);
    assert.equal(instance.state.choices[b.url],'deny');
    act(()=>{ReactDOM.unmountComponentAtNode(document.getElementById('app'));});
    assert.deepEqual(completed,[]);
});

test('bundle ID and license are visible without expanding source in both locales', async () => {
    for (const locale of ['ja','en']) {
        const entry={url:'data:text/javascript,bundle',ids:['runtime']};
        const metadata={name:'Kamishibai DSL 4.0 Runtime',id:'kubohiroyakamishibai4',
            author:'Hiroya Kubo',description:'Static bundle of 8 TurboWarp extensions.',
            license:'See the bundled extension notices below.',unsandboxed:'required'};
        act(()=>ReactDOM.render(React.createElement(ExtensionSecurityDialog,{
            entries:[entry],locale,loadInfo:async()=>({metadata,source:'source'}),onComplete:()=>{}
        }),document.getElementById('app')));
        await wait(0);
        const row=document.querySelector('article').textContent;
        for (const value of [metadata.name,metadata.id,metadata.author,metadata.description,metadata.license]) {
            assert.ok(row.includes(value),value);
        }
        assert.match(row,locale==='ja'?/サンドボックス内では動作しません/:/cannot run inside the sandbox/);
        assert.equal(document.querySelector('input[value="sandboxed"]').disabled,true);
        assert.match(document.querySelector('label[data-mode="unsandboxed"]').textContent,
            locale==='ja'?/動作に必要/:/Required to run/);
        assert.equal(document.querySelectorAll('textarea').length,0);
        act(()=>ReactDOM.unmountComponentAtNode(document.getElementById('app')));
    }
});

test('partial/all denial and cancellation require Yes; No retains the exact selection', async () => {
    let instance;
    const completed=[];
    const entries=[{url:'data:text/javascript,A',ids:['a']},{url:'data:text/javascript,B',ids:['b']}];
    act(()=>{ReactDOM.render(React.createElement(ExtensionSecurityDialog,{ref:value=>{instance=value;},entries,locale:'ja',
        loadInfo:async()=>({metadata:{},source:'source'}),onComplete:value=>completed.push(value)}),document.getElementById('app'));});
    await wait(0);
    assert.equal(buttons().some(button=>button.getAttribute('aria-label')==='Close'),false);
    click('拒否');await wait(760);click('OK');
    assert.match(document.querySelector('[role="alertdialog"]').textContent,/作者が意図した動作/);
    const snapshot={...instance.state.choices};click('いいえ');
    assert.deepEqual(instance.state.choices,snapshot);assert.deepEqual(completed,[]);
    click('OK');await wait(760);click('はい');
    assert.equal(completed[0].get(entries[0].url),'deny');assert.equal(completed[0].get(entries[1].url),'deny');
    act(()=>{instance.handleNo();});
    click('キャンセル');assert.match(document.querySelector('[role="alertdialog"]').textContent,/TurboWarp Editorの初期画面/);
    click('いいえ');assert.deepEqual(instance.state.choices,snapshot);assert.equal(completed.length,1);
    click('キャンセル');await wait(760);click('はい');assert.equal(completed[1],null);
    act(()=>{ReactDOM.unmountComponentAtNode(document.getElementById('app'));});
});


test('web source URLs open in a separate tab while embedded and non-web sources remain text', async () => {
    const entries = [
        {url:'https://a.test/extensions/e.js?version=1&lang=ja',ids:['a']},
        {url:'http://localhost:8601/extensions/b.js',ids:['b']},
        {url:'data:text/javascript,embedded',ids:['embedded']},
        {url:'javascript:globalThis.shouldNeverExecute=true',ids:['script']},
        {url:'file:///extensions/local.js',ids:['file']}
    ];
    const completed=[];
    act(()=>{ReactDOM.render(React.createElement(ExtensionSecurityDialog,{
        entries,locale:'ja',loadInfo:async()=>({metadata:{},source:'source'}),
        initialChoices:new Map([[entries[0].url,'sandboxed']]),
        onComplete:value=>completed.push(value)
    }),document.getElementById('app'));});
    await wait(0);
    const rows=Array.from(document.querySelectorAll('article'));
    for (let index=0;index<2;index++) {
        const link=rows[index].querySelector('a');
        assert.equal(link.href,entries[index].url);
        assert.equal(link.textContent,entries[index].url);
        assert.equal(link.target,'_blank');
        assert.equal(link.rel,'noopener noreferrer');
    }
    for (const row of rows.slice(2)) assert.equal(row.querySelector('a'),null);
    assert.match(rows[2].textContent,/埋め込み/);
    assert.equal(document.querySelectorAll('textarea').length,0);
    click('詳細');await wait(0);
    assert.equal(rows[0].querySelectorAll('a').length,2);
    assert.equal(rows[0].querySelector('input[value="sandboxed"]').checked,true);
    assert.equal(document.querySelectorAll('textarea').length,1);
    assert.deepEqual(completed,[]);
    act(()=>{ReactDOM.unmountComponentAtNode(document.getElementById('app'));});
});


test('banner hover and keyboard focus show the original image outside the scrolling dialog', async () => {
    const entry={url:'https://banner.test/e.js',ids:['banner']};
    const completed=[];
    act(()=>{ReactDOM.render(React.createElement(ExtensionSecurityDialog,{
        entries:[entry],locale:'ja',loadInfo:async()=>({metadata:{banner:'https://images.test/banner.png'},source:'source'}),
        initialChoices:new Map([[entry.url,'sandboxed']]),onComplete:value=>completed.push(value)
    }),document.getElementById('app'));});
    await wait(0);
    const image=document.querySelector('article img');
    Object.defineProperty(image,'naturalWidth',{value:1200,configurable:true});
    Object.defineProperty(image,'naturalHeight',{value:800,configurable:true});
    image.getBoundingClientRect=()=>({left:20,top:20,right:148,bottom:87,width:128,height:67});
    act(()=>Simulate.mouseEnter(image));
    let popup=document.querySelector('[role="tooltip"]');
    assert.ok(popup);
    assert.equal(document.querySelector('[role="dialog"]').contains(popup),false);
    assert.equal(popup.querySelector('img').src,image.src);
    assert.equal(Number.parseFloat(popup.style.width),window.innerWidth-24);
    const top=Number.parseFloat(popup.style.top);
    const height=Number.parseFloat(popup.style.height);
    assert.ok(top>=12&&top+height<=window.innerHeight-12);
    assert.ok(top+height<=20||top>=87);
    assert.equal(document.querySelectorAll('textarea').length,0);
    assert.equal(document.querySelector('input[value="sandboxed"]').checked,true);
    act(()=>{Simulate.mouseLeave(image);Simulate.mouseEnter(popup);});
    await wait(180);
    assert.ok(document.querySelector('[role="tooltip"]'));
    act(()=>{popup.dispatchEvent(new dom.window.Event('scroll'));});
    assert.ok(document.querySelector('[role="tooltip"]'));
    act(()=>{window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));});
    assert.equal(document.querySelector('[role="tooltip"]'),null);
    assert.equal(document.querySelector('[role="alertdialog"]'),null);
    act(()=>Simulate.focus(image));
    assert.ok(document.querySelector('[role="tooltip"]'));
    act(()=>Simulate.blur(image));await wait(180);
    assert.equal(document.querySelector('[role="tooltip"]'),null);
    act(()=>Simulate.mouseEnter(image));
    act(()=>Simulate.mouseLeave(image));await wait(180);
    assert.equal(document.querySelector('[role="tooltip"]'),null);
    act(()=>Simulate.mouseEnter(image));
    act(()=>{ReactDOM.unmountComponentAtNode(document.getElementById('app'));});
    assert.equal(document.querySelector('[role="tooltip"]'),null);
    assert.deepEqual(completed,[]);
});

test('late requirements invalidate restored choices without increasing permissions, including bulk and submit', async () => {
    const entries=[{url:'https://required.test/e.js',ids:['required']},{url:'https://ordinary.test/e.js',ids:['ordinary']}];
    const pending=new Map(),completed=[];let instance;
    act(()=>{ReactDOM.render(React.createElement(ExtensionSecurityDialog,{
        ref:value=>{instance=value;},entries,locale:'ja',
        initialChoices:new Map([[entries[0].url,'sandboxed']]),
        loadInfo:url=>new Promise(resolve=>pending.set(url,resolve)),onComplete:value=>completed.push(value)
    }),document.getElementById('app'));});
    await wait(760);
    assert.equal(buttons().find(b=>b.textContent==='OK').disabled,true);
    act(()=>instance.handleOK());assert.deepEqual(completed,[]);
    act(()=>pending.get(entries[0].url)({metadata:{name:'Required',unsandboxed:' REQUIRED '},source:'source'}));
    await wait(0);
    const required=document.querySelectorAll('article')[0];
    const sandboxed=required.querySelector('input[value="sandboxed"]');
    assert.equal(sandboxed.disabled,true);assert.equal(sandboxed.checked,false);
    assert.equal(instance.state.choices[entries[0].url],undefined);
    assert.match(required.textContent,/選び直してください/);
    assert.match(document.getElementById(sandboxed.getAttribute('aria-describedby')).textContent,/動作しません/);
    click('サンドボックスあり');
    assert.equal(instance.state.choices[entries[0].url],undefined);
    assert.equal(instance.state.choices[entries[1].url],'sandboxed');
    act(()=>Simulate.change(required.querySelector('input[value="unsandboxed"]')));
    act(()=>Simulate.change(sandboxed));
    assert.equal(instance.state.choices[entries[0].url],'unsandboxed');
    click('サンドボックスあり');
    assert.equal(instance.state.choices[entries[0].url],'unsandboxed');
    assert.equal(buttons().find(b=>b.textContent==='OK').disabled,true);
    act(()=>pending.get(entries[1].url)({metadata:{name:'Ordinary'},source:'source'}));await wait(0);
    click('OK');
    assert.equal(completed.length,1);
    assert.deepEqual([...completed[0]],[[entries[0].url,'unsandboxed'],[entries[1].url,'sandboxed']]);
    act(()=>{ReactDOM.unmountComponentAtNode(document.getElementById('app'));});
});

test('all controls use deny, sandboxed, unsandboxed order and unavailable bulk mode stays disabled', async () => {
    for(const locale of ['ja','en']) {
        const entry={url:'https://required.test/e.js',ids:['required']};
        act(()=>{ReactDOM.render(React.createElement(ExtensionSecurityDialog,{
            entries:[entry],locale,initialChoices:new Map([[entry.url,'unsandboxed']]),
            loadInfo:async()=>({metadata:{unsandboxed:'required'},source:'source'}),onComplete:()=>{}
        }),document.getElementById('app'));});
        await wait(0);
        for(const selector of ['.twextsec-bulk button','.twextsec-row input']) {
            assert.deepEqual([...document.querySelectorAll(selector)].map(e=>e.value),['deny','sandboxed','unsandboxed']);
        }
        assert.deepEqual([...document.querySelectorAll('.twextsec-columns svg')].map(e=>e.dataset.mode),
            ['deny','sandboxed','unsandboxed']);
        assert.equal(document.querySelector('.twextsec-bulk button[value="sandboxed"]').disabled,true);
        assert.equal(document.querySelector('.twextsec-bulk button[value="deny"]').disabled,false);
        assert.equal(document.querySelector('.twextsec-bulk button[value="unsandboxed"]').disabled,false);
        assert.equal(document.querySelector('input[value="unsandboxed"]').checked,true);
        assert.equal(document.querySelectorAll('.twextsec-required-mode').length,1);
        for(const icon of document.querySelectorAll('.twextsec-mode-icon')) assert.equal(icon.getAttribute('aria-hidden'),'true');
        act(()=>{ReactDOM.unmountComponentAtNode(document.getElementById('app'));});
    }
});

test('missing or failed metadata does not invent required permissions', async () => {
    for(const loadInfo of [async()=>({metadata:{},source:'source'}),async()=>{throw Error('offline');}]) {
        const entry={url:'https://unknown.test/e.js',ids:['unknown']},completed=[];
        act(()=>{ReactDOM.render(React.createElement(ExtensionSecurityDialog,{
            entries:[entry],loadInfo,initialChoices:new Map([[entry.url,'sandboxed']]),
            onComplete:value=>completed.push(value)
        }),document.getElementById('app'));});
        await wait(760);
        assert.equal(document.querySelector('input[value="sandboxed"]').disabled,false);
        assert.equal(document.querySelector('input[value="sandboxed"]').checked,true);
        assert.equal(document.querySelector('input[value="unsandboxed"]').disabled,false);
        assert.equal(document.querySelectorAll('.twextsec-required-mode').length,0);
        click('OK');assert.equal(completed[0].get(entry.url),'sandboxed');
        act(()=>{ReactDOM.unmountComponentAtNode(document.getElementById('app'));});
    }
});

test.after(()=>{ReactDOM.unmountComponentAtNode(document.getElementById('app'));dom.window.close();});
