'use strict';

// EntryImporter.cs 이식.
// 같은 단어는 합치고 맥락(문장)만 쌓는다.
// 반환: { added, merged, skipped }
const Merger = (() => {
  function normalizeText(s) {
    return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  // parsed: parser 결과 [{vi, pronNorth, pronSouth, ko, contexts:[...]}]
  // source: Data.state.sources의 객체 or null
  function importEntries(parsed, source) {
    const entries = Data.state.entries;
    let added = 0, merged = 0, skipped = 0;

    if (source && !source.id) {
      source.id = Data.nextId(Data.state.sources);
      source.createdUtc = new Date().toISOString();
      Data.state.sources.push(source);
    }

    // 기존 단어 인덱스 (정규화된 vi → entry)
    const byKey = new Map();
    for (const e of entries) byKey.set(Parser.normalizeKey(e.vi), e);

    for (const p of parsed) {
      const key = Parser.normalizeKey(p.vi);
      const target = byKey.get(key);

      if (!target) {
        // ── 새 단어 ──
        const entry = {
          id: Data.nextId(entries),
          vi: p.vi,
          pronNorth: p.pronNorth || '',
          pronSouth: p.pronSouth ?? null,
          ko: p.ko || '',
          sourceId: source ? source.id : null,
          contexts: [...(p.contexts || [])]
        };
        entries.push(entry);
        byKey.set(key, entry);
        added++;
        continue;
      }

      // ── 기존 단어: 맥락 병합 (출처는 최초 등록 출처 유지) ──
      let changed = false;

      for (const c of (p.contexts || [])) {
        const dup = target.contexts.some(tc => normalizeText(tc) === normalizeText(c));
        if (dup) { skipped++; continue; }
        target.contexts.push(c);
        changed = true;
      }

      if (p.ko && !target.ko.toLowerCase().includes(p.ko.toLowerCase())) {
        target.ko = target.ko ? target.ko + '; ' + p.ko : p.ko;
        changed = true;
      }
      if (!target.pronNorth && p.pronNorth) {
        target.pronNorth = p.pronNorth;
        changed = true;
      }
      if (target.pronSouth == null && p.pronSouth != null) {
        target.pronSouth = p.pronSouth;
        changed = true;
      }

      if (changed) merged++;
    }

    if (added + merged > 0 || (source && source.name)) Data.markDirty();
    return { added, merged, skipped };
  }

  return { importEntries };
})();
