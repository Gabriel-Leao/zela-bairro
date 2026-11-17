// Pré-processamento com OpenCV.js, seguindo as técnicas vistas nas aulas 2 a 8 e 11.
// Cada etapa vira um canvas para documentar as imagens intermediárias.
const toCanvas = (mat) => {
  const c = document.createElement('canvas');
  cv.imshow(c, mat);
  return c;
};

export function loadImage(file) {
  return new Promise((ok, fail) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = fail;
    im.src = URL.createObjectURL(file);
  });
}

// Cap. 11: INTER_AREA ao reduzir (evita aliasing), INTER_CUBIC ao ampliar.
function resizeToWidth(src, width) {
  const s = width / src.cols;
  const out = new cv.Mat();
  cv.resize(src, out, new cv.Size(0, 0), s, s, s < 1 ? cv.INTER_AREA : cv.INTER_CUBIC);
  return out;
}

// Cap. 3: ROI. Decide a polaridade olhando só o centro da imagem (onde a placa deve estar enquadrada),
// para o OCR receber sempre texto preto em fundo branco, mesmo em placas de letra clara.
function fixPolarity(bin) {
  const c = bin.roi(new cv.Rect(Math.floor(bin.cols * 0.25), Math.floor(bin.rows * 0.25), Math.floor(bin.cols * 0.5), Math.floor(bin.rows * 0.5)));
  const dark = cv.countNonZero(c) < c.total() / 2;
  c.delete();
  if (dark) cv.bitwise_not(bin, bin);
}

// Cap. 3: recorte (ROI) do miolo da imagem, ignorando fundo e bordas.
function centerCrop(mat) {
  const r = mat.roi(new cv.Rect(Math.floor(mat.cols * 0.1), Math.floor(mat.rows * 0.15), Math.floor(mat.cols * 0.8), Math.floor(mat.rows * 0.7)));
  const out = r.clone();
  r.delete();
  return out;
}

// Cap. 5: componentes conexos. Remove manchas pequenas (ruído) e molduras grandes e põe uma borda branca para o OCR.
function cleanSpecks(bin, minArea) {
  const inv = new cv.Mat();
  cv.bitwise_not(bin, inv);
  const labels = new cv.Mat(), stats = new cv.Mat(), centroids = new cv.Mat();
  const n = cv.connectedComponentsWithStats(inv, labels, stats, centroids, 8, cv.CV_32S);
  const keep = new Uint8Array(n);
  for (let i = 1; i < n; i++) {
    const area = stats.intPtr(i, cv.CC_STAT_AREA)[0];
    const w = stats.intPtr(i, cv.CC_STAT_WIDTH)[0];
    const h = stats.intPtr(i, cv.CC_STAT_HEIGHT)[0];
    const isFrame = w > bin.cols * 0.6 && h > bin.rows * 0.35; // moldura da placa ou fundo: confunde o OCR
    keep[i] = area >= minArea && !isFrame ? 1 : 0;
  }
  const clean = new cv.Mat(bin.rows, bin.cols, cv.CV_8UC1, new cv.Scalar(255));
  const L = labels.data32S;
  for (let p = 0; p < L.length; p++) if (keep[L[p]]) clean.data[p] = 0;
  const padded = new cv.Mat();
  cv.copyMakeBorder(clean, padded, 20, 20, 20, 20, cv.BORDER_CONSTANT, new cv.Scalar(255));
  [inv, labels, stats, centroids, clean].forEach((m) => m.delete());
  return padded;
}


// Cap. 7 e 13 + Cap. 5: localiza regiões de texto. Gradiente morfológico realça bordas das letras,
// o fechamento com kernel largo junta letras em palavras e os componentes conexos dão as caixas.
function findTextBoxes(gray, max = 2) {
  const k3 = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  const grad = new cv.Mat();
  cv.morphologyEx(gray, grad, cv.MORPH_GRADIENT, k3);
  const bin = new cv.Mat();
  cv.threshold(grad, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  const kc = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(25, 5));
  cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, kc);
  const labels = new cv.Mat(), stats = new cv.Mat(), cen = new cv.Mat();
  const n = cv.connectedComponentsWithStats(bin, labels, stats, cen, 8, cv.CV_32S);
  const boxes = [];
  const total = gray.total();
  for (let i = 1; i < n; i++) {
    const [x, y, w, h, area] = [0, 1, 2, 3, 4].map((c) => stats.intPtr(i, c)[0]);
    const fill = area / (w * h);
    if (w >= 70 && h >= 22 && w / h >= 1.3 && w / h <= 14 && fill >= 0.45 && w * h <= total * 0.3) boxes.push({ x, y, w, h, area });
  }
  [k3, grad, bin, kc, labels, stats, cen].forEach((m) => m.delete());
  return boxes.sort((a, b) => b.area - a.area).slice(0, max);
}

