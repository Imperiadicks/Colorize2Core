export function createWheelIconTint() {
    const cache = new Map<string, string>()
    const clamp = (x: number, max = 255) => Math.max(0, Math.min(max, x))
    const transform = (c: number[], m: number[]) => [0, 1, 2].map(i => clamp(m[i * 3] * c[0] + m[i * 3 + 1] * c[1] + m[i * 3 + 2] * c[2]))
    const simulate = (p: number[]) => {
        let c = [255 * p[0], 255 * p[0], 255 * p[0]]
        const t = p[1]
        c = transform(c, [1 - .607 * t, .769 * t, .189 * t, .349 * t, 1 - .314 * t, .168 * t, .272 * t, .534 * t, 1 - .869 * t])
        const s = p[2]
        c = transform(c, [.213 + .787 * s, .715 - .715 * s, .072 - .072 * s, .213 - .213 * s, .715 + .285 * s, .072 - .072 * s, .213 - .213 * s, .715 - .715 * s, .072 + .928 * s])
        const co = Math.cos(p[3] * Math.PI / 180), si = Math.sin(p[3] * Math.PI / 180)
        c = transform(c, [.213 + .787 * co - .213 * si, .715 - .715 * co - .715 * si, .072 - .072 * co + .928 * si,
            .213 - .213 * co + .143 * si, .715 + .285 * co + .140 * si, .072 - .072 * co - .283 * si,
            .213 - .213 * co - .787 * si, .715 - .715 * co + .715 * si, .072 + .928 * co + .072 * si])
        return c.map(x => clamp((clamp(x * p[4]) - 127.5) * p[5] + 127.5))
    }
    const fit = (target: number[]) => {
        const limits = [1, 1, 30, 360, 3, 3]
        const loss = (p: number[]) => simulate(p).reduce((sum, x, i) => sum + (x - target[i]) ** 2, 0)
        let best: number[] = [], score = Infinity
        for (const angle of [0, 90, 180, 270]) {
            let p = [.5, 1, 5, angle, 1, 1], value = loss(p)
            const steps = [.2, .3, 6, 70, .5, .5]
            for (let iteration = 0; iteration < 50; iteration++) {
                for (let i = 0; i < 6; i++) for (const direction of [-1, 1]) {
                    const next = p.slice()
                    next[i] = i === 3 ? (next[i] + direction * steps[i] + 360) % 360 : clamp(next[i] + direction * steps[i], limits[i])
                    const candidate = loss(next)
                    if (candidate < value) { p = next; value = candidate }
                }
                steps.forEach((_, i) => { steps[i] *= .91 })
            }
            if (value < score) { best = p; score = value }
        }
        return `brightness(0) invert(${best[0]}) sepia(${best[1]}) saturate(${best[2]}) hue-rotate(${best[3]}deg) brightness(${best[4]}) contrast(${best[5]})`
    }
    return () => {
        const probe = document.createElement('span')
        probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;color:var(--ym-controls-color-secondary-text-enabled) !important'
        document.documentElement.append(probe)
        const color = getComputedStyle(probe).color
        probe.remove()
        const target = color.match(/[\d.]+/g)?.slice(0, 3).map(Number)
        if (!target || target.length !== 3) return
        let filter = cache.get(color)
        if (!filter) {
            filter = fit(target)
            cache.set(color, filter)
            if (cache.size > 32) cache.delete(cache.keys().next().value!)
        }
        document.documentElement.style.setProperty('--colorize-wheel-icon-filter', filter)
    }
}
