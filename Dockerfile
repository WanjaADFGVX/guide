# Минимальный и безопасный образ на базе Alpine Linux
FROM node:22-alpine

WORKDIR /app

# Копируем package.json и устанавливаем только production зависимости
COPY package*.json ./
RUN npm ci --only=production

# Копируем остальные файлы проекта
COPY . .

# Порт сервиса
EXPOSE 3000

# Создаем volume для сохранения базы данных при перезапуске контейнера
VOLUME ["/app/data"]

# Запуск
CMD ["node", "server.js"]
