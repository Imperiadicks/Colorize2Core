export function createRuntimeScope() {
    let disposed = false
    const timeouts = new Set<number>()
    const intervals = new Set<number>()
    const frames = new Set<number>()
    const observers = new Set<MutationObserver>()
    const images = new Set<HTMLImageElement>()
    const cleanups: Array<() => void> = []
    const styles = new Map<HTMLElement, Map<string, [string, string]>>()
    const scope = {
        get disposed() { return disposed },
        cleanup(fn: unknown) { if (typeof fn === 'function') cleanups.push(fn as () => void) },
        listen(target: EventTarget, type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) {
            target.addEventListener(type, listener, options)
            cleanups.push(() => target.removeEventListener(type, listener, options))
        },
        rememberStyle(node: HTMLElement, ...properties: string[]) {
            let saved = styles.get(node)
            if (!saved) { saved = new Map(); styles.set(node, saved) }
            for (const property of properties) if (!saved.has(property)) {
                saved.set(property, [node.style.getPropertyValue(property), node.style.getPropertyPriority(property)])
            }
        },
        setTimeout(fn: (...args: any[]) => void, delay = 0, ...args: any[]) {
            if (disposed) return 0
            const id = window.setTimeout(() => { timeouts.delete(id); if (!disposed) fn(...args) }, delay)
            timeouts.add(id)
            return id
        },
        clearTimeout(id: number) { window.clearTimeout(id); timeouts.delete(id) },
        setInterval(fn: () => void, delay: number) {
            if (disposed) return 0
            const id = window.setInterval(() => { if (!disposed) fn() }, delay)
            intervals.add(id)
            return id
        },
        requestAnimationFrame(fn: FrameRequestCallback) {
            if (disposed) return 0
            const id = window.requestAnimationFrame(time => { frames.delete(id); if (!disposed) fn(time) })
            frames.add(id)
            return id
        },
        cancelAnimationFrame(id: number) { window.cancelAnimationFrame(id); frames.delete(id) },
        MutationObserver: class extends MutationObserver {
            constructor(callback: MutationCallback) {
                super((records, observer) => { if (!disposed) callback(records, observer) })
                observers.add(this)
            }
        },
        Image: class extends Image {
            constructor(width?: number, height?: number) { super(width, height); images.add(this) }
        },
        dispose() {
            if (disposed) return
            disposed = true
            observers.forEach(observer => observer.disconnect())
            timeouts.forEach(id => window.clearTimeout(id))
            intervals.forEach(id => window.clearInterval(id))
            frames.forEach(id => window.cancelAnimationFrame(id))
            images.forEach(image => { image.onload = image.onerror = null; if (!image.complete) image.src = '' })
            for (const cleanup of cleanups.reverse()) cleanup()
            for (const [node, properties] of styles) for (const [key, [value, priority]] of properties) {
                if (value) node.style.setProperty(key, value, priority)
                else node.style.removeProperty(key)
            }
            styles.clear(); observers.clear(); timeouts.clear(); intervals.clear(); frames.clear(); images.clear()
        },
    }
    return scope
}
