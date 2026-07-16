// app.js — UI wiring for Visual Trigger Studio.
// No framework, no build step: plain ES modules loaded directly by the browser.

import { TriggerStore } from "./triggers-store.js";
import { embedImage, cosineSimilarity, embeddingToJSON, embeddingFromJSON } from "./clip-engine.js";
import { resolveWeatherForTrigger } from "./weather.js";

// ---------------------------------------------------------------------------
// Small DOM helpers
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function setStatus(el, message, kind = "") {
  el.textContent = message || "";
  el.className = "status-line" + (kind ? ` ${kind}` : "");
  if (!message) el.classList.add("hidden");
  else el.classList.remove("hidden");
}

const globalStatus = $("global-status");
setStatus(globalStatus, "");

/** Surfaces an error both in the given status element and the browser console —
 * per project convention, never swallow errors behind a generic message. */
function reportError(el, err, prefix = "") {
  const msg = (prefix ? prefix + ": " : "") + (err && err.message ? err.message : String(err));
  console.error(msg, err);
  setStatus(el, msg, "error");
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
const tabButtons = document.querySelectorAll("nav.tabs button");
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    $(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// ---------------------------------------------------------------------------
// Image helpers: resize any image source down to a small square thumbnail
// (keeps localStorage usage sane) and read a File as a data URL.
// ---------------------------------------------------------------------------
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function makeThumbnail(dataUrlOrImage, maxSize = 160) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("تعذّر تحميل الصورة لعمل thumbnail."));
    img.src = dataUrlOrImage;
  });
}

// ---------------------------------------------------------------------------
// Setup tab: render trigger list
// ---------------------------------------------------------------------------
const triggerListEl = $("trigger-list");
const triggerEmptyStateEl = $("trigger-empty-state");

const ACTION_LABELS = {
  image: "🖼 Show image",
  video: "🎬 Play video",
  weather: "🌤 Live weather",
  text: "💬 Text message",
};

function renderTriggerList() {
  const triggers = TriggerStore.all();
  triggerListEl.innerHTML = "";
  triggerEmptyStateEl.classList.toggle("hidden", triggers.length > 0);

  for (const trigger of triggers) {
    const card = document.createElement("div");
    card.className = "trigger-card";

    const thumbs = document.createElement("div");
    thumbs.className = "thumbs";
    for (const ref of trigger.refImages || []) {
      const img = document.createElement("img");
      img.className = "thumb";
      img.src = ref.thumbnail;
      img.alt = trigger.name;
      thumbs.appendChild(img);
    }
    card.appendChild(thumbs);

    const title = document.createElement("h3");
    title.textContent = trigger.name;
    card.appendChild(title);

    const actionType = document.createElement("div");
    actionType.className = "action-type";
    actionType.textContent = ACTION_LABELS[trigger.action?.type] || trigger.action?.type || "unknown action";
    card.appendChild(actionType);

    const meta = document.createElement("div");
    meta.className = "muted";
    meta.style.fontSize = "0.8rem";
    meta.textContent = `${(trigger.refImages || []).length} ref photo(s) · threshold ${trigger.threshold}`;
    card.appendChild(meta);

    const actionsRow = document.createElement("div");
    actionsRow.className = "card-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openTriggerModal(trigger));
    actionsRow.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      if (confirm(`Delete trigger "${trigger.name}"?`)) {
        TriggerStore.remove(trigger.id);
        renderTriggerList();
      }
    });
    actionsRow.appendChild(delBtn);

    card.appendChild(actionsRow);
    triggerListEl.appendChild(card);
  }
}

// ---------------------------------------------------------------------------
// Trigger form modal (shared for create + edit)
// ---------------------------------------------------------------------------
const modal = $("trigger-modal");
const form = $("trigger-form");
const formStatus = $("trigger-form-status");
let editingTriggerId = null;
let pendingRefImages = []; // [{dataUrl, thumbnail}] freshly staged files for this form session

const actionTypeSelect = $("f-action-type");
const actionFieldGroups = {
  image: $("f-action-image"),
  video: $("f-action-video"),
  weather: $("f-action-weather"),
  text: $("f-action-text"),
};

