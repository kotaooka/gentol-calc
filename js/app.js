// 普通公差計算機：画面処理（① 寸法 → ② 規格 → ③ 条件と結果、早見表、入力の保存、テーマ、Service Worker の登録）
// 規格の表は tables.js。各規格は STDS に 1 項目で、条件の画面（ui）と表引き（solve）を持つ

// =====================================================================
// 共通の部品
// =====================================================================
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const idx = (v, his) => his.findIndex(h => v <= h + 1e-9);                 // 「〜を超え〜以下」（最初の範囲は下限を含む）
const idxGE = (v, lows, max, maxOpen) => {                                   // 「〜以上〜未満」（最後の範囲は max 以下、maxOpen なら未満）
  if (v < lows[0] - 1e-9) return -1;
  if (maxOpen ? v >= max - 1e-9 : v > max + 1e-9) return -1;
  for (let i = lows.length - 1; i >= 0; i--) if (v >= lows[i] - 1e-9) return i;
  return -1;
};
const decOf = s => { const m = String(s).match(/\.(\d+)/); return m ? m[1].length : 0; };
const grp = s => { const [i, d] = s.split("."); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d !== undefined ? "." + d : ""); };
const fx = (n, d) => grp((Math.round(n * 10 ** d) / 10 ** d).toFixed(d));
const nat = n => grp(String(+n.toFixed(4)));
const num = s => parseFloat(String(s ?? "").normalize("NFKC").replace(/,/g, ""));
const minStr = m => { const d = Math.floor(m / 60), r = Math.round(m - d * 60); return (d ? d + "°" : "") + (r ? r + "′" : (d ? "" : "0′")); };
const dms = deg => { let s = Math.round(deg * 3600); const neg = s < 0; s = Math.abs(s); const d = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (neg ? "−" : "") + d + "°" + (m || x ? m + "′" : "") + (x ? x + "″" : ""); };
const geHeads = (lows, max, first, maxOpen) => lows.map((l, i) => i === 0 && first ? first : i < lows.length - 1 ? `${l}以上${lows[i + 1]}未満` : (max === Infinity ? `${l}以上` : `${l}以上${max}${maxOpen ? "未満" : "以下"}`));
const glHeads = (his, min) => his.map((h, i) => i === 0 ? (min !== undefined ? `${min}〜${h}` : `${h}以下`) : `${his[i - 1]}超〜${h}`);

// 寸法を読む
function parse(raw, kind) {
  const s = String(raw).normalize("NFKC").replace(/\s+/g, "").trim();
  if (!s) return null;
  let m = s.match(/^([0-9]*\.?[0-9]+)(?:°|度)$/);
  if (m) return { raw: s, type: "ang", val: +m[1], str: m[1], typed: true };
  m = s.match(/^([0-9]*\.?[0-9]+)$/);
  if (m && (kind === "ch" || kind === "ang")) return { raw: s, type: kind, pre: "", val: +m[1], str: m[1] };
  m = s.match(/^(?:\d+[-xX×])?(SR|Sφ|SΦ|φ|Φ|ø|Ø|⌀|R|C|□|t|T)?([0-9]*\.?[0-9]+)$/);
  if (!m) return { raw: s, type: "bad" };
  const pre = (m[1] || "").toUpperCase();
  return { raw: s, type: (pre === "R" || pre === "C") ? "ch" : "lin", pre, val: +m[2], str: m[2], typed: !!pre };
}
const KIND = { lin: "長さ", ch: "面取り・かどの丸み", ang: "角度" };

// 結果を作る
const pm = (p, tol, extra = {}) => {
  const d = Math.max(decOf(p.str), decOf(String(+tol.toFixed(4))));
  return Object.assign({ ok: true, tol, tolStr: "±" + nat(tol), lo: fx(p.val - tol, d), hi: fx(p.val + tol, d) }, extra);
};
const ng = (note, short, extra = {}) => Object.assign({ ok: false, note, short: short || "表にない" }, extra);
// 規格に共通の入力の確認（角度は機械加工だけ）
function baseErr(p, ang) {
  if (p.type === "bad") return ng("寸法を数値で入れてください。", "—");
  if (p.type === "ang" && !ang) return ng("角度は機械加工（JIS B 0405）でだけ引けます。", "角度は対象外");
  if (!(p.val > 0)) return ng("0 より大きい値を入れてください。", "—");
  return null;
}

// 早見表 1 枚。vals[r][c] が null は「—」、undefined は「不明」
function grid({ title, rowHeads, colHeads, vals, hr = -1, hc = -1, fmt = nat, q, allQ, src, corner = "" }) {
  let h = `<div class="qwrap"><h3>${title}</h3><div class="scroll"><table class="qt"><thead><tr><th>${corner}</th>${colHeads.map((x, c) => `<th class="num${c === hc ? " hl" : ""}">${x}</th>`).join("")}</tr></thead><tbody>`;
  vals.forEach((row, r) => {
    h += `<tr><th class="${r === hr ? "hl" : ""}">${rowHeads[r]}</th>` + row.map((t, c) => {
      const cl = [r === hr && c === hc ? "hit" : (r === hr || c === hc) ? "hl" : ""];
      if (t === undefined) return `<td class="num unk ${cl}">不明</td>`;
      if (q && q.has(`${r}-${c}`)) cl.push("q");
      return `<td class="num ${cl.join(" ")}">${t === null ? "—" : fmt(t)}</td>`;
    }).join("") + `</tr>`;
  });
  return h + `</tbody></table></div>${src ? `<p class="src">${allQ ? "<b>△</b> " : ""}${src}</p>` : ""}</div>`;
}
const rules = items => `<ul class="rules">${items.map(t => `<li>${t}</li>`).join("")}</ul>`;

