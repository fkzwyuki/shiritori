// voice.js — 声の聞き取り（DESIGN.md §4.2）。Web Speech API（SpeechRecognition）を1回だけ聞く部品。
// 画面には触らない（試験用の #fakevoice の小さな入力欄だけ例外）。読みへの変換・候補の選び方は reading.js。
// 聞き取りの結果は、コールバックに次のどれか1つが1回だけ渡る:
//   { type: 'result', candidates: [{ transcript, confidence }] }  … 聞き取れた
//   { type: 'fail',   kind }                                       … 聞き取れなかった（no-speech・何も返らない・時間切れなど）
//   { type: 'fatal',  error }                                      … この端末では使えない（許可なし・ネットなし・マイクなし）。
//                                                                    このゲーム中は使えないことにする（usable() が false になる）
// listen(cb, hooks) の hooks（どちらも省略できる）:
//   onStart()        … マイクが入って、話してよくなったとき（「ピッ」の合図に使う）
//   onInterim(text)  … 聞こえた途中の文字（確定する前。interimResults）
// 試験用: URL に #voicelog を付けると、聞き取りのイベント（start/audiostart/speechstart/result/error/end とその時刻）を画面の隅に出す。
// 試験用: URL に #fakevoice を付けると、実際のマイクの代わりに小さな入力欄が出て、
//         「きこえた／きこえない／エラー」を手で再現できる（SR.voice.fake でも同じことができる）。
window.SR = window.SR || {};

