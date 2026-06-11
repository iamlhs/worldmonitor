import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { extractLocations, parseFileContent, classifyEventType, plotNewsToMap, clearNewsFromMap } from '@/services/news-plotter';

export class NewsPlotPanel extends Panel {
  private _plotted = false;

  constructor() {
    super({ id: 'news-plot', title: '📰 新闻点位绘制', showCount: false });

    this.renderInputForm();
  }

  public async fetchData(): Promise<boolean> {
    this.renderInputForm();
    return true;
  }

  private renderInputForm(): void {
    this.content.innerHTML = `
      <div class="newsplot-host">
        <div class="newsplot-header">
          <div class="newsplot-title">📰 新闻点位绘制</div>
          <div class="newsplot-desc">输入新闻文本或上传文件，自动提取地点并在地图上标记</div>
        </div>
        <div class="newsplot-section">
          <label class="newsplot-label">📝 粘贴新闻文本</label>
          <textarea class="newsplot-textarea" id="np-text" rows="6" placeholder="例如：&#10;Protests erupted in Kyiv today...&#10;Heavy fighting reported in Bakhmut...&#10;俄罗斯军队在莫斯科附近集结..."></textarea>
        </div>
        <div class="newsplot-section">
          <label class="newsplot-label">📁 或上传文件 (.txt / .json / .jsonl)</label>
          <input type="file" class="newsplot-file" id="np-file" accept=".txt,.json,.jsonl">
        </div>
        <div class="newsplot-actions">
          <button class="newsplot-btn newsplot-btn-primary" id="np-plot">📍 绘制到地图</button>
          <button class="newsplot-btn newsplot-btn-secondary" id="np-clear">🗑️ 清除标记</button>
        </div>
        <div class="newsplot-result" id="np-result"></div>
        <div class="newsplot-section">
          <div class="newsplot-label">📋 示例文本（点击使用）</div>
          <div class="newsplot-samples" id="np-samples">
            <span class="newsplot-sample" data-text="Massive protests in Tehran and Isfahan. Police clash with demonstrators in Shiraz.">🇮🇷 伊朗抗议</span>
            <span class="newsplot-sample" data-text="Heavy fighting reported in Bakhmut and Avdiivka. Russian troops advance near Kherson.">🇺🇦 乌克兰战况</span>
            <span class="newsplot-sample" data-text="Hong Kong protesters march in Kowloon and Mong Kok. Police deploy tear gas in Yuen Long.">🇭🇰 香港抗议</span>
            <span class="newsplot-sample" data-text="Earthquake strikes near Tokyo. Tsunami warning issued for coastal areas.">🇯🇵 自然灾害</span>
          </div>
        </div>
      </div>`;

    // Wire up buttons
    this.content.querySelector('#np-plot')?.addEventListener('click', () => void this.handlePlot());
    this.content.querySelector('#np-clear')?.addEventListener('click', () => this.handleClear());
    this.content.querySelector('#np-file')?.addEventListener('change', (e) => this.handleFileUpload(e));

    // Wire up sample clicks
    this.content.querySelectorAll('.newsplot-sample').forEach(el => {
      el.addEventListener('click', () => {
        const textarea = this.content.querySelector('#np-text') as HTMLTextAreaElement;
        if (textarea) {
          textarea.value = el.getAttribute('data-text') || '';
          // Trigger input event
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });
  }

  private async handlePlot(): Promise<void> {
    const textarea = this.content.querySelector('#np-text') as HTMLTextAreaElement;
    const text = textarea?.value?.trim() || '';

    if (!text) {
      this.showResult('请先输入新闻文本或上传文件', 'warn');
      return;
    }

    const resultEl = this.content.querySelector('#np-result');
    if (!resultEl) return;

    // Parse (in case file content was loaded)
    const items = parseFileContent(text, 'input.txt');
    const allText = items.join('\n');

    const markers = extractLocations(allText);

    if (markers.length === 0) {
      this.showResult('未在文本中识别到已知地点。请检查文本是否包含城市/地区名称。', 'warn');
      return;
    }

    // Classify overall event type from text
    const eventType = classifyEventType(allText);

    // Plot to map
    plotNewsToMap(markers);
    this._plotted = true;

    // Show result
    const typeLabel = this.eventTypeLabel(eventType);
    const markerRows = markers.map(m =>
      `<div class="newsplot-marker-row">
        <span class="newsplot-marker-dot"></span>
        <span><b>${escapeHtml(m.title)}</b></span>
        <span class="newsplot-marker-coords">${m.lat.toFixed(2)}°, ${m.lon.toFixed(2)}°</span>
      </div>`
    ).join('');

    this.showResult(`
      <div class="newsplot-success">
        <div class="newsplot-success-header">
          <span>✅ 已绘制 <b>${markers.length}</b> 个地点到地图</span>
          <span class="newsplot-type-badge">${typeLabel}</span>
        </div>
        <div class="newsplot-marker-list">${markerRows}</div>
      </div>
    `, 'ok');
  }

  private handleClear(): void {
    clearNewsFromMap();
    this._plotted = false;
    this.showResult('已清除地图上的新闻标记', 'info');
  }

  private handleFileUpload(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const textarea = this.content.querySelector('#np-text') as HTMLTextAreaElement;
      if (textarea) {
        textarea.value = content;
        this.showResult(`已加载文件: ${escapeHtml(file.name)} (${(content.length / 1024).toFixed(1)} KB)`, 'info');
      }
    };
    reader.readAsText(file);
  }

  private showResult(msg: string, type: 'ok' | 'warn' | 'info'): void {
    const el = this.content.querySelector('#np-result');
    if (!el) return;
    const cls = type === 'warn' ? 'newsplot-result-warn'
      : type === 'ok' ? 'newsplot-result-ok'
      : 'newsplot-result-info';
    el.innerHTML = `<div class="${cls}">${msg}</div>`;
  }

  private eventTypeLabel(type: string): string {
    const map: Record<string, string> = {
      riot: '🔥 骚乱/冲突', strike: '✊ 罢工',
      demonstration: '📢 示威', disaster: '🌊 自然灾害',
      conflict: '⚔️ 军事冲突', protest: '📢 抗议',
    };
    return map[type] || '📰 新闻事件';
  }
}