function showActionFields(type) {
  for (const [key, el] of Object.entries(actionFieldGroups)) {
    el.classList.toggle("hidden", key !== type);
  }
}
actionTypeSelect.addEventListener("change", () => showActionFields(actionTypeSelect.value));

const thresholdInput = $("f-threshold");
const thresholdOutput = $("f-threshold-output");
thresholdInput.addEventListener("input", () => {
  thresholdOutput.textContent = thresholdInput.value;
});

function resetForm() {
  form.reset();
  editingTriggerId = null;
  pendingRefImages = [];
  $("f-ref-preview").innerHTML = "";
  showActionFields("image");
  thresholdOutput.textContent = thresholdInput.value;
  setStatus(formStatus, "");
}

function openTriggerModal(trigger) {
  resetForm();
  modal.classList.remove("hidden");
  $("trigger-modal-title").textContent = trigger ? "Edit trigger" : "Add trigger";

  if (trigger) {
    editingTriggerId = trigger.id;
    $("f-name").value = trigger.name || "";
    thresholdInput.value = trigger.threshold ?? 0.75;
    thresholdOutput.textContent = thresholdInput.value;
    pendingRefImages = (trigger.refImages || []).map((r) => ({ ...r }));
    renderRefPreview();

    const type = trigger.action?.type || "image";
    actionTypeSelect.value = type;
    showActionFields(type);
    if (type === "image") $("f-image-url").value = trigger.action.url || "";
    if (type === "video") $("f-video-url").value = trigger.action.url || "";
    if (type === "weather") $("f-weather-location").value = trigger.action.locationName || "";
    if (type === "text") $("f-text-message").value = trigger.action.message || "";
  }
}

function closeTriggerModal() {
  modal.classList.add("hidden");
}

$("btn-new-trigger").addEventListener("click", () => openTriggerModal(null));
$("btn-cancel-trigger").addEventListener("click", closeTriggerModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeTriggerModal();
});

function renderRefPreview() {
  const wrap = $("f-ref-preview");
  wrap.innerHTML = "";
  for (const ref of pendingRefImages) {
    const img = document.createElement("img");
    img.src = ref.thumbnail;
    wrap.appendChild(img);
  }
}