SR.voice = (function () {
  var C = SR.config;
  var RecogClass = null;
  try { RecogClass = window.SpeechRecognition || window.webkitSpeechRecognition || null; } catch (e) { RecogClass = null; }

  // この端末では使えない、という種類のエラー（ほかは「聞き取れなかった」として数える）
  var FATAL = {
    'not-allowed': 1, 'service-not-allowed': 1, 'network': 1, 'audio-capture': 1,
    'language-not-supported': 1, 'start-failed': 1, 'denied': 1
  };

  var disabledReason = '';   // 空でなければ、このゲーム中は使わない（五十音表のままにする）
  var fakePending = null;    // 試験用: 今待っている聞き取り

  function isFake() { return /fakevoice/.test(location.hash || ''); }
  function supported() { return isFake() || !!RecogClass; }
  function usable() { return supported() && !disabledReason; }
  var api = {};   // 公開する関数（下で入れる）。api.onChange に関数を入れると、使える／使えないが変わったときに呼ばれる
  function changed() { updateFake(); if (api.onChange) { try { api.onChange(); } catch (e) { /* 何もしない */ } } }
  function disable(reason) { disabledReason = reason || 'disabled'; changed(); }
  function reset() { disabledReason = ''; changed(); }
  function reason() { return disabledReason; }

  // マイクの許可を先に取る（「はじめる」を押したときに1回）。許可が取れたらすぐトラックを止める。
  // 拒否された・マイクがないときは、このゲーム中は聞き取りを使わない。
  function primePermission() {
    if (isFake() || !RecogClass) return;
    var md = null;
    try { md = navigator.mediaDevices; } catch (e) { md = null; }
    if (!md || !md.getUserMedia) return;   // http のLANなどでは無い。聞き取りを始めたときにエラーになり五十音表へ
    try {
      md.getUserMedia({ audio: true }).then(function (stream) {
        try {
          var tracks = stream.getTracks();
          for (var i = 0; i < tracks.length; i++) tracks[i].stop();
        } catch (e) { /* 何もしない */ }
      }, function () {
        disable('denied');
      });
    } catch (e) { disable('denied'); }
  }

  // ============================================================
  // 記録欄（URL に #voicelog を付けたときだけ。実機で声の不具合を調べるため）
  // ============================================================
  var logEl = null, logLines = [], logT0 = 0;
  function logOn() { return /voicelog/.test(location.hash || ''); }
  function logStart(label) {
    logT0 = (window.performance && performance.now) ? performance.now() : Date.now();
    log('--- ' + label);
  }
  function log(name, detail) {
    if (!logOn()) return;
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    var line = '+' + ((now - logT0) / 1000).toFixed(2) + 's ' + name + (detail ? ' ' + detail : '');
    logLines.push(line);
    while (logLines.length > C.VOICE_LOG_MAX) logLines.shift();
    if (!logEl) {
      logEl = document.createElement('pre');
      logEl.id = 'voicelog';
      document.body.appendChild(logEl);
    }
    logEl.hidden = false;
    logEl.textContent = logLines.join('\n');
  }
  window.addEventListener('hashchange', function () { if (logEl) logEl.hidden = !logOn(); });

  // ============================================================
  // 1回だけ聞き取る。返り値の abort() で、結果を待たずにやめられる（コールバックは呼ばれない）
  // ============================================================
  var listenCount = 0;
  function listen(cb, hooks) {
    hooks = hooks || {};
    var done = false, timer = null, rec = null, beepTimer = null, beeped = false, lastInterim = '';
    logStart('listen #' + (++listenCount));

    function callHook(name, arg) {
      if (hooks[name]) { try { hooks[name](arg); } catch (e) { /* 何もしない */ } }
    }
    // 「話していいよ」の合図は1回だけ
    function beep(why) {
      if (beeped || done) return;
      beeped = true;
      clearTimeout(beepTimer);
      log('beep', '(' + why + ')');
      callHook('onStart');
    }
    function finish(ev) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(beepTimer);
      log('finish', ev.type + (ev.error ? ' ' + ev.error : '') + (ev.kind ? ' ' + ev.kind : ''));
      if (fakePending && fakePending.finish === finish) fakePending = null;
      if (ev.type === 'fatal') disable(ev.error); else updateFake();
      cb(ev);
    }
    var handle = {
      abort: function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(beepTimer);
        log('abort');
        if (rec) { try { rec.abort(); } catch (e) { /* 何もしない */ } }
        if (fakePending && fakePending.finish === finish) { fakePending = null; updateFake(); }
      }
    };

    // ---- 試験用（#fakevoice）: 入力欄から結果を入れてもらう ----
    if (isFake()) {
      fakePending = { finish: finish, interim: function (text) { log('result', 'interim "' + text + '"'); callHook('onInterim', text); } };
      updateFake();
      setTimeout(function () { log('fake start'); beep('fake'); }, 0);
      return handle;
    }

    // ---- ほんもの ----
    function failLater(error) { setTimeout(function () { finish({ type: 'fatal', error: error }); }, 0); }
    try {
      rec = new RecogClass();
    } catch (e) { failLater('start-failed'); return handle; }
    rec.lang = C.SPEECH_LANG;
    rec.maxAlternatives = C.VOICE_MAX_ALTERNATIVES;
    rec.interimResults = !!C.VOICE_INTERIM;
    rec.continuous = false;

    var err = '';
    // 記録だけのイベント（動きは変えない）
    ['audioend', 'soundstart', 'soundend', 'speechstart', 'speechend', 'nomatch'].forEach(function (name) {
      rec['on' + name] = function () { log(name); };
    });
    rec.onstart = function () {
      log('start');
      // audiostart（マイクが入った）が来なければ、少し待って合図を鳴らす
      clearTimeout(beepTimer);
      beepTimer = setTimeout(function () { beep('fallback'); }, C.VOICE_BEEP_FALLBACK_SEC * 1000);
    };
    rec.onaudiostart = function () { log('audiostart'); beep('audiostart'); };
    rec.onerror = function (e) { err = (e && e.error) || 'unknown'; log('error', err + (e && e.message ? ' (' + e.message + ')' : '')); };
    rec.onresult = function (e) {
      // 確定した結果があれば、その候補を全部取る。まだなら、聞こえた途中の文字を知らせる
      var cands = [], interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var res = e.results[i];
        if (res.isFinal) {
          if (!cands.length) for (var k = 0; k < res.length; k++) cands.push({ transcript: res[k].transcript, confidence: res[k].confidence });
        } else {
          interim += res[0].transcript;
        }
      }
      if (cands.length) {
        log('result', 'final ' + cands.map(function (c) { return '"' + c.transcript + '"(' + (typeof c.confidence === 'number' ? c.confidence.toFixed(2) : '?') + ')'; }).join(' '));
        finish({ type: 'result', candidates: cands });
        try { rec.stop(); } catch (e2) { /* 何もしない */ }
      } else if (interim) {
        lastInterim = interim;
        log('result', 'interim "' + interim + '"');
        if (!done) callHook('onInterim', interim);
      }
    };
    rec.onend = function () {
      log('end');
      if (done) return;
      if (FATAL[err]) finish({ type: 'fatal', error: err });
      else if (!err && lastInterim) finish({ type: 'result', candidates: [{ transcript: lastInterim, confidence: 0 }] });   // 確定が来ないまま終わったときは、途中の文字を最後の頼りにする
      else finish({ type: 'fail', kind: err || 'nomatch' });
    };
    timer = setTimeout(function () {
      if (done) return;
      log('timeout');
      try { rec.abort(); } catch (e) { /* 何もしない */ }
      finish({ type: 'fail', kind: 'timeout' });
    }, C.VOICE_TIMEOUT_SEC * 1000);
    try {
      rec.start();
    } catch (e) { failLater('start-failed'); }
    return handle;
  }

  // ============================================================
  // 試験用の入力欄（#fakevoice のときだけ出る。ふだんは hidden）
  // ============================================================
  function $(id) { return document.getElementById(id); }

  // 試験用の操作。SR.voice.fake からも呼べる（ブラウザペインの確認用）
  var fake = {
    // 聞き取れた。'りんご' または 'りんご/林檎'（/ で候補を分ける）または配列
    hear: function (text) {
      if (!fakePending) return false;
      var parts = Array.isArray(text) ? text : String(text == null ? '' : text).split(/[\/／]/);
      var cands = [];
      for (var i = 0; i < parts.length; i++) {
        if (String(parts[i]).trim() !== '') cands.push({ transcript: String(parts[i]).trim(), confidence: i === 0 ? 0.9 : 0.5 });
      }
      if (!cands.length) { fakePending.finish({ type: 'fail', kind: 'nomatch' }); return true; }
      fakePending.finish({ type: 'result', candidates: cands });
      return true;
    },
    // 聞こえた途中の文字（確定する前）を知らせる
    interim: function (text) {
      if (!fakePending || !fakePending.interim) return false;
      fakePending.interim(String(text == null ? '' : text));
      return true;
    },
    // 聞き取れない（no-speech）
    silent: function () {
      if (!fakePending) return false;
      fakePending.finish({ type: 'fail', kind: 'no-speech' });
      return true;
    },
    // エラー（'not-allowed' 'network' 'audio-capture' など。FATAL の中なら使えなくなる）
    error: function (code) {
      if (!fakePending) return false;
      code = code || 'not-allowed';
      fakePending.finish(FATAL[code] ? { type: 'fatal', error: code } : { type: 'fail', kind: code });
      return true;
    },
    pending: function () { return !!fakePending; }
  };

  function updateFake() {
    var panel = $('fakevoice');
    if (!panel) return;
    panel.hidden = !isFake();
    var s = $('fv-state');
    if (s) s.textContent = fakePending ? 'きいてるよ（入力まち）' : (disabledReason ? 'つかえない: ' + disabledReason : 'まち');
    panel.classList.toggle('live', !!fakePending);
  }

  function initFake() {
    var panel = $('fakevoice');
    if (!panel) return;
    updateFake();
    window.addEventListener('hashchange', updateFake);
    $('fv-hear').addEventListener('click', function () { fake.hear($('fv-text').value); });
    $('fv-text').addEventListener('input', function () { if (fakePending) fake.interim($('fv-text').value); });   // 打っている間は「聞こえた途中の文字」になる
    $('fv-text').addEventListener('keydown', function (e) { if (e.key === 'Enter') fake.hear($('fv-text').value); });
    $('fv-silent').addEventListener('click', function () { fake.silent(); });
    $('fv-error').addEventListener('click', function () { fake.error($('fv-err').value); });
  }

  api.supported = supported; api.usable = usable; api.disable = disable; api.reset = reset; api.reason = reason;
  api.primePermission = primePermission; api.listen = listen;
  api.fake = fake; api.initFake = initFake; api.isFake = isFake;
  api.onChange = null;
  return api;
})();
