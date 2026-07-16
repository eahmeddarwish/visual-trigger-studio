// clip-engine.js
// In-browser image embedding using CLIP (via transformers.js / ONNX Runtime Web).
// No server, no API key, no GPU required — everything runs locally in the
// visitor's browser. The model (~40-90MB depending on quantization) is fetched
// once from the jsDelivr CDN and cached by the browser afterwards.
//
// We deliberately use the low-level CLIPVisionModelWithProjection + AutoProcessor
// API instead of the high-level `pipeline("image-feature-extraction", ...)`
// helper: that convenience pipeline has had version-specific breakage with CLIP
// checkpoints (see huggingface/transformers.js issue #1112), while the direct
// vision-tower API mirrors exactly what the pipeline does internally and is the
// documented low-level building block, so it's less likely to shift under us.

const TRANSFORMERS_VERSION = "4.2.0";
// IMPORTANT: transformers.js's raw dist file (dist/transformers.web.js) contains
// bare module specifiers (e.g. `import ... from "onnxruntime-web/webgpu"`) that
// only resolve inside a bundler (webpack/vite). This is a buildless static site
// with no bundler, so we import via jsDelivr's "+esm" endpoint instead: it
// serves a pre-resolved ESM build with every bare import rewritten to a full
// CDN URL, which is exactly what a plain `<script type="module">` needs.
// Confirmed necessary by testing the raw dist path directly (it threw
// "Failed to resolve module specifier 'onnxruntime-web/webgpu'" in-browser).
const CDN_MODULE_URL = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/+esm`;
const MODEL_ID = "Xenova/clip-vit-base-patch32";

let modulePromise = null;
let processorPromise = null;
let visionModelPromise = null;

function loadTransformersModule() {
  if (!modulePromise) {
    modulePromise = import(/* webpackIgnore: true */ CDN_MODULE_URL);
  }
  return modulePromise;
}

/**
 * Lazily loads the CLIP processor + vision tower. Safe to call many times;
 * the underlying downloads only happen once.
 * @param {(status: string) => void} [onProgress] optional status callback for UI updates.
 */
async function ensureModel(onProgress) {
  const report = (msg) => {
    if (onProgress) onProgress(msg);
    console.log("[clip-engine]", msg);
  };

  const mod = await loadTransformersModule();
  const { AutoProcessor, CLIPVisionModelWithProjection } = mod;

  if (!processorPromise) {
    report("جاري تحميل معالج الصور (processor)...");
    processorPromise = AutoProcessor.from_pretrained(MODEL_ID);
  }
  if (!visionModelPromise) {
    report("جاري تحميل نموذج CLIP (~أول مرة فقط، بيتخزن كاش بعدها)...");
    visionModelPromise = CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
      dtype: "q8", // quantized weights: much smaller download, negligible accuracy loss for similarity matching
      progress_callback: (p) => {
        if (p && p.status === "progress" && typeof p.progress === "number") {
          report(`تحميل النموذج... ${Math.round(p.progress)}%`);
        }
      },
    });
  }

  const [processor, visionModel] = await Promise.all([processorPromise, visionModelPromise]);
  report("النموذج جاهز.");
  return { mod, processor, visionModel };
}

/**
 * Converts a File/Blob into an object URL usable by RawImage.read/fromURL.
 */
function fileToObjectURL(fileOrBlob) {
  return URL.createObjectURL(fileOrBlob);
}

/**
 * Converts a <canvas> (e.g. a webcam snapshot) into an object URL, going
 * through canvas.toBlob so we reuse a single, well-documented image-loading
 * path (RawImage.read(url)) for every input source instead of depending on a
 * separate canvas-specific API.
 */
function canvasToObjectURL(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("تعذّر تحويل لقطة الكاميرا إلى صورة (canvas.toBlob failed)."));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });
}

/**
 * Computes a normalized CLIP image embedding for a given input.
 * @param {File|Blob|HTMLCanvasElement|string} input - a File/Blob (e.g. from
 *   <input type="file">), a canvas element (e.g. webcam snapshot), or an
 *   already-usable image URL string.
 * @param {(status: string) => void} [onProgress]
 * @returns {Promise<Float32Array>} L2-normalized embedding vector.
 */
export async function embedImage(input, onProgress) {
  const { mod, processor, visionModel } = await ensureModel(onProgress);
  const { RawImage } = mod;

  let objectUrl = null;
  let urlToRead;
  try {
    if (typeof input === "string") {
      urlToRead = input;
    } else if (input instanceof HTMLCanvasElement) {
      objectUrl = await canvasToObjectURL(input);
      urlToRead = objectUrl;
    } else if (input instanceof Blob) {
      objectUrl = fileToObjectURL(input);
      urlToRead = objectUrl;
    } else {
      throw new Error("نوع مدخل غير مدعوم لحساب embedding (unsupported input type).");
    }

    const image = await RawImage.read(urlToRead);
    const visionInputs = await processor(image);
    const output = await visionModel(visionInputs);
    const embeds = output.image_embeds ?? output.pooler_output ?? output.last_hidden_state;
    if (!embeds || !embeds.data) {
      throw new Error("النموذج رجّع مخرجات غير متوقعة (unexpected model output shape).");
    }
    return normalize(Float32Array.from(embeds.data));
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function normalize(vec) {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

/**
 * Cosine similarity between two equal-length vectors. Implemented locally
 * (rather than relying on a library-exported helper whose name/signature can
 * change across versions) — it's a two-line function, not worth the coupling.
 */
export function cosineSimilarity(a, b) {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  // a and b are already L2-normalized by embedImage(), so dot product === cosine similarity.
  return dot;
}

/** Serializes a Float32Array embedding to a plain array for JSON storage. */
export function embeddingToJSON(embedding) {
  return Array.from(embedding);
}

export function embeddingFromJSON(arr) {
  return Float32Array.from(arr);
}