$("f-ref-images").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  setStatus(formStatus, "جاري تجهيز الصور...", "");
  try {
    for (const file of files) {
      const dataUrl = await readFileAsDataURL(file);
      const thumbnail = await makeThumbnail(dataUrl);
      pendingRefImages.push({ dataUrl, thumbnail, embedding: null });
    }
    renderRefPreview();
    setStatus(formStatus, "");
  } catch (err) {
    reportError(formStatus, err, "فشل تجهيز الصور");
  } finally {
    e.target.value = "";
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const saveBtn = $("btn-save-trigger");
  saveBtn.disabled = true;

  try {
    const name = $("f-name").value.trim();
    if (!name) throw new Error("لازم اسم للـ trigger.");
    if (pendingRefImages.length === 0) throw new Error("لازم صورة مرجعية واحدة على الأقل.");

    // Compute embeddings for any staged reference image that doesn't have one yet
    // (i.e. newly-added files; existing ones from an edit already have theirs).
    for (const ref of pendingRefImages) {
      if (!ref.embedding) {
        setStatus(formStatus, `جاري حساب بصمة الصورة (CLIP embedding)...`, "");
        const embedding = await embedImage(ref.dataUrl, (msg) => setStatus(formStatus, msg, ""));
        ref.embedding = embeddingToJSON(embedding);
      }
    }

    const type = actionTypeSelect.value;
    let action = { type };
    if (type === "image") {
      const file = $("f-image-file").files[0];
      const url = $("f-image-url").value.trim();
      if (file) action.dataUrl = await readFileAsDataURL(file);
      else if (url) action.url = url;
      else if (!editingTriggerId) throw new Error("ارفع صورة أو حط رابط صورة للفعل ده.");
    } else if (type === "video") {
      const file = $("f-video-file").files[0];
      const url = $("f-video-url").value.trim();
      if (file) {
        if (file.size > 6 * 1024 * 1024) {
          throw new Error(
            "الفيديو أكبر من 6 ميجا — استخدم رابط فيديو مباشر بدل الرفع عشان تتفادى مشاكل مساحة التخزين المحلي."
          );
        }
        action.dataUrl = await readFileAsDataURL(file);
      } else if (url) action.url = url;
      else if (!editingTriggerId) throw new Error("ارفع فيديو صغير أو حط رابط فيديو.");
    } else if (type === "weather") {
      const locationName = $("f-weather-location").value.trim();
      if (!locationName) throw new Error("اكتب اسم موقع (مدينة) لجلب الطقس بتاعه.");
      action.locationName = locationName;
    } else if (type === "text") {
      const message = $("f-text-message").value.trim();
      if (!message) throw new Error("اكتب رسالة نصية.");
      action.message = message;
    }

    const threshold = parseFloat(thresholdInput.value);
    const payload = { name, refImages: pendingRefImages, action, threshold };

    const result = editingTriggerId
      ? TriggerStore.update(editingTriggerId, payload)
      : TriggerStore.create(payload);

    if (!result.ok) throw new Error(result.error);

    closeTriggerModal();
    renderTriggerList();
  } catch (err) {
    reportError(formStatus, err, "تعذّر حفظ الـ trigger");
  } finally {
    saveBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------
$("btn-export").addEventListener("click", () => {
  const json = TriggerStore.exportJSON();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "visual-trigger-studio-triggers.json";
  a.click();
  URL.revokeObjectURL(url);
});

$("btn-import").addEventListener("click", () => $("import-file-input").click());
$("import-file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const result = TriggerStore.importJSON(text, { merge: true });
    if (!result.ok) throw new Error(result.error);
    renderTriggerList();
    setStatus(globalStatus, `تم استيراد ${result.count} trigger(s).`, "success");
  } catch (err) {
    reportError(globalStatus, err, "فشل الاستيراد");
  } finally {
    e.target.value = "";
  }
});

// ---------------------------------------------------------------------------
// Recognize tab
// ---------------------------------------------------------------------------
let recognizeInput = null; // File | HTMLCanvasElement
let mediaStream = null;

const srcBtnUpload = $("src-btn-upload");
const srcBtnCamera = $("src-btn-camera");
const sourceUploadEl = $("source-upload");
const sourceCameraEl = $("source-camera");
const checkBtn = $("btn-check");

function selectSource(which) {
  srcBtnUpload.classList.toggle("active", which === "upload");
  srcBtnCamera.classList.toggle("active", which === "camera");
  sourceUploadEl.classList.toggle("hidden", which !== "upload");
  sourceCameraEl.classList.toggle("hidden", which !== "camera");
}
srcBtnUpload.addEventListener("click", () => selectSource("upload"));
srcBtnCamera.addEventListener("click", () => selectSource("camera"));

$("recognize-file-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  recognizeInput = file;
  const preview = $("upload-preview");
  preview.src = URL.createObjectURL(file);
  preview.classList.remove("hidden");
  checkBtn.disabled = false;
});

$("btn-camera-start").addEventListener("click", async () => {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    $("camera-preview").srcObject = mediaStream;
    $("btn-camera-snapshot").disabled = false;
    $("btn-camera-stop").disabled = false;
    $("btn-camera-start").disabled = true;
  } catch (err) {
    reportError(globalStatus, err, "تعذّر تشغيل الكاميرا (تأكد من إذن الوصول للكاميرا)");
  }
});

$("btn-camera-stop").addEventListener("click", () => {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  $("btn-camera-snapshot").disabled = true;
  $("btn-camera-stop").disabled = true;
  $("btn-camera-start").disabled = false;
});