// 条件の部品
const segUI = (key, label, opts, cur, mono) => `<div class="field" data-wrap="${key}"><span class="nm">${label}</span><div class="seg${mono ? " mono" : ""}" role="group" aria-label="${label}">${opts.map(([v, t, title]) => `<button type="button" data-seg="${key}" data-v="${v}" aria-pressed="${String(v) === String(cur)}"${title ? ` title="${title}"` : ""}>${t}</button>`).join("")}</div></div>`;
const selUI = (key, label, opts, cur) => `<div class="field" data-wrap="${key}"><label class="lb" for="c-${key}">${label}</label><select id="c-${key}" data-c="${key}">${opts.map(([v, t]) => `<option value="${v}"${String(v) === String(cur) ? " selected" : ""}>${t}</option>`).join("")}</select></div>`;
const txtUI = (key, label, cur, hint) => `<div class="field" data-wrap="${key}"><label class="lb" for="c-${key}">${label}</label><input type="text" inputmode="decimal" id="c-${key}" data-c="${key}" value="${esc(cur ?? "")}">${hint ? `<p class="hint">${hint}</p>` : ""}</div>`;
const chkUI = (key, label, cur) => `<label class="chk" data-wrap="${key}"><input type="checkbox" id="c-${key}" data-c="${key}"${cur ? " checked" : ""}>${label}</label>`;
const hint = t => `<p class="hint">${t}</p>`;

// =====================================================================
// 規格の定義
// =====================================================================
const LC = ["f", "m", "c", "v"], LCN = { f: "精級", m: "中級", c: "粗級", v: "極粗級" };

function geoVal(T, L, g) { const i = idx(L, T.his); return i < 0 ? null : nat(T[g][i]); }
const card = (t, v, s) => `<div class="card"><span class="t">${t}</span><span class="v${v === null ? " na" : ""}">${v === null ? "規定なし" : v}</span>${s ? `<span class="s">${s}</span>` : ""}</div>`;

// 板厚の表を引く（GL 型・GE 型共通）
function thkLookup(T, p, w, nRows) {
  const isGL = !!T.tH;
  nRows = nRows || T.v.length;
  const tMax = nRows < T.v.length ? T.tL[nRows] : T.tMax;
  if (isNaN(w)) return { err: ng("幅を数値で入れてください。", "幅を入れる") };
  const c = isGL ? idx(w, T.wH) : idxGE(w, T.wL, T.wMax, T.wMaxOpen);
  const r = isGL ? (T.tMin !== undefined && p.val < T.tMin - 1e-9 ? -1 : idx(p.val, T.tH)) : idxGE(p.val, T.tL, tMax);
  const base = { r: r < nRows ? r : -1, c, tMax, nRows };
  if (c < 0) return Object.assign(base, { err: ng(`幅 ${grp(String(w))} mm は表の範囲外です。`, "幅が範囲外") });
  if (r < 0 || r >= nRows) return Object.assign(base, { err: ng("この厚さは表の範囲外です。", "範囲外") });
  const t = T.v[r][c];
  if (t === undefined) return Object.assign(base, { err: ng("この欄の値は資料で確かめられていません。", "不明") });
  if (t === null) return Object.assign(base, { err: ng("この厚さと幅の組合せは規格に値がありません。", "値なし") });
  return Object.assign(base, { t, warn: T.allQ ? T.src : (T.q && T.q.has(`${r}-${c}`)) ? "資料によって値が食い違う欄です。" : "" });
}
function thkTable(T, L, nRows) {
  const isGL = !!T.tH; nRows = nRows || T.v.length;
  const tMax = nRows < T.v.length ? T.tL[nRows] : T.tMax;
  const rowHeads = isGL ? glHeads(T.tH, T.tMin) : geHeads(T.tL.slice(0, nRows), tMax, T.tHeadsFirst);
  return grid({ title: T.title + "（±mm）", corner: "厚さ \\ 幅", rowHeads, colHeads: T.wHeads, vals: T.v.slice(0, nRows), hr: L ? L.r : -1, hc: L ? L.c : -1, q: T.q, allQ: T.allQ, src: T.src });
}

