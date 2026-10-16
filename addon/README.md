# Colorize2Core

Зависимость темы Colorize 2. Выполняет динамическую логику в контексте Яндекс Музыки:
анализ обложки, генерацию CSS-переменных, обновление фона, контроль контраста кнопок,
масштабирование аватара, изменение размера Vibe и логирование.

Настройки находятся только в теме **Colorize 2**. Colorize2Core читает их через
`pulsesyncApi.getSettings('Colorize 2')` и применяет изменения по подписке `onChange`.
Для оформления установите оба пакета и выберите тему Colorize 2.

## Техническая документация

- [TypeScript, палитра и генерируемый CSS](https://github.com/Imperiadicks/Colorize2Core/blob/main/addon/docs/THEME_LOGIC.md)
- [Переходы и взаимодействие с CSS](https://github.com/Imperiadicks/Colorize2Core/blob/main/addon/docs/INTERACTIONS.md)
- [Разработка и проверки](https://github.com/Imperiadicks/Colorize2Core/blob/main/addon/docs/DEVELOPMENT.md)