$("btn-camera-snapshot").addEventListener("click", () => {
  const video = $("camera-preview");
  const canvas = $("camera-canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  canvas.classList.remove("hidden");
  recognizeInput = canvas;
  checkBtn.disabled = false;
});

checkBtn.addEventListener("click", async () => {
  if (!recognizeInput) return;
  checkBtn.disabled = true;
  const resultEl = $("recognize-result");
  resultEl.innerHTML = "";
  try {
    setStatus(globalStatus, "جاري حساب بصمة الصورة...", "");
    const inputEmbedding = await embedImage(recognizeInput, (msg) => setStatus(globalStatus, msg, ""));

    const triggers = TriggerStore.all();
    if (triggers.length === 0) {
      throw new Error("مفيش triggers محفوظة لسه — روح تبويب الإعداد وضيف واحد الأول.");
    }

    let best = null; // { trigger, score }
    for (const trigger of triggers) {
      for (const ref of trigger.refImages || []) {
        if (!ref.embedding) continue;
        const score = cosineSimilarity(inputEmbedding, embeddingFromJSON(ref.embedding));
        if (!best || score > best.score) best = { trigger, score };
      }
    }

    setStatus(globalStatus, "");
    await renderRecognizeResult(best);
  } catch (err) {
    reportError(globalStatus, err, "فشل التعرف");
  } finally {
    checkBtn.disabled = false;
  }
});

async function renderRecognizeResult(best) {
  const resultEl = $("recognize-result");
  if (!best) {
    resultEl.innerHTML = `<div class="result-card no-match">No reference images with a computed fingerprint were found.</div>`;
    return;
  }

  const { trigger, score } = best;
  const isMatch = score >= (trigger.threshold ?? 0.75);
  const pct = Math.max(0, Math.min(100, Math.round(score * 100)));

  const card = document.createElement("div");
  card.className = "result-card " + (isMatch ? "match" : "no-match");
  card.innerHTML = `
    <div><strong>${isMatch ? "✅ Match" : "⚠️ No confident match"}:</strong> closest trigger is "${trigger.name}"</div>
    <div class="score-bar-track"><div class="score-bar-fill" style="width:${pct}%"></div></div>
    <div class="muted" style="font-size:0.85rem;">similarity ${pct}% (threshold ${Math.round((trigger.threshold ?? 0.75) * 100)}%)</div>
    <div class="action-output" id="action-output"></div>
  `;
  resultEl.innerHTML = "";
  resultEl.appendChild(card);

  if (!isMatch) return; // show the honest "closest but not confident enough" state and stop.

  const outputEl = $("action-output");
  const action = trigger.action;
  try {
    if (action.type === "image") {
      const img = document.createElement("img");
      img.src = action.dataUrl || action.url;
      outputEl.appendChild(img);
    } else if (action.type === "video") {
      const video = document.createElement("video");
      video.src = action.dataUrl || action.url;
      video.controls = true;
      video.autoplay = true;
      outputEl.appendChild(video);
    } else if (action.type === "text") {
      const p = document.createElement("p");
      p.textContent = action.message;
      outputEl.appendChild(p);
    } else if (action.type === "weather") {
      outputEl.textContent = "جاري جلب بيانات الطقس الحية...";
      const weather = await resolveWeatherForTrigger(action);
      // Cache the resolved coordinates on the trigger so we don't re-geocode every time.
      TriggerStore.update(trigger.id, {
        action: { ...action, lat: weather.lat, lon: weather.lon, resolvedName: weather.resolvedName },
      });
      outputEl.innerHTML = `
        <div class="weather-card">
          <div class="weather-metric">
            <div class="value">${weather.temperatureC}°C</div>
            <div class="label">Temperature</div>
          </div>
          <div class="weather-metric">
            <div class="value">${weather.humidityPct}%</div>
            <div class="label">Humidity</div>
          </div>
          <div class="weather-metric">
            <div class="value">${weather.windKmh}</div>
            <div class="label">Wind km/h</div>
          </div>
        </div>
        <div class="disclaimer">
          Live data for <strong>${weather.resolvedName}</strong> via Open-Meteo (as of ${weather.observedAt},
          ${weather.timezone}) — this is a city-level internet reading, not a physical sensor at the exact
          spot the camera is pointed at.
        </div>
      `;
    }
  } catch (err) {
    reportError(outputEl, err, "فشل تنفيذ الفعل");
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
renderTriggerList();
showActionFields("image");
