// 規格の表の検査：行と列の数、範囲の並び、値が寸法とともに広がること、出典と突き合わせた代表値
// 実行: node tests/test.js（不一致があれば終了コード 1）
const T = require("../js/tables.js");
let fail = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fail++; console.log("NG", msg); } };
const asc = a => a.every((x, i) => i === 0 || x > a[i - 1]);
const nonDec = a => a.filter(x => x !== null && x !== undefined).every((x, i, b) => i === 0 || x >= b[i - 1] - 1e-9);

// JIS B 0405 / B 0419
for (const t of [T.LIN, T.CH, T.ANG, T.ST, T.PE, T.SY]) {
  ok(asc(t.his) && t.heads.length === t.his.length, "範囲の並び " + t.heads[0]);
  for (const k of Object.keys(t).filter(k => k.length === 1)) ok(t[k].length === t.his.length, `列数 ${k}`);
}
ok(T.LIN.m[2] === 0.2 && T.LIN.f[7] === null && T.LIN.v[0] === null, "B 0405 代表値");

// DIN 16901：B の列が広がり、A = B + 0.10 で最後は 800〜1000
for (const g of [130, 140, 150, 160]) { ok(T.DIN.B[g].length === 21 && asc(T.DIN.B[g]), `DIN ${g} の並び`); }
for (let i = 0; i < 21; i++) ok(T.DIN.B[130][i] < T.DIN.B[140][i] && T.DIN.B[140][i] < T.DIN.B[150][i] && T.DIN.B[150][i] < T.DIN.B[160][i], `DIN グループ間 ${i}`);
ok(T.DIN.B[130][7] === 0.20 && T.DIN.B[160][20] === 9.90, "DIN 代表値");

// JIS B 0403：行は等級とともに、列は寸法とともに広がる
ok(T.CT.v.length === 16 && T.CT.v.every(r => r.length === 16), "CT 表の大きさ");
T.CT.v.forEach((r, i) => ok(nonDec(r), `CT 行 ${i}`));
for (let c = 0; c < 16; c++) ok(nonDec(T.CT.v.map(r => r[c])), `CT 列 ${c}`);
ok(T.CT.v[0][12] === null && T.CT.v[2][12] === 6 && T.CT.v[15][15] === 64 && T.CT.v[4][8] === 2.0, "CT 代表値");

// ISO 3302-1
for (const [t, keys] of [[T.R_M, ["M1F", "M1C", "M2F", "M2C", "M3F", "M3C", "M4"]], [T.R_E, ["E1", "E2", "E3"]], [T.R_L, ["L1", "L2", "L3"]]]) {
  ok(asc(t.his), "ゴムの範囲");
  for (const k of keys) { ok(t[k].length === t.his.length && nonDec(t[k]), `ゴム ${k}`); ok(t.pct[k] > 0, `ゴム % ${k}`); }
}
ok(T.R_M.M2F[2] === 0.20 && T.R_M.M4[8] === 2.50 && T.R_E.E3[9] === 3.20, "ゴム代表値");

// 板厚：表の大きさと、厚さとともに広がること
const chk = (t, rows, cols, name) => {
  ok(t.v.length === rows && t.v.every(r => r.length === cols), `${name} の大きさ`);
  for (let c = 0; c < cols; c++) ok(nonDec(t.v.map(r => r[c])), `${name} 列 ${c}`);
};
chk(T.G3141A, T.G3141A.tL.length, T.G3141A.wL.length, "G3141A");
chk(T.G3141B, T.G3141B.tL.length, T.G3141B.wL.length, "G3141B");
chk(T.G4305STD, T.G4305STD.tL.length, T.G4305STD.wL.length, "G4305");
chk(T.G4305ET, T.G4305ET.tL.length, T.G4305ET.wL.length, "G4305ET");
for (const k of ["c1", "c2", "h1"]) chk(T.H4000[k], T.H4000[k].tH.length, T.H4000[k].wH.length, "H4000 " + k);
for (const k of ["s250", "s800"]) chk(T.H4100.solid[k], T.H4100.solid[k].tH.length, 4, "H4100 " + k);
ok(T.G3141A.v[2][2] === 0.05 && T.G3141B.v[0][0] === 0.015 && T.G4305STD.v[10][0] === 0.25 && T.H4000.c1.v[5][2] === 0.08 && T.H4100.solid.s250.v[0][2] === 0.15, "板厚代表値");

console.log(`${n} 件中 ${n - fail} 件一致`);
process.exit(fail ? 1 : 0);
