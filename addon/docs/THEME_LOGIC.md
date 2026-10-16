# Colorize2Core: архитектура и логика TypeScript

## Структура пакета

| Файл | Назначение |
| --- | --- |
| `src/runtime-scope.ts` | Учёт таймеров, кадров, изображений, наблюдателей, подписок и изменённых inline-стилей |
| `src/main.ts` | Настройки, анализ обложки, генерация палитры, фоновые слои, контраст, обработка DOM |
| `src/palette-transition.ts` | Переходы фоновых градиентов |
| `src/wheel-icon-tint.ts` | Цветовые фильтры специальных иконок колеса |
| `addon.config.mjs` | Метаданные PulseSync |
| `vite.config.ts` | Конфигурация сборки |

Исходный язык — TypeScript. Vite формирует IIFE-бандл `script.js`; расширение
выходного файла соответствует исполняемому JavaScript в Chromium.
Поле `type` в метаданных имеет значение `script`.
В `src/main.ts` директива `@ts-nocheck` отключает проверку типов основного модуля;
проверка вспомогательных модулей выполняется по `tsconfig.json`.
Примеры в документе извлечены из текущих исходников TypeScript.

## Жизненный цикл темы

CSS Colorize 2 объявляет `--colorize-theme-active: 1` на `:root`.
Внешний наблюдатель Core отслеживает изменения таблиц стилей в `document.head`.
Runtime запускается только при наличии этого признака в computed style.

При отключении темы выполняется освобождение ресурсов `createRuntimeScope`:
отмена таймеров и requestAnimationFrame, отключение MutationObserver содержимого,
отписка от настроек, отмена ожидающего анализа изображений и удаление фоновых слоёв.
Генерируемый stylesheet, управляющие классы и фильтр колеса удаляются;
сохранённые inline-размеры и свойства контейнера восстанавливаются.
Обёртки history возвращаются к исходным функциям, если их не заменил другой код.
Поздние асинхронные результаты не применяются после остановки runtime.

В неактивном состоянии сохраняется только наблюдение за таблицами стилей и их
загрузкой. Периодические проверки, обработка обложек и подписка на настройки отсутствуют.
Повторное включение темы создаёт один runtime с одной подпиской на настройки.

## Настройки темы

Схема настроек расположена в `Colorize-2/addon/handleEvents.json`.
`getSettings()` читает хранилище темы через `pulsesyncApi.getSettings('Colorize 2')`.
Допустимые формы значения: примитив или объект с полями `value`, `bool`, `input`,
`default`, `defaultParameter`. При отсутствии значения применяется fallback.

```ts
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
```

`initSettings` ожидает доступности API, сохраняет хранилище, подключает `onChange`
и запускает первую перекраску. `handleSettingsChange` сравнивает значения настроек
и планирует принудительное обновление.

## Преобразование цветов

`rgb2hsl` принимает каналы RGB в диапазоне 0–255. Результат содержит hue в градусах,
saturation и lightness в процентах. `H` и `HA` формируют CSS-строки HSL и HSLA.

```ts
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
```

`parseHEX` поддерживает короткую и полную HEX-запись, преобразует каналы в HSL.

```ts
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
```

## Анализ обложки

`getCoverNode` выбирает обложку по структурным селекторам, включая старый плеер
`[data-test-id="PLAYERBAR_DESKTOP"]`. `getHiResCover` нормализует URL до размера
1000×1000. `analyzeCover` получает пиксели изображения через canvas, рассчитывает
палитру и показатели яркости. При наличии используется декодированная обложка;
для отдельной загрузки действует таймаут. Ожидающие операции хранятся в карте
отмены `COVER_ANALYSIS_CANCEL`.

Результат обработки проверяется перед применением: смена обложки или переход
на пользовательский цвет делает предыдущий результат устаревшим.
`normL` ограничивает HSL-lightness диапазоном 20–85; `clamp` ограничивает
промежуточные числовые значения при генерации палитры.

## Генерация и применение CSS

`buildVars(base)` формирует светлые и тёмные варианты базового цвета, прозрачные
производные и фоновые градиенты. `COMMON_YM_VARS` и `SCOPED_YM_VARS` связывают
палитру с токенами Яндекс Музыки. `NEW_WAVE_VARS` задаёт токены новой волны.

