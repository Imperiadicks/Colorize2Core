import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { browserTest } from './browser-test.mjs'
const root=fileURLToPath(new URL('../',import.meta.url))
const current=await fs.readFile(root+'dist/31c62ba2-b6f6-4ba7-934e-39146eccfe69/script.js','utf8')
async function profile(code,label){
 let result
 const html=`<html class="ym-dark-theme"><head><style>:root{--colorize-theme-active:1}</style></head><head></head><body><img data-test-id="ENTITY_COVER_IMAGE" width="64" height="64"><script>
 window.values={useCustomColor:true,baseColor:'#ff0000',FullVibe:false,autoVibeButtonContrast:false};window.listeners=[];window.wait=ms=>new Promise(r=>setTimeout(r,ms));
 window.pulsesyncApi={getSettings:()=>({getCurrent:()=>values,onChange:fn=>{listeners.push(fn);return()=>{}}})};
 window.rootWrites=0;window.geometryReads=0;window.cssCommits=0;
 const set=CSSStyleDeclaration.prototype.setProperty;CSSStyleDeclaration.prototype.setProperty=function(...a){if(this===document.documentElement.style&&a[0].startsWith('--color-'))rootWrites++;return set.apply(this,a)};
 const rect=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(...a){geometryReads++;return rect.apply(this,a)};
 new MutationObserver(records=>{cssCommits+=records.filter(r=>r.target.id==='colorize-style').length}).observe(document.head,{childList:true,subtree:true});
 const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d').fillStyle='red';c.getContext('2d').fillRect(0,0,64,64);document.querySelector('img').src=c.toDataURL();
 </script><script>${code}</script></body></html>`
 await browserTest(label,html,async({evaluate})=>{
 result=await evaluate(`(async()=>{await wait(700);rootWrites=geometryReads=cssCommits=0;const start=performance.now();for(let i=0;i<4;i++){values.staticBackground=i%2===0;listeners.forEach(fn=>fn(values));await wait(130)}return{rootWrites,geometryReads,cssCommits,elapsed:performance.now()-start}})()`)
 })
 return result
}
const result={current:await profile(current,'colorize2-palette-performance')}
assert.equal(result.current.rootWrites,0,'Unchanged palette must not rewrite hundreds of inline properties')
assert.equal(result.current.cssCommits,0,'Unchanged palette must not rebuild CSS')
assert.equal(result.current.geometryReads,0,'Cover discovery must not measure layout')
if(process.argv.includes('--compare-backup')){
 const contents=await fs.readFile(process.env.COLORIZE_BASELINE || (() => { throw new Error('Set COLORIZE_BASELINE to the archived main.ts for --compare-backup') })(),'utf8')
 const baseline=await build({stdin:{contents,resolveDir:root+'src',loader:'ts'},bundle:true,write:false,format:'iife'})
 result.before=await profile(baseline.outputFiles[0].text,'colorize2-palette-baseline')
 assert.ok(result.before.rootWrites>result.current.rootWrites)
}
const race=`<html class="ym-dark-theme"><head><style>:root{--colorize-theme-active:1}</style></head><body><div data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"><img src="/slow.svg"></div><script>window.values={useCustomColor:false,FullVibe:false,autoVibeButtonContrast:false};window.listeners=[];window.wait=ms=>new Promise(r=>setTimeout(r,ms));window.pulsesyncApi={getSettings:()=>({getCurrent:()=>values,onChange:fn=>{listeners.push(fn);return()=>{}}})};</script><script>${current}</script></body></html>`
await browserTest('colorize2-cancel-stale-cover',race,async({evaluate})=>{
 const state=await evaluate(`(async()=>{values.useCustomColor=true;values.baseColor='#00ff00';const start=performance.now();listeners.forEach(fn=>fn(values));await wait(200);return{latency:performance.now()-start,color:getComputedStyle(document.documentElement).getPropertyValue('--color-dark-5').trim()}})()`)
 assert.match(state.color,/hsl\(120,/,'Latest colour must not wait for old cover download')
 await evaluate('wait(1500)')
 assert.match(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--color-dark-5').trim()`),/hsl\(120,/,'Late old download cannot overwrite current palette')
 result.staleCover=state
},async(req,res)=>{
 if(req.url!=='/slow.svg')return false
 await new Promise(resolve=>setTimeout(resolve,1400))
 if(!res.destroyed){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="red"/></svg>')}
 return true
})
console.log(JSON.stringify(result,null,2))
