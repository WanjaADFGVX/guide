// Quiz Runner and Scoring Engine
const QuizModule = {
  currentQuiz: null,
  currentQuestionIndex: 0,
  userAnswers: {}, // { [questionId]: [optionIndex, ...] }
  timerInterval: null,
  secondsLeft: 0,

  initQuiz(quizId) {
    const quiz = AppState.content.quizzes.find(q => q.id === quizId);
    if (!quiz) {
      Toast.show('Тест не найден', 'error');
      AppRouter.navigate('quizzes');
      return;
    }

    this.currentQuiz = quiz;
    this.currentQuestionIndex = 0;
    this.userAnswers = {};

    // Switch view
    AppRouter.showView('view-quiz-runner');

    // Timer setup
    if (this.timerInterval) clearInterval(this.timerInterval);
    const timerEl = document.getElementById('runner-timer');
    if (quiz.timeLimit && quiz.timeLimit > 0) {
      this.secondsLeft = quiz.timeLimit * 60;
      timerEl.style.display = 'flex';
      this.updateTimerDisplay();
      this.timerInterval = setInterval(() => {
        this.secondsLeft--;
        this.updateTimerDisplay();
        if (this.secondsLeft <= 0) {
          clearInterval(this.timerInterval);
          Toast.show('Время вышло! Отправляем тест на проверку...', 'warning');
          this.submitQuiz();
        }
      }, 1000);
    } else {
      timerEl.style.display = 'none';
    }

    this.renderQuestionIndicators();
    this.renderCurrentQuestion();
  },

  updateTimerDisplay() {
    const timerText = document.getElementById('runner-timer-text');
    if (!timerText) return;
    const mins = Math.floor(this.secondsLeft / 60);
    const secs = this.secondsLeft % 60;
    timerText.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  },

  renderQuestionIndicators() {
    const container = document.getElementById('runner-indicators');
    container.innerHTML = '';

    this.currentQuiz.questions.forEach((q, idx) => {
      const pill = document.createElement('button');
      pill.className = `question-pill ${idx === this.currentQuestionIndex ? 'active' : ''}`;
      
      const isAnswered = q.type === 'text'
        ? (typeof this.userAnswers[q.id] === 'string' && this.userAnswers[q.id].trim().length > 0)
        : (this.userAnswers[q.id] && this.userAnswers[q.id].length > 0);

      if (isAnswered) {
        pill.classList.add('answered');
      }
      pill.textContent = idx + 1;
      pill.onclick = () => {
        this.currentQuestionIndex = idx;
        this.renderQuestionIndicators();
        this.renderCurrentQuestion();
      };
      container.appendChild(pill);
    });

    // Update progress bar
    const total = this.currentQuiz.questions.length;
    const answeredCount = this.currentQuiz.questions.filter(q => {
      if (q.type === 'text') {
        return typeof this.userAnswers[q.id] === 'string' && this.userAnswers[q.id].trim().length > 0;
      }
      return this.userAnswers[q.id]?.length > 0;
    }).length;
    const percent = total > 0 ? (answeredCount / total) * 100 : 0;
    document.getElementById('runner-progress-fill').style.width = `${percent}%`;
  },

  renderCurrentQuestion() {
    const q = this.currentQuiz.questions[this.currentQuestionIndex];
    if (!q) return;

    let typeLabel = 'Один вариант ответа';
    if (q.type === 'multiple') typeLabel = 'Несколько вариантов';
    if (q.type === 'text') typeLabel = 'Ввод текста вручную';

    document.getElementById('runner-quiz-title').textContent = this.currentQuiz.title;
    document.getElementById('q-number-tag').textContent = `Вопрос ${this.currentQuestionIndex + 1} из ${this.currentQuiz.questions.length} • ${typeLabel}`;
    document.getElementById('q-prompt-text').textContent = q.question;

    const optionsContainer = document.getElementById('q-options-container');
    optionsContainer.innerHTML = '';

    if (q.type === 'text') {
      const currentVal = this.userAnswers[q.id] || '';
      const textWrapper = document.createElement('div');
      textWrapper.style.display = 'flex';
      textWrapper.style.flexDirection = 'column';
      textWrapper.style.gap = '12px';

      textWrapper.innerHTML = `
        <label style="font-size:0.92rem; font-weight:600; color:var(--text-main);">Ваш ответ:</label>
        <input type="text" id="q-text-input-${q.id}" class="form-input" style="font-size:1.05rem; padding:14px 18px; border-radius:var(--radius-md);" placeholder="Введите точный ответ (слово, число или команду)..." value="${currentVal.replace(/"/g, '&quot;')}">
        <div style="font-size:0.8rem; color:var(--text-dim); display:flex; align-items:center; gap:6px;">
          <span>💡 Регистр букв (заглавные/строчные) при проверке не учитывается.</span>
        </div>
      `;

      const input = textWrapper.querySelector('input');
      input.oninput = (e) => {
        this.userAnswers[q.id] = e.target.value;
        this.renderQuestionIndicators();
      };

      optionsContainer.appendChild(textWrapper);
      setTimeout(() => input.focus(), 60);
    } else {
      const currentSelected = this.userAnswers[q.id] || [];

      q.options.forEach((optText, optIdx) => {
        const isSelected = currentSelected.includes(optIdx);
        const optItem = document.createElement('div');
        optItem.className = `option-item ${q.type === 'multiple' ? 'multiple' : ''} ${isSelected ? 'selected' : ''}`;

        optItem.innerHTML = `
          <div class="option-indicator">
            ${isSelected ? (q.type === 'multiple' ? '✓' : '●') : ''}
          </div>
          <div class="option-text">${optText}</div>
        `;

        optItem.onclick = () => {
          this.toggleOption(q.id, optIdx, q.type === 'multiple');
        };

        optionsContainer.appendChild(optItem);
      });
    }

    // Prev / Next button states
    const prevBtn = document.getElementById('btn-prev-q');
    const nextBtn = document.getElementById('btn-next-q');
    const submitBtn = document.getElementById('btn-finish-quiz');

    prevBtn.disabled = this.currentQuestionIndex === 0;
    prevBtn.style.opacity = this.currentQuestionIndex === 0 ? '0.4' : '1';

    if (this.currentQuestionIndex === this.currentQuiz.questions.length - 1) {
      nextBtn.style.display = 'none';
      submitBtn.style.display = 'inline-flex';
    } else {
      nextBtn.style.display = 'inline-flex';
      submitBtn.style.display = 'none';
    }
  },

  toggleOption(questionId, optIdx, isMultiple) {
    if (!this.userAnswers[questionId]) {
      this.userAnswers[questionId] = [];
    }

    if (isMultiple) {
      const idx = this.userAnswers[questionId].indexOf(optIdx);
      if (idx > -1) {
        this.userAnswers[questionId].splice(idx, 1);
      } else {
        this.userAnswers[questionId].push(optIdx);
      }
    } else {
      this.userAnswers[questionId] = [optIdx];
    }

    this.renderQuestionIndicators();
    this.renderCurrentQuestion();
  },

  prevQuestion() {
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
      this.renderQuestionIndicators();
      this.renderCurrentQuestion();
    }
  },

  nextQuestion() {
    if (this.currentQuestionIndex < this.currentQuiz.questions.length - 1) {
      this.currentQuestionIndex++;
      this.renderQuestionIndicators();
      this.renderCurrentQuestion();
    }
  },

  async submitQuiz() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    try {
      const res = await fetch('/api/quiz/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizId: this.currentQuiz.id,
          answers: this.userAnswers
        })
      });

      if (!res.ok) throw new Error('Ошибка проверки ответов');
      const data = await res.json();
      this.displayResults(data);
    } catch (err) {
      Toast.show(err.message, 'error');
    }
  },

  displayResults(data) {
    AppRouter.showView('view-quiz-results');

    // Circle score
    const circle = document.getElementById('results-circle');
    const scoreNum = document.getElementById('results-score-num');
    const totalNum = document.getElementById('results-total-num');
    const titleEl = document.getElementById('results-main-title');
    const descEl = document.getElementById('results-main-desc');

    scoreNum.textContent = `${data.percentage}%`;
    totalNum.textContent = `${data.score} из ${data.total}`;

    circle.className = `results-score-circle ${data.passed ? 'passed' : 'failed'}`;

    if (data.passed) {
      titleEl.textContent = '🎉 Поздравляем! Тест успешно сдан!';
      descEl.textContent = `Вы ответили правильно на ${data.score} из ${data.total} вопросов (${data.percentage}%). Материал усвоен на отлично!`;
    } else {
      titleEl.textContent = '📚 Тест требует повторения';
      descEl.textContent = `Вы ответили правильно на ${data.score} из ${data.total} вопросов (${data.percentage}%). Рекомендуем перечитать разделы методички и попробовать снова.`;
    }

    // Breakdown list
    const breakdownList = document.getElementById('results-breakdown-list');
    breakdownList.innerHTML = '';

    data.results.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = `breakdown-card ${item.isCorrect ? 'correct' : 'incorrect'}`;

      // If question was text input
      if (item.type === 'text') {
        const userText = item.userAnswerText || '(ответ не указан)';
        const acceptableList = (item.acceptableAnswers || []).join(' или ');

        optionsHtml = `
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:0.92rem; color:var(--text-muted);">Ваш ответ:</span>
              <span class="breakdown-opt ${item.isCorrect ? 'is-correct-answer' : 'user-wrong-selection'}" style="margin:0; padding:4px 12px; font-weight:600;">
                ${userText} ${item.isCorrect ? '✓' : '✗'}
              </span>
            </div>
            ${!item.isCorrect ? `
              <div style="font-size:0.9rem; color:var(--text-muted); display:flex; align-items:center; gap:8px;">
                <span>Правильный ответ:</span>
                <span style="color:var(--success); font-weight:600; background:var(--success-bg); padding:2px 8px; border-radius:var(--radius-sm);">${acceptableList || '-'}</span>
              </div>
            ` : ''}
          </div>
        `;
      } else if (originalQ) {
        optionsHtml = originalQ.options.map((opt, optIndex) => {
          const isCorrect = item.correctAnswers.includes(optIndex);
          const wasSelected = item.userAnswers.includes(optIndex);
          
          let optClass = '';
          let badge = '';

          if (isCorrect) {
            optClass = 'is-correct-answer';
            badge = '✓ Правильный ответ';
          } else if (wasSelected && !isCorrect) {
            optClass = 'user-wrong-selection';
            badge = '✗ Ваш неверный ответ';
          }

          return `
            <div class="breakdown-opt ${optClass}">
              <span>${opt}</span>
              ${badge ? `<span style="margin-left:auto; font-size:0.75rem;">${badge}</span>` : ''}
            </div>
          `;
        }).join('');
      }

      card.innerHTML = `
        <div class="breakdown-q-title">${idx + 1}. ${item.question}</div>
        <div class="breakdown-options">${optionsHtml}</div>
        ${item.explanation ? `
          <div class="breakdown-explanation">
            <strong>💡 Пояснение:</strong> ${item.explanation}
          </div>
        ` : ''}
      `;

      breakdownList.appendChild(card);
    });
  }
};
