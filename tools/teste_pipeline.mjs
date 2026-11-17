// Teste de ponta a ponta do MESMO js/pipeline.js usado no navegador, rodando OpenCV.js no Node,
// com Tesseract (CLI) como motor de OCR. Uso: TESSDATA_PREFIX=/caminho/com/por.traineddata npm test
// Gera docs/evidencias/etapas/*.png, docs/resultados_testes.json e docs/resultados_testes.md.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { keepWord } from '../js/ocr.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let cv = require('@techstark/opencv-js');
if (cv instanceof Promise) cv = await cv;
else if (!cv.Mat) await new Promise((r) => { cv.onRuntimeInitialized = r; });
globalThis.cv = cv;
globalThis.document = { createElement: () => ({}) };
cv.imread = (im) => { const m = new cv.Mat(im.height, im.width, cv.CV_8UC4); m.data.set(im.data); return m; };
cv.imshow = (c, m) => { c.mat = m.clone(); };
const { runPipeline } = await import('../js/pipeline.js');

const BUILTIN = {
  '01_pare_boa_luz.png': ['Boa luz, letra clara em fundo vermelho', 'PARE'],
  '02_ruido_sal_pimenta.png': ['Ruído sal e pimenta (4%)', 'PROIBIDO ESTACIONAR'],
  '03_sombra.png': ['Iluminação irregular (gradiente)', 'PREFERENCIAL'],
  '04_baixo_contraste.png': ['Baixo contraste e desfoque', 'SIGA EM FRENTE'],
  '05_inclinada_letra_clara.png': ['Inclinada 4°, letra clara', 'TRAVESSIA ESCOLAR'],
  '06_ruido_gaussiano.png': ['Ruído gaussiano forte (σ=38)', 'VELOCIDADE MAXIMA 40'],
};
const norm = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
const PSM = process.env.PSM || '6';
const LANGS = process.env.LANGS || 'por';
const MIN_WORD = 60;
const letters = (t) => /[A-Za-zÀ-ÿ0-9]{2,}/.test(t);
// Mantém só palavras com confiança >= 60 (mesma regra de js/ocr.js). Score = soma das confianças.
const ocr = (file) => {
  const words = execFileSync('tesseract', [file, '-', '-l', LANGS, '--psm', PSM, 'tsv'], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().split('\n').slice(1).map((l) => l.split('\t')).filter((c) => c[0] === '5' && +c[10] >= 0 && c[11]?.trim());
  const kept = words.filter((c) => +c[10] >= MIN_WORD && keepWord(c[11], +c[10]));
  const text = kept.map((c) => c[11]).join(' ').replace(/[|_~]/g, ' ').replace(/\s+/g, ' ').trim();
  const mean = kept.length ? kept.reduce((a, c) => a + +c[10], 0) / kept.length : 0;
  const score = mean * Math.sqrt(kept.length); // mesma regra de js/ocr.js
  return { text, confidence: Math.round(mean), score, confs: kept.map((c) => +c[10]), raw: words.map((c) => [c[11], +c[10]]) };
};
const recall = (esperado, texto) => {
  const exp = norm(esperado).split(' ');
  const got = new Set(norm(texto).split(' '));
  return exp.filter((w) => got.has(w)).length / exp.length;
};

// Uso: npm test [pasta]. A pasta pode ter um casos.json {arquivo: [condição, texto real]}.
const pasta = process.argv[2] || 'exemplos';
const dir = path.join(root, pasta);
const sufixo = pasta === 'exemplos' ? '' : `_${pasta}`;
const casosFile = path.join(dir, 'casos.json');
const CASOS = fs.existsSync(casosFile) ? JSON.parse(fs.readFileSync(casosFile, 'utf-8')) : BUILTIN;
const etapas = path.join(root, `docs/evidencias/etapas${sufixo}`);
fs.mkdirSync(etapas, { recursive: true });
const rows = [];
for (const f of Object.keys(CASOS)) {
  const buf = fs.readFileSync(path.join(dir, f));
  const p = /\.jpe?g$/i.test(f) ? jpeg.decode(buf, { useTArray: true }) : PNG.sync.read(buf);
  const steps = runPipeline({ data: p.data, width: p.width, height: p.height });
  const base = f.replace(/\.\w+$/, '');
  const cand = [];
  steps.forEach((s, i) => {
    const rgba = new cv.Mat();
    if (s.canvas.mat.channels() === 1) cv.cvtColor(s.canvas.mat, rgba, cv.COLOR_GRAY2RGBA); else s.canvas.mat.copyTo(rgba);
    const png = new PNG({ width: rgba.cols, height: rgba.rows });
    png.data = Buffer.from(rgba.data);
    const o = path.join(etapas, `${base}_${i + 1}.png`);
    fs.writeFileSync(o, PNG.sync.write(png));
    if (s.ocr) cand.push({ etapa: s.name, ...ocr(o) });
  });
  const best = cand.reduce((a, b) => (b.score > a.score ? b : a));
  const confiavel = letters(best.text);
  const words = CASOS[f][1].split(/\s+/).length;
  const rBest = recall(CASOS[f][1], best.text), rBase = recall(CASOS[f][1], cand[0].text);
  rows.push({ arquivo: f, condicao: CASOS[f][0], esperado: CASOS[f][1], baseline: cand[0], candidatos: cand, escolhida: best, confiavel, palavras: words, recallBaseline: rBase, recallEscolhida: rBest, acertou: confiavel && rBest === 1 });
  console.log(f, '| baseline', cand[0].confidence + '%', JSON.stringify(cand[0].text), '| escolhida', best.confidence + '%', JSON.stringify(best.text), confiavel ? '' : '(incerta)');
}
fs.writeFileSync(path.join(root, `docs/resultados_testes${sufixo}.json`), JSON.stringify(rows, null, 2));
const pct = (x) => `${Math.round(x * 100)}%`;
const ok = (r) => (r.acertou ? 'Sim' : !r.confiavel ? 'Não (incerta, manual)' : r.recallEscolhida >= 0.5 ? 'Parcial' : 'Não');
const base = (r) => (r.baseline.text ? `${r.baseline.confidence}% "${r.baseline.text}" (${pct(r.recallBaseline)} das palavras)` : 'sem leitura');
let md = '| Imagem | Condição | Texto real | OCR sem pré-processamento | Variante escolhida | OCR escolhido | Palavras certas | Resultado |\n|---|---|---|---|---|---|---|---|\n';
for (const r of rows) md += `| ${r.arquivo} | ${r.condicao} | ${r.esperado} | ${base(r)} | ${r.escolhida.etapa.replace(/^\d+\.\s*/, '')} | ${r.escolhida.confidence}% "${r.escolhida.text}" | ${pct(r.recallEscolhida)} (baseline ${pct(r.recallBaseline)}) | ${ok(r)} |\n`;
fs.writeFileSync(path.join(root, `docs/resultados_testes${sufixo}.md`), md);
console.log(`\nAcertos totais: ${rows.filter((r) => r.acertou).length}/${rows.length}`);
