/**
 * Nova — Graph Visualization Module
 * Physics-based force-directed graph of note connections.
 */
const NovaGraph = {
  nodes: [],
  edges: [],
  animationId: null,
  isRunning: false,

  // Physics state
  positions: new Map(),
  velocities: new Map(),

  async build(notes) {
    this.nodes = [];
    this.edges = [];
    this.positions.clear();
    this.velocities.clear();

    const noteMap = new Map(notes.map(n => [n.id, n]));

    // Build nodes
    notes.forEach(n => {
      this.nodes.push({
        id: n.id,
        title: n.title || 'Untitled',
        linkCount: (n.links || []).length,
        tagCount: (n.tags || []).length,
      });
      // Random initial position
      this.positions.set(n.id, {
        x: (Math.random() - 0.5) * 400,
        y: (Math.random() - 0.5) * 400
      });
      this.velocities.set(n.id, { x: 0, y: 0 });
    });

    // Build edges from links
    notes.forEach(n => {
      (n.links || []).forEach(linkTitle => {
        const target = notes.find(other =>
          other.title.toLowerCase() === linkTitle.toLowerCase() && other.id !== n.id
        );
        if (target) {
          this.edges.push({
            source: n.id,
            target: target.id,
            label: linkTitle
          });
        }
      });
    });

    this.renderStats();
  },

  start(canvas) {
    if (this.animationId) this.stop();
    this.isRunning = true;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    this.animate();
  },

  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  },

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  },

  animate() {
    if (!this.isRunning) return;

    const canvas = this.canvas;
    const ctx = this.ctx;
    const W = canvas.width;
    const H = canvas.height;
    const centerX = W / 2;
    const centerY = H / 2;

    // Physics simulation
    const repulsion = 8000;
    const attraction = 0.005;
    const damping = 0.85;
    const centerForce = 0.01;
    const minDist = 40;

    // Forces
    const forces = new Map();
    this.nodes.forEach(n => {
      forces.set(n.id, { x: 0, y: 0 });
    });

    // Repulsion between all nodes
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i];
        const b = this.nodes[j];
        const pa = this.positions.get(a.id);
        const pb = this.positions.get(b.id);

        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) dist = minDist;

        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        forces.get(a.id).x += fx;
        forces.get(a.id).y += fy;
        forces.get(b.id).x -= fx;
        forces.get(b.id).y -= fy;
      }
    }

    // Attraction along edges
    this.edges.forEach(e => {
      const pa = this.positions.get(e.source);
      const pb = this.positions.get(e.target);
      if (!pa || !pb) return;

      let dx = pb.x - pa.x;
      let dy = pb.y - pa.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) dist = minDist;

      const force = dist * attraction;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      forces.get(e.source).x += fx;
      forces.get(e.source).y += fy;
      forces.get(e.target).x -= fx;
      forces.get(e.target).y -= fy;
    });

    // Center gravity
    this.nodes.forEach(n => {
      const p = this.positions.get(n.id);
      forces.get(n.id).x += (centerX - p.x) * centerForce;
      forces.get(n.id).y += (centerY - p.y) * centerForce;
    });

    // Apply forces
    this.nodes.forEach(n => {
      const v = this.velocities.get(n.id);
      const f = forces.get(n.id);
      v.x = (v.x + f.x) * damping;
      v.y = (v.y + f.y) * damping;
      const p = this.positions.get(n.id);
      p.x += v.x;
      p.y += v.y;
    });

    // Draw
    ctx.clearRect(0, 0, W, H);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // Edges
    ctx.strokeStyle = isDark ? 'rgba(200,164,92,0.15)' : 'rgba(184,146,62,0.2)';
    ctx.lineWidth = 1;
    this.edges.forEach(e => {
      const pa = this.positions.get(e.source);
      const pb = this.positions.get(e.target);
      if (!pa || !pb) return;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    });

    // Nodes
    this.nodes.forEach(n => {
      const p = this.positions.get(n.id);
      const radius = Math.max(6, Math.min(16, 8 + n.linkCount * 2));

      // Glow
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 3);
      gradient.addColorStop(0, isDark ? 'rgba(200,164,92,0.15)' : 'rgba(184,146,62,0.12)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 3, 0, Math.PI * 2);
      ctx.fill();

      // Circle
      ctx.fillStyle = isDark ? '#1a1a26' : '#ffffff';
      ctx.strokeStyle = n.linkCount > 0 ? '#c8a45c' : (isDark ? '#363650' : '#c4c4d6');
      ctx.lineWidth = n.linkCount > 0 ? 2 : 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Label
      const fontSize = Math.max(10, Math.min(13, 11 + n.linkCount * 0.5));
      ctx.font = `${fontSize}px Inter, sans-serif`;
      ctx.fillStyle = isDark ? '#e4e4ed' : '#1a1a2a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Truncate label
      let label = n.title;
      const maxWidth = 120;
      while (ctx.measureText(label).width > maxWidth && label.length > 1) {
        label = label.slice(0, -1);
      }
      if (label !== n.title) label += '…';

      ctx.fillText(label, p.x, p.y + radius + 4);
    });

    // Highlight connections on hover
    if (this.hoveredNode) {
      const p = this.positions.get(this.hoveredNode);
      if (p) {
        ctx.fillStyle = 'rgba(200,164,92,0.08)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 60, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    this.animationId = requestAnimationFrame(() => this.animate());
  },

  renderStats() {
    document.getElementById('graphNodeCount').textContent = `${this.nodes.length} nodes`;
    document.getElementById('graphEdgeCount').textContent = `${this.edges.length} connections`;
  }
};
