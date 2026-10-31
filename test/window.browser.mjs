import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const require=createRequire(process.env.TW_SECURITY_PLAYWRIGHT_PACKAGE || import.meta.url);
const {chromium,expect}=require('@playwright/test');
let browser,server,base;
const entry=`
import React from 'react';import ReactDOM from 'react-dom';
import {ExtensionSecurityDialog} from './src/react.jsx';
const params=new URLSearchParams(location.search),state=window.fixture={completed:[],requests:0,executions:0};
const entries=[{url:'https://fixture.invalid/one.js',id:'one',ids:['one']},{url:'https://fixture.invalid/two.js',id:'two',ids:['two']}];
const loadInfo=async url=>{state.requests++;if(params.has('delayed'))await new Promise(resolve=>(state.resolve??={})[url]=resolve);return {metadata:{name:url.includes('one.js')?'One':'Two',description:'Review metadata '.repeat(15)},source:'window.fixture.executions++'};};
function Frame(props){React.useEffect(()=>{const escape=e=>{if(e.key==='Escape')props.onRequestClose();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);});return ReactDOM.createPortal(React.createElement('div',{className:'overlay'},React.createElement('div',{role:'dialog','aria-label':props.contentLabel,className:props.className},React.createElement('div',{className:'host-frame'},React.createElement('header',{className:props.headerClassName},React.createElement('div',null,props.contentLabel)),props.children))),document.body);}
let locale=params.get('lang')||'ja';const render=()=>ReactDOM.render(React.createElement(ExtensionSecurityDialog,{entries,locale,initialChoices:new Map([[entries[0].url,'sandboxed'],[entries[1].url,'deny']]),loadInfo,...(params.has('host')?{DialogFrame:Frame}:{}),onComplete:choices=>{state.completed.push(choices&&[...choices]);ReactDOM.unmountComponentAtNode(document.getElementById('app'));}}),document.getElementById('app'));
window.changeLocale=next=>{locale=next;render();};window.unmount=()=>ReactDOM.unmountComponentAtNode(document.getElementById('app'));render();window.ready=true;
`;
before(async()=>{
 const result=await build({stdin:{contents:entry,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',define:{__SECURITY_COMMON_BANNER__:JSON.stringify('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>')}});
 const css=await readFile('src/react.css','utf8');
 const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><style>html,body{margin:0;font:14px system-ui}.overlay{position:fixed;inset:0;background:#0005}.host-frame{display:flex;flex-direction:column;min-height:0}.twextsec-modal{border:4px solid #ccc;border-radius:10px;background:#fff}.twextsec-frame-header{background:#42659a;color:white;font-size:18px} ${css}</style><div id="app"></div><script src="/bundle.js"></script></html>`;
 server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?result.outputFiles[0].text:html);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
async function open(query=''){const page=await browser.newPage({viewport:{width:1440,height:1100}});page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));await page.goto(base+'/'+query);await page.waitForFunction(()=>window.ready,{},{timeout:5000}).catch(error=>{throw new Error(error.message+'; page errors: '+JSON.stringify(page.errors));});await page.locator('[data-twextsec-window]').waitFor();return page;}
const near=(a,b)=>assert.ok(Math.abs(a-b)<2,a+' should equal '+b);
async function drag(page,target,dx,dy){const r=await target.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:5});await page.mouse.up();}
const choices=page=>page.locator('article input:checked').evaluateAll(items=>items.map(item=>item.value));

test('standalone and portal security windows preserve choices through all window gestures and denied-extension confirmation',{timeout:60000},async()=>{
 for(const query of ['', '?host=1']){
  const page=await open(query),dialog=page.locator('.twextsec-modal');await expect(dialog.getByRole('button',{name:'OK',exact:true})).toBeEnabled();
  const before=await choices(page);await drag(page,page.locator('.twextsec-resize[data-edge="se"]'),-60,-120);const initial=await dialog.boundingBox();
  await drag(page,page.locator('.twextsec-frame-header > div'),40,20);let r=await dialog.boundingBox();near(r.x,initial.x+40);near(r.y,initial.y+20);
  for(const edge of ['n','e','s','w','ne','se','sw','nw']){const previous=await dialog.boundingBox();const dx=edge.includes('w')?-7:edge.includes('e')?7:0,dy=edge.includes('n')?-4:edge.includes('s')?4:0;await drag(page,page.locator('.twextsec-resize[data-edge="'+edge+'"]'),dx,dy);r=await dialog.boundingBox();near(r.width,previous.width+(dx?7:0));near(r.height,previous.height+(dy?4:0));}
  const restored=await dialog.boundingBox();await page.getByRole('button',{name:'全画面化',exact:true}).click();assert.deepEqual(await dialog.boundingBox(),{x:0,y:0,width:1440,height:1100});await page.getByRole('button',{name:'元のサイズに戻す',exact:true}).click();assert.deepEqual(await dialog.boundingBox(),restored);assert.deepEqual(await choices(page),before);assert.equal(await page.evaluate(()=>window.fixture.completed.length),0);assert.equal(await page.evaluate(()=>window.fixture.executions),0);
  await dialog.getByRole('button',{name:'OK',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('button',{name:'全画面化',exact:true}).click();assert.equal(await page.evaluate(()=>window.fixture.completed.length),0);await page.getByRole('button',{name:'いいえ',exact:true}).click();assert.deepEqual(await choices(page),before);await dialog.getByRole('button',{name:'OK',exact:true}).click();await page.getByRole('button',{name:'はい',exact:true}).click();await expect(dialog).toHaveCount(0);assert.deepEqual(await page.evaluate(()=>window.fixture.completed),[[['https://fixture.invalid/one.js','sandboxed'],['https://fixture.invalid/two.js','deny']]]);assert.deepEqual(page.errors,[]);await page.close();
 }
});
test('minimum and narrow security windows keep controls reachable and preserve the cancel confirmation',{timeout:30000},async()=>{
 const page=await open('?host=1'),dialog=page.locator('.twextsec-modal');await expect(dialog.getByRole('button',{name:'OK',exact:true})).toBeEnabled();
 await drag(page,page.locator('.twextsec-resize[data-edge="se"]'),-1100,-1100);let r=await dialog.boundingBox();near(r.width,360);near(r.height,280);
 for(const target of [page.getByRole('button',{name:'全画面化',exact:true}),dialog.getByRole('button',{name:'OK',exact:true}),dialog.getByRole('button',{name:'キャンセル',exact:true})]){const b=await target.boundingBox();assert.ok(b.x>=r.x&&b.y>=r.y&&b.x+b.width<=r.x+r.width&&b.y+b.height<=r.y+r.height);}
 await page.setViewportSize({width:320,height:500});await expect(dialog).toHaveCSS('width','320px');await page.getByRole('button',{name:'全画面化',exact:true}).click();assert.deepEqual(await dialog.boundingBox(),{x:0,y:0,width:320,height:500});await page.setViewportSize({width:390,height:720});await expect(dialog).toHaveCSS('width','390px');
 await dialog.getByRole('button',{name:'キャンセル',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('button',{name:'いいえ',exact:true}).click();assert.deepEqual(await choices(page),['sandboxed','deny']);await page.keyboard.press('Escape');await page.getByRole('button',{name:'はい',exact:true}).click();await expect(dialog).toHaveCount(0);assert.deepEqual(await page.evaluate(()=>window.fixture.completed),[null]);assert.deepEqual(page.errors,[]);await page.close();
});
test('metadata arrival and locale changes retain geometry and cleanup releases window controls',{timeout:30000},async()=>{
 const page=await open('?host=1&delayed=1&lang=en'),dialog=page.locator('.twextsec-modal');await drag(page,page.locator('.twextsec-frame-header > div'),50,15);const before=await dialog.boundingBox();await page.getByRole('button',{name:'Maximize',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'Restore window',exact:true})).toBeVisible();await page.evaluate(()=>{for(const resolve of Object.values(window.fixture.resolve))resolve();window.changeLocale('ja');});await expect(page.getByRole('button',{name:'元のサイズに戻す',exact:true})).toBeVisible();await page.getByRole('button',{name:'元のサイズに戻す',exact:true}).click();assert.deepEqual(await dialog.boundingBox(),before);assert.equal(await page.evaluate(()=>window.fixture.requests),2);assert.deepEqual(await choices(page),['sandboxed','deny']);await page.evaluate(()=>window.unmount());await expect(dialog).toHaveCount(0);await page.setViewportSize({width:600,height:600});await page.mouse.move(1,1);assert.equal(await page.locator('.twextsec-window-button,.twextsec-resize').count(),0);assert.deepEqual(page.errors,[]);await page.close();
});
