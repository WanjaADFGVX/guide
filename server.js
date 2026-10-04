const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'content.json');
const BACKUP_FILE = path.join(DATA_DIR, 'content.json.bak');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory content cache for sub-millisecond read performance
let db = null;
const adminSessions = new Map(); // token -> { createdAt, expiresAt }

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Load content into memory
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      db = JSON.parse(raw);
    } else {
      console.warn('[Warning] content.json not found, using default structure');
      db = {
        settings: {
          siteTitle: "Методический портал",
          siteSubtitle: "Учебные материалы и тесты",
          adminPasswordHash: hashPassword(process.env.ADMIN_PASSWORD || 'admin123'),
          allowGuestTests: true,
          showExplanationsAfterTest: true
        },
        sections: [],
        quizzes: []
      };
      saveData();
    }
  } catch (err) {
    console.error('[Error] Failed to parse content.json:', err);
    if (fs.existsSync(BACKUP_FILE)) {
      console.log('[Recovery] Restoring from backup...');
      db = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf-8'));
    } else {
      throw err;
    }
  }
}

// Atomic safe write
function saveData() {
  const tmpFile = DATA_FILE + '.tmp';
  const json = JSON.stringify(db, null, 2);

  // Write to temporary file first
  fs.writeFileSync(tmpFile, json, 'utf-8');
  // Copy current to backup if exists
  if (fs.existsSync(DATA_FILE)) {
    try {
      fs.copyFileSync(DATA_FILE, BACKUP_FILE);
    } catch (e) {
      // Ignore backup error
    }
  }
  // Atomically rename
  fs.renameSync(tmpFile, DATA_FILE);
}

// Initialize data
loadData();

// Auth helper
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function verifyAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Необходима авторизация' });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const session = adminSessions.get(token);

  if (!session || Date.now() > session.expiresAt) {
    if (session) adminSessions.delete(token);
    return res.status(401).json({ error: 'Сессия истекла или недействительна' });
  }

  // Extend session by 2 hours
  session.expiresAt = Date.now() + 2 * 60 * 60 * 1000;
  next();
}

// Brute-force protection for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' }
});

// -------------------------------------------------------------
// PUBLIC API
// -------------------------------------------------------------

// Load content into memory with mtime check
let lastMtime = 0;
function getDb() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const stat = fs.statSync(DATA_FILE);
      if (stat.mtimeMs > lastMtime) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        db = JSON.parse(raw);
        lastMtime = stat.mtimeMs;
      }
    }
  } catch (err) {
    console.error('[Error] Failed to reload content.json:', err);
  }
  return db;
}

// 1. Get public content (articles, structure, quiz metadata WITHOUT answers)
app.get('/api/content', (req, res) => {
  const currentDb = getDb() || db;
  // Strip answers and explanations from public quiz payload to prevent cheating
  const publicQuizzes = (currentDb.quizzes || []).map(quiz => ({
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    sectionId: quiz.sectionId,
    timeLimit: quiz.timeLimit || 0,
    questionCount: (quiz.questions || []).length,
    questions: (quiz.questions || []).map(q => ({
      id: q.id,
      question: q.question,
      type: q.type || 'single',
      options: q.type === 'text' ? [] : (q.options || [])
      // correctAnswers, acceptableAnswers and explanation are intentionally hidden!
    }))
  }));

  res.json({
    settings: {
      siteTitle: currentDb.settings?.siteTitle || "Методический портал",
      siteSubtitle: currentDb.settings?.siteSubtitle || "Учебные материалы и тесты",
      allowGuestTests: currentDb.settings?.allowGuestTests ?? true,
      showExplanationsAfterTest: currentDb.settings?.showExplanationsAfterTest ?? true
    },
    sections: currentDb.sections || [],
    quizzes: publicQuizzes
  });
});

// -------------------------------------------------------------
// SMART TEXT MATCHING (Russian Porter Stemmer & Semantic Words)
// -------------------------------------------------------------
const STOP_WORDS = new Set(['в','на','и','с','по','после','что','как','все','всего','этого','этот','надо','нужно','бы','было','ли','же','то','о','об','для','от','к','до','а','но']);

