// Lightweight, fast, safe Markdown renderer
const Markdown = {
  render(text) {
    if (!text) return '';

    let html = text;

    // Normalize line breaks
    html = html.replace(/\r\n/g, '\n');

    // Protect code blocks first
    const codeBlocks = [];
    html = html.replace(/```([a-zA-Z0-9_\-]+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const id = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push({ lang: lang || 'text', code });
      return id;
    });

    // Protect inline code
    const inlineCodes = [];
    html = html.replace(/`([^`\n]+)`/g, (match, code) => {
      const id = `__INLINE_CODE_${inlineCodes.length}__`;
      inlineCodes.push(code);
      return id;
    });

    // Escape basic HTML to avoid XSS in user text (while allowing markdown tags)
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headers
    html = html.replace(/^#### (.*$)/gim, '<h4 class="md-h4">$1</h4>');
    html = html.replace(/^### (.*$)/gim, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="md-h2">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="md-h1">$1</h1>');

    // Horizontal Rule
    html = html.replace(/^\s*---\s*$/gim, '<hr class="md-hr">');

    // Blockquotes & Callouts
    html = html.replace(/^>\s*(?:\*\*(Важно|Внимание|Примечание|Совет):\*\*|\*\*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\*\*)?(.*$)/gim, (m, type1, type2, content) => {
      const type = (type1 || type2 || '').toLowerCase();
      let alertClass = 'callout-note';
      let title = 'Примечание';
      if (type.includes('важно') || type.includes('important')) {
        alertClass = 'callout-important';
        title = 'Важно';
      } else if (type.includes('внимание') || type.includes('warning') || type.includes('caution')) {
        alertClass = 'callout-warning';
        title = 'Внимание';
      } else if (type.includes('совет') || type.includes('tip')) {
        alertClass = 'callout-tip';
        title = 'Совет';
      }
      return `<div class="md-callout ${alertClass}"><div class="callout-title">${title}</div><div class="callout-body">${content.trim()}</div></div>`;
    });

    // Standard blockquotes fallback
    html = html.replace(/^>\s*(.*$)/gim, '<blockquote class="md-blockquote">$1</blockquote>');

    // Bold, Italic, Strikethrough
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');

    // Links [Text](Url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');

    // Tables
    html = html.replace(/((?:\|[^\n]+\|\n?)+)/g, (match) => {
      const lines = match.trim().split('\n').filter(l => l.trim().startsWith('|'));
      if (lines.length < 2) return match;

      let tableHtml = '<div class="table-container"><table class="md-table">';
      let isHeader = true;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Check if separator line
        if (/^\|(?:\s*:?-+:?\s*\|)+$/.test(line)) {
          isHeader = false;
          continue;
        }

        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        const tag = isHeader ? 'th' : 'td';

        tableHtml += '<tr>';
        cells.forEach(cell => {
          tableHtml += `<${tag}>${cell}</${tag}>`;
        });
        tableHtml += '</tr>';
      }

      tableHtml += '</table></div>';
      return tableHtml;
    });

    // Lists (ordered & unordered)
    // Unordered
    html = html.replace(/^\s*[-*+]\s+(.*$)/gim, '<li class="md-li-bullet">$1</li>');
    // Ordered
    html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li class="md-li-num">$2</li>');

    // Wrap adjacent bullet list items in <ul>
    html = html.replace(/((?:<li class="md-li-bullet">.*<\/li>\s*)+)/g, '<ul class="md-ul">$1</ul>');
    // Wrap adjacent numbered list items in <ol>
    html = html.replace(/((?:<li class="md-li-num">.*<\/li>\s*)+)/g, '<ol class="md-ol">$1</ol>');

    // Paragraphs: separate double newlines
    const paragraphs = html.split(/\n\s*\n/);
    html = paragraphs.map(p => {
      p = p.trim();
      if (!p) return '';
      // If it's already an HTML block element, do not wrap in <p>
      if (/^<(h[1-6]|ul|ol|table|div|blockquote|hr|pre)/i.test(p)) {
        return p;
      }
      return `<p class="md-p">${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n\n');

    // Restore inline code
    html = html.replace(/__INLINE_CODE_(\d+)__/g, (match, idx) => {
      const code = inlineCodes[idx] || '';
      return `<code class="md-code-inline">${code}</code>`;
    });

    // Restore code blocks with Copy Button
    html = html.replace(/__CODE_BLOCK_(\d+)__/g, (match, idx) => {
      const item = codeBlocks[idx] || { lang: '', code: '' };
      const escapedCode = item.code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      return `
        <div class="code-block-wrapper">
          <div class="code-header">
            <span class="code-lang">${item.lang || 'code'}</span>
            <button class="btn-copy-code" onclick="Markdown.copyCode(this)" title="Копировать код">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Копировать</span>
            </button>
          </div>
          <pre class="md-pre"><code class="md-code-block language-${item.lang}">${escapedCode}</code></pre>
        </div>
      `;
    });

    return html;
  },

  copyCode(btn) {
    const wrapper = btn.closest('.code-block-wrapper');
    const codeEl = wrapper ? wrapper.querySelector('code') : null;
    if (!codeEl) return;

    const text = codeEl.innerText;
    navigator.clipboard.writeText(text).then(() => {
      const originalText = btn.innerHTML;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> <span style="color:#10b981;">Скопировано!</span>`;
      setTimeout(() => {
        btn.innerHTML = originalText;
      }, 2000);
    });
  }
};
