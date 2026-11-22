// Tiny stack VM for make.fun tiny-stack-vm-01-run-20261122, written from ISA.md.
// One run answers every instance under /input/<id>/ with /output/<id>/stdout.bin + exit.txt.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
// Per-opcode [immediate bytes + 1, pops, pushes] packed into one flat typed
// array (3 bytes per opcode; a 0 in the first slot marks an undefined opcode,
// so opcodes 0 and 52, whose real triple is all zeros, still decode). The hot
// loop reads it with plain integer indexing instead of an object-table lookup
// plus array destructuring on every step.
const T = new Uint8Array(768);
for (const [o, i, a, b] of [
  [0, 1, 0, 0], [1, 2, 0, 1], [2, 5, 0, 1], [3, 1, 1, 0], [4, 1, 1, 2],
  [5, 1, 2, 2], [6, 1, 2, 3], [7, 1, 3, 3],
  [16, 1, 2, 1], [17, 1, 2, 1], [18, 1, 2, 1], [19, 1, 2, 1], [20, 1, 2, 1],
  [21, 1, 2, 1], [22, 1, 2, 1], [23, 1, 1, 1], [24, 1, 2, 1], [25, 1, 2, 1],
  [26, 1, 2, 1], [27, 1, 1, 1], [28, 1, 2, 1], [29, 1, 2, 1], [30, 1, 2, 1],
  [32, 1, 2, 1], [33, 1, 2, 1], [34, 1, 2, 1],
  [48, 3, 0, 0], [49, 3, 1, 0], [50, 3, 1, 0], [51, 3, 0, 0], [52, 1, 0, 0],
  [64, 1, 1, 1], [65, 1, 2, 0],
  [80, 1, 1, 0], [81, 1, 1, 0], [82, 1, 0, 1], [83, 1, 1, 0],
]) { const k = o * 3; T[k] = i; T[k + 1] = a; T[k + 2] = b; }

function run(p: Uint8Array, inp: Uint8Array): [Uint8Array, number] {
  const n = p.length;
  const D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let sp = 0, cp = 0, ip = 0, pc = 0, steps = 0, ol = 0;
  const end = (code: number): [Uint8Array, number] => [out.slice(0, ol), code];
  for (;;) {
    if (steps === 1000000) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = p[pc], k = op * 3, imm = T[k] - 1;
    if (imm < 0) return end(5);
    const pops = T[k + 1], pushes = T[k + 2];
    if (pc + imm >= n) return end(9);
    steps++;
    const nx = pc + 1 + imm;
    if (sp < pops) return end(2);
    if (sp - pops + pushes > 256) return end(3);
    pc = nx;
    switch (op) {
      case 0: return end(0);
      case 1: D[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 2: D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const v = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = v; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 23: D[sp - 1] = (-D[sp - 1]) | 0; break;
      case 27: D[sp - 1] = ~D[sp - 1]; break;
      case 48: case 49: case 50: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = op === 48;
        if (op !== 48) { const v = D[--sp]; take = op === 49 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 51:
        if (cp === 64) return end(7);
        C[cp++] = nx; pc = p[nx - 2] | (p[nx - 1] << 8); break;
      case 52:
        if (cp === 0) return end(8);
        pc = C[--cp]; break;
      case 64: {
        const a = D[sp - 1];
        if (a < 0 || a > 255) return end(6);
        D[sp - 1] = M[a]; break;
      }
      case 65: {
        const a = D[sp - 1], v = D[sp - 2];
        if (a < 0 || a > 255) return end(6);
        sp -= 2; M[a] = v; break;
      }
      case 80: {
        const s = String(D[sp - 1]);
        if (ol + s.length > 65536) return end(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        break;
      }
      case 81:
        if (ol + 1 > 65536) return end(11);
        out[ol++] = D[--sp] & 255; break;
      case 82: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 83: return end(D[--sp] & 255);
      default: {
        const b = D[sp - 1], a = D[sp - 2];
        let r = 0;
        if (op === 16) r = (a + b) | 0;
        else if (op === 17) r = (a - b) | 0;
        else if (op === 18) r = Math.imul(a, b);
        else if (op === 19) { if (!b) return end(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (op === 20) { if (!b) return end(4); r = b === -1 ? 0 : (a % b) | 0; }
        else if (op === 21) { if (!b) return end(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 22) { if (!b) return end(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 24) r = a & b;
        else if (op === 25) r = a | b;
        else if (op === 26) r = a ^ b;
        else if (op === 28) r = a << (b & 31);
        else if (op === 29) r = a >> (b & 31);
        else if (op === 30) r = (a >>> (b & 31)) | 0;
        else if (op === 32) r = a === b ? 1 : 0;
        else if (op === 33) r = a < b ? 1 : 0;
        else if (op === 34) r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; D[sp++] = r;
      }
    }
  }
}

for (const id of readdirSync(I).sort()) {
  const p = readFileSync(join(I, id, 'program.bin'));
  let inp = new Uint8Array(0);
  try { inp = readFileSync(join(I, id, 'input.bin')); } catch { /* no input file */ }
  const [o, code] = run(p, inp);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), o);
  writeFileSync(join(O, id, 'exit.txt'), String(code) + '\n');
}
