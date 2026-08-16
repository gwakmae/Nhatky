'use strict';

// ImportWindow 이식 — AI 결과 붙여넣기 + 새 출처/기존 출처 선택
const ImportView = (() => {
  const $ = sel => document.querySelector(sel);

  function render(container) {
    container.innerHTML = `
      <div class="form-view">
        <h2>AI 결과 붙여넣기 (한 번에 등록)</h2>
        <p style="font-size:13px;color:#777;margin:0">
          AI가 출력한 전체 결과를 그대로 붙여넣으세요. <code>@@APP-DATA@@</code> 블록을 찾아 항목들을 한 번에 등록합니다.
        </p>

        <div class="source-choice">
          <strong>어느 출처에 넣을까요?</strong>
          <div class="row">
            <input type="radio" name="src-choice" id="src-new" value="new">
            <label for="src-new">새 출처 만들기</label>
            <input type="text" id="src-new-name" placeholder="예: 반쎄오 자기소개 영상, 1강 인사" disabled>
          </div>
          <div class="row">
            <input type="radio" name="src-choice" id="src-existing" value="existing">
            <label for="src-existing">기존 출처에 추가</label>
            <select id="src-existing-select" disabled></select>
          </div>
        </div>

        <textarea id="import-text" rows="12" placeholder="여기에 AI 출력을 통째로 붙여넣기"></textarea>

        <div class="form-actions">
          <button id="btn-do-import" class="accent">📥 등록하기</button>
        </div>

        <div id="import-result" class="result-box" style="display:none"></div>
      </div>
    `;

    const newRadio = $('#src-new');
    const existRadio = $('#src-existing');
    const newName = $('#src-new-name');
    const existSelect = $('#src-existing-select');

    // 기존 출처 채우기
    const sources = [...Data.state.sources].sort((a, b) => b.id - a.id);
    existSelect.innerHTML = sources.map(s => `<option value="${s.id}">${ListView.escapeHtml(s.name)}</option>`).join('');

    if (sources.length > 0) {
      existRadio.checked = true;    // 최근 출처에 계속 추가하는 경우가 많으므로
    } else {
      newRadio.checked = true;
      existRadio.disabled = true;
      existSelect.disabled = true;
    }

    function updateState() {
      const isNew = newRadio.checked;
      newName.disabled = !isNew;
      existSelect.disabled = isNew || !sources.length;
    }
    newRadio.addEventListener('change', updateState);
    existRadio.addEventListener('change', updateState);
    updateState();

    $('#btn-do-import').addEventListener('click', doImport);
  }

  function showResult(msg, isError = false) {
    const box = $('#import-result');
    box.style.display = 'block';
    box.style.borderColor = isError ? 'var(--danger)' : 'var(--line)';
    box.textContent = msg;
  }

  function doImport() {
    try {
      const text = $('#import-text').value;
      const parsed = Parser.parse(text);

      if (parsed.length === 0) {
        showResult('등록할 항목을 찾지 못했습니다.\nAI 출력 맨 끝의 @@APP-DATA@@ 블록을 확인해 주세요.', true);
        return;
      }

      let source;
      if ($('#src-new').checked) {
        const name = $('#src-new-name').value.trim()
          || '가져오기 ' + new Date().toLocaleString('ko-KR');
        source = { id: 0, name };   // id 0이면 Merger가 새로 발급
      } else {
        const id = +$('#src-existing-select').value;
        source = Data.state.sources.find(s => s.id === id);
        if (!source) { showResult('추가할 기존 출처를 선택해 주세요.', true); return; }
      }

      const { added, merged, skipped } = Merger.importEntries(parsed, source);
      App.setSyncDirty();
      ListView.refresh();

      showResult(
        `출처: ${source.name}\n\n` +
        `새 단어 ${added}개 추가\n` +
        `기존 단어에 맥락 추가 ${merged}개\n` +
        `완전 중복 무시 ${skipped}개\n\n` +
        `※ 아직 GitHub에 저장된 것은 아닙니다. 설정 탭의 [⬆ GitHub에 지금 저장]을 눌러야 영구 저장됩니다.`);

      $('#import-text').value = '';
      App.toast(`가져오기 완료: 새 ${added}개`);
    } catch (err) {
      console.error(err);
      showResult('등록 중 오류가 발생했습니다:\n' + err.message, true);
    }
  }

  return { render };
})();
