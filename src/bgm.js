// bgm.js — BGM（DESIGN.md §6.3-5）。bgm/ に置いた曲（config の BGM_FILE）を <audio loop> で小さくくり返し流す。
//   ・声を聞き取っている間は止める（listening）／読み上げ中は小さくする（duck）
//   ・曲が無い・鳴らせないときは何もしない（エラーを出さない）。曲があるかは build/words.js の SR_ASSETS（tools/build_words.py が作る）で知る
//   ・スマホは最初のタッチのあとでないと鳴らないので、start() は「はじめる」などのタッチの中で呼ぶ
//   ・<audio> だけを使う（fetch・import は使わない。file:// でも動く）
window.SR = window.SR || {};

SR.bgm = (function () {
  var C = SR.config;
  var audio = null;
  var wanted = false;        // ゲーム中で、「おんがく」がオン（流したい状態）
  var listening = false;     // 声を聞き取っている間（止める）
  var ducked = false;        // 読み上げ中（小さくする）
  var duckTimer = null;      // 読み上げの終わりの合図が来ない端末のための保険
  var fadeTimer = null;
  var calls = { play: 0, pause: 0 };   // 確認用: play/pause を呼んだ回数

  // 曲のファイルがあるか（SR_ASSETS に載っているときだけ）
  function available() {
    return !!(C.BGM_FILE && window.SR_ASSETS && window.SR_ASSETS[C.BGM_FILE]);
  }

  function ensure() {
    if (audio || !available()) return audio;
    try {
      audio = new Audio();
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      audio.addEventListener('error', function () { audio = null; });   // 読めなかった: 以後は何もしない
      audio.src = C.BGM_FILE;
    } catch (e) { audio = null; }
    return audio;
  }

  function targetVolume() { return ducked ? C.BGM_VOLUME_DUCK : C.BGM_VOLUME; }

  // 音の大きさを、少しずつ目標に近づける
  function fadeTo(v) {
    clearInterval(fadeTimer); fadeTimer = null;
    if (!audio) return;
    var step = 0.05;
    var n = Math.max(1, Math.round(C.BGM_FADE_SEC * 1000 / (step * 1000)));
    var from = audio.volume, i = 0;
    if (n <= 1 || from === v) { setVol(v); return; }
    fadeTimer = setInterval(function () {
      i++;
      setVol(from + (v - from) * Math.min(1, i / n));
      if (i >= n) { clearInterval(fadeTimer); fadeTimer = null; }
    }, step * 1000);
  }
  function setVol(v) { try { if (audio) audio.volume = Math.max(0, Math.min(1, v)); } catch (e) { /* 何もしない */ } }

  // 今の状態に合わせて、流す／止める／大きさを決める
  function apply() {
    if (!audio) return;
    var shouldPlay = wanted && !listening && !document.hidden;
    try {
      if (shouldPlay) {
        if (audio.paused) {
          calls.play++;
          var p = audio.play();
          if (p && p.catch) p.catch(function () { /* 自動再生を止められた。次のタッチの start() でまた試す */ });
        }
        fadeTo(targetVolume());
      } else if (!audio.paused) {
        calls.pause++;
        audio.pause();
      }
    } catch (e) { /* 何もしない */ }
  }

  // ゲームの開始（「はじめる」「もういっかい」のタッチの中で呼ぶ）。「おんがく」がオフなら流さない
  function start() {
    wanted = !!SR.settings.get().music;
    if (!wanted || !available()) return;
    if (!ensure()) return;
    apply();
  }

  // 結果画面・スタート画面では止める
  function stop() {
    wanted = false;
    listening = false;
    ducked = false;
    clearTimeout(duckTimer); duckTimer = null;
    if (audio) { apply(); try { audio.currentTime = 0; } catch (e) { /* 何もしない */ } }
  }

  // 声を聞き取っている間は止める（on=true）。終わったら戻す（on=false）
  function setListening(on) {
    on = !!on;
    if (listening === on) return;
    listening = on;
    apply();
  }

  // 読み上げ中は小さくする。on=true のとき ms（読み上げが終わるはずの時間）を渡すと、その時間がたったら、終わりの合図が来なくても戻す
  function duck(on, ms) {
    clearTimeout(duckTimer); duckTimer = null;
    ducked = !!on;
    if (on && ms > 0) duckTimer = setTimeout(function () { duckTimer = null; ducked = false; apply(); }, ms);
    apply();
  }

  // タブが隠れたら止め、戻ったら続ける
  document.addEventListener('visibilitychange', function () { apply(); });

  return {
    available: available, start: start, stop: stop, listening: setListening, duck: duck,
    // 確認・デバッグ用
    debug: function () {
      return { available: available(), wanted: wanted, listening: listening, ducked: ducked, paused: audio ? audio.paused : null, volume: audio ? audio.volume : null, calls: calls };
    }
  };
})();
