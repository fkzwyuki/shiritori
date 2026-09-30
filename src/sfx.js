// sfx.js — 効果音。基本は Web Audio で簡単な音を作る。音の並びと大きさは config.js（SFX_*）。
// 正解の音だけは se/maou_se_onepoint15.mp3（魔王魂）を <audio> で鳴らす（file:// でも動く。fetch は使わない）。
// ファイルが無い・鳴らせないときは、Web Audio の音で代わりに鳴らす。Web Audio も使えない端末では無音になるだけ。
window.SR = window.SR || {};

SR.sfx = (function () {
  var C = SR.config;
  var ctx = null;
  var se = null;            // 正解の音の <audio>
  var seBroken = false;     // ファイルが読めなかった（無い・壊れている）
  var seUnlocked = false;
  var sePlayedReal = false;

  // 正解の音を先に読み込んでおく
  function initSE() {
    if (se || !C.SE_CORRECT_FILE) return;
    try {
      se = new Audio();
      se.preload = 'auto';
      se.volume = C.SE_CORRECT_VOLUME;
      se.addEventListener('error', function () { seBroken = true; });   // 404 など。以後は Web Audio の音に切り替える
      se.src = C.SE_CORRECT_FILE;
      if (se.load) se.load();
    } catch (e) { se = null; seBroken = true; }
  }

  // 正解の音をファイルで鳴らす。鳴らせたら true（鳴らせなかったら false → 呼んだ側が代わりの音を鳴らす）
  function playSE() {
    if (!se || seBroken) return false;
    try {
      sePlayedReal = true;     // 許可取り（unlockSE）の再生が、本物の再生を止めないように
      se.muted = false;
      se.volume = C.SE_CORRECT_VOLUME;
      se.currentTime = 0;
      var p = se.play();
      if (p && p.catch) {
        p.catch(function () {
          // 自動再生が止められたなど。代わりの音を鳴らす（ファイルが壊れているわけではないので、次はまた試す）
          playNotes(C.SFX_CORRECT, 'triangle');
        });
      }
      return true;
    } catch (e) { return false; }
  }

  // スマホは最初のタッチのあとでないと <audio> を鳴らせないことがあるので、音を消して一瞬だけ再生して「許可」をもらっておく
  function unlockSE() {
    if (seUnlocked || !se || seBroken) return;
    seUnlocked = true;
    try {
      se.muted = true;
      var p = se.play();
      var done = function () { if (sePlayedReal) return; try { se.pause(); se.currentTime = 0; se.muted = false; } catch (e) { /* 何もしない */ } };
      if (p && p.then) p.then(done, function () { se.muted = false; seUnlocked = false; });
      else done();
    } catch (e) { se.muted = false; }
  }

  // 最初の画面タッチのあとに呼ぶ（スマホはユーザー操作のあとでないと音が出ないため）
  function unlock() {
    initSE();
    unlockSE();
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
  }

  // notes = [[周波数, 長さ秒], ...] を順に鳴らす
  function playNotes(notes, type) {
    if (!ctx) unlock();
    if (!ctx) return;
    try {
      var t = ctx.currentTime + 0.02;
      for (var i = 0; i < notes.length; i++) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = notes[i][0];
        var dur = notes[i][1];
        // ぷつっという雑音が出ないよう、音量を短く立ち上げて、ゆっくり下げる
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(C.SFX_VOLUME, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
        t += dur;
      }
    } catch (e) { /* 鳴らせなくても遊べる */ }
  }

  // カードをめくる音「ぱらっ」: 短いノイズを、高さを上げながら帯域フィルターに通す（Web Audio だけで作る。config の SFX_FLIP）
  var noiseBuf = null;
  function playFlip() {
    if (!ctx) unlock();
    if (!ctx) return;
    try {
      var F = C.SFX_FLIP;
      var t = ctx.currentTime + 0.01;
      if (!noiseBuf) {
        noiseBuf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * F.sec), ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      var src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(F.from, t);
      bp.frequency.exponentialRampToValueAtTime(F.to, t + F.sec);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(F.volume, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + F.sec);
      src.connect(bp); bp.connect(g); g.connect(ctx.destination);
      src.start(t);
      src.stop(t + F.sec + 0.02);
    } catch (e) { /* 鳴らせなくても遊べる */ }
  }

  // name: 'correct' / 'heart' / 'miss' / 'button' / 'beep' / 'flip'
  function play(name) {
    if (name === 'flip') { playFlip(); return; }
    if (name === 'correct') { if (!playSE()) playNotes(C.SFX_CORRECT, 'triangle'); }
    else if (name === 'heart') { playSE(); playNotes(C.SFX_HEART, 'triangle'); }   // ♥は、正解の音と駆け上がる音を重ねる
    else if (name === 'beep') playNotes(C.SFX_BEEP, 'sine');
    else if (name === 'miss') playNotes(C.SFX_MISS, 'sine');
    else if (name === 'button') playNotes(C.SFX_BUTTON, 'sine');
  }

  initSE();   // 起動時に音のファイルを読み込み始める
  return { unlock: unlock, play: play, isFileBroken: function () { return seBroken; } };
})();
