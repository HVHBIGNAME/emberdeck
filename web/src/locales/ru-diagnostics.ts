export default {
  "Not enough Java heap": "Недостаточно памяти Java",
  "Increase the memory limit or reduce view distance. Inspect plugins retaining chunks.":
    "Увеличьте лимит памяти или уменьшите дальность прорисовки. Проверьте плагины, удерживающие чанки в памяти.",
  "Java version mismatch": "Несовместимая версия Java",
  "Choose a Java runtime compatible with the core and installed plugins.":
    "Выберите версию Java, совместимую с ядром и установленными плагинами.",
  "Port is occupied": "Порт занят",
  "Choose an unused game port and restart the container.":
    "Выберите свободный игровой порт и перезапустите контейнер.",
  "Missing plugin dependency": "Не найдена зависимость плагина",
  "Install the declared dependency for the same Minecraft version.":
    "Установите указанную зависимость для той же версии Minecraft.",
  "Mod compatibility failure": "Ошибка совместимости мода",
  "Check the named mod, exact game version, and loader version.":
    "Проверьте указанный мод, точную версию игры и загрузчика.",
  "Missing or incompatible class": "Класс отсутствует или несовместим",
  "Check dependencies and remove plugins built for another core/version.":
    "Проверьте зависимости и удалите плагины для другого ядра или версии.",
  "Package failed to load": "Не удалось загрузить пакет",
  "Inspect the next Caused by line and the package's dependency list.":
    "Посмотрите следующую строку Caused by и список зависимостей пакета.",
  "Server tick overload": "Перегрузка серверного тика",
  "Inspect CPU saturation, entities and view distance; compare before and after plugin changes.":
    "Проверьте загрузку CPU, количество сущностей и дальность прорисовки; сравните до и после изменения плагинов.",
  "Process execution": "Запуск процессов",
  "Can launch operating-system processes. This can be legitimate; review the source.":
    "Может запускать процессы ОС. Это может быть штатной функцией; изучите исходный код.",
  "Outbound network access": "Исходящие сетевые соединения",
  "Contains networking APIs; this alone is not evidence of malicious behavior.":
    "Содержит сетевые API. Само по себе это не свидетельствует о вредоносном поведении.",
  "Dynamic code loading": "Динамическая загрузка кода",
  "Can load code at runtime, outside this static scan.":
    "Может загружать код во время работы, за пределами этой статической проверки.",
  "Credential-path references": "Ссылки на пути с учётными данными",
  "References credential locations unrelated to ordinary Minecraft server data.":
    "Ссылается на хранилища учётных данных, не связанные с обычными данными сервера Minecraft.",
  "Native code": "Нативный код",
  "Contains native loading APIs. Native binaries are not analyzed by this scanner.":
    "Содержит API загрузки нативного кода. Этот сканер не анализирует нативные бинарники.",
  "Integrity changed": "Целостность изменилась",
  "This JAR no longer matches the bytes originally installed from its publisher.":
    "Содержимое JAR больше не совпадает с файлом, первоначально установленным от автора.",
  "Know what you're running.": "Знайте, что запускаете.",
  "Inspect JAR metadata, integrity changes, and potentially risky bytecode references. No plugin code is executed during this review.":
    "Проверьте метаданные JAR, изменения целостности и потенциально опасные ссылки в байткоде. Код плагинов при проверке не выполняется.",
  "Check embedded Maven dependencies with OSV.":
    "Проверить встроенные Maven-зависимости через OSV.",
  "Sends package coordinates and versions to osv.dev.":
    "Координаты пакетов и версии отправляются на osv.dev.",
  "Review installed JARs": "Проверить установленные JAR",
  "Find the one that breaks it.": "Найдите источник сбоя.",
  "Reproduce startup in an isolated clone, then narrow down failing plugin or mod groups. Declared hard dependencies stay together.":
    "Воспроизведите запуск в изолированной копии, затем найдите проблемную группу плагинов или модов. Обязательные зависимости проверяются вместе.",
  "The original server must be stopped. Tests use a separate container and publish no game port.":
    "Исходный сервер должен быть остановлен. Проверки идут в отдельном контейнере без публикации игрового порта.",
  "Start isolated diagnosis": "Начать диагностику",
  "What the logs are saying": "О чём говорят логи",
  "Local pattern analysis · no AI provider required":
    "Локальный анализ ошибок · без ИИ-провайдера",
  "No recognized error patterns in the recent log. This is a limited check, not a complete health assessment.":
    "Известные шаблоны ошибок в свежем логе не найдены. Это ограниченная проверка, а не полная оценка состояния.",
  "JAR review": "Проверка JAR",
  "Last checked {{date}}": "Последняя проверка: {{date}}",
  "No review has been run yet": "Проверка ещё не запускалась",
  "STATIC ANALYSIS": "СТАТИЧЕСКИЙ АНАЛИЗ",
  "JARs reviewed: {{jars}} · findings for human review: {{findings}}":
    "Проверено JAR: {{jars}} · замечаний для ручной проверки: {{findings}}",
  "Findings: {{count}}": "Замечаний: {{count}}",
  "No flagged patterns": "Подозрительные шаблоны не найдены",
  "OSV dependency results": "Результаты проверки зависимостей OSV",
  "No matching advisories returned for this coordinate.":
    "Для этих координат сообщения об уязвимостях не найдены.",
  "Static checks can miss threats and flag legitimate functionality. Nested JARs, native binaries, and downloaded code are outside this scanner's coverage.":
    "Статические проверки могут пропустить угрозы или отметить легитимные функции. Вложенные JAR, нативные бинарники и загружаемый код не входят в область проверки.",
  "Reproduce. Narrow down. Understand.": "Воспроизвести. Найти. Разобраться.",
  "An isolated startup check using a clone of this server.":
    "Изолированная проверка запуска на копии этого сервера.",
  "Stop the original server before starting diagnosis.":
    "Перед диагностикой остановите исходный сервер.",
  "Error signature (optional)": "Текст ошибки (необязательно)",
  "Exact error text from the log": "Точный текст ошибки из лога",
  "A literal text match. Without a signature, the check detects failed startup.":
    "Поиск точного совпадения. Если текст не задан, проверяется успешность запуска.",
  "Timeout per trial (seconds)": "Таймаут попытки (секунды)",
  "Maximum trials": "Максимум попыток",
  "Apply a verified fix: make a backup, then rename the failing JARs to":
    "Применить проверенное исправление: создать копию и переименовать проблемные JAR в",
  "Only applied if removing the identified group produces a healthy startup and the original JAR hashes are unchanged. Runtime-only problems need a separate reproduction. The clone needs enough disk space and memory to boot.":
    "Применяется, только если отключение найденной группы позволяет запуститься и хеши исходных JAR не изменились. Ошибки во время игры требуют отдельного воспроизведения. Для запуска копии нужно достаточно диска и памяти.",
  "Run diagnosis": "Запустить диагностику",
} as const;