`applyVars` сравнивает сигнатуру палитры с предыдущим значением. При неизменной
палитре и существующем stylesheet операция завершается без повторной записи.

```ts
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
```

`#colorize-style` содержит сгенерированный CSS. `applyInlinePaletteVars` и
`cleanupInlinePaletteLeaks` удаляют прежние inline-значения, способные перекрывать
новые переменные. Массовая запись палитры через `documentElement.style` не используется.
Переход градиента выполняется модулем `src/palette-transition.ts`.

## Очередь перекраски

`recolor` выбирает пользовательский цвет или палитру обложки, обновляет переменные,
фон, контраст и флаги эффектов. `runScheduledRecolor` последовательно обрабатывает
запросы; повторный запрос во время выполнения устанавливает флаг очереди.

```ts
function scheduleRecolor(force = false, delay = 120) {
    if (pendingPaletteCover && (SETTINGS.useCustomColor || pendingPaletteCover !== coverURL()))
        COVER_ANALYSIS_CANCEL.get(pendingPaletteCover)?.()
    recolorForceQueued = recolorForceQueued || force
    if (recolorTimer) clearTimeout(recolorTimer)
    recolorTimer = setTimeout(runScheduledRecolor, force ? 0 : delay)
}
```

MutationObserver отслеживает `src`, `srcset` и изменения дочерних элементов.
Изменение обложки запускает обновление без обычной задержки 120 мс.
Событие `load` уточняет состояние после загрузки изображения.
Переходы между страницами отслеживаются через history, popstate и hashchange.

## Фоновая обложка

`backgroundReplace` выбирает контейнер Vibe, создаёт изображение и градиентный
слой. При смене обложки прежние слои плавно удаляются. Повторный URL не создаёт
дополнительный слой. `removeBackgroundImage` удаляет фон при отключении настройки.

```ts
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
    scope.rememberStyle(target, 'position', 'overflow', 'isolation')
    target.style.setProperty('position', 'relative', 'important')
    target.style.setProperty('overflow', 'hidden', 'important')
    target.style.setProperty('isolation', 'isolate', 'important')
    LOG_CHANGE('backgroundReplace', 'подготовлен Vibe-контейнер для фона', { target: nodeName(target), imageURL })

    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
        if (scope.disposed || pendingBackgroundURL !== imageURL) return
        pendingBackgroundURL = ''
        if (!SETTINGS.enableBackgroundImage || !target.isConnected || target !== getVibeBackgroundTarget()) return
        lastBackgroundURL = imageURL

        const wrapper = document.createElement('div')
        wrapper.className = 'bg-layer'
        scope.cleanup(() => wrapper.remove())

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
```

CSS классов `.bg-layer`, `.bg-cover`, `.bg-gradient` расположен в теме Colorize-2.
`bg-static-mode` отключает движение фонового изображения.

## Автозатемнение Vibe

`renderedVibeBackgroundBrightness` анализирует CSS-фон в области контролов.
В расчёт входят цвет, прозрачность и градиенты. Для радиального градиента
`gradientColorSample` использует геометрию контейнера и кнопок, центр, радиус
и позиции цветовых остановок. Яркий центр не усредняется с тёмным периметром.
Для фоновой обложки используются показатели `analyzeCover`.

| Параметр | Значение |
| --- | --- |
| Порог яркости CSS-фона | 0.56 |
| Срок кэша CSS-яркости | 750 мс |
| Резервная периодическая проверка | 5 с |

Шкала яркости — взвешенная сумма каналов RGB, а не WCAG-контраст.
Завершение переходов `--vibe-gradient-stop-*` и `background-color` сбрасывает кэш.
`syncVibeButtonContrast` управляет классом `html.colorize-bright-vibe-controls`
и маркером `.colorize-vibe-control-contrast` на кнопках. Тёмный фон определён
в CSS темы; при отключении функции классы снимаются.

## Масштабирование аватара

`setupAvatarZoomEffect` подключает mousemove/mouseleave к аватару.
`handleAvatarMouseMove` обновляет transform через requestAnimationFrame;
`handleAvatarMouseLeave` возвращает исходное состояние.
`removeAvatarZoomEffect` отключает обработчики и очищает эффект.

## Размер Vibe