// Recorta a região (com folga), amplia para 600 px de largura e gera duas binarizações.
function regionVariants(gray, b, idx) {
  const padX = Math.round(b.w * 0.25), padY = Math.round(b.h * 0.6);
  const x = Math.max(0, b.x - padX), y = Math.max(0, b.y - padY);
  const w = Math.min(gray.cols - x, b.w + 2 * padX), h = Math.min(gray.rows - y, b.h + 2 * padY);
  const roi = gray.roi(new cv.Rect(x, y, w, h));
  const crop = new cv.Mat();
  cv.resize(roi, crop, new cv.Size(0, 0), 600 / w, 600 / w, cv.INTER_CUBIC);
  roi.delete();
  const eq = new cv.Mat(), g = new cv.Mat(), otsu = new cv.Mat(), med = new cv.Mat(), ad = new cv.Mat();
  cv.equalizeHist(crop, eq);
  cv.GaussianBlur(eq, g, new cv.Size(3, 3), 0);
  cv.threshold(g, otsu, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  fixPolarity(otsu);
  cv.medianBlur(crop, med, 3);
  cv.adaptiveThreshold(med, ad, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 51, 10);
  fixPolarity(ad);
  const minArea = Math.max(8, Math.round(crop.total() * 0.00003));
  const oc = cleanSpecks(otsu, minArea), ac = cleanSpecks(ad, minArea);
  const out = [
    { name: `${idx}. Região ${(idx - 11) / 2 + 1}, Otsu`, desc: 'Recorte da região de texto ampliado, equalização e Otsu', canvas: toCanvas(oc), ocr: true },
    { name: `${idx + 1}. Região ${(idx - 11) / 2 + 1}, adaptativa`, desc: 'Mesmo recorte com adaptiveThreshold (bloco 51)', canvas: toCanvas(ac), ocr: true },
  ];
  [crop, eq, g, otsu, med, ad, oc, ac].forEach((m) => m.delete());
  return out;
}

export function runPipeline(img) {
  const raw = cv.imread(img);
  const src = resizeToWidth(raw, 1000);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); // Cap. 2

  const eq = new cv.Mat();
  cv.equalizeHist(gray, eq); // Cap. 4
  const gauss = new cv.Mat();
  cv.GaussianBlur(eq, gauss, new cv.Size(5, 5), 0); // Cap. 6
  const median = new cv.Mat();
  cv.medianBlur(gray, median, 5); // Cap. 7, bom contra ruído sal e pimenta

  const otsu = new cv.Mat();
  cv.threshold(gauss, otsu, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU); // Cap. 4
  fixPolarity(otsu);
  const adapt = new cv.Mat();
  cv.adaptiveThreshold(median, adapt, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 10); // iluminação irregular
  fixPolarity(adapt);

  // Normalização de iluminação: divide o cinza pelo fundo estimado (blur grande), depois Otsu.
  const back = new cv.Mat();
  const crop0 = centerCrop(gray);
  const crop = new cv.Mat();
  cv.equalizeHist(crop0, crop);
  cv.GaussianBlur(crop, back, new cv.Size(0, 0), 25);
  const norm = new cv.Mat();
  cv.divide(crop, back, norm, 128, -1);
  const normBlur = new cv.Mat();
  cv.GaussianBlur(norm, normBlur, new cv.Size(3, 3), 0);
  const normBin = new cv.Mat();
  cv.threshold(normBlur, normBin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  fixPolarity(normBin);
  const adaptBig = new cv.Mat();
  cv.adaptiveThreshold(median, adaptBig, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 91, 12);
  fixPolarity(adaptBig);

  const minArea = Math.max(12, Math.round(src.total() * 0.00002));
  const otsuClean = cleanSpecks(otsu, minArea);
  const adaptClean = cleanSpecks(adapt, minArea);
  const adaptBigClean = cleanSpecks(adaptBig, minArea);
  const normClean = cleanSpecks(normBin, minArea);

  const steps = [
    { name: '1. Original (1000 px)', desc: 'Redimensionada com INTER_AREA/INTER_CUBIC', canvas: toCanvas(src) },
    { name: '2. Tons de cinza', desc: 'cvtColor RGBA2GRAY. Também é o OCR sem pré-processamento (baseline)', canvas: toCanvas(gray), ocr: true },
    { name: '3. Equalização', desc: 'equalizeHist, espalha o histograma', canvas: toCanvas(eq) },
    { name: '4. Gaussiano 5x5', desc: 'GaussianBlur sobre a equalizada', canvas: toCanvas(gauss) },
    { name: '5. Mediana 5x5', desc: 'medianBlur sobre o cinza', canvas: toCanvas(median) },
    { name: '6. Otsu + limpeza', desc: 'Limiar de Otsu, polaridade e remoção de manchas', canvas: toCanvas(otsuClean), ocr: true },
    { name: '7. Adaptativa + limpeza', desc: 'adaptiveThreshold (bloco 31) sobre a mediana', canvas: toCanvas(adaptClean), ocr: true },
    { name: '8. Adaptativa larga + limpeza', desc: 'adaptiveThreshold (bloco 91), para letras grandes', canvas: toCanvas(adaptBigClean), ocr: true },
    { name: '9. Centro + iluminação normalizada', desc: 'ROI central, cinza dividido pelo fundo (blur grande) e Otsu: sombra e baixo contraste', canvas: toCanvas(normClean), ocr: true },
  ];
  const boxes = findTextBoxes(gray);
  const marked = src.clone();
  boxes.forEach((b) => cv.rectangle(marked, new cv.Point(b.x, b.y), new cv.Point(b.x + b.w, b.y + b.h), new cv.Scalar(0, 200, 0, 255), 4));
  steps.push({ name: '10. Regiões de texto', desc: 'Gradiente morfológico + fechamento + componentes conexos', canvas: toCanvas(marked) });
  boxes.forEach((b, i) => steps.push(...regionVariants(gray, b, 11 + i * 2)));
  marked.delete();
  [crop0, crop, back, norm, normBlur, normBin, adaptBig, adaptBigClean, normClean, raw, src, gray, eq, gauss, median, otsu, adapt, otsuClean, adaptClean].forEach((m) => m.delete());
  return steps;
}
