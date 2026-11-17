// Persistência local no formato do contrato v0 de "ocorrência".
const KEY = 'zelabairro:ocorrencias';

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } };

export const list = () => read();
export const get = (id) => read().find((o) => o.id === id.trim().toUpperCase()) || null;

export function save({ categoria, local, descricao, foto, texto_extraido }) {
  const items = read();
  const id = `OC-${String(items.length + 1).padStart(3, '0')}`;
  const record = { id, categoria, local, descricao, foto, texto_extraido, status: 'pendente', data: new Date().toISOString().slice(0, 10) };
  items.push(record);
  return write(items) ? record : null;
}

export function setStatus(id, status) {
  const items = read();
  const o = items.find((x) => x.id === id);
  if (o) o.status = status;
  write(items);
}