const matShort = i => { const n = DIN_MAT[i][0]; const g = n.match(/^グループ (\d+)/); return g ? "G" + g[1] : n.split(/ \/ |（|、/)[0] + (/ \/ |、/.test(n) ? " ほか" : ""); };
const STDS = [
  // ---------------- 機械加工 ----------------
  { id: "mach", group: "普通公差", name: "機械加工", sub: "JIS B 0405 / B 0419",
    def: { lin: "m", geo: "K", side: "" }, stripKeys: ["lin"],
    brief: c => `${c.lin} 級・幾何 ${c.geo}`,
    ui: c => segUI("lin", "JIS B 0405 の公差等級", LC.map(x => [x, x, LCN[x]]), c.lin, true) + segUI("geo", "JIS B 0419 の公差等級", ["H", "K", "L"].map(x => [x, x]), c.geo, true) +
      txtUI("side", "角度の短い方の辺の長さ [mm]", c.side, "角度の普通公差は、角度をはさむ短い方の辺の長さで決まります。"),
    show: (p) => ({ side: p && p.type === "ang" }),
    solve(p, c) {
      const e = baseErr(p, true); if (e) return e;
      const desig = `JIS B 0405-${c.lin}　／　幾何も含めるとき JIS B 0419-${c.lin}${c.geo}`;
      if (p.type === "ang") {
        const side = num(c.side);
        if (!(side > 0)) return ng("角度の短い方の辺の長さを入れてください。", "辺の長さが必要", { desig });
        const i = idx(side, ANG.his), t = ANG[c.lin][i];
        return { ok: true, tolStr: "±" + minStr(t), lo: dms(p.val - t / 60), hi: dms(p.val + t / 60), i, desig, L: side,
          strip: LC.map(x => ({ label: `${x}（${LCN[x]}）`, val: "±" + minStr(ANG[x][i]), set: { lin: x }, on: x === c.lin })) };
      }
      const T = p.type === "ch" ? CH : LIN;
      if (p.val < 0.5) return ng("0.5 mm 未満は普通公差の範囲外です。個々に公差を指示します。", "0.5未満は個別", { desig, L: p.val });
      const i = idx(p.val, T.his);
      if (i < 0) return ng("4000 mm を超える寸法は表にありません。個々に公差を指示します。", "範囲外", { desig, L: p.val });
      const strip = LC.map(x => ({ label: `${x}（${LCN[x]}）`, val: T[x][i] === null ? "—" : "±" + nat(T[x][i]), set: { lin: x }, on: x === c.lin }));
      const t = T[c.lin][i];
      if (t === null) return ng(`等級 ${c.lin} にはこの範囲の値がありません。等級を変えるか個々に公差を指示します。`, `${c.lin} は値なし`, { desig, i, strip, L: p.val });
      return pm(p, t, { i, desig, strip, L: p.val });
    },
    extra(p, c, R) {
      const L = R.L; if (!(L > 0)) return "";
      return `<div class="sub"><h3>この長さ（${grp(String(L))} mm）で決まる普通幾何公差　JIS B 0419-${c.geo}</h3><div class="cards">
        ${card("真直度・平面度", geoVal(ST, L, c.geo), "線の長さ、平面は長い方の辺（円形は直径）")}
        ${card("直角度", geoVal(PE, L, c.geo), "この長さを短い方の辺とした値。長い方をデータムにとる")}
        ${card("対称度", geoVal(SY, L, c.geo), "長い方の形体をデータムにとる")}
        ${card("円周振れ", nat(RO[c.geo]), "長さによらない一定値")}
        ${p.type !== "ang" ? card("角度（JIS B 0405-" + c.lin + "）", "±" + minStr(ANG[c.lin][idx(L, ANG.his)]), "この長さを角度の短い方の辺とした値") : ""}
      </div>${rules(["真円度：直径の寸法公差の値以下。ただし円周振れ公差を超えない。", "平行度：寸法公差と、真直度または平面度のうち大きい方。長い方の形体をデータムにとる。", "円筒度・同軸度・位置度など表にない特性は、普通幾何公差では規定しないので、必要なら個々に指示します。"])}</div>`;
    },
    tables(p, c, R) {
      const L = R.L;
      const mk = (title, T, cls, fmt, hc, cur) => grid({ title, rowHeads: cls, colHeads: T.heads, vals: cls.map(x => T[x]), hr: cls.indexOf(cur), hc, fmt, corner: "等級" });
      const gc = ["H", "K", "L"], gI = T => (L > 0) ? idx(L, T.his) : -1;
      const main = !p || p.type === "lin" || p.type === "bad"
        ? mk("JIS B 0405 長さ寸法（面取り部分を除く）", LIN, LC, t => "±" + nat(t), p && p.type === "lin" && R.i !== undefined ? R.i : -1, c.lin)
        : p.type === "ch" ? mk("JIS B 0405 面取り部分の長さ寸法（かどの丸み・かどの面取り）", CH, LC, t => "±" + nat(t), R.i ?? -1, c.lin)
        : mk("JIS B 0405 角度寸法（短い方の辺の長さ）", ANG, LC, t => "±" + minStr(t), R.i ?? -1, c.lin);
      return main +
        mk("JIS B 0419 真直度・平面度", ST, gc, nat, gI(ST), c.geo) + mk("JIS B 0419 直角度（短い方の辺の長さ）", PE, gc, nat, gI(PE), c.geo) +
        mk("JIS B 0419 対称度", SY, gc, nat, gI(SY), c.geo) +
        grid({ title: "JIS B 0419 円周振れ", rowHeads: gc, colHeads: ["公差"], vals: gc.map(x => [RO[x]]), hr: gc.indexOf(c.geo), hc: 0, corner: "等級",
          src: "JIS B 0405:1991（ISO 2768-1）、JIS B 0419:1991（ISO 2768-2）。表の値は規格の内容から起こしたもので、規格票との照合はまだです。" });
    } },

  // ---------------- 樹脂成形品 ----------------
  { id: "din", group: "普通公差", name: "樹脂成形品", sub: "DIN 16901 一般公差",
    def: { mat: 0, ab: "B", thick: false }, stripKeys: [],
    brief: c => `${matShort(c.mat)}・${c.ab}${c.thick ? "・厚肉" : ""}`,
    ui: c => selUI("mat", "材料（公差グループ）", DIN_MAT.map(([n, g], i) => [i, `${n}（${g}）`]), c.mat) +
      segUI("ab", "寸法の種類", [["B", "B：型で決まる"], ["A", "A：型をまたぐ"]], c.ab) +
      hint("B は 1 つの型部品の中で決まる寸法。A は肉厚・底厚、スライドや突き出しなど型の可動部で決まる寸法で、B より 0.10 mm 広くなります。") +
      chkUI("thick", "無強化の結晶性樹脂で、肉厚が 4 mm を超える（1 つ上のグループを使う）", c.thick),
    solve(p, c) {
      const base = DIN_MAT[c.mat][1], g = c.thick ? base + 10 : base;
      const desig = g > 160 ? `グループ ${base} の 1 つ上は表にありません` : `DIN 16901 公差グループ ${g}・寸法の種類 ${c.ab}${c.thick ? `（${base} から 1 つ上げた）` : ""}`;
      const e = baseErr(p); if (e) return Object.assign(e, { desig });
      if (g > 160) return ng("グループ 160 より上の一般公差は規格にありません。", "値なし", { desig });
      const i = idx(p.val, DIN.his);
      if (i < 0) return ng("1000 mm を超える寸法は表にありません。", "範囲外", { desig });
      const add = c.ab === "A" ? 0.10 : 0;
      const strip = [130, 140, 150, 160].map(x => ({ label: `グループ ${x}`, val: "±" + (DIN.B[x][i] + add).toFixed(2), set: { mat: DIN_MAT.findIndex(m => m[0] === `グループ ${x} を直接選ぶ`), thick: false }, on: x === g }));
      const warn = DIN.fixed.has(`${g}-${i}`) ? "スキャンの読み違いを A − B = 0.10 の関係と前後の値で直した値です。" : g !== 130 ? "グループ 140〜160 の値は 1 資料（スキャン）から起こし、A − B = 0.10 の関係で確かめています。" : "";
      return pm(p, DIN.B[g][i] + add, { i, g, desig, strip, warn });
    },
    tables(p, c, R) {
      const g = R.g || DIN_MAT[c.mat][1];
      const rowsG = [130, 140, 150, 160].flatMap(x => [[x, "B"], [x, "A"]]);
      const q = new Set(); rowsG.forEach(([x], ri) => DIN.heads.forEach((_, k) => { if (DIN.fixed.has(`${x}-${k}`)) q.add(`${ri}-${k}`); }));
      return grid({ title: "DIN 16901 表2 一般公差（±mm）", corner: "グループ", rowHeads: rowsG.map(([x, ab]) => `${x} ${ab}`), colHeads: DIN.heads,
        vals: rowsG.map(([x, ab]) => DIN.B[x].map(t => +(t + (ab === "A" ? 0.10 : 0)).toFixed(2))), hr: rowsG.findIndex(([x, ab]) => x === g && ab === c.ab), hc: R.ok ? R.i : -1, fmt: t => t.toFixed(2), q,
        src: "DIN 16901:1982（廃止。DIN は後継に DIN 16742 を挙げる）。グループ 130 は 4 資料で一致。140〜160 は公式英訳のスキャン 1 資料から起こし、点線の下線は読み違いを直したセル。140 は別の 1 資料とも照合。直接記入する公差（110〜160 の全幅）は読み取りの誤りが多いため載せていません。" }) +
        rules(["材料と公差グループの対応は DIN 16901 表1 の「一般公差」の列によります。UF/MF 無機充塡は資料で食い違うため外しました。", "表1 の注記：無強化の結晶性樹脂で肉厚が 4 mm を超える場合は 1 つ上のグループを使います。"]);
    } },

  // ---------------- 鋳造品 ----------------
  { id: "cast", group: "普通公差", name: "鋳造品", sub: "JIS B 0403（ISO 8062）",
    def: { ct: 9, wall: false }, stripKeys: [],
    brief: c => `CT${c.ct}${c.wall ? "・肉厚" : ""}`,
    ui: c => selUI("ct", "鋳造公差等級（CT）", Array.from({ length: 16 }, (_, i) => [i + 1, "CT" + (i + 1)]), c.ct) +
      chkUI("wall", "肉厚の寸法（指定した等級より 1 つ粗い等級を使う）", c.wall) +
      hint("表の値は公差の全幅です。特に指示がなければ、呼び寸法の上下に半分ずつ振り分けます。等級の目安は早見表の下にあります。"),
    solve(p, c) {
      const ct = +c.ct, g = c.wall ? ct + 1 : ct;
      const desig = g > 16 ? "CT16 より粗い等級はありません" : `JIS B 0403 CT${g}${c.wall ? `（肉厚のため CT${ct} から 1 つ粗く）` : ""}`;
      const e = baseErr(p); if (e) return Object.assign(e, { desig });
      if (g > 16) return ng("CT16 より粗い等級はありません。CT16 は通常、CT15 を指定した鋳造品の肉厚だけに使います。", "値なし", { desig });
      const i = idx(p.val, CT.his);
      if (i < 0) return ng("10000 mm を超える寸法は表にありません。", "範囲外", { desig });
      const lo = Math.max(1, ct - 2), hi = Math.min(16 - (c.wall ? 1 : 0), lo + 4);
      const strip = []; for (let b = Math.max(1, hi - 4); b <= hi; b++) { const v = CT.v[i][b - 1 + (c.wall ? 1 : 0)]; strip.push({ label: "CT" + b, val: v === null ? "—" : "±" + nat(v / 2), set: { ct: b }, on: b === ct }); }
      const tot = CT.v[i][g - 1];
      if (tot === null) return ng(g >= 13 && p.val <= 16 ? "CT13〜CT16 は 16 mm 以下の寸法に適用しません。個々に公差を指示します。" : `CT${g} にはこの寸法範囲の値がありません。`, "値なし", { desig, i, g, strip });
      return pm(p, tot / 2, { i, g, desig, strip, sub2: `公差の全幅 ${nat(tot)} mm` });
    },
    tables(p, c, R) {
      const g = R.g || (+c.ct + (c.wall ? 1 : 0));
      return grid({ title: "JIS B 0403 表1 鋳造公差（全幅 mm）", corner: "寸法 \\ 等級", rowHeads: CT.heads, colHeads: CT.v[0].map((_, k) => "CT" + (k + 1)), vals: CT.v,
        hr: R.i ?? -1, hc: g <= 16 ? g - 1 : -1, src: "JIS B 0403:1995（2014年に正誤票、数値の変更なし）。日本ベアリング（NBK）の抜粋と ISO 8062 を引く資料の、同じ数値の並びを表に組み直したもの。" }) +
        rules(["肉厚には、指定した等級より 1 つ粗い等級を使います（CT1〜CT15）。", "CT13〜CT16 の値は 16 mm 以下の寸法には適用しません。CT16 は通常、CT15 を指定した鋳造品の肉厚だけに使います。"]) +
        grid({ title: "公差等級の目安：長期間製造する鋳放し鋳造品（附属書 B）", corner: "鋳造方法", rowHeads: CT_GUIDE.rows.map(x => x[0]), colHeads: CT_GUIDE.cols, vals: CT_GUIDE.rows.map(x => x[1]), fmt: t => "CT" + t,
          q: new Set(CT_GUIDE.rows.flatMap((x, ri) => x[2] ? x[1].map((_, k) => `${ri}-${k}`) : [])),
          src: "砂型の 2 行は 2 資料で一致。点線の下線の金型・ダイカストの行は 1 資料だけ。精密鋳造（ロストワックス）の行は資料によって分け方が違うため載せていません。" });
    } },

  // ---------------- ゴム製品 ----------------
  { id: "rub", group: "普通公差", name: "ゴム製品", sub: "ISO 3302-1",
    def: { mode: "M", cls: "M2", fc: "F" }, stripKeys: ["cls"],
    brief: c => `${{ M: "成形品", E: "押出断面", L: "切断長さ" }[c.mode]}・${rubKey(c).replace(/([FC])$/, " $1")}`,
    ui: c => segUI("mode", "製品", [["M", "成形品"], ["E", "押出（断面）"], ["L", "押出（切断長さ）"]], c.mode) +
      segUI("cls", "等級", RUB_CLS[c.mode].map(x => [x, x]), c.cls, true) +
      (c.mode === "M" && c.cls !== "M4" ? segUI("fc", "寸法の種類", [["F", "F：固定寸法"], ["C", "C：型締め寸法"]], c.fc) +
        hint("F は型の 1 つの部分で決まる寸法。C はパーティングをまたぐ厚さなど、型締めで変わる寸法です。M4 は F と C が同じ値です。") : "") +
      hint("VDI 2005（ゴム部品）は、許容差の表を確かめられる資料が見つからなかったため載せていません。"),
    solve(p, c) {
      const T = rubT(c), key = rubKey(c);
      const desig = `ISO 3302-1 ${key}`;
      const e = baseErr(p); if (e) return Object.assign(e, { desig });
      const i = idx(p.val, T.his);
      const val = k => i < 0 ? p.val * T.pct[k] / 100 : T[k][i];
      const strip = RUB_CLS[c.mode].map(x => { const k = c.mode === "M" ? (x === "M4" ? "M4" : x + c.fc) : x; return { label: x, val: "±" + nat(+val(k).toFixed(3)), set: { cls: x }, on: x === c.cls }; });
      if (i < 0) return pm(p, +val(key).toFixed(4), { i: -1, desig, strip, sub2: `表の最後の範囲を超えるため、呼び寸法の ${T.pct[key]}% として計算`, warn: c.mode === "E" ? "100 mm を超える断面の % は 1 資料だけで確かめた値です。" : "" });
      return pm(p, T[key][i], { i, desig, strip });
    },
    tables(p, c, R) {
      const T = rubT(c), key = rubKey(c), isM = c.mode === "M";
      const keys = isM ? ["M1F", "M1C", "M2F", "M2C", "M3F", "M3C", "M4"] : RUB_CLS[c.mode];
      return grid({ title: isM ? "ISO 3302-1 成形品（±mm）" : c.mode === "E" ? "ISO 3302-1 押出品の断面・支持なし（±mm）" : "ISO 3302-1 押出品の切断長さ（±mm）",
        corner: "等級", rowHeads: keys.map(k => k.replace(/([FC])$/, " $1")), colHeads: T.heads.concat([`${T.his[T.his.length - 1]}超`]),
        vals: keys.map(k => T[k].concat([T.pct[k] + "%"])), fmt: t => typeof t === "string" ? t : nat(t), hr: keys.indexOf(key), hc: R.ok ? (R.i < 0 ? T.his.length : R.i) : -1,
        src: isM ? "ISO 3302-1:2014。3 資料（1996年版を名乗るものを含む）で一致。最後の列は呼び寸法に掛ける割合。" : c.mode === "E" ? "ISO 3302-1:2014。3 資料で一致。100 mm 超の割合は 1 資料だけ。" : "ISO 3302-1:2014。3 資料で一致。4000 mm 超は呼び寸法に掛ける割合。" });
    } },

  // ---------------- 冷間圧延鋼板 ----------------
  { id: "g3141", group: "板厚・肉厚", name: "冷延鋼板", sub: "JIS G 3141（SPCC など）",
    def: { tbl: "A", w: "1000" }, stripKeys: ["tbl"], thick: true,
    brief: c => `表 ${c.tbl}・幅 ${c.w || "?"}`,
    ui: c => segUI("tbl", "表", [["A", "表15 A（圧延幅 600 以上）"], ["B", "表16 B（圧延幅 600 未満）"]], c.tbl) + txtUI("w", "幅 [mm]", c.w) +
      hint("厚さは幅方向の端から 15 mm 以上内側の任意の点で測ります。"),
    solve(p, c) {
      const T = c.tbl === "A" ? G3141A : G3141B, desig = c.tbl === "A" ? "JIS G 3141 表15 厚さの許容差 A" : "JIS G 3141 表16 厚さの許容差 B";
      const e = baseErr(p); if (e) return Object.assign(e, { desig });
      const w = num(c.w), L = thkLookup(T, p, w);
      const strip = [["A", G3141A], ["B", G3141B]].map(([k, X]) => { const y = thkLookup(X, p, w); return { label: `表 ${k}`, val: y.err ? "—" : "±" + nat(y.t), set: { tbl: k }, on: k === c.tbl }; });
      if (L.err) return Object.assign(L.err, { desig, L, strip });
      return pm(p, L.t, { desig, L, strip, warn: L.warn });
    },
    tables: (p, c, R) => thkTable(c.tbl === "A" ? G3141A : G3141B, R.L) },

  // ---------------- 冷間圧延ステンレス鋼板 ----------------
  { id: "g4305", group: "板厚・肉厚", name: "ステンレス鋼板", sub: "JIS G 4305 冷間圧延",
    def: { form: "plate", grade: "std", w: "1000" }, stripKeys: ["grade"], thick: true,
    brief: c => `${c.form === "strip" ? "帯" : "板"}・${c.grade === "ET" ? "ET" : "標準"}・幅 ${c.w || "?"}`,
    ui: c => segUI("form", "形状", [["plate", "板"], ["strip", "帯"]], c.form) + segUI("grade", "許容差", [["std", "標準"], ["ET", "記号 ET（注文者が指定）"]], c.grade) + txtUI("w", "幅 [mm]", c.w) +
      hint("板は端から 15 mm 以上内側。帯は耳付きで幅 50 以上なら 25 mm 以上内側、切断縁で幅 30 以上なら 15 mm 以上内側、それより狭いものは幅の中央で測ります（2015年版 9.3.1）。記号 ST の表は値が見つからず載せていません。"),
    solve(p, c) {
      const strip0 = c.form === "strip";
      const T = c.grade === "ET" ? G4305ET : G4305STD, n = (T === G4305STD && strip0) ? 14 : 0;
      const desig = `JIS G 4305 ${c.grade === "ET" ? "記号 ET" : "標準"}・${strip0 ? "帯" : "板"}の厚さの許容差`;
      const e = baseErr(p); if (e) return Object.assign(e, { desig });
      const w = num(c.w), L = thkLookup(T, p, w, n);
      const strip = [["std", "標準", G4305STD], ["ET", "ET", G4305ET]].map(([k, lab, X]) => { const y = thkLookup(X, p, w, X === G4305STD && strip0 ? 14 : 0); return { label: lab, val: y.err ? "—" : "±" + nat(y.t), set: { grade: k }, on: k === c.grade }; });
      if (L.err) return Object.assign(L.err, { desig, L, strip });
      return pm(p, L.t, { desig, L, strip, warn: L.warn });
    },
    tables(p, c, R) { const T = c.grade === "ET" ? G4305ET : G4305STD; return thkTable(T, R.L, T === G4305STD && c.form === "strip" ? 14 : 0); } },

  // ---------------- アルミニウム板 ----------------
  { id: "h4000", group: "板厚・肉厚", name: "アルミ板", sub: "JIS H 4000",
    def: { roll: "c", grp: "1", w: "1000" }, stripKeys: ["grp"], thick: true,
    brief: c => `${c.roll === "c" ? "冷間" : "熱間"}・その${c.grp}・幅 ${c.w || "?"}`,
    ui: c => segUI("roll", "圧延", [["c", "冷間圧延材"], ["h", "熱間圧延材"]], c.roll) +
      selUI("grp", "合金の区分", [["1", "その1（1000系・3003・5005 など）"], ["2", "その2（5052・6061・7075 など）"]], c.grp) + txtUI("w", "幅 [mm]", c.w) +
      hint(`合金の区分（1999年版）　その1：${H4000_G[1]}　／　その2：${H4000_G[2]}`),
    solve(p, c) {
      const T = h4000T(c), desig = T ? T.title.replace("の厚さの許容差", "") : "JIS H 4000 熱間圧延材（その2）";
      const e = baseErr(p); if (e) return Object.assign(e, { desig });
      const w = num(c.w);
      const strip = [["1", "その1"], ["2", "その2"]].map(([k, lab]) => { const X = h4000T(Object.assign({}, c, { grp: k })); const y = X && thkLookup(X, p, w); return { label: lab, val: !y || y.err ? "—" : "±" + nat(y.t), set: { grp: k }, on: k === c.grp }; });
      if (!T) return ng("熱間圧延材（その2）は 2017年の追補で表が差し替わり、新しい値を確かめられる資料が見つからなかったため載せていません。", "未収録", { desig, strip });
      const L = thkLookup(T, p, w);
      if (L.err) return Object.assign(L.err, { desig, L, strip });
      return pm(p, L.t, { desig, L, strip, warn: L.warn, sub2: "片側だけの許容差にするときは、表の値の 2 倍を片側に振ります。" });
    },
    tables(p, c, R) { const T = h4000T(c); return T ? thkTable(T, R.L) : ""; } },

  // ---------------- アルミニウム押出形材 ----------------
  { id: "h4100", group: "板厚・肉厚", name: "アルミ押出形材", sub: "JIS H 4100 肉厚",
    def: { grp: "1", grade: "n", d: "120", part: "solid" }, stripKeys: ["grade", "grp"], thick: true,
    brief: c => `${c.grade === "s" ? "特殊級" : "普通級"}・G${c.grp}・外接円 ${c.d || "?"}${c.part === "hollow" ? "・中空" : ""}`,
    ui: c => selUI("grp", "合金グループ", [["1", "グループ1（6063・6061・5052 など）"], ["2", "グループ2（5083・2017・7075 など）"]], c.grp) +
      segUI("grade", "等級", [["n", "普通級"], ["s", "特殊級"]], c.grade) + txtUI("d", "外接円の直径 [mm]", c.d) +
      segUI("part", "肉厚の部位", [["solid", "中実部（金属部）"], ["hollow", "中空部を囲む肉厚"]], c.part) +
      hint("中空部を囲む肉厚は、向かい合う 2 つの肉厚の平均に対する割合で、上下の限りがあります。片方の肉厚が他方の 3 倍以上（偏肉）のときは表を使いません。") +
      hint(`グループ1：${H4100.g1}　／　グループ2：${H4100.g2}`),
    solve(p, c) {
      const col = (c.grade === "s" ? 2 : 0) + (c.grp === "2" ? 1 : 0);
      const desig = `JIS H 4100 ${c.grade === "s" ? "特殊級" : "普通級"}・合金グループ${c.grp}・${c.part === "hollow" ? "中空部を囲む肉厚" : "中実部"}`;
      const e = baseErr(p); if (e) return Object.assign(e, { desig });
      const d = num(c.d);
      if (!(d > 0)) return ng("外接円の直径を数値で入れてください。", "直径を入れる", { desig });
      if (d > 800) return ng("外接円の直径が 800 mm を超えるものは表にありません。", "範囲外", { desig });
      const band = d <= 250 ? "s250" : "s800";
      const cols = ["普通級 G1", "普通級 G2", "特殊級 G1", "特殊級 G2"];
      const val = k => {
        if (c.part === "hollow") { const [pc, mn, mx] = H4100.hollow[band][k]; return Math.min(mx, Math.max(mn, p.val * pc / 100)); }
        const r = idx(p.val, H4100.solid[band].tH); return r < 0 ? null : H4100.solid[band].v[r][k];
      };
      const strip = cols.map((lab, k) => ({ label: lab, val: val(k) === null ? "—" : "±" + nat(+val(k).toFixed(3)), set: { grade: k >= 2 ? "s" : "n", grp: k % 2 ? "2" : "1" }, on: k === col }));
      const r = idx(p.val, H4100.solid[band].tH);
      if (c.part === "hollow") { const [pc, mn, mx] = H4100.hollow[band][col]; return pm(p, +val(col).toFixed(4), { desig, strip, band, col, r: -1, sub2: `平均の肉厚の ±${pc}% を、${mn}〜${mx} mm で制限` }); }
      if (r < 0) return ng("この肉厚は表の範囲外です。", "範囲外", { desig, strip, band, col });
      return pm(p, val(col), { desig, strip, band, col, r });
    },
    tables(p, c, R) {
      const d = num(c.d); if (!(d > 0) || d > 800) return "";
      const band = d <= 250 ? "s250" : "s800", col = (c.grade === "s" ? 2 : 0) + (c.grp === "2" ? 1 : 0);
      const cols = ["普通級 G1", "普通級 G2", "特殊級 G1", "特殊級 G2"];
      if (c.part === "hollow") return grid({ title: "JIS H 4100 中空部を囲む肉厚の許容差（3欄）", corner: "外接円", rowHeads: ["250以下", "250超〜800"], colHeads: cols,
        vals: ["s250", "s800"].map(b => H4100.hollow[b].map(([pc, mn, mx]) => `±${pc}%（${mn}〜${mx}）`)), fmt: t => t, hr: band === "s250" ? 0 : 1, hc: col, src: H4100.src });
      const S = H4100.solid[band];
      return grid({ title: `JIS H 4100 中実部の寸法の許容差（2欄、外接円 ${band === "s250" ? "250 以下" : "250 超 800 以下"}、±mm）`, corner: "寸法 \\ 等級", rowHeads: glHeads(S.tH), colHeads: cols, vals: S.v, hr: R.r ?? -1, hc: col, src: H4100.src });
    } }
];
const RUB_CLS = { M: ["M1", "M2", "M3", "M4"], E: ["E1", "E2", "E3"], L: ["L1", "L2", "L3"] };
const rubT = c => c.mode === "M" ? R_M : c.mode === "E" ? R_E : R_L;
const rubKey = c => c.mode === "M" ? (c.cls === "M4" ? "M4" : c.cls + c.fc) : c.cls;
const h4000T = c => c.roll === "c" ? (c.grp === "1" ? H4000.c1 : H4000.c2) : (c.grp === "1" ? H4000.h1 : null);
const S = id => STDS.find(s => s.id === id);

