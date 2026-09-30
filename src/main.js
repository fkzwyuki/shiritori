// main.js — 起動。スタート画面の設定ボタンと「はじめる」。ゲームの中身は game.js。
window.SR = window.SR || {};

SR.main = (function () {
  var C = SR.config;
  var $ = function (id) { return document.getElementById(id); };

  // ---- スタート画面: 設定の表示を今の値に合わせる ----
  function renderSettings() {
    var s = SR.settings.get();
    $('set-hint').textContent = 'ヒント: ' + (s.hintSec < 0 ? 'ボタンだけ' : (s.hintSec === 0 ? 'すぐ' : s.hintSec + 'びょう'));
    $('set-adult').textContent = 'おとなにもヒント: ' + (s.hintForAdult ? 'する' : 'しない');
    $('set-speech').textContent = 'よみあげ: ' + (s.speech ? 'する' : 'しない');
    $('set-music').textContent = 'おんがく: ' + (s.music ? 'する' : 'しない');
  }

  // 名前の入力欄（ひらがな想定。打つたびに覚える。空のままなら「こども」「おとな」と出る）
  function bindNames() {
    var inputs = [['kid', $('name-in-kid')], ['adult', $('name-in-adult')]];
    inputs.forEach(function (pair) {
      var who = pair[0], el = pair[1];
      el.maxLength = C.NAME_MAX_LEN;
      el.value = SR.settings.get()[who + 'Name'] || '';
      el.addEventListener('input', function () { SR.settings.set(who + 'Name', el.value.trim().slice(0, C.NAME_MAX_LEN)); });
      el.addEventListener('focus', function () { SR.ui.setTyping(true); });
      el.addEventListener('blur', function () { SR.ui.setTyping(false); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') el.blur(); });
    });
  }

  function bindStart() {
    bindNames();
    $('set-hint').addEventListener('click', function () {
      SR.settings.nextHintSec();
      renderSettings();
    });
    $('set-adult').addEventListener('click', function () {
      SR.settings.set('hintForAdult', !SR.settings.get().hintForAdult);
      renderSettings();
    });
    $('set-speech').addEventListener('click', function () {
      SR.settings.set('speech', !SR.settings.get().speech);
      renderSettings();
    });
    $('set-music').addEventListener('click', function () {
      SR.settings.set('music', !SR.settings.get().music);
      renderSettings();
    });
    $('btn-start').addEventListener('click', function () {
      SR.sfx.unlock();
      SR.sfx.play('button');
      SR.voice.reset();             // 新しいゲーム: 聞き取りをもう一度使ってみる
      SR.voice.primePermission();   // マイクの許可をここで1回だけ求める（拒否されても五十音表で遊べる）
      SR.game.start();
    });
  }

  // Service Worker（sw.js）: ホーム画面に「インストール」できる条件を満たすための最小のもの。
  // 何も保存しない（いつでもサーバーの最新を取りに行く）ので、古い版は残らない。file:// や未対応の端末では何もしない。
  function registerSW() {
    if (!C.SERVICE_WORKER || !/^https?:$/.test(location.protocol)) return;
    if (!navigator.serviceWorker || !navigator.serviceWorker.register) return;
    try {
      navigator.serviceWorker.register('sw.js').then(null, function () {});
    } catch (e) {}
  }

  function init() {
    SR.ui.fitStage();
    SR.dict.preloadImages();   // ヒントの絵を先に読み込んでおく
    // おばけ・列車の絵も先に読み込んでおく（あるものだけ。ねこの絵は cat.js が読み込む）
    ['images/_nobake_in.png', 'images/_nobake_out.png', 'images/_train_engine.png', 'images/_train_car.png'].forEach(function (path) {
      var url = SR.ui.asset(path);
      if (url) { var im = new Image(); im.src = url; }
    });
    var refit = function () { SR.ui.fitStage(); SR.game.relayout(); };   // 向きが変わったら、れっしゃの車両の幅も合わせ直す
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
    // 最初の画面タッチで効果音を使えるようにする（スマホはタッチのあとでないと音が出ない）
    document.addEventListener('pointerdown', SR.sfx.unlock);
    renderSettings();
    bindStart();
    SR.game.init();
    SR.cat.init();
    SR.voice.initFake();    // #fakevoice のときだけ試験用の入力欄が出る
    SR.ui.showScreen('start');
    registerSW();
  }

  return { init: init, renderSettings: renderSettings };
})();

// 全部の <script> を読み終わってから始める
window.addEventListener('DOMContentLoaded', SR.main.init);
