// Reconhecimento de texto (Tesseract.js, carregado por CDN) e escolha automática da melhor variante.
const MIN_CONFIDENCE = 60;
let worker = null;
let progressCb = null;

async function getWorker() {
  if (!worker) {
    worker = await window.Tesseract.createWorker('por', 1, {
      logger: (m) => { if (m.status === 'recognizing text') progressCb?.(m.progress); },
    });
    // PSM 6: um único bloco de texto, adequado a uma placa enquadrada.
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
  }
  return worker;
}

const UNITS = new Set(['km/h', 'km', 'm', 'h']);
const isNumber = (t) => /^\d+([.,]\d+)?$/.test(t);

// Filtro de palavras. Em fotos de cena o fundo gera "palavras" curtas e símbolos com confiança média.
// Números e unidades (30, km/h) passam com 70%; palavras de 2 letras exigem 92%; de 3 a 4 letras, 78%.
export function keepWord(text, conf) {
  // Mínimo de 2 caracteres: letras e dígitos soltos são quase sempre ruído do fundo.
  if (text.length < 2 || !/^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9./%-]*$/.test(text)) return false;
  if (isNumber(text) || UNITS.has(text.toLowerCase())) return conf >= 70;
  if (text.length <= 2) return conf >= 92;
  if (text.length <= 4) return conf >= 78;
  return conf >= MIN_CONFIDENCE;
}

export const hasLetters = (t) => /[A-Za-zÀ-ÿ0-9]{2,}/.test(t);

// Mantém só as palavras com confiança >= 60%. Em fotos de cena o fundo gera "palavras" lixo
// com confiança baixa, e descartá-las deixa só o texto da placa.
export async function recognize(canvas, onProgress) {
  progressCb = onProgress;
  const w = await getWorker();
  const { data } = await w.recognize(canvas);
  const kept = (data.words || []).filter((x) => keepWord(x.text, x.confidence));
  const text = kept.map((x) => x.text).join(' ').replace(/[|_\\[\]{}~]/g, ' ').replace(/\s+/g, ' ').trim();
  const mean = kept.length ? kept.reduce((a, x) => a + x.confidence, 0) / kept.length : 0;
  // Score = confiança média x raiz do nº de palavras: premia leituras mais completas sem deixar lixo ganhar.
  return { text, confidence: Math.round(mean), score: mean * Math.sqrt(kept.length) };
}

// Roda o OCR em cada variante candidata e escolhe sozinho a de maior score.
export async function pickBest(steps, onProgress) {
  const all = [];
  for (let i = 0; i < steps.length; i++) {
    const r = await recognize(steps[i].canvas, (p) => onProgress?.((i + p) / steps.length));
    all.push({ name: steps[i].name, ...r });
  }
  const best = all.reduce((a, b) => (b.score > a.score ? b : a));
  return { ...best, reliable: hasLetters(best.text), all };
}

const RULES = [
  [/\b(pare|siga|preferencial|velocidade|proibido|estacionar|estacionamento|sentido|travessia|escolar|stop|yield|speed|limit|parking|school|one way|do not enter)\b/i, 'sinalizacao'],
  [/\b(banco|lixeira|corrim[aã]o|bebedouro|ponto|bench|bus stop|trash)\b/i, 'mobiliario'],
  [/\b(cal[cç]ada|rampa|passeio|sidewalk|crosswalk)\b/i, 'calcada'],
];

export function suggestCategory(text) {
  const hit = RULES.find(([re]) => re.test(text));
  return hit ? hit[1] : null;
}
