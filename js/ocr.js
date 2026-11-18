const MIN_CONFIDENCE = 60;
const NUMBER_MIN_CONFIDENCE = 60;
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
const UNIT_RE = /(^|\s)(km\/?h?)(?=\s|$)/i;
const isNumber = (t) => /^\d+([.,]\d+)?$/.test(t);
const isSpeedNumber = (t) => /^\d{2,3}$/.test(t);

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
  const words = data.words || [];
  const kept = filterWords(words);
  const text = kept
    .map((x) => x.text)
    .join(" ")
    .replace(/[|_\\[\]{}~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Score = confiança média das palavras mantidas x raiz do número de palavras
  // (mesma regra do README e de tools/teste_pipeline.mjs).
  const mean = kept.length
    ? kept.reduce((a, x) => a + x.confidence, 0) / kept.length
    : 0;
  const score = mean * Math.sqrt(kept.length);

  // Números de 2 a 3 dígitos vistos nesta variante, para recuperar o valor
  // de placas de velocidade quando outra variante leu só a unidade.
  const numbers = words
    .filter(
      (x) => isSpeedNumber(x.text) && x.confidence >= NUMBER_MIN_CONFIDENCE,
    )
    .map((x) => ({ text: x.text, conf: x.confidence }));

  const raw = words
    .filter((x) => x.confidence >= 30)
    .map((x) => `${x.text}(${Math.round(x.confidence)})`)
    .join(" ");
  return {
    text,
    confidence: Math.round(mean),
    score,
    raw,
    numbers,
  };
}

// Se a melhor leitura tem unidade (km/h, km/) mas nenhum número, busca o número
// de maior confiança lido em qualquer variante e o coloca antes da unidade.
function recoverNumber(best, all) {
  if (!UNIT_RE.test(best.text) || /\b\d{2,3}\b/.test(best.text)) return best;
  const num = all
    .flatMap((r) => r.numbers || [])
    .sort((a, b) => b.conf - a.conf)[0];
  if (!num) return best;
  return {
    ...best,
    text: best.text.replace(
      UNIT_RE,
      (_m, pre, unit) => `${pre}${num.text} ${unit}`,
    ),
    recoveredNumber: num.text,
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
  const picked = all.reduce((a, b) => (b.score > a.score ? b : a));
  const best = recoverNumber(picked, all);
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
