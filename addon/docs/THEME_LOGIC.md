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
Переход градиента выполняется модулем [palette-transition](https://github.com/Imperiadicks/Colorize2Core/blob/main/addon/docs/INTERACTIONS.md).

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
