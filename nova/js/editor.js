/**
 * Nova — Editor Module
 * Handles markdown editing, preview rendering, wikilinks, and stats.
 */
const NovaEditor = {
  currentNoteId: null,
  isDirty: false,
  saveTimer: null,
  mode: 'split', // 'split' | 'source' | 'preview'

  init() {
    const content = document.getElementById('noteContent');
    const title = document.getElementById('noteTitle');
    const preview = document.getElementById('notePreview');

    // Auto-save on input
    content.addEventListener('input', () => {
      this.isDirty = true;
      this.renderPreview();
      this.updateStats();
      this.scheduleSave();
    });

    title.addEventListener('input', () => {
      this.isDirty = true;
      this.scheduleSave();
      // Update note item title in list
      const item = document.querySelector(`.note-item[data-id="${this.currentNoteId}"]`);
      if (item) {
        item.querySelector('.note-item-title').textContent = title.value || 'Untitled';
      }
    });

    // Mode toggle
    document.getElementById('editorModeBtn').addEventListener('click', () => {
      this.cycleMode();
    });

    // Delete
    document.getElementById('deleteNoteBtn').addEventListener('click', () => {
      this.confirmDelete();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.saveImmediate();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
      }
    });
  },

  async openNote(id) {
    const note = await NovaDB.get(id);
    if (!note) return;
    this.currentNoteId = id;
    this.isDirty = false;

    document.getElementById('noteTitle').value = note.title || '';
    document.getElementById('noteContent').value = note.content || '';
    this.renderPreview();
    this.updateStats();

    // Highlight active note in list
    document.querySelectorAll('.note-item').forEach(el => el.classList.remove('active'));
    const item = document.querySelector(`.note-item[data-id="${id}"]`);
    if (item) item.classList.add('active');

    document.getElementById('editorPane').classList.add('open');
  },

  renderPreview() {
    const content = document.getElementById('noteContent').value;
    const preview = document.getElementById('notePreview');

    // Process wikilinks before rendering markdown
    let processed = this.processWikilinks(content);

    // Render markdown
    let html = '';
    try {
      html = marked.parse(processed, { breaks: true, gfm: true });
    } catch (e) {
      html = `<p>${escapeHtml(content)}</p>`;
    }

    // Sanitize
    html = DOMPurify.sanitize(html);

    // Re-link wikilinks in rendered HTML
    html = html.replace(
      /<a href="wikilink:([^"]+)"[^>]*>([^<]+)<\/a>/g,
      (m, target, text) => {
        const exists = NovaApp.notesCache.some(n => n.title.toLowerCase() === target.toLowerCase());
        const cls = exists ? 'wikilink' : 'wikilink missing';
        return `<a class="${cls}" data-wikilink="${escapeAttr(target)}" onclick="NovaEditor.navigateToWiki('${escapeAttr(target)}')">${text}</a>`;
      }
    );

    preview.innerHTML = html;

    // Add click handlers for wikilinks
    preview.querySelectorAll('.wikilink').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateToWiki(el.dataset.wikilink);
      });
    });
  },

  processWikilinks(text) {
    return text.replace(/\[\[([^\]]+)\]\]/g, (match, target) => {
      const trimmed = target.trim();
      const display = trimmed.includes('|') ? trimmed.split('|')[1].trim() : trimmed;
      const linkTarget = trimmed.includes('|') ? trimmed.split('|')[0].trim() : trimmed;
      return `[${display}](wikilink:${linkTarget})`;
    });
  },

  async navigateToWiki(title) {
    // Find existing note by title
    const notes = await NovaDB.getAll();
    const match = notes.find(n => n.title.toLowerCase() === title.toLowerCase());
    if (match) {
      NovaApp.selectNote(match.id);
    } else {
      // Create new note with this title
      const newNote = {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
        title: title,
        content: '',
        tags: [],
        links: [],
        created: Date.now(),
        updated: Date.now()
      };
      await NovaDB.put(newNote);
      NovaApp.loadNotes();
      NovaApp.selectNote(newNote.id);
      NovaUI.toast(`Created new note: ${title}`, 'success');
    }
  },

  updateStats() {
    const content = document.getElementById('noteContent').value;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const chars = content.length;
    const readTime = Math.max(1, Math.ceil(words / 200));

    document.getElementById('wordCount').textContent = `${words} words`;
    document.getElementById('charCount').textContent = `${chars} chars`;
    document.getElementById('readingTime').textContent = `${readTime} min read`;
  },

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveImmediate(), 800);
  },

  async saveImmediate() {
    if (!this.currentNoteId) return;
    const title = document.getElementById('noteTitle').value.trim() || 'Untitled';
    const content = document.getElementById('noteContent').value;

    // Extract tags and links
    const tags = this.extractTags(content);
    const links = this.extractLinks(content);

    const note = {
      id: this.currentNoteId,
      title,
      content,
      tags,
      links,
      updated: Date.now()
    };

    // Get existing note to preserve created date
    const existing = await NovaDB.get(this.currentNoteId);
    if (existing) note.created = existing.created;

    await NovaDB.put(note);
    this.isDirty = false;

    // Update sidebar tags
    NovaApp.updateTags();

    // Update note item
    const item = document.querySelector(`.note-item[data-id="${this.currentNoteId}"]`);
    if (item) {
      item.querySelector('.note-item-preview').textContent = content.slice(0, 100) || 'Empty note';
      this.renderTagsInItem(item, tags);
      item.querySelector('.linked-count').textContent = links.length ? `${links.length} links` : '';
    }
  },

  extractTags(text) {
    const tags = new Set();
    const regex = /(?<=^|\s|[,.])(?:#([\w\u4e00-\u9fff-]+))/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      if (m[1]) tags.add(m[1]);
    }
    return Array.from(tags);
  },

  extractLinks(text) {
    const links = new Set();
    const regex = /\[\[([^\]]+)\]\]/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      const target = m[1].trim().split('|')[0].trim();
      if (target) links.add(target);
    }
    return Array.from(links);
  },

  renderTagsInItem(item, tags) {
    const meta = item.querySelector('.note-item-meta');
    let existingTagContainer = item.querySelector('.item-tags');
    if (!existingTagContainer) {
      existingTagContainer = document.createElement('div');
      existingTagContainer.className = 'item-tags';
      meta.insertBefore(existingTagContainer, meta.firstChild);
    }
    existingTagContainer.innerHTML = tags.map(t => `<span class="item-tag">#${t}</span>`).join('');
  },

  cycleMode() {
    const modes = ['split', 'source', 'preview'];
    const currentIdx = modes.indexOf(this.mode);
    this.mode = modes[(currentIdx + 1) % modes.length];

    const editorMode = document.getElementById('editorMode');
    editorMode.className = 'editor-mode';

    if (this.mode === 'split') {
      editorMode.classList.add('split');
      document.getElementById('editorModeBtn').textContent = '👁';
    } else if (this.mode === 'source') {
      editorMode.classList.add('source-only');
      document.getElementById('editorModeBtn').textContent = '✏';
    } else {
      editorMode.classList.add('preview-only');
      document.getElementById('editorModeBtn').textContent = '📖';
    }
  },

  async confirmDelete() {
    if (!this.currentNoteId) return;

    const note = await NovaDB.get(this.currentNoteId);
    const title = note ? note.title : 'this note';

    NovaUI.showModal(
      `Delete "${title}"?`,
      'This cannot be undone. All content and links will be permanently removed.',
      [
        { text: 'Cancel', class: 'btn-secondary' },
        { text: 'Delete', class: 'btn-danger', action: async () => {
          await NovaDB.remove(this.currentNoteId);
          NovaApp.deleteNoteFromList(this.currentNoteId);
          this.clearEditor();
          NovaApp.loadNotes();
          NovaUI.toast(`Deleted "${title}"`, '');
        }}
      ]
    );
  },

  clearEditor() {
    this.currentNoteId = null;
    this.isDirty = false;
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteContent').value = '';
    document.getElementById('notePreview').innerHTML = '';
    document.getElementById('wordCount').textContent = '0 words';
    document.getElementById('charCount').textContent = '0 chars';
    document.getElementById('readingTime').textContent = '0 min read';
    document.getElementById('editorPane').classList.remove('open');
  }
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
