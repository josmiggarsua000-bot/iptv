import { cp, mkdir, rm } from 'node:fs/promises';
const target = new URL('../android/app/src/main/assets/public/', import.meta.url);
await rm(target, { recursive: true, force: true }); await mkdir(target, { recursive: true });
await cp(new URL('../dist/', import.meta.url), target, { recursive: true });
console.log('Interfaz copiada a Android; no se incluyen perfiles ni cuentas.');
