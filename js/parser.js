'use strict';

// 프롬프트 (DefaultPrompt.cs 이식)
const PROMPT_PLACEHOLDER = '(여기에 분석할 베트남어를 붙여넣는다)';

const PROMPT_TEMPLATE = `너는 베트남어 교사다. 나는 베트남어를 학습하는 한국인이다.
아래 [베트남어 문장]을 분석해줘.

[분석 형식]
1. 전체 문장의 한국어 발음부터 적는다. 북부(하노이)와 남부(호치민) 발음이 다르면 둘 다 적는다.
2. 필수 단어·표현을 알려준다. 단, 표면적 나열이 아니라, 문장 구조 안에서 쓰이는 그 뜻과 의미로 설명한다. 문장으로 단어를 외울 수 있게.
3. 문장 구조를 분석한다. 영어로 치면 "I like that people who participate party"에서 "I like that people"이 있고 "who" 이하가 "people"을 꾸미는 것처럼, 큰 틀을 먼저 보여주고 하향식으로 내려온다. 문장을 이해할 수 있도록.

[앱 등록용 데이터 - 반드시 준수]
위 분석이 모두 끝난 후, 문서의 맨 마지막에 아래 블록을 정확히 한 번만 출력한다.
- 이 블록은 내가 프로그램에 붙여넣을 것이므로 형식을 절대 바꾸지 않는다.
- 블록 안에서는 마크다운, 이모지, 부연설명을 일절 쓰지 않는다.
- 단어/표현 하나당 "---" 하나로 구분한다.
- 필드: vi(베트남어 원문), pron-n(북부 발음 한글), pron-s(남부 발음 한글), ko(한국어 뜻), ctx(그 단어가 나온 원문 문장)
- pron-s는 북부와 다를 때만 쓴다. 같으면 그 줄을 생략한다.
- 값이 없는 필드는 줄 자체를 생략한다.
- 필드 이름과 순서는 바꾸지 않는다.

@@APP-DATA-BEGIN@@
---
vi: bắt đầu
pron-n: 밧 더우
ko: 시작하다
ctx: Mọi chuyện bắt đầu từ một chiếc bánh xèo.
---
vi: chỉ cần ~ thôi là
pron-n: 찌 깐 ~ 토이 라
ko: ~하기만 하면
ctx: Chỉ cần được ở Việt Nam thôi là mình thấy hạnh phúc lắm.
---
@@APP-DATA-END@@

[베트남어 문장]
${PROMPT_PLACEHOLDER}`;

// AppDataParser.cs 이식 — AI가 형식을 조금 어겨도 최대한 받아내는 관대한 파서
const Parser = (() => {
  const BEGIN = '@@APP-DATA-BEGIN@@';
  const END = '@@APP-DATA-END@@';

  function normalizeKey(s) {
    return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function extractBlock(text) {
    const lower = text.toLowerCase();
    let start = lower.indexOf(BEGIN.toLowerCase());
    if (start < 0) return '';
    start += BEGIN.length;
    let end = lower.indexOf(END.toLowerCase(), start);
    if (end < 0) end = text.length;
    return text.slice(start, end).trim();
  }

  // 마커가 없을 때: 첫 "vi:" 줄부터 끝까지
  function fallbackExtract(text) {
    const m = text.match(/^\s*vi\s*[:：]/im);
    if (!m) return '';
    return text.slice(m.index).trim();
  }

  function normalizeField(raw) {
    const key = raw.trim().toLowerCase().replace(/[-_\s]/g, '');
    switch (key) {
      case 'vi': case 'vietnamese': case 'word': return 'vi';
      case 'pronn': case 'pronnorth': case 'north': return 'pronn';
      case 'prons': case 'pronsouth': case 'south': return 'prons';
      case 'ko': case 'korean': case 'meaning': case '뜻': return 'ko';
      case 'ctx': case 'context': case 'sentence': case '문장': return 'ctx';
      default: return key;
    }
  }

  function parseChunk(chunk) {
    if (!chunk || !chunk.trim()) return null;

    const entry = { vi: '', pronNorth: '', pronSouth: null, ko: '', contexts: [] };

    for (const rawLine of chunk.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const m = line.match(/^([A-Za-z\-_]+)\s*[:：]\s*(.*)$/);
      if (!m) continue;

      const field = normalizeField(m[1]);
      const value = m[2].trim();

      switch (field) {
        case 'vi': entry.vi = value; break;
        case 'pronn': entry.pronNorth = value; break;
        case 'prons': entry.pronSouth = value; break;
        case 'ko': entry.ko = value; break;
        case 'ctx': if (value) entry.contexts.push(value); break;
      }
    }

    if (!entry.vi) return null;

    // 남부 발음이 비었거나 북부와 같으면 null (중복 저장 안 함)
    if (!entry.pronSouth || entry.pronSouth === entry.pronNorth)
      entry.pronSouth = null;

    return entry;
  }

  function parse(rawText) {
    if (!rawText || !rawText.trim()) return [];

    let block = extractBlock(rawText);
    if (!block) block = fallbackExtract(rawText);
    if (!block) return [];

    const chunks = block.split(/^\s*---+\s*$/m);
    const result = [];
    for (const chunk of chunks) {
      const entry = parseChunk(chunk);
      if (entry) result.push(entry);
    }
    return result;
  }

  return { parse, normalizeKey };
})();
