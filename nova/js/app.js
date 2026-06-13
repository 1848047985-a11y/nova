/**
 * Nova â€?Main Application Controller
 * Wires all modules together and manages the app lifecycle.
 */
const NovaApp = {
  notesCache: [],
  currentView: 'notes',
  isGraphViewActive: false,
  hasSeenOnboarding: false,

  async init() {
    await this.loadNotes();
    NovaEditor.init();

    // First launch onboarding
    const launched = localStorage.getItem('nova-launched');
    if (!launched) {
      localStorage.setItem('nova-launched', 'true');
      this.createWelcomeNotes();
    }

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        this.switchView(item.dataset.view);
      });
    });

    document.getElementById('newNoteBtn').addEventListener('click', () => this.createNote());
    document.getElementById('emptyNewNoteBtn').addEventListener('click', () => this.createNote());

    const searchInput = document.getElementById('searchInput');
    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => this.performSearch(searchInput.value), 200);
    });

    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
    document.getElementById('exportBtn').addEventListener('click', () => this.handleExport());

    window.addEventListener('resize', () => {
      if (this.isGraphViewActive) NovaGraph.resize();
    });

    document.getElementById('editorPane').addEventListener('click', (e) => {
      if (e.target === e.currentTarget && window.innerWidth <= 900) {
        e.currentTarget.classList.remove('open');
      }
    });

    const savedTheme = localStorage.getItem('nova-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('themeToggle').textContent = savedTheme === 'dark' ? 'â˜€ï¸? : 'ðŸŒ™';

    this.switchView('notes');
  },

  
  async createWelcomeNotes() {
    const now = Date.now();
    const notes = [
      {
        id: crypto.randomUUID ? crypto.randomUUID() : 'welcome-1',
        title: 'Welcome to Nova',
        content: `# Welcome to Nova

Nova is your local-first knowledge studio. Everything runs in your browser with your data on your machine.

## Get Started

### 1. Create notes with [[links]]
Type [[ anywhere to create a bidirectional link to another note.

### 2. Use #tags to organize
Add tags like #ideas or #projects to group related notes.

### 3. Explore the Graph
Click the Graph tab to see a live visualization of your connected notes.

### 4. Let AI help
Local AI can summarize notes, extract keywords, and suggest related content without sending data anywhere.

Start writing and watch your knowledge grow.`,
        tags: ['guide', 'getting-started'],
        links: [],
        created: now - 3000,
        updated: now - 3000
      },
      {
        id: crypto.randomUUID ? crypto.randomUUID() : 'welcome-2',
        title: 'Understanding Bidirectional Links',
        content: `# Understanding Bidirectional Links

The wikilink is the heart of Novas knowledge graph.

## How it works

When you write [[Welcome to Nova]], Nova creates a link to that note. If that note exists, it links back automatically creating a bidirectional connection.

## Why it matters

Bidirectional links let your knowledge grow organically. Just write, link, and let the graph reveal patterns.

Type [[Welcome to Nova]] in any note to connect to the welcome guide.`,
        tags: ['guide', 'links'],
        links: ['Welcome to Nova'],
        created: now - 2000,
        updated: now - 2000
      },
      {
        id: crypto.randomUUID ? crypto.randomUUID() : 'welcome-3',
        title: 'Nova AI Features',
        content: `# Nova AI Features

Built-in local AI engine. No API keys, no data leaving your computer.

## Features
- Summarization for quick digestion
- Keyword extraction for easy tagging
- Related notes discovery
- Tone analysis
- Reading level estimation

All processing happens locally in your browser.`,
        tags: ['guide', 'ai', 'privacy'],
        links: ['Welcome to Nova'],
        created: now - 1000,
        updated: now - 1000
      }
    ];

    for (const note of notes) {
      await NovaDB.put(note);
    }

    await this.loadNotes();
    NovaUI.toast('Welcome! Created 3 guide notes to get you started.', 'success');
  },
