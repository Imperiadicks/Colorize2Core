import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { browserTest } from './browser-test.mjs'
const js = await fs.readFile(new URL('../dist/31c62ba2-b6f6-4ba7-934e-39146eccfe69/script.js', import.meta.url), 'utf8')
const css = await fs.readFile(new URL('../../Colorize-2/src/styles.css', import.meta.url), 'utf8')
const html = `<html class="ym-dark-theme"><head></head><body><main class="MainPage_vibe__fixture" style="height:37px"><button class="VibePlayerControls_skipButton__fixture"></button></main><script>
const nativeTimeout=window.setTimeout.bind(window),nativeClearTimeout=window.clearTimeout.bind(window),nativeInterval=window.setInterval.bind(window),nativeClearInterval=window.clearInterval.bind(window);
window.wait=ms=>new Promise(resolve=>nativeTimeout(resolve,ms));window.timers=new Set();window.intervals=new Set();window.calls=0;window.subscribers=new Set();
window.setTimeout=(fn,delay,...args)=>{const id=nativeTimeout(()=>{timers.delete(id);fn(...args)},delay);timers.add(id);return id};window.clearTimeout=id=>{timers.delete(id);nativeClearTimeout(id)};
window.setInterval=(fn,delay)=>{const id=nativeInterval(fn,delay);intervals.add(id);return id};window.clearInterval=id=>{intervals.delete(id);nativeClearInterval(id)};
window.values={useCustomColor:true,baseColor:'#cc6688',FullVibe:true,autoVibeButtonContrast:true};window.pulsesyncApi={getSettings:()=>{calls++;return{getCurrent:()=>values,onChange:fn=>{subscribers.add(fn);return()=>subscribers.delete(fn)}}}};
window.themeCSS=${JSON.stringify(css)};
window.enable=()=>{const style=document.createElement('style');style.id='theme';style.textContent=themeCSS;document.head.append(style)};
</script><script>${js}</script></body></html>`
await browserTest('colorize-theme-lifecycle', html, async ({ evaluate }) => {
    assert.deepEqual(await evaluate(`(async()=>{await wait(120);return{calls,intervals:intervals.size,style:!!document.getElementById('colorize-style')}})()`), { calls:0, intervals:0, style:false })
    const enabled = await evaluate(`(async()=>{enable();await wait(250);return{style:!!document.getElementById('colorize-style'),subscriptions:subscribers.size,intervals:intervals.size,height:document.querySelector('main').style.height}})()`)
    assert.equal(enabled.style,true); assert.equal(enabled.subscriptions,1); assert.equal(enabled.intervals,1); assert.equal(enabled.height,'88.35vh')
    const disabled = await evaluate(`(async()=>{document.getElementById('theme').remove();await wait(250);return{style:!!document.getElementById('colorize-style'),subscriptions:subscribers.size,intervals:intervals.size,timers:timers.size,height:document.querySelector('main').style.height,classes:document.documentElement.className,filter:document.documentElement.style.getPropertyValue('--colorize-wheel-icon-filter')}})()`)
    assert.deepEqual(disabled,{style:false,subscriptions:0,intervals:0,timers:0,height:'37px',classes:'ym-dark-theme',filter:''})
    const idle = await evaluate(`(async()=>{const before=calls;document.querySelector('button').setAttribute('src','changed');document.body.append(document.createElement('section'));history.pushState({},'','#off');subscribers.forEach(fn=>fn(values));await wait(250);return{calls:calls-before,style:!!document.getElementById('colorize-style')}})()`)
    assert.deepEqual(idle,{calls:0,style:false})
    const restarted = await evaluate(`(async()=>{enable();await wait(250);return{style:!!document.getElementById('colorize-style'),subscriptions:subscribers.size,intervals:intervals.size}})()`)
    assert.deepEqual(restarted,{style:true,subscriptions:1,intervals:1})
    const cycles = await evaluate(`(async()=>{for(let i=0;i<4;i++){document.getElementById('theme').remove();await wait(30);enable();await wait(60)}return{subscriptions:subscribers.size,intervals:intervals.size}})()`)
    assert.deepEqual(cycles,{subscriptions:1,intervals:1})
    const pending = await evaluate(`(async()=>{const cover=document.createElement('div');cover.dataset.testId='PLAYERBAR_DESKTOP_COVER_CONTAINER';cover.innerHTML='<img src="/slow.svg">';document.body.append(cover);values.useCustomColor=false;subscribers.forEach(fn=>fn(values));await wait(40);document.getElementById('theme').remove();await wait(1100);return{style:!!document.getElementById('colorize-style'),subscriptions:subscribers.size,intervals:intervals.size,timers:timers.size,layers:document.querySelectorAll('.bg-layer,.colorize-palette-background').length}})()`)
    assert.deepEqual(pending,{style:false,subscriptions:0,intervals:0,timers:0,layers:0})
    console.log({enabled,disabled,idle,restarted,cycles,pending})
}, async (req,res) => {
    if (req.url !== '/slow.svg') return false
    await new Promise(resolve=>setTimeout(resolve,800))
    res.setHeader('Content-Type','image/svg+xml')
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>')
    return true
})
