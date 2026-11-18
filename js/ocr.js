const MIN_CONFIDENCE = 60;
let worker = null;
let progressCb = null;

async function getWorker() {
  if (!worker) {
    worker = await window.Tesseract.createWorker("por", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") progressCb?.(m.progress);
      },
    });

    await worker.setParameters({ tessedit_pageseg_mode: "6" });
  }
  return worker;
}

const UNITS = new Set(["km/h", "km", "m", "h"]);
const isNumber = (t) => /^\d+([.,]\d+)?$/.test(t);

export function keepWord(text, conf) {
  if (text.length < 2 || !/^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9./%-]*$/.test(text))
    return false;
  if (isNumber(text) || UNITS.has(text.toLowerCase())) return conf >= 70;
  if (text.length <= 2) return conf >= 92;
  if (text.length <= 4) return conf >= 78;
  return conf >= MIN_CONFIDENCE;
}

export function filterWords(words) {
  return words.filter((w, i) => {
    if (keepWord(w.text, w.confidence)) return true;
    const next = words[i + 1];
    return (
      w.text.length >= 2 &&
      isNumber(w.text) &&
      w.confidence >= 50 &&
      next &&
      UNITS.has(next.text.toLowerCase()) &&
      next.confidence >= 85
    );
  });
}

export const hasLetters = (t) => /[A-Za-zÀ-ÿ0-9]{2,}/.test(t);

export async function recognize(canvas, onProgress) {
  progressCb = onProgress;
  const w = await getWorker();
  const { data } = await w.recognize(canvas);
  const kept = filterWords(data.words || []);
  const text = kept
    .map((x) => x.text)
    .join(" ")
    .replace(/[|_\\[\]{}~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const score = kept.reduce((a, x) => a + x.confidence, 0);

  const raw = (data.words || [])
    .filter((x) => x.confidence >= 30)
    .map((x) => `${x.text}(${Math.round(x.confidence)})`)
    .join(" ");
  return {
    text,
    confidence: kept.length ? Math.round(score / kept.length) : 0,
    score,
    raw,
  };
}

export async function pickBest(steps, onProgress) {
  const all = [];
  for (let i = 0; i < steps.length; i++) {
    const r = await recognize(steps[i].canvas, (p) =>
      onProgress?.((i + p) / steps.length),
    );
    all.push({ name: steps[i].name, ...r });
  }
  const best = all.reduce((a, b) => (b.score > a.score ? b : a));
  return { ...best, reliable: hasLetters(best.text), all };
}

const RULES = [
  [
    /\b(pare|siga|preferencial|velocidade|proibido|estacionar|estacionamento|sentido|travessia|escolar|stop|yield|speed|limit|parking|school|one way|do not enter)\b/i,
    "sinalizacao",
  ],
  [
    /\b(banco|lixeira|corrim[aã]o|bebedouro|ponto|bench|bus stop|trash)\b/i,
    "mobiliario",
  ],
  [/\b(cal[cç]ada|rampa|passeio|sidewalk|crosswalk)\b/i, "calcada"],
];

export function suggestCategory(text) {
  const hit = RULES.find(([re]) => re.test(text));
  return hit ? hit[1] : null;
}
