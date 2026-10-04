# 📚 Методический портал и система тестирования

Шустрый, сверхлегковесный и автономный веб-портал с методическими материалами (конспектами/статьями) и интерактивными проверочными тестами.

---

## ⚡ Особенности и преимущества

- **Минимальное потребление ресурсов**: потребляет всего **~25–35 МБ оперативной памяти**, процессор в покое — 0.0%. Идеально работает даже на самых недорогих VPS (от 512 МБ RAM).
- **Мгновенная скорость отклика**: чтение данных из кэша памяти занимает менее **1–2 мс**.
- **Встроенная веб-панель управления (Админка)**:
  - Добавление и редактирование глав методички с **живым предпросмотром Markdown** и панелью форматирования.
  - Конструктор тестов: одиночный/множественный выбор, правильные ответы, подробные пояснения к ошибкам, таймер.
  - Экспорт и импорт всей базы в один клик в формат `.json`.
- **Защита от списывания**: верные ответы и пояснения хранятся на сервере и **не передаются** в браузер ученика до момента отправки теста на проверку (просмотр через DevTools бесполезен).
- **Полноценный адаптивный дизайн**:
  - Тёмная и светлая темы оформления.
  - Поиск по материалам в реальном времени (**Ctrl + K**).
  - Удобная боковая панель с оглавлением и индикатором изученного материала.
  - Подсветка блоков кода с кнопкой копирования в один клик.

---

## 🚀 Быстрый запуск на локальном компьютере

1. Убедитесь, что установлен [Node.js](https://nodejs.org/) (версии 18+).
2. Установите зависимости:
   ```bash
   npm install
   ```
3. Запустите сервер:
   ```bash
   npm start
   ```
4. Откройте в браузере: [http://localhost:3000](http://localhost:3000)

**Вход в управление (админку):**
- Вкладка **«Управление»** в верхнем меню
- Пароль по умолчанию: `admin123` (можно сменить в панели или через файл `.env`)

---

## 🌐 Развёртывание на своём сервере (VPS Linux: Ubuntu / Debian)

### Вариант 1: Через Docker (рекомендуемый, 1 минута)

1. Установите Docker и Docker Compose на сервер (если ещё не установлены):
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
   ```
2. Скопируйте папку проекта на сервер (например, в `/var/www/study-portal`).
3. Перейдите в каталог и запустите:
   ```bash
   docker compose up -d
   ```
Всё! Сайт запустится на порту `3000` и будет автоматически перезапускаться при перезагрузке сервера. База данных монтируется в папку `./data`.

---

### Вариант 2: Запуск через менеджер процессов PM2 (без Docker)

1. Установите Node.js и PM2:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   sudo npm install -g pm2
   ```
2. Скопируйте проект в `/var/www/study-portal` и установите зависимости:
   ```bash
   cd /var/www/study-portal
   npm ci --only=production
   ```
3. Запустите через PM2:
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

---

## 🔒 Настройка домена и бесплатного SSL-сертификата (HTTPS)

Для привязки домена установите веб-сервер **Nginx**:
```bash
sudo apt install nginx certbot python3-certbot-nginx -y
```

Создайте конфигурацию для вашего домена `/etc/nginx/sites-available/portal`:
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Активируйте сайт и выпустите SSL:
```bash
sudo ln -s /etc/nginx/sites-available/portal /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Выпуск бесплатного HTTPS сертификата
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

---

## 📁 Структура проекта

```
testsite/
├── server.js              # Легковесный Node.js сервер с защитой и REST API
├── data/
│   └── content.json       # База данных (статьи, тесты, настройки)
├── public/                # Клиентская часть (быстрая, без сборщиков)
│   ├── index.html         # Единая страница портала
│   ├── css/
│   │   └── style.css      # Стили, темная/светлая тема, типографика
│   └── js/
│       ├── app.js         # Роутер, поиск Ctrl+K, переключение тем
│       ├── markdown.js    # Шустрый парсер Markdown и подсветка кода
│       ├── quiz.js        # Движок тестирования и подсчета баллов
│       └── admin.js       # Визуальная админка и конструктор тестов
├── Dockerfile             # Легковесный образ на Alpine Linux
├── docker-compose.yml     # Запуск в 1 команду
├── ecosystem.config.js    # Конфиг PM2
└── package.json           # Зависимости
```
