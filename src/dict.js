// dict.js — 言葉のデータ（build/words.js の SR_WORDS）の検索と、ヒントの候補づくり。
window.SR = window.SR || {};

SR.dict = (function () {
  var K = SR.kana;
  var all = window.SR_WORDS || [];

  // 読みから引く表と、「ん」で終わるかの印をつけておく
  var byReading = {};
  for (var i = 0; i < all.length; i++) {
    byReading[all[i].reading] = all[i];
    all[i].endsWithN = K.nextChars(all[i].reading).endsWithN;
  }

  function find(reading) { return byReading[reading] || null; }

  // 配列をランダムに並べ替える（元は変えない）
  function shuffled(list) {
    var a = list.slice();
    for (var k = a.length - 1; k > 0; k--) {
      var r = Math.floor(Math.random() * (k + 1));
      var t = a[k]; a[k] = a[r]; a[r] = t;
    }
    return a;
  }

  // ヒントの候補を、出す順に並べて返す（DESIGN §4.3）。
  //   chars … 認める文字のどれかで始まる言葉だけ
  //   used  … { 読み: true } 使用済みの言葉は出さない
  //   kid=1 の言葉を先に、そのあと kid=0 の言葉。どちらの中もランダム。
  //   「ん」で終わる言葉も出す（v0.4。タップすると「ん が ついちゃった！」）。ただし config の HINT_INCLUDE_N が false なら出さない。
  //   絵は2枚ずつ並ぶ（並んで出るのは、この順番でとなり合う2つ）ので、「ん」の言葉が となり合わないように並べる。
  function hintQueue(chars, used) {
    var kid = [], other = [];
    for (var k = 0; k < all.length; k++) {
      var w = all[k];
      if (used[w.reading]) continue;
      if (w.endsWithN && !SR.config.HINT_INCLUDE_N) continue;
      if (!K.startsWithAny(w.reading, chars)) continue;
      (w.kid === 1 ? kid : other).push(w);
    }
    return spreadN(shuffled(kid).concat(shuffled(other)));
  }

  // 「ん」で終わる言葉が となり合わないように並べ直す。
  //   ふつうの言葉の並びの あいだに、「ん」の言葉を 間をあけて散らす（順番はそれぞれ保つ）。
  //   「ん」の言葉のほうが多くて入りきらない分だけ、最後にまとめる。
  function spreadN(list) {
    var norm = [], nw = [];
    for (var k = 0; k < list.length; k++) (list[k].endsWithN ? nw : norm).push(list[k]);
    if (!nw.length || !norm.length) return norm.concat(nw);
    var out = [], placed = 0;
    for (var m = 0; m < norm.length; m++) {
      out.push(norm[m]);
      // ふつうの言葉 m+1 個ぶん進んだ所までに、「ん」の言葉を割合どおり入れる（1回に1つまで）
      if (placed < nw.length && Math.floor((m + 1) * nw.length / norm.length) > placed) out.push(nw[placed++]);
    }
    return out.concat(nw.slice(placed));
  }

  // ---- 絵文字がない言葉の絵（images/<読み>.png があれば使う。なければ「？」のまま） ----
  var imgCache = {};   // 読み → 画像のURL、または 'no'
  //   build_words.py が images/<読み>.png の有無を調べて w.image に印を付ける（無い画像を探して 404 を出さないため）
  function loadImage(w, callback) {
    if (!w.image) return;
    var s = imgCache[w.reading];
    if (s === 'no') return;
    if (s) { callback(s); return; }
    var im = new Image();
    im.onload = function () { imgCache[w.reading] = im.src; callback(im.src); };
    im.onerror = function () { imgCache[w.reading] = 'no'; };   // 画像がなくても壊れたアイコンは出さない
    im.src = 'images/' + encodeURIComponent(w.reading) + '.png';
  }

  // 起動時に絵を先に読み込んでおく（ヒントに出た瞬間に「？」が見えないように）
  function preloadImages() {
    for (var k = 0; k < all.length; k++) {
      if (all[k].image) loadImage(all[k], function () {});
    }
  }

  return { all: all, find: find, hintQueue: hintQueue, loadImage: loadImage, preloadImages: preloadImages };
})();
