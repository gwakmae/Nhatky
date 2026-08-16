'use strict';

// 앱 진입점 — 탭 전환, 헤더, 동기화 배지, 토스트, 최초 로딩
const App = (() => {
  const views = { list: ListView, import: ImportView, settings: SettingsView };
  let currentView = null;

  const $ = sel => document.querySelector(sel);

  function switchView(name) {
    if (!views[name]) return;
    currentView = name;

    document.querySelectorAll('.nav-button').forEach(b =>
      b.classList.toggle('active', b.dataset.view === name));

    const main = $('#main-view');
    main.innerHTML = '';
    const section = document.createElement('section');
    section.className = 'view active';
    section.id = 'view-' + name;
    main.appendChild(section);

    views[name].render(section);
  }

  function updateHeader(shown, total) {
    $('#header-count').textContent =
      shown === total ? `총 ${total.toLocaleString()}개` : `총 ${total.toLocaleString()}개 중 ${shown.toLocaleString()}개`;
  }

  function setSyncDirty() {
    const badge = $('#sync-badge');
    badge.className = 'sync-badge dirty';
    badge.textContent = '● 저장 안 됨';
  }
  function setSyncClean() {
    const badge = $('#sync-badge');
    badge.className = 'sync-badge ok';
    badge.textContent = '✓ 저장됨';
  }
  function setSyncError(msg) {
    const badge = $('#sync-badge');
    badge.className = 'sync-badge error';
    badge.textContent = msg || '오류';
  }

  function toast(msg, isError = false) {
    const box = document.createElement('div');
    box.className = 'toast' + (isError ? ' error' : '');
    box.textContent = msg;
    $('#toast-container').appendChild(box);
    setTimeout(() => box.remove(), 1800);
  }

  async function boot() {
    document.querySelectorAll('.nav-button').forEach(b =>
      b.addEventListener('click', () => switchView(b.dataset.view)));

    // 저장 안 된 채 페이지를 떠나려 하면 경고
    window.addEventListener('beforeunload', e => {
      if (Data.isDirty()) { e.preventDefault(); e.returnValue = ''; }
    });

    switchView('list');

    try {
      await Data.load();
      ListView.refresh();
      setSyncClean();
    } catch (err) {
      // 첫 실행 등으로 파일이 없으면 빈 상태로 시작
      console.warn(err);
      ListView.refresh();
      setSyncError('데이터 없음');
      toast('data/nhatky.json을 찾지 못해 빈 상태로 시작합니다.', true);
    }
  }

  document.addEventListener('DOMContentLoaded', boot);

  return { switchView, updateHeader, setSyncDirty, setSyncClean, setSyncError, toast };
})();
