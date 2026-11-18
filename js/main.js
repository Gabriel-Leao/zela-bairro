import { loadImage, runPipeline } from "./pipeline.js";
import { pickBest, suggestCategory } from "./ocr.js";
import * as store from "./store.js";

const $ = (s) => document.querySelector(s);
const STATUS = ["pendente", "em_triagem", "concluido"];
let thumb = "";

function setStatus(msg, error = false) {
  const el = $("#status");
  el.textContent = msg;
  el.classList.toggle("err", error);
}

function renderSteps(steps) {
  const box = $("#steps");
  box.replaceChildren();
  for (const s of steps) {
    const fig = document.createElement("figure");
    const cap = document.createElement("figcaption");
    const small = document.createElement("small");
    cap.textContent = s.name;
    small.textContent = s.desc;
    cap.append(small);
    fig.append(s.canvas, cap);
    box.append(fig);
  }
}

function makeThumb(canvas, w = 320) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = Math.round((canvas.height * w) / canvas.width);
  c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.6);
}

async function processFile(file) {
  $("#bar").hidden = false;
  try {
    setStatus("Carregando imagem...");
    const img = await loadImage(file);
    const steps = runPipeline(img);
    renderSteps(steps);
    thumb = makeThumb(steps[0].canvas);
    setStatus("Reconhecendo texto (pode levar alguns segundos)...");
    const best = await pickBest(
      steps.filter((s) => s.ocr),
      (p) => {
        $("#bar").value = p;
      },
    );
    const lista = $("#lista-variantes");
    lista.replaceChildren();
    for (const r of best.all) {
      const li = document.createElement("li");
      li.textContent = `${r.name.replace(/^\d+\.\s*/, "")}: ${r.confidence}% ${r.text ? `“${r.text}”` : "(sem leitura)"}`;
      if (r.raw) {
        const dbg = document.createElement("small");
        dbg.style.display = "block";
        dbg.textContent = `bruto: ${r.raw}`;
        li.append(dbg);
      }
      lista.append(li);
    }
    $("#detalhes").hidden = false;
    const resumo = best.all
      .map(
        (r) =>
          `${r.name.replace(/^\d+\.\s*/, "").split(" ")[0]} ${r.confidence}%`,
      )
      .join(" | ");
    if (best.reliable) {
      $("#texto").value = best.text;
      $("#meta").textContent =
        `Melhor variante: ${best.name.replace(/^\d+\.\s*/, "")} (confiança ${best.confidence}%). Comparação: ${resumo}. Revise o texto antes de registrar.`;
      const cat = suggestCategory(best.text);
      if (cat) $("#categoria").value = cat;
      if (best.confidence >= 85) setStatus("Leitura concluída.");
      else
        setStatus(
          "Leitura parcial: confira o texto com a foto e corrija antes de registrar.",
          true,
        );
    } else {
      $("#texto").value = "";
      $("#meta").textContent =
        `Leitura incerta (melhor confiança ${best.confidence}%). Comparação: ${resumo}. Digite o texto manualmente.`;
      setStatus(
        "Não foi possível ler o texto com segurança. Preencha manualmente.",
        true,
      );
    }
  } catch (err) {
    console.error(err);
    setStatus(
      "Falha no processamento. Você pode preencher o cadastro manualmente.",
      true,
    );
  } finally {
    $("#bar").hidden = true;
  }
}

async function onExample(e) {
  if (!e.target.value) return;
  const res = await fetch(
    e.target.value.startsWith("..")
      ? e.target.value.slice(3)
      : `exemplos/${e.target.value}`,
  );
  await processFile(await res.blob());
}

function describe(o) {
  return `${o.id} · ${o.categoria} · ${o.local} · status: ${o.status} · ${o.data}`;
}

function onSave() {
  const local = $("#local").value.trim();
  const descricao = $("#descricao").value.trim();
  const out = $("#resultado");
  out.classList.remove("err");
  if (!local || !descricao) {
    out.textContent = "Informe local e descrição.";
    out.classList.add("err");
    return;
  }
  if (!$("#consent").checked) {
    out.textContent = "Confirme a autorização de uso da foto.";
    out.classList.add("err");
    return;
  }
  const rec = store.save({
    categoria: $("#categoria").value,
    local,
    descricao,
    foto: thumb,
    texto_extraido: $("#texto").value.trim(),
  });
  if (!rec) {
    out.textContent =
      "Não foi possível salvar (armazenamento cheio ou bloqueado).";
    out.classList.add("err");
    return;
  }
  out.textContent = `Ocorrência registrada. Protocolo: ${rec.id}`;
  renderList();
}

function onSearch() {
  const o = store.get($("#busca").value);
  $("#consulta").textContent = o ? describe(o) : "Protocolo não encontrado.";
}

function renderList() {
  const table = $("#lista");
  table.replaceChildren();
  const head = table.insertRow();
  ["Protocolo", "Categoria", "Local", "Texto lido", "Status"].forEach((t) => {
    const th = document.createElement("th");
    th.textContent = t;
    head.append(th);
  });
  for (const o of store.list()) {
    const row = table.insertRow();
    [o.id, o.categoria, o.local, o.texto_extraido || "-"].forEach((v) => {
      row.insertCell().textContent = v;
    });
    const sel = document.createElement("select");
    sel.setAttribute("aria-label", `Status de ${o.id}`);
    STATUS.forEach((s) => sel.add(new Option(s, s, false, s === o.status)));
    sel.addEventListener("change", () => store.setStatus(o.id, sel.value));
    row.insertCell().append(sel);
  }
}

function onExport() {
  const blob = new Blob([JSON.stringify(store.list(), null, 2)], {
    type: "application/json",
  });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: "ocorrencias.json",
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

$("#foto").addEventListener(
  "change",
  (e) => e.target.files[0] && processFile(e.target.files[0]),
);
$("#exemplo").addEventListener("change", onExample);
$("#foto").disabled = $("#exemplo").disabled = true;
setStatus("Carregando OpenCV.js...");
const ready = () => {
  $("#foto").disabled = $("#exemplo").disabled = false;
  setStatus("OpenCV.js carregado. Aguardando foto.");
};
if (window.cv && cv.Mat) ready();
else cv["onRuntimeInitialized"] = ready;
$("#salvar").addEventListener("click", onSave);
$("#consultar").addEventListener("click", onSearch);
$("#exportar").addEventListener("click", onExport);
renderList();