// =====================================================================
// 状態（端末内に保存）
// =====================================================================
const KEY = "gentol-calc-v2";
const st = { dim: "25", kind: "lin", std: "mach", c: {} };
try { const s = JSON.parse(localStorage.getItem(KEY) || "{}"); if (typeof s.dim === "string") st.dim = s.dim; if (KIND[s.kind]) st.kind = s.kind; if (S(s.std)) st.std = s.std; if (s.c) st.c = s.c; } catch (e) { /* 保存できない環境 */ }
for (const s of STDS) st.c[s.id] = Object.assign({}, s.def, st.c[s.id] || {});
if (!RUB_CLS[st.c.rub.mode] || !RUB_CLS[st.c.rub.mode].includes(st.c.rub.cls)) Object.assign(st.c.rub, S("rub").def);
if (!DIN_MAT[st.c.din.mat]) st.c.din.mat = 0;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 無視 */ } };

// =====================================================================
// 描画
// =====================================================================
let last = null; // 直近の結果（コピー用）
const mq = q => !!(window.matchMedia && window.matchMedia(q).matches);
const narrow = () => mq("(max-width: 899px)");
const reduce = () => mq("(prefers-reduced-motion: reduce)");

function renderPick(p) {
  const groups = [...new Set(STDS.map(s => s.group))];
  $("#pick").innerHTML = groups.map(g => `<div class="field"><span class="nm">${g}</span><div class="pick">${STDS.filter(s => s.group === g).map(s => {
    const c = st.c[s.id], R = p ? s.solve(p, c) : null;
    const v = !p ? `<span class="pv na">—</span>` : R.ok ? `<span class="pv">${R.tolStr}${R.warn ? '<span class="flag" title="照合が足りない値">△</span>' : ""}</span>` : `<span class="pv na">${esc(R.short)}</span>`;
    const off = p && !R.ok;
    return `<button type="button" data-std="${s.id}" aria-pressed="${s.id === st.std}" class="${off ? "off" : ""}"><span class="pn">${s.name}</span>${v}<span class="ps">${esc(s.brief(c))}</span></button>`;
  }).join("")}</div></div>`).join("");
}

