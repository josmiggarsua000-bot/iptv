import { migrateLegacy } from './library.js';
const key = 'nexo.accounts.v2';
export async function readState() {
  if (window.desktop?.readState) {
    const state = await window.desktop.readState();
    if (state) return state;
  } else {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored);
  }
  let legacy;
  try { legacy = JSON.parse(localStorage.getItem('nexo.library.v1')); } catch { legacy = null; }
  return migrateLegacy(legacy);
}
export async function writeState(state) {
  if (window.desktop?.saveState) await window.desktop.saveState(state);
  else localStorage.setItem(key, JSON.stringify(state));
  localStorage.removeItem('nexo.library.v1');
}
