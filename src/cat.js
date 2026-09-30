// cat.js — 案内役のねこ（DESIGN.md §6.3-2）。ポーズを切り替えるだけの部品（いつ何のポーズにするかは game.js が決める）。
//   絵は images/_cat_<ポーズ>.png（build/words.js の SR_ASSETS に載っているものだけ読む）。無いポーズは 🐱 で代わりにする。
//   どの場合も #cat の data-pose に今のポーズの名前が入る（確認用）。
window.SR = window.SR || {};

SR.cat = (function () {
  var C = SR.config;
  var el = null;
  var pose = '';
  var returnTimer = null;
  var brokenPose = {};   // 読めなかった絵（以後は 🐱 で代わりにする）

  function url(p) { return brokenPose[p] ? '' : SR.ui.asset('images/_cat_' + p + '.png'); }

  // 起動時に、あるポーズの絵を先に読み込んでおく（ポーズが変わった瞬間に絵が遅れないように）
  function preload() {
    for (var i = 0; i < C.CAT_POSES.length; i++) {
      var u = url(C.CAT_POSES[i]);
      if (u) { var im = new Image(); im.src = u; }
    }
  }

  function draw(p) {
    el.setAttribute('data-pose', p);
    var u = url(p);
    el.innerHTML = '';
    el.classList.toggle('art', !!u);
    if (u) {
      var im = document.createElement('img');
      im.alt = ''; im.draggable = false;
      im.onerror = function () { brokenPose[p] = true; if (pose === p) draw(p); };   // 読めなかったら 🐱 に
      im.src = u;
      el.appendChild(im);
    } else {
      var emo = document.createElement('span');
      emo.className = 'emo';
      emo.textContent = C.CAT_FALLBACK;
      el.appendChild(emo);
      var badge = C.CAT_FALLBACK_BADGE[p];
      if (badge) {
        var b = document.createElement('span');
        b.className = 'badge';
        b.textContent = badge;
        el.appendChild(b);
      }
    }
  }

  // ポーズを変える。holdSec を渡すと、その秒数のあと back（省略は normal）に戻る。変わるときは軽く弾む
  function set(p, holdSec, back) {
    if (!el) return;
    clearTimeout(returnTimer); returnTimer = null;
    if (p !== pose) {
      var first = !pose;
      pose = p;
      draw(p);
      if (!first) {
        el.classList.remove('bounce'); void el.offsetWidth; el.classList.add('bounce');
      }
    }
    if (holdSec > 0) {
      returnTimer = setTimeout(function () { returnTimer = null; set(back || 'normal'); }, holdSec * 1000);
    }
  }

  function init() {
    el = document.getElementById('cat');
    if (!el) return;
    el.style.setProperty('--bounce', C.CAT_BOUNCE_SEC + 's');
    preload();
    set('normal');
  }

  return { init: init, set: set, pose: function () { return pose; } };
})();
