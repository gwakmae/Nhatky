'use strict';

// MainViewModel 이식 — 단어 목록, 정렬, 계층, 하이라이트, 상세 카드, 수동 추가
const ListView = (() => {
  const SortMode = { HIERARCHY: 'hierarchy', NEWEST: 'newest', ALPHA: 'alpha', FREQ: 'freq' };

  let sortMode = SortMode.HIERARCHY;
  let searchText = '';
  const checkedSourceIds = new Set();   // 비어 있으면 전체 보기
  let selectedEntry = null;
  let highlightKeys = null;             // 하이라이트할 문장 키 집합

  const $ = sel => document.querySelector(sel);

  // ── 렌더 진입점 ──
  function render(container) {
    container.innerHTML = `
      <div class="prompt-panel" id="prompt-panel">
        <strong>분석할 베트남어</strong>
        <textarea id="analysis-input" rows="4" placeholder="여기에 베트남어 문장을 넣고, 아래 복사 버튼을 누르세요."></textarea>
        <div class="prompt-buttons">
          <button id="btn-copy-filled" class="primary">📋 문장 포함 복사</button>
          <button id="btn-copy-prompt" class="muted">📄 프롬프트만 복사</button>
        </div>
        <details>
          <summary style="cursor:pointer;font-size:13px;color:#777">프롬프트 보기</summary>
          <textarea id="prompt-preview" rows="10" style="margin-top:6px;font-size:12px">${escapeHtml(PROMPT_TEMPLATE)}</textarea>
        </details>
      </div>
      <div class="list-column">
        <div class="list-toolbar">
          <input id="search-input" class="search" type="search" placeholder="검색 (베트남어/뜻/문장)">
          <button id="btn-source-filter" class="ghost source-btn">출처: 전체 보기 ▾</button>
          <select id="sort-select">
            <option value="hierarchy">계층 관계</option>
            <option value="newest">최근 등록순</option>
            <option value="alpha">알파벳순</option>
            <option value="freq">자주 본 순</option>
          </select>
          <button id="btn-manual-add" class="primary">✏️ 수동 추가</button>
        </div>
        <div class="entry-scroll"><div id="entry-list"></div></div>
      </div>
    `;

    $('#sort-select').value = sortMode;
    $('#sort-select').addEventListener('change', e => { sortMode = e.target.value; refresh(); });
    $('#search-input').addEventListener('input', e => { searchText = e.target.value; refresh(); });
    $('#btn-manual-add').addEventListener('click', openManualModal);
    $('#btn-source-filter').addEventListener('click', openSourceModal);
    $('#btn-copy-filled').addEventListener('click', copyPromptWithSentence);
    $('#btn-copy-prompt').addEventListener('click', copyPromptOnly);

    refresh();
  }

  // ── 필터 + 정렬 + 그리기 ──
  function refresh() {
    const all = Data.state.entries;
    const q = searchText.trim().toLowerCase();

    let filtered = all;
    if (checkedSourceIds.size > 0)
      filtered = filtered.filter(e => e.sourceId != null && checkedSourceIds.has(e.sourceId));
    if (q) {
      filtered = filtered.filter(e =>
        e.vi.toLowerCase().includes(q) ||
        (e.ko || '').toLowerCase().includes(q) ||
        (e.contexts || []).some(c => c.toLowerCase().includes(q)));
    }

    let sorted;
    switch (sortMode) {
      case SortMode.HIERARCHY: sorted = buildHierarchy(filtered); break;
      case SortMode.NEWEST:    sorted = [...filtered].sort((a, b) => b.id - a.id).map(e => ({ entry: e, child: false })); break;
      case SortMode.ALPHA:     sorted = [...filtered].sort((a, b) => a.vi.localeCompare(b.vi, 'vi')).map(e => ({ entry: e, child: false })); break;
      case SortMode.FREQ:      sorted = [...filtered].sort((a, b) => (b.contexts?.length || 0) - (a.contexts?.length || 0)).map(e => ({ entry: e, child: false })); break;
    }

    drawList(sorted);
    App.updateHeader(filtered.length, all.length);
    updateSourceButton();
  }

  // ── 계층 정리: "pha cà phê"가 있고 "pha"도 있으면 자식으로 ──
  function buildHierarchy(list) {
    const parentOf = new Map();

    for (const child of list) {
      const childKey = Parser.normalizeKey(child.vi);
      let best = null;
      for (const parent of list) {
        if (parent.id === child.id) continue;
        const parentKey = Parser.normalizeKey(parent.vi);
        if (!parentKey) continue;
        if (childKey.startsWith(parentKey + ' ')) {
          if (!best || parent.vi.trim().length > best.vi.trim().length) best = parent;
        }
      }
      if (best) parentOf.set(child.id, best.id);
    }

    const result = [];
    const placed = new Set();

    function addWithChildren(node, isChild) {
      if (placed.has(node.id)) return;
      placed.add(node.id);
      result.push({ entry: node, child: isChild });
      const children = list
        .filter(c => parentOf.get(c.id) === node.id)
        .sort((a, b) => a.vi.localeCompare(b.vi, 'vi'));
      for (const c of children) addWithChildren(c, true);
    }

    const roots = list
      .filter(e => !parentOf.has(e.id))
      .sort((a, b) => a.vi.localeCompare(b.vi, 'vi'));
    for (const r of roots) addWithChildren(r, false);

    for (const e of list.filter(x => !placed.has(x.id)).sort((a, b) => a.vi.localeCompare(b.vi, 'vi')))
      result.push({ entry: e, child: false });

    return result;
  }

  // ── 목록 그리기 ──
  function drawList(items) {
    const host = $('#entry-list');
    host.innerHTML = '';

    const frag = document.createDocumentFragment();
    for (const { entry, child } of items) {
      const div = document.createElement('div');
      div.className = 'entry-item' + (child ? ' child' : '');
      div.dataset.id = entry.id;

      if (highlightKeys && (entry.contexts || []).some(c => highlightKeys.has(Parser.normalizeKey(c))))
        div.classList.add('highlighted');

      const vi = document.createElement('span');
      vi.className = 'entry-vi';
      vi.textContent = (child ? '└ ' : '') + entry.vi;

      const ko = document.createElement('span');
      ko.className = 'entry-ko';
      ko.textContent = entry.ko || '';

      div.append(vi, ko);

      div.addEventListener('click', () => openDetail(entry));
      div.addEventListener('mouseenter', () => highlightGroup(entry));
      div.addEventListener('mouseleave', clearHighlights);

      frag.appendChild(div);
    }
    host.appendChild(frag);
  }

  // ── 관계 하이라이트: 같은 원문 문장을 공유하는 단어들 ──
  function highlightGroup(entry) {
    if (!(entry.contexts || []).length) return;
    highlightKeys = new Set(entry.contexts.map(c => Parser.normalizeKey(c)));
    refreshKeepHighlight();
  }
  function clearHighlights() {
    if (!highlightKeys) return;
    highlightKeys = null;
    refreshKeepHighlight();
  }
  function refreshKeepHighlight() {
    document.querySelectorAll('.entry-item').forEach(el => {
      const entry = Data.state.entries.find(e => e.id === +el.dataset.id);
      const on = !!(highlightKeys && entry && (entry.contexts || []).some(c => highlightKeys.has(Parser.normalizeKey(c))));
      el.classList.toggle('highlighted', on);
    });
  }

  // ── 상세 카드 ──
  function openDetail(entry) {
    selectedEntry = entry;
    const source = Data.state.sources.find(s => s.id === entry.sourceId);

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'detail-modal';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="detail-vi">${escapeHtml(entry.vi)}</div>
        <div class="detail-source">출처: ${escapeHtml(source ? source.name : '(수동/미지정)')}</div>
        ${entry.pronNorth ? `<div class="detail-pron">북부&nbsp; ${escapeHtml(entry.pronNorth)}</div>` : ''}
        ${entry.pronSouth ? `<div class="detail-pron">남부&nbsp; ${escapeHtml(entry.pronSouth)}</div>` : ''}
        <div class="detail-ko">${escapeHtml(entry.ko || '')}</div>
        <hr>
        <div class="ctx-head">원문 문장 (${(entry.contexts || []).length})</div>
        <ul class="ctx-list">
          ${(entry.contexts || []).map(c => `<li>${escapeHtml(c)}</li>`).join('')}
        </ul>
        <div class="card-buttons">
          <button class="danger" id="btn-detail-delete">삭제</button>
          <button id="btn-detail-close">닫기</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#btn-detail-close').addEventListener('click', closeDetail);
    modal.addEventListener('click', e => { if (e.target === modal) closeDetail(); });
    modal.querySelector('#btn-detail-delete').addEventListener('click', () => {
      if (!confirm(`'${entry.vi}' 를 삭제할까요?`)) return;
      const i = Data.state.entries.findIndex(e => e.id === entry.id);
      if (i >= 0) Data.state.entries.splice(i, 1);
      Data.markDirty();
      App.setSyncDirty();
      closeDetail();
      refresh();
      App.toast('삭제됨');
    });
  }
  function closeDetail() {
    selectedEntry = null;
    $('#detail-modal')?.remove();
  }

  // ── 수동 추가 모달 ──
  function openManualModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'manual-modal';
    modal.innerHTML = `
      <div class="modal-card">
        <h2 style="color:var(--green)">수동으로 단어 추가</h2>
        <label class="field">베트남어 *<input id="m-vi" autocomplete="off"></label>
        <label class="field">북부 발음 (한글)<input id="m-pron-n" autocomplete="off"></label>
        <label class="field">남부 발음 (북부와 다를 때만)<input id="m-pron-s" autocomplete="off"></label>
        <label class="field">한국어 뜻<input id="m-ko" autocomplete="off"></label>
        <label class="field">원문 문장 (이 단어를 만난 문장)<textarea id="m-ctx" rows="2"></textarea></label>
        <div class="card-buttons">
          <button id="m-cancel">취소</button>
          <button class="primary" id="m-save">저장</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#m-vi').focus();

    modal.querySelector('#m-cancel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#m-save').addEventListener('click', () => {
      const vi = modal.querySelector('#m-vi').value.trim();
      if (!vi) { App.toast('베트남어 원문은 꼭 입력해 주세요.', true); return; }

      const pronN = modal.querySelector('#m-pron-n').value.trim();
      let pronS = modal.querySelector('#m-pron-s').value.trim();
      if (!pronS || pronS === pronN) pronS = null;
      const ctx = modal.querySelector('#m-ctx').value.trim();

      const parsed = [{ vi, pronNorth: pronN, pronSouth: pronS, ko: modal.querySelector('#m-ko').value.trim(), contexts: ctx ? [ctx] : [] }];
      const { added, merged } = Merger.importEntries(parsed, null);

      App.setSyncDirty();
      modal.remove();
      refresh();
      App.toast(added > 0 ? `'${vi}' 등록됨` : merged > 0 ? `'${vi}' 기존 항목에 합쳐짐` : `'${vi}' 이미 동일한 내용 있음`);
    });
  }

  // ── 출처 필터 모달 (체크 여러 개 + 이름 수정) ──
  function openSourceModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'source-modal';

    const countBy = new Map();
    for (const e of Data.state.entries)
      if (e.sourceId != null) countBy.set(e.sourceId, (countBy.get(e.sourceId) || 0) + 1);

    modal.innerHTML = `
      <div class="modal-card">
        <h2 style="color:var(--green)">출처 관리</h2>
        <p style="font-size:13px;color:#777;margin:0">
          체크한 출처의 단어만 모아봅니다. 아무것도 체크하지 않으면 전체가 보입니다.<br>
          이름 칸을 직접 고치면 바로 반영됩니다.
        </p>
        <input id="src-search" type="search" placeholder="출처 이름 검색">
        <div id="src-list" style="max-height:46dvh;overflow-y:auto"></div>
        <div class="card-buttons">
          <button id="src-show-all">전체 보기 (모두 해제)</button>
          <button class="primary" id="src-close">닫기</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    function drawRows(filter = '') {
      const host = modal.querySelector('#src-list');
      host.innerHTML = '';
      const rows = [...Data.state.sources]
        .sort((a, b) => b.id - a.id)
        .filter(s => !filter || s.name.toLowerCase().includes(filter.toLowerCase()));

      for (const s of rows) {
        const row = document.createElement('div');
        row.className = 'source-row';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = checkedSourceIds.has(s.id);
        cb.addEventListener('change', () => {
          cb.checked ? checkedSourceIds.add(s.id) : checkedSourceIds.delete(s.id);
          refresh();
        });

        const name = document.createElement('input');
        name.type = 'text';
        name.value = s.name;
        name.addEventListener('change', () => {
          const v = name.value.trim();
          if (v && v !== s.name) {
            s.name = v;
            Data.markDirty();
            App.setSyncDirty();
            App.toast('출처 이름 저장됨');
            updateSourceButton();
          }
        });

        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = `(${countBy.get(s.id) || 0})`;

        row.append(cb, name, count);
        host.appendChild(row);
      }
      if (!rows.length)
        host.innerHTML = '<p style="color:#999;font-size:13px">출처가 없습니다.</p>';
    }
    drawRows();

    modal.querySelector('#src-search').addEventListener('input', e => drawRows(e.target.value.trim()));
    modal.querySelector('#src-show-all').addEventListener('click', () => {
      checkedSourceIds.clear();
      drawRows(modal.querySelector('#src-search').value.trim());
      refresh();
    });
    modal.querySelector('#src-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  function updateSourceButton() {
    const btn = $('#btn-source-filter');
    if (!btn) return;
    const names = Data.state.sources.filter(s => checkedSourceIds.has(s.id)).map(s => s.name);
    btn.textContent = '출처: ' + (names.length === 0 ? '전체 보기' : names.length === 1 ? names[0] : `${names.length}개 선택됨`) + ' ▾';
  }

  // ── 프롬프트 복사 ──
  async function copyPromptWithSentence() {
    const sentence = $('#analysis-input').value.trim();
    const template = $('#prompt-preview').value;
    const text = sentence
      ? (template.includes(PROMPT_PLACEHOLDER)
          ? template.replace(PROMPT_PLACEHOLDER, sentence)
          : template + '\n\n[베트남어 문장]\n' + sentence)
      : template;
    await copyText(text, '문장 포함 복사됨 ✓');
  }
  async function copyPromptOnly() {
    await copyText($('#prompt-preview').value, '프롬프트 복사됨 ✓');
  }
  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      App.toast(okMsg);
    } catch {
      // 클립보드 API 실패 시 fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      App.toast(okMsg);
    }
  }

  function escapeHtml(s) {
    return (s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { render, refresh, escapeHtml };
})();
