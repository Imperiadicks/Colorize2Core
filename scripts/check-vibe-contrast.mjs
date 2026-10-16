import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { browserTest } from './browser-test.mjs'
const root=fileURLToPath(new URL('../',import.meta.url))
const js=await fs.readFile(root+'dist/31c62ba2-b6f6-4ba7-934e-39146eccfe69/script.js','utf8')
const css=await fs.readFile(root+'../Colorize-2/src/styles.css','utf8')
const html=`<html class="ym-dark-theme"><head><style>${css}</style><style>.VibePage_root__fixture{width:700px;height:450px;background:rgb(20,20,20);position:relative}.VibePage_root__fixture::before{content:'';position:absolute;inset:0;background:rgba(255,255,255,.15);pointer-events:none}button{position:absolute;left:280px;top:300px;width:60px;height:60px}img{width:350px;height:350px;object-fit:cover}</style></head><body><main class="VibePage_root__fixture"><img><button class="VibePlayerControls_skipButton__fixture"></button></main><script>window.contrastLogs=[];console.log=(...a)=>contrastLogs.push(a);window.wait=ms=>new Promise(r=>setTimeout(r,ms));window.values={useCustomColor:true,baseColor:'#aa5555',FullVibe:false,enableBackgroundImage:false,autoVibeButtonContrast:true};window.listeners=[];window.pulsesyncApi={getSettings:()=>({getCurrent:()=>values,onChange:fn=>{listeners.push(fn);return()=>{}}})};const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d').fillStyle='white';c.getContext('2d').fillRect(0,0,64,64);document.querySelector('img').src=c.toDataURL();</script><script>${js}</script></body></html>`
await browserTest('colorize-vibe-contrast',html,async({evaluate})=>{
const dark=await evaluate(`(async()=>{await wait(300);return document.documentElement.classList.contains('colorize-bright-vibe-controls')})()`)
assert.equal(dark,false,'A white album card and translucent overlay must not darken buttons on a dark surface')
const gradient=await evaluate(`(async()=>{document.querySelector('main').style.background='linear-gradient(white,black)';values.baseColor='#bb5555';listeners.forEach(fn=>fn(values));await wait(150);return document.documentElement.classList.contains('colorize-bright-vibe-controls')})()`)
assert.equal(gradient,false,'One white gradient stop does not make the whole surface bright')
const white=await evaluate(`(async()=>{document.querySelector('main').style.background='white';values.staticBackground=true;listeners.forEach(fn=>fn(values));await wait(200);return document.documentElement.classList.contains('colorize-bright-vibe-controls')})()`)
assert.equal(white,true,'Bright Vibe surface enables darkened buttons')
const disabled=await evaluate(`(async()=>{values.autoVibeButtonContrast=false;listeners.forEach(fn=>fn(values));await wait(120);return{active:document.documentElement.classList.contains('colorize-bright-vibe-controls'),markers:document.querySelectorAll('.colorize-vibe-control-contrast').length}})()`)
assert.deepEqual(disabled,{active:false,markers:0})
const pink=await evaluate(`(async()=>{document.querySelector('main').style.background='rgb(226,110,174)';values.autoVibeButtonContrast=true;listeners.forEach(fn=>fn(values));await wait(200);return{active:document.documentElement.classList.contains('colorize-bright-vibe-controls'),background:getComputedStyle(document.querySelector('button')).backgroundColor}})()`)
assert.equal(pink.active,true,'Pink surface from the screenshot must enable darkening')
assert.ok(pink.background.includes('0.78'),'Active controls use a genuinely dark translucent background')
const back=await evaluate(`(async()=>{document.querySelector('main').style.background='rgb(20,20,20)';values.staticBackground=false;values.autoVibeButtonContrast=true;listeners.forEach(fn=>fn(values));await wait(200);return document.documentElement.classList.contains('colorize-bright-vibe-controls')})()`)
assert.equal(back,false,'Returning to a dark surface clears cached bright state')
const nativeTransition=await evaluate(`(async()=>{const main=document.querySelector('main');main.style.background='rgb(226,110,174)';main.dispatchEvent(new TransitionEvent('transitionend',{bubbles:true,propertyName:'--vibe-gradient-stop-0'}));await wait(200);return document.documentElement.classList.contains('colorize-bright-vibe-controls')})()`)
assert.equal(nativeTransition,true,'Native background transition must invalidate contrast without a track or settings change')
const nativeDark=await evaluate(`(async()=>{const main=document.querySelector('main');main.style.background='rgb(20,20,20)';main.dispatchEvent(new TransitionEvent('transitionend',{bubbles:true,propertyName:'--vibe-gradient-stop-0'}));await wait(200);return document.documentElement.classList.contains('colorize-bright-vibe-controls')})()`)
assert.equal(nativeDark,false,'Native transition back to dark clears contrast without changing the palette')
const radialGlow=await evaluate(`(async()=>{const main=document.querySelector('main');document.querySelector('button').style.cssText='position:absolute!important;left:calc(45% - 30px);top:calc(75% - 30px)';main.style.background='radial-gradient(circle at 45% 75%, rgb(226,140,174) 0%, rgb(100,10,40) 60%, rgb(30,0,10) 100%)';main.dispatchEvent(new TransitionEvent('transitionend',{bubbles:true,propertyName:'background-color'}));await wait(200);return document.documentElement.classList.contains('colorize-bright-vibe-controls')})()`)
assert.equal(radialGlow,true,'Bright radial glow behind controls must not be averaged with the dark perimeter')
const radialEdge=await evaluate(`(async()=>{const main=document.querySelector('main');document.querySelector('button').style.cssText='position:absolute!important;left:0;top:0';main.dispatchEvent(new TransitionEvent('transitionend',{bubbles:true,propertyName:'background-color'}));await wait(200);return document.documentElement.classList.contains('colorize-bright-vibe-controls')})()`)
assert.equal(radialEdge,false,'Controls on the dark edge must not darken merely because the center is bright')
console.log({dark,gradient,white,disabled,pink,back,nativeTransition,nativeDark,radialGlow,radialEdge})
})
