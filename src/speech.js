// speech.js — 読み上げ（DESIGN.md §7.3）。ブラウザの speechSynthesis（ja-JP）を使う。
// 設定で切れる。日本語の声が無い端末・speechSynthesis が無い端末では何も起きないだけで、落ちない。
window.SR = window.SR || {};

SR.speech = (function () {
  var C = SR.config;
  var synth = null;
  try { synth = window.speechSynthesis || null; } catch (e) { synth = null; }

  // 日本語の声を探す（無ければ null。lang だけ指定すれば端末が選んでくれる）
  function pickVoice() {
    try {
      var voices = synth.getVoices() || [];
      var lang = C.SPEECH_LANG.toLowerCase().replace('_', '-');
      for (var i = 0; i < voices.length; i++) {
        if (String(voices[i].lang).toLowerCase().replace('_', '-') === lang) return voices[i];
      }
      for (var j = 0; j < voices.length; j++) {
        if (String(voices[j].lang).toLowerCase().indexOf('ja') === 0) return voices[j];
      }
    } catch (e) { /* 何もしない */ }
    return null;
  }

  // BGM を読み上げ中に小さくする（DESIGN §6.3-5）。いま読み上げ中の utterance を数えて、0 になったら戻す。
  // 終わりの合図（end）が来ないブラウザのために、読む文字数から見積もった時間でも戻す（bgm.js の duck の第2引数）
  var live = {};        // 読み上げ中の utterance の番号 → true
  var liveN = 0;        // live の数
  var seq = 0;
  var duckEnd = 0;      // 読み上げが終わるはずの時刻（ms）の見積もり
  function duck(on, ms) { try { if (SR.bgm) SR.bgm.duck(on, ms); } catch (e) { /* 何もしない */ } }
  function forgetAll() { live = {}; liveN = 0; duckEnd = 0; }

  // 前の読み上げを止めて、新しく読む。queue が true のときは止めずに、前の読み上げのあとに続けて読む
  function say(text, queue) {
    if (!synth || !text) return;
    if (!SR.settings.get().speech) return;
    try {
      if (!queue) { synth.cancel(); forgetAll(); }
      var u = new SpeechSynthesisUtterance(text);
      u.lang = C.SPEECH_LANG;
      u.rate = C.SPEECH_RATE;
      u.pitch = C.SPEECH_PITCH;
      var v = pickVoice();
      if (v) u.voice = v;
      var id = ++seq;
      live[id] = true; liveN++;
      var finished = function () {
        if (!live[id]) return;             // cancel() などで、もう数えていないもの
        delete live[id]; liveN--;
        if (liveN <= 0) { liveN = 0; duckEnd = 0; duck(false); }   // 読み上げが全部終わった: BGM を元の大きさに
      };
      u.onend = finished;
      u.onerror = finished;
      var now = Date.now();
      duckEnd = Math.max(now, duckEnd) + (text.length * C.BGM_DUCK_SEC_PER_CHAR + C.BGM_DUCK_PAD_SEC) * 1000;
      duck(true, duckEnd - now);
      synth.speak(u);
    } catch (e) { /* 読み上げられなくても遊べる */ }
  }

  function cancel() {
    try { if (synth) synth.cancel(); } catch (e) { /* 何もしない */ }
    forgetAll();
    duck(false);
  }

  return { say: say, cancel: cancel };
})();
