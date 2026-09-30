// wakelock.js — ゲーム中は画面が消えない（スリープしない）ようにする（Wake Lock API）。
// 使えない端末・許可されない場合は何もしない（エラーも出さない）。
// タブを切り替えて戻ってきたときは自動で取り直す（ブラウザは、画面が隠れると自動で手放すため）。
window.SR = window.SR || {};

SR.wake = (function () {
  var C = SR.config;
  var wanted = false;    // いまゲーム中で、画面を消したくない
  var lock = null;       // 取れているロック
  var pending = false;   // 取得の途中

  function supported() {
    return C.WAKE_LOCK && typeof navigator !== 'undefined' && !!navigator.wakeLock && !!navigator.wakeLock.request;
  }

  function acquire() {
    if (!wanted || lock || pending || !supported()) return;
    if (document.visibilityState && document.visibilityState !== 'visible') return;   // 見えていないときは取れない
    pending = true;
    try {
      navigator.wakeLock.request('screen').then(function (l) {
        pending = false;
        if (!wanted) { try { l.release(); } catch (e) {} return; }   // 取れる前にゲームが終わっていた
        lock = l;
        l.addEventListener('release', function () { if (lock === l) lock = null; });
      }, function () { pending = false; });   // 省電力モードなどで断られても、何もしない
    } catch (e) { pending = false; }
  }

  // ゲームが始まった: 画面を消さない
  function hold() { wanted = true; acquire(); }

  // ゲームが終わった（結果画面・スタート画面）: 手放す
  function release() {
    wanted = false;
    if (lock) { try { lock.release(); } catch (e) {} lock = null; }
  }

  // タブに戻ってきたら取り直す
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') acquire();
  });

  return { hold: hold, release: release, supported: supported, isHeld: function () { return !!lock; } };
})();