function renderConds() {
  const s = S(st.std);
  $("#conds").innerHTML = s.ui(st.c[s.id]);
}

function renderResult(p) {
  const s = S(st.std), c = st.c[s.id];
  $("#resTitle").textContent = `結果：${s.name}`;
  $("#resSub").textContent = s.sub;
  let R = p ? s.solve(p, c) : null;
  // 条件の欄のうち、等級の切り替えボタンで代わるものと、今は使わないものを隠す
  const hide = new Set(R && R.strip && R.strip.length ? (s.stripKeys || []) : []);
  if (s.show) for (const [k, v] of Object.entries(s.show(p))) if (!v) hide.add(k);
  $$("#conds [data-wrap]").forEach(w => w.hidden = hide.has(w.dataset.wrap));
  $("#condsHead").hidden = !$$("#conds [data-wrap]").some(w => !w.hidden);
  if (!p) {
    $("#resTop").innerHTML = `<p class="hint">上の欄に寸法を入れてください。</p>`; $("#resBottom").innerHTML = "";
    $("#tables").innerHTML = s.tables(null, c, {}); last = null; return;
  }
  const dimStr = p.type === "ang" ? dms(p.val) : p.type === "bad" ? esc(p.raw) : esc((p.pre || "") + fx(p.val, decOf(p.str)));
  let h = "";
  if (R.ok) h += `<div class="hero"><span class="big">${dimStr}<small>${R.tolStr}</small></span><span class="lim">${R.lo} 〜 ${R.hi}</span>${R.sub2 ? `<span class="sub2">${R.sub2}</span>` : ""}</div>`;
  else h += `<div class="hero"><span class="big">${dimStr}</span></div><div class="msg warn"><span aria-hidden="true">! </span>${esc(R.note)}</div>`;
  if (R.desig) h += `<div class="desig">${R.desig}</div>`;
  if (R.ok && R.warn) h += `<div class="msg warn"><span aria-hidden="true">△ </span>${esc(R.warn)} 図面や受入判定に使う前に規格票で確かめてください。</div>`;
  if (R.strip && R.strip.length) h += `<h3>等級・区分（押すと切り替わります）</h3><div class="strip">${R.strip.map((x, i) => `<button type="button" data-strip="${i}" aria-pressed="${!!x.on}"><b>${x.label}</b>${x.val}</button>`).join("")}</div>`;
  $("#resTop").innerHTML = h;
  $("#resBottom").innerHTML = (R.ok ? `<div class="row"><button class="btn" type="button" id="copyBtn">結果をコピー（Excel 用）</button></div>` : "") + (s.extra ? s.extra(p, c, R) : "");
  $("#tables").innerHTML = s.tables(p, c, R);
  last = { s, p, R };
}

