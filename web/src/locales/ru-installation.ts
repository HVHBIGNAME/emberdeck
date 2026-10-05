export default {
  "Back to workspace": "Вернуться в пространство",
  "A SHORTER WAY TO YOUR FIRST WORLD": "КОРОТКИЙ ПУТЬ К ПЕРВОМУ МИРУ",
  "One command. Your choice": "Одна команда. Ваш выбор",
  "Choose how to connect. The native installer handles the services, credentials and access setup.":
    "Выберите способ подключения. Нативный установщик настроит службы, учётные данные и доступ.",
  "RUST NATIVE": "НАТИВНЫЙ RUST",
  "Prefer a native download?": "Хотите скачать бинарник?",
  "Linux binaries include the game node. Windows runs the panel, demo and CLI with a Linux node.":
    "Сборки Linux включают игровой узел. На Windows работают панель, демо и CLI с подключением Linux-узла.",
  "Linux amd64 / arm64 and Windows amd64":
    "Linux amd64 / arm64 и Windows amd64",
  "Installation guide": "Руководство по установке",
  "This workspace": "Это пространство",
  "Reading access configuration…": "Читаем конфигурацию доступа…",
  "Waiting for a tunnel URL": "Ожидаем адрес туннеля",
  "Copy current panel URL": "Скопировать текущий URL панели",
  "Origin:": "Внутренний адрес:",
  "What belongs on this machine?": "Что разместить на этой машине?",
  "A complete workspace, or another piece of your infrastructure.":
    "Целое пространство или дополнительный компонент инфраструктуры.",
  Components: "Компоненты",
  "All-in-one · panel + Minecraft node": "Всё вместе · панель и узел Minecraft",
  "Control panel only · connect remote nodes": "Только панель · удалённые узлы",
  "Minecraft node only · connect to a panel":
    "Только узел Minecraft · к существующей панели",
  "Choose your way in.": "Выберите способ подключения.",
  "Outbound tunnels work without inbound web ports.":
    "Исходящим туннелям не нужны открытые входящие веб-порты.",
  "Public HTTPS URL": "Публичный HTTPS URL",
  "In Cloudflare, create a remotely managed tunnel and route your hostname to":
    "Создайте управляемый туннель в Cloudflare и направьте свой домен на",
  "The installer asks for its connector token in the terminal.":
    "Установщик запросит токен коннектора в терминале.",
  "Connector token file (optional)": "Файл токена коннектора (необязательно)",
  "Leave empty for a hidden terminal prompt. The connector token is stored privately on the host.":
    "Оставьте пустым для скрытого ввода в терминале. Токен хранится в закрытом файле на хосте.",
  "Configure your existing proxy to forward this hostname to":
    "Настройте существующий прокси для перенаправления этого домена на",
  "and preserve the Host header. The installer verifies the public endpoint.":
    "с сохранением заголовка Host. Установщик проверит публичный адрес.",
  "The node installs Docker and a scoped SFTP service. Register its management endpoint and token in your existing panel's Nodes page.":
    "Узел установит Docker и SFTP с ограниченным доступом. Добавьте адрес управления и токен в разделе «Узлы» существующей панели.",
  "Ports & game connection address": "Порты и адрес игрового сервера",
  "Web tunnels carry the panel and API. Minecraft and SFTP use the node's own addresses and their respective ports.":
    "Веб-туннели передают панель и API. Minecraft и SFTP используют адрес узла и свои порты.",
  "Web access method": "Способ веб-доступа",
  "Quick HTTPS": "Быстрый HTTPS",
  "NO ACCOUNT": "БЕЗ АККАУНТА",
  "An automatic trycloudflare.com address. No inbound web ports. The address changes when the tunnel restarts.":
    "Автоматический адрес trycloudflare.com без входящих веб-портов. Меняется при перезапуске туннеля.",
  "CONNECTOR TOKEN": "ТОКЕН КОННЕКТОРА",
  "A stable hostname on your Cloudflare account. Outbound-only connection, with a privately supplied tunnel token.":
    "Постоянный домен вашего аккаунта Cloudflare. Только исходящее соединение с приватно переданным токеном.",
  "Managed HTTPS": "Управляемый HTTPS",
  "YOUR DOMAIN": "ВАШ ДОМЕН",
  "Automatic TLS with a dedicated Caddy container. Requires DNS pointing here and available ports 80 / 443.":
    "Автоматический TLS в отдельном контейнере Caddy. Нужны DNS-запись на этот хост и свободные порты 80 / 443.",
  "Existing HTTPS proxy": "Существующий HTTPS-прокси",
  "YOUR INFRASTRUCTURE": "ВАША ИНФРАСТРУКТУРА",
  "Connect an existing Caddy, Nginx or other TLS reverse proxy to the local panel listener.":
    "Подключите свой Caddy, Nginx или другой TLS-прокси к локальному адресу панели.",
  "Private workspace": "Закрытое пространство",
  "SSH ACCESS": "ДОСТУП ПО SSH",
  "Keep the panel on loopback and connect through SSH forwarding. No public web endpoint.":
    "Панель работает локально, подключение — через SSH-проброс. Публичного веб-адреса нет.",
  "Game hostname or IP (optional)": "Домен или IP игры (необязательно)",
  "play.example.com · auto-detect when empty":
    "play.example.com · автоопределение, если пусто",
  "Panel port": "Порт панели",
  "Agent port": "Порт агента",
  "These ports apply to fresh installations. Upgrades preserve existing ports and credentials; use the current origin shown above when configuring an existing tunnel.":
    "Эти порты используются при новой установке. Обновление сохраняет текущие порты и учётные данные; для настройки существующего туннеля используйте внутренний адрес выше.",
  "Make it yours.": "Всё готово к установке.",
  "Run this command on your Linux host through SSH.":
    "Выполните эту команду на Linux-хосте через SSH.",
  "ROOT / SUDO TERMINAL": "ТЕРМИНАЛ ROOT / SUDO",
  "Installation command": "Команда установки",
  "Complete the settings to generate your command.":
    "Заполните настройки, чтобы получить команду.",
  "Copy install command": "Скопировать команду",
  "Download a checksum-verified native binary.":
    "Скачать нативный бинарник с проверкой контрольной суммы.",
  "Install the selected systemd services and required dependencies.":
    "Установить выбранные службы systemd и необходимые зависимости.",
  "Connect the node to your existing panel.":
    "Подключить узел к существующей панели.",
  "Verify the endpoint and print the panel address.":
    "Проверить соединение и вывести адрес панели.",
  "Your first sign-in": "Первый вход",
  "Open the printed URL. Retrieve the owner access token in the same SSH session:":
    "Откройте выведенный URL. Получите токен владельца в той же SSH-сессии:",
  "Quick URLs are temporary and change after a tunnel restart. A Cloudflare connector token gives your workspace a stable address.":
    "Быстрые URL временные и меняются после перезапуска туннеля. Токен коннектора Cloudflare даёт пространству постоянный адрес.",
  "SSH forwarding": "Проброс через SSH",
  "Use whole-number ports between 1024 and 65535.":
    "Укажите целые номера портов от 1024 до 65535.",
  "Panel, agent and SFTP need different ports.":
    "Панели, агенту и SFTP нужны разные порты.",
  "Enter a game hostname or IP address without a protocol or path.":
    "Введите домен или IP игры без протокола и пути.",
  "Enter an HTTPS hostname without credentials, a subpath or query parameters.":
    "Введите HTTPS-адрес без учётных данных, вложенного пути и параметров запроса.",
  "Managed HTTPS requires a DNS hostname on port 443.":
    "Для управляемого HTTPS нужен DNS-домен на порту 443.",
  "Enter your public HTTPS URL, such as https://panel.example.com.":
    "Введите публичный HTTPS URL, например https://panel.example.com.",
  "Use an absolute Linux token-file path, or leave it empty for a private terminal prompt.":
    "Укажите абсолютный Linux-путь к файлу токена или оставьте пустым для скрытого ввода в терминале.",
} as const;
