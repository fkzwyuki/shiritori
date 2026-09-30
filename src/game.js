// game.js — ゲームの中身。ターンの流れ、ヒント、正解・やり直し、五十音のキーボード、やめる・結果。
// DESIGN.md §3.2〜3.4、§4、§5 のとおり。声の入力（マイク）は Step 5 で足す。
window.SR = window.SR || {};

SR.game = (function () {
  var C = SR.config;
  var K = SR.kana;
  var D = SR.dict;
  var $ = function (id) { return document.getElementById(id); };

  // ゲームの状態。start() で作り直す。
  //   turn      … 'kid' / 'adult'
  //   total     … { kid, adult } 正解の回数（星の数）
  //   prevLabel … 「まえのことば」に出す文字（五十音表で答えたときは「（り）」）
  //   next      … 次の始まりとして認める文字 { chars: [代表, ...] }
  //   used      … 使用済みの言葉 { 読み: true }
  //   chain     … これまでの言葉の並び（記録用）
  //   cars      … れっしゃの車両 [{ display, reading }]（正解のたびに1両ふえる）
  //   hints     … いま出しているヒントの言葉（最大 HINT_MAX 枚）
  //   slotOf    … hints の i 番目が、どのカードの枠（0〜）にめくれているか
  //   idleDone  … この手番で、ねこが「ひんと おしてみる？」をもう言ったか（1手番に1回まで）
  //   nudge     … 「ひんと」ボタンを光らせているか
  //   catFlip   … 正解のねこのポーズを happy / dance 交互にするための印
  //   queue     … この手番のヒント候補（出す順）、qpos … 次に出す位置
  //   phase     … 'play'（入力待ち）/ 'busy'（演出中）/ 'listen'（なんて いった？）/ 'kana'（五十音のキーボード）/ 'confirm'（やめる確認）/ 'result'
  //   listen    … 聞き取り中の状態 { mode: 'self'（ほかの ことば から。v0.5.1 で ○ボタンは廃止）, fails: 続けて聞き取れなかった数,
  //                 retried: 何も聞こえずに自動で聞き直した回数, cands: 出している候補ボタン（rank の結果） }
  //   kanaBuf   … キーボード（五十音表）で打っている言葉
  var st = null;
  var hintTimer = null;
  var overlayTimer = null;
  var toastTimer = null;
  var kanaMode = '';     // キーボードの濁点モード: '' / 'daku' / 'handaku'
  var listenHandle = null;   // いま動いている聞き取り（voice.listen の返り値）
  var listenToken = 0;       // 古い聞き取りの結果を無視するための番号
  var flyTimer = null;       // 星が点数の枠に着いたときの更新の予約
  var idleTimer = null;      // だまって IDLE_HINT_SEC たったらねこが考える、の予約
  var carTimer = null;       // 正解の演出の途中で、れっしゃに車両をつなぐ予約
  var hintsMode = '';        // ヒントの枠の今の作り: 'cards'（めくるカード）/ 'none'（ヒントなしの表示）/ ''（まだ作っていない）
  var slotEls = [];          // めくるカードの要素（枠の番号順）

  function other(who) { return who === 'kid' ? 'adult' : 'kid'; }
  function whoName(who) { return SR.settings.name(who); }   // スタート画面で決めた名前（空なら こども／おとな）

  // ============================================================
  // 開始
  // ============================================================
  function start() {
    clearTimers();
    stopListening();
    SR.speech.cancel();
    hideAllOverlays();
    st = {
      turn: C.FIRST_PLAYER,
      total: { kid: 0, adult: 0 },
      prevLabel: C.FIRST_WORD,
      next: K.nextChars(C.FIRST_WORD),
      used: {},
      chain: [C.FIRST_WORD],
      cars: [],
      hints: [], slotOf: [], queue: [], qpos: 0,
      catFlip: false, idleDone: false, nudge: false,
      phase: 'play'
    };
    st.used[C.FIRST_WORD] = true;
    SR.ui.showScreen('game');
    SR.wake.hold();       // ゲーム中は画面を消さない
    SR.bgm.start();       // BGM（「はじめる」「もういっかい」のタッチの中。曲が無い・オフなら何もしない）
    SR.cat.set('normal');
    SR.train.renderStrip(st.cars);
    beginTurn();
  }

  function clearTimers() {
    clearTimeout(hintTimer); hintTimer = null;
    clearTimeout(overlayTimer); overlayTimer = null;
    clearTimeout(flyTimer); flyTimer = null;
    clearTimeout(idleTimer); idleTimer = null;
    clearTimeout(carTimer); carTimer = null;
  }

  function hideAllOverlays() {
    var ids = ['ov-correct', 'ov-miss', 'ov-listen', 'ov-kana', 'ov-quit', 'toast'];
    for (var i = 0; i < ids.length; i++) $(ids[i]).hidden = true;
    $('fly').innerHTML = '';
    $('screen-game').classList.remove('scoring');
    hideGhost();
  }

  // 手番のはじまり: ヒント候補を作り直して、ヒントの予約をする
  function beginTurn() {
    clearTimeout(hintTimer); hintTimer = null;
    clearTimeout(idleTimer); idleTimer = null;
    st.phase = 'play';
    st.hints = [];
    st.slotOf = [];
    st.idleDone = false;
    st.nudge = false;
    hintsMode = '';         // カードは新しく作り直す（ぜんぶ裏向き）
    st.queue = D.hintQueue(st.next.chars, st.used);
    st.qpos = 0;
    render();
    // ねこ: 子どもの番は声をかける（数秒で normal に戻る）、おとなの番は おうえん
    if (st.turn === 'kid') SR.cat.set('call', C.CAT_CALL_SEC, 'normal');
    else SR.cat.set('cheer');
    SR.speech.say(whoName(st.turn) + 'の ばん', true);   // だれの番かを声でも知らせる（前の「せいかい！」は切らずに続けて読む）
    if (!hintAllowed()) return;
    if (SR.settings.get().hintSec === 0) showHints(C.HINT_MAX);   // 0 = 最初から出す
    else scheduleHints();
  }

  // ============================================================
  // ヒント（DESIGN.md §4.3）
  // ============================================================
  // おとなの番は、設定の「おとなにもヒント」がオンのときだけ
  function hintAllowed() {
    return st.turn === 'kid' || SR.settings.get().hintForAdult;
  }
  function remaining() { return st.queue.length - st.qpos; }

  // まだ絵が出ていない（裏向きの）カードの枠のうち、いちばん左のもの
  function firstFreeSlot() {
    for (var s = 0; s < C.HINT_MAX; s++) if (st.slotOf.indexOf(s) < 0) return s;
    return -1;
  }

  // 候補から n 枚（枠の空きの分まで）出して、まとめて読み上げる。preferSlot = 最初の1枚をめくるカードの枠（カードを直接タップしたとき）
  function showHints(n, preferSlot) {
    var added = [];
    while (added.length < n && st.hints.length < C.HINT_MAX && remaining() > 0) {
      var w = st.queue[st.qpos++];
      var slot = (added.length === 0 && preferSlot != null && st.slotOf.indexOf(preferSlot) < 0) ? preferSlot : firstFreeSlot();
      st.hints.push(w);
      st.slotOf.push(slot);
      added.push(w.reading);
    }
    if (!added.length) return false;
    renderHints();
    renderButtons();
    SR.speech.say(added.join('、'));
    return true;
  }

  // 次のヒントを、設定の秒数のあとに出す予約（1枚出るたびに次を予約する）
  function scheduleHints() {
    clearTimeout(hintTimer); hintTimer = null;
    armIdle();              // 元の画面に戻るたび・ボタンを押すたびに、「だまっている時間」を数え直す
    if (!st || st.phase !== 'play' || !hintAllowed()) return;
    if (st.hints.length >= C.HINT_MAX || remaining() <= 0) return;
    if (SR.settings.get().hintSec < 0) return;      // 「ボタンだけ」: 自動では出さない（ひんと ボタンを押したときだけ）
    hintTimer = setTimeout(function () {
      hintTimer = null;
      if (st.phase !== 'play') return;
      showHints(1);
      scheduleHints();
    }, (st.hints.length === 0 ? SR.settings.get().hintSec : C.HINT_INTERVAL_SEC) * 1000);
  }

  // 「ヒント」ボタン: 待たずに次の1枚（カードが1枚めくれる）
  function onHintButton() {
    if (!st || st.phase !== 'play') return;
    SR.sfx.play('button');
    if (!hintAllowed()) return;
    if (st.hints.length >= C.HINT_MAX) return;
    if (remaining() <= 0) { toast('もう ないよ'); return; }
    endNudge();
    showHints(1);
    scheduleHints();
  }

  // めくっていないカードを直接タップ: そのカードがめくれる（子どもの番）。めくってある絵をタップすると答えになる（onHintTap）
  function onCardTap(slot) {
    if (!st || st.phase !== 'play') return;
    var i = st.slotOf.indexOf(slot);
    if (i >= 0) { onHintTap(i); return; }
    if (!hintAllowed()) return;
    if (remaining() <= 0) { toast('もう ないよ'); return; }
    endNudge();
    showHints(1, slot);
    scheduleHints();
  }

  // 「かえる」ボタン: 出ている絵を、別の言葉に差し替える（2枚とも。めくった状態のまま絵が入れ替わる）
  function onChangeButton() {
    if (!st || st.phase !== 'play') return;
    SR.sfx.play('button');
    if (!hintAllowed()) return;
    if (remaining() <= 0) { toast('もう ないよ'); return; }
    endNudge();
    st.hints = [];
    st.slotOf = [];
    showHints(C.HINT_MAX);
    scheduleHints();
  }

  // ============================================================
  // 案内役のねこ: だまって IDLE_HINT_SEC たったら、考えて「ひんと おしてみる？」（子どもの番だけ・1手番に1回）
  // ============================================================
  // 元の画面のときのねこのポーズ（おとなの番は おうえん）
  function basePose() { return st && st.turn === 'adult' ? 'cheer' : 'normal'; }

  function armIdle() {
    clearTimeout(idleTimer); idleTimer = null;
    if (!st || st.phase !== 'play' || st.turn !== 'kid' || st.idleDone) return;
    idleTimer = setTimeout(onIdle, C.IDLE_HINT_SEC * 1000);
  }

  function onIdle() {
    idleTimer = null;
    if (!st || st.phase !== 'play' || st.turn !== 'kid' || st.idleDone) return;
    if (!hintAllowed() || st.hints.length >= C.HINT_MAX || remaining() <= 0) return;   // もう ひんと は押せない
    st.idleDone = true;
    st.nudge = true;
    SR.cat.set('think');
    SR.speech.say(C.IDLE_HINT_TEXT, true);
    renderButtons();        // 「ひんと」ボタンが光る
  }

  // ひんとボタンを光らせるのをやめる（ねこが考えていたら元のポーズへ）
  function endNudge() {
    if (!st || !st.nudge) return;
    st.nudge = false;
    if (SR.cat.pose() === 'think') SR.cat.set(basePose());
    renderButtons();
  }

  // 入力待ちを離れるとき（正解・やり直し・聞き取り・キーボード・やめる確認）: 考える時間の予約を消し、光りも止める
  function quietIdle() {
    clearTimeout(idleTimer); idleTimer = null;
    endNudge();
  }

  // ============================================================
  // 表示
  // ============================================================
  function render() {
    renderPlayers();
    renderSpeechBtn();
    $('prev-word').textContent = st.prevLabel;
    $('head-char').innerHTML = headHTML();
    renderHints();
    renderButtons();
  }

  // 上の2人の名前の板（番の人が大きく濃い色）・点数・画面全体の地の色
  function renderPlayers() {
    var whos = ['kid', 'adult'];
    for (var i = 0; i < whos.length; i++) {
      var w = whos[i];
      var nm = $('name-' + w);
      var name = whoName(w);
      nm.textContent = name;
      nm.style.setProperty('--nl', String(Math.max(1, name.length)));   // 長い名前は板の中で字が小さくなる（style.css）
      var pl = $('pl-' + w);
      var was = pl.classList.contains('active');
      var now = st.turn === w;
      pl.classList.toggle('active', now);
      if (now && !was) {                        // 番が変わった: 板がぽんと弾む
        pl.classList.remove('swap'); void pl.offsetWidth; pl.classList.add('swap');
      }
    }
    SR.ui.setTurnTheme(st.turn);
    renderScores();
  }

  function renderScores() {
    $('num-kid').textContent = st.total.kid;
    $('num-adult').textContent = st.total.adult;
    $('marks-kid').innerHTML = SR.ui.marksHTML(st.total.kid);
    $('marks-adult').innerHTML = SR.ui.marksHTML(st.total.adult);
  }

  // 今の文字: 代表の1文字を大きく、ほかにあれば小さく添える（「だ（た）」）
  function headHTML() {
    var chars = st.next.chars;
    var html = '<span class="h1">' + chars[0] + '</span>';
    if (chars.length > 1) html += '<span class="h2">（' + chars.slice(1).join('・') + '）</span>';
    return html;
  }

  // ヒントの絵を入れる（絵文字がない言葉は、images/<読み>.png があれば絵。絵が無い言葉だけ「？」の仮の絵。読み込み中は空けておく）
  function fillPic(pic, w) {
    pic.innerHTML = '';
    if (w.emoji) {
      pic.textContent = w.emoji;
      return;
    }
    pic.innerHTML = w.image ? '' : '<span class="ph">？</span>';
    var sync = true;   // 読み込み済みの絵は、この場ですぐ呼ばれる（まだ画面に置く前なので、下の確認はしない）
    D.loadImage(w, function (url) {
      if (!sync && !document.body.contains(pic)) return;   // 読み込みを待つ間に、その絵が下げられていたら何もしない
      if (pic._reading !== w.reading) return;              // 読み込みを待つ間に、別の言葉に差し替えられていたら何もしない
      pic.innerHTML = '';
      var im = document.createElement('img');
      im.src = url;
      im.alt = w.reading;
      pic.appendChild(im);
    });
    sync = false;
  }

  // 絵の出ていない枠（おとなの番の「ヒントなし」の表示）
  function emptyHintEl(msg, icon) {
    var d = document.createElement('div');
    d.className = 'hint empty' + (icon ? ' q' : '');
    d.innerHTML = '<div class="pic"></div><div class="yomi"></div>';
    d.firstChild.textContent = icon || '💭';
    d.lastChild.textContent = msg;
    return d;
  }

  // ヒントのカード（DESIGN §6.3-3）: 裏は「？」の模様、表は絵と読み。ひんとを押すか、カードをタップすると くるっとめくれる
  function buildHintCards() {
    var el = $('hints');
    el.innerHTML = '';
    slotEls = [];
    for (var i = 0; i < C.HINT_MAX; i++) {
      var d = document.createElement('div');
      d.className = 'hcard appear';
      d.setAttribute('data-slot', String(i));
      d.style.setProperty('--flip', C.CARD_FLIP_SEC + 's');
      d.innerHTML = '<div class="inner">' +
        '<div class="face back"><div class="qmark">？</div><div class="cap"></div></div>' +
        '<div class="face front"><div class="pic"></div><div class="yomi"></div></div>' +
        '</div>';
      el.appendChild(d);
      slotEls.push(d);
    }
    hintsMode = 'cards';
  }

  // カードの表に言葉を入れる。前と同じ言葉なら何もしない（入れ替えたら true）
  function setFront(d, w) {
    if (d._reading === w.reading) return false;
    d._reading = w.reading;
    var pic = d.querySelector('.front .pic');
    pic._reading = w.reading;
    fillPic(pic, w);
    d.querySelector('.front .yomi').textContent = w.reading;
    return true;
  }

  function renderHints() {
    var el = $('hints');
    if (!hintAllowed()) {
      if (hintsMode !== 'none') {
        el.innerHTML = '';
        slotEls = [];
        el.appendChild(emptyHintEl(whoName('adult') + 'の ばんは\nヒントなし'));
        hintsMode = 'none';
      }
      return;
    }
    if (hintsMode !== 'cards') buildHintCards();
    var sec = SR.settings.get().hintSec;
    var flipSound = false;
    var freeBefore = 0;       // この枠より左の、裏向きの枠の数
    for (var s = 0; s < C.HINT_MAX; s++) {
      var d = slotEls[s];
      var i = st.slotOf.indexOf(s);
      if (i >= 0) {
        // 絵が出ている枠: めくる（すでにめくってあって言葉が変わったときは、そのまま絵が入れ替わる）
        d.style.display = '';
        d.classList.remove('dead');
        d.setAttribute('data-idx', String(i));
        var changed = setFront(d, st.hints[i]);
        if (!d.classList.contains('flipped')) { d.classList.add('flipped'); flipSound = true; }
        else if (changed) { flipSound = true; d.classList.remove('swap'); void d.offsetWidth; d.classList.add('swap'); }
        d.classList.add('tap');
      } else {
        // 裏向きの枠
        d.classList.remove('flipped', 'tap');
        d._reading = '';
        var cap = d.querySelector('.cap');
        var dead = false, hidden = false, msg = '';
        if (remaining() <= 0) {
          if (freeBefore === 0) { dead = true; msg = st.hints.length === 0 ? 'ことばが ないよ' : 'もう ないよ'; }   // 候補がもう無い
          else hidden = true;                                                                                    // 2枚目の枠が空のまま（候補が1つしか無かった）: 何も出さない
        } else if (sec < 0) {
          msg = st.hints.length === 0 && freeBefore === 0 ? 'ひんと を\nおしてね' : 'もういちど\nひんと を おしてね';
        } else {
          msg = sec === 0 ? 'すぐ でる' : (st.hints.length === 0 && freeBefore === 0 ? sec + 'びょうで\nでる' : 'さらに ' + C.HINT_INTERVAL_SEC + 'びょうで\nでる');
        }
        cap.textContent = msg;
        d.classList.toggle('dead', dead);
        d.style.display = hidden ? 'none' : '';
        freeBefore++;
      }
    }
    if (flipSound) SR.sfx.play('flip');
  }

  // ヒント・かえる ボタンの光り／灰色
  function renderButtons() {
    var allowed = hintAllowed();
    var more = allowed && remaining() > 0;
    var hintBtn = $('btn-hint');
    var changeBtn = $('btn-change');
    hintBtn.classList.toggle('glow', more && st.hints.length < C.HINT_MAX);
    hintBtn.classList.toggle('nudge', !!st.nudge && more && st.hints.length < C.HINT_MAX);   // ねこが「ひんと おしてみる？」と言ったとき、ひんとボタンを強く光らせる
    hintBtn.classList.toggle('off', !allowed || st.hints.length >= C.HINT_MAX || remaining() <= 0);
    changeBtn.classList.toggle('off', !more);
    hintBtn.setAttribute('aria-disabled', hintBtn.classList.contains('off') ? 'true' : 'false');
    changeBtn.setAttribute('aria-disabled', changeBtn.classList.contains('off') ? 'true' : 'false');
    renderMic();
  }

  // よみあげの オン／オフ ボタンの表示
  function renderSpeechBtn() {
    var on = SR.settings.get().speech;
    var b = $('btn-speech');
    b.textContent = on ? '🔊 よみあげ' : '🔇 よみあげ なし';
    b.classList.toggle('mute', !on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  // よみあげの オン／オフ（ゲーム中いつでも。スタート画面の設定にも覚える）
  function onSpeechToggle() {
    var on = !SR.settings.get().speech;
    SR.settings.set('speech', on);
    if (!on) SR.speech.cancel();   // 読んでいる途中でもすぐ止める
    SR.sfx.play('button');
    renderSpeechBtn();
  }

  // 「ほかの ことば」: 音声認識が使えないときは、五十音表で答えるボタンだと分かる表示にする（灰色にはしない）
  function renderMic() {
    $('btn-mic').textContent = SR.voice.usable() ? '🎤 ほかの ことば' : 'ほかの ことば（もじで）';
  }

  // 小さなお知らせ（「もう ないよ」）
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, C.TOAST_SEC * 1000);
  }

  // 花・星を散らす（container の中に作り直す）
  function confetti(container, count, pieces) {
    container.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var s = document.createElement('span');
      s.className = 'deco';
      s.textContent = pieces[Math.floor(Math.random() * pieces.length)];
      // 中央（文字や結果のカードがある所）をよけて散らす
      var x, y, tries = 0;
      do {
        x = Math.random() * 92 + 2;
        y = Math.random() * 88 + 2;
        tries++;
      } while (tries < 12 && x > C.CONFETTI_KEEP_X[0] && x < C.CONFETTI_KEEP_X[1] &&
               y > C.CONFETTI_KEEP_Y[0] && y < C.CONFETTI_KEEP_Y[1]);
      s.style.left = x + '%';
      s.style.top = y + '%';
      s.style.fontSize = 'calc(' + (C.CONFETTI_MIN_SIZE + Math.random() * (C.CONFETTI_MAX_SIZE - C.CONFETTI_MIN_SIZE)) + ' * var(--u))';   // 縦向きでも同じ見た目の大きさ
      s.style.animationDelay = (Math.random() * C.CONFETTI_DELAY_MAX_SEC) + 's, ' + (Math.random() * 0.8) + 's';
      container.appendChild(s);
    }
  }

  // ============================================================
  // 正解（DESIGN.md §3.2、§4.4）
  // ============================================================
  // o = {
  //   display   … 演出と「これまで」に出す言葉（五十音表なら「（り）」）
  //   reading   … 使用済みにする読み（五十音表のときは無し）
  //   next      … 次の文字（K.nextChars の結果）
  //   stars     … 増やす星の数
  //   speakWord … 読み上げる言葉（無ければ「せいかい！」だけ）
  // }
  function correct(o) {
    st.phase = 'busy';
    clearTimers();
    quietIdle();
    var who = st.turn;
    var before = st.total[who];
    st.total[who] = before + o.stars;
    var heart = Math.floor(st.total[who] / C.STARS_PER_HEART) > Math.floor(before / C.STARS_PER_HEART);

    // 演出: 紙吹雪が下からはじける・言葉が弾んで出る・星が点数の枠へ飛んでいく
    hopWord($('ov-word'), o.display);
    showOverlayPic(o.reading);
    $('ov-plus').textContent = '★ +' + o.stars;
    $('ov-heart').hidden = !heart;
    $('ov-correct-in').classList.toggle('heart', heart);
    burst($('confetti'), heart);
    $('ov-correct').hidden = false;
    $('ov-correct').classList.toggle('heart', heart);
    $('screen-game').classList.add('scoring');     // 上の名前の板・点数を、演出の上に出しておく（星が飛んでいく先が見えるように）
    SR.sfx.play(heart ? 'heart' : 'correct');
    st.catFlip = !st.catFlip;                        // ねこ: 正解のたびに よろこぶ／おどる を交互に
    SR.cat.set(st.catFlip ? 'happy' : 'dance');
    // れっしゃ: 演出の途中で、その言葉の車両が右からつながる（演出のあいだは、れっしゃも演出の上に出しておく）
    var car = { display: o.display, reading: o.reading || '' };
    var addCar = function () {
      clearTimeout(carTimer); carTimer = null;
      if (st.cars.indexOf(car) >= 0) return;
      st.cars.push(car);
      SR.train.addCar(st.cars, car);
    };
    carTimer = setTimeout(addCar, C.TRAIN_CAR_DELAY_SEC * 1000);
    var say = (o.speakWord ? o.speakWord + '、' : '') + 'せいかい！' + (heart ? ' ハートが ひとつ できたよ' : '');
    SR.speech.say(say);
    flyStars(who, heart, function () {             // 星が点数の枠に着いたら、数字を増やして、枠をぽんと弾ませる
      renderScores();
      popScore(who);
    });

    overlayTimer = setTimeout(function () {
      overlayTimer = null;
      addCar();                                    // 念のため（まだつながっていなければ、ここでつなぐ）
      $('ov-correct').hidden = true;
      $('screen-game').classList.remove('scoring');
      $('fly').innerHTML = '';
      // 次の文字へ → 手番交代
      if (o.reading) st.used[o.reading] = true;
      st.chain.push(o.display);
      st.prevLabel = o.display;
      st.next = o.next;
      st.turn = other(who);
      beginTurn();
    }, (heart ? C.CORRECT_OVERLAY_HEART_SEC : C.CORRECT_OVERLAY_SEC) * 1000);
  }

  // 正解の演出に、その言葉の絵を大きく出す（声・五十音表で答えた言葉も、辞書にあれば出す）
  function showOverlayPic(reading) {
    var box = $('ov-pic');
    var w = reading ? D.find(reading) : null;
    box.innerHTML = '';
    box.hidden = true;
    if (!w) return;
    if (w.emoji) {
      box.textContent = w.emoji;
      box.hidden = false;
    } else if (w.image) {
      D.loadImage(w, function (url) {   // 起動時に先読みしてあるので、ふつうはすぐ呼ばれる
        var im = document.createElement('img');
        im.src = url;
        im.alt = w.reading;
        box.innerHTML = '';
        box.appendChild(im);
        box.hidden = false;
      });
    }
  }

  // 点数の枠をぴょんと跳ねさせる
  function popScore(who) {
    var box = $('pscore-' + who);
    if (!box) return;
    box.classList.remove('pop');
    void box.offsetWidth;    // アニメーションをもう一度始めるための再描画
    box.classList.add('pop');
  }

  // 言葉を1文字ずつ、ぴょんぴょん弾ませながら出す
  function hopWord(el, text) {
    el.innerHTML = '';
    var chars = String(text).split('');
    for (var i = 0; i < chars.length; i++) {
      var c = document.createElement('span');
      c.className = 'ch';
      c.textContent = chars[i];
      c.style.animationDuration = C.CHAR_HOP_SEC + 's';
      c.style.animationDelay = (i * C.CHAR_HOP_STEP_SEC) + 's';
      el.appendChild(c);
    }
  }

  // 紙吹雪を、画面の下（左のすみ・右のすみ・まんなか）からはじけさせる。絵と色紙が半分ずつ
  function burst(container, heart) {
    container.innerHTML = '';
    var stage = $('stage');
    var W = stage.offsetWidth, H = stage.offsetHeight;
    var count = heart ? C.BURST_COUNT_HEART : C.BURST_COUNT;
    var pieces = heart ? C.CONFETTI_PIECES_HEART : C.CONFETTI_PIECES;
    var rnd = function (a, b) { return a + Math.random() * (b - a); };
    for (var i = 0; i < count; i++) {
      var el = document.createElement('span');
      var paper = i % 2 === 0;
      el.className = 'bp' + (paper ? ' paper' : '');
      if (paper) {
        var w = rnd(C.BURST_PAPER_SIZE[0], C.BURST_PAPER_SIZE[1]);
        el.style.width = 'calc(' + w + ' * var(--u))';
        el.style.height = 'calc(' + (w * rnd(1.3, 2.2)) + ' * var(--u))';
        el.style.background = C.BURST_PAPER_COLORS[Math.floor(Math.random() * C.BURST_PAPER_COLORS.length)];
      } else {
        el.textContent = pieces[Math.floor(Math.random() * pieces.length)];
        el.style.fontSize = 'calc(' + rnd(C.CONFETTI_MIN_SIZE, C.CONFETTI_MAX_SIZE) + ' * var(--u))';
      }
      // はじける元: 左のすみ／右のすみ／まんなかの下。左右は中央に向かって広がる
      var origin = Math.floor(Math.random() * 3), x0, dx;
      if (origin === 0) { x0 = W * 0.04; dx = rnd(0.12, C.BURST_SPREAD) * W; }
      else if (origin === 1) { x0 = W * 0.96; dx = -rnd(0.12, C.BURST_SPREAD) * W; }
      else { x0 = rnd(0.3, 0.7) * W; dx = rnd(-0.22, 0.22) * W; }
      var up = rnd(C.BURST_UP_MIN, C.BURST_UP_MAX) * H;
      el.style.left = x0 + 'px';
      el.style.top = H + 'px';
      el.style.setProperty('--dx', dx + 'px');
      el.style.setProperty('--dy', (-up) + 'px');
      el.style.setProperty('--fall', (-up + rnd(0.35, 0.6) * H) + 'px');   // はじけたあと、ひらひら落ちる
      el.style.setProperty('--rot', rnd(-720, 720) + 'deg');
      el.style.animationDuration = (C.BURST_SEC * rnd(0.85, 1.15)) + 's';
      el.style.animationDelay = rnd(0, C.BURST_DELAY_MAX_SEC) + 's';
      container.appendChild(el);
    }
  }

  // 星が、演出の真ん中から、手番の人の点数の枠へ飛んでいく。全部着いたら onLand を呼ぶ
  function flyStars(who, heart, onLand) {
    var layer = $('fly');
    layer.innerHTML = '';
    var stage = $('stage');
    var sr = stage.getBoundingClientRect();
    var scale = sr.width / stage.offsetWidth || 1;      // 画面の拡大縮小（ui.js）を割り戻して、ステージの中の座標にする
    var box = $('pscore-' + who).getBoundingClientRect();
    var tx = (box.left + box.width / 2 - sr.left) / scale;
    var ty = (box.top + box.height / 2 - sr.top) / scale;
    var fx = stage.offsetWidth / 2, fy = stage.offsetHeight * 0.5;
    var count = heart ? C.FLY_STAR_COUNT_HEART : C.FLY_STAR_COUNT;
    var stars = [];
    for (var i = 0; i < count; i++) {
      var el = document.createElement('span');
      el.className = 'fstar';
      el.textContent = '⭐';
      el.style.fontSize = 'calc(' + C.FLY_STAR_SIZE + ' * var(--u))';
      var sx = fx + (Math.random() - 0.5) * stage.offsetWidth * 0.3;
      var sy = fy + (Math.random() - 0.5) * stage.offsetHeight * 0.12;
      el.style.left = sx + 'px';
      el.style.top = sy + 'px';
      el.style.transitionDuration = C.FLY_STAR_SEC + 's';
      el.style.transitionDelay = (C.FLY_STAR_DELAY_SEC + i * C.FLY_STAR_STEP_SEC) + 's';
      layer.appendChild(el);
      stars.push({ el: el, dx: tx - sx, dy: ty - sy });
    }
    // 置いた状態を一度確定させてから行き先を指定すると、そこまで滑らかに動く
    void layer.offsetWidth;
    for (var k = 0; k < stars.length; k++) {
      stars[k].el.style.transform = 'translate(calc(-50% + ' + stars[k].dx + 'px), calc(-50% + ' + stars[k].dy + 'px)) scale(.35) rotate(360deg)';
      stars[k].el.style.opacity = '.95';
    }
    var total = (C.FLY_STAR_DELAY_SEC + (count - 1) * C.FLY_STAR_STEP_SEC + C.FLY_STAR_SEC) * 1000;
    clearTimeout(flyTimer);
    flyTimer = setTimeout(function () {
      flyTimer = null;
      layer.innerHTML = '';
      onLand();
    }, total);
  }

  // 絵をタップ = その言葉で答えた
  function onHintTap(idx) {
    if (!st || st.phase !== 'play') return;
    var w = st.hints[idx];
    if (!w) return;
    if (w.endsWithN) {
      // 「ん」で終わる言葉の絵: 星なしで、同じ人がもう1回。その絵は下げて、あとで別の絵が出る
      st.hints.splice(idx, 1);
      st.slotOf.splice(idx, 1);
      miss('ん が ついちゃった！ もういっかい', '「' + w.reading + '」は ん で おわるよ', w.reading + '。ん が ついちゃった。もういっかい', true);
      return;
    }
    correct({
      display: w.reading, reading: w.reading,
      next: K.nextChars(w.reading), stars: C.STARS_PICTURE, speakWord: w.reading
    });
  }

  // ============================================================
  // やり直し（DESIGN.md §3.3）: 減点なし、同じ人がもう1回
  // ============================================================
  // ghost が true のとき（「ん」で終わったとき）は、ンおばけも出す（DESIGN §6.3-4）
  function miss(big, sub, speak, ghost) {
    st.phase = 'busy';
    clearTimers();
    quietIdle();
    $('miss-big').textContent = big;
    $('miss-sub').textContent = sub || '';
    $('ov-miss').hidden = false;
    $('ov-miss').classList.toggle('with-ghost', !!ghost);
    if (ghost) showGhost(); else hideGhost();
    SR.cat.set('oops');       // ねこが ころぶ
    SR.sfx.play('miss');
    SR.speech.say(speak || big);
    overlayTimer = setTimeout(function () {
      overlayTimer = null;
      $('ov-miss').hidden = true;
      hideGhost();
      st.phase = 'play';
      SR.cat.set(basePose());
      renderHints();
      renderButtons();
      scheduleHints();
    }, (ghost ? C.MISS_N_OVERLAY_SEC : C.MISS_OVERLAY_SEC) * 1000);
  }

  // ンおばけ: 下から出てくる（_nobake_in）→ 変な顔 → 手をふって消える（_nobake_out）。絵が無ければ 👻
  function ghostPart(cls, file, extra) {
    var d = document.createElement('div');
    d.className = 'gh ' + cls;
    var url = SR.ui.asset(file);
    if (url) {
      d.classList.add('art');
      var im = document.createElement('img');
      im.alt = ''; im.draggable = false; im.src = url;
      d.appendChild(im);
    } else {
      d.textContent = C.GHOST_FALLBACK;
      if (extra) { var x = document.createElement('span'); x.className = 'wave'; x.textContent = extra; d.appendChild(x); }
    }
    return d;
  }
  function showGhost() {
    var g = $('ghost');
    g.innerHTML = '';
    g.appendChild(ghostPart('in', 'images/_nobake_in.png'));
    g.appendChild(ghostPart('out', 'images/_nobake_out.png', '👋'));
    g.style.setProperty('--gdur', C.MISS_N_OVERLAY_SEC + 's');
    g.classList.toggle('art', !!(SR.ui.asset('images/_nobake_in.png') || SR.ui.asset('images/_nobake_out.png')));
    g.hidden = false;
  }
  function hideGhost() {
    var g = $('ghost');
    g.hidden = true;
    g.innerHTML = '';
  }

  // 「ほかの ことば」: 絵にない言葉で答える。聞き取れたら候補ボタンを親が押して選ぶ。
  // マイクが使えないときは五十音のキーボードで言葉を打つ（v0.5.1 で ○ボタンを廃止し、ここに一本化）
  function onMic() {
    if (!st || st.phase !== 'play') return;
    SR.sfx.play('button');
    if (SR.voice.usable()) openListen('self');
    else openKana('');
  }

  // 「にゅうりょく する」: 声を使わず、すぐキーボード（五十音）で言葉を打つ
  function onType() {
    if (!st || st.phase !== 'play') return;
    SR.sfx.play('button');
    openKana('');
  }

  // ============================================================
  // 「なんて いった？」（DESIGN.md §4.2、§6.2-4）
  // ============================================================
  // mode: 'self'（ほかの ことば から）。聞き取れたあとは、候補ボタン（最大3つ）を親が押して選ぶ
  function openListen(mode) {
    st.phase = 'listen';
    clearTimeout(hintTimer); hintTimer = null;    // 聞き取りの間はヒントのタイマーも止める
    quietIdle();
    st.listen = { mode: mode, fails: 0, retried: 0, cands: [] };
    $('ov-listen').hidden = false;
    beginListening();
  }

  // 1回聞き取りを始める（前のがあれば止める）。自分の読み上げを拾わないよう、読み上げは止める
  function beginListening() {
    stopListening();
    var token = ++listenToken;
    st.listen.cands = [];
    listenView('listening');
    SR.speech.cancel();
    SR.bgm.listening(true);       // 聞き取っている間は BGM を止める
    listenHandle = SR.voice.listen(function (ev) { onVoice(ev, token); }, {
      onStart: function () { if (token === listenToken) SR.sfx.play('beep'); },               // 「ピッ」: 話し始めてよい合図
      onInterim: function (text) { if (token === listenToken) showHeard(text); }               // 聞こえた途中の文字
    });
  }

  function stopListening() {
    listenToken++;
    SR.bgm.listening(false);
    if (listenHandle) { listenHandle.abort(); listenHandle = null; }
  }

  function closeListen() {
    stopListening();
    $('ov-listen').hidden = true;
  }

  // 元の画面（入力待ち）に戻す。ヒントのタイマーも元に戻す
  function resumePlay() {
    st.phase = 'play';
    renderHints();
    renderButtons();
    scheduleHints();
  }

  // 「きこえた: …」。途中の文字は、読みが取れるならひらがなにして出す（漢字のままなら聞こえた文字のまま）
  function showHeard(text) {
    var r = SR.reading.resolve(text);
    var t = r.ok ? r.reading : String(text);
    $('listen-heard').textContent = t ? 'きこえた: ' + t : '';
  }

  // オーバーレイの見た目: 'listening'（きいてるよ）/ 'retry'（聞き取れなかった。マイクを押してもう一度）/ 'confirm'（候補ボタンを出して選んでもらう）
  function listenView(state, msg) {
    var L = st.listen;
    var mic = $('listen-mic');
    var confirmView = state === 'confirm';
    $('listen-ask').textContent = confirmView ? 'どれかな？' : 'なんて いった？';
    mic.hidden = confirmView;
    mic.disabled = state === 'listening';
    mic.classList.toggle('listening', state === 'listening');
    mic.classList.toggle('glow', state === 'retry');
    mic.textContent = state === 'listening' ? '🎤 きいてるよ' : '🎤 おして はなす';
    $('listen-heard').textContent = '';
    $('listen-heard').hidden = confirmView;
    $('listen-none').hidden = !confirmView;
    var box = $('listen-cands');
    box.hidden = !confirmView;
    box.innerHTML = '';
    if (confirmView) {
      for (var i = 0; i < L.cands.length; i++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cand' + (i === 0 ? ' first' : '');
        b.setAttribute('data-idx', String(i));
        b.textContent = L.cands[i].reading;
        b.style.setProperty('--nl', String(Math.max(1, L.cands[i].reading.length)));   // 長い言葉は文字を小さくして収める
        box.appendChild(b);
      }
      box.setAttribute('data-n', String(L.cands.length));
    }
    $('listen-msg').textContent = msg || (state === 'retry' ? 'きこえなかった もういっかい' : '');
  }

  // 聞き取りの結果（voice.js から1回だけ来る）
  function onVoice(ev, token) {
    if (!st || st.phase !== 'listen' || token !== listenToken) return;
    listenHandle = null;
    SR.bgm.listening(false);      // 聞き取りが終わった: BGM を戻す（聞き直すときは beginListening でまた止める）
    if (ev.type === 'fatal') { onVoiceFatal(); return; }
    if (ev.type === 'fail') { onListenFail(ev.kind); return; }
    // 読める候補を、「今の文字で始まる言葉 → 辞書にある言葉 → 信頼度」の順に並べる（同じ読みは1つ）
    var cands = SR.reading.rank(ev.candidates, st.next.chars, C.VOICE_CHOICES_MAX);
    if (!cands.length) { onListenFail('unreadable'); return; }   // 読める候補がない
    st.listen.fails = 0;
    st.listen.cands = cands;
    listenView('confirm');
  }

  // 聞き取れない・読めない。何も聞こえずに終わったときは、1回だけ自動で聞き直す。
  // それでも続けて KANA_GRID_AFTER_FAILS 回になったら五十音表へ
  function onListenFail(kind) {
    if (C.VOICE_AUTO_RETRY_KINDS.indexOf(kind) >= 0 && st.listen.retried < C.VOICE_AUTO_RETRY) {
      st.listen.retried++;
      beginListening();
      listenView('listening', 'もう いちど きいてるよ');
      return;
    }
    st.listen.retried = 0;
    st.listen.fails++;
    if (st.listen.fails >= C.KANA_GRID_AFTER_FAILS) {
      closeListen();
      openKana('');
      return;
    }
    listenView('retry');
    SR.sfx.play('miss');
    SR.speech.say('きこえなかった。もういっかい');
  }

  // 許可がない・ネットがない・マイクがない: このゲーム中は聞き取りを使わない（voice.js が覚えている）
  function onVoiceFatal() {
    closeListen();
    renderMic();                       // 「ほかの ことば（もじで）」の表示に変わる
    openKana('');                      // 声で聞けなかったので、キーボードで言葉を打ってもらう
  }

  // 候補ボタンを押した
  function onListenPick(idx) {
    if (!st || st.phase !== 'listen') return;
    var ad = st.listen.cands[idx];
    if (!ad) return;
    closeListen();
    answerOwn(ad);
  }

  // 自分で言った（打った）言葉で答える。声の候補ボタンも、キーボードの「これで けってい」も同じ扱い。
  //   ad = { reading, next, display }。reading＝使用済みにする読み（reading.js の resolve の結果）、display＝演出と「これまで」に出す言葉（無ければ reading）
  //   「ん」→ついちゃった、使用済み→もう いったよ（どちらも星なし・同じ人がもう1回）、それ以外→正解の演出
  function answerOwn(ad) {
    if (ad.next.endsWithN) {
      miss('ん が ついちゃった！ もういっかい', '', 'ん が ついちゃった。もういっかい', true);
      return;
    }
    if (st.used[ad.reading]) {
      miss('それは もう いったよ', '', 'それは もう いったよ');
      return;
    }
    correct({
      display: ad.display || ad.reading, reading: ad.reading,
      next: ad.next, stars: C.STARS_OWN_WORD, speakWord: ad.display || ad.reading
    });
  }

  // 「どれでもない」→ もう1回聞き取る
  function onListenNone() {
    if (!st || st.phase !== 'listen') return;
    SR.sfx.play('button');
    st.listen.retried = 0;
    beginListening();
  }

  // 「おして はなす」（聞き取れなかったあとのマイク）
  function onListenMic() {
    if (!st || st.phase !== 'listen' || $('listen-mic').disabled) return;
    SR.sfx.play('button');
    st.listen.retried = 0;
    beginListening();
  }

  // 「もどる」: やめて元の画面へ
  function onListenBack() {
    if (!st || st.phase !== 'listen') return;
    SR.sfx.play('button');
    closeListen();
    resumePlay();
  }

  // 「もじで えらぶ」: キーボードへ。候補が出ていれば、いちばん上の候補を最初から入れておく（直して使える）
  function onListenKana() {
    if (!st || st.phase !== 'listen') return;
    SR.sfx.play('button');
    var cands = st.listen.cands;
    var first = cands.length ? cands[0].reading : '';
    closeListen();
    openKana(first);
  }

  // ============================================================
  // 五十音のキーボード（DESIGN.md §6.2-10）: 言葉を全部打って「これで けってい」
  // ============================================================
  // initial: 最初から欄に入れておく言葉（声の候補から来たとき）。空なら空から
  function openKana(initial) {
    st.phase = 'kana';
    st.kanaBuf = initial || '';
    clearTimeout(hintTimer); hintTimer = null;
    quietIdle();
    kanaMode = '';
    renderKana();
    renderKanaWord();
    $('ov-kana').hidden = false;
  }

  function closeKana() {
    $('ov-kana').hidden = true;
    st.phase = 'play';
    scheduleHints();
  }

  // 文字のキーを、今の濁点モードで作り直す
  function renderKana() {
    var grid = $('kana-grid');
    grid.innerHTML = '';
    for (var r = 0; r < K.GRID.length; r++) {
      for (var c = 0; c < K.GRID[r].length; c++) {
        var base = K.GRID[r][c];
        var cell;
        if (!base) {
          cell = document.createElement('span');
          cell.className = 'kcell blank';
        } else {
          var ch = K.withMark(base, kanaMode);
          cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'kcell' + (ch !== base ? ' marked' : '');
          cell.textContent = ch;
          cell.setAttribute('data-ch', ch);
        }
        grid.appendChild(cell);
      }
    }
    $('kana-daku').classList.toggle('on', kanaMode === 'daku');
    $('kana-handaku').classList.toggle('on', kanaMode === 'handaku');
  }

  // 打った言葉の欄と、「これで けってい」の押せる／押せない
  function renderKanaWord() {
    var buf = st.kanaBuf;
    var box = $('kana-word');
    $('kana-word-text').textContent = buf;
    box.style.setProperty('--nl', String(Math.max(1, buf.length)));   // 長い言葉は欄の中で字が小さくなる（style.css）
    box.classList.toggle('empty', !buf);
    $('kana-go').disabled = !buf;
  }

  // 文字のキー（五十音・小さい文字・ー）を押した
  function onKanaKey(ch) {
    if (!st || st.phase !== 'kana') return;
    if (ch === 'ー' && !st.kanaBuf) return;          // 言葉の最初には「ー」は来ない
    if (st.kanaBuf.length >= C.KANA_WORD_MAX) {      // いっぱい: ぶるっと震えて知らせる
      SR.sfx.play('miss');
      var box = $('kana-word');
      box.classList.remove('full'); void box.offsetWidth; box.classList.add('full');
      return;
    }
    SR.sfx.play('button');
    st.kanaBuf += ch;
    if (kanaMode) { kanaMode = ''; renderKana(); }   // 1文字打つと濁点モードは元に戻る
    renderKanaWord();
  }

  // 「けす」: 最後の1文字を消す
  function onKanaDel() {
    if (!st || st.phase !== 'kana' || !st.kanaBuf) return;
    SR.sfx.play('button');
    st.kanaBuf = st.kanaBuf.slice(0, -1);
    renderKanaWord();
  }

  // 「これで けってい」: 声の候補ボタンを押したときと同じ処理へ（辞書にない言葉でも正解にしてよい。親が判定する）
  function onKanaDecide() {
    if (!st || st.phase !== 'kana' || !st.kanaBuf) return;
    var r = SR.reading.resolve(st.kanaBuf);             // 辞書にある言葉は、その読み（使用済み・絵の判定用）にそろえる
    if (!r.ok) { SR.sfx.play('miss'); return; }        // 読みにできない（「ー」だけなど）。ふつうは起きない
    // 打った言葉はそのまま答えにする。「らっぱー」は辞書の「らっぱ」として使用済み・絵を引くが、次の文字は打ったとおり（ぱ／は／あ）。
    // ただし「ん」のあとの「ー」は言い伸ばしなので取る（ぞうさんー → ぞうさん、reading.js と同じ）
    var typed = st.kanaBuf.replace(/(ん)ー+$/, '$1');
    SR.sfx.play('button');
    $('ov-kana').hidden = true;
    answerOwn({ reading: r.reading, display: typed, next: K.nextChars(typed) });
  }

  // ============================================================
  // やめる → 確認 → 結果（DESIGN.md §3.4）
  // ============================================================
  function onQuit() {
    if (!st || st.phase !== 'play') return;
    SR.sfx.play('button');
    st.phase = 'confirm';
    clearTimeout(hintTimer); hintTimer = null;
    quietIdle();
    $('ov-quit').hidden = false;
  }

  function onQuitNo() {
    if (!st || st.phase !== 'confirm') return;
    SR.sfx.play('button');
    $('ov-quit').hidden = true;
    st.phase = 'play';
    scheduleHints();
  }

  function onQuitYes() {
    if (!st || st.phase !== 'confirm') return;
    SR.sfx.play('button');
    $('ov-quit').hidden = true;
    showResult();
  }

  function showResult() {
    st.phase = 'result';
    clearTimers();
    var kid = st.total.kid, adult = st.total.adult;   // ♥×5＋★ の合計 = 正解の回数
    var winner = kid > adult ? 'kid' : (adult > kid ? 'adult' : 'tie');
    var text = winner === 'tie' ? 'ひきわけ！' : whoName(winner) + 'の かち！';
    var w = $('winner');
    w.textContent = text;
    w.className = 'winner ' + winner;
    $('rname-kid').textContent = whoName('kid');
    $('rname-adult').textContent = whoName('adult');
    $('rmarks-kid').innerHTML = resultMarks(kid);
    $('rmarks-adult').innerHTML = resultMarks(adult);
    $('rnum-kid').textContent = kid;
    $('rnum-adult').textContent = adult;
    $('rcard-kid').classList.toggle('win', winner === 'kid');
    $('rcard-adult').classList.toggle('win', winner === 'adult');
    var box = $('result-confetti');
    if (winner === 'tie') box.innerHTML = '';
    else confetti(box, C.CONFETTI_COUNT_RESULT, C.CONFETTI_PIECES);
    // れっしゃ: 全部の車両をつないで、結果画面を走らせる
    var n = st.cars.length;
    $('train-msg').textContent = n > 0 ? n + 'りょう つながったよ！' : 'つぎは れっしゃを つなごうね';
    SR.ui.showScreen('result');
    SR.train.renderRun(st.cars);     // 画面を出してから（長さを測るため）
    SR.bgm.stop();                   // 結果画面では BGM を止める
    SR.wake.release();    // 結果画面では手放す
    SR.sfx.play(winner === 'tie' ? 'button' : 'heart');
    SR.speech.say(text);
  }

  // 結果画面のマーク（♥と★だけ。灰色の★は出さない）
  function resultMarks(total) {
    var per = C.STARS_PER_HEART;
    var h = '', s = '';
    for (var i = 0; i < Math.floor(total / per); i++) h += '♥';
    for (var j = 0; j < total % per; j++) s += '★';
    if (!h && !s) return '<span class="e">−</span>';
    return (h ? '<span class="h">' + h + '</span> ' : '') + '<span class="s">' + s + '</span>';
  }

  function onAgain() {
    SR.sfx.play('button');
    SR.train.stopRun();
    SR.voice.reset();     // 前のゲームで使えなくなった聞き取りを、もう一度使ってみる
    start();
  }

  function onEnd() {
    SR.sfx.play('button');
    SR.train.stopRun();
    SR.bgm.stop();
    stopListening();
    SR.speech.cancel();
    clearTimers();
    st = null;
    SR.wake.release();
    if (SR.main && SR.main.renderSettings) SR.main.renderSettings();   // ゲーム中に変えた「よみあげ」を反映
    SR.ui.showScreen('start');
  }

  // ============================================================
  // ボタンの結びつけ（起動時に1回）
  // ============================================================
  function init() {
    $('btn-hint').addEventListener('click', onHintButton);
    $('btn-change').addEventListener('click', onChangeButton);
    $('btn-quit').addEventListener('click', onQuit);
    $('btn-speech').addEventListener('click', onSpeechToggle);
    $('btn-mic').addEventListener('click', onMic);
    $('btn-type').addEventListener('click', onType);
    SR.voice.onChange = renderMic;   // マイクの許可が断られたときなどに、「ほかの ことば」を灰色にする
    $('listen-mic').addEventListener('click', onListenMic);
    $('listen-none').addEventListener('click', onListenNone);
    $('listen-cands').addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('.cand') : null;
      if (el) onListenPick(parseInt(el.getAttribute('data-idx'), 10));
    });
    $('listen-back').addEventListener('click', onListenBack);
    $('listen-kana').addEventListener('click', onListenKana);
    $('hints').addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('.hcard') : null;      // めくってある絵 → 答え／裏向きのカード → めくる
      if (el && el.style.display !== 'none') onCardTap(parseInt(el.getAttribute('data-slot'), 10));
    });
    // 文字のキー（五十音の表と、小さい文字・ー の行）
    var onKey = function (e) {
      var el = e.target.closest ? e.target.closest('.kcell[data-ch]') : null;
      if (el) onKanaKey(el.getAttribute('data-ch'));
    };
    $('kana-grid').addEventListener('click', onKey);
    $('kana-extra').addEventListener('click', onKey);
    $('kana-daku').addEventListener('click', function () {
      if (!st || st.phase !== 'kana') return;
      SR.sfx.play('button');
      kanaMode = kanaMode === 'daku' ? '' : 'daku';
      renderKana();
    });
    $('kana-handaku').addEventListener('click', function () {
      if (!st || st.phase !== 'kana') return;
      SR.sfx.play('button');
      kanaMode = kanaMode === 'handaku' ? '' : 'handaku';
      renderKana();
    });
    $('kana-del').addEventListener('click', onKanaDel);
    $('kana-go').addEventListener('click', onKanaDecide);
    $('kana-back').addEventListener('click', function () {
      if (!st || st.phase !== 'kana') return;
      SR.sfx.play('button');
      closeKana();
    });
    $('quit-no').addEventListener('click', onQuitNo);
    $('quit-yes').addEventListener('click', onQuitYes);
    $('btn-again').addEventListener('click', onAgain);
    $('btn-end').addEventListener('click', onEnd);
  }

  // 画面の向きや大きさが変わったとき: れっしゃの車両の幅を合わせ直す
  function relayout() {
    if (!st) return;
    if (st.phase === 'result') SR.train.renderRun(st.cars);
    else SR.train.renderStrip(st.cars);
  }

  return {
    init: init,
    start: start,
    relayout: relayout,
    // 確認・デバッグ用に状態を見られるようにしてある
    getState: function () { return st; }
  };
})();
