// @ts-nocheck
import { createPaletteTransition } from './palette-transition'
import { createWheelIconTint } from './wheel-icon-tint'
;(() => {
    /*──────────────────────── helpers ────────────────────────*/
    const LOG = (...a) => console.log('[Colorize 2]', ...a)
    const CHANGE_LOG_STYLE = 'color:#7dd3fc;font-weight:700'
    const CHANGE_LOG_THROTTLES = new Map()
    const nodeName = node => {
        if (!node) return 'нет узла'
        const classes = typeof node.className === 'string' ? node.className.trim().split(/\s+/).slice(0, 3).join('.') : ''
        return `${node.tagName?.toLowerCase?.() || 'node'}${node.id ? `#${node.id}` : ''}${classes ? `.${classes}` : ''}`
    }
    const LOG_CHANGE = (functionName, message, details) => {
        if (details === undefined) console.log(`%c[Colorize 2][change]%c ${functionName}: ${message}`, CHANGE_LOG_STYLE, '')
        else console.log(`%c[Colorize 2][change]%c ${functionName}: ${message}`, CHANGE_LOG_STYLE, '', details)
    }
    const LOG_CHANGE_THROTTLED = (key, interval, functionName, message, details) => {
        const now = performance.now?.() || Date.now()
        if (now - (CHANGE_LOG_THROTTLES.get(key) || 0) < interval) return
        CHANGE_LOG_THROTTLES.set(key, now)
        LOG_CHANGE(functionName, message, details)
    }

    const rgb2hsl = (r, g, b) => {
        r /= 255
        g /= 255
        b /= 255
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const d = max - min
        let h = 0,
            s = 0,
            l = (max + min) / 2
        if (d) {
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0)
                    break
                case g:
                    h = (b - r) / d + 2
                    break
                case b:
                    h = (r - g) / d + 4
                    break
            }
            h /= 6
        }
        return { h: Math.round(h * 360), s: +(s * 100).toFixed(1), l: +(l * 100).toFixed(1) }
    }
    const H = o => `hsl(${o.h},${o.s}%,${o.l}%)`
    const HA = (o, a) => `hsla(${o.h},${o.s}%,${o.l}%,${a})`

    const parseHEX = hex => {
        hex = hex.replace('#', '')
        if (hex.length === 3)
            hex = hex
                .split('')
                .map(c => c + c)
                .join('')
        const n = parseInt(hex, 16)
        if (Number.isNaN(n)) return { h: 0, s: 0, l: 50 }
        const r = (n >> 16) & 255,
            g = (n >> 8) & 255,
            b = n & 255
        return rgb2hsl(r, g, b)
    }

    /*──────────────────────── settings ────────────────────────*/
    const ADDON_NAME = 'Colorize 2'

    let themeSettingsStore = null
    const OLD_VIBE_SELECTOR = '[class*="MainPage_vibe"], [data-test-id="VIBE_BLOCK"]'
    const NEW_WAVE_SELECTOR = '[class*="VibePage_root"], [class*="DefaultLayout_rootNewWave"]'
    const VIBE_BACKGROUND_SURFACE_SELECTOR = '[class*="WithTopBanner_root__"], [class*="CommonLayout_root__"]'
    let lastNewWaveState = null

    function getSettings() {
        const api = window.pulsesyncApi
        const store = themeSettingsStore || (api && typeof api.getSettings === 'function' ? api.getSettings(ADDON_NAME) : null)
        const current = store && typeof store.getCurrent === 'function' ? store.getCurrent() : {}

        const val = (key, fallback) => {
            const entry = current[key]
            if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                if (entry.value !== undefined) return entry.value
                if (entry.bool !== undefined) return entry.bool
                if (entry.input !== undefined) return entry.input
                if (entry.default !== undefined) return entry.default
                if (entry.defaultParameter !== undefined) return entry.defaultParameter
            }
            return entry !== undefined ? entry : fallback
        }

        return {
            useCustomColor: val('useCustomColor', false),
            baseColor: val('baseColor', '#d56767'),
            removeBorder: val('removeBorder', false),
            enableBackgroundImage: val('enableBackgroundImage', false),
            autoVibeButtonContrast: val('autoVibeButtonContrast', true),
            staticBackground: val('staticBackground', false),
            FullVibe: val('FullVibe', true),
            enableAvatarZoom: val('enableAvatarZoom', false),
            onChange: store && typeof store.onChange === 'function' ? store.onChange.bind(store) : function () {},
        }
    }

    function isNewWavePage() {
        return !!document.querySelector(NEW_WAVE_SELECTOR)
    }

    function getVibeBackgroundTarget() {
        const newWaveRoot = document.querySelector('[class*="VibePage_root"]')
        if (newWaveRoot) return newWaveRoot

        if (document.querySelector('[class*="DefaultLayout_rootNewWave"]')) return null

        return document.querySelector(OLD_VIBE_SELECTOR)
    }

    function clearOldVibeSize() {
        let changed = 0
        document.querySelectorAll(OLD_VIBE_SELECTOR).forEach(vibe => {
            if (vibe.style.getPropertyValue('height')) {
                vibe.style.removeProperty('height')
                changed++
            }
            if (vibe.style.getPropertyValue('min-height')) {
                vibe.style.removeProperty('min-height')
                changed++
            }
        })
        if (changed) LOG_CHANGE('clearOldVibeSize', 'удалены inline-размеры старого Vibe', { propertiesRemoved: changed })
    }

    function syncWaveLayoutState() {
        const newWave = isNewWavePage()
        if (newWave !== lastNewWaveState) {
            document.documentElement.classList.toggle('colorize-new-wave-page', newWave)
            lastNewWaveState = newWave
            LOG_CHANGE('syncWaveLayoutState', 'переключён режим новой волны', { enabled: newWave })
            if (newWave) clearOldVibeSize()
        }
    }

    /*──────────────────────── cover helpers ───────────────────*/
    const COVER_IMAGE_SELECTOR = [
        'div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img',
        '[data-test-id="FULLSCREEN_PLAYER_MODAL"] img[data-test-id="ENTITY_COVER_IMAGE"]',
        'img[data-test-id="ENTITY_COVER_IMAGE"]',
        'img[class*="AlbumCover_cover__"][src*="avatars.yandex.net/get-music-content"]',
        'img[class*="AlbumCover_cover__"][srcset*="avatars.yandex.net/get-music-content"]',
        'img[src*="avatars.yandex.net/get-music-content"]',
        'img[srcset*="avatars.yandex.net/get-music-content"]',
    ].join(',')
    const PRIMARY_COVER_SELECTOR = [
        'div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"] img',
        '[data-test-id="PLAYERBAR_DESKTOP"] img[data-test-id="ENTITY_COVER_IMAGE"]',
        '[data-test-id="PLAYERBAR_DESKTOP"] img',
        '[data-test-id="FULLSCREEN_PLAYER_MODAL"] img[data-test-id="ENTITY_COVER_IMAGE"]',
    ].join(',')

    const coverSrcFromImg = img => {
        if (!img) return ''
        const src = img.currentSrc || img.src || img.getAttribute?.('src') || ''
        if (src) return src
        const srcset = img.getAttribute?.('srcset') || ''
        return srcset.split(',')[0]?.trim().split(/\s+/)[0] || ''
    }

    const normalizeCoverURL = (src, size = '1000x1000') =>
        String(src || '').replace(/\/(?:50x50|80x80|100x100|200x200|300x300|400x400|800x800|1000x1000)(?=[/?]|$)/g, `/${size}`)

    const coverScore = img => {
        if (!img || !img.isConnected) return -1

        const src = coverSrcFromImg(img)
        if (!src) return -1

        const cls = String(img.className || '')
        const visible = img.isConnected && !img.closest('[hidden], [aria-hidden="true"]')

        let score = 0
        if (visible) score += 120
        if (src.includes('avatars.yandex.net/get-music-content')) score += 90
        if (cls.includes('AlbumCover_cover__')) score += 70
        if (img.closest?.('div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"], [class*="PlayerBar"], [class*="playerBar"]')) score += 130
        if (img.closest?.('[class*="VibePage_root"], [class*="DefaultLayout_rootNewWave"]')) score += 115
        if (img.closest?.('[data-test-id="FULLSCREEN_PLAYER_MODAL"]')) score += 100

        return score
    }

    let coverNodeCache = null
    let coverNodeCacheTime = 0

    const getCoverNode = () => {
        const now = performance.now?.() || Date.now()
        if (coverNodeCache && coverNodeCache.isConnected && coverSrcFromImg(coverNodeCache) && now - coverNodeCacheTime < 500) {
            return coverNodeCache
        }

        let bestNode = null
        let bestScore = -1
        const primaryNode = document.querySelector(PRIMARY_COVER_SELECTOR)
        if (coverSrcFromImg(primaryNode)) {
            coverNodeCache = primaryNode
            coverNodeCacheTime = now
            return primaryNode
        }

        document.querySelectorAll(COVER_IMAGE_SELECTOR).forEach(img => {
            const score = coverScore(img)
            if (score > bestScore) {
                bestScore = score
                bestNode = img
            }
        })
        coverNodeCache = bestScore >= 0 ? bestNode : null
        coverNodeCacheTime = now

        return coverNodeCache
    }

    const coverURL = () => {
        const src = coverSrcFromImg(getCoverNode())
        return src ? normalizeCoverURL(src, '400x400') : null
    }

    const CANVAS = document.createElement('canvas')
    CANVAS.width = CANVAS.height = 64
    const CTX = CANVAS.getContext('2d')
    const COVER_ANALYSIS_CACHE = new Map()
    const COVER_ANALYSIS_PENDING = new Map()
    const COVER_ANALYSIS_CANCEL = new Map()
    const MAX_CACHE_ENTRIES = 80
    const BRIGHT_PIXEL_THRESHOLD = 0.72
    const BRIGHT_AVERAGE_THRESHOLD = 0.68
    const BRIGHT_PIXEL_RATIO_THRESHOLD = 0.55
    const BRIGHT_CONTROL_REGION_THRESHOLD = 0.62
    const BRIGHT_CONTROL_REGION_RATIO_THRESHOLD = 0.45
    const BRIGHT_RENDERED_BACKGROUND_THRESHOLD = 0.56
    const VIBE_CONTROL_MARKER_CLASS = 'colorize-vibe-control-contrast'
    const VIBE_CONTROL_SELECTOR = [
        '[class*="VibePlayerBar_button__"]',
        '[class*="VibePlayerControls_playButton__"]',
        '[class*="VibePlayerControls_withYellowPlayButton__"]',
        '[class*="VibePlayerControls_skipButton__"]',
        '[class*="VibePlayerControls_playButton_playing__"]',
    ].join(',')

    const normL = o => ({ ...o, l: Math.min(85, Math.max(20, o.l)) })

    function cacheCoverAnalysis(src, result) {
        COVER_ANALYSIS_CACHE.set(src, result)
        if (COVER_ANALYSIS_CACHE.size <= MAX_CACHE_ENTRIES) return
        COVER_ANALYSIS_CACHE.delete(COVER_ANALYSIS_CACHE.keys().next().value)
    }

    const analyzeCover = src => {
        if (!src) return Promise.resolve(null)
        if (COVER_ANALYSIS_CACHE.has(src)) return Promise.resolve(COVER_ANALYSIS_CACHE.get(src))
        if (COVER_ANALYSIS_PENDING.has(src)) return COVER_ANALYSIS_PENDING.get(src)

        const pending = new Promise(res => {
            let finished = false
            let timeout = null
            const img = new Image()
            const finish = result => {
                if (finished) return
                finished = true
                clearTimeout(timeout)
                img.onload = img.onerror = null
                if (img.getAttribute('src')) img.src = ''
                if (result) cacheCoverAnalysis(src, result)
                res(result)
            }
            COVER_ANALYSIS_CANCEL.set(src, () => finish(null))
            timeout = setTimeout(() => finish(null), 4000)
            img.crossOrigin = 'anonymous'
            const analyse = image => {
                try {
                    const w = image.naturalWidth || image.width
                    const h = image.naturalHeight || image.height
                    const scale = 64 / Math.max(w, h)
                    CTX.clearRect(0, 0, 64, 64)
                    CTX.drawImage(image, 0, 0, w * scale, h * scale)
                    const d = CTX.getImageData(0, 0, 64, 64).data

                    const hueMap = new Map()
                    let count = 0
                    let brightnessSum = 0
                    let brightnessSamples = 0
                    let brightPixels = 0
                    let controlRegionBrightnessSum = 0
                    let controlRegionSamples = 0
                    let brightControlRegionPixels = 0

                    for (let y = 0; y < 64; y += 2) {
                        for (let x = 0; x < 64; x += 2) {
                            const idx = (y * 64 + x) * 4
                            const r = d[idx],
                                g = d[idx + 1],
                                b = d[idx + 2]

                            if (d[idx + 3] < 128) continue

                            const brightness = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
                            brightnessSum += brightness
                            brightnessSamples++
                            if (brightness >= BRIGHT_PIXEL_THRESHOLD) brightPixels++
                            if (x >= 20 && x <= 60 && y >= 20 && y <= 56) {
                                controlRegionBrightnessSum += brightness
                                controlRegionSamples++
                                if (brightness >= BRIGHT_PIXEL_THRESHOLD) brightControlRegionPixels++
                            }

                            if (r + g + b < 30 || r + g + b > 740) continue

                            const hsl = rgb2hsl(r, g, b)
                            if (hsl.s < 20) continue

                            const hueKey = Math.round(hsl.h / 10) * 10
                            const current = hueMap.get(hueKey) || { count: 0, s: 0, l: 0 }
                            current.count++
                            current.s += hsl.s
                            current.l += hsl.l
                            hueMap.set(hueKey, current)

                            count++
                        }
                    }

                    let colors = null
                    if (count === 0) {
                        console.warn('[analyzeCover] Недостаточно подходящих пикселей для палитры')
                    } else {
                        let maxCount = -1
                        let dominant = null
                        for (const [hue, data] of hueMap.entries()) {
                            if (data.count > maxCount) {
                                maxCount = data.count
                                dominant = { h: hue, s: +(data.s / data.count).toFixed(1), l: +(data.l / data.count).toFixed(1) }
                            }
                        }

                        const resultColor = normL(dominant)
                        colors = [resultColor, resultColor]
                    }

                    finish({
                        colors,
                        brightness: brightnessSamples ? brightnessSum / brightnessSamples : 0,
                        brightPixelRatio: brightnessSamples ? brightPixels / brightnessSamples : 0,
                        controlRegionBrightness: controlRegionSamples ? controlRegionBrightnessSum / controlRegionSamples : 0,
                        brightControlRegionRatio: controlRegionSamples ? brightControlRegionPixels / controlRegionSamples : 0,
                    })
                } catch (e) {
                    CANVAS.width = 64
                    if (image !== img) { img.src = src; return }
                    console.warn('[analyzeCover] ошибка обработки:', e)
                    finish(null)
                }
            }
            img.onload = () => analyse(img)
            img.onerror = () => finish(null)
            const loaded = getCoverNode()
            if (loaded?.complete && loaded.naturalWidth > 0 && normalizeCoverURL(coverSrcFromImg(loaded), '400x400') === src) analyse(loaded)
            else img.src = src
        }).finally(() => {
            COVER_ANALYSIS_PENDING.delete(src)
            COVER_ANALYSIS_CANCEL.delete(src)
        })

        COVER_ANALYSIS_PENDING.set(src, pending)
        return pending
    }

    const isBrightCover = analysis =>
        !!analysis &&
        (analysis.brightness >= BRIGHT_AVERAGE_THRESHOLD ||
            analysis.brightPixelRatio >= BRIGHT_PIXEL_RATIO_THRESHOLD ||
            analysis.controlRegionBrightness >= BRIGHT_CONTROL_REGION_THRESHOLD ||
            analysis.brightControlRegionRatio >= BRIGHT_CONTROL_REGION_RATIO_THRESHOLD)

    function parseComputedColor(value, context) {
        if (!value || value === 'none' || value === 'transparent') return null

        const probe = document.createElement('span')
        probe.style.position = 'fixed'
        probe.style.visibility = 'hidden'
        probe.style.pointerEvents = 'none'
        probe.style.color = value
        ;(context?.appendChild ? context : document.documentElement).appendChild(probe)

        const resolved = getComputedStyle(probe).color
        probe.remove()

        const rgbMatch = resolved.match(/^rgba?\((.+)\)$/i)
        const srgbMatch = resolved.match(/^color\(srgb\s+(.+)\)$/i)
        const match = rgbMatch || srgbMatch
        if (!match) return null

        const parts = match[1].trim().split(/[\s,/]+/)
        if (parts.length < 3) return null

        const channel = part => {
            if (part.endsWith('%')) return (parseFloat(part) * 255) / 100
            const value = parseFloat(part)
            return srgbMatch ? value * 255 : value
        }
        const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])
        const r = channel(parts[0])
        const g = channel(parts[1])
        const b = channel(parts[2])
        if (![r, g, b, alpha].every(Number.isFinite) || alpha <= 0) return null

        return {
            brightness: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255,
            alpha: Math.min(1, Math.max(0, alpha)),
        }
    }

    function gradientColorSample(backgroundImage, context) {
        if (!backgroundImage || backgroundImage === 'none') return null

        const colorTokens = backgroundImage.match(/(?:rgba?|hsla?)\([^)]*\)|color\(srgb\s+[^)]*\)|#[\da-f]{3,8}/gi) || []
        const samples = colorTokens.map(color => parseComputedColor(color, context)).filter(Boolean)
        if (!samples.length) return null

        const radial = backgroundImage.match(/^radial-gradient\(circle at ([\d.]+)% ([\d.]+)%/)
        if (radial && samples.length >= 2) {
            const controls = getVibeControlNodes()
            const surface = context.getBoundingClientRect()
            if (controls.length && surface.width > 0 && surface.height > 0) {
                const cx = surface.width * Number(radial[1]) / 100
                const cy = surface.height * Number(radial[2]) / 100
                const radius = Math.hypot(Math.max(cx, surface.width - cx), Math.max(cy, surface.height - cy))
                const stops = Array.from(backgroundImage.matchAll(/(?:rgba?|hsla?)\([^)]*\)|color\(srgb\s+[^)]*\)|#[\da-f]{3,8}/gi)).map((match, index) => {
                    const suffix = backgroundImage.slice(match.index + match[0].length)
                    const percent = suffix.match(/^\s*([\d.]+)%/)
                    return percent ? Number(percent[1]) / 100 : index / (samples.length - 1)
                })
                let brightest = null
                for (const control of controls) {
                    const rect = control.getBoundingClientRect()
                    const position = Math.hypot(rect.left + rect.width / 2 - surface.left - cx, rect.top + rect.height / 2 - surface.top - cy) / radius
                    let index = stops.findIndex(stop => stop >= position)
                    if (index < 0) index = samples.length - 1
                    const a = Math.max(0, index - 1), b = index
                    const progress = a === b ? 0 : Math.max(0, Math.min(1, (position - stops[a]) / (stops[b] - stops[a])))
                    const alpha = samples[a].alpha * (1 - progress) + samples[b].alpha * progress
                    const brightness = alpha ? (samples[a].brightness * samples[a].alpha * (1 - progress) + samples[b].brightness * samples[b].alpha * progress) / alpha : 0
                    if (!brightest || brightness > brightest.brightness) brightest = { brightness, alpha }
                }
                if (brightest) return brightest
            }
        }

        const alphaSum = samples.reduce((sum, sample) => sum + sample.alpha, 0)
        if (!alphaSum) return null

        if (backgroundImage.startsWith('linear-gradient(') && samples.length >= 2) {
            const control = getVibeControlNodes()[0]
            const surface = context.getBoundingClientRect()
            const rect = control?.getBoundingClientRect()
            if (rect && surface.width > 0 && surface.height > 0) {
                const angle = Number(backgroundImage.match(/^linear-gradient\(\s*([\d.-]+)deg/)?.[1] ?? 180) * Math.PI / 180
                const x = (rect.left + rect.width / 2 - surface.left) / surface.width - .5
                const y = (rect.top + rect.height / 2 - surface.top) / surface.height - .5
                const position = Math.max(0, Math.min(1, .5 + Math.sin(angle) * x - Math.cos(angle) * y)) * (samples.length - 1)
                const index = Math.min(samples.length - 2, Math.floor(position))
                const progress = position - index
                const first = samples[index], second = samples[index + 1]
                const alpha = first.alpha * (1 - progress) + second.alpha * progress
                return { brightness: alpha ? (first.brightness * first.alpha * (1 - progress) + second.brightness * second.alpha * progress) / alpha : 0, alpha }
            }
        }

        return {
            brightness: samples.reduce((sum, sample) => sum + sample.brightness * sample.alpha, 0) / alphaSum,
            alpha: alphaSum / samples.length,
        }
    }

    function getVibeControlRoot() {
        return (
            getVibeBackgroundTarget() ||
            document.querySelector('[class*="DefaultLayout_rootNewWave"]') ||
            document.querySelector('[class*="Content_rootOld"][class*="newVibe"]') ||
            document.querySelector(VIBE_BACKGROUND_SURFACE_SELECTOR) ||
            document.querySelector(OLD_VIBE_SELECTOR)
        )
    }

    function isVisibleRect(rect) {
        return !!rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth
    }

    function getVibeControlNodes() {
        const root = getVibeControlRoot()
        if (!root) return Array.from(document.querySelectorAll(VIBE_CONTROL_SELECTOR))
        const semanticControls = Array.from(root.querySelectorAll(VIBE_CONTROL_SELECTOR))
        if (semanticControls.length) return semanticControls

        const rootRect = root.getBoundingClientRect()
        const nodes = new Set()
        root.querySelectorAll(VIBE_CONTROL_SELECTOR).forEach(node => nodes.add(node))

        const cover = Array.from(root.querySelectorAll('img'))
            .map(node => ({ node, rect: node.getBoundingClientRect() }))
            .filter(({ rect }) => {
                const ratio = rect.width / rect.height
                const centerX = rect.left + rect.width / 2
                return (
                    isVisibleRect(rect) &&
                    rect.width >= 48 &&
                    rect.width <= 180 &&
                    rect.height >= 48 &&
                    rect.height <= 180 &&
                    ratio >= 0.75 &&
                    ratio <= 1.33 &&
                    centerX >= rootRect.left + rootRect.width * 0.28
                )
            })
            .sort((a, b) => Math.abs(a.rect.width - 96) - Math.abs(b.rect.width - 96))[0]

        root.querySelectorAll('button,[role="button"]').forEach(node => {
            const rect = node.getBoundingClientRect()
            if (!isVisibleRect(rect) || rect.height < 28 || rect.height > 100 || rect.width < 28 || rect.width > rootRect.width * 0.7) return

            const centerX = rect.left + rect.width / 2
            const centerY = rect.top + rect.height / 2
            if (cover) {
                const coverCenterX = cover.rect.left + cover.rect.width / 2
                if (
                    centerY >= cover.rect.bottom - 12 &&
                    centerY <= cover.rect.bottom + 250 &&
                    Math.abs(centerX - coverCenterX) <= rootRect.width * 0.4
                ) {
                    nodes.add(node)
                }
                return
            }

            if (
                centerX >= rootRect.left + rootRect.width * 0.3 &&
                centerY >= rootRect.top + rootRect.height * 0.35 &&
                centerY <= rootRect.top + rootRect.height * 0.9
            ) {
                nodes.add(node)
            }
        })

        return Array.from(nodes).filter(node => isVisibleRect(node.getBoundingClientRect?.()))
    }

    function getRenderedVibeBackgroundImageURL() {
        const root = getVibeBackgroundTarget()
        if (!root) return null

        const cover = root.querySelector('.bg-cover')
        for (const node of [cover, root]) {
            if (!node) continue
            const match = getComputedStyle(node).backgroundImage.match(/url\(["']?(.+?)["']?\)/i)
            if (match?.[1]) return match[1]
        }
        return null
    }

    function renderedVibeBackgroundBrightness() {
        const control = getVibeControlNodes()[0]
        const candidates = new Set()
        if (!getVibeBackgroundTarget() && !document.querySelector(NEW_WAVE_SELECTOR)) return 0

        if (control) {
            const rect = control.getBoundingClientRect()
            document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2).forEach(node => candidates.add(node))

            let parent = control.parentElement
            for (let depth = 0; parent && depth < 12; depth++, parent = parent.parentElement) candidates.add(parent)
        }

        ;[
            ...document.querySelectorAll(VIBE_BACKGROUND_SURFACE_SELECTOR),
            getVibeBackgroundTarget(),
            document.querySelector('[class*="DefaultLayout_rootNewWave"]'),
            document.querySelector('[class*="Content_rootOld"][class*="newVibe"]'),
        ].forEach(node => {
            if (node) candidates.add(node)
        })

        let accumulatedBrightness = 0
        let accumulatedAlpha = 0
        for (const node of candidates) {
            if (!(node instanceof Element) || node.matches?.('button,[role="button"],.colorize-palette-background') || node.closest?.('button,[role="button"]')) continue

            for (const pseudo of ['::after', '::before', null]) {
                const style = getComputedStyle(node, pseudo)
                if (pseudo && style.content === 'none') continue

                const opacity = Math.min(1, Math.max(0, Number.parseFloat(style.opacity) || 0))
                const samples = [gradientColorSample(style.backgroundImage, node), parseComputedColor(style.backgroundColor, node)].filter(Boolean)

                for (const sample of samples) {
                    const alpha = sample.alpha * opacity * (1 - accumulatedAlpha)
                    accumulatedBrightness += sample.brightness * alpha
                    accumulatedAlpha += alpha
                    if (accumulatedAlpha >= 0.95) return accumulatedBrightness
                }
            }
        }

        if (accumulatedAlpha > 0.05) return accumulatedBrightness

        const target = getVibeBackgroundTarget() || document.documentElement
        const style = getComputedStyle(target)
        for (const property of ['--average-color-background', '--player-average-color-background', '--ym-background-color-primary-enabled-vibe']) {
            const sample = parseComputedColor(style.getPropertyValue(property).trim(), target)
            if (sample) return sample.brightness * sample.alpha
        }

        return 0
    }

    const fallbackHSL = () => {
        const root = document.querySelector('[class*="PlayerBarDesktop_root"]')
        if (!root)
            return [
                { h: 0, s: 0, l: 50 },
                { h: 0, s: 0, l: 50 },
            ]
        const v = getComputedStyle(root).getPropertyValue('--player-average-color-background')
        const m = v.match(/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/)
        const hsl = m ? { h: +m[1], s: +m[2], l: +m[3] } : { h: 0, s: 0, l: 50 }
        return [hsl, hsl]
    }

    /*──────────────────────── palette & vars ────────────────*/
    const buildVars = base => {
        const vars = {}
        for (let i = 1; i <= 10; i++) {
            const lHi = base.l + ((80 - base.l) * i) / 10
            const lLo = base.l - (base.l * i) / 10
            vars[`--color-light-${i}`] = H({ ...base, l: lHi })
            vars[`--color-dark-${i}`] = H({ ...base, l: lLo })
            for (let a = 1; a <= 10; a++) {
                vars[`--color-light-${i}-${a}`] = HA({ ...base, l: lHi }, a / 10)
                vars[`--color-dark-${i}-${a}`] = HA({ ...base, l: lLo }, a / 10)
            }
        }
        vars['--grad-main'] = `linear-gradient(120deg,
        hsl(${base.h},${base.s}%,${Math.max(0, base.l - 25)}%) 0%,
        hsl(${base.h},${base.s}%,${Math.min(100, base.l + 25)}%) 100%)`
        return vars
    }

    /*──────────────────────── YM_MAP + кастом-CSS ───────────*/
    const CUSTOM_THEME_CSS = `

    [class*="DefaultLayout_root__"], [class*="CommonLayout_root__"]{
      background:transparent !important;
    }


    .ChangeVolume_root__HDxtA
    {
    max-width:160px;
    }

    .DefaultLayout_content__md70Z .MainPage_root__STXqc::-webkit-scrollbar
    {
    width:0;
    }

    .MainPage_landing___FGNm
    {
    padding-right:24px;
    }

    .SyncLyrics_content__lbkWP:after, .SyncLyrics_content__lbkWP:before
    {
    display:none;
    }

    .NavbarDesktop_logoLink__KR0Dk
    {
    margin-top:15px;
    }

    [class*="VibeBlock_vibeAnimation"] canvas
    {
    opacity:.2 !important;
    filter:blur(360px) !important;
    }

    .VibeBlock_vibeAnimation__XVEE6:after
    {
    background:transparent !important;
    }

    .CollectionPage_collectionColor__M5l1f,
    .ygfy3HHHNs5lMz5mm4ON,
    .yvGpKZBZLwidMfMcVMR3
    {
    color:var(--ym-logo-color-primary-variant);
    }

    .kc5CjvU5hT9KEj0iTt3C
    {backdrop-filter:none;
    }

    .kc5CjvU5hT9KEj0iTt3C:hover,
    .kc5CjvU5hT9KEj0iTt3C:focus
    {
    backdrop-filter:saturate(180%) blur(15px);
    }

    ::placeholder
    {
    color:var(--color-light-4-10) !important;
    }

    .PSBpanel
    {
      color:var(--ym-logo-color-primary-variant) !important;
      font-weight:500 !important;
      left:0; right:0 !important;
      display:flex; justify-content:center;
    }

    .mdbxU6IWInQTsVjwnapn
    {
    background:var(--color-light-5) !important;
    }

    .xZzTMqgg0qtV5vqUIrkK
    {
    background-color:var(--color-dark-3-6) !important;
    }

    .FullscreenPlayerDesktop_poster_withSyncLyricsAnimation__bPO0o, .FullscreenPlayerDesktop_important__dGfiL,
    .SyncLyricsCard_root__92qn_
    {
    inset-block-end:35px !important;
    }

    .CommonLayout_root__WC_W1
    {
      background:radial-gradient(circle at 70% 70%,
        var(--ym-background-color-secondary-enabled-blur)      0%,
        var(--ym-background-color-primary-enabled-content)    70%,
        var(--ym-background-color-primary-enabled-basic)     100%) !important;
    }

    .Navbar_root__chfAR,
    .EntitySidebar_root__D1fGh,
    .Divider_root__99zZ{
      background:radial-gradient(circle at 70% 70%,
        var(--ym-background-color-secondary-enabled-blur)      0%,
        var(--ym-background-color-primary-enabled-content)    70%,
        var(--ym-background-color-primary-enabled-basic)     100%) !important;
    }

    .VibeContext_context__Z_82k,
    .VibeSettings_toggleSettingsButton__j6fIU,
    .VibeContext_pinButton__b6SNF{
        backdrop-filter: blur(25px);
        background-color: rgba(0, 0, 0, 0.15);
    }

    .Root{
    background: var(--ym-background-color-primary-enabled-content) !important
    }
`

    const paletteTransition = createPaletteTransition()
    const updateWheelIconTint = createWheelIconTint()
    let lastPaletteSignature = ''
    const applyVars = vars => {
        const signature = JSON.stringify(vars)
        if (signature === lastPaletteSignature && document.getElementById('colorize-style')) return
        const previousBackgrounds = signature !== lastPaletteSignature ? paletteTransition.before() : []
        lastPaletteSignature = signature
        let st = document.getElementById('colorize-style')
        const created = !st
        if (!st) {
            st = document.createElement('style')
            st.id = 'colorize-style'
            document.head.appendChild(st)
        }
        let css = '.ym-dark-theme{\n'
        css += varsToCss(vars) + '\n'
        css += varsToCss(YM_VARS) + '\n'
        css += CUSTOM_THEME_CSS + '\n}'
        css += buildNewWavePaletteCss(vars)
        css += '\nhtml:root{\n' + varsToCss(vars) + '\n' + varsToCss(INLINE_YM_VARS) + '\n}'
        applyInlinePaletteVars(vars)
        st.textContent = css
        paletteTransition.after(previousBackgrounds)
        updateWheelIconTint()
        LOG_CHANGE('applyVars', 'палитра и CSS темы применены', {
            styleCreated: created,
            paletteVariables: Object.keys(vars).length,
            ymVariables: Object.keys(YM_VARS).length,
        })
    }

    const PALETTE_LEAK_TARGETS = [
        'body',
        '.ym-dark-theme',
        '[class*="Content_rootOld_newVibe"]',
        '[class*="Content_rootOld"][class*="newVibe"]',
        '[class*="DefaultLayout_rootNewWave"]',
        '[class*="VibePage_root"]',
        '[class*="VibePage"]',
        '[data-test-id="MAIN_PAGE"]',
        '[class*="VibePlayerBar"]',
        '[class*="PlayerBar"]',
    ].join(',')

    const COMMON_YM_VARS = {
        '--ym-background-color-primary-enabled-basic': 'var(--color-dark-8)',
        '--ym-background-color-primary-enabled-content': 'var(--color-dark-6)',
        '--ym-background-color-primary-enabled-popover': 'var(--color-dark-7-9)',
        '--ym-background-color-secondary-enabled-blur': 'var(--color-light-1)',
        '--ym-controls-color-primary-default-enabled': 'var(--color-light-10)',
        '--ym-controls-color-primary-default-hovered': 'var(--color-light-8)',
        '--ym-controls-color-primary-text-enabled': 'var(--color-light-10-5)',
        '--ym-controls-color-primary-text-enabled_variant': 'var(--color-light-10-10)',
        '--ym-controls-color-primary-text-hovered': 'var(--color-light-7)',
        '--ym-controls-color-secondary-default-enabled': 'var(--color-dark-5)',
        '--ym-controls-color-secondary-default-hovered': 'var(--color-dark-3)',
        '--ym-controls-color-secondary-card-enabled': 'var(--color-dark-5-7)',
        '--ym-controls-color-secondary-card-hovered': 'var(--color-light-5-5)',
        '--ym-controls-color-secondary-text-enabled': 'var(--color-light-10-10)',
        '--ym-controls-color-secondary-text-disabled': 'var(--color-light-4)',
        '--ym-controls-color-secondary-on_default-enabled': 'var(--color-light-10-10)',
        '--ym-controls-color-secondary-on_default-hovered': 'var(--color-light-10-10)',
        '--ym-logo-color-primary-variant': 'var(--color-light-10)',
    }

    const SCOPED_YM_VARS = {
        '--ym-surface-color-primary-enabled-list': 'var(--color-light-1-4)',
        '--ym-controls-color-secondary-outline-enabled_stroke': 'var(--color-light-10-10)',
        '--ym-controls-color-primary-text-disabled': 'var(--ym-controls-color-secondary-outline-enabled_stroke)',
        '--ym-controls-color-secondary-outline-hovered_stroke': 'var(--color-light-5)',
        '--ym-controls-color-secondary-on_outline-enabled': 'var(--color-light-10-8)',
        '--ym-controls-color-primary-outline-enabled': 'var(--color-dark-1-10)',
        '--ym-controls-color-secondary-outline-selected': 'var(--color-dark-3)',
        '--ym-controls-color-primary-default-disabled': 'var(--color-light-4)',
        '--ym-controls-color-secondary-default-disabled': 'var(--color-dark-1)',
        '--id-default-color-dark-surface-elevated-0': 'var(--color-dark-6)',
    }

    const YM_VARS = { ...COMMON_YM_VARS, ...SCOPED_YM_VARS }

    const NEW_WAVE_VARS = {
        '--ym-background-color-primary-enabled-vibe': 'var(--color-dark-6)',
        '--ym-controls-color-secondary-text-enabled_variant': 'var(--color-light-8)',
        '--ym-slider-color-primary-enabled': 'var(--color-light-8)',
        '--player-average-color-background': 'var(--color-dark-5)',
        '--average-color-background': 'var(--color-dark-5)',
        '--vibe-gradient-stop-0': 'var(--color-dark-8)',
        '--vibe-gradient-stop-1': 'var(--color-dark-5)',
        '--vibe-gradient-stop-2': 'var(--color-light-1)',
    }

    const INLINE_YM_VARS = { ...COMMON_YM_VARS, ...NEW_WAVE_VARS }
    const INLINE_YM_VAR_KEYS = Object.keys(INLINE_YM_VARS)
    const varsToCss = vars =>
        Object.entries(vars)
            .map(([key, value]) => `  ${key}: ${value} !important;`)
            .join('\n')

    const NEW_WAVE_PALETTE_SCOPE = [
        'html.colorize-new-wave-page',
        'html.colorize-new-wave-page [class*="Content_rootOld_newVibe"]',
        'html.colorize-new-wave-page [class*="Content_rootOld"][class*="newVibe"]',
        'html.colorize-new-wave-page [class*="DefaultLayout_rootNewWave"]',
        'html.colorize-new-wave-page [class*="VibePage_root"]',
        'html.colorize-new-wave-page [data-test-id="MAIN_PAGE"]',
    ].join(',\n')

    function buildNewWavePaletteCss(vars) {
        return `\n${NEW_WAVE_PALETTE_SCOPE}{\n${varsToCss(vars)}\n${varsToCss(INLINE_YM_VARS)}\n}\n`
    }

    let inlinePaletteMigrated = false
    function applyInlinePaletteVars(vars) {
        if (!vars) return
        if (inlinePaletteMigrated) return
        inlinePaletteMigrated = true
        cleanupInlinePaletteLeaks(vars)

        for (const key of [...Object.keys(vars), ...INLINE_YM_VAR_KEYS])
            if (document.documentElement.style.getPropertyValue(key)) document.documentElement.style.removeProperty(key)
    }

    function cleanupInlinePaletteLeaks(vars) {
        const keys = [...Object.keys(vars || {}), ...INLINE_YM_VAR_KEYS]
        let nodesChanged = 0
        let propertiesRemoved = 0

        try {
            document.querySelectorAll(PALETTE_LEAK_TARGETS).forEach(node => {
                if (!node?.style || node === document.documentElement) return
                const inlineStyle = node.getAttribute('style') || ''
                if (
                    !inlineStyle.includes('--color-') &&
                    !inlineStyle.includes('--ym-') &&
                    !inlineStyle.includes('--player-average-color-background') &&
                    !inlineStyle.includes('--vibe-gradient-stop-')
                ) {
                    return
                }
                let nodeChanged = false
                keys.forEach(key => {
                    if (!node.style.getPropertyValue(key)) return
                    node.style.removeProperty(key)
                    propertiesRemoved++
                    nodeChanged = true
                })
                if (nodeChanged) nodesChanged++
            })
        } catch {}
        if (propertiesRemoved) {
            LOG_CHANGE('cleanupInlinePaletteLeaks', 'удалены конфликтующие inline-переменные', { nodesChanged, propertiesRemoved })
        }
    }

    /*───────── overlay with var(--grad-main) ─────────*/
    function ensureGradientOverlay() {
        const changed = !document.body.classList.contains('sc-has-grad')
        document.body.classList.add('sc-has-grad')
        if (changed) LOG_CHANGE('ensureGradientOverlay', 'включён слой --grad-main для body')
    }

    /*──────────────────────── effects ───────────────────────*/
    let SETTINGS = {}
    let lastSETTINGS_JSON = ''
    let lastSrc = '',
        lastHex = '',
        lastFullVibe = null
    let lastBackgroundImage = null
    let lastStaticBackground = null
    let lastAvatarZoom = null
    let lastRemoveBorder = null
    let lastVibeContrastLogSignature = ''
    let lastBackgroundURL = ''
    let pendingBackgroundURL = ''
    let lastPageURL = location.href

    function getHiResCover() {
        const src = coverSrcFromImg(getCoverNode())
        return src ? normalizeCoverURL(src, '1000x1000') : null
    }

    function cleanupForeignBackgroundLayers(target) {
        let removed = 0
        document.querySelectorAll('.bg-layer').forEach(layer => {
            if (target && target.contains(layer)) return
            layer.remove()
            removed++
        })
        if (removed) LOG_CHANGE('cleanupForeignBackgroundLayers', 'удалены фоновые слои вне текущего Vibe', { removed, target: nodeName(target) })
    }

    function fadeOutBackgroundLayers(layers) {
        const count = layers.length
        layers.forEach(layer => {
            layer.classList.add('bg-layer-removing')
            setTimeout(() => layer.remove(), 700)
        })
        if (count) LOG_CHANGE('fadeOutBackgroundLayers', 'запущено плавное удаление фона', { layers: count, removeAfterMs: 700 })
    }

    function backgroundReplace(imageURL) {
        const target = getVibeBackgroundTarget()
        cleanupForeignBackgroundLayers(target)
        if (!target || !imageURL) {
            if (!target) lastBackgroundURL = ''
            return
        }
        if (imageURL === lastBackgroundURL && target.querySelector('.bg-layer')) return
        if (imageURL === pendingBackgroundURL) return
        pendingBackgroundURL = imageURL
        target.style.setProperty('position', 'relative', 'important')
        target.style.setProperty('overflow', 'hidden', 'important')
        target.style.setProperty('isolation', 'isolate', 'important')
        LOG_CHANGE('backgroundReplace', 'подготовлен Vibe-контейнер для фона', { target: nodeName(target), imageURL })

        const img = new Image()
        img.crossOrigin = 'anonymous'

        img.onload = () => {
            if (pendingBackgroundURL !== imageURL) return
            pendingBackgroundURL = ''
            if (!SETTINGS.enableBackgroundImage || !target.isConnected || target !== getVibeBackgroundTarget()) return
            lastBackgroundURL = imageURL

            const wrapper = document.createElement('div')
            wrapper.className = 'bg-layer'

            const imageLayer = document.createElement('div')
            imageLayer.className = 'bg-cover'
            imageLayer.style.backgroundImage = `url("${imageURL}")`

            const gradient = document.createElement('div')
            gradient.className = 'bg-gradient'

            fadeOutBackgroundLayers(target.querySelectorAll('.bg-layer'))

            wrapper.appendChild(imageLayer)
            wrapper.appendChild(gradient)
            target.insertBefore(wrapper, target.firstChild)
            LOG_CHANGE('backgroundReplace', 'добавлен новый фоновый слой', { target: nodeName(target), imageURL })

            requestAnimationFrame(() => {
                imageLayer.classList.add('bg-cover-visible')
                LOG_CHANGE('backgroundReplace', 'фоновая обложка показана', { imageURL })
            })
        }

        img.onerror = () => {
            if (pendingBackgroundURL === imageURL) pendingBackgroundURL = ''
            console.warn('[backgroundReplace] Ошибка загрузки изображения:', imageURL)
        }
        img.src = imageURL
    }

    function removeBackgroundImage() {
        const layers = document.querySelectorAll('.bg-layer')
        lastBackgroundURL = null
        pendingBackgroundURL = ''
        if (!layers.length) return

        fadeOutBackgroundLayers(layers)
        LOG_CHANGE('removeBackgroundImage', 'фоновая обложка отключена', { layers: layers.length })
    }

    function syncVibeButtonContrast(enabled, brightBackground, details = {}) {
        const active = enabled && brightBackground && !!(getVibeBackgroundTarget() || document.querySelector(NEW_WAVE_SELECTOR))
        const rootWasActive = document.documentElement.classList.contains('colorize-bright-vibe-controls')
        document.documentElement.classList.toggle('colorize-bright-vibe-controls', active)
        const nextNodes = new Set(active ? getVibeControlNodes() : [])
        let markersAdded = 0
        let markersRemoved = 0
        document.querySelectorAll(`.${VIBE_CONTROL_MARKER_CLASS}`).forEach(node => {
            if (nextNodes.has(node)) return
            node.classList.remove(VIBE_CONTROL_MARKER_CLASS)
            markersRemoved++
        })
        nextNodes.forEach(node => {
            if (node.classList.contains(VIBE_CONTROL_MARKER_CLASS)) return
            node.classList.add(VIBE_CONTROL_MARKER_CLASS)
            markersAdded++
        })

        const logDetails = { enabled, brightBackground, active, buttons: nextNodes.size, markersAdded, markersRemoved, ...details }
        const signature = JSON.stringify({ active, buttons: nextNodes.size, mode: details.mode, brightness: details.brightness, source: details.source })
        if (signature !== lastVibeContrastLogSignature || rootWasActive !== active || markersAdded || markersRemoved) {
            lastVibeContrastLogSignature = signature
            LOG_CHANGE('syncVibeButtonContrast', active ? 'кнопки Vibe затемнены' : 'затемнение кнопок Vibe снято', logDetails)
        }
    }

    let avatarAnimationFrame = 0
    let avatarPointerEvent = null

    function handleAvatarMouseMove(event) {
        avatarPointerEvent = event
        if (avatarAnimationFrame) return

        const avatar = this
        avatarAnimationFrame = requestAnimationFrame(() => {
            avatarAnimationFrame = 0
            const rect = avatar.getBoundingClientRect()
            const x = ((avatarPointerEvent.clientX - rect.left) / rect.width - 0.5) * 9
            const y = ((avatarPointerEvent.clientY - rect.top) / rect.height - 0.5) * 9
            const translateX = Math.max(-45, Math.min(45, -x * 11))
            const translateY = Math.max(-45, Math.min(45, -y * 11))
            avatar.style.transform = `scale(1.8) translate(${translateX}px, ${translateY}px)`
            LOG_CHANGE_THROTTLED('avatar-transform', 500, 'handleAvatarMouseMove', 'изменён transform аватара', {
                translateX: +translateX.toFixed(1),
                translateY: +translateY.toFixed(1),
            })
        })
    }

    function handleAvatarMouseLeave() {
        if (avatarAnimationFrame) cancelAnimationFrame(avatarAnimationFrame)
        avatarAnimationFrame = 0
        this.style.transform = 'scale(1)'
        LOG_CHANGE('handleAvatarMouseLeave', 'transform аватара сброшен')
    }

    function setupAvatarZoomEffect() {
        const avatar = document.querySelector('[class*="PageHeaderCover_coverImage"]')
        if (!avatar || avatar.classList.contains('avatar-zoom-initialized')) return
        avatar.classList.add('avatar-zoom-initialized')
        avatar.addEventListener('mousemove', handleAvatarMouseMove)
        avatar.addEventListener('mouseleave', handleAvatarMouseLeave)
        LOG_CHANGE('setupAvatarZoomEffect', 'эффект зума аватара подключён', { target: nodeName(avatar) })
    }

    function removeAvatarZoomEffect() {
        const avatar = document.querySelector('[class*="PageHeaderCover_coverImage"]')
        if (avatar && avatar.classList.contains('avatar-zoom-initialized')) {
            avatar.removeEventListener('mousemove', handleAvatarMouseMove)
            avatar.removeEventListener('mouseleave', handleAvatarMouseLeave)
            avatar.classList.remove('avatar-zoom-initialized')
            avatar.style.removeProperty('transform')
            LOG_CHANGE('removeAvatarZoomEffect', 'эффект зума аватара отключён', { target: nodeName(avatar) })
        }
    }

    function syncFullVibe(force = false) {
        const fullVibeNow = !!SETTINGS.FullVibe
        if (lastNewWaveState) {
            lastFullVibe = fullVibeNow
            return
        }

        const oldVibe = document.querySelector(OLD_VIBE_SELECTOR)
        const currentHeight = oldVibe?.style.getPropertyValue('height')
        const targetHeight = fullVibeNow ? '88.35vh' : '0'
        const sizeApplied = fullVibeNow ? currentHeight === '88.35vh' : currentHeight === '0' || currentHeight === '0px'

        if (oldVibe && (fullVibeNow !== lastFullVibe || force || !sizeApplied)) {
            lastFullVibe = fullVibeNow
            oldVibe.style.setProperty('height', targetHeight, 'important')
            LOG_CHANGE('syncFullVibe', 'изменена высота старого Vibe', { enabled: fullVibeNow, height: targetHeight, target: nodeName(oldVibe) })
        }
    }

    let recolorTimer = null
    let recolorRunning = false
    let recolorQueued = false
    let recolorForceQueued = false
    let pendingPaletteCover = null
    let contrastCache = null

    function scheduleRecolor(force = false, delay = 120) {
        if (pendingPaletteCover && (SETTINGS.useCustomColor || pendingPaletteCover !== coverURL()))
            COVER_ANALYSIS_CANCEL.get(pendingPaletteCover)?.()
        recolorForceQueued = recolorForceQueued || force
        if (recolorTimer) clearTimeout(recolorTimer)
        recolorTimer = setTimeout(runScheduledRecolor, force ? 0 : delay)
    }

    async function runScheduledRecolor() {
        if (recolorTimer) {
            clearTimeout(recolorTimer)
            recolorTimer = null
        }

        if (recolorRunning) {
            recolorQueued = true
            return
        }

        recolorRunning = true
        const force = recolorForceQueued
        recolorForceQueued = false

        try {
            await recolor(force)
        } catch (e) {
            LOG('recolor error', e)
        } finally {
            recolorRunning = false
            if (recolorQueued || recolorForceQueued) {
                const nextForce = recolorForceQueued
                recolorQueued = false
                scheduleRecolor(nextForce, 0)
            }
        }
    }

    const recolor = async (force = false) => {
        syncWaveLayoutState()
        syncFullVibe(force)

        const src = coverURL()
        const useHex = SETTINGS.useCustomColor
        const hex = SETTINGS.baseColor || ''
        const stale = () => useHex !== SETTINGS.useCustomColor || (useHex ? hex !== (SETTINGS.baseColor || '') : src !== coverURL())

        let base, gradC1, gradC2
        let coverAnalysis = null
        let paletteChanged = force

        if (useHex) {
            paletteChanged = force || hex !== lastHex
            if (paletteChanged) {
                gradC1 = gradC2 = base = normL(parseHEX(hex))
                lastHex = hex
            }
        } else {
            paletteChanged = force || src !== lastSrc
            if (paletteChanged) {
                pendingPaletteCover = src
                coverAnalysis = await analyzeCover(src)
                pendingPaletteCover = null
                if (stale()) { scheduleRecolor(false, 0); return }
                const pair = coverAnalysis?.colors || fallbackHSL()
                if (!pair) return
                ;[gradC1, gradC2] = pair
                base = {
                    h: Math.round((gradC1.h + gradC2.h) / 2),
                    s: +((gradC1.s + gradC2.s) / 2).toFixed(1),
                    l: +((gradC1.l + gradC2.l) / 2).toFixed(1),
                }
                lastSrc = src
            }
        }

        if (paletteChanged) {
            applyVars(buildVars(base))
            ensureGradientOverlay()
            LOG_CHANGE('recolor', 'базовый цвет темы обновлён', {
                source: useHex ? 'settings' : 'cover',
                hsl: base,
                coverURL: useHex ? undefined : src,
            })
        }

        const backgroundImageNow = !!SETTINGS.enableBackgroundImage
        const image = backgroundImageNow ? getHiResCover() : null
        if (backgroundImageNow !== lastBackgroundImage || force) {
            const previous = lastBackgroundImage
            lastBackgroundImage = backgroundImageNow
            if (!backgroundImageNow) removeBackgroundImage()
            if (previous !== backgroundImageNow) {
                LOG_CHANGE('recolor', 'переключён режим фоновой обложки', { enabled: backgroundImageNow })
            }
        }
        if (backgroundImageNow && image) backgroundReplace(image)

        const autoVibeButtonContrastNow = SETTINGS.autoVibeButtonContrast !== false
        let brightVibeBackground = false
        let contrastMode = 'disabled'
        let contrastBrightness = null
        let contrastSource = null
        const contrastRoot = getVibeControlRoot()
        const contrastKey = JSON.stringify([lastPaletteSignature, backgroundImageNow, src, autoVibeButtonContrastNow, location.href])
        const cachedContrast = !force && contrastCache?.key === contrastKey && contrastCache.root === contrastRoot && (contrastCache.contrastMode !== 'rendered-background' || performance.now() - contrastCache.measuredAt < 750) ? contrastCache : null
        if (cachedContrast) {
            ;({ brightVibeBackground, contrastMode, contrastBrightness, contrastSource } = cachedContrast)
        } else if (autoVibeButtonContrastNow) {
            if (backgroundImageNow && image && src) {
                if (!coverAnalysis) coverAnalysis = await analyzeCover(src)
                brightVibeBackground = isBrightCover(coverAnalysis)
                contrastMode = 'background-image'
                contrastBrightness = coverAnalysis
                    ? Math.max(coverAnalysis.brightness, coverAnalysis.controlRegionBrightness || 0)
                    : null
                contrastSource = src
            } else {
                const renderedBrightness = renderedVibeBackgroundBrightness()
                contrastMode = 'rendered-background'
                contrastBrightness = renderedBrightness
                contrastSource = VIBE_BACKGROUND_SURFACE_SELECTOR
                brightVibeBackground = renderedBrightness >= BRIGHT_RENDERED_BACKGROUND_THRESHOLD
                const renderedBackgroundImageURL = getRenderedVibeBackgroundImageURL()
                if (!brightVibeBackground && renderedBackgroundImageURL) {
                    const renderedImageAnalysis = await analyzeCover(renderedBackgroundImageURL)
                    const renderedImageBrightness = renderedImageAnalysis
                        ? Math.max(renderedImageAnalysis.brightness, renderedImageAnalysis.controlRegionBrightness || 0)
                        : 0
                    contrastBrightness = Math.max(contrastBrightness, renderedImageBrightness)
                    contrastSource = renderedBackgroundImageURL
                    brightVibeBackground = isBrightCover(renderedImageAnalysis)
                }
            }
        }
        if (stale()) { scheduleRecolor(false, 0); return }
        contrastCache = { measuredAt: cachedContrast?.measuredAt ?? performance.now(), key: contrastKey, root: contrastRoot, brightVibeBackground, contrastMode, contrastBrightness, contrastSource }
        syncVibeButtonContrast(autoVibeButtonContrastNow, brightVibeBackground, {
            mode: contrastMode,
            brightness: contrastBrightness === null ? null : +contrastBrightness.toFixed(3),
            thresholds:
                contrastMode === 'rendered-background'
                    ? { renderedBackground: BRIGHT_RENDERED_BACKGROUND_THRESHOLD }
                    : {
                          average: BRIGHT_AVERAGE_THRESHOLD,
                          brightPixelRatio: BRIGHT_PIXEL_RATIO_THRESHOLD,
                          controlRegion: BRIGHT_CONTROL_REGION_THRESHOLD,
                          brightControlRegionRatio: BRIGHT_CONTROL_REGION_RATIO_THRESHOLD,
                      },
            source: contrastSource,
        })

        const staticBackgroundNow = !!SETTINGS.staticBackground
        if (staticBackgroundNow !== lastStaticBackground || force) {
            lastStaticBackground = staticBackgroundNow
            document.documentElement.classList.toggle('bg-static-mode', staticBackgroundNow)
            LOG_CHANGE('recolor', 'переключена анимация фона', { staticBackground: staticBackgroundNow })
        }

        const removeBorderNow = !!SETTINGS.removeBorder
        if (removeBorderNow !== lastRemoveBorder || force) {
            lastRemoveBorder = removeBorderNow
            document.documentElement.classList.toggle('colorize-borderless', removeBorderNow)
            LOG_CHANGE('recolor', 'переключены рамки и тени интерфейса', { borderless: removeBorderNow })
        }

        const avatarZoomNow = !!SETTINGS.enableAvatarZoom
        if (avatarZoomNow !== lastAvatarZoom || force) {
            lastAvatarZoom = avatarZoomNow
            if (!avatarZoomNow) removeAvatarZoomEffect()
        }
        if (avatarZoomNow) setupAvatarZoomEffect()
    }

    const handleSettingsChange = () => {
        const newSettings = getSettings()
        const newJSON = JSON.stringify(newSettings)
        if (newJSON === lastSETTINGS_JSON) return

        const changedKeys = Object.keys(newSettings).filter(key => key !== 'onChange' && SETTINGS[key] !== newSettings[key])
        SETTINGS = newSettings
        lastSETTINGS_JSON = newJSON
        LOG('Настройки изменились -> перекрашиваем')
        LOG_CHANGE('handleSettingsChange', 'получены новые настройки темы', { changedKeys })
        scheduleRecolor(true)
    }

    const initSettings = async () => {
        if (!window.pulsesyncApi || typeof window.pulsesyncApi.getSettings !== 'function') {
            setTimeout(initSettings, 1000)
            return
        }

        let api = null
        try {
            api = window.pulsesyncApi.getSettings(ADDON_NAME)
        } catch (e) {
            LOG('settings api error', e)
        }
        if (!api || typeof api.onChange !== 'function') {
            setTimeout(initSettings, 1000)
            return
        }

        themeSettingsStore = api
        SETTINGS = getSettings()
        lastSETTINGS_JSON = JSON.stringify(SETTINGS)
        api.onChange(handleSettingsChange)
        syncWaveLayoutState()
        checkVibeReturn()
        scheduleRecolor(true, 0)
        await runScheduledRecolor()
        LOG_CHANGE('initSettings', 'тема инициализирована и слушатель настроек подключён')
    }

    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', initSettings) : initSettings()

    const RECOLOR_DOM_SELECTOR = [
        OLD_VIBE_SELECTOR,
        NEW_WAVE_SELECTOR,
        '[data-test-id="MAIN_PAGE"]',
        '[data-test-id="FULLSCREEN_PLAYER_MODAL"]',
        'div[data-test-id="PLAYERBAR_DESKTOP_COVER_CONTAINER"]',
        '[data-test-id="PLAYERBAR_DESKTOP"] img',
        'img[data-test-id="ENTITY_COVER_IMAGE"]',
        'img[class*="AlbumCover_cover"]',
        '[class*="PlayerBarDesktopWithBackgroundProgressBar_cover"]',
    ].join(',')

    function nodeTouchesRecolorTarget(node) {
        if (!node || node.nodeType !== 1) return false
        try {
            return (
                node.matches?.(RECOLOR_DOM_SELECTOR) ||
                !!node.querySelector?.(RECOLOR_DOM_SELECTOR) ||
                !!node.closest?.(OLD_VIBE_SELECTOR) ||
                !!node.closest?.(NEW_WAVE_SELECTOR)
            )
        } catch {
            return false
        }
    }

    function mutationTouchesRecolorTarget(mutations) {
        return mutations.some(mutation => {
            if (mutation.type === 'attributes') {
                return nodeTouchesRecolorTarget(mutation.target)
            }

            for (const node of mutation.addedNodes) {
                if (nodeTouchesRecolorTarget(node)) return true
            }
            for (const node of mutation.removedNodes) {
                if (nodeTouchesRecolorTarget(node)) return true
            }
            return false
        })
    }

    document.addEventListener('load', event => {
        if (event.target?.matches?.(PRIMARY_COVER_SELECTOR)) {
            coverNodeCacheTime = 0
            scheduleRecolor(false, 0)
        }
    }, true)

    new MutationObserver(mutations => {
        if (!mutationTouchesRecolorTarget(mutations)) return
        syncWaveLayoutState()
        const coverChanged = mutations.some(mutation => mutation.type === 'attributes' && mutation.target.matches?.('img'))
        scheduleRecolor(false, coverChanged ? 0 : 120)
    }).observe(document.body, {
        attributes: true,
        attributeFilter: ['src', 'srcset'],
        childList: true,
        subtree: true,
    })

    function checkVibeReturn() {
        let lastCover = ''
        return setInterval(() => {
            if (document.hidden || (!SETTINGS.enableBackgroundImage && SETTINGS.autoVibeButtonContrast === false)) return

            syncWaveLayoutState()
            const vibe = getVibeControlRoot()
            if (!vibe) return

            if (SETTINGS.autoVibeButtonContrast !== false) scheduleRecolor(false)
            if (!SETTINGS.enableBackgroundImage) return

            const src = coverURL()
            if (!src) return

            const hasBackground = vibe.style.backgroundImage?.includes('url(') || !!vibe.querySelector('.bg-layer')

            if (!hasBackground || src !== lastCover) {
                lastCover = src
                scheduleRecolor(false)
            }
        }, 5000)
    }

    document.addEventListener('transitionend', event => {
        if (event.propertyName?.startsWith('--vibe-gradient-stop-') || event.propertyName === 'background-color') {
            contrastCache = null
            scheduleRecolor(false, 0)
        }
    }, true)

    const monitorPageChangeAndSetBackground = () => {
        const handlePageChange = () => {
            const currentURL = location.href
            if (currentURL !== lastPageURL) {
                const previousURL = lastPageURL
                lastPageURL = currentURL
                syncWaveLayoutState()
                scheduleRecolor(false)
                LOG_CHANGE('handlePageChange', 'обнаружена навигация, запланировано перекрашивание', { from: previousURL, to: currentURL })
            }
        }

        ;['pushState', 'replaceState'].forEach(method => {
            const original = history[method]
            if (typeof original !== 'function' || original.__colorizeWrapped) return

            const wrapped = function (...args) {
                const result = original.apply(this, args)
                setTimeout(handlePageChange, 0)
                return result
            }
            wrapped.__colorizeWrapped = true
            history[method] = wrapped
            LOG_CHANGE('monitorPageChangeAndSetBackground', `history.${method} обёрнут для отслеживания навигации`)
        })

        window.addEventListener('popstate', () => setTimeout(handlePageChange, 0))
        window.addEventListener('hashchange', () => setTimeout(handlePageChange, 0))
    }

    monitorPageChangeAndSetBackground()
})()
