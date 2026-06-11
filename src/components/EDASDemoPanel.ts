import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import * as d3 from 'd3';

// ---- Types ----

interface EdasEvent {
  id: string;
  title: string;
  summary: string;
  date: string;
  region: string;
  segments: Record<string, number | string>;
  bursty: boolean;
  source_file?: string;
}

interface GraphNode {
  name: string;
  category?: number;
  [key: string]: unknown;
}

interface GraphLink {
  source: number;
  target: number;
  value?: string | number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ---- Helpers ----

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function severityLabel(bursty: boolean): { text: string; cls: string } {
  return bursty
    ? { text: '突发 · 高关注度', cls: 'edas-badge-bursty' }
    : { text: '常规事件', cls: 'edas-badge-normal' };
}

// ---- EDAS Analysis Panel ----

export class EDASDemoPanel extends Panel {
  private _hasData = false;
  private _allEvents: EdasEvent[] = [];
  private _tweets: any[] = [];
  private _idx: any = null;
  private _currentKgContainer: string | null = null;
  private _currentChainContainer: string | null = null;
  constructor() {
    super({ id: 'edas-demo', title: 'EDAS 事件分析', showCount: false });
    this.content.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-edas-id]') as HTMLElement | null;
      if (target) {
        const id = target.getAttribute('data-edas-id') || '';
        void this.openDetail(id);
      }
      // Back button
      if ((e.target as HTMLElement).closest('.edas-back-btn')) {
        void this.renderList();
      }
      // KG load buttons
      const kgBtn = (e.target as HTMLElement).closest('[data-kg-file]') as HTMLElement | null;
      if (kgBtn) {
        const file = kgBtn.getAttribute('data-kg-file') || '';
        const containerId = kgBtn.getAttribute('data-kg-container') || '';
        void this.loadAndRenderGraph(file, containerId);
      }
    });
    window.addEventListener('edas:open-detail', async (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail;
        const id = detail?.id;
        if (!id) return;
        if (!this._hasData) {
          await this.loadDataFromExports();
        }
        await this.openOverlay(id);
      } catch {}
    });
    // Listen for overlay close events (dispatched by the overlay's close button)
    window.addEventListener('edas:close-overlay', () => {
      this.closeOverlay();
    });
  }

  // ───── Overlay: full-screen right panel ─────

  private _overlay: HTMLElement | null = null;

  private async loadDataFromExports(): Promise<void> {
    try {
      const idxResp = await fetch('/edas_exports/index.json');
      if (idxResp.ok) {
        this._idx = await idxResp.json();
        if (this._idx?.events) {
          const eventsResp = await fetch('/edas_exports/' + this._idx.events);
          if (eventsResp.ok) {
            const events = await eventsResp.json();
            this._allEvents = (Array.isArray(events) ? events : []).map((e: any) => ({
              id: e.id,
              title: e.title || '',
              summary: e.summary || '',
              date: e.date_dir || '',
              region: e.region || '',
              segments: e.segments || {},
              bursty: !!e.bursty,
              source_file: e.source_file || '',
            }));
          }
        }
        try {
          const tweetsResp = await fetch('/edas_exports/' + (this._idx.tweets_sample || 'tweets_sample.json'));
          if (tweetsResp.ok) this._tweets = await tweetsResp.json();
        } catch {}
        this._hasData = true;
      }
    } catch {}
  }

  private async openOverlay(id: string): Promise<void> {
    this.closeOverlay(); // close any existing overlay
    const rawId = id.replace(/^edas:/, '');
    const event = this._allEvents.find((e) => e.id === rawId);
    if (!event) return;

    // Build the full detail HTML (reuse the same rendering as openDetail)
    const html = this.renderDetailHtml(event);

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'edas-overlay';
    overlay.innerHTML = `
      <div class="edas-overlay-backdrop"></div>
      <div class="edas-overlay-panel">
        <button class="edas-overlay-close" aria-label="Close">×</button>
        <div class="edas-overlay-content">${html}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    this._overlay = overlay;

    // Close on backdrop click or close button
    overlay.querySelector('.edas-overlay-backdrop')!.addEventListener('click', () => this.closeOverlay());
    overlay.querySelector('.edas-overlay-close')!.addEventListener('click', () => this.closeOverlay());
    // Escape key
    this._overlayKeyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.closeOverlay(); };
    document.addEventListener('keydown', this._overlayKeyHandler);

    // Wire KG load buttons inside the overlay
    overlay.querySelectorAll('[data-kg-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const file = btn.getAttribute('data-kg-file') || '';
        const containerId = btn.getAttribute('data-kg-container') || '';
        void this.loadAndRenderGraph(file, containerId);
      });
    });

    // Auto-load the first KG file so the user sees a graph immediately
    const firstKgBtn = overlay.querySelector<HTMLElement>('[data-kg-file]');
    if (firstKgBtn) {
      const file = firstKgBtn.getAttribute('data-kg-file') || '';
      const containerId = firstKgBtn.getAttribute('data-kg-container') || '';
      // Delay slightly to let the overlay animation complete
      setTimeout(() => void this.loadAndRenderGraph(file, containerId), 400);
    }

    // Trigger slide-in
    requestAnimationFrame(() => overlay.classList.add('open'));
  }

  private _overlayKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  private closeOverlay(): void {
    if (this._overlay) {
      this._overlay.classList.remove('open');
      this._overlay.addEventListener('transitionend', () => {
        if (this._overlay?.parentNode) this._overlay.parentNode.removeChild(this._overlay);
        this._overlay = null;
      }, { once: true });
      // Fallback removal
      setTimeout(() => {
        if (this._overlay?.parentNode) {
          this._overlay.parentNode.removeChild(this._overlay);
          this._overlay = null;
        }
      }, 400);
    }
    if (this._overlayKeyHandler) {
      document.removeEventListener('keydown', this._overlayKeyHandler);
      this._overlayKeyHandler = null;
    }
  }

  public async fetchData(): Promise<boolean> {
    this.showLoading();
    try {
      const idxResp = await fetch('/edas_exports/index.json');
      if (!idxResp.ok) throw new Error('index.json not found');
      this._idx = await idxResp.json();
      if (!this._idx?.events) throw new Error('index.json missing events key');
      const eventsResp = await fetch('/edas_exports/' + this._idx.events);
      if (!eventsResp.ok) throw new Error('events file not found');
      const events = await eventsResp.json();
      this._allEvents = (Array.isArray(events) ? events : []).map((e: any) => ({
        id: e.id,
        title: e.title || '',
        summary: e.summary || '',
        date: e.date_dir || '',
        region: e.region || '',
        segments: e.segments || {},
        bursty: !!e.bursty,
        source_file: e.source_file || '',
      }));
      // Load tweets
      try {
        const tweetsResp = await fetch('/edas_exports/' + (this._idx.tweets_sample || 'tweets_sample.json'));
        if (tweetsResp.ok) this._tweets = await tweetsResp.json();
      } catch {}
      await this.renderList();
      this._hasData = true;
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.showError(msg, () => void this.fetchData());
      return false;
    }
  }

  // ───── List View ─────

  private async renderList(): Promise<void> {
    const sorted = [...this._allEvents].sort((a, b) => b.date.localeCompare(a.date));
    const top50 = sorted.slice(0, 80);

    const rows = top50.map((ev) => {
      const sev = severityLabel(ev.bursty);
      const regionLabel = ev.region === 'hongkong' ? '🇭🇰 香港' : ev.region === 'iran' ? '🇮🇷 伊朗' : ev.region;
      const tagSnippets = Object.keys(ev.segments).slice(0, 4).join(', ');
      return `<div class="edas-row" data-edas-id="${escapeHtml(ev.id)}">
        <div class="edas-row-header">
          <span class="edas-region-tag">${escapeHtml(regionLabel)}</span>
          <span class="${sev.cls}">${sev.text}</span>
          <span class="edas-row-date">${escapeHtml(formatDate(ev.date))}</span>
        </div>
        <div class="edas-row-title">${escapeHtml(ev.title || '无标题')}</div>
        <div class="edas-row-summary">${escapeHtml(ev.summary.slice(0, 120))}${ev.summary.length > 120 ? '…' : ''}</div>
        <div class="edas-row-tags">${tagSnippets ? escapeHtml(tagSnippets) : ''}</div>
      </div>`;
    }).join('');

    this.content.innerHTML = `<div class="edas-analysis-host">
      <div class="edas-list-header">
        <span class="edas-list-title">📊 EDAS 事件分析面板</span>
        <span class="edas-list-count">共 ${this._allEvents.length} 个事件</span>
      </div>
      <div class="edas-list-subheader">
        <span>点击事件查看深度分析</span>
      </div>
      <div class="edas-list-rows">${rows}</div>
    </div>`;
  }

  // ───── Enhanced Detail View ─────

  public async openDetail(id: string): Promise<void> {
    if (!id) return;
    this.showLoading();
    try {
      const rawId = id.replace(/^edas:/, '');
      const event = this._allEvents.find((e) => e.id === rawId);
      if (!event) {
        this.content.innerHTML = `<div class="edas-detail"><p>未找到事件: ${escapeHtml(id)}</p></div>`;
        return;
      }
      this.content.innerHTML = this.renderDetailHtml(event);
      this.content.scrollTop = 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.showError(msg, () => void this.openDetail(id));
    }
  }

  /** Shared HTML rendering — used by both inline panel and overlay */
  private renderDetailHtml(event: EdasEvent): string {
    const sev = severityLabel(event.bursty);
    const regionLabel = event.region === 'hongkong' ? '🇭🇰 香港' : event.region === 'iran' ? '🇮🇷 伊朗' : event.region;

    const segItems = Object.entries(event.segments).map(([k, v]) => ({
      word: k, weight: Number(v) || 1,
    })).sort((a, b) => b.weight - a.weight);
    const segMax = Math.max(...segItems.map((i) => i.weight), 1);

    const cloudHtml = segItems.map((i) => {
      const size = 11 + Math.round((i.weight / segMax) * 28);
      const opacity = 0.5 + (i.weight / segMax) * 0.5;
      return `<span class="edas-cloud-word" style="font-size:${size}px;opacity:${opacity};margin:3px 6px;display:inline-block">${escapeHtml(i.word)}</span>`;
    }).join('');

    const topSegs = segItems.slice(0, 12);
    const barChartSvg = this.renderBarChartSvg(topSegs, segMax);

    const eventDatePrefix = event.date.slice(0, 10);
    const relatedTweets = (Array.isArray(this._tweets) ? this._tweets : [])
      .filter((t: any) => t.date && t.date.indexOf(eventDatePrefix) === 0)
      .slice(0, 15);
    const tweetsHtml = relatedTweets.length > 0
      ? relatedTweets.map((t: any) =>
          `<div class="edas-tweet"><div class="edas-tweet-text">${escapeHtml(t.text)}</div><div class="edas-tweet-meta">${escapeHtml(t.created_at || '')} · 👤 ${escapeHtml(String(t.user_id))}</div></div>`
        ).join('')
      : '<p class="edas-muted">暂无相关推文样本</p>';

    const assets = this._idx?.copied_assets || [];
    const assetsHtml = assets.length > 0
      ? assets.map((p: string) => {
          const icon = p.includes('KG') || p.includes('kg') ? '🔗' : p.includes('people') ? '👥' : p.includes('chain') ? '⛓️' : '📄';
          return `<li><span class="edas-asset-icon">${icon}</span> <a href="/edas_exports/${encodeURIComponent(p)}" target="_blank">${escapeHtml(p)}</a></li>`;
        }).join('')
      : '<p>无</p>';

    const sourceLink = event.source_file
      ? `<div class="edas-stat"><span class="edas-stat-label">数据来源</span><span class="edas-stat-value">${escapeHtml(event.source_file)}</span></div>`
      : '';

    const kgContainerId = `edas-kg-${Date.now()}`;
    const chainContainerId = `edas-chain-${Date.now()}`;

    return `<div class="edas-detail">
      <div class="edas-detail-header">
        <div class="edas-detail-title-row">
          <span class="edas-detail-badge ${sev.cls}">${sev.text}</span>
          <span class="edas-region-tag">${escapeHtml(regionLabel)}</span>
        </div>
        <h3 class="edas-detail-title">${escapeHtml(event.title || event.id)}</h3>
        <div class="edas-detail-date">📅 ${escapeHtml(formatDate(event.date))}</div>
      </div>

      <div class="edas-section">
        <div class="edas-section-title">📝 事件摘要</div>
        <p class="edas-summary-text">${escapeHtml(event.summary || '无摘要')}</p>
      </div>

      <div class="edas-stats-row">
        <div class="edas-stat"><span class="edas-stat-label">地区</span><span class="edas-stat-value">${escapeHtml(regionLabel)}</span></div>
        <div class="edas-stat"><span class="edas-stat-label">日期</span><span class="edas-stat-value">${escapeHtml(event.date)}</span></div>
        <div class="edas-stat"><span class="edas-stat-label">关键词数</span><span class="edas-stat-value">${segItems.length}</span></div>
        <div class="edas-stat"><span class="edas-stat-label">突发性</span><span class="edas-stat-value">${event.bursty ? '⚠️ 是' : '—'}</span></div>
        ${sourceLink}
      </div>

      <div class="edas-section">
        <div class="edas-section-title">📊 维度分析 — 关键词权重</div>
        <div class="edas-analysis-grid">
          <div class="edas-analysis-col">
            <div class="edas-subtitle">Top 关键词权重</div>
            ${barChartSvg}
          </div>
          <div class="edas-analysis-col">
            <div class="edas-subtitle">词云</div>
            <div class="edas-cloud">${cloudHtml}</div>
          </div>
        </div>
      </div>

      <div class="edas-section">
        <div class="edas-section-title">🔗 知识图谱 (KG)</div>
        <p class="edas-muted">
          以下知识图谱文件是全局数据集，<b>不随当前事件改变</b>。它们展示的是独立的知识体系（政治人物关系、卫星任务链等），用于辅助理解事件背后的宏观关联网络。
          节点间的连线上标注了关系类型（如 Vicepresident、Previousmission），悬停节点可高亮其相邻关系：
        </p>
        <div class="edas-kg-toolbar" style="flex-direction:column;gap:4px">
          ${assets.filter((a: string) => a.includes('KG') || a.includes('kg') || a.includes('chain')).map((p: string) => {
            const meta = EDASDemoPanel.KG_DESCRIPTIONS[p] || { icon: '📄', label: p, desc: '知识图谱数据文件' };
            return `<button class="edas-kg-card" data-kg-file="${escapeHtml(p)}" data-kg-container="${kgContainerId}">
              <span class="edas-kg-card-icon">${meta.icon}</span>
              <span class="edas-kg-card-info">
                <span class="edas-kg-card-name">${escapeHtml(p)}</span>
                <span class="edas-kg-card-label">${escapeHtml(meta.label)}</span>
                <span class="edas-kg-card-desc">${escapeHtml(meta.desc)}</span>
              </span>
            </button>`;
          }).join('')}
        </div>
        <div id="${kgContainerId}" class="edas-graph-container">
          <div class="edas-graph-placeholder">点击上方文件加载知识图谱</div>
        </div>
      </div>

      <div class="edas-section">
        <div class="edas-section-title">👥 人物关系链</div>
        <p class="edas-muted">
          人物网络数据（GEXF / JSON 格式），同样是全局数据集。节点为人名，连线上的文字标明人物间的关系类型：
        </p>
        <div class="edas-kg-toolbar" style="flex-direction:column;gap:4px">
          ${assets.filter((a: string) => a.includes('people')).map((p: string) => {
            const meta = EDASDemoPanel.KG_DESCRIPTIONS[p] || { icon: '👥', label: p.replace('.gexf',''), desc: '人物关系图谱' };
            return `<button class="edas-kg-card" data-kg-file="${escapeHtml(p)}" data-kg-container="${chainContainerId}">
              <span class="edas-kg-card-icon">${meta.icon}</span>
              <span class="edas-kg-card-info">
                <span class="edas-kg-card-name">${escapeHtml(p)}</span>
                <span class="edas-kg-card-label">${escapeHtml(meta.label)}</span>
                <span class="edas-kg-card-desc">${escapeHtml(meta.desc)}</span>
              </span>
            </button>`;
          }).join('')}
          ${assets.filter((a: string) => /^chain\d/.test(a)).map((p: string) => {
            const meta = EDASDemoPanel.KG_DESCRIPTIONS[p] || { icon: '🏛️', label: '政治关系链', desc: '政治人物权力继承关系' };
            return `<button class="edas-kg-card" data-kg-file="${escapeHtml(p)}" data-kg-container="${chainContainerId}">
              <span class="edas-kg-card-icon">${meta.icon}</span>
              <span class="edas-kg-card-info">
                <span class="edas-kg-card-name">${escapeHtml(p)}</span>
                <span class="edas-kg-card-label">${escapeHtml(meta.label)}</span>
                <span class="edas-kg-card-desc">${escapeHtml(meta.desc)}</span>
              </span>
            </button>`;
          }).join('')}
        </div>
        <div id="${chainContainerId}" class="edas-graph-container">
          <div class="edas-graph-placeholder">点击上方文件加载网络</div>
        </div>
      </div>

      <div class="edas-section">
        <div class="edas-section-title">🐦 相关推文样本</div>
        <div class="edas-tweets">${tweetsHtml}</div>
      </div>

      <div class="edas-section">
        <div class="edas-section-title">📦 KG / 其它数据资产</div>
        <ul class="edas-asset-list">${assetsHtml}</ul>
      </div>

      <div class="edas-section" style="text-align:center;padding:12px 0">
        <a href="/edas_demo_integration.html" target="_blank" class="edas-external-link">🔗 打开完整静态 Demo（ECharts + Sigma 图）</a>
      </div>
    </div>`;
  }

  // ───── KG File Descriptions ─────
  // These files are global knowledge bases, not specific to any event/region.
  private static readonly KG_DESCRIPTIONS: Record<string, { icon: string; label: string; desc: string }> = {
    'chain1.json':     { icon: '🏛️', label: '美国政治权力链', desc: '特朗普至佩洛西等美国政界人物的权力继承与上下级关系（President→Vicepresident→Successor→Deputy→Governor）' },
    'chain2.json':     { icon: '🏛️', label: '美国政治权力链', desc: '与 chain1.json 内容相同，美国政治人物权力继承关系图谱' },
    'chain_kg.json':   { icon: '🛰️', label: 'NOAA 卫星任务链', desc: '1970年代 NOAA/ITOS/TIROS 气象卫星的前序与后续任务时序链（Previousmission→Nextmission）' },
    'chain_kg_1.json': { icon: '🏛️', label: '奥巴马政治关系网', desc: '奥巴马及其政治网络（拜登、克里、格拉斯利等参议院人物）的 President/Vicepresident/Successor 关系' },
    'KG_chain.json':   { icon: '🛰️', label: 'NOAA 卫星任务链', desc: '与 chain_kg.json 内容相同，NOAA/ITOS/TIROS 气象卫星任务时序链' },
  };

  // ───── Inline SVG Bar Chart ─────

  private renderBarChartSvg(items: Array<{ word: string; weight: number }>, maxWeight: number): string {
    const barHeight = 18;
    const gap = 4;
    const labelWidth = 120;
    const chartWidth = 280;
    const totalHeight = items.length * (barHeight + gap);
    const bars = items.map((item, i) => {
      const pct = (item.weight / maxWeight) * 100;
      const y = i * (barHeight + gap);
      const color = `hsl(${260 - (pct / 100) * 60}, 70%, ${50 + (pct / 100) * 20}%)`;
      return `<rect x="${labelWidth}" y="${y}" width="${(pct / 100) * (chartWidth - labelWidth - 40)}" height="${barHeight}" fill="${color}" rx="3" opacity="0.9"/>
        <text x="${labelWidth - 6}" y="${y + barHeight - 4}" text-anchor="end" font-size="10" fill="var(--text-secondary, #aaa)">${escapeHtml(item.word)}</text>
        <text x="${labelWidth + (pct / 100) * (chartWidth - labelWidth - 40) + 4}" y="${y + barHeight - 4}" font-size="9" fill="var(--text-muted, #666)">${item.weight.toFixed(1)}</text>`;
    }).join('');
    return `<svg width="${chartWidth}" height="${totalHeight + 8}" viewBox="0 0 ${chartWidth} ${totalHeight + 8}" class="edas-bar-chart">
      ${bars}
    </svg>`;
  }

  // ───── D3 Force-Directed Graph ─────

  private async loadAndRenderGraph(file: string, containerId: string): Promise<void> {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div class="edas-graph-loading">加载中…</div>';

    try {
      const url = '/edas_exports/' + encodeURIComponent(file);
      const resp = await fetch(url);
      const text = await resp.text();

      let nodes: any[] = [];
      let edges: Array<{ source: string; target: string; value?: string | number }> = [];

      // Parse JSON format (ECharts style: nodes[] + links[])
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        const json = JSON.parse(text);
        if (json.nodes && json.links) {
          const nodeList = json.nodes as GraphNode[];
          const linkList = json.links as GraphLink[];
          nodes = nodeList.map((n, i) => ({ id: String(i), name: n.name, label: n.name }));
          edges = linkList.map((l) => ({
            source: String(l.source),
            target: String(l.target),
            value: l.value,
          }));
        } else if (Array.isArray(json)) {
          // Array format - try to extract
          const idSet = new Set<string>();
          json.forEach((item: any) => {
            if (item.nodes) item.nodes.forEach((n: any) => idSet.add(n.id || n.name || n));
          });
          nodes = Array.from(idSet).map((id) => ({ id, name: id, label: id }));
          edges = [];
        }
      } else if (text.trim().startsWith('<')) {
        // Parse GEXF XML
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'application/xml');
        const nodeEls = xml.querySelectorAll('node');
        nodes = Array.from(nodeEls).map((n, i) => ({
          id: n.getAttribute('id') || String(i),
          name: n.getAttribute('label') || n.getAttribute('id') || String(i),
          label: n.getAttribute('label') || n.getAttribute('id') || String(i),
        }));
        const edgeEls = xml.querySelectorAll('edge');
        edges = Array.from(edgeEls).map((e) => ({
          source: e.getAttribute('source') || '',
          target: e.getAttribute('target') || '',
          value: e.getAttribute('weight') || 1,
        }));
      }

      if (nodes.length === 0) {
        container.innerHTML = '<div class="edas-graph-placeholder">无法解析此文件中的图形数据</div>';
        return;
      }

      // Render D3 force-directed graph
      this.renderForceGraph(container, nodes, edges, file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      container.innerHTML = `<div class="edas-graph-placeholder">加载失败: ${escapeHtml(msg)}</div>`;
    }
  }

  private renderForceGraph(
    container: HTMLElement,
    nodes: Array<{ id: string; name: string; label?: string }>,
    edges: Array<{ source: string; target: string; value?: string | number }>,
    fileName: string,
  ): void {
    container.innerHTML = '';

    // ── 1. Determine canvas size ──
    const n = nodes.length;
    const isLarge = n > 60;
    const width = Math.max(container.clientWidth || 480, 420);
    // For large graphs use a much bigger canvas so nodes have room to spread
    const height = isLarge
      ? Math.min(700, Math.max(480, n * 3))
      : Math.max(360, Math.min(500, n * 6 + 200));

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(cx, cy) * 0.85;

    // ── 2. Set initial positions in a circle so nodes NEVER start clustered ──
    const simNodes = nodes.map((d, i) => ({
      ...d,
      // Evenly distribute around a circle to avoid initial clustering
      x: cx + radius * Math.cos((2 * Math.PI * i) / n),
      y: cy + radius * Math.sin((2 * Math.PI * i) / n),
    }));

    const simEdges = edges.map((e) => ({ ...e }));

    // ── 3. Build SVG ──
    const svg = d3.select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('background', 'transparent');

    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.02, 40])
      .on('zoom', (event) => { g.attr('transform', event.transform); });
    svg.call(zoom);

    // ── 4. Force parameters ──
    // Strong charge so nodes push apart; no center force so they spread
    // naturally. The circular start positions already keep them separated.
    const chargeStrength = n > 200 ? -400 : n > 100 ? -250 : n > 50 ? -150 : -300;
    const linkDist = edges.length > 200 ? 60 : edges.length > 50 ? 80 : 120;
    const alphaDecay = n > 200 ? 0.01 : n > 50 ? 0.02 : 0.03;

    const simulation = d3.forceSimulation(simNodes)
      .alphaDecay(alphaDecay)
      .alpha(0.4)
      .force('link', d3.forceLink(simEdges)
        .id((d: any) => d.id)
        .distance(linkDist))
      .force('charge', d3.forceManyBody().strength(chargeStrength))
      .force('collision', d3.forceCollide().radius(n > 200 ? 5 : n > 50 ? 10 : 18));

    // ── 5. Draw elements ──
    const linkGroup = g.append('g');
    const nodeGroup = g.append('g');

    // ── Color edges by relationship type ──
    const relColors: Record<string, string> = {
      'president': '#ff6688', 'vicepresident': '#ff8888',
      'successor': '#66ccff', 'predecessor': '#66ffaa',
      'governor': '#ffaa44', 'deputy': '#ffcc44', 'leader': '#ff8844',
      'lieutenant': '#88ddff',
      'previousmission': '#88aaff', 'nextmission': '#88ffcc',
    };
    function edgeColor(val: string | number | undefined): string {
      const v = String(val ?? '').toLowerCase().replace(/[\d]/g, '');
      for (const [key, color] of Object.entries(relColors)) {
        if (v.includes(key)) return color;
      }
      return isLarge ? '#7766aa' : '#8866cc';
    }

    const link = linkGroup
      .selectAll('line')
      .data(simEdges)
      .enter()
      .append('line')
      .attr('stroke', (d: any) => edgeColor(d.value))
      .attr('stroke-width', isLarge ? 1.0 : 1.5)
      .attr('stroke-opacity', isLarge ? 0.4 : 0.55);

    // ── Edge labels showing relationship type ──
    const linkText = linkGroup
      .selectAll('text')
      .data(simEdges)
      .enter()
      .append('text')
      .text((d: any) => {
        const v = String(d.value ?? '');
        return v.length > 14 ? v.slice(0, 12) + '…' : v;
      })
      .attr('font-size', isLarge ? 4.5 : 7)
      .attr('fill', (d: any) => edgeColor(d.value))
      .attr('stroke', 'var(--bg)')
      .attr('stroke-width', 1.5)
      .attr('paint-order', 'stroke')
      .attr('text-anchor', 'middle')
      .attr('font-family', 'sans-serif')
      .attr('font-weight', 600)
      .attr('pointer-events', 'none');

    const node = nodeGroup
      .selectAll('g')
      .data(simNodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .call(d3.drag<SVGGElement, any>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }),
      );

    const r = isLarge ? 3.5 : 5;
    node.append('circle')
      .attr('r', r)
      .attr('fill', '#c770ff')
      .attr('stroke', '#ffffff44')
      .attr('stroke-width', 1.2);

    // Labels — hidden on large graphs, shown on hover
    const text = node.append('text')
      .text((d: any) => {
        const label = d.name || d.label || d.id;
        return label.length > 14 ? label.slice(0, 12) + '…' : label;
      })
      .attr('x', isLarge ? 5 : 8)
      .attr('y', 3)
      .attr('font-size', isLarge ? 6.5 : 9)
      .attr('fill', '#ffffff')
      .attr('stroke', '#000000')
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .attr('font-family', 'sans-serif')
      .attr('font-weight', 600)
      .attr('pointer-events', 'none');

    if (isLarge) {
      text.attr('opacity', 0);
    }

    node.append('title')
      .text((d: any) => d.name || d.label || d.id);

    // ── 6. Tick — update link positions AND edge label positions ──
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      linkText
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // ── 7. Interaction ──
    node.on('mouseenter', function (ev: any, d: any) {
      // Highlight this node
      d3.select(this).select('circle').attr('fill', '#ff66ff').attr('r', r * 1.8).attr('stroke', '#ffffff88').attr('stroke-width', 2);
      d3.select(this).select('text').attr('opacity', 1);

      // Find neighbours
      const nbrs = new Set<string>();
      simEdges.forEach((e: any) => {
        const s = typeof e.source === 'object' ? e.source.id : e.source;
        const t = typeof e.target === 'object' ? e.target.id : e.target;
        if (s === d.id) nbrs.add(t);
        if (t === d.id) nbrs.add(s);
      });

      // Dim non-connected edge labels
      linkText.attr('opacity', (ed: any) => {
        const s = typeof ed.source === 'object' ? ed.source.id : ed.source;
        const t = typeof ed.target === 'object' ? ed.target.id : ed.target;
        return (s === d.id || t === d.id) ? 1 : 0.15;
      });

      node.each(function (nd: any) {
        const el = d3.select(this);
        if (nd.id === d.id) return;
        if (nbrs.has(nd.id)) {
          el.select('circle').attr('fill', '#da88ff').attr('r', r * 1.4).attr('stroke', '#ffffff66').attr('stroke-width', 1.5);
          el.select('text').attr('opacity', 1);
        } else if (isLarge) {
          el.attr('opacity', 0.25);
        }
      });
    });

    node.on('mouseleave', function () {
      linkText.attr('opacity', 1);
      node.each(function () {
        const el = d3.select(this);
        el.attr('opacity', 1);
        el.select('circle').attr('fill', '#c770ff').attr('r', r).attr('stroke', '#ffffff44').attr('stroke-width', 1.2);
        if (isLarge) el.select('text').attr('opacity', 0);
      });
    });

    // ── 8. Zoom to fit when simulation ends ──
    simulation.on('end', () => {
      const bbox = (g.node() as SVGGElement)?.getBBox();
      if (!bbox || bbox.width === 0) return;
      const pad = 50;
      const s = Math.min(width / (bbox.width + pad), height / (bbox.height + pad), 2);
      const tx = width / 2 - (bbox.x + bbox.width / 2) * s;
      const ty = height / 2 - (bbox.y + bbox.height / 2) * s;
      g.transition().duration(400).attr('transform', `translate(${tx},${ty}) scale(${s})`);
    });

    // ── 9. Caption ──
    // Count unique relationship types
    const relTypes = new Set(edges.map((e: any) => String(e.value ?? '')).filter(Boolean));
    d3.select(container).append('div')
      .attr('class', 'edas-graph-caption')
      .text(`📁 ${fileName} · ${n} 节点 · ${edges.length} 连接 · ${relTypes.size} 种关系类型${isLarge ? ' · 🖱️ 悬停显示标签' : ''}`);
  }
}
