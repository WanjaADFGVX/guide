// Admin Panel Logic & Data Management
const AdminModule = {
  token: localStorage.getItem('admin_token') || null,
  adminData: null,
  activeTab: 'manual',
  editingArticle: null,
  editingQuiz: null,

  init() {
    this.bindEvents();
    if (this.token) {
      this.verifyAndLoad();
    } else {
      this.showLogin();
    }
  },

  bindEvents() {
    document.getElementById('admin-login-form').onsubmit = (e) => {
      e.preventDefault();
      this.login();
    };

    // Live preview for Markdown editor
    const textarea = document.getElementById('edit-article-content');
    if (textarea) {
      textarea.addEventListener('input', () => {
        this.updateLivePreview();
      });
    }
  },

  async login() {
    const passwordInput = document.getElementById('admin-password-input');
    const password = passwordInput.value.trim();
    if (!password) return;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка авторизации');

      this.token = data.token;
      localStorage.setItem('admin_token', this.token);
      passwordInput.value = '';
      Toast.show('Успешный вход в панель управления', 'success');
      this.verifyAndLoad();
    } catch (err) {
      Toast.show(err.message, 'error');
    }
  },

  logout() {
    if (this.token) {
      fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      }).catch(() => {});
    }
    this.token = null;
    localStorage.removeItem('admin_token');
    this.showLogin();
    Toast.show('Вы вышли из системы', 'info');
  },

  async verifyAndLoad() {
    try {
      const res = await fetch('/api/admin/data', {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (!res.ok) {
        throw new Error('Сессия недействительна');
      }

      this.adminData = await res.json();
      this.showDashboard();
      this.renderCurrentTab();
    } catch (err) {
      this.logout();
    }
  },

  showLogin() {
    document.getElementById('admin-auth-container').style.display = 'block';
    document.getElementById('admin-dashboard-container').style.display = 'none';
  },

  showDashboard() {
    document.getElementById('admin-auth-container').style.display = 'none';
    document.getElementById('admin-dashboard-container').style.display = 'block';
  },

  switchTab(tabName) {
    this.activeTab = tabName;
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.admin-content-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `admin-pane-${tabName}`);
    });
    this.renderCurrentTab();
  },

  renderCurrentTab() {
    if (!this.adminData) return;
    if (this.activeTab === 'manual') this.renderManualTab();
    if (this.activeTab === 'quizzes') this.renderQuizzesTab();
    if (this.activeTab === 'settings') this.renderSettingsTab();
  },

  // -------------------------------------------------------------
  // TAB 1: MANUAL (SECTIONS & ARTICLES)
  // -------------------------------------------------------------
  renderManualTab() {
    const container = document.getElementById('admin-sections-list');
    container.innerHTML = '';

    (this.adminData.sections || []).forEach((sec, secIdx) => {
      const secCard = document.createElement('div');
      secCard.className = 'question-box';
      secCard.style.marginBottom = '20px';

      const articlesList = (sec.articles || []).map((art, artIdx) => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--bg-input); border:1px solid var(--border); border-radius:var(--radius-sm); margin-bottom:8px;">
          <div>
            <strong>${art.title}</strong>
            <span style="color:var(--text-dim); font-size:0.8rem; margin-left:8px;">(${art.readTime || '5 мин'})</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-outline" style="padding:4px 10px; font-size:0.8rem;" onclick="AdminModule.openEditArticle('${sec.id}', '${art.id}')">✏️ Редактировать</button>
            <button class="btn-icon-danger" onclick="AdminModule.deleteArticle('${sec.id}', '${art.id}')" title="Удалить статью">🗑️</button>
          </div>
        </div>
      `).join('');

      secCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
          <div>
            <h3 style="font-size:1.2rem; display:flex; align-items:center; gap:8px;">
              <span>${sec.icon || '📁'}</span>
              <span>${sec.title}</span>
            </h3>
            <p style="color:var(--text-muted); font-size:0.88rem; margin-top:4px;">${sec.description || ''}</p>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-primary" style="padding:6px 14px; font-size:0.85rem;" onclick="AdminModule.openAddArticle('${sec.id}')">+ Добавить статью</button>
            <button class="btn-icon-danger" onclick="AdminModule.deleteSection('${sec.id}')" title="Удалить раздел">🗑️</button>
          </div>
        </div>
        <div style="padding-left:12px; border-left:2px solid var(--border);">
          ${articlesList || '<div style="color:var(--text-dim); font-size:0.88rem;">В этом разделе пока нет статей</div>'}
        </div>
      `;

      container.appendChild(secCard);
    });
  },

  addSectionPrompt() {
    const title = prompt('Введите название нового раздела:');
    if (!title) return;
    const icon = prompt('Иконка-эмодзи (например: 🚀, 💻, 🔒):', '📖') || '📖';
    const desc = prompt('Краткое описание раздела:') || '';

    const newSec = {
      id: 'sec-' + Date.now(),
      title,
      icon,
      description: desc,
      order: (this.adminData.sections || []).length + 1,
      articles: []
    };

    this.adminData.sections.push(newSec);
    this.saveDataToServer('Раздел успешно добавлен');
  },

  deleteSection(sectionId) {
    if (!confirm('Вы уверены, что хотите удалить этот раздел и все статьи в нём?')) return;
    this.adminData.sections = this.adminData.sections.filter(s => s.id !== sectionId);
    this.saveDataToServer('Раздел удалён');
  },

  openAddArticle(sectionId) {
    this.editingArticle = {
      sectionId,
      article: {
        id: 'art-' + Date.now(),
        title: '',
        readTime: '5 мин',
        content: '# Заголовок статьи\n\nТекст статьи в формате **Markdown**.\n\n- Пункт списка 1\n- Пункт списка 2\n\n```bash\necho "Пример команды"\n```'
      },
      isNew: true
    };
    this.showArticleModal();
  },

  openEditArticle(sectionId, articleId) {
    const sec = this.adminData.sections.find(s => s.id === sectionId);
    if (!sec) return;
    const art = sec.articles.find(a => a.id === articleId);
    if (!art) return;

    this.editingArticle = {
      sectionId,
      article: JSON.parse(JSON.stringify(art)),
      isNew: false
    };
    this.showArticleModal();
  },

  showArticleModal() {
    document.getElementById('edit-article-title').value = this.editingArticle.article.title;
    document.getElementById('edit-article-time').value = this.editingArticle.article.readTime || '5 мин';
    document.getElementById('edit-article-content').value = this.editingArticle.article.content || '';

    this.updateLivePreview();
    document.getElementById('modal-edit-article').classList.add('active');
  },

  closeArticleModal() {
    document.getElementById('modal-edit-article').classList.remove('active');
    this.editingArticle = null;
  },

  updateLivePreview() {
    const raw = document.getElementById('edit-article-content').value;
    const previewEl = document.getElementById('article-editor-preview');
    if (previewEl) {
      previewEl.innerHTML = Markdown.render(raw);
    }
  },

  insertMarkdownHelper(type) {
    const textarea = document.getElementById('edit-article-content');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    let replacement = '';

    switch (type) {
      case 'bold': replacement = `**${selected || 'жирный текст'}**`; break;
      case 'italic': replacement = `*${selected || 'курсив'}*`; break;
      case 'h2': replacement = `\n## ${selected || 'Подзаголовок'}\n`; break;
      case 'code': replacement = `\n\`\`\`bash\n${selected || 'echo "код"'}\n\`\`\`\n`; break;
      case 'note': replacement = `\n> **Примечание:** ${selected || 'Важное уточнение'}\n`; break;
      case 'table': replacement = `\n| Параметр | Значение |\n| :--- | :--- |\n| Порт | 8080 |\n| Хост | 0.0.0.0 |\n`; break;
    }

    textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    this.updateLivePreview();
  },

  saveArticle() {
    const title = document.getElementById('edit-article-title').value.trim();
    const readTime = document.getElementById('edit-article-time').value.trim();
    const content = document.getElementById('edit-article-content').value;

    if (!title) {
      Toast.show('Укажите название статьи', 'error');
      return;
    }

    const sec = this.adminData.sections.find(s => s.id === this.editingArticle.sectionId);
    if (!sec) return;

    if (this.editingArticle.isNew) {
      sec.articles.push({
        id: this.editingArticle.article.id,
        title,
        readTime,
        content
      });
    } else {
      const idx = sec.articles.findIndex(a => a.id === this.editingArticle.article.id);
      if (idx !== -1) {
        sec.articles[idx].title = title;
        sec.articles[idx].readTime = readTime;
        sec.articles[idx].content = content;
      }
    }

    this.closeArticleModal();
    this.saveDataToServer('Статья успешно сохранена');
  },

  deleteArticle(sectionId, articleId) {
    if (!confirm('Удалить эту статью?')) return;
    const sec = this.adminData.sections.find(s => s.id === sectionId);
    if (!sec) return;
    sec.articles = sec.articles.filter(a => a.id !== articleId);
    this.saveDataToServer('Статья удалена');
  },

  // -------------------------------------------------------------
  // TAB 2: QUIZZES & QUESTIONS
  // -------------------------------------------------------------
  renderQuizzesTab() {
    const container = document.getElementById('admin-quizzes-list');
    container.innerHTML = '';

    (this.adminData.quizzes || []).forEach(quiz => {
      const card = document.createElement('div');
      card.className = 'question-box';
      card.style.marginBottom = '20px';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <h3 style="font-size:1.2rem;">${quiz.title}</h3>
            <p style="color:var(--text-muted); font-size:0.88rem;">${quiz.description || ''}</p>
            <div style="font-size:0.8rem; color:var(--text-dim); margin-top:4px;">
              ⏱️ Ограничение: ${quiz.timeLimit ? quiz.timeLimit + ' мин' : 'без ограничения'} • Вопросов: ${(quiz.questions || []).length}
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-primary" style="padding:6px 14px; font-size:0.85rem;" onclick="AdminModule.openEditQuiz('${quiz.id}')">✏️ Настроить вопросы</button>
            <button class="btn-icon-danger" onclick="AdminModule.deleteQuiz('${quiz.id}')" title="Удалить тест">🗑️</button>
          </div>
        </div>
      `;

      container.appendChild(card);
    });
  },

  createQuizPrompt() {
    const title = prompt('Введите название теста:');
    if (!title) return;
    const desc = prompt('Краткое описание теста:') || '';
    const timeLimitStr = prompt('Ограничение по времени в минутах (0 - без ограничения):', '10');

    const newQuiz = {
      id: 'quiz-' + Date.now(),
      title,
      description: desc,
      timeLimit: parseInt(timeLimitStr) || 0,
      questions: []
    };

    this.adminData.quizzes.push(newQuiz);
    this.saveDataToServer('Тест создан');
    this.openEditQuiz(newQuiz.id);
  },

  deleteQuiz(quizId) {
    if (!confirm('Удалить этот тест и все вопросы в нём?')) return;
    this.adminData.quizzes = this.adminData.quizzes.filter(q => q.id !== quizId);
    this.saveDataToServer('Тест удалён');
  },

  openEditQuiz(quizId) {
    const quiz = this.adminData.quizzes.find(q => q.id === quizId);
    if (!quiz) return;

    this.editingQuiz = JSON.parse(JSON.stringify(quiz));
    this.renderQuizEditorModal();
    document.getElementById('modal-edit-quiz').classList.add('active');
  },

  closeQuizModal() {
    document.getElementById('modal-edit-quiz').classList.remove('active');
    this.editingQuiz = null;
  },

  syncCurrentQuizDOM() {
    if (!this.editingQuiz) return;
    const titleEl = document.getElementById('edit-quiz-title');
    const descEl = document.getElementById('edit-quiz-desc');
    const timeEl = document.getElementById('edit-quiz-time');
    if (titleEl) this.editingQuiz.title = titleEl.value.trim();
    if (descEl) this.editingQuiz.description = descEl.value.trim();
    if (timeEl) this.editingQuiz.timeLimit = parseInt(timeEl.value) || 0;

    const list = document.getElementById('edit-quiz-questions-list');
    if (!list) return;

    const cardEls = list.querySelectorAll('.question-edit-card');
    cardEls.forEach((card, qIdx) => {
      if (!this.editingQuiz.questions[qIdx]) return;
      const q = this.editingQuiz.questions[qIdx];

      const qTextInp = card.querySelector('.q-text-input');
      if (qTextInp) q.question = qTextInp.value.trim();

      const qTypeSelect = card.querySelector('.q-type-select');
      if (qTypeSelect) q.type = qTypeSelect.value;

      const explTextarea = card.querySelector('.q-expl-textarea');
      if (explTextarea) q.explanation = explTextarea.value.trim();

      if (q.type === 'text') {
        const textInps = card.querySelectorAll('.q-text-answer-input');
        const acc = [];
        textInps.forEach(inp => {
          const val = inp.value.trim();
          if (val) acc.push(val);
        });
        q.acceptableAnswers = acc.length ? acc : [''];
      } else {
        const optRows = card.querySelectorAll('.option-edit-row');
        const options = [];
        const correct = [];
        optRows.forEach((row, optIdx) => {
          const optTextInp = row.querySelector('.q-option-text-input');
          const optChk = row.querySelector('.q-option-checkbox');
          if (optTextInp) options.push(optTextInp.value);
          if (optChk && optChk.checked) correct.push(optIdx);
        });
        q.options = options.length ? options : ['Вариант 1', 'Вариант 2'];
        q.correctAnswers = correct;
      }
    });
  },

  renderQuizEditorModal() {
    document.getElementById('edit-quiz-title').value = this.editingQuiz.title || '';
    document.getElementById('edit-quiz-desc').value = this.editingQuiz.description || '';
    document.getElementById('edit-quiz-time').value = this.editingQuiz.timeLimit || 0;

    const list = document.getElementById('edit-quiz-questions-list');
    list.innerHTML = '';

    (this.editingQuiz.questions || []).forEach((q, qIdx) => {
      const qCard = document.createElement('div');
      qCard.className = 'question-edit-card';

      let optionsBlock = '';

      if (q.type === 'text') {
        const acceptable = q.acceptableAnswers || (Array.isArray(q.options) && q.options.length ? q.options : ['']);
        const acceptableInputs = acceptable.map((ans, aIdx) => `
          <div class="option-edit-row">
            <span style="font-size:0.9rem; color:var(--success); font-weight:700;">✓</span>
            <input type="text" class="form-input q-text-answer-input" style="flex:1;" value="${(ans || '').replace(/"/g, '&quot;')}" oninput="AdminModule.updateAcceptableAnswer(${qIdx}, ${aIdx}, this.value)" placeholder="Правильный ответ (например: 443 или pwd)">
            <button class="btn-icon-danger" onclick="AdminModule.removeAcceptableAnswer(${qIdx}, ${aIdx})" title="Удалить вариант">✕</button>
          </div>
        `).join('');

        optionsBlock = `
          <div class="form-group">
            <label class="form-label">Правильные варианты ответа (допустимые синонимы):</label>
            <div style="font-size:0.8rem; color:var(--text-dim); margin-bottom:8px;">
              Пользователь должен будет сам вписать ответ в поле. При проверке регистр букв (большие/маленькие) не учитывается. Можно добавить несколько правильных синонимов.
            </div>
            <div id="text-answers-for-q-${qIdx}">${acceptableInputs}</div>
            <button class="btn-outline" style="padding:4px 10px; font-size:0.8rem; margin-top:6px;" onclick="AdminModule.addAcceptableAnswer(${qIdx})">+ Добавить вариант/синоним</button>
          </div>
        `;
      } else {
        let optionsInputs = (q.options || []).map((opt, optIdx) => {
          const isChecked = (q.correctAnswers || []).includes(optIdx);
          return `
            <div class="option-edit-row">
              <input type="checkbox" class="option-edit-checkbox q-option-checkbox" ${isChecked ? 'checked' : ''} onchange="AdminModule.toggleCorrectAnswer(${qIdx}, ${optIdx}, this.checked)">
              <input type="text" class="form-input q-option-text-input" style="flex:1;" value="${(opt || '').replace(/"/g, '&quot;')}" oninput="AdminModule.updateOptionText(${qIdx}, ${optIdx}, this.value)" placeholder="Вариант ответа">
              <button class="btn-icon-danger" onclick="AdminModule.removeOption(${qIdx}, ${optIdx})" title="Удалить вариант">✕</button>
            </div>
          `;
        }).join('');

        optionsBlock = `
          <div class="form-group">
            <label class="form-label">Варианты ответов (отметьте галочкой правильные):</label>
            <div id="options-for-q-${qIdx}">${optionsInputs}</div>
            <button class="btn-outline" style="padding:4px 10px; font-size:0.8rem; margin-top:6px;" onclick="AdminModule.addOption(${qIdx})">+ Добавить вариант ответа</button>
          </div>
        `;
      }

      qCard.innerHTML = `
        <div class="q-edit-header">
          <span class="q-edit-num">Вопрос #${qIdx + 1}</span>
          <button class="btn-icon-danger" onclick="AdminModule.removeQuestion(${qIdx})" title="Удалить вопрос">🗑️ Удалить</button>
        </div>
        <div class="form-group">
          <label class="form-label">Текст вопроса:</label>
          <input type="text" class="form-input q-text-input" value="${(q.question || '').replace(/"/g, '&quot;')}" oninput="AdminModule.updateQuestionText(${qIdx}, this.value)" placeholder="Введите текст вопроса...">
        </div>
        <div class="form-group">
          <label class="form-label">Тип вопроса:</label>
          <select class="form-select q-type-select" onchange="AdminModule.updateQuestionType(${qIdx}, this.value)">
            <option value="single" ${q.type === 'single' ? 'selected' : ''}>Одиночный выбор (один верный ответ из предложенных)</option>
            <option value="multiple" ${q.type === 'multiple' ? 'selected' : ''}>Множественный выбор (несколько верных ответов из предложенных)</option>
            <option value="text" ${q.type === 'text' ? 'selected' : ''}>✍️ Ввод текста (пользователь вписывает ответ сам)</option>
          </select>
        </div>
        ${optionsBlock}
        <div class="form-group">
          <label class="form-label">Пояснение (будет показано после ответа):</label>
          <textarea class="form-textarea q-expl-textarea" style="min-height:60px;" oninput="AdminModule.updateQuestionExplanation(${qIdx}, this.value)" placeholder="Почему этот ответ верный...">${q.explanation || ''}</textarea>
        </div>
      `;

      list.appendChild(qCard);
    });
  },

  addQuestionToQuiz() {
    this.syncCurrentQuizDOM();
    this.editingQuiz.questions.push({
      id: 'q-' + Date.now(),
      question: '',
      type: 'single',
      options: ['Вариант 1', 'Вариант 2', 'Вариант 3'],
      correctAnswers: [0],
      explanation: ''
    });
    this.renderQuizEditorModal();
  },

  removeQuestion(qIdx) {
    this.syncCurrentQuizDOM();
    this.editingQuiz.questions.splice(qIdx, 1);
    this.renderQuizEditorModal();
  },

  updateQuestionText(qIdx, text) {
    if (this.editingQuiz.questions[qIdx]) {
      this.editingQuiz.questions[qIdx].question = text;
    }
  },

  updateQuestionType(qIdx, type) {
    this.syncCurrentQuizDOM();
    const q = this.editingQuiz.questions[qIdx];
    if (!q) return;
    q.type = type;
    if (type === 'text') {
      if (!Array.isArray(q.acceptableAnswers) || q.acceptableAnswers.length === 0) {
        q.acceptableAnswers = q.options && q.options.length ? [q.options[0]] : [''];
      }
    } else {
      if (!Array.isArray(q.options) || q.options.length === 0) {
        q.options = ['Вариант 1', 'Вариант 2'];
        q.correctAnswers = [0];
      }
    }
    this.renderQuizEditorModal();
  },

  updateAcceptableAnswer(qIdx, aIdx, val) {
    if (this.editingQuiz.questions[qIdx]) {
      if (!this.editingQuiz.questions[qIdx].acceptableAnswers) {
        this.editingQuiz.questions[qIdx].acceptableAnswers = [];
      }
      this.editingQuiz.questions[qIdx].acceptableAnswers[aIdx] = val;
    }
  },

  addAcceptableAnswer(qIdx) {
    this.syncCurrentQuizDOM();
    if (this.editingQuiz.questions[qIdx]) {
      if (!this.editingQuiz.questions[qIdx].acceptableAnswers) {
        this.editingQuiz.questions[qIdx].acceptableAnswers = [];
      }
      this.editingQuiz.questions[qIdx].acceptableAnswers.push('');
      this.renderQuizEditorModal();
    }
  },

  removeAcceptableAnswer(qIdx, aIdx) {
    this.syncCurrentQuizDOM();
    if (this.editingQuiz.questions[qIdx] && this.editingQuiz.questions[qIdx].acceptableAnswers) {
      this.editingQuiz.questions[qIdx].acceptableAnswers.splice(aIdx, 1);
      if (this.editingQuiz.questions[qIdx].acceptableAnswers.length === 0) {
        this.editingQuiz.questions[qIdx].acceptableAnswers.push('');
      }
      this.renderQuizEditorModal();
    }
  },

  updateQuestionExplanation(qIdx, text) {
    if (this.editingQuiz.questions[qIdx]) {
      this.editingQuiz.questions[qIdx].explanation = text;
    }
  },

  addOption(qIdx) {
    this.syncCurrentQuizDOM();
    if (this.editingQuiz.questions[qIdx]) {
      if (!Array.isArray(this.editingQuiz.questions[qIdx].options)) {
        this.editingQuiz.questions[qIdx].options = [];
      }
      this.editingQuiz.questions[qIdx].options.push('Новый вариант');
      this.renderQuizEditorModal();
    }
  },

  removeOption(qIdx, optIdx) {
    this.syncCurrentQuizDOM();
    if (this.editingQuiz.questions[qIdx] && Array.isArray(this.editingQuiz.questions[qIdx].options)) {
      this.editingQuiz.questions[qIdx].options.splice(optIdx, 1);
      this.editingQuiz.questions[qIdx].correctAnswers = (this.editingQuiz.questions[qIdx].correctAnswers || [])
        .filter(i => i !== optIdx)
        .map(i => i > optIdx ? i - 1 : i);
      this.renderQuizEditorModal();
    }
  },

  updateOptionText(qIdx, optIdx, val) {
    if (this.editingQuiz.questions[qIdx] && this.editingQuiz.questions[qIdx].options) {
      this.editingQuiz.questions[qIdx].options[optIdx] = val;
    }
  },

  toggleCorrectAnswer(qIdx, optIdx, isChecked) {
    this.syncCurrentQuizDOM();
    const q = this.editingQuiz.questions[qIdx];
    if (!q) return;
    if (q.type === 'single') {
      q.correctAnswers = isChecked ? [optIdx] : [];
      this.renderQuizEditorModal();
    } else {
      if (!Array.isArray(q.correctAnswers)) q.correctAnswers = [];
      if (isChecked && !q.correctAnswers.includes(optIdx)) {
        q.correctAnswers.push(optIdx);
      } else if (!isChecked) {
        q.correctAnswers = q.correctAnswers.filter(i => i !== optIdx);
      }
    }
  },

  saveQuiz() {
    this.syncCurrentQuizDOM();
    const title = (this.editingQuiz.title || '').trim();
    const desc = (this.editingQuiz.description || '').trim();
    const timeLimit = parseInt(this.editingQuiz.timeLimit) || 0;

    if (!title) {
      Toast.show('Укажите название теста', 'error');
      return;
    }

    // Clean up questions
    (this.editingQuiz.questions || []).forEach(q => {
      if (q.type === 'text') {
        q.acceptableAnswers = (q.acceptableAnswers || [])
          .map(a => String(a).trim())
          .filter(Boolean);
        if (q.acceptableAnswers.length === 0) {
          q.acceptableAnswers = [''];
        }
      } else {
        if (!Array.isArray(q.options) || q.options.length === 0) {
          q.options = ['Вариант 1', 'Вариант 2'];
        }
        if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0) {
          q.correctAnswers = [0];
        } else if (q.type === 'single' && q.correctAnswers.length > 1) {
          q.correctAnswers = [q.correctAnswers[0]];
        }
      }
    });

    this.editingQuiz.title = title;
    this.editingQuiz.description = desc;
    this.editingQuiz.timeLimit = timeLimit;

    if (!Array.isArray(this.adminData.quizzes)) {
      this.adminData.quizzes = [];
    }

    const idx = this.adminData.quizzes.findIndex(q => q.id === this.editingQuiz.id);
    if (idx !== -1) {
      this.adminData.quizzes[idx] = this.editingQuiz;
    } else {
      this.adminData.quizzes.push(this.editingQuiz);
    }

    this.closeQuizModal();
    this.saveDataToServer('Тест успешно сохранён');
  },

  // -------------------------------------------------------------
  // TAB 3: SETTINGS & BACKUP
  // -------------------------------------------------------------
  renderSettingsTab() {
    document.getElementById('setting-site-title').value = this.adminData.settings?.siteTitle || '';
    document.getElementById('setting-site-desc').value = this.adminData.settings?.siteSubtitle || '';
  },

  saveSettings() {
    const siteTitle = document.getElementById('setting-site-title').value.trim();
    const siteSubtitle = document.getElementById('setting-site-desc').value.trim();

    if (!this.adminData.settings) this.adminData.settings = {};
    this.adminData.settings.siteTitle = siteTitle;
    this.adminData.settings.siteSubtitle = siteSubtitle;

    this.saveDataToServer('Настройки сайта обновлены');
  },

  async changePassword() {
    const currentPassword = document.getElementById('pwd-current').value;
    const newPassword = document.getElementById('pwd-new').value;

    if (!currentPassword || !newPassword) {
      Toast.show('Заполните оба поля пароля', 'error');
      return;
    }

    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      document.getElementById('pwd-current').value = '';
      document.getElementById('pwd-new').value = '';
      Toast.show('Пароль успешно изменён!', 'success');
    } catch (err) {
      Toast.show(err.message, 'error');
    }
  },

  exportBackup() {
    window.location.href = `/api/admin/export?t=${Date.now()}`;
  },

  importBackupFile(inputEl) {
    const file = inputEl.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target.result);
        const res = await fetch('/api/admin/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          },
          body: JSON.stringify({ importedData: json })
        });

        if (!res.ok) throw new Error('Ошибка импорта данных');
        Toast.show('Данные успешно восстановлены из бэкапа!', 'success');
        this.verifyAndLoad();
        AppState.loadContent();
      } catch (err) {
        Toast.show('Неверный формат файла бэкапа: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  },

  // -------------------------------------------------------------
  // SAVE DATA TO SERVER
  // -------------------------------------------------------------
  async saveDataToServer(successMessage = 'Изменения сохранены') {
    if (!this.token) {
      Toast.show('Вы не авторизованы. Пожалуйста, войдите в панель управления.', 'error');
      this.showLogin();
      return;
    }

    try {
      const res = await fetch('/api/admin/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify(this.adminData)
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          Toast.show('Сессия авторизации истекла. Пожалуйста, войдите снова.', 'error');
          this.logout();
          return;
        }
        throw new Error(data.error || 'Ошибка сохранения данных');
      }

      Toast.show(successMessage, 'success');
      this.renderCurrentTab();
      // Update public view immediately
      if (typeof AppState !== 'undefined' && AppState.loadContent) {
        AppState.loadContent();
      }
    } catch (err) {
      Toast.show(err.message, 'error');
    }
  }
};
