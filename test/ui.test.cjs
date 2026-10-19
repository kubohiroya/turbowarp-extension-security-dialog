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
    assert.equal(document.querySelectorAll('textarea').length,0);
    assert.equal(document.querySelectorAll('input:checked').length,1);
    const radios=Array.from(document.querySelectorAll('input'));
    act(()=>Simulate.change(radios.find(item=>item.dataset.index==='1'&&item.value==='deny')));
    act(()=>pending.get(a.url)({metadata:{name:'Extension A',banner:'https://images.test/a.png'},source:'globalThis.shouldNeverExecute = true;'}));
    await wait(0);
    assert.equal(instance.state.choices[a.url],'sandboxed');assert.equal(instance.state.choices[b.url],'deny');
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

test.after(()=>{ReactDOM.unmountComponentAtNode(document.getElementById('app'));dom.window.close();});
