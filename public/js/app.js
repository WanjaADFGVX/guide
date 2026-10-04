// Core Application Orchestrator & Router

const Toast = {
  container: null,
  show(message, type = 'info') {
    if (!this.container) {
      this.container = document.getElementById('toast-container');
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }
};

const AppState = {
  content: null,
  activeArticle: null,
  completedArticles: JSON.parse(localStorage.getItem('completed_articles') || '[]'),

  async loadContent() {
    try {
      const res = await fetch('/api/content');
      if (!res.ok) throw new Error('Не удалось загрузить данные с сервера');
      this.content = await res.json();

      // Update titles
      if (this.content.settings) {
        document.title = this.content.settings.siteTitle;
        const brandTitle = document.getElementById('brand-title');
        const brandSub = document.getElementById('brand-subtitle');
        if (brandTitle) brandTitle.textContent = this.content.settings.siteTitle;
        if (brandSub) brandSub.textContent = this.content.settings.siteSubtitle;
      }

      this.renderSidebar();
      this.renderQuizzesList();
      AppRouter.handleHashChange();
    } catch (err) {
      Toast.show(err.message, 'error');
    }
  },

  renderSidebar() {
    const nav = document.getElementById('manual-sidebar-nav');
    if (!nav || !this.content) return;
    nav.innerHTML = '';

    let totalArticles = 0;
    let completedCount = 0;

    this.content.sections.forEach(sec => {
      const group = document.createElement('div');
      group.className = 'section-group';

      const headerBtn = document.createElement('button');
      headerBtn.className = 'section-header-btn';
      headerBtn.innerHTML = `
        <span class="section-icon">${sec.icon || '📁'}</span>
        <span>${sec.title}</span>
        <svg class="section-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      `;

      headerBtn.onclick = () => {
        group.classList.toggle('collapsed');
      };

      const articlesList = document.createElement('div');
      articlesList.className = 'section-articles-list';

      (sec.articles || []).forEach(art => {
        totalArticles++;
        const isDone = this.completedArticles.includes(art.id);
        if (isDone) completedCount++;

        const link = document.createElement('a');
        link.className = `article-nav-link ${isDone ? 'completed' : ''}`;
        link.href = `#manual/${sec.id}/${art.id}`;
        link.id = `nav-art-${art.id}`;
        link.onclick = () => {
          if (window.innerWidth <= 960) {
            toggleMobileSidebar(false);
          }
        };
        link.innerHTML = `
          <span>${art.title}</span>
          <div class="article-read-check">
            ${isDone ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
          </div>
        `;

        articlesList.appendChild(link);
      });

      group.appendChild(headerBtn);
      group.appendChild(articlesList);
      nav.appendChild(group);
    });

    // Update progress percentage
    const progressEl = document.getElementById('sidebar-progress-text');
    if (progressEl) {
      const percent = totalArticles > 0 ? Math.round((completedCount / totalArticles) * 100) : 0;
      progressEl.textContent = `${percent}% изучено`;
    }
  },

  openArticle(secId, artId) {
    if (!this.content) return;
    const sec = this.content.sections.find(s => s.id === secId);
    if (!sec) return;
    const art = sec.articles.find(a => a.id === artId);
    if (!art) return;

    this.activeArticle = { sec, art };

    // Update active state in sidebar
    document.querySelectorAll('.article-nav-link').forEach(el => el.classList.remove('active'));
    const link = document.getElementById(`nav-art-${art.id}`);
    if (link) link.classList.add('active');

    // Breadcrumbs
    document.getElementById('article-sec-name').textContent = sec.title;
    document.getElementById('article-art-name').textContent = art.title;

    // Meta
    document.getElementById('meta-read-time').textContent = `⏱️ ${art.readTime || '5 мин'}`;

    // Completed button state
    const isDone = this.completedArticles.includes(art.id);
    const completeBtn = document.getElementById('btn-mark-completed');
    completeBtn.className = `mark-completed-btn ${isDone ? 'done' : ''}`;
    completeBtn.innerHTML = isDone ? `<span>✓ Прочитано</span>` : `<span>Отметить как прочитанное</span>`;

    // Render Body
    document.getElementById('article-body').innerHTML = Markdown.render(art.content);

    // Associated Quiz CTA at bottom
    const quizCtaContainer = document.getElementById('article-quiz-cta');
    const associatedQuiz = this.content.quizzes.find(q => q.sectionId === sec.id);

    if (associatedQuiz) {
      quizCtaContainer.style.display = 'flex';
      quizCtaContainer.innerHTML = `
        <div class="quiz-cta-info">
          <h4>🎯 Закрепите знания по разделу</h4>
          <p>${associatedQuiz.title} (${associatedQuiz.questionCount} вопросов)</p>
        </div>
        <a href="#quiz/${associatedQuiz.id}" class="btn-primary">Пройти тест →</a>
      `;
    } else {
      quizCtaContainer.style.display = 'none';
    }

    // Prev / Next navigation
    this.setupArticlePagination(sec, art);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  setupArticlePagination(currSec, currArt) {
    // Flatten all articles
    const flat = [];
    this.content.sections.forEach(s => {
      (s.articles || []).forEach(a => flat.push({ sec: s, art: a }));
    });

    const currIdx = flat.findIndex(item => item.art.id === currArt.id);
    const prevBtn = document.getElementById('btn-prev-article');
    const nextBtn = document.getElementById('btn-next-article');

    if (currIdx > 0) {
      const prev = flat[currIdx - 1];
      prevBtn.style.visibility = 'visible';
      prevBtn.href = `#manual/${prev.sec.id}/${prev.art.id}`;
      prevBtn.innerHTML = `← ${prev.art.title}`;
    } else {
      prevBtn.style.visibility = 'hidden';
    }

    if (currIdx < flat.length - 1) {
      const next = flat[currIdx + 1];
      nextBtn.style.visibility = 'visible';
      nextBtn.href = `#manual/${next.sec.id}/${next.art.id}`;
      nextBtn.innerHTML = `${next.art.title} →`;
    } else {
      nextBtn.style.visibility = 'hidden';
    }
  },

  toggleArticleCompleted() {
    if (!this.activeArticle) return;
    const artId = this.activeArticle.art.id;
    const idx = this.completedArticles.indexOf(artId);

    if (idx === -1) {
      this.completedArticles.push(artId);
      Toast.show('Глава отмечена как изученная!', 'success');
    } else {
      this.completedArticles.splice(idx, 1);
    }

    localStorage.setItem('completed_articles', JSON.stringify(this.completedArticles));
    this.renderSidebar();

    const isDone = this.completedArticles.includes(artId);
    const completeBtn = document.getElementById('btn-mark-completed');
    completeBtn.className = `mark-completed-btn ${isDone ? 'done' : ''}`;
    completeBtn.innerHTML = isDone ? `<span>✓ Прочитано</span>` : `<span>Отметить как прочитанное</span>`;
  },

  renderQuizzesList() {
    const grid = document.getElementById('quizzes-grid-container');
    if (!grid || !this.content) return;
    grid.innerHTML = '';

    (this.content.quizzes || []).forEach(quiz => {
      const card = document.createElement('div');
      card.className = 'quiz-card';
      card.onclick = () => {
        window.location.hash = `#quiz/${quiz.id}`;
      };

      card.innerHTML = `
        <span class="quiz-card-badge">${quiz.timeLimit ? quiz.timeLimit + ' мин' : 'Без лимита'}</span>
        <h3 class="quiz-card-title">${quiz.title}</h3>
        <p class="quiz-card-desc">${quiz.description || ''}</p>
        <div class="quiz-card-meta">
          <span>📝 Вопросов: ${quiz.questionCount}</span>
          <span style="margin-left:auto; color:var(--primary); font-weight:600;">Начать →</span>
        </div>
      `;

      grid.appendChild(card);
    });
  }
};

// -------------------------------------------------------------
// ROUTER & NAVIGATION
// -------------------------------------------------------------
const AppRouter = {
  init() {
    window.addEventListener('hashchange', () => this.handleHashChange());
  },

  handleHashChange() {
    const hash = window.location.hash.slice(1) || 'manual';
    const parts = hash.split('/');
    const route = parts[0];

    // Nav active link highlight for desktop and mobile bottom bar
    document.querySelectorAll('.nav-btn, .mobile-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.route === route);
    });

    // Toggle mobile TOC FAB visibility
    const tocFab = document.getElementById('mobile-toc-fab');
    if (tocFab) {
      tocFab.style.display = route === 'manual' ? 'flex' : 'none';
    }

    if (window.innerWidth <= 960) {
      toggleMobileSidebar(false);
    }

    if (route === 'manual') {
      this.showView('view-manual');
      if (parts.length >= 3) {
        AppState.openArticle(parts[1], parts[2]);
      } else {
        // Open first article if none specified
        if (AppState.content?.sections?.[0]?.articles?.[0]) {
          const s = AppState.content.sections[0];
          const a = s.articles[0];
          window.location.hash = `#manual/${s.id}/${a.id}`;
        }
      }
    } else if (route === 'quizzes') {
      this.showView('view-quizzes');
    } else if (route === 'quiz') {
      if (parts[1]) {
        QuizModule.initQuiz(parts[1]);
      } else {
        window.location.hash = '#quizzes';
      }
    } else if (route === 'admin') {
      this.showView('view-admin');
      AdminModule.init();
    }
  },

  showView(viewId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
  },

  navigate(route) {
    window.location.hash = `#${route}`;
  }
};

// -------------------------------------------------------------
// SEARCH ENGINE (Instant Client-side Search)
// -------------------------------------------------------------
const SearchModule = {
  init() {
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('search-query-input');

    // Shortcut Ctrl+K / Cmd+K
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.open();
      }
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        this.close();
      }
    });

    input.addEventListener('input', (e) => {
      this.performSearch(e.target.value);
    });
  },

  open() {
    const modal = document.getElementById('search-modal');
    modal.classList.add('active');
    const input = document.getElementById('search-query-input');
    input.value = '';
    input.focus();
    this.performSearch('');
  },

  close() {
    document.getElementById('search-modal').classList.remove('active');
  },

  performSearch(query) {
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '';
    const q = query.toLowerCase().trim();

    if (!q) {
      resultsContainer.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:20px;">Введите поисковый запрос (например: SSH, Nginx, права доступа)...</div>';
      return;
    }

    const matches = [];

    // Search articles
    if (AppState.content?.sections) {
      AppState.content.sections.forEach(sec => {
        (sec.articles || []).forEach(art => {
          const inTitle = art.title.toLowerCase().includes(q);
          const inContent = art.content.toLowerCase().includes(q);

          if (inTitle || inContent) {
            let snippet = '';
            if (inContent) {
              const idx = art.content.toLowerCase().indexOf(q);
              const start = Math.max(0, idx - 40);
              const end = Math.min(art.content.length, idx + 80);
              snippet = '...' + art.content.substring(start, end).replace(/[#*`_]/g, '') + '...';
            } else {
              snippet = `Раздел: ${sec.title}`;
            }

            matches.push({
              title: art.title,
              badge: '📖 Статья',
              snippet,
              url: `#manual/${sec.id}/${art.id}`
            });
          }
        });
      });
    }

    // Search quizzes
    if (AppState.content?.quizzes) {
      AppState.content.quizzes.forEach(quiz => {
        if (quiz.title.toLowerCase().includes(q) || (quiz.description && quiz.description.toLowerCase().includes(q))) {
          matches.push({
            title: quiz.title,
            badge: '🎯 Тест',
            snippet: quiz.description || '',
            url: `#quiz/${quiz.id}`
          });
        }
      });
    }

    if (matches.length === 0) {
      resultsContainer.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:20px;">Ничего не найдено</div>';
      return;
    }

    matches.forEach(item => {
      const el = document.createElement('a');
      el.className = 'search-result-item';
      el.href = item.url;
      el.onclick = () => this.close();

      el.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="search-result-title">${item.title}</span>
          <span style="font-size:0.75rem; background:var(--primary-light); color:var(--primary); padding:2px 8px; border-radius:var(--radius-full);">${item.badge}</span>
        </div>
        <div class="search-result-snippet">${item.snippet}</div>
      `;

      resultsContainer.appendChild(el);
    });
  }
};

// -------------------------------------------------------------
// THEME & INITIALIZATION
// -------------------------------------------------------------
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  setTheme(savedTheme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function toggleMobileSidebar(force) {
  const sidebar = document.querySelector('.manual-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  const isOpen = force !== undefined ? force : !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', isOpen);
  if (backdrop) {
    backdrop.classList.toggle('active', isOpen);
  }
  document.body.style.overflow = (isOpen && window.innerWidth <= 960) ? 'hidden' : '';
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  AppRouter.init();
  SearchModule.init();
  AppState.loadContent();
});
