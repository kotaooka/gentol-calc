// 普通公差計算機：画面処理（表の引き方、一覧と早見表、入力の保存、テーマ、Service Worker の登録）
// =====================================================================
// 共通の部品
// =====================================================================
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const idx = (v, his) => his.findIndex(h => v <= h + 1e-9);                 // GL 型
const idxGE = (v, lows, max, maxOpen) => {                                   // GE 型（最後の範囲は max 以下、maxOpen なら未満）
  if (v < lows[0] - 1e-9) return -1;
  if (maxOpen ? v >= max - 1e-9 : v > max + 1e-9) return -1;
  for (let i = lows.length - 1; i >= 0; i--) if (v >= lows[i] - 1e-9) return i;
  return -1;
};
const decOf = s => { const m = String(s).match(/\.(\d+)/); return m ? m[1].length : 0; };
const grp = s => { const [i, d] = s.split("."); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d !== undefined ? "." + d : ""); };
const fx = (n, d) => grp((Math.round(n * 10 ** d) / 10 ** d).toFixed(d));
const nat = n => grp(String(+n.toFixed(4)));
const minStr = m => { const d = Math.floor(m / 60), r = Math.round(m - d * 60); return (d ? d + "°" : "") + (r ? r + "′" : (d ? "" : "0′")); };
const dms = deg => { let s = Math.round(deg * 3600); const neg = s < 0; s = Math.abs(s); const d = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (neg ? "−" : "") + d + "°" + (m || x ? m + "′" : "") + (x ? x + "″" : ""); };
const geHeads = (lows, max, first, maxOpen) => lows.map((l, i) => i === 0 && first ? first : i < lows.length - 1 ? `${l}以上${lows[i + 1]}未満` : (max === Infinity ? `${l}以上` : `${l}以上${max}${maxOpen ? "未満" : "以下"}`));
const glHeads = (his, min) => his.map((h, i) => i === 0 ? (min !== undefined ? `${min}〜${h}` : `${h}以下`) : `${his[i - 1]}超〜${h}`);

// 寸法の 1 行を読む
function parse(raw) {
  const s = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!s) return null;
  let m = s.match(/^([0-9]*\.?[0-9]+)\s*(?:°|度)\s*(?:[\/@]\s*([0-9]*\.?[0-9]+))?$/);
  if (m) return { raw: s, type: "ang", val: +m[1], side: m[2] !== undefined ? +m[2] : null };
  m = s.match(/^(?:\d+\s*[-xX×]\s*)?(SR|Sφ|SΦ|φ|Φ|ø|Ø|⌀|R|C|□|t|T|M)?\s*([0-9]*\.?[0-9]+)$/);
  if (!m) return { raw: s, type: "bad" };
  const pre = (m[1] || "").toUpperCase();
  if (pre === "M") return { raw: s, type: "thread", val: +m[2] };
  return { raw: s, type: (pre === "R" || pre === "C") ? "ch" : "lin", pre, val: +m[2], str: m[2] };
}
const readDims = id => $("#" + id).value.split(/\r?\n/).map(parse).filter(Boolean);

// ± の結果行を作る
function pmRow(p, tol, extra = {}) {
  const d = Math.max(decOf(p.str), decOf(String(+tol.toFixed(4))));
  return Object.assign({ raw: p.raw, ok: true, tol: "±" + nat(tol), lo: fx(p.val - tol, d), hi: fx(p.val + tol, d), tolNum: tol }, extra);
}
const errRow = (p, note) => ({ raw: p.raw, ok: false, note });
function commonErr(p, ang) {
  if (p.type === "bad") return "数値として読めません。";
  if (p.type === "thread") return "ねじの呼びは対象外です。";
  if (p.type === "ang" && !ang) return "角度はこのタブでは扱いません。機械加工のタブで引いてください。";
  if (p.val <= 0) return "0 より大きい値を入れてください。";
  return null;
}

// 早見表 1 枚（GL・GE 共通）。vals[r][c] が null は「—」、undefined は「不明」
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

// 一覧の描画（機械加工以外のタブ）
const sel = { din: 0, cast: 0, rub: 0, thk: 0 };
const results = {};
function listHTML(key, rows, cols) {
  return rows.map((r, k) => `<tr class="${k === sel[key] ? "sel" : ""}" data-k="${k}" tabindex="0" aria-selected="${k === sel[key]}"><td class="in">${esc(r.raw)}</td>` +
    (r.ok ? cols.map(c => `<td class="num${c === "tol" ? " tol" : ""}">${r[c]}${c === "tol" && r.warn ? `<span class="flag" title="${esc(r.warn)}">△</span>` : ""}</td>`).join("")
          : `<td colspan="${cols.length}" class="note"><span aria-hidden="true">! </span>${esc(r.note)}</td>`) + `</tr>`).join("");
}

