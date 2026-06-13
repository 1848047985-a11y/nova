/**
 * Nova — IndexedDB Storage Layer
 * Handles all persistence for notes, tags, and links.
 */
const NovaDB = {
  DB_NAME: 'nova_knowledge',
  DB_VERSION: 1,
  STORE: 'notes',

  async _open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE)) {
          const store = db.createObjectStore(this.STORE, { keyPath: 'id' });
          store.createIndex('updated', 'updated', { unique: false });
          store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
          store.createIndex('title', 'title', { unique: false });
        }
      };
    });
  },

  async getAll() {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readonly');
      const store = tx.objectStore(this.STORE);
      const req = store.getAll();
      req.onerror = () => { db.close(); reject(req.error); };
      req.onsuccess = () => {
        db.close();
        resolve(req.result.sort((a, b) => b.updated - a.updated));
      };
    });
  },

  async get(id) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readonly');
      const req = tx.objectStore(this.STORE).get(id);
      req.onerror = () => { db.close(); reject(req.error); };
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
    });
  },

  async put(note) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      const store = tx.objectStore(this.STORE);
      note.updated = Date.now();
      const req = store.put(note);
      req.onerror = () => { db.close(); reject(req.error); };
      req.onsuccess = () => { db.close(); resolve(req.result); };
    });
  },

  async remove(id) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      const req = tx.objectStore(this.STORE).delete(id);
      req.onerror = () => { db.close(); reject(req.error); };
      req.onsuccess = () => { db.close(); resolve(); };
    });
  },

  async search(query) {
    const all = await this.getAll();
    const q = query.toLowerCase();
    return all.filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q)
    );
  },

  async getByTag(tag) {
    const all = await this.getAll();
    return all.filter(n => n.tags && n.tags.includes(tag));
  },

  async getStats() {
    const all = await this.getAll();
    const tagCounts = {};
    let linkCount = 0;
    all.forEach(n => {
      (n.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
      (n.links || []).forEach(l => { linkCount++; });
    });
    return { total: all.length, tagCounts, linkCount };
  },

  async exportAll() {
    return await this.getAll();
  },

  async importAll(notes) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      const store = tx.objectStore(this.STORE);
      let done = 0;
      notes.forEach(n => {
        const req = store.put(n);
        req.onsuccess = () => { done++; if (done === notes.length) { db.close(); resolve(); } };
        req.onerror = () => { db.close(); reject(req.error); };
      });
      if (notes.length === 0) { db.close(); resolve(); }
    });
  }
};