`syncFullVibe` изменяет высоту старого блока. Новая волна использует отдельные
CSS-правила и классификацию `colorize-new-wave-page`.

```ts
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
        scope.rememberStyle(oldVibe, 'height')
        oldVibe.style.setProperty('height', targetHeight, 'important')
        LOG_CHANGE('syncFullVibe', 'изменена высота старого Vibe', { enabled: fullVibeNow, height: targetHeight, target: nodeName(oldVibe) })
    }
}
```

## Плавные переходы палитры: `createPaletteTransition`

Файл: `src/palette-transition.ts`.

Фабрика создаёт контроллер переходов между фоновыми градиентами. Параметр
`duration` задаёт длительность в миллисекундах; значение по умолчанию — 920.
Состояния активных переходов хранятся в `Map<HTMLElement, any>`.

### Методы контроллера

| Метод | Входные данные | Действие |
| --- | --- | --- |
| `before()` | Нет | Возвращает снимки `{ node, from }` до записи новой палитры |
| `after(snapshots)` | Массив снимков | Сравнивает прежние и новые градиенты, создаёт анимированные слои |
| `dispose()` | Нет | Удаляет активные слои и отключает обработчики reduced motion и pagehide |

Первый вызов `before()` возвращает пустой массив: исходный фон отображается без
перехода. После первого `after()` контроллер считается инициализированным.
При `prefers-reduced-motion: reduce` снимки и новые анимации не создаются.

### Расчёт промежуточного состояния

`paintedGradient(state)` получает прогресс текущей Web Animation и смешивает RGB
остановок старого и нового градиентов с учётом альфа-канала. При смене палитры
до завершения предыдущего перехода этот результат становится исходным градиентом
следующего перехода. Структура градиента должна совпадать: сравнение выполняется
после замены цветовых компонентов на `#`. Фоны `none` и `url(...)` пропускаются.

### Создание и завершение перехода

`after()` добавляет `.colorize-palette-background` в начало контейнера и анимирует
его opacity от 1 до 0. Если computed position контейнера — `static`, временно
устанавливается `relative`. `finish(node)` отменяет анимацию, удаляет слой и атрибут
`data-colorize-palette-fade`, восстанавливает изменённое позиционирование.
Восстановление выполняется только при сохранении установленного значения `relative`.

`clear()` завершает все переходы. `onMotion()` вызывает `clear()` при включении
reduced motion. Обработчик `pagehide` очищает переходы при уходе со страницы.
CSS слоя и порядок наложения определены в `Colorize-2/src/pulsecolor-controls.css`.

### Реализация

```ts
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
```

### Подключение к runtime

`applyVars` вызывает `before()` перед заменой содержимого `#colorize-style`
и `after()` после записи новых CSS-переменных. `dispose()` регистрируется
в области ресурсов и вызывается при отключении темы.

```ts
const paletteTransition = createPaletteTransition()
scope.cleanup(() => paletteTransition.dispose())
```

## Перекраска иконок: `createWheelIconTint`

Файл: `src/wheel-icon-tint.ts`.

Фабрика возвращает функцию обновления CSS-фильтра. Целевой цвет берётся из
`--ym-controls-color-secondary-text-enabled` через скрытый элемент `span`
и `getComputedStyle`. После чтения элемент удаляется.

### Численные функции

| Функция | Назначение |
| --- | --- |
| `clamp(x, max)` | Ограничивает значение диапазоном от 0 до max; по умолчанию max = 255 |
| `transform(c, m)` | Применяет матрицу 3×3 к RGB-вектору и ограничивает каналы |
| `simulate(p)` | Вычисляет RGB-результат заданного набора фильтров |
| `fit(target)` | Подбирает параметры, минимизирующие сумму квадратов отклонений каналов от target |

Порядок параметров `p`: invert, sepia, saturate, hue-rotate, brightness, contrast.
Начальный `brightness(0)` обнуляет входное изображение, поэтому расчёт фильтра
начинается с чёрного цвета. `simulate` последовательно моделирует инверсию,
сепию, насыщенность, поворот оттенка, яркость и контраст.

`fit` выполняет поиск из четырёх начальных углов: 0°, 90°, 180° и 270°.
Для каждого варианта выполняется 50 итераций; параметры проверяются в двух
направлениях, шаг на каждой итерации умножается на 0.91. Hue циклически
нормализуется в диапазон 0–360°, остальные параметры ограничиваются заданными
пределами. Полученный цвет является численным приближением целевого RGB.

