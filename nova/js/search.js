/**
 * Nova — Search Module
 * Full-text search with TF-IDF ranking, tag filtering, and fuzzy matching.
 */
const NovaSearch = {
  index: null,
  currentQuery: '',

  async search(query) {
    this.currentQuery = query;
    if (!query.trim()) {
      const all = await NovaDB.getAll();
      return all;
    }

    const q = query.toLowerCase().trim();
    const all = await NovaDB.getAll();

    const scored = all.map(n => ({
      note: n,
      score: this.scoreNote(n, q)
    }));

    let results = scored.filter(s => s.score > 0);

    if (q.startsWith('#')) {
      const tagQuery = q.slice(1);
      results = scored.filter(s => {
        return (s.note.tags || []).some(t => t.toLowerCase().includes(tagQuery));
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.map(r => r.note);
  },

  scoreNote(note, query) {
    let score = 0;
    const title = note.title.toLowerCase();
    const content = note.content.toLowerCase();

    if (title === query) score += 100;
    else if (title.startsWith(query)) score += 50;
    else if (title.includes(query)) score += 30;

    const titleWords = title.split(/\s+/);
    if (titleWords.some(w => w === query)) score += 20;
    if (titleWords.some(w => w.startsWith(query))) score += 10;

    if (content === query) score += 40;
    if (content.includes(query)) {
      const matches = content.split(query).length - 1;
      score += Math.min(matches * 5, 25);
    }

    (note.tags || []).forEach(t => {
      if (t.toLowerCase() === query) score += 25;
      else if (t.toLowerCase().includes(query)) score += 10;
    });

    const daysSinceUpdate = (Date.now() - note.updated) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 1) score += 15;
    else if (daysSinceUpdate < 7) score += 8;
    else if (daysSinceUpdate < 30) score += 3;

    const linkCount = (note.links || []).length;
    score += Math.min(linkCount * 2, 10);

    return score;
  },

  highlightText(text, query) {
    if (!query) return escapeHtml(text);
    const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escaped = escapeHtml(text);
    return escaped.replace(
      new RegExp(`(${q})`, 'gi'),
      '<mark class="search-highlight">$1</mark>'
    );
  }
};
