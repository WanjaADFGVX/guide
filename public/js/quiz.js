// Quiz Runner and Scoring Engine
const QuizModule = {
  currentQuiz: null,
  currentQuestionIndex: 0,
  userAnswers: {}, // { [questionId]: [optionIndex, ...] or "text" }
  checkedQuestions: {}, // { [questionId]: { isCorrect, correctAnswers, explanation, acceptableAnswers, userAnswerText } }
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
    this.checkedQuestions = {};

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
      
      const checkRes = this.checkedQuestions[q.id];
      if (checkRes) {
        pill.classList.add(checkRes.isCorrect ? 'correct-pill' : 'wrong-pill');
        pill.title = checkRes.isCorrect ? 'Верно' : 'Неверно';
      } else {
        const isAnswered = q.type === 'text'
          ? (typeof this.userAnswers[q.id] === 'string' && this.userAnswers[q.id].trim().length > 0)
          : (this.userAnswers[q.id] && this.userAnswers[q.id].length > 0);

        if (isAnswered) {
          pill.classList.add('answered');
        }
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
    const checkedCount = Object.keys(this.checkedQuestions).length;
    const percent = total > 0 ? (checkedCount / total) * 100 : 0;
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

    const feedbackEl = document.getElementById('q-instant-feedback');
    const checkRes = this.checkedQuestions[q.id];
    const isChecked = !!checkRes;

    if (q.type === 'text') {
      const currentVal = this.userAnswers[q.id] || '';
      const textWrapper = document.createElement('div');
      textWrapper.style.display = 'flex';
      textWrapper.style.flexDirection = 'column';
      textWrapper.style.gap = '12px';

      let inputBorder = '';
      if (isChecked) {
        inputBorder = checkRes.isCorrect
          ? 'border: 2px solid var(--success) !important; background: var(--success-bg);'
          : 'border: 2px solid var(--danger) !important; background: var(--danger-bg);';
      }

      textWrapper.innerHTML = `
        <label style="font-size:0.92rem; font-weight:600; color:var(--text-main);">Ваш ответ:</label>
        <input type="text" id="q-text-input-${q.id}" class="form-input" style="font-size:1.05rem; padding:14px 18px; border-radius:var(--radius-md); ${inputBorder}" placeholder="Введите ответ своими словами..." value="${currentVal.replace(/"/g, '&quot;')}" ${isChecked ? 'disabled' : ''}>
        ${!isChecked ? '<div style="font-size:0.8rem; color:var(--text-dim);">💡 Регистр букв, падежи и порядок слов не влияют на оценку.</div>' : ''}
      `;

      const input = textWrapper.querySelector('input');
      if (!isChecked) {
        input.oninput = (e) => {
          this.userAnswers[q.id] = e.target.value;
          this.renderQuestionIndicators();
          this.updateNavButtons();
        };
        setTimeout(() => input.focus(), 60);
      }

      optionsContainer.appendChild(textWrapper);
    } else {
      const currentSelected = this.userAnswers[q.id] || [];

      q.options.forEach((optText, optIdx) => {
        const isSelected = currentSelected.includes(optIdx);
        const optItem = document.createElement('div');
        optItem.className = `option-item ${q.type === 'multiple' ? 'multiple' : ''}`;

        if (!isChecked) {
          if (isSelected) optItem.classList.add('selected');
          optItem.onclick = () => {
            this.toggleOption(q.id, optIdx, q.type === 'multiple');
          };
        } else {
          optItem.classList.add('disabled-clicks');
          const isCorrectAnswer = (checkRes.correctAnswers || []).includes(optIdx);

          if (isSelected && isCorrectAnswer) {
            optItem.classList.add('is-correct-selected');
          } else if (isSelected && !isCorrectAnswer) {
            optItem.classList.add('is-wrong-selected');
          } else if (!isSelected && isCorrectAnswer) {
            optItem.classList.add('show-correct');
          }
        }

        let indicatorContent = '';
        if (isChecked) {
          const isCorrectAnswer = (checkRes.correctAnswers || []).includes(optIdx);
          if (isSelected && isCorrectAnswer) indicatorContent = '✓';
          else if (isSelected && !isCorrectAnswer) indicatorContent = '✕';
          else if (!isSelected && isCorrectAnswer) indicatorContent = '✓';
        } else if (isSelected) {
          indicatorContent = q.type === 'multiple' ? '✓' : '●';
        }

        optItem.innerHTML = `
          <div class="option-indicator">
            ${indicatorContent}
          </div>
          <div class="option-text">${optText}</div>
          ${isChecked && (checkRes.correctAnswers || []).includes(optIdx) ? '<span style="font-size:0.78rem; font-weight:700; color:var(--success); margin-left:auto;">Правильный ответ</span>' : ''}
        `;

        optionsContainer.appendChild(optItem);
      });
    }

    // Instant explanation & result display
    if (isChecked) {
      feedbackEl.style.display = 'block';
      const badgeClass = checkRes.isCorrect ? 'correct' : 'wrong';
      const badgeText = checkRes.isCorrect ? '✓ Верно!' : '✕ Неверно';
      let correctHint = '';

      if (q.type === 'text' && !checkRes.isCorrect) {
        const acceptableList = (checkRes.acceptableAnswers || []).join(' или ');
        correctHint = `<div style="margin-bottom:8px; font-size:0.92rem; color:var(--text-muted);"><strong>Правильный ответ:</strong> <span style="color:var(--success); font-weight:600;">${acceptableList || '-'}</span></div>`;
      }

      feedbackEl.innerHTML = `
        <div class="instant-explanation-card ${checkRes.isCorrect ? 'correct-exp' : 'wrong-exp'}">
          <div class="exp-badge ${badgeClass}">${badgeText}</div>
          ${correctHint}
          ${checkRes.explanation ? `<div class="exp-body"><strong>💡 Пояснение:</strong> ${checkRes.explanation}</div>` : ''}
        </div>
      `;
    } else {
      feedbackEl.style.display = 'none';
      feedbackEl.innerHTML = '';
    }

    this.updateNavButtons();
  },

  updateNavButtons() {
    const q = this.currentQuiz.questions[this.currentQuestionIndex];
    if (!q) return;

    const prevBtn = document.getElementById('btn-prev-q');
    const checkBtn = document.getElementById('btn-check-q');
    const nextBtn = document.getElementById('btn-next-q');
    const submitBtn = document.getElementById('btn-finish-quiz');

    const isChecked = !!this.checkedQuestions[q.id];
    const isLast = this.currentQuestionIndex === this.currentQuiz.questions.length - 1;

    // Has user chosen an answer?
    const hasAnswer = q.type === 'text'
      ? (typeof this.userAnswers[q.id] === 'string' && this.userAnswers[q.id].trim().length > 0)
      : (this.userAnswers[q.id] && this.userAnswers[q.id].length > 0);

    // Prev button
    prevBtn.disabled = this.currentQuestionIndex === 0;
    prevBtn.style.opacity = this.currentQuestionIndex === 0 ? '0.4' : '1';

    if (!isChecked) {
      // Must check first
      checkBtn.style.display = 'inline-flex';
      checkBtn.disabled = !hasAnswer;
      checkBtn.style.opacity = hasAnswer ? '1' : '0.5';
      checkBtn.textContent = 'Ответить';

      nextBtn.style.display = 'none';
      submitBtn.style.display = 'none';
    } else {
      // Already checked: show Next or Finish
      checkBtn.style.display = 'none';

      if (isLast) {
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'inline-flex';
        submitBtn.textContent = 'Завершить тест и посмотреть итоги ✓';
      } else {
        nextBtn.style.display = 'inline-flex';
        submitBtn.style.display = 'none';
      }
    }
  },

  async checkCurrentQuestion() {
    const q = this.currentQuiz.questions[this.currentQuestionIndex];
    if (!q) return;

    const ans = this.userAnswers[q.id];
    if (q.type === 'text') {
      if (!ans || typeof ans !== 'string' || !ans.trim()) {
        Toast.show('Введите ответ в поле', 'warning');
        return;
      }
    } else {
      if (!ans || !ans.length) {
        Toast.show('Выберите вариант ответа', 'warning');
        return;
      }
    }

    const checkBtn = document.getElementById('btn-check-q');
    if (checkBtn) {
      checkBtn.disabled = true;
      checkBtn.textContent = 'Проверяем...';
    }

    try {
      const res = await fetch('/api/quiz/check-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizId: this.currentQuiz.id,
          questionId: q.id,
          answer: ans
        })
      });

      if (!res.ok) throw new Error('Ошибка проверки');
      const data = await res.json();
      this.checkedQuestions[q.id] = data;

      this.renderQuestionIndicators();
      this.renderCurrentQuestion();
    } catch (err) {
      Toast.show(err.message, 'error');
      if (checkBtn) {
        checkBtn.disabled = false;
        checkBtn.textContent = 'Ответить';
      }
    }
  },

  toggleOption(questionId, optIdx, isMultiple) {
    if (this.checkedQuestions[questionId]) return;

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
