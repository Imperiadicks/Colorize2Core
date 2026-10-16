# Colorize2Core

Самостоятельный проект runtime-скрипта для темы Colorize 2. Формат PulseSync: `script`.

- `src/` — палитра, фон, переходы цветов, контраст Vibe и эффекты.
- `addon/` — иконка, баннер и документация.
- `addon.config.mjs` — метаданные. ID сохранён: `31c62ba2-b6f6-4ba7-934e-39146eccfe69`.

Настройки находятся в [Colorize-2](https://github.com/Imperiadicks/Colorize-2). Runtime читает их через `pulsesyncApi.getSettings('Colorize 2')`.

```bash
pnpm install
pnpm build
pnpm sync
pnpm build:sync
pnpm dev
```

Сборка: `dist/<id>/`. Установка сохраняет настройки и резервирует предыдущую версию.
Путь установки задаётся через `PULSESYNC_ADDONS_DIR`.

Проверки: `pnpm test:ui`, `pnpm test:contrast`, `pnpm test:performance`.
Проверки интерфейса используют CSS соседнего проекта Colorize-2.

Тема и runtime устанавливаются отдельно. В PulseSync включите Colorize2Core и выберите Colorize 2.

## Техническая документация

- [TypeScript, палитра и генерируемый CSS](https://github.com/Imperiadicks/Colorize2Core/blob/main/addon/docs/THEME_LOGIC.md)
- [Переходы и взаимодействие с CSS](https://github.com/Imperiadicks/Colorize2Core/blob/main/addon/docs/INTERACTIONS.md)
- [Разработка и проверки](https://github.com/Imperiadicks/Colorize2Core/blob/main/addon/docs/DEVELOPMENT.md)

## Репозитории

- [Тема Colorize 2](https://github.com/Imperiadicks/Colorize-2)
- [Скрипт Colorize2Core](https://github.com/Imperiadicks/Colorize2Core)

Для совместной разработки оба репозитория размещаются в одной родительской папке:

```bash
git clone https://github.com/Imperiadicks/Colorize-2.git
git clone https://github.com/Imperiadicks/Colorize2Core.git
```