### Кэш и область действия

Кэш `Map<string, string>` хранит до 32 результатов по строке computed color.
При превышении лимита удаляется самый ранний добавленный ключ.
Повторный цвет использует готовый фильтр без выполнения поиска.

Функция обновления записывает результат в `--colorize-wheel-icon-filter`
на `document.documentElement`. Применение ограничено CSS темы: изображения
действий `WHEEL_SETTING_ITEM` и `WHEEL_RESHUFFLE_ITEM`. Фильтр не назначается
обложкам остальных элементов колеса. При остановке Core переменная удаляется.

### Реализация

```ts
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
```

### Вызов при смене палитры

Функция создаётся один раз на экземпляр runtime. `applyVars` вызывает её после
записи палитры, когда токен целевого цвета уже имеет новое computed значение.

```ts
const updateWheelIconTint = createWheelIconTint()
```

## Управление ресурсами: `createRuntimeScope`

Файл: `src/runtime-scope.ts`.

Фабрика создаёт область ресурсов одного экземпляра runtime. Область хранит
идентификаторы таймеров и кадров, наблюдатели DOM, созданные изображения,
функции очистки и исходные значения изменяемых inline-свойств.

### Регистрация ресурсов

| Член области | Назначение |
| --- | --- |
| `disposed` | Признак завершённой области |
| `cleanup(fn)` | Регистрация функции освобождения ресурса |
| `listen(target, type, listener, options)` | Подключение события с автоматической регистрацией удаления обработчика |
| `rememberStyle(node, ...properties)` | Сохранение исходного значения и приоритета inline-свойства |
| `setTimeout(fn, delay, ...args)` | Одноразовый таймер с учётом идентификатора и проверкой активности |
| `clearTimeout(id)` | Отмена таймера и удаление из реестра |
| `setInterval(fn, delay)` | Периодический таймер с проверкой активности |
| `requestAnimationFrame(fn)` | Кадр анимации с учётом идентификатора |
| `cancelAnimationFrame(id)` | Отмена кадра и удаление из реестра |
| `MutationObserver` | Конструктор наблюдателя, зарегистрированного в области |
| `Image` | Конструктор изображения, зарегистрированного в области |
| `dispose()` | Однократное освобождение всех зарегистрированных ресурсов |

`rememberStyle` сохраняет каждое свойство узла только при первом обращении.
Хранятся значение и приоритет, включая `important`. При очистке исходное значение
восстанавливается; изначально отсутствовавшее свойство удаляется.

### Порядок очистки

1. Устанавливается `disposed = true`.
2. Отключаются наблюдатели, отменяются таймеры и кадры анимации.
3. У созданных изображений очищаются onload/onerror; незавершённая загрузка сбрасывается.
4. Зарегистрированные функции очистки вызываются в обратном порядке.
5. Восстанавливаются сохранённые inline-свойства, реестры ресурсов очищаются.

Повторный `dispose()` завершается без действий. Новые таймеры и кадры после
остановки не создаются; их методы возвращают 0. Callback наблюдателя, таймера
или кадра проверяет состояние области перед выполнением.
`cleanup` принимает значения неизвестного типа и регистрирует только функции,
что допускает API подписок, не возвращающие функцию отписки.

### Реализация

```ts
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
```

### Подключение к runtime

`startRuntime()` создаёт область и использует её конструкторы и методы вместо
глобальных аналогов. В области также регистрируются отписка от настроек,
очистка фоновых слоёв, восстановление обёрток history и контроллер переходов.

```ts
const scope = createRuntimeScope()
const {
    setTimeout,
    clearTimeout,
    setInterval,
    requestAnimationFrame,
    cancelAnimationFrame,
    MutationObserver,
    Image,
} = scope
```

После `scope.dispose()` функция остановки Core дополнительно отменяет ожидающий
анализ обложки, удаляет `#colorize-style`, управляющие классы и фильтр колеса.
Внешний наблюдатель таблиц стилей не входит в эту область: он остаётся активным
для обнаружения повторного включения темы. Повторное включение создаёт новую
область ресурсов и новый экземпляр runtime.