// =====================================================================
// 状態の保存（端末内のみ）
// =====================================================================
const KEY = "gentol-calc-state";
const st = { tab: "mach", lin: "m", geo: "K", sel: 0, rows: [], dinMat: 0, dinAB: "B", dinThick: false, ct: 9, ctWall: false, rubMode: "M", rubCls: "M2", rubFC: "F", thStd: "g3141", th: {} };
try { const s = JSON.parse(localStorage.getItem(KEY) || "{}"); for (const k of ["tab", "lin", "geo", "dinMat", "dinAB", "dinThick", "ct", "ctWall", "rubMode", "rubCls", "rubFC", "thStd", "th"]) if (s[k] !== undefined) st[k] = s[k]; } catch (e) { /* 保存できない環境 */ }
const save = () => { try { const { rows, sel: _s, ...keep } = st; localStorage.setItem(KEY, JSON.stringify(keep)); } catch (e) { /* 無視 */ } };

const EXAMPLES = {
  dims: "25\nφ8\n120.5\n350\n2-φ5.5\nC0.5\nR3\n30°/25\n0.3\n1500",
  dinDims: "2.5\n12\n35.5\n80\n150\n420",
  ctDims: "8\n22\n45\n120\n300\n850",
  rubDims: "3\n8.5\n20\n55\n150\n240",
  thDims: "0.5\n0.8\n1.0\n1.6\n2.3\n3.2"
};

