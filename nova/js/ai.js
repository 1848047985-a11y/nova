/**
 * Nova — AI Features Module
 * All intelligence runs locally in-browser. No API calls, no privacy leaks.
 */
const NovaAI = {

  summarize(content, maxSentences = 3) {
    if (!content.trim()) return '';
    // Extract the most meaningful sentences using a simple scoring approach
    const sentences = content
      .replace(/\n+/g, '. ')
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 20);

    if (sentences.length === 0) return '';
    if (sentences.length <= maxSentences) return sentences.join('. ') + '.';

    // Score sentences by relevance (keyword density, position)
    const words = content.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const wordFreq = {};
    words.forEach(w => { wordFreq[w] = (wordFreq[w] || 0) + 1; });

    const scored = sentences.map((s, i) => {
      const sWords = s.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const freqScore = sWords.reduce((acc, w) => acc + (wordFreq[w] || 0), 0) / Math.max(sWords.length, 1);
      const posScore = 1 - (i / sentences.length); // Prefer earlier sentences
      return { sentence: s, score: freqScore * 0.6 + posScore * 0.4 };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxSentences)
      .sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence))
      .map(s => s.sentence)
      .join('. ') + '.';
  },

  extractKeywords(content, maxKeywords = 5) {
    if (!content.trim()) return [];
    const words = content.toLowerCase().split(/\s+/)
      .map(w => w.replace(/[^a-z\u4e00-\u9fff]/g, ''))
      .filter(w => w.length > 2);

    const freq = {};
    words.forEach(w => {
      freq[w] = (freq[w] || 0) + 1;
    });

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxKeywords)
      .map(([word]) => word);
  },

  getReadingLevel(content) {
    if (!content.trim()) return 'easy';
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);

    if (sentences.length === 0) return 'easy';

    const avgWordsPerSentence = words.length / sentences.length;
    const longWords = words.filter(w => w.length > 6).length;
    const longWordRatio = longWords / words.length;

    if (avgWordsPerSentence > 20 && longWordRatio > 0.3) return 'advanced';
    if (avgWordsPerSentence > 14 || longWordRatio > 0.2) return 'moderate';
    return 'easy';
  },

  async findRelatedNotes(currentNoteId, notes) {
    const current = notes.find(n => n.id === currentNoteId);
    if (!current) return [];

    const others = notes.filter(n => n.id !== currentNoteId);
    const currentTags = new Set(current.tags || []);
    const currentLinks = new Set(current.links || []);
    const currentWords = new Set(
      (current.content || '').toLowerCase().split(/\s+/).filter(w => w.length > 3)
    );

    const scored = others.map(n => {
      let score = 0;

      // Shared tags
      const sharedTags = (n.tags || []).filter(t => currentTags.has(t));
      score += sharedTags.length * 15;

      // Shared links
      const sharedLinks = (n.links || []).filter(l => currentLinks.has(l));
      score += sharedLinks.length * 10;

      // Bidirectional linking
      if (n.links && n.links.some(l => l.toLowerCase() === current.title.toLowerCase())) {
        score += 20;
      }

      // Content similarity (simple word overlap)
      const nWords = new Set(
        (n.content || '').toLowerCase().split(/\s+/).filter(w => w.length > 3)
      );
      let overlap = 0;
      nWords.forEach(w => { if (currentWords.has(w)) overlap++; });
      score += Math.min(overlap, 20);

      return { note: n, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => s.note);
  },

  analyzeTone(content) {
    if (!content.trim()) return 'neutral';
    const positive = ['great', 'good', 'excellent', 'amazing', 'wonderful', 'love', 'beautiful',
      'fantastic', 'brilliant', 'happy', 'joy', 'exciting', 'inspiring'];
    const negative = ['bad', 'terrible', 'awful', 'hate', 'horrible', 'sad', 'angry',
      'disappointing', 'frustrating', 'ugly', 'worst', 'painful', 'depressing'];

    const words = content.toLowerCase().split(/\s+/);
    let posCount = 0, negCount = 0;
    words.forEach(w => {
      if (positive.includes(w)) posCount++;
      if (negative.includes(w)) negCount++;
    });

    if (posCount > negCount) return 'positive';
    if (negCount > posCount) return 'concerned';
    return 'neutral';
  }
};