function stemRussian(word) {
  word = word.toLowerCase().replace(/ё/g, 'е').trim();
  if (word.length <= 3) return word;
  const RVRE = /^(.*?[аеиоуыэюя])(.*)$/i;
  const match = word.match(RVRE);
  if (!match) return word;
  let rv = match[2];
  rv = rv.replace(/((ив|ивши|ившись|ыв|ывши|ывшись)|((?<=[ая])(в|вши|вшись)))$/, '');
  rv = rv.replace(/(с[яь])$/, '');
  rv = rv.replace(/(ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/, '');
  rv = rv.replace(/((ивш|ывш)|((?<=[ая])(ем|нн|вш|ющ|щ)))$/, '');
  rv = rv.replace(/((ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)|((?<=[ая])(ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно)))$/, '');
  rv = rv.replace(/(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|яa|я)$/, '');
  return match[1] + rv;
}

function extractKeyStems(text) {
  return String(text || '').toLowerCase()
    .replace(/[^а-яa-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 0 && !STOP_WORDS.has(w))
    .map(stemRussian);
}

function isTextAnswerCorrect(userText, acceptableAnswers) {
  if (!userText || !acceptableAnswers || !acceptableAnswers.length) return false;
  const userClean = String(userText).toLowerCase().replace(/ё/g, 'е').trim();
  const userStems = new Set(extractKeyStems(userClean));

  for (const variant of acceptableAnswers) {
    const varClean = String(variant).toLowerCase().replace(/ё/g, 'е').trim();
    // 1. Exact match
    if (userClean === varClean) return true;

    // 2. Substring match
    if (userClean.includes(varClean) || varClean.includes(userClean)) {
      if (userClean.length >= 3 && varClean.length >= 3) return true;
    }

    // 3. Key stems matching
    const varStems = extractKeyStems(varClean);
    if (varStems.length > 0) {
      const matchedCount = varStems.filter(stem => {
        for (const u of userStems) {
          if (u === stem || u.startsWith(stem) || stem.startsWith(u)) return true;
        }
        return false;
      }).length;

      const threshold = varStems.length <= 2 ? varStems.length : Math.ceil(varStems.length * 0.7);
      if (matchedCount >= threshold) return true;
    }
  }
  return false;
}

// Check single question on-the-fly (for immediate "Ответить" feedback)
app.post('/api/quiz/check-question', (req, res) => {
  const { quizId, questionId, answer } = req.body;
  if (!quizId || !questionId) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }

  const currentDb = getDb() || db;
  const quiz = (currentDb.quizzes || []).find(q => q.id === quizId);
  if (!quiz) return res.status(404).json({ error: 'Тест не найден' });

  const q = (quiz.questions || []).find(item => item.id === questionId);
  if (!q) return res.status(404).json({ error: 'Вопрос не найден' });

  let isCorrect = false;

  if (q.type === 'text') {
    const userText = (Array.isArray(answer) ? (answer[0] || '') : (answer || '')).toString().trim();
    let acceptable = [];
    if (Array.isArray(q.acceptableAnswers)) acceptable = q.acceptableAnswers;
    else if (Array.isArray(q.correctAnswers) && typeof q.correctAnswers[0] === 'string') acceptable = q.correctAnswers;
    else if (Array.isArray(q.options) && q.options.length) acceptable = q.options;

    isCorrect = isTextAnswerCorrect(userText, acceptable);

    return res.json({
      questionId: q.id,
      type: 'text',
      isCorrect,
      userAnswerText: userText,
      acceptableAnswers: acceptable,
      explanation: q.explanation || ''
    });
  }

  // Single or multiple choice
  const userAnswers = (Array.isArray(answer) ? answer : [answer]).map(Number).sort();
  const correctAnswers = (q.correctAnswers || []).map(Number).sort();

  isCorrect = userAnswers.length === correctAnswers.length &&
    userAnswers.every((val, idx) => val === correctAnswers[idx]);

  res.json({
    questionId: q.id,
    type: q.type || 'single',
    isCorrect,
    userAnswers,
    correctAnswers,
    explanation: q.explanation || ''
  });
});

// 2. Evaluate submitted quiz
app.post('/api/quiz/evaluate', (req, res) => {
  const { quizId, answers } = req.body;
  if (!quizId || !answers) {
    return res.status(400).json({ error: 'Некорректные данные для проверки' });
  }

  const currentDb = getDb() || db;
  const quiz = (currentDb.quizzes || []).find(q => q.id === quizId);
  if (!quiz) {
    return res.status(404).json({ error: 'Тест не найден' });
  }

  let correctCount = 0;
  const totalQuestions = quiz.questions.length;
  const results = [];

  quiz.questions.forEach(q => {
    let isCorrect = false;

    if (q.type === 'text') {
      const rawUserAns = answers[q.id];
      const userText = (Array.isArray(rawUserAns) ? (rawUserAns[0] || '') : (rawUserAns || '')).toString().trim();

      // Collect all acceptable answers (strings)
      let acceptable = [];
      if (Array.isArray(q.acceptableAnswers)) {
        acceptable = q.acceptableAnswers;
      } else if (Array.isArray(q.correctAnswers) && typeof q.correctAnswers[0] === 'string') {
        acceptable = q.correctAnswers;
      } else if (Array.isArray(q.options) && q.options.length) {
        acceptable = q.options;
      }

      isCorrect = isTextAnswerCorrect(userText, acceptable);

      if (isCorrect) correctCount++;

      results.push({
        questionId: q.id,
        question: q.question,
        type: 'text',
        userAnswerText: userText,
        acceptableAnswers: acceptable,
        isCorrect,
        explanation: q.explanation || ''
      });
      return;
    }

    // single or multiple choice
    const userAnswers = (answers[q.id] || []).map(Number).sort();
    const correctAnswers = (q.correctAnswers || []).map(Number).sort();

    // Check if arrays match
    isCorrect = userAnswers.length === correctAnswers.length &&
      userAnswers.every((val, idx) => val === correctAnswers[idx]);

    if (isCorrect) correctCount++;

    results.push({
      questionId: q.id,
      question: q.question,
      type: q.type || 'single',
      userAnswers,
      correctAnswers,
      isCorrect,
      explanation: q.explanation || ''
    });
  });

  const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  res.json({
    quizId,
    quizTitle: quiz.title,
    score: correctCount,
    total: totalQuestions,
    percentage,
    passed: percentage >= 70,
    results
  });
});

// -------------------------------------------------------------
// ADMIN AUTH
// -------------------------------------------------------------

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Укажите пароль' });
  }

  const inputHash = hashPassword(password);
  const currentHash = db.settings?.adminPasswordHash;

  if (inputHash === currentHash || (process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD)) {
    const token = generateToken();
    adminSessions.set(token, {
      createdAt: Date.now(),
      expiresAt: Date.now() + 2 * 60 * 60 * 1000 // 2 hours
    });

    return res.json({
      success: true,
      token,
      message: 'Успешная авторизация'
    });
  }

  return res.status(401).json({ error: 'Неверный пароль администратора' });
});