// =====================================================================
// 機械加工（JIS B 0405 / B 0419）
// =====================================================================
function solveMach(p) {
  const r = { p, raw: p.raw, kind: "", tol: "", lo: "", hi: "", note: "", ok: false };
  if (p.type === "bad") { r.kind = "—"; r.note = "数値として読めません。"; return r; }
  if (p.type === "thread") { r.kind = "ねじ"; r.note = "ねじの呼びは普通公差の対象外です。ねじの公差等級で指示します。"; return r; }
  if (p.type === "ang") {
    r.kind = "角度";
    if (p.side === null) { r.note = "短い辺の長さを 30°/25 の形で添えてください。"; return r; }
    const i = idx(p.side, ANG.his), t = ANG[st.lin][i];
    r.i = i; r.tol = "±" + minStr(t); r.lo = dms(p.val - t / 60); r.hi = dms(p.val + t / 60); r.ok = true; return r;
  }
  const T = p.type === "ch" ? CH : LIN;
  r.kind = p.type === "ch" ? "面取り・丸み" : "長さ";
  if (p.val < 0.5) { r.note = "0.5 mm 未満は普通公差の範囲外です。個々に公差を指示します。"; return r; }
  const i = idx(p.val, T.his);
  if (i < 0) { r.note = "4000 mm を超える寸法は表にありません。個々に公差を指示します。"; return r; }
  r.i = i; const t = T[st.lin][i];
  if (t === null) { r.note = `等級 ${st.lin} にはこの範囲の値がありません。等級を変えるか個々に指示します。`; return r; }
  const d = Math.max(decOf(p.str), decOf(String(t)));
  r.tol = "±" + nat(t); r.lo = fx(p.val - t, d); r.hi = fx(p.val + t, d); r.ok = true;
  return r;
}
function renderMach() {
  $$("#segLin button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === st.lin));
  $$("#segGeo button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === st.geo));
  $("#desig").innerHTML = `図面の指示：<b>JIS B 0405-${st.lin}</b>　／　幾何も含めるとき：<b>JIS B 0419-${st.lin}${st.geo}</b>`;
  st.rows = readDims("dims").map(solveMach);
  if (st.sel >= st.rows.length) st.sel = Math.max(0, st.rows.length - 1);
  $("#list tbody").innerHTML = st.rows.map((r, k) => `<tr class="${k === st.sel ? "sel" : ""}" data-k="${k}" tabindex="0" aria-selected="${k === st.sel}">
    <td class="in">${esc(r.p.raw)}</td><td class="kind">${r.kind}</td>
    ${r.ok ? `<td class="num tol">${r.tol}</td><td class="num">${r.lo}</td><td class="num">${r.hi}</td>` : `<td colspan="3" class="note"><span aria-hidden="true">! </span>${esc(r.note)}</td>`}</tr>`).join("");
  $("#listHint").textContent = st.rows.length ? `${st.rows.length} 件。行を選ぶと下に詳細を表示します。` : "寸法を入れてください。";
  results.mach = st.rows.map(r => ({ raw: r.raw, kind: r.kind, tol: r.tol, lo: r.lo, hi: r.hi, note: r.note }));
  renderDetail(); renderMachTables();
}
function card(t, v, s) { return `<div class="card"><span class="t">${t}</span><span class="v${v === null ? " na" : ""}">${v === null ? "規定なし" : v}</span>${s ? `<span class="s">${s}</span>` : ""}</div>`; }
function geoVal(T, L) { const i = idx(L, T.his); return i < 0 ? null : nat(T[st.geo][i]); }
function renderDetail() {
  const el = $("#detail"), r = st.rows[st.sel];
  if (!r) { el.innerHTML = `<h2>選んだ寸法</h2><p class="hint">左の欄に寸法を入れると、ここに詳細を表示します。</p>`; return; }
  const p = r.p; let h = `<h2>選んだ寸法：<span class="in">${esc(p.raw)}</span>（${r.kind}）</h2>`;
  if (r.ok) {
    h += `<div class="hero"><span class="big">${p.type === "ang" ? dms(p.val) : fx(p.val, decOf(p.str))}<small>${r.tol}</small></span><span class="lim">${r.lo} 〜 ${r.hi}</span></div>`;
    const T = p.type === "ang" ? ANG : p.type === "ch" ? CH : LIN;
    h += `<div class="strip">${["f", "m", "c", "v"].map(c => { const t = T[c][r.i]; const s = t === null ? "—" : "±" + (p.type === "ang" ? minStr(t) : nat(t)); return `<div class="${c === st.lin ? "on" : ""}"><b>${c}（${{ f: "精級", m: "中級", c: "粗級", v: "極粗級" }[c]}）</b>${s}</div>`; }).join("")}</div>`;
  } else h += `<div class="msg warn"><span aria-hidden="true">! </span>${esc(r.note)}</div>`;
  const L = p.type === "ang" ? p.side : (p.type === "lin" || p.type === "ch") ? p.val : null;
  if (L !== null && L > 0) {
    h += `<div class="sub"><h3>この長さ（${grp(String(L))} mm）で決まる普通幾何公差　JIS B 0419-${st.geo}</h3><div class="cards">
      ${card("真直度・平面度", geoVal(ST, L), "線の長さ、平面は長い方の辺（円形は直径）")}
      ${card("直角度", geoVal(PE, L), "この長さを短い方の辺とした値。長い方をデータムにとる")}
      ${card("対称度", geoVal(SY, L), "長い方の形体をデータムにとる")}
      ${card("円周振れ", nat(RO[st.geo]), "長さによらない一定値")}
      ${card("角度（JIS B 0405-" + st.lin + "）", "±" + minStr(ANG[st.lin][idx(L, ANG.his)]), "この長さを角度の短い方の辺とした値")}
    </div><ul class="rules">
      <li>真円度：直径の寸法公差の値以下。ただし円周振れ公差を超えない。</li>
      <li>平行度：寸法公差と、真直度または平面度のうち大きい方。長い方の形体をデータムにとる。</li>
      <li>円筒度・同軸度・位置度など表にない特性は、普通幾何公差では規定しないので、必要なら個々に指示します。</li>
    </ul></div>`;
  }
  el.innerHTML = h;
}
function renderMachTables() {
  const r = st.rows[st.sel], p = r && r.p;
  const L = !p ? null : p.type === "ang" ? p.side : (p.type === "lin" || p.type === "ch") ? p.val : null;
  const pm = t => "±" + nat(t), am = t => "±" + minStr(t);
  const linI = p && p.type === "lin" && r.i !== undefined ? r.i : -1;
  const chI = p && p.type === "ch" && r.i !== undefined ? r.i : -1;
  const angI = p && p.type === "ang" && p.side !== null ? idx(p.side, ANG.his) : -1;
  const gI = T => (L !== null && L > 0) ? idx(L, T.his) : -1;
  const lc = ["f", "m", "c", "v"], gc = ["H", "K", "L"];
  const mk = (title, T, cls, fmt, hc, cur) => grid({ title, rowHeads: cls, colHeads: T.heads, vals: cls.map(c => T[c]), hr: cls.indexOf(cur), hc, fmt, corner: "等級" });
  $("#tables").innerHTML = [
    mk("JIS B 0405 長さ寸法（面取り部分を除く）", LIN, lc, pm, linI, st.lin),
    mk("JIS B 0405 面取り部分の長さ寸法（かどの丸み・かどの面取り）", CH, lc, pm, chI, st.lin),
    mk("JIS B 0405 角度寸法（短い方の辺の長さ）", ANG, lc, am, angI, st.lin),
    mk("JIS B 0419 真直度・平面度", ST, gc, nat, gI(ST), st.geo),
    mk("JIS B 0419 直角度（短い方の辺の長さ）", PE, gc, nat, gI(PE), st.geo),
    mk("JIS B 0419 対称度", SY, gc, nat, gI(SY), st.geo),
    grid({ title: "JIS B 0419 円周振れ", rowHeads: gc, colHeads: ["公差"], vals: gc.map(c => [RO[c]]), hr: gc.indexOf(st.geo), hc: 0, corner: "等級" })
  ].join("");
}

// =====================================================================
// 樹脂成形品（DIN 16901）
// =====================================================================
function renderDin() {
  $$("#dinAB button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === st.dinAB));
  $("#dinThick").checked = st.dinThick;
  const base = DIN_MAT[st.dinMat][1];
  const g = st.dinThick ? base + 10 : base;
  $("#dinDesig").innerHTML = g > 160 ? `公差グループ ${base} の 1 つ上は表にありません` : `公差グループ <b>${g}</b>　寸法の種類 <b>${st.dinAB}</b>${st.dinThick ? `（${base} から 1 つ上げた）` : ""}`;
  const rows = readDims("dinDims").map(p => {
    const e = commonErr(p); if (e) return errRow(p, e);
    if (g > 160) return errRow(p, "グループ 160 より上の一般公差は規格にありません。");
    const i = idx(p.val, DIN.his);
    if (i < 0) return errRow(p, "1000 mm を超える寸法は表にありません。");
    const t = DIN.B[g][i] + (st.dinAB === "A" ? 0.10 : 0);
    const warn = DIN.fixed.has(`${g}-${i}`) ? "スキャンの読み違いを A − B = 0.10 の関係と前後の値で直した値です。" : g !== 130 ? "グループ 140〜160 の値は 1 資料（スキャン）から起こし、A − B = 0.10 の関係で確かめています。" : "";
    return pmRow(p, t, { i, warn });
  });
  finishList("din", rows, ["tol", "lo", "hi"]);
  const r = rows[sel.din];
  const rowsG = [130, 140, 150, 160].flatMap(x => [[x, "B"], [x, "A"]]);
  const q = new Set();
  rowsG.forEach(([x], ri) => DIN.heads.forEach((_, c) => { if (DIN.fixed.has(`${x}-${c}`)) q.add(`${ri}-${c}`); }));
  $('[data-tables="din"]').innerHTML = grid({
    title: "DIN 16901 表2 一般公差（±mm）", corner: "グループ",
    rowHeads: rowsG.map(([x, ab]) => `${x} ${ab}`), colHeads: DIN.heads,
    vals: rowsG.map(([x, ab]) => DIN.B[x].map(t => +(t + (ab === "A" ? 0.10 : 0)).toFixed(2))),
    hr: g <= 160 ? rowsG.findIndex(([x, ab]) => x === g && ab === st.dinAB) : -1, hc: r && r.ok ? r.i : -1,
    fmt: t => t.toFixed(2), q,
    src: "DIN 16901:1982（廃止。DIN は後継に DIN 16742 を挙げる）。グループ 130 は 4 資料で一致。140〜160 は公式英訳のスキャン 1 資料から起こし、点線の下線は読み違いを直したセル。140 は別の 1 資料とも照合。直接記入する公差（110〜160 の全幅）は読み取りの誤りが多いため載せていません。"
  }) + `<ul class="rules" style="margin-top:8px"><li>材料と公差グループの対応は DIN 16901 表1 の「一般公差」の列によります。UF/MF 無機充塡は資料で食い違うため外しました。</li><li>表1 の注記：無強化の結晶性樹脂で肉厚が 4 mm を超える場合は 1 つ上のグループを使います。</li></ul>`;
}

// =====================================================================
// 鋳造品（JIS B 0403）
// =====================================================================
function renderCast() {
  $("#ctSel").value = st.ct; $("#ctWall").checked = st.ctWall;
  const g = st.ctWall ? st.ct + 1 : st.ct;
  $("#ctDesig").innerHTML = g > 16 ? "CT16 より粗い等級はありません" : `適用する等級 <b>CT${g}</b>${st.ctWall ? `（肉厚のため CT${st.ct} から 1 つ粗く）` : ""}`;
  const rows = readDims("ctDims").map(p => {
    const e = commonErr(p); if (e) return errRow(p, e);
    if (g > 16) return errRow(p, "CT16 より粗い等級はありません。CT16 は通常 CT15 の肉厚だけに使います。");
    const i = idx(p.val, CT.his);
    if (i < 0) return errRow(p, "10000 mm を超える寸法は表にありません。");
    const tot = CT.v[i][g - 1];
    if (tot === null) return errRow(p, g >= 13 && p.val <= 16 ? "CT13〜CT16 は 16 mm 以下の寸法に適用しません。個々に公差を指示します。" : `CT${g} にはこの寸法範囲の値がありません。`);
    return pmRow(p, tot / 2, { i, tot: nat(tot), warn: "" });
  });
  finishList("cast", rows, ["tol", "tot", "lo", "hi"]);
  const r = rows[sel.cast];
  $('[data-tables="cast"]').innerHTML = grid({
    title: "JIS B 0403 表1 鋳造公差（全幅 mm）", corner: "寸法 \\ 等級",
    rowHeads: CT.heads, colHeads: CT.v[0].map((_, c) => "CT" + (c + 1)), vals: CT.v,
    hr: r && r.ok ? r.i : -1, hc: g <= 16 ? g - 1 : -1,
    src: "JIS B 0403:1995（2014年に正誤票、数値の変更なし）。日本ベアリング（NBK）の抜粋と ISO 8062 を引く資料の、同じ数値の並びを表に組み直したもの。"
  }) + `<ul class="rules" style="margin:8px 0 14px"><li>肉厚には、指定した等級より 1 つ粗い等級を使います（CT1〜CT15）。</li><li>CT13〜CT16 の値は 16 mm 以下の寸法には適用しません。CT16 は通常、CT15 を指定した鋳造品の肉厚だけに使います。</li></ul>` +
  grid({
    title: "公差等級の目安：長期間製造する鋳放し鋳造品（附属書 B）", corner: "鋳造方法",
    rowHeads: CT_GUIDE.rows.map(x => x[0]), colHeads: CT_GUIDE.cols, vals: CT_GUIDE.rows.map(x => x[1]), fmt: t => "CT" + t,
    q: new Set(CT_GUIDE.rows.flatMap((x, ri) => x[2] ? x[1].map((_, c) => `${ri}-${c}`) : [])),
    src: "砂型の 2 行は 2 資料で一致。点線の下線の金型・ダイカストの行は 1 資料だけ。精密鋳造（ロストワックス）の行は資料によって分け方が違うため載せていません。"
  });
}

// =====================================================================
// ゴム製品（ISO 3302-1）
// =====================================================================
const RUB_CLS = { M: ["M1", "M2", "M3", "M4"], E: ["E1", "E2", "E3"], L: ["L1", "L2", "L3"] };
function renderRub() {
  $$("#rubMode button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === st.rubMode));
  if (!RUB_CLS[st.rubMode].includes(st.rubCls)) st.rubCls = RUB_CLS[st.rubMode][1];
  $("#rubCls").innerHTML = RUB_CLS[st.rubMode].map(c => `<button type="button" data-v="${c}" aria-pressed="${c === st.rubCls}">${c}</button>`).join("");
  $$("#rubFC button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === st.rubFC));
  const isM = st.rubMode === "M";
  $("#rubFCwrap").hidden = !isM || st.rubCls === "M4";
  const T = isM ? R_M : st.rubMode === "E" ? R_E : R_L;
  const key = isM ? (st.rubCls === "M4" ? "M4" : st.rubCls + st.rubFC) : st.rubCls;
  const last = T.his[T.his.length - 1];
  $("#rubDesig").innerHTML = `ISO 3302-1 <b>${key}</b>`;
  const rows = readDims("rubDims").map(p => {
    const e = commonErr(p); if (e) return errRow(p, e);
    const i = idx(p.val, T.his);
    if (i < 0) { const pc = T.pct[key]; return pmRow(p, p.val * pc / 100, { i: -1, warn: st.rubMode === "E" ? "100 mm を超える断面の % は 1 資料だけで確かめた値です。" : "", tolSuffix: `（${pc}%）` }); }
    return pmRow(p, T[key][i], { i, warn: "" });
  });
  rows.forEach(r => { if (r.ok && r.tolSuffix) r.tol += `<span class="kind">${r.tolSuffix}</span>`; });
  finishList("rub", rows, ["tol", "lo", "hi"]);
  const r = rows[sel.rub];
  const keys = isM ? ["M1F", "M1C", "M2F", "M2C", "M3F", "M3C", "M4"] : RUB_CLS[st.rubMode];
  const heads = T.heads.concat([`${last}超`]);
  $('[data-tables="rub"]').innerHTML = grid({
    title: isM ? "ISO 3302-1 成形品（±mm）" : st.rubMode === "E" ? "ISO 3302-1 押出品の断面・支持なし（±mm）" : "ISO 3302-1 押出品の切断長さ（±mm）",
    corner: "等級", rowHeads: keys.map(k => k.replace(/([FC])$/, " $1")), colHeads: heads,
    vals: keys.map(k => T[k].concat([T.pct[k] + "%"])), fmt: t => typeof t === "string" ? t : nat(t),
    hr: keys.indexOf(key), hc: r && r.ok ? (r.i < 0 ? T.his.length : r.i) : -1,
    src: isM ? "ISO 3302-1:2014。3 資料（1996年版を名乗るものを含む）で一致。最後の列は呼び寸法に掛ける割合。"
             : st.rubMode === "E" ? "ISO 3302-1:2014。3 資料で一致。100 mm 超の割合は 1 資料だけ。" : "ISO 3302-1:2014。3 資料で一致。4000 mm 超は呼び寸法に掛ける割合。"
  });
}

// =====================================================================
// 板厚・肉厚
// =====================================================================
const TH_OPTS = {
  g3141: [["tbl", "表", [["A", "表15 A（圧延幅 600 以上）"], ["B", "表16 B（圧延幅 600 未満）"]]], ["w", "幅 [mm]", "1000"]],
  g4305: [["form", "形状", [["plate", "板"], ["strip", "帯"]]], ["grade", "許容差", [["std", "標準"], ["ET", "記号 ET（注文者が指定）"]]], ["w", "幅 [mm]", "1000"]],
  h4000: [["roll", "圧延", [["c", "冷間圧延材"], ["h", "熱間圧延材"]]], ["grp", "合金の区分", [["1", "その1（1000系・3003・5005 など）"], ["2", "その2（5052・6061・7075 など）"]]], ["w", "幅 [mm]", "1000"]],
  h4100: [["grp", "合金グループ", [["1", "グループ1（6063・6061・5052 など）"], ["2", "グループ2（5083・2017・7075 など）"]]], ["grade", "等級", [["n", "普通級"], ["s", "特殊級"]]], ["d", "外接円の直径 [mm]", "120"], ["part", "肉厚の部位", [["solid", "中実部（金属部）"], ["hollow", "中空部を囲む肉厚"]]]]
};
function thOpt(k) { const o = (st.th[st.thStd] = st.th[st.thStd] || {}); const def = TH_OPTS[st.thStd].find(x => x[0] === k); if (!def) return undefined; if (o[k] === undefined) o[k] = Array.isArray(def[2]) ? def[2][0][0] : def[2]; return o[k]; }
function buildThOpts() {
  $("#thStd").value = st.thStd;
  $("#thOpts").innerHTML = TH_OPTS[st.thStd].map(([k, lab, v]) => Array.isArray(v)
    ? `<div class="field"><label class="lb" for="th-${k}">${lab}</label><select id="th-${k}" data-th="${k}">${v.map(([val, t]) => `<option value="${val}"${thOpt(k) === val ? " selected" : ""}>${t}</option>`).join("")}</select></div>`
    : `<div class="field"><label class="lb" for="th-${k}">${lab}</label><input type="text" inputmode="decimal" id="th-${k}" data-th="${k}" value="${esc(thOpt(k))}"></div>`).join("");
}
const POS = {
  g3141: "厚さは幅方向の端から 15 mm 以上内側の任意の点で測ります（JIS G 3141）。",
  g4305: "板は端から 15 mm 以上内側。帯は耳付きで幅 50 以上なら 25 mm 以上内側、切断縁で幅 30 以上なら 15 mm 以上内側、それより狭いものは幅の中央で測ります（2015年版 9.3.1）。",
  h4000: "片側だけの許容差にするときは、表の値の 2 倍を片側に振ります。表にない寸法は受渡当事者間の協定によります。",
  h4100: "中空部を囲む肉厚は、向かい合う 2 つの肉厚の平均に対する割合で、上下の限りがあります。片方の肉厚が他方の 3 倍以上（偏肉）のときは表を使いません。"
};
function renderThk() {
  const std = st.thStd; let T, mode, warnAll = false, msg = "", tblHTML = "";
  const w = parseFloat(String(thOpt("w") ?? "").normalize("NFKC"));
  $("#thPos").textContent = POS[std];
  let lookup; // (p) => {t, r, c} or error string
  if (std === "g3141" || std === "g4305" || (std === "h4000")) {
    if (std === "g3141") T = thOpt("tbl") === "A" ? G3141A : G3141B;
    else if (std === "g4305") T = thOpt("grade") === "ET" ? G4305ET : G4305STD;
    else T = thOpt("roll") === "c" ? (thOpt("grp") === "1" ? H4000.c1 : H4000.c2) : (thOpt("grp") === "1" ? H4000.h1 : null);
    if (!T) { msg = "熱間圧延材（その2）は 2017年の追補で表が差し替わり、新しい値を確かめられる資料が見つからなかったため載せていません。"; }
  }
  if (T) {
    const isGL = !!T.tH;
    const cIdx = isNaN(w) ? -1 : isGL ? idx(w, T.wH) : idxGE(w, T.wL, T.wMax, T.wMaxOpen);
    const strip = std === "g4305" && thOpt("form") === "strip" && T === G4305STD;
    const tMax = strip ? 8.00 : T.tMax;
    const nRows = strip ? 14 : T.v.length;
    if (isNaN(w)) msg = "幅を数値で入れてください。";
    else if (cIdx < 0) msg = `幅 ${grp(String(w))} mm は表の範囲外です。`;
    lookup = p => {
      const rIdx = isGL ? (T.tMin !== undefined && p.val < T.tMin - 1e-9 ? -1 : idx(p.val, T.tH)) : idxGE(p.val, T.tL, tMax);
      if (rIdx < 0 || rIdx >= nRows) return "この厚さは表の範囲外です。";
      if (cIdx < 0) return "幅が表の範囲外のため引けません。";
      const t = T.v[rIdx][cIdx];
      if (t === undefined) return "この欄の値は資料で確かめられていません。";
      if (t === null) return "この厚さと幅の組合せは規格に値がありません。";
      const warn = T.allQ ? T.src : (T.q && T.q.has(`${rIdx}-${cIdx}`)) ? "資料によって値が食い違う欄です。" : "";
      return { t, r: rIdx, c: cIdx, warn };
    };
    const rowHeads = isGL ? glHeads(T.tH, T.tMin) : geHeads(T.tL.slice(0, nRows), tMax, T.tHeadsFirst);
    const colHeads = isGL ? T.wHeads : T.wHeads;
    tblHTML = (r) => grid({ title: T.title + "（±mm）", corner: "厚さ \\ 幅", rowHeads, colHeads, vals: T.v.slice(0, nRows), hr: r && r.ok ? r.i : -1, hc: cIdx, q: T.q, allQ: T.allQ, src: T.src }) +
      (std === "h4000" ? `<p class="src" style="margin-top:6px">合金の区分（1999年版）　その1：${H4000_G[1]}　／　その2：${H4000_G[2]}</p>` : "");
    $("#thDesig").innerHTML = `${T.title.replace("の厚さの許容差", "")}${strip ? "（帯）" : ""}`;
  } else if (std === "h4100") {
    const d = parseFloat(String(thOpt("d")).normalize("NFKC"));
    const band = isNaN(d) || d <= 0 ? null : d <= 250 ? "s250" : d <= 800 ? "s800" : "over";
    const col = (thOpt("grade") === "s" ? 2 : 0) + (thOpt("grp") === "2" ? 1 : 0);
    const part = thOpt("part");
    if (band === null) msg = "外接円の直径を数値で入れてください。";
    else if (band === "over") msg = "外接円の直径が 800 mm を超えるものは表にありません。";
    const S = band && band !== "over" ? H4100.solid[band] : null;
    lookup = p => {
      if (!S) return "外接円の直径を確かめてください。";
      if (part === "hollow") {
        const [pc, mn, mx] = H4100.hollow[band][col];
        const t = Math.min(mx, Math.max(mn, p.val * pc / 100));
        return { t, r: -1, c: col, warn: "", suffix: `（${pc}%、${mn}〜${mx} で制限）` };
      }
      const rIdx = idx(p.val, S.tH);
      if (rIdx < 0) return "この肉厚は表の範囲外です。";
      return { t: S.v[rIdx][col], r: rIdx, c: col, warn: "" };
    };
    const cols = ["普通級 G1", "普通級 G2", "特殊級 G1", "特殊級 G2"];
    tblHTML = (r) => S ? (part === "hollow"
      ? grid({ title: "JIS H 4100 中空部を囲む肉厚の許容差（3欄）", corner: "外接円", rowHeads: ["250以下", "250超〜800"], colHeads: cols,
          vals: ["s250", "s800"].map(b => H4100.hollow[b].map(([pc, mn, mx]) => `±${pc}%（${mn}〜${mx}）`)), fmt: t => t, hr: band === "s250" ? 0 : 1, hc: col, src: H4100.src })
      : grid({ title: `JIS H 4100 中実部の寸法の許容差（2欄、外接円 ${band === "s250" ? "250 以下" : "250 超 800 以下"}、±mm）`, corner: "寸法 \\ 等級", rowHeads: glHeads(S.tH), colHeads: cols, vals: S.v, hr: r && r.ok ? r.i : -1, hc: col, src: H4100.src }))
      + `<p class="src" style="margin-top:6px">合金グループ1：${H4100.g1}　／　グループ2：${H4100.g2}</p>` : "";
    $("#thDesig").innerHTML = `JIS H 4100 ${thOpt("grade") === "s" ? "特殊級" : "普通級"}・合金グループ${thOpt("grp")}・${part === "hollow" ? "中空部を囲む肉厚" : "中実部"}`;
  }
  if (!T && std !== "h4100") $("#thDesig").innerHTML = "JIS H 4000 熱間圧延材（その2）";
  const rows = readDims("thDims").map(p => {
    const e = commonErr(p); if (e) return errRow(p, e);
    if (!lookup) return errRow(p, msg || "この条件の表はありません。");
    const x = lookup(p); if (typeof x === "string") return errRow(p, x);
    const row = pmRow(p, x.t, { i: x.r, warn: x.warn });
    if (x.suffix) row.tol += `<span class="kind">${x.suffix}</span>`;
    return row;
  });
  finishList("thk", rows, ["tol", "lo", "hi"], msg);
  $('[data-tables="thk"]').innerHTML = typeof tblHTML === "function" ? tblHTML(rows[sel.thk]) : "";
}

// 一覧の共通の仕上げ
function finishList(key, rows, cols, msg = "") {
  if (sel[key] >= rows.length) sel[key] = Math.max(0, rows.length - 1);
  results[key] = rows;
  $(`[data-list="${key}"] tbody`).innerHTML = listHTML(key, rows, cols);
  const warned = rows.some(r => r.warn);
  $(`[data-msg="${key}"]`).innerHTML = (msg ? `<div class="msg warn"><span aria-hidden="true">! </span>${esc(msg)}</div>` : "") +
    (warned ? `<p class="hint">△ は照合が足りない値です。印にカーソルを合わせると理由を表示します。</p>` : "") +
    (!rows.length ? `<p class="hint">寸法を入れてください。</p>` : "");
}

// =====================================================================
// 操作
// =====================================================================
const RENDER = { mach: renderMach, din: renderDin, cast: renderCast, rub: renderRub, thk: renderThk };
const render = () => { RENDER[st.tab](); save(); };

function showTab(t) {
  st.tab = t;
  $$("nav.tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
  $$(".tabpanel").forEach(p => p.hidden = p.dataset.panel !== t);
  render();
}
$("nav.tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) showTab(b.dataset.tab); });

function seg(id, key) { $(id).addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; st[key] = b.dataset.v; render(); }); }
seg("#segLin", "lin"); seg("#segGeo", "geo"); seg("#dinAB", "dinAB"); seg("#rubMode", "rubMode"); seg("#rubCls", "rubCls"); seg("#rubFC", "rubFC");

$("#dinMat").innerHTML = DIN_MAT.map(([n, g], i) => `<option value="${i}">${n}（${g}）</option>`).join("");
$("#dinMat").value = st.dinMat;
$("#dinMat").addEventListener("change", e => { st.dinMat = +e.target.value; render(); });
$("#dinThick").addEventListener("change", e => { st.dinThick = e.target.checked; render(); });
$("#ctSel").innerHTML = Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">CT${i + 1}</option>`).join("");
$("#ctSel").addEventListener("change", e => { st.ct = +e.target.value; render(); });
$("#ctWall").addEventListener("change", e => { st.ctWall = e.target.checked; render(); });
$("#thStd").addEventListener("change", e => { st.thStd = e.target.value; buildThOpts(); render(); });
$("#thOpts").addEventListener("input", e => { const k = e.target.dataset.th; if (!k) return; st.th[st.thStd][k] = e.target.value; render(); });

for (const id of Object.keys(EXAMPLES)) {
  const ta = $("#" + id);
  try { const v = localStorage.getItem(KEY + "-" + id); ta.value = v !== null ? v : EXAMPLES[id]; } catch (e) { ta.value = EXAMPLES[id]; }
  ta.addEventListener("input", () => { try { localStorage.setItem(KEY + "-" + id, ta.value); } catch (e) { } render(); });
}
document.addEventListener("click", e => {
  const c = e.target.closest("[data-clear]"), x = e.target.closest("[data-ex]");
  const id = (c || x) && (c ? c.dataset.clear : x.dataset.ex); if (!id) return;
  $("#" + id).value = c ? "" : EXAMPLES[id];
  try { localStorage.setItem(KEY + "-" + id, $("#" + id).value); } catch (err) { }
  if (st.tab === "mach") st.sel = 0; else sel[st.tab] = 0;
  render(); if (c) $("#" + id).focus();
});

// 一覧の行を選ぶ（クリック・Enter・上下キー）
function selKey() { return st.tab === "mach" ? null : st.tab; }
function setSel(k) { if (st.tab === "mach") st.sel = k; else sel[st.tab] = k; render(); const n = document.querySelector(`[data-panel="${st.tab}"] table.list tr[data-k="${k}"]`); if (n) n.focus(); }
document.addEventListener("click", e => { const tr = e.target.closest("table.list tbody tr"); if (tr) setSel(+tr.dataset.k); });
document.addEventListener("keydown", e => {
  const tr = e.target.closest && e.target.closest("table.list tbody tr"); if (!tr) return;
  const k = +tr.dataset.k, n = document.querySelectorAll(`[data-panel="${st.tab}"] table.list tbody tr`).length;
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(k); }
  if (e.key === "ArrowDown" && k + 1 < n) { e.preventDefault(); setSel(k + 1); }
  if (e.key === "ArrowUp" && k > 0) { e.preventDefault(); setSel(k - 1); }
});

// コピー（TSV）
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 1800); }
const plain = s => String(s ?? "").replace(/<[^>]+>/g, "").replace(/,/g, "");
document.addEventListener("click", e => {
  const b = e.target.closest("[data-copy]"); if (!b) return;
  const key = b.dataset.copy, rows = results[key] || [];
  const head = key === "mach" ? ["寸法", "区分", "普通公差", "下限", "上限", "備考"] : key === "cast" ? ["寸法", "鋳造公差", "全幅", "下限", "上限", "備考"] : ["寸法", "許容差", "下限", "上限", "備考"];
  const lines = [head.join("\t")].concat(rows.map(r => (key === "mach" ? [r.raw, r.kind, r.tol, r.lo, r.hi, r.note]
    : key === "cast" ? [r.raw, r.tol, r.tot, r.lo, r.hi, r.note || r.warn] : [r.raw, r.tol, r.lo, r.hi, r.note || r.warn]).map(plain).join("\t")));
  const desig = { mach: $("#desig"), din: $("#dinDesig"), cast: $("#ctDesig"), rub: $("#rubDesig"), thk: $("#thDesig") }[key];
  lines.push("条件\t" + plain(desig.innerHTML).replace(/\s+/g, " "));
  const txt = lines.join("\n");
  const fallback = () => { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (err) { } ta.remove(); toast(ok ? "コピーしました" : "コピーできませんでした。一覧を選んでコピーしてください"); };
  try { navigator.clipboard.writeText(txt).then(() => toast("コピーしました"), fallback); } catch (err) { fallback(); }
});

// テーマ切替（自動 → ライト → ダーク）
const themes = ["auto", "light", "dark"], tname = { auto: "自動", light: "ライト", dark: "ダーク" };
let theme = document.documentElement.dataset.theme || "auto";
const applyTheme = () => { if (theme === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; $("#themeBtn").textContent = "表示：" + tname[theme]; };
$("#themeBtn").addEventListener("click", () => { theme = themes[(themes.indexOf(theme) + 1) % 3]; try { localStorage.setItem("qc-workbench-theme", theme); } catch (e) { } applyTheme(); });
applyTheme();

buildThOpts();
showTab(["mach", "din", "cast", "rub", "thk"].includes(st.tab) ? st.tab : "mach");

// オフラインで使えるように Service Worker を登録する
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { /* 登録できない環境 */ }));
}