function update() {
  const p = parse(st.dim, st.kind);
  $("#dim").classList.toggle("bad", !!p && p.type === "bad");
  // 記号を打って入れたときは、種類のボタンもそれに合わせる
  const k = p && p.typed ? p.type : st.kind;
  $$("#kind button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === k));
  $("#dimNote").textContent = !p ? "" : p.type === "bad" ? "数値として読めません" : p.typed && p.type !== st.kind ? `記号から「${KIND[p.type]}」として読みました` : "";
  renderPick(p); renderResult(p); save();
}
const full = () => { renderConds(); update(); };
const toResult = () => { if (narrow() && $("#step3").scrollIntoView) $("#step3").scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "start" }); };

// =====================================================================
// 操作
// =====================================================================
$("#dim").value = st.dim;
$("#dim").addEventListener("input", e => { st.dim = e.target.value; update(); });
$("#kind").addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (!b) return; st.kind = b.dataset.v; const p = parse(st.dim); if (p && p.typed) { st.dim = p.str; $("#dim").value = st.dim; } update(); });
$("#pick").addEventListener("click", e => { const b = e.target.closest("[data-std]"); if (!b) return; st.std = b.dataset.std; full(); toResult(); });
$("#conds").addEventListener("click", e => {
  const b = e.target.closest("[data-seg]"); if (!b) return;
  const c = st.c[st.std]; c[b.dataset.seg] = b.dataset.v;
  if (st.std === "rub" && b.dataset.seg === "mode" && !RUB_CLS[c.mode].includes(c.cls)) c.cls = RUB_CLS[c.mode][Math.min(1, RUB_CLS[c.mode].length - 1)];
  full();
});
$("#conds").addEventListener("change", e => {
  const k = e.target.dataset.c; if (!k) return;
  st.c[st.std][k] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
  if (e.target.tagName === "SELECT" || e.target.type === "checkbox") full(); else update();
});
$("#conds").addEventListener("input", e => { const k = e.target.dataset.c; if (!k || e.target.type !== "text") return; st.c[st.std][k] = e.target.value; update(); });
$("#step3").addEventListener("click", e => {
  const b = e.target.closest("[data-strip]");
  if (b && last && last.R.strip) { Object.assign(st.c[st.std], last.R.strip[+b.dataset.strip].set); full(); return; }
  if (e.target.closest("#copyBtn")) copyResult();
});
// 早見表は狭い画面では閉じておく
if (narrow()) $("#qtDetails").open = false;