app.post('/api/admin/logout', verifyAdmin, (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    adminSessions.delete(token);
  }
  res.json({ success: true });
});

app.get('/api/admin/check', verifyAdmin, (req, res) => {
  res.json({ authenticated: true });
});

// -------------------------------------------------------------
// ADMIN CRUD & MANAGEMENT
// -------------------------------------------------------------

// Full data access for admin (including correct answers)
app.get('/api/admin/data', verifyAdmin, (req, res) => {
  const adminCopy = JSON.parse(JSON.stringify(db));
  // Don't leak the password hash in plain responses
  if (adminCopy.settings) {
    delete adminCopy.settings.adminPasswordHash;
  }
  res.json(adminCopy);
});

// Save updated content from admin
app.post('/api/admin/data', verifyAdmin, (req, res) => {
  const { settings, sections, quizzes } = req.body;

  if (!Array.isArray(sections) || !Array.isArray(quizzes)) {
    return res.status(400).json({ error: 'Некорректная структура данных' });
  }

  // Preserve existing password hash unless explicitly changed via password API
  const preservedHash = db.settings?.adminPasswordHash;

  db.sections = sections;
  db.quizzes = quizzes;
  if (settings) {
    db.settings = {
      ...db.settings,
      ...settings,
      adminPasswordHash: preservedHash
    };
  }

  try {
    saveData();
    res.json({ success: true, message: 'Изменения успешно сохранены' });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: 'Ошибка сохранения данных на диск' });
  }
});

// Change admin password
app.post('/api/admin/change-password', verifyAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 5) {
    return res.status(400).json({ error: 'Новый пароль должен содержать минимум 5 символов' });
  }

  const currentHash = hashPassword(currentPassword);
  if (currentHash !== db.settings?.adminPasswordHash) {
    return res.status(400).json({ error: 'Текущий пароль указан неверно' });
  }

  db.settings.adminPasswordHash = hashPassword(newPassword);
  saveData();
  res.json({ success: true, message: 'Пароль успешно обновлён' });
});

// Export full backup
app.get('/api/admin/export', verifyAdmin, (req, res) => {
  const exportData = JSON.stringify(db, null, 2);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=backup-content-${Date.now()}.json`);
  res.send(exportData);
});

// Import backup
app.post('/api/admin/import', verifyAdmin, (req, res) => {
  const { importedData } = req.body;
  if (!importedData || !Array.isArray(importedData.sections) || !Array.isArray(importedData.quizzes)) {
    return res.status(400).json({ error: 'Неверный формат файла бэкапа' });
  }

  const currentHash = db.settings?.adminPasswordHash;
  db = importedData;
  if (!db.settings.adminPasswordHash) {
    db.settings.adminPasswordHash = currentHash;
  }

  saveData();
  res.json({ success: true, message: 'Данные успешно импортированы' });
});

// Fallback to index.html for single-page routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
  console.log(`⚡ Режим: Производительный (In-Memory кэш + JSON)`);
  console.log(`🔐 Пароль админа по умолчанию: admin123`);
  console.log(`====================================================`);
});