async loadNotes(filteredNotes) {
    let notes = filteredNotes || await NovaDB.getAll();
    this.notesCache = notes;

    const list = document.getElementById('notesList');
    const emptyState = document.getElementById('emptyState');
    list.querySelectorAll('.note-item').forEach(el => el.remove());

    if (notes.length === 0) {
      emptyState.classList.remove('hidden');
      document.getElementById('noteCount').textContent = '0 notes';
      return;
    }

    emptyState.classList.add('hidden');
    document.getElementById('noteCount').textContent = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;

    const fragment = document.createDocumentFragment();
    notes.forEach(note => {
      const item = document.createElement('div');
      item.className = 'note-item';
      item.dataset.id = note.id;
      if (note.id === NovaEditor.currentNoteId) item.classList.add('active');

      const preview = (note.content || '').slice(0, 120).replace(/\n/g, ' ');
      item.innerHTML = `
        <div class="note-item-title">${escapeHtml(note.title || 'Untitled')}</div>
        <div class="note-item-preview">${escapeHtml(preview) || 'Empty note'}</div>
        <div class="note-item-meta">
          <div class="item-tags">${(note.tags || []).map(t => `<span class="item-tag">#${escapeHtml(t)}</span>`).join('')}</div>
          <span class="linked-count">${(note.links || []).length ? `${note.links.length} links` : ''}</span>
        </div>
      `;
      item.addEventListener('click', () => this.selectNote(note.id));
      fragment.appendChild(item);
    });

    list.appendChild(fragment);
    this.updateTags();
    await NovaGraph.build(notes);
  },

  async selectNote(id) {
    if (id === NovaEditor.currentNoteId) return;
    if (NovaEditor.isDirty) await NovaEditor.saveImmediate();
    await NovaEditor.openNote(id);

    const related = await NovaAI.findRelatedNotes(id, this.notesCache);
    if (related.length > 0) {
      const footer = document.querySelector('.editor-footer-bar');
      const existing = footer.querySelector('.related-notes');
      if (existing) existing.remove();
      const el = document.createElement('span');
      el.className = 'related-notes';
      el.style.cssText = 'font-size:11px;color:var(--text-tertiary)';
      el.innerHTML = 'ðŸ”— ' + related.map(r =>
        `<a href="#" onclick="NovaApp.selectNote('${r.id}');return false" style="color:var(--accent)">${escapeHtml(r.title)}</a>`
      ).join(', ');
      footer.appendChild(el);
    }
  },

  async createNote() {
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const title = await new Promise(resolve => {
      NovaUI.showModal('New Note', 'Enter a title for your new note:', [
        { text: 'Cancel', class: 'btn-secondary', action: () => resolve(null) },
        { text: 'Create', class: 'btn-primary', action: () => {
          const input = document.getElementById('modalBody').querySelector('input');
          resolve(input ? input.value : '');
        }}
      ], true);
    });
    if (title === null) return;

    const note = {
      id, title: title || 'Untitled', content: '', tags: [], links: [],
      created: Date.now(), updated: Date.now()
    };
    await NovaDB.put(note);
    this.switchView('notes');
    await this.loadNotes();
    await this.selectNote(id);
    const item = document.querySelector(`.note-item[data-id="${id}"]`);
    if (item) item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    NovaUI.toast('Note created', 'success');
  },

  deleteNoteFromList(id) {
    const item = document.querySelector(`.note-item[data-id="${id}"]`);
    if (item) item.remove();
    this.notesCache = this.notesCache.filter(n => n.id !== id);
    document.getElementById('noteCount').textContent = `${this.notesCache.length} note${this.notesCache.length !== 1 ? 's' : ''}`;
    NovaGraph.build(this.notesCache);
    this.updateTags();
  },

  switchView(view) {
    this.currentView = view;
    document.getElementById('notesList').classList.toggle('hidden', view !== 'notes');
    document.getElementById('tagsView').classList.toggle('hidden', view !== 'tags');
    document.getElementById('graphView').classList.toggle('hidden', view !== 'graph');
    document.getElementById('searchInput').placeholder = view === 'tags' ? 'Filter tags...' : 'Search notes...';

    if (view === 'graph') {
      this.isGraphViewActive = true;
      const canvas = document.getElementById('graphCanvas');
      NovaGraph.build(this.notesCache);
      NovaGraph.start(canvas);
    } else {
      this.isGraphViewActive = false;
      NovaGraph.stop();
    }
    if (view === 'tags') this.renderTagsView();
  },

  updateTags() {
    const el = document.getElementById('sidebarTagList');
    const tagCounts = {};
    this.notesCache.forEach(n => (n.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const names = Object.keys(tagCounts).sort();
    if (names.length === 0) {
      el.innerHTML = '<span style="font-size:11px;color:var(--text-tertiary)">No tags yet</span>';
      return;
    }
    el.innerHTML = names.map(t =>
      `<span class="tag-chip" onclick="NovaApp.filterByTag('${escapeAttr(t)}')">#${escapeHtml(t)} <span class="tag-count">${tagCounts[t]}</span></span>`
    ).join('');
  },

  renderTagsView() {
    const tagCounts = {};
    this.notesCache.forEach(n => (n.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const cloud = document.getElementById('tagsCloud');
    const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    if (tags.length === 0) {
      cloud.innerHTML = '<div class="empty-state"><p>No tags yet. Use #tags in your notes.</p></div>';
      return;
    }
    const maxCount = Math.max(...tags.map(t => t[1]));
    cloud.innerHTML = tags.map(([tag, count]) => {
      const size = 0.8 + (count / maxCount) * 0.8;
      return `<span class="tag-cloud-item" style="font-size:${size}rem" onclick="NovaApp.filterByTag('${escapeAttr(tag)}')">#${escapeHtml(tag)} (${count})</span>`;
    }).join('');
  },

  filterByTag(tag) {
    this.switchView('notes');
    document.getElementById('searchInput').value = `#${tag}`;
    this.performSearch(`#${tag}`);
  },

  async performSearch(query) {
    const results = await NovaSearch.search(query);
    await this.loadNotes(results);
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('nova-theme', next);
    document.getElementById('themeToggle').textContent = next === 'dark' ? 'â˜€ï¸? : 'ðŸŒ™';
  },

  async handleExport() {
    const notes = await NovaDB.exportAll();
    const data = JSON.stringify(notes, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nova-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    NovaUI.toast(`Exported ${notes.length} notes`, 'success');
  }
};

const NovaUI = {
  toast(message, type) {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast';
    if (type) el.classList.add(type);
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 200);
    }, 2500);
  },

  showModal(title, body, buttons, withInput) {
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');
    const modalFooter = document.getElementById('modalFooter');

    modalBody.innerHTML = `<h3 style="margin-bottom:12px;color:var(--text-primary)">${escapeHtml(title)}</h3><p>${body}</p>`;
    if (withInput) {
      modalBody.innerHTML += `<input type="text" id="modalInput" placeholder="Note title..." style="width:100%;margin-top:12px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-tertiary);color:var(--text-primary);font-size:14px;outline:none" autofocus>`;
      setTimeout(() => {
        const input = document.getElementById('modalInput');
        if (input) {
          input.focus();
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              const btn = modalFooter.querySelector('.btn-primary');
              if (btn) btn.click();
            }
          });
        }
      }, 100);
    }

    modalFooter.innerHTML = buttons.map(b =>
      `<button class="${b.class}" data-action="${escapeAttr(b.text)}">${escapeHtml(b.text)}</button>`
    ).join('');
    modalFooter.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const b = buttons.find(bb => bb.text === btn.dataset.action);
        if (b && b.action) b.action();
        NovaUI.closeModal();
      });
    });
    modal.classList.remove('hidden');
  },

  closeModal() {
    document.getElementById('modal').classList.add('hidden');
  }
};

document.addEventListener('DOMContentLoaded', () => { NovaApp.init(); });

window.NovaUI = NovaUI;
window.NovaApp = NovaApp;
window.NovaEditor = NovaEditor;
window.NovaAI = NovaAI;
window.NovaSearch = NovaSearch;

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
