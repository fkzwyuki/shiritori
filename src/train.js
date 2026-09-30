// train.js — しりとり れっしゃ（DESIGN.md §6.3-1）。
//   ゲーム画面の下: 機関車（左に固定）と、正解した言葉の車両の列。正解のたびに車両が右からつながり、
//                   config の TRAIN_VISIBLE_CARS 両を超えたら、古い車両は左へ流れて機関車の後ろに見えなくなる。
//   結果画面: 全部の車両をつないだ列車が、横に走り抜ける（TRAIN_RUN_SPEED）。
// 絵: 機関車 images/_train_engine.png、車両 images/_train_car.png があれば使う（build/words.js の SR_ASSETS に載っているときだけ）。
//      無いときは 🚂 と、四角い箱（CSS）で代わりにする。車両に乗せる言葉の絵は、辞書の絵文字か絵。辞書にない言葉は文字だけ。
window.SR = window.SR || {};

SR.train = (function () {
  var C = SR.config;
  var D = SR.dict;
  var $ = function (id) { return document.getElementById(id); };
  var runAnim = null;     // 結果画面の走る動き（Web Animations API）
  var runTimer = null;

  function asset(path) { return SR.ui.asset(path); }

  // 機関車（絵があれば画像、無ければ 🚂）
  function makeEngine() {
    var e = document.createElement('div');
    e.className = 'engine';
    var url = asset('images/_train_engine.png');
    if (url) {
      var im = document.createElement('img');
      im.src = url; im.alt = '';
      im.draggable = false;
      e.classList.add('art');
      if (C.TRAIN_ENGINE_FLIP) e.classList.add('flip');
      e.appendChild(im);
    } else {
      e.textContent = '🚂';
    }
    return e;
  }

  // 車両 1 両。entry = { display, reading }。idx は色を決めるための通し番号
  function makeCar(entry, idx) {
    var car = document.createElement('div');
    car.className = 'car';
    car.style.setProperty('--nl', String(Math.max(1, String(entry.display).length)));
    car.style.setProperty('--cc', C.TRAIN_CAR_COLORS[idx % C.TRAIN_CAR_COLORS.length]);
    // 乗せる絵: 辞書にある言葉の絵文字か絵。辞書にない言葉は絵なし（言葉の文字だけ）
    var cargo = document.createElement('div');
    cargo.className = 'cargo';
    var w = entry.reading ? D.find(entry.reading) : null;
    if (w && w.emoji) {
      cargo.textContent = w.emoji;
    } else if (w && w.image) {
      D.loadImage(w, function (url) {
        var im = document.createElement('img');
        im.src = url; im.alt = ''; im.draggable = false;
        cargo.appendChild(im);
      });
    } else {
      car.classList.add('nopic');
    }
    car.appendChild(cargo);
    // 車体: 絵（_train_car.png）があれば絵、無ければ色つきの箱。言葉の文字を小さく添える
    var body = document.createElement('div');
    body.className = 'body';
    var url = asset('images/_train_car.png');
    if (url) {
      car.classList.add('art');
      var im2 = document.createElement('img');
      im2.src = url; im2.alt = ''; im2.draggable = false;
      body.appendChild(im2);
    } else {
      car.classList.add('plain');
    }
    var word = document.createElement('span');
    word.className = 'w';
    word.textContent = entry.display;
    body.appendChild(word);
    car.appendChild(body);
    return car;
  }

  // ============================================================
  // ゲーム画面の列車
  // ============================================================
  function visibleCars() {
    return $('stage').classList.contains('portrait') ? C.TRAIN_VISIBLE_CARS_PORTRAIT : C.TRAIN_VISIBLE_CARS;
  }

  // 列車を最初から作り直す（ゲームのはじめ・画面の向きが変わったとき）。cars = [{display, reading}, ...]
  // 白い背景の絵（機関車・車両）があるときは、列車ぜんたいを multiply で地の色になじませる（style.css の .blend）
  function hasArt() { return !!(asset('images/_train_engine.png') || asset('images/_train_car.png')); }

  function renderStrip(cars) {
    $('train').classList.toggle('blend', hasArt());
    var eng = $('t-engine');
    eng.innerHTML = '';
    eng.appendChild(makeEngine());
    var box = $('t-cars');
    box.innerHTML = '';
    box.style.transition = 'none';
    box.style.setProperty('--scroll', C.TRAIN_SCROLL_SEC + 's');
    layoutStrip(cars.length);
    for (var i = 0; i < cars.length; i++) box.appendChild(makeCar(cars[i], i));
    void box.offsetWidth;
    box.style.transition = '';
  }

  // 車両の幅（見える数で割った幅）と、古い車両を左に流す量を決める
  function layoutStrip(n) {
    var view = $('t-view');
    var box = $('t-cars');
    var vw = view.clientWidth;      // ステージの中の長さ（拡大縮小の前）
    var vis = visibleCars();
    var cw = vw / vis;
    box.style.setProperty('--carw', cw + 'px');
    var off = Math.max(0, n - vis) * cw;
    box.style.transform = 'translateX(' + (-off) + 'px)';
  }

  // 車両を 1 両つなぐ。右から入ってきて、長くなったら全体が左へ流れる
  function addCar(cars, entry) {
    var box = $('t-cars');
    var idx = cars.length - 1;      // cars には追加済みのものを渡す
    var car = makeCar(entry, idx);
    car.classList.add('new');
    car.style.animationDuration = C.TRAIN_CAR_IN_SEC + 's';
    box.appendChild(car);
    layoutStrip(cars.length);
    setTimeout(function () { car.classList.remove('new'); }, C.TRAIN_CAR_IN_SEC * 1000 + 50);
  }

  // ============================================================
  // 結果画面の列車（全部の車両をつないで、横に走らせる）
  // ============================================================
  function stopRun() {
    clearTimeout(runTimer); runTimer = null;
    if (runAnim) { try { runAnim.cancel(); } catch (e) { /* 何もしない */ } runAnim = null; }
  }

  function renderRun(cars) {
    stopRun();
    var track = $('runtrain');
    $('runlane').classList.toggle('blend', hasArt());
    track.innerHTML = '';
    track.appendChild(makeEngine());
    // 車両が多すぎるときは、新しいほうを残す（走り抜けるのに時間がかかりすぎないように）
    var start = Math.max(0, cars.length - C.TRAIN_RESULT_MAX_CARS);
    for (var i = start; i < cars.length; i++) track.appendChild(makeCar(cars[i], i));
    var lane = $('runlane');
    var laneW = lane.clientWidth;
    var trainW = track.offsetWidth;
    var reduce = false;
    try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { reduce = false; }
    if (reduce || !track.animate) { track.style.transform = 'translateX(0)'; return; }
    // 右から入って、左へ走り抜ける。走り抜けたら少し待って、また右から
    var runMs = (laneW + trainW) / (laneW * C.TRAIN_RUN_SPEED / 100) * 1000;
    var pauseMs = C.TRAIN_RUN_PAUSE_SEC * 1000;
    var total = runMs + pauseMs;
    var from = 'translateX(' + laneW + 'px)';
    var to = 'translateX(' + (-trainW) + 'px)';
    try {
      runAnim = track.animate(
        [{ transform: from, offset: 0 }, { transform: to, offset: runMs / total }, { transform: to, offset: 1 }],
        { duration: total, iterations: Infinity, easing: 'linear' }
      );
    } catch (e) { runAnim = null; track.style.transform = 'translateX(0)'; }
  }

  return {
    renderStrip: renderStrip, layoutStrip: layoutStrip, addCar: addCar,
    renderRun: renderRun, stopRun: stopRun,
    // 確認用
    debug: function () { return { running: !!runAnim, visible: visibleCars(), cars: document.querySelectorAll('#t-cars .car').length }; }
  };
})();