function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 1800); }
const plain = s => String(s ?? "").replace(/<[^>]+>/g, "").replace(/,/g, "").replace(/\s+/g, " ").trim();
function copyResult() {
  if (!last || !last.R.ok) return;
  const { s, p, R } = last;
  const txt = ["寸法\t規格\t条件\t公差\t下限\t上限\t備考", [p.raw, `${s.name}（${s.sub}）`, plain(R.desig), R.tolStr, plain(R.lo), plain(R.hi), plain(R.warn || R.sub2 || "")].join("\t")].join("\n");
  const fallback = () => { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (err) { } ta.remove(); toast(ok ? "コピーしました" : "コピーできませんでした"); };
  try { navigator.clipboard.writeText(txt).then(() => toast("コピーしました"), fallback); } catch (err) { fallback(); }
}

// テーマ切替（自動 → ライト → ダーク）
const themes = ["auto", "light", "dark"], tname = { auto: "自動", light: "ライト", dark: "ダーク" };
let theme = document.documentElement.dataset.theme || "auto";
const applyTheme = () => { if (theme === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; $("#themeBtn").textContent = "表示：" + tname[theme]; };
$("#themeBtn").addEventListener("click", () => { theme = themes[(themes.indexOf(theme) + 1) % 3]; try { localStorage.setItem("qc-workbench-theme", theme); } catch (e) { } applyTheme(); });
applyTheme();

full();

// オフラインで使えるように Service Worker を登録する
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { /* 登録できない環境 */ }));
}
