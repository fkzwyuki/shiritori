// config.js — 調整用の数字をぜんぶここに集める（DESIGN.md §7.5）。
// 遊びながら変えたくなる数字は、コードの中に書かず、必ずここに置く。
window.SR = window.SR || {};

SR.config = {
  // ---- ゲームの数字（DESIGN.md §7.5 の表） ----
  HINT_DELAY_SEC: -1,         // 黙ってからヒント1枚目が出るまでの秒数。-1 = 「ひんと」ボタンを押したときだけ出す（スタート画面で変えられる）
  HINT_INTERVAL_SEC: 5,       // ヒント1枚目から2枚目までの秒数（こちらは固定）
  HINT_MAX: 2,                // ヒントの絵の枚数
  HINT_INCLUDE_N: true,       // 「ん」で終わる言葉もヒントの絵に出すか（タップすると「ん が ついちゃった！」。2枚のうち最大1枚）
  STARS_PER_HEART: 5,         // 星いくつで♡1つになるか
  CORRECT_OVERLAY_SEC: 1.8,   // 「せいかい！」の演出を出しておく秒数
  FIRST_WORD: 'しりとり',      // 最初の言葉
  HINT_FOR_ADULT: false,      // おとなの番にもヒントを出すか
  STARS_PICTURE: 1,           // 絵をタップして正解したときの星の数
  STARS_OWN_WORD: 1,          // 自分で考えた言葉で正解したときの星の数
  KANA_GRID_AFTER_FAILS: 2,   // 何回聞き取れなかったら五十音表（キーボード）を出すか
  KANA_WORD_MAX: 10,          // キーボードで打てる言葉の最大の文字数（これ以上は打てない。欄の字は長いほど小さくなる）

  // ---- スタート画面の設定（おとな向け） ----
  SPEECH_ON: true,            // よみあげの初期値（オン）
  HINT_SEC_OPTIONS: [-1, 0, 2, 3, 5, 8], // 「ヒントの秒数」（1枚目まで）で選べる値（-1 = ボタンだけ、0 = すぐ出す）
  FIRST_PLAYER: 'kid',        // さいしょの手番（'kid' = こども、'adult' = おとな）
  NAMES_KEY: 'shiritori.names',   // 名前を覚える localStorage の名前（設定とは別。版は上げない）
  SETTINGS_KEY: 'shiritori.settings.v3', // 設定を覚える localStorage の名前（初期値を変えたら番号を上げる。v3 = ヒントを「ボタンだけ」に、名前を追加）
  DEFAULT_KID_NAME: '',       // こどもの名前の初期値（空なら画面では「こども」）
  DEFAULT_ADULT_NAME: 'パパ',  // おとなの名前の初期値
  FALLBACK_KID_NAME: 'こども', // 名前が空のときに画面に出す名前（こども）
  FALLBACK_ADULT_NAME: 'おとな', // 名前が空のときに画面に出す名前（おとな）
  NAME_MAX_LEN: 6,            // 名前の文字数の上限（ひらがな入力を想定。長い名前は板の中で字が小さくなる）

  // ---- 画面の大きさ ----
  STAGE_W: 1024,              // 基準の画面の幅（横向きタブレット 4:3）
  STAGE_H: 768,               // 基準の画面の高さ
  STAGE_PORTRAIT_W: 768,      // 縦向きのときの画面の幅（基準 768x1024。スマホのように縦長なら高さだけ伸ばす）
  STAGE_PORTRAIT_H_MIN: 1024, // 縦向きの画面の高さの下限（これより縦長でないときは 3:4 の枠を中央に置く）
  STAGE_PORTRAIT_H_MAX: 1366, // 縦向きの画面の高さの上限（細長いスマホで間延びしすぎないように。余りは上下の空き）

  // ---- 画面スリープ防止（Step 6） ----
  SERVICE_WORKER: true,       // ホーム画面へのインストール用の最小の Service Worker（sw.js）を登録するか。何も保存しない
  WAKE_LOCK: true,            // ゲーム中は画面を消さない（Wake Lock API。使えない端末では何もしない）

  // ---- 演出・表示（Step 3） ----
  CORRECT_OVERLAY_HEART_SEC: 3.2, // ★が5つたまって♥になるときの演出の秒数（ふつうより長く派手に）
  MISS_OVERLAY_SEC: 1.0,      // 「それは もう いったよ」などの やり直し表示を出しておく秒数
  TOAST_SEC: 1.6,             // 「もう ないよ」などの小さなお知らせを出しておく秒数
  CONFETTI_COUNT: 14,         // 正解の演出で散らす花・星の数
  CONFETTI_COUNT_HEART: 38,   // ♥ができる演出で散らす数
  CONFETTI_COUNT_RESULT: 26,  // 結果画面で勝った人に散らす数
  CONFETTI_MIN_SIZE: 4,       // 花・星の最小の大きさ（1 = 基準の画面幅の1%）
  CONFETTI_MAX_SIZE: 9,       // 花・星の最大の大きさ（同上）
  CONFETTI_KEEP_X: [20, 80],  // 花・星をよける中央の範囲（横、画面幅の％）。文字が隠れないように
  CONFETTI_KEEP_Y: [22, 78],  // 同じく縦（画面の高さの％）
  CONFETTI_DELAY_MAX_SEC: 0.5,// 花・星が出るタイミングのばらつき（秒）
  CONFETTI_PIECES: ['🌸', '⭐', '✨', '🎉', '🌼', '💮'],      // ふつうの正解で散らす絵
  CONFETTI_PIECES_HEART: ['💖', '❤️', '🌸', '⭐', '✨', '🎉'], // ♥のときに散らす絵

  // ---- 正解の演出（Phase 3）: 紙吹雪のはじけ・言葉の弾み・星が点数へ飛ぶ ----
  BURST_COUNT: 44,            // 正解で画面の下からはじける紙吹雪の数（絵と色紙が半分ずつ）
  BURST_COUNT_HEART: 84,      // ♥のときの数
  BURST_SEC: 1.5,             // 紙吹雪がはじけて落ちるまでの秒数（正解の演出の長さより短く）
  BURST_DELAY_MAX_SEC: 0.18,  // 紙吹雪が出るタイミングのばらつき（秒）
  BURST_UP_MIN: 0.45,         // はじけて上がる高さの最小（画面の高さに対する割合）
  BURST_UP_MAX: 0.95,         // 同じく最大
  BURST_SPREAD: 0.55,         // 左右のすみから、中央に向かって広がる幅の最大（画面の幅に対する割合）
  BURST_PAPER_COLORS: ['#ff6b81', '#ffd23f', '#4dd0a7', '#5aa9f0', '#b388ff', '#ff9f43'], // 色紙の色
  BURST_PAPER_SIZE: [1.1, 2.2], // 色紙の大きさ（最小・最大。1 = 基準の画面幅の1%）
  CHAR_HOP_STEP_SEC: 0.09,    // 言葉が弾んで出るとき、1文字ごとにずらす秒数
  CHAR_HOP_SEC: 0.7,          // 言葉の1文字が弾む秒数
  FLY_STAR_COUNT: 5,          // 点数の枠へ飛んでいく星の数（見た目だけ。増える点数は実際の星の数）
  FLY_STAR_COUNT_HEART: 9,    // ♥のときの星の数
  FLY_STAR_DELAY_SEC: 0.5,    // 演出が始まってから、星が飛び始めるまでの秒数
  FLY_STAR_STEP_SEC: 0.07,    // 星を1つずつ飛ばすずらし（秒）
  FLY_STAR_SEC: 0.75,         // 星が飛んでいく秒数
  FLY_STAR_SIZE: 7,           // 飛んでいく星の大きさ（1 = 基準の画面幅の1%）

  // ---- 効果音（Web Audio で作る。[周波数Hz, 長さ秒] の並びを順に鳴らす） ----
  SFX_VOLUME: 0.25,           // 効果音の大きさ（0〜1）
  SFX_CORRECT: [[523, 0.16], [659, 0.16], [784, 0.16], [1047, 0.32]],                       // 正解: ドミソド
  SFX_HEART: [[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.12], [1319, 0.12], [1568, 0.12], [2093, 0.5]], // ♥: 駆け上がる
  SFX_MISS: [[392, 0.18], [330, 0.3]],                                                       // はずれ: やさしく下がる
  SFX_BUTTON: [[660, 0.06]],                                                                 // ボタン: ぴっ
  SFX_BEEP: [[1175, 0.11]],                                                                  // 聞き取りの始まりの合図「ピッ」
  SE_CORRECT_FILE: 'se/maou_se_onepoint15.mp3', // 正解の音のファイル（魔王魂）。無い・鳴らせないときは SFX_CORRECT の Web Audio の音で代わりに鳴らす
  SE_CORRECT_VOLUME: 1.0,     // 正解の音の大きさ（0〜1。ファイルの音は 1 が最大。iPad/iPhone は端末の音量で決まる）

  // ---- 声の入力（Step 5） ----
  VOICE_MAX_ALTERNATIVES: 5,  // 聞き取りで受け取る候補の数（voice_test.html で試した値）
  VOICE_TIMEOUT_SEC: 12,      // この秒数たっても結果が返らなければ「聞き取れなかった」にする（ブラウザが固まったとき用）
  VOICE_INTERIM: true,        // 聞こえた途中の文字を画面に出すか（反応がないと感じさせないため）
  VOICE_CHOICES_MAX: 3,       // 聞き取りの候補ボタンの数（最大）
  VOICE_AUTO_RETRY: 1,        // 何も聞こえずに終わったとき、自動で聞き直す回数（押したあと1回だけ。2回目も無ければ「きこえなかった」）
  VOICE_AUTO_RETRY_KINDS: ['no-speech', 'nomatch'], // 自動で聞き直す終わり方（何も聞こえなかった）
  VOICE_BEEP_FALLBACK_SEC: 0.6, // 聞き取りが始まっても「マイクが入った」の知らせが来ないとき、この秒数で「ピッ」を鳴らす
  VOICE_LOG_MAX: 20,          // #voicelog の記録欄に残す行数

  // ---- Phase 4: しりとり れっしゃ（DESIGN §6.3-1。画面の下。正解のたびに車両がつながる） ----
  TRAIN_VISIBLE_CARS: 6,        // 横向きで見える車両の数（これより長くなると古い車両は左へ流れて見えなくなる）
  TRAIN_VISIBLE_CARS_PORTRAIT: 4, // 縦向きで見える車両の数（画面の幅がせまいので少なめ）
  TRAIN_CAR_DELAY_SEC: 1.0,     // 正解の演出が始まってから、車両がつながるまでの秒数
  TRAIN_CAR_IN_SEC: 0.55,       // 車両が右からつながる（入ってくる）秒数
  TRAIN_SCROLL_SEC: 0.5,        // 古い車両が左へ流れる秒数
  TRAIN_CAR_COLORS: ['#ef6a5b', '#f2b322', '#4dbf8f', '#5aa9f0', '#b388ff', '#ff9f43'], // 画像が無いときの車両の色（順にくり返す）
  TRAIN_ENGINE_FLIP: false,     // 機関車の絵（images/_train_engine.png）を左右反転するか。今の絵は左向きに描いてあり、機関車を左に置いて車両を右に引く並びなので反転しない（絵文字の🚂も左向き）
  TRAIN_RUN_SPEED: 26,          // 結果画面で列車が走る速さ（1秒に画面の幅の何％ぶん進むか）
  TRAIN_RUN_PAUSE_SEC: 0.8,     // 結果画面で、列車が走り抜けてから、また走り出すまでの待ち秒数
  TRAIN_RESULT_CAR_W: 13,       // 結果画面の車両1両の幅（1 = 基準の画面幅の1%）
  TRAIN_RESULT_MAX_CARS: 60,    // 結果画面で走らせる車両の最大数（長すぎて走り抜けるのに時間がかかりすぎないように。超えたら新しいほうを残す）

  // ---- Phase 4: 案内役のねこ（DESIGN §6.3-2。画面の隅。絵は images/_cat_*.png、無ければ 🐱） ----
  CAT_CALL_SEC: 3,              // 手番のはじめに声をかけるポーズ（call）を見せておく秒数（そのあと normal に戻る）
  IDLE_HINT_SEC: 15,            // 子どもの番で、この秒数だまっていたら、ねこが考えて「ひんと おしてみる？」と言う（1手番に1回まで）
  IDLE_HINT_TEXT: 'ひんと おしてみる？', // そのときの読み上げ
  CAT_BOUNCE_SEC: 0.5,          // ポーズが変わるときの軽い弾みの秒数
  CAT_FALLBACK: '🐱',            // ねこの絵が無いときの代わり
  CAT_FALLBACK_BADGE: { happy: '✨', dance: '🎵', oops: '💫', call: '💬', cheer: '🎉', sleepy: '💤', think: '💭' }, // 絵が無いとき、ポーズごとに🐱のそばに出す小さな印（normal は無し）
  CAT_POSES: ['normal', 'happy', 'dance', 'oops', 'call', 'cheer', 'sleepy', 'think'], // ポーズの名前（絵は images/_cat_<名前>.png）

  // ---- Phase 4: ひんとを めくる（DESIGN §6.3-3） ----
  CARD_FLIP_SEC: 0.4,           // カードがくるっとめくれる秒数（CSS の 3D 回転）
  SFX_FLIP: { sec: 0.16, volume: 0.35, from: 1600, to: 5200 }, // めくる音（Web Audio のノイズ）: 長さ・大きさ・音の高さの変化（Hz、はじめ→おわり）

  // ---- Phase 4: ンおばけ（DESIGN §6.3-4。「ん」で終わったとき。絵は images/_nobake_in.png と _nobake_out.png、無ければ 👻） ----
  MISS_N_OVERLAY_SEC: 2.4,      // 「ん が ついちゃった！」の表示とおばけを出しておく秒数（ふつうの やり直しより長く。おばけが出て・変な顔・手をふって消えるまで）
  GHOST_FALLBACK: '👻',          // おばけの絵が無いときの代わり

  // ---- Phase 4: BGM（DESIGN §6.3-5。曲は bgm/ に置く） ----
  BGM_FILE: 'bgm/contedefees_0007.mp3', // 曲のファイル（bgm/ に置いて、tools/build_words.py をもう一度動かすと使われる。無ければ何もしない）
  BGM_ON: true,                 // 「おんがく」の初期値（オン）
  BGM_VOLUME: 0.18,             // 曲の大きさ（0〜1。小さめ。iPad/iPhone は端末の音量で決まる）
  BGM_VOLUME_DUCK: 0.06,        // 読み上げ中の曲の大きさ
  BGM_FADE_SEC: 0.25,           // 曲の大きさを変えるときの秒数
  BGM_DUCK_SEC_PER_CHAR: 0.3,   // 読み上げの終わりの合図が来ない端末のための保険: 1文字あたりの秒数
  BGM_DUCK_PAD_SEC: 1.2,        // 同じく、読み上げ時間の見積もりに足す秒数（この時間たったら、曲の大きさを戻す）

  // ---- 以降の Step で使う数字（先に置いておく） ----
  UNDO_LONGPRESS_SEC: 1.0,    // 「まえのは なし」を何秒長押しすると取り消せるか（DESIGN §5.4）
  SPEECH_LANG: 'ja-JP',       // よみあげ・音声認識の言葉
  SPEECH_RATE: 0.9,           // よみあげの速さ（1 がふつう、小さいほどゆっくり）
  SPEECH_PITCH: 1.1           // よみあげの高さ（1 がふつう、大きいほど高い）
};
