// kana.js — かなの処理。「次の始まりの文字」の決め方（DESIGN.md §5.2）と五十音表のデータ。
// 声の入力（Step 4・5）からも同じものを使うので、画面には触らない独立したファイルにしてある。
window.SR = window.SR || {};

SR.kana = (function () {
  // ---- 濁点・半濁点の対応表（か↔が、は↔ぱ など） ----
  var toBase = {};      // が → か、ぱ → は（点を取った文字）
  var toDaku = {};      // か → が
  var toHandaku = {};   // は → ぱ
  var DAKU = 'かが きぎ くぐ けげ こご さざ しじ すず せぜ そぞ ただ ちぢ つづ てで とど はば ひび ふぶ へべ ほぼ'.split(' ');
  var HANDAKU = 'はぱ ひぴ ふぷ へぺ ほぽ'.split(' ');
  var i;
  for (i = 0; i < DAKU.length; i++) { toBase[DAKU[i][1]] = DAKU[i][0]; toDaku[DAKU[i][0]] = DAKU[i][1]; }
  for (i = 0; i < HANDAKU.length; i++) { toBase[HANDAKU[i][1]] = HANDAKU[i][0]; toHandaku[HANDAKU[i][0]] = HANDAKU[i][1]; }
  toBase['ゔ'] = 'う';

  // ---- 母音（長音「ー」のとき、前の文字の母音を出すのに使う） ----
  var VOWEL_ROWS = {
    'あ': 'あかさたなはまやらわがざだばぱゃゎぁ',
    'い': 'いきしちにひみりぎじぢびぴぃ',
    'う': 'うくすつぬふむゆるぐずづぶぷゅゔぅっ',
    'え': 'えけせてねへめれげぜでべぺぇ',
    'お': 'おこそとのほもよろをごぞどぼぽょぉ'
  };
  function vowelOf(c) {
    for (var v in VOWEL_ROWS) {
      if (VOWEL_ROWS[v].indexOf(c) >= 0) return v;
    }
    return '';
  }

  // 小さい文字 → 大きい文字
  var SMALL = { 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'ゎ': 'わ' };

  // ---- カタカナ → ひらがな（長音・句読点はそのまま） ----
  function toHiragana(s) {
    s = String(s == null ? '' : s);
    var out = '';
    for (var k = 0; k < s.length; k++) {
      var code = s.charCodeAt(k);
      if (code >= 0x30A1 && code <= 0x30F6) out += String.fromCharCode(code - 0x60);   // ァ〜ヶ → ぁ〜ゖ
      else if (s[k] === 'ｰ' || s[k] === '－' || s[k] === '−') out += 'ー';           // 長音のゆれ
      else out += s[k];
    }
    return out;
  }

  var KANA_RE = /[ぁ-ゖー]/;   // ひらがなと長音

  // 比べるときだけ、同じ扱いにする文字（DESIGN §5.3: ぢ/じ、づ/ず、を/お）
  var CANON = { 'ぢ': 'じ', 'づ': 'ず', 'を': 'お' };
  function canon(c) { return CANON[c] || c; }

  // 重複を取って順番を保つ
  function unique(list) {
    var seen = {}, out = [];
    for (var k = 0; k < list.length; k++) {
      if (list[k] && !seen[list[k]]) { seen[list[k]] = true; out.push(list[k]); }
    }
    return out;
  }

  // cs[idx] で終わる言葉の「次の始まり」として認める文字を、代表→ほかの順で返す
  function endChars(cs, idx) {
    var c = cs[idx];
    var list, j;
    if (c === 'ー') {
      // 長音: 伸ばす前の文字（の候補）と、その母音
      j = idx - 1;
      while (j >= 0 && cs[j] === 'ー') j--;
      if (j < 0) return [];
      list = endChars(cs, j);
      var v = vowelOf(cs[j]);
      if (v) list.push(v);
      return unique(list);
    }
    if (c === 'っ') return ['つ'];
    if (SMALL[c]) {
      // 小さい文字: 大きくした文字と、その前の文字（の候補）の両方
      list = [SMALL[c]];
      if (idx > 0 && cs[idx - 1] !== 'ー') list = list.concat(endChars(cs, idx - 1));
      return unique(list);
    }
    if (toBase[c]) return unique([c, toBase[c]]);   // が → が／か
    list = [c];
    // 「う」で終わる言葉は「お」始まりも通す（がっこう → う／お）
    if (c === 'う' && idx > 0 && vowelOf(cs[idx - 1]) === 'お') list.push('お');
    return list;
  }

  // 言葉から「次の始まりとして認める文字」を出す（DESIGN §5.2）
  //   返り値: { ok, endsWithN, chars }
  //     ok        … かなで終わる言葉として読めたか（漢字などで読めないときは false）
  //     endsWithN … 「ん」で終わっているか（このとき chars は空）
  //     chars     … 認める文字。chars[0] が代表（画面に大きく出す）
  function nextChars(word) {
    var cs = [];
    var s = toHiragana(word);
    for (var k = 0; k < s.length; k++) cs.push(s[k]);
    // 後ろにある「！」「。」や空白を取る
    while (cs.length && !KANA_RE.test(cs[cs.length - 1])) {
      // 漢字などかな以外の文字で終わっているときは、読めない
      if (/[㐀-鿿]/.test(cs[cs.length - 1])) return { ok: false, endsWithN: false, chars: [] };
      cs.pop();
    }
    if (!cs.length) return { ok: false, endsWithN: false, chars: [] };
    var last = cs.length - 1;
    if (cs[last] === 'ん') return { ok: true, endsWithN: true, chars: [] };
    var chars = endChars(cs, last);
    return { ok: chars.length > 0, endsWithN: false, chars: chars };
  }

  // 言葉の最初の文字（ひらがな、比べる用にそろえたもの）
  function headChar(word) {
    var s = toHiragana(word);
    return s.length ? canon(s[0]) : '';
  }

  // その言葉は、認める文字のどれかで始まっているか
  function startsWithAny(word, chars) {
    var h = headChar(word);
    if (!h) return false;
    for (var k = 0; k < chars.length; k++) {
      if (canon(chars[k]) === h) return true;
    }
    return false;
  }

  // ---- 五十音表（10列×5行。空白は ''。mock.html の「さいごの もじ」と同じ並び） ----
  var GRID = [
    ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ'],
    ['い', 'き', 'し', 'ち', 'に', 'ひ', 'み', '', 'り', ''],
    ['う', 'く', 'す', 'つ', 'ぬ', 'ふ', 'む', 'ゆ', 'る', ''],
    ['え', 'け', 'せ', 'て', 'ね', 'へ', 'め', '', 'れ', ''],
    ['お', 'こ', 'そ', 'と', 'の', 'ほ', 'も', 'よ', 'ろ', 'ん']
  ];

  // 五十音表の文字を、濁点・半濁点モードに合わせて変える。mode: '' / 'daku' / 'handaku'
  function withMark(c, mode) {
    if (mode === 'daku' && toDaku[c]) return toDaku[c];
    if (mode === 'handaku' && toHandaku[c]) return toHandaku[c];
    return c;
  }

  return {
    toHiragana: toHiragana,
    nextChars: nextChars,
    headChar: headChar,
    startsWithAny: startsWithAny,
    GRID: GRID,
    withMark: withMark
  };
})();
