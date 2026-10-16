export function createPaletteTransition(duration = 920) {
    const active = new Map<HTMLElement, any>()
    const colorPattern = /rgba?\([^)]*\)/g
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    let initialized = false
    const finish = (node: HTMLElement) => {
        const state = active.get(node)
        if (!state) return
        state.animation?.cancel()
        state.layer.remove()
        node.removeAttribute('data-colorize-palette-fade')
        if (state.positionChanged && node.style.position === 'relative') {
            if (state.position) node.style.setProperty('position', state.position, state.positionPriority)
            else node.style.removeProperty('position')
        }
        active.delete(node)
    }
    const paintedGradient = (state: any) => {
        const progress = Number(state.animation?.effect?.getComputedTiming().progress || 0)
        const from = state.from.match(colorPattern) || []
        let index = 0
        return state.to.replace(colorPattern, (to: string) => {
            const a = from[index++]?.match(/[\d.]+/g)?.map(Number)
            const b = to.match(/[\d.]+/g)?.map(Number)
            if (!a || !b) return to
            const alphaA = a[3] ?? 1, alphaB = b[3] ?? 1
            const alpha = alphaA * (1 - progress) + alphaB * progress
            const channels = [0, 1, 2].map(i => alpha ? (a[i] * alphaA * (1 - progress) + b[i] * alphaB * progress) / alpha : 0)
            return `rgba(${channels.join(',')},${alpha})`
        })
    }
    const clear = () => { for (const node of Array.from(active.keys())) finish(node) }
    const onMotion = () => { if (reduced.matches) clear() }
    reduced.addEventListener('change', onMotion)
    window.addEventListener('pagehide', clear)
    return {
        before() {
            if (!initialized || reduced.matches) return []
            return Array.from(document.querySelectorAll<HTMLElement>(
                '[class*="CommonLayout_root"], [class*="WithTopBanner_root"], [class*="VibePage_root"]',
            )).filter(node => node.isConnected).map(node => {
                const previous = active.get(node)
                const from = previous ? paintedGradient(previous) : getComputedStyle(node).backgroundImage
                finish(node)
                return { node, from }
            })
        },
        after(snapshots: Array<{ node: HTMLElement; from: string }>) {
            initialized = true
            if (reduced.matches) return
            for (const { node, from } of snapshots) {
                if (!node.isConnected || from === 'none' || /url\(/i.test(from)) continue
                const computed = getComputedStyle(node)
                const to = computed.backgroundImage
                if (to === from || to === 'none' || /url\(/i.test(to)) continue
                if (from.replace(colorPattern, '#') !== to.replace(colorPattern, '#')) continue
                const layer = document.createElement('div')
                layer.className = 'colorize-palette-background'
                layer.setAttribute('aria-hidden', 'true')
                layer.style.backgroundImage = from
                const position = node.style.getPropertyValue('position')
                const positionPriority = node.style.getPropertyPriority('position')
                const positionChanged = computed.position === 'static'
                if (positionChanged) node.style.position = 'relative'
                node.setAttribute('data-colorize-palette-fade', '')
                node.prepend(layer)
                const animation = layer.animate([{ opacity: 1 }, { opacity: 0 }], {
                    duration, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards',
                })
                const state = { layer, animation, from, to, position, positionPriority, positionChanged }
                active.set(node, state)
                animation.finished.then(() => { if (active.get(node) === state) finish(node) }).catch(() => {})
            }
        },
        dispose() {
            clear()
            reduced.removeEventListener('change', onMotion)
            window.removeEventListener('pagehide', clear)
        },
    }
}
