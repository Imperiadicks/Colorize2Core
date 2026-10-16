import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { browserTest } from "./browser-test.mjs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const base = await fs.readFile(root + "../Colorize-2/src/styles.css", "utf8"),
    controls = await fs.readFile(
        root + "../Colorize-2/src/pulsecolor-controls.css",
        "utf8",
    ),
    code = await fs.readFile(
        root + "dist/31c62ba2-b6f6-4ba7-934e-39146eccfe69/script.js",
        "utf8",
    );
const html = `<!doctype html><html class="ym-dark-theme"><head><style>${base}</style><style>main{width:650px;height:430px}button{width:60px;height:60px}svg{width:24px;height:24px}</style></head><body><main class="CommonLayout_root__WC_W1"><button id="enabled" class="VibePlayerControls_playButton__vnoer"><svg viewBox="0 0 24 24"><path d="M4 4L20 12L4 20Z"/></svg></button><button id="disabled" disabled><svg><path/></svg></button></main><script>window.values={useCustomColor:true,baseColor:'#ff0000',FullVibe:false};window.listeners=[];window.wait=ms=>new Promise(r=>setTimeout(r,ms));window.pulsesyncApi={getSettings:()=>({getCurrent:()=>values,onChange:fn=>{listeners.push(fn);return()=>{}}})};</script><script>${code}</script></body></html>`;
await browserTest(
    "colorize2-controls-palette",
    html,
    async ({ evaluate, send, screenshot }) => {
        await evaluate("wait(250)");
        const before = await evaluate(
            `getComputedStyle(document.querySelector('main')).backgroundImage`,
        );
        await evaluate(
            `(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(controls)};document.head.append(s)})()`,
        );
        assert.equal(
            await evaluate(
                `getComputedStyle(document.querySelector('main')).backgroundImage`,
            ),
            before,
            "Original background preserved",
        );
        const scope = await evaluate(`(()=>{
const icon=document.createElement('span');icon.className='VibePlayerControls_playButtonIcon__fixture';document.getElementById('enabled').append(icon);
for(const id of ['WHEEL_SETTING_ITEM','WHEEL_RESHUFFLE_ITEM','WHEEL_PLAYLIST_ITEM']){const row=document.createElement('div');row.dataset.testId=id;row.innerHTML='<img class="WheelItem_cover__fixture">';document.body.append(row)}
return{iconBackground:getComputedStyle(icon).backgroundColor,filters:['WHEEL_SETTING_ITEM','WHEEL_RESHUFFLE_ITEM','WHEEL_PLAYLIST_ITEM'].map(id=>getComputedStyle(document.querySelector('[data-test-id="'+id+'"] img')).filter)}})()`);
        assert.equal(
            scope.iconBackground,
            "rgba(0, 0, 0, 0)",
            "Play icon must not acquire a square background",
        );
        assert.ok(scope.filters[0].includes("hue-rotate("));
        assert.ok(scope.filters[1].includes("hue-rotate("));
        assert.equal(
            scope.filters[2],
            "none",
            "Unrelated wheel covers remain unchanged",
        );
        await send("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "Tab",
            code: "Tab",
            windowsVirtualKeyCode: 9,
        });
        await send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: "Tab",
            code: "Tab",
            windowsVirtualKeyCode: 9,
        });
        await evaluate(`document.getElementById('enabled').focus();wait(300)`);
        const focus = await evaluate(
            `(()=>{const b=document.getElementById('enabled'),s=getComputedStyle(b);return{focus:b.matches(':focus-visible'),outline:s.outlineStyle,width:s.outlineWidth,color:getComputedStyle(b.querySelector('svg')).color,disabled:getComputedStyle(document.querySelector('#disabled svg')).color}})()`,
        );
        assert.equal(focus.outline, "solid");
        assert.equal(focus.width, "2px");
        assert.notEqual(focus.color, focus.disabled);
        const fade = await evaluate(
            `(async()=>{values.baseColor='#0000ff';listeners.forEach(fn=>fn(values));await wait(100);const layer=document.querySelector('.colorize-palette-background');return{count:document.querySelectorAll('.colorize-palette-background').length,opacity:layer?getComputedStyle(layer).opacity:null}})()`,
        );
        assert.ok(fade.count > 0, JSON.stringify(fade));
        assert.ok(Number(fade.opacity) > 0 && Number(fade.opacity) < 1);
        const retarget = await evaluate(
            `(async()=>{values.baseColor='#00ff00';listeners.forEach(fn=>fn(values));await wait(100);return document.querySelectorAll('.colorize-palette-background').length})()`,
        );
        assert.equal(retarget, 1);
        await screenshot("crossfade");
        await evaluate("wait(1100)");
        assert.equal(
            await evaluate(
                `document.querySelectorAll('.colorize-palette-background').length`,
            ),
            0,
        );
        await send("Emulation.setEmulatedMedia", {
            features: [{ name: "prefers-reduced-motion", value: "reduce" }],
        });
        await evaluate(
            `values.baseColor='#ff00ff';listeners.forEach(fn=>fn(values));wait(200)`,
        );
        assert.equal(
            await evaluate(
                `document.querySelectorAll('.colorize-palette-background').length`,
            ),
            0,
        );
        console.log(
            JSON.stringify({
                backgroundPreserved: true,
                focus,
                fade,
                rapidRetarget: true,
                reducedMotion: true,
            }),
        );
    },
);
