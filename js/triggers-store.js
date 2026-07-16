// triggers-store.js
// Client-side persistence for "triggers" (reference image(s) + action to run on match).
// Everything lives in the browser (localStorage) — there is no backend and no
// account system. This keeps the whole project a zero-cost, zero-server static
// site, but it also means triggers are per-browser/per-device only. Use the
// Export/Import buttons in the UI to move a trigger set between devices or
// commit an example set into the repo.

const STORAGE_KEY = "vts_triggers_v1";

function uid() {
  return "trg_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function loadTriggers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    console.error("[triggers-store] failed to read localStorage, resetting.", err);
    return [];
  }
}

function saveTriggers(triggers) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(triggers));
    return { ok: true };
  } catch (err) {
    // Most likely QuotaExceededError (localStorage is typically 5-10MB/origin).
    // This is a real, expected failure mode when users attach large videos as
    // actions — surface it clearly instead of silently losing data.
    console.error("[triggers-store] save failed", err);
    return {
      ok: false,
      error:
        "تعذّر الحفظ محليًا — على الأغلب تخطّيت مساحة تخزين المتصفح (localStorage عادةً محدودة بـ5-10 ميجابايت). " +
        "جرّب فيديو أصغر أو استخدم رابط فيديو بدل رفع الملف. " +
        "(Save failed — likely exceeded browser localStorage quota. Try a smaller video or use a video URL instead of uploading the file.)",
    };
  }
}

export const TriggerStore = {
  all() {
    return loadTriggers();
  },

  get(id) {
    return loadTriggers().find((t) => t.id === id) || null;
  },

  create(trigger) {
    const triggers = loadTriggers();
    const withId = {
      id: uid(),
      createdAt: Date.now(),
      threshold: 0.82,
      ...trigger,
    };
    triggers.push(withId);
    const result = saveTriggers(triggers);
    return { ...result, trigger: withId };
  },

  update(id, patch) {
    const triggers = loadTriggers();
    const idx = triggers.findIndex((t) => t.id === id);
    if (idx === -1) return { ok: false, error: "Trigger not found." };
    triggers[idx] = { ...triggers[idx], ...patch };
    const result = saveTriggers(triggers);
    return { ...result, trigger: triggers[idx] };
  },

  remove(id) {
    const triggers = loadTriggers().filter((t) => t.id !== id);
    return saveTriggers(triggers);
  },

  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  },

  exportJSON() {
    const triggers = loadTriggers();
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), triggers }, null, 2);
  },

  importJSON(jsonText, { merge = true } = {}) {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      return { ok: false, error: "ملف JSON غير صالح (invalid JSON file): " + err.message };
    }
    const incoming = Array.isArray(parsed) ? parsed : parsed.triggers;
    if (!Array.isArray(incoming)) {
      return { ok: false, error: "الملف مش فيه مصفوفة triggers صالحة (no valid triggers array found)." };
    }
    const current = merge ? loadTriggers() : [];
    const existingIds = new Set(current.map((t) => t.id));
    for (const t of incoming) {
      if (!t.id || existingIds.has(t.id)) t.id = uid();
      existingIds.add(t.id);
      current.push(t);
    }
    const result = saveTriggers(current);
    return { ...result, count: incoming.length };
  },
};
