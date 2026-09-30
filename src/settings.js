// settings.js — スタート画面の設定（ヒントの秒数／おとなにもヒント／よみあげ／おんがく）。
// 初期値は config.js。変えたら localStorage に覚える。localStorage が使えなくても動く。
window.SR = window.SR || {};

SR.settings = (function () {
  var C = SR.config;

  // 設定の初期値（config.js の値）
  function defaults() {
    return {
      hintSec: C.HINT_DELAY_SEC,       // ヒント1枚目までの秒数（2枚目は config の HINT_INTERVAL_SEC）
      hintForAdult: C.HINT_FOR_ADULT,  // おとなの番にもヒントを出すか
      speech: C.SPEECH_ON,             // よみあげ
      music: C.BGM_ON,                 // おんがく（BGM）。保存された値が無ければ初期値（設定の保存名の版は上げていない）
      kidName: C.DEFAULT_KID_NAME,     // こどもの名前（空なら「こども」と出す）
      adultName: C.DEFAULT_ADULT_NAME  // おとなの名前（空なら「おとな」と出す）
    };
  }

  var values = defaults();

  // localStorage から読む（使えない・壊れているときは初期値のまま）
  function load() {
    try {
      var raw = window.localStorage.getItem(C.SETTINGS_KEY);
      // 設定がまだ保存されていなくても、下の名前は読む（ここで return しない）
      var saved = raw ? JSON.parse(raw) : {};
      if (typeof saved.hintSec === 'number' && C.HINT_SEC_OPTIONS.indexOf(saved.hintSec) >= 0) {
        values.hintSec = saved.hintSec;
      }
      if (typeof saved.hintForAdult === 'boolean') values.hintForAdult = saved.hintForAdult;
      if (typeof saved.speech === 'boolean') values.speech = saved.speech;
      if (typeof saved.music === 'boolean') values.music = saved.music;
    } catch (e) {
      // 使えなくても遊べるので、何もしない
    }
    // 名前は設定とは別の場所に覚える（設定の版を上げても名前は消えないように）
    try {
      var names = JSON.parse(window.localStorage.getItem(C.NAMES_KEY) || 'null');
      if (!names) {
        // 名前を別にする前（settings.v3）に入れた名前があれば引き継ぐ
        var old = JSON.parse(window.localStorage.getItem('shiritori.settings.v3') || 'null');
        if (old) names = { kidName: old.kidName, adultName: old.adultName };
      }
      if (names && typeof names.kidName === 'string') values.kidName = names.kidName.slice(0, C.NAME_MAX_LEN);
      if (names && typeof names.adultName === 'string') values.adultName = names.adultName.slice(0, C.NAME_MAX_LEN);
    } catch (e) {
      // 使えなくても遊べるので、何もしない
    }
  }

  function save() {
    try {
      window.localStorage.setItem(C.SETTINGS_KEY, JSON.stringify({
        hintSec: values.hintSec, hintForAdult: values.hintForAdult, speech: values.speech, music: values.music
      }));
      window.localStorage.setItem(C.NAMES_KEY, JSON.stringify({ kidName: values.kidName, adultName: values.adultName }));
    } catch (e) {
      // 使えなくても遊べるので、何もしない
    }
  }

  load();

  return {
    get: function () { return values; },
    // 1つ変えて、覚える
    set: function (key, value) {
      values[key] = value;
      save();
    },
    // 画面・読み上げ・結果に出す名前（who = 'kid' / 'adult'）。空なら「こども」「おとな」
    name: function (who) {
      var n = String(values[who + 'Name'] || '').trim().slice(0, C.NAME_MAX_LEN);
      return n || (who === 'kid' ? C.FALLBACK_KID_NAME : C.FALLBACK_ADULT_NAME);
    },
    // ヒントの秒数を、選べる値の次のものに進める（ボタンだけ → 0 → 2 → 3 → 5 → 8 → ボタンだけ …）
    nextHintSec: function () {
      var opts = C.HINT_SEC_OPTIONS;
      var i = opts.indexOf(values.hintSec);
      this.set('hintSec', opts[(i + 1) % opts.length]);
    }
  };
})();
