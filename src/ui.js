// ui.js — 画面の拡大・縮小、画面の切り替え、表示の部品（星のマークなど）。
window.SR = window.SR || {};

SR.ui = (function () {
  var C = SR.config;

  // ---- 基準サイズの画面を、ブラウザの大きさに合わせて拡大・縮小する ----
  // 横長のとき: 1024x768。縦長のとき: 幅 768、高さ 1024〜（縦横比しだい）にして、#stage に class "portrait" を付ける。
  // 中身の並べ替えは style.css の .portrait。
  var typing = false;    // 名前を入力している間は、画面の大きさを測り直さない（キーボードが出て画面が縮んでも、向きが変わったと勘違いしないため）
  function setTyping(on) { typing = on; if (!on) fitStage(); }

  function fitStage() {
    var stage = document.getElementById('stage');
    if (!stage || typing) return;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var portrait = vh > vw;
    var w = portrait ? C.STAGE_PORTRAIT_W : C.STAGE_W;
    var h = C.STAGE_H;
    if (portrait) {
      h = Math.round(w * vh / vw);   // 幅にぴったり合わせたときの高さ
      h = Math.max(C.STAGE_PORTRAIT_H_MIN, Math.min(C.STAGE_PORTRAIT_H_MAX, h));
    }
    stage.classList.toggle('portrait', portrait);
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    var scale = Math.min(vw / w, vh / h);
    var x = (vw - w * scale) / 2;   // 余った分は左右（上下）に均等にあけて、まんなかに置く
    var y = (vh - h * scale) / 2;
    stage.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
  }

  // ---- 画面全体の地の色を、番の人の色にする（'kid' / 'adult'。null でふつうの色） ----
  function setTurnTheme(who) {
    document.documentElement.className = who ? 'turn-' + who : '';
  }

  // ---- 画面の切り替え（'start' / 'game'） ----
  function showScreen(name) {
    if (name !== 'game') setTurnTheme(null);
    var screens = document.querySelectorAll('#stage > .screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].hidden = (screens[i].id !== 'screen-' + name);
    }
  }

  // ---- 星とハートのマーク（DESIGN.md §4.4） ----
  // total = 正解の回数。♥ が total/STARS_PER_HEART 個、★ が余り、残りは灰色の ★。
  function marksHTML(total) {
    var per = C.STARS_PER_HEART;
    var hearts = Math.floor(total / per);
    var stars = total % per;
    var html = '';
    if (hearts > 0) {
      var h = '';
      for (var i = 0; i < hearts; i++) h += '♥';
      html += '<span class="h">' + h + '</span> ';
    }
    var s = '', e = '';
    for (var j = 0; j < stars; j++) s += '★';
    for (var k = stars; k < per; k++) e += '★';
    html += '<span class="s">' + s + '</span><span class="e">' + e + '</span>';
    return html;
  }

  // 絵・曲のファイルが「実際にある」ときだけ、そのパスを返す（無ければ空。無いファイルを読みに行って 404 を出さないため）。
  // 一覧は build/words.js の SR_ASSETS（tools/build_words.py が images/_*.png と bgm/ を調べて作る）
  function asset(path) {
    return (window.SR_ASSETS && window.SR_ASSETS[path]) ? path : '';
  }

  return {
    asset: asset,
    fitStage: fitStage,
    setTyping: setTyping,
    setTurnTheme: setTurnTheme,
    showScreen: showScreen,
    marksHTML: marksHTML
  };
})();
