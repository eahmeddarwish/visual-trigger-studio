<div align="center">

# 📷 Visual Trigger Studio

### See something → do something. Zero hardware, zero server, zero cost.
### شوف حاجة ← اعمل حاجة. من غير هاردوير، من غير سيرفر، من غير أي تكلفة.

[![Static Site](https://img.shields.io/badge/Runs-100%25%20client--side-00C896)](#)
[![No API keys](https://img.shields.io/badge/API%20keys-none%20required-3776AB)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-00C896.svg)](LICENSE)

**Built by [Ahmed Darwish](mailto:eahmeddarwish@gmail.com)**

</div>

---

## 🌍 Overview | نظرة عامة

**[English]**
Upload one or more reference photos of anything you care about, and decide what
should happen the moment a new photo (or a live camera frame) looks similar
enough to it: show an image, play a video, fetch a live value from the
internet (currently: weather), or display a text message. Everything —
recognition included — runs **entirely inside your browser tab**. There is no
backend, no database, no API key, no dedicated recognition hardware, and
nothing you upload ever leaves your device.

**[العربية]**
ارفع صورة مرجعية واحدة أو أكتر لأي حاجة مهتم بيها، وحدّد إيه اللي يحصل لما صورة
جديدة (أو لقطة كاميرا حية) تبقى شبيهة بيها بدرجة كافية: اعرض صورة، شغّل فيديو،
اجلب قيمة حية من الإنترنت (حاليًا: الطقس)، أو اعرض رسالة نصية. كل حاجة — بما
فيها التعرف نفسه — بتشتغل **بالكامل جوّه المتصفح**. مفيش سيرفر، مفيش قاعدة
بيانات، مفيش مفتاح API، مفيش أي هاردوير مخصص للتعرف، ومفيش أي صورة بترفعها
بتسيب جهازك أصلًا.

---

## 🚀 Live Demo | تجربة مباشرة

Once published to GitHub Pages (see [Deployment](#-deployment--النشر) below), the
app is reachable at:

```
https://eahmeddarwish.github.io/visual-trigger-studio/
```

No install, no sign-up — it's a static page. Works on desktop and mobile
browsers that support WebAssembly and `getUserMedia` (i.e. virtually all
modern browsers).

---

## 🏗️ Architecture | المعمارية

```
visual-trigger-studio/
├── index.html            ← single-page UI: Setup / Recognize / How it works
├── css/style.css          ← styling, no framework
├── js/
│   ├── clip-engine.js     ← in-browser CLIP image embeddings (transformers.js, WASM)
│   ├── weather.js         ← Open-Meteo geocoding + live current weather (no API key)
│   ├── triggers-store.js  ← localStorage-backed trigger registry + JSON export/import
│   └── app.js             ← UI wiring: forms, camera capture, matching, rendering actions
├── LICENSE                ← MIT
└── README.md
```

```
 reference photo(s)                    new photo / camera frame
        │                                        │
        ▼                                        ▼
  CLIP vision encoder  ─────────────────►  CLIP vision encoder
  (runs in-browser, WASM, no server)       (same model, same browser tab)
        │                                        │
        └───────────────► cosine similarity ◄────┘
                                  │
                     best match ≥ trigger's threshold?
                                  │
                     ┌────────────┼─────────────┬──────────────┐
                     ▼            ▼              ▼              ▼
                Show image   Play video   Fetch live weather   Show text
                                          (Open-Meteo, free, no key)
```

**Why CLIP embeddings instead of training a classifier per photo:** training a
dedicated model needs many labeled examples per class and a retraining step
every time you add something new. CLIP produces a general-purpose "fingerprint"
for any photo with zero training — upload a reference photo and it's usable
immediately. This is the same embedding-and-compare approach behind most modern
reverse-image-search tools.

**Why the browser, not a Python backend:** running the model client-side (via
[transformers.js](https://github.com/huggingface/transformers.js) + ONNX
Runtime Web) means the whole project is a static site — free to host forever
on GitHub Pages, no cold starts, no server costs, no GPU/CPU tier limits to
negotiate with a hosting provider, and no user photo ever touches a server.

---

## ⚠️ Honest Limitations | القيود الصادقة

**[English]**
- CLIP is excellent at recognizing *concepts* ("a photo containing a bicycle")
  but noticeably weaker than a purpose-trained model at telling apart two
  specific, similar-looking objects under different lighting/angles/backgrounds.
  Upload 2-3 reference photos per trigger from different angles, and treat a
  single high-confidence score as a strong signal — not an infallible proof.
- Triggers live in this browser's local storage only. They are **not** synced
  to any account, device, or server — clearing browsing data removes them. Use
  the Export/Import JSON buttons to back them up or move them elsewhere.
- The "weather" action is a live reading for the **named location** from a
  public weather API (Open-Meteo) — it is intentionally not a physical sensor
  reading at the exact spot the camera is pointed at. This project has zero
  hardware dependency by design.
- Uploaded videos are stored as base64 inside local storage, which browsers
  typically cap around 5-10MB per site. For anything larger, use a direct video
  URL in the trigger form instead of uploading the file.
- The first visit downloads a quantized CLIP model (roughly 40-90MB) from a
  public CDN; the browser caches it afterwards so later visits are instant.

**[العربية]**
- CLIP ممتاز في التعرف على *المفاهيم* ("صورة فيها دراجة") لكنه أضعف بوضوح من
  نموذج مُدرَّب خصيصًا في التفريق بين جسمين محدّدين متشابهين تحت إضاءة/زاوية/خلفية
  مختلفة. ارفع 2-3 صور مرجعية لكل trigger من زوايا مختلفة، وتعامل مع أي نسبة
  تطابق عالية كإشارة قوية — مش دليل قاطع.
- الـ triggers مخزّنة في تخزين المتصفح المحلي (localStorage) بس. **مش** متزامنة
  مع أي حساب أو جهاز أو سيرفر — مسح بيانات التصفح بيمسحها. استخدم زرار
  التصدير/الاستيراد (Export/Import) للنسخ الاحتياطي أو النقل لجهاز تاني.
- فعل "الطقس" بيرجّع قراءة حية لـ **الموقع المكتوب بالاسم** من واجهة برمجية
  عامة (Open-Meteo) — مش قراءة حساس فعلي في نفس البقعة اللي الكاميرا واقفة
  عليها، وده بالتصميم عشان المشروع يفضل من غير أي اعتماد على هاردوير.
- الفيديوهات المرفوعة بتتخزن كـ base64 جوّه localStorage، والمتصفحات عادةً
  بتحد المساحة بـ5-10 ميجا لكل موقع. لأي فيديو أكبر، استخدم رابط فيديو مباشر
  بدل رفع الملف في نموذج الـ trigger.
- أول زيارة بتحمّل نموذج CLIP مضغوط (حوالي 40-90 ميجا) من CDN عام؛ المتصفح
  بيكاشه بعد كده فالزيارات اللي بعدها فورية.

---

## 🌐 Deployment | النشر

**[English]** This is a static site — no build step, no server:

1. Push this folder to a new GitHub repository (e.g. `visual-trigger-studio`).
2. In the repo's **Settings → Pages**, set the source to the `main` branch,
   root folder (`/`).
3. Wait a minute or two, then open
   `https://<your-username>.github.io/visual-trigger-studio/`.

That's the whole deployment — no Hugging Face Space, no Docker, no ZeroGPU/CPU
tier to negotiate, because there's no server-side model at all.

**[العربية]** ده موقع ثابت — مفيش build ولا سيرفر:

1. ارفع المجلد ده لمستودع GitHub جديد (مثلًا `visual-trigger-studio`).
2. من **Settings → Pages** في المستودع، اختار المصدر `main` والمجلد الجذري (`/`).
3. استنى دقيقة أو اتنين وافتح
   `https://<اسم المستخدم>.github.io/visual-trigger-studio/`.

كده خلص النشر بالكامل — مفيش Hugging Face Space، مفيش Docker، ومفيش تفاوض على
درجة ZeroGPU/CPU، لأنه أصلًا مفيش أي نموذج شغّال على سيرفر.

---

## 🗺️ Roadmap | خطة التطوير

- [ ] Multi-shot negative examples per trigger (mark a photo as "similar but
      should NOT match") to raise precision.
- [ ] Optional WebGPU acceleration where supported, falling back to WASM.
- [ ] Text-to-speech narration of the matched action (bilingual AR/EN).
- [ ] Optional QR-code fallback trigger for low-confidence camera conditions.
- [ ] A small set of shareable example trigger packs (JSON) contributed by
      users via the Export/Import feature.

---

## 👤 Author | المطور

<div align="center">

**Ahmed Darwish**

*Electrical & Computer Engineer | Python · Arduino · Raspberry Pi · AI/ML*

[![Email](https://img.shields.io/badge/Email-eahmeddarwish%40gmail.com-EA4335?logo=gmail&logoColor=white)](mailto:eahmeddarwish@gmail.com)
[![GitHub](https://img.shields.io/badge/GitHub-eahmeddarwish-181717?logo=github)](https://github.com/eahmeddarwish)

</div>

---

## 📄 License

MIT — see [LICENSE](LICENSE). Free to use, modify, and distribute with attribution.

<div align="center">

*Made with ❤️ by Ahmed Darwish*

</div>
