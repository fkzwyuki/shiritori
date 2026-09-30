// reading.js — 音声認識の結果（漢字・カタカナ・「！」つきなど）を、ひらがなの読みに直す（DESIGN.md §5.3・§7.2 案A）。
// 画面には触らない独立したファイル。Step 5 で本体の index.html に読み込ませて使う。
// 必要なもの: build/words.js（window.SR_WORDS）と src/kana.js（SR.kana）を先に読み込んでおくこと。
window.SR = window.SR || {};

SR.reading = (function () {
  var K = SR.kana;
  var words = window.SR_WORDS || [];

  // ---- 表記から辞書の言葉を引く表 ----
  //   キーは surfaces の各表記と、それをひらがなにしたもの（カタカナだけの言葉が引ける）と、読みそのもの
  var bySurface = {};
  function addKey(key, w) {
    if (key && !bySurface[key]) bySurface[key] = w;   // 同じ表記が複数の語にあるときは先に出てきた語
  }
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    addKey(w.reading, w);
    for (var j = 0; j < w.surfaces.length; j++) {
      addKey(w.surfaces[j], w);
      addKey(K.toHiragana(w.surfaces[j]), w);
    }
  }

  // ---- ゆらぎ吸収（DESIGN §5.3）の部品 ----
  // 前後から取る記号・かっこ（NFKC のあとなので「！」は「!」になっている）
  var PUNCT = '、。,.!?…・~〜～♪♫♬「」『』()（）"\'“”‘’-−―';
  var EDGE_RE = new RegExp('^[' + PUNCT.replace(/[\]\\\-^]/g, '\\$&') + ']+|[' + PUNCT.replace(/[\]\\\-^]/g, '\\$&') + ']+$', 'g');
  // 語尾につく言い回し（長い順）。「ー」がその後ろについていてもよい
  var ENDING_RE = /(ですよね|ですよ|ですね|でーす|です|だよね|だよ|だね|でした)ー*$/;

  function stripEdges(s) { return s.replace(EDGE_RE, ''); }

  // 音声認識の文字列 → { text, before, removed[] }
  //   before … 語尾（です・だよ）を取る前の文字列（辞書に「です」で終わる言葉があっても引けるように残す）
  //   text   … 全部取ったあとの文字列
  //   removed … 何を取ったかの説明（画面に出す）
  function normalize(raw) {
    var removed = [];
    var s = String(raw == null ? '' : raw);
    var t = s.normalize ? s.normalize('NFKC') : s;         // 全角の英数記号・半角カナをそろえる
    if (t !== s) removed.push('全角・半角をそろえた');
    if (/\s/.test(t)) { t = t.replace(/\s+/g, ''); removed.push('空白を取った'); }
    var before = stripEdges(t);
    if (before !== t) removed.push('記号（！。など）を取った');
    t = before;
    // 語尾の「です」「だよ」など（取ったあと何も残らないときは取らない）。記号が挟まっていてもくり返し取る
    var m;
    while ((m = ENDING_RE.exec(t)) && m.index > 0) {
      removed.push('語尾「' + m[0] + '」を取った');
      t = stripEdges(t.slice(0, m.index));
    }
    // 「ーーー」→「ー」
    if (/ー{2,}/.test(t)) { t = t.replace(/ー{2,}/g, 'ー'); removed.push('のばし「ー」のくり返しを1つにした'); }
    var beforeOut = /ー{2,}/.test(before) ? before.replace(/ー{2,}/g, 'ー') : before;
    return { text: t, before: beforeOut, removed: removed };
  }

  // ひらがな・カタカナ・長音だけか（辞書になくても読める扱いにするか）
  var KANA_ONLY_RE = /^[ぁ-ゖァ-ヶー]+$/;
  function isKanaOnly(s) { return KANA_ONLY_RE.test(s); }

  // 辞書を引く。表記そのもの → ひらがなにしたもの の順
  function lookup(s) {
    return bySurface[s] || bySurface[K.toHiragana(s)] || null;
  }

  // 1つの認識結果 → 読み
  //   返り値: {
  //     raw, normalized, removed[],
  //     ok       … 読みが取れたか
  //     reading  … ひらがなの読み（取れなかったら ''）
  //     source   … 'dict'（辞書にあった）／'kana'（辞書にないが、かなだけなので読めた）／'none'（読めない）
  //     word     … 辞書の語（source が 'dict' のとき）
  //     next     … SR.kana.nextChars の結果（ok のときだけ）
  //     notes[]  … 途中で何をしたかの説明
  //   }
  function resolve(raw) {
    var n = normalize(raw);
    var res = { raw: raw, normalized: n.text, removed: n.removed.slice(), ok: false, reading: '', source: 'none', word: null, next: null, notes: [] };
    if (!n.text) { res.notes.push('空っぽ'); return res; }

    // 辞書を、取る前の形 → 取ったあとの形 → 最後の「ー」を取った形 の順に引く
    var forms = [n.before, n.text];
    var noTailLong = n.text.replace(/ー+$/, '');
    if (noTailLong && noTailLong !== n.text) forms.push(noTailLong);
    for (var f = 0; f < forms.length; f++) {
      var hit = lookup(forms[f]);
      if (hit) {
        res.ok = true; res.source = 'dict'; res.word = hit; res.reading = hit.reading;
        if (forms[f] === noTailLong && noTailLong !== n.text) res.notes.push('語尾の「ー」を取ると辞書にあった');
        break;
      }
    }
    // 辞書になくても、ひらがな・カタカナだけなら読める
    if (!res.ok && isKanaOnly(n.text)) {
      res.ok = true; res.source = 'kana'; res.reading = K.toHiragana(n.text);
      if (/[ァ-ヶ]/.test(n.text)) res.notes.push('カタカナをひらがなに直した');
      // 「ん」のあとの「ー」は、ただの言い伸ばしとして取る（ぞうさんー → ぞうさん）
      if (/ん[ー]+$/.test(res.reading)) { res.reading = res.reading.replace(/ー+$/, ''); res.notes.push('「ん」のあとの「ー」を取った'); }
    }
    if (!res.ok) {
      res.notes.push(/[㐀-鿿]/.test(n.text) ? '漢字が混じっていて辞書にない' : 'かなではない文字が混じっている');
      return res;
    }
    res.next = K.nextChars(res.reading);
    if (!res.next.ok) { res.ok = false; res.source = 'none'; res.notes.push('次の文字を決められなかった'); }
    return res;
  }

  // 認識結果の候補（[{ transcript, confidence }]）から、採用する1つを選ぶ（Step 5 で本体に使う）
  //   1. 読みが取れたものだけ  2. 辞書にあるものを先に  3. 信頼度が高い順  4. 同じなら先に返ってきた順
  //   返り値: { results[]（候補ごとの resolve の結果に confidence・index を足したもの）, adopted（採用した index、なければ -1） }
  function pick(candidates) {
    var results = [];
    for (var k = 0; k < candidates.length; k++) {
      var r = resolve(candidates[k].transcript);
      r.confidence = candidates[k].confidence;
      r.index = k;
      results.push(r);
    }
    var best = -1;
    for (var q = 0; q < results.length; q++) {
      if (!results[q].ok) continue;
      if (best < 0 || better(results[q], results[best])) best = q;
    }
    return { results: results, adopted: best };
  }

  // a は b より先に採用したいか
  function better(a, b) {
    var ad = a.source === 'dict' ? 1 : 0, bd = b.source === 'dict' ? 1 : 0;
    if (ad !== bd) return ad > bd;
    var ac = typeof a.confidence === 'number' ? a.confidence : 0;
    var bc = typeof b.confidence === 'number' ? b.confidence : 0;
    if (ac !== bc) return ac > bc;
    return a.index < b.index;
  }

  // 認識結果の候補から、ボタンに並べる候補を順番つきで返す（Phase 3、DESIGN §6.2-4）
  //   並べる順: 1. 今の文字（chars のどれか）で始まる言葉  2. 辞書にある言葉  3. 認識の信頼度の高い順  4. 同じなら先に返ってきた順
  //   読みが取れたものだけ。同じ読み（林檎とりんご）は1つにまとめる（順番が上のほうを残す）。max 個まで。
  //   返り値: resolve の結果に confidence・index・startsOk（今の文字で始まるか）を足したものの配列
  function rank(candidates, chars, max) {
    var list = [];
    for (var k = 0; k < candidates.length; k++) {
      var r = resolve(candidates[k].transcript);
      r.confidence = candidates[k].confidence;
      r.index = k;
      r.startsOk = !!(r.ok && chars && chars.length && K.startsWithAny(r.reading, chars));
      if (r.ok) list.push(r);
    }
    list.sort(function (a, b) {
      if (a.startsOk !== b.startsOk) return a.startsOk ? -1 : 1;
      var ad = a.source === 'dict' ? 1 : 0, bd = b.source === 'dict' ? 1 : 0;
      if (ad !== bd) return bd - ad;
      var ac = typeof a.confidence === 'number' ? a.confidence : 0;
      var bc = typeof b.confidence === 'number' ? b.confidence : 0;
      if (ac !== bc) return bc - ac;
      return a.index - b.index;
    });
    var out = [], seen = {};
    for (var q = 0; q < list.length; q++) {
      if (seen[list[q].reading]) continue;
      seen[list[q].reading] = true;
      out.push(list[q]);
      if (max && out.length >= max) break;
    }
    return out;
  }

  return { normalize: normalize, resolve: resolve, pick: pick, rank: rank, isKanaOnly: isKanaOnly };
})();
