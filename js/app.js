// FILE: js/app.js
/* =========================================================
   TalisPod  app.js  v0.79
   UI制御・イベント・rafLoop・演出

   依存（読み込み順）:
     window.TSP_STATE    (state.js)
     window.TSP_AREAMAP  (areaMap.js)
     window.TSP_AREA     (areaResolver.js)
     window.TSP_GAME     (game.js)

   公開: なし（IIFE内完結）
   ========================================================= */
(function () {
  "use strict";

  /* =========================================================
     定数
     ========================================================= */

  /** スプライト設定 */
  const SHEET = Object.freeze({
    frameW: 24,
    frameH: 32,
    scale:  3,
    cols:   4,
    /** フレームインデックス(1〜8) → {row, col} */
    frameToRC(i) {
      const idx = Math.max(1, Math.min(8, i)) - 1;
      return { r: Math.floor(idx / SHEET.cols), c: idx % SHEET.cols };
    }
  });

  /** レジェンズ定義（v0.8でLegendzDataへ移行） */
  const MONSTER = Object.freeze({
    id:         "windragon",
    spritePath: "./assets/sprites/windragon.png",
    superBest:  { temp: -45, hum: 5, waterDepth: 50 },
    bestAreaId: null
  });

  /** 歩行設定 */
  const WALK_HALF_RANGE_PX  = 84;
  const WALK_SPEED_PX_PER_S = 12;
  const WALK_STEP_INTERVAL  = 0.5;
  const WALK_TURN_PAUSE     = 0.5;

  /** LocalStorage キー */
  const LS_KEY = "talis_pod_save";

  /* =========================================================
     ユーティリティ
     ========================================================= */
  const $ = (id) => document.getElementById(id);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function must(id) {
    const el = $(id);
    if (!el) throw new Error(`DOM missing: #${id}`);
    return el;
  }

  function safeText(s) {
    return String(s ?? "").replace(/\s+/g, " ").trim();
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* =========================================================
     Toast
     ========================================================= */
  let _toastEl    = null;
  let _toastTimer = null;

  function ensureToast() {
    if (_toastEl) return _toastEl;
    const el = document.createElement("div");
    el.id = "tspToast";
    document.body.appendChild(el);
    _toastEl = el;
    return el;
  }

  function toast(msg, ms = 1400) {
    try {
      const el = ensureToast();
      el.textContent = String(msg ?? "");
      el.style.display = "block";
      if (_toastTimer) clearTimeout(_toastTimer);
      _toastTimer = setTimeout(() => { el.style.display = "none"; }, ms);
    } catch (e) {
      console.error("[toast]", e);
    }
  }

  /* =========================================================
     Notice Modal（OKボタン付き）
     ========================================================= */
  let _noticeModal = null;

  function ensureNoticeModal() {
    if (_noticeModal) return _noticeModal;
    const el = document.createElement("div");
    el.className = "modal-backdrop";
    el.innerHTML = `
      <div class="modal">
        <div id="_nzTitle" class="modal-title">お知らせ</div>
        <div id="_nzBody" class="modal-body"></div>
        <div class="modal-actions">
          <button id="_nzOk" type="button" class="btn-primary">OK</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => { if (e.target === el) closeNotice(); });
    $("_nzOk").onclick = () => closeNotice();
    _noticeModal = el;
    return el;
  }

  function openNotice(title, body) {
    const m = ensureNoticeModal();
    $("_nzTitle").textContent = String(title ?? "お知らせ");
    $("_nzBody").textContent  = String(body  ?? "");
    m.classList.add("active");
  }

  function closeNotice() {
    _noticeModal && _noticeModal.classList.remove("active");
  }

  function showError(where, e) {
    const msg = (e && (e.message || String(e))) || "unknown error";
    console.error(`[${where}]`, e);
    openNotice("エラー / Error", `(${where})\n${msg}`);
  }

  /* =========================================================
     Confirm Modal（はい / いいえ）
     ========================================================= */
  let _confirmModal = null;

  function ensureConfirmModal() {
    if (_confirmModal) return _confirmModal;
    const el = document.createElement("div");
    el.className = "modal-backdrop";
    el.innerHTML = `
      <div class="modal">
        <div id="_cfTitle" class="modal-title">確認 / Confirm</div>
        <div id="_cfBody" class="modal-body"></div>
        <div class="modal-actions">
          <button id="_cfYes" type="button" class="btn-primary">はい / Yes</button>
          <button id="_cfNo"  type="button" class="btn-ghost">いいえ / No</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => { if (e.target === el) closeConfirm(); });
    $("_cfNo").onclick = () => closeConfirm();
    _confirmModal = el;
    return el;
  }

  function openConfirm(title, body, onYes) {
    const m = ensureConfirmModal();
    $("_cfTitle").textContent = String(title ?? "確認");
    $("_cfBody").textContent  = String(body  ?? "");
    $("_cfYes").onclick = () => { closeConfirm(); try { onYes && onYes(); } catch (e) { showError("confirmYes", e); } };
    m.classList.add("active");
  }

  function closeConfirm() {
    _confirmModal && _confirmModal.classList.remove("active");
  }

  /* =========================================================
     Adventure Overlay（冒険中…）
     ========================================================= */
  let _advOverlay = null;

  function ensureAdvOverlay() {
    if (_advOverlay) return _advOverlay;
    const el = document.createElement("div");
    el.className = "adventure-overlay";
    const box = document.createElement("div");
    box.className = "adventure-overlay__box";
    box.id = "_advBox";
    el.appendChild(box);
    document.body.appendChild(el);
    _advOverlay = el;
    return el;
  }

  function showAdventure(text = "冒険中… / Exploring…") {
    const ov  = ensureAdvOverlay();
    const box = $("_advBox");
    if (box) box.textContent = text;
    ov.classList.add("active");
  }

  function hideAdventure() {
    _advOverlay && _advOverlay.classList.remove("active");
  }

  /* =========================================================
     Comeback Modal（ソウルドールコード）
     ========================================================= */
  let _cbModal      = null;
  let _cbModalBound = false;

  function ensureCbModal() {
    if (_cbModal) return _cbModal;
    const el = document.createElement("div");
    el.className = "modal-backdrop";
    el.innerHTML = `
      <div class="modal">
        <div class="modal-title">ソウルドールの記憶 / Soul Code</div>
        <div id="_cbSaga" class="modal-body" style="font-size:12px;margin-bottom:6px;"></div>
        <textarea id="_cbArea" class="modal-code" readonly></textarea>
        <div class="modal-actions">
          <button id="_cbCopy"   type="button" class="btn-sub">
            コピー / Copy
          </button>
          <button id="_cbReborn" type="button" class="btn-ghost">
            リボーン画面へ / Go to Reborn
          </button>
          <button id="_cbClose"  type="button" class="btn-ghost">
            戻る / Back
          </button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => { if (e.target === el) closeCbModal(); });
    _cbModal = el;
    return el;
  }

  function openCbModal(soul) {
    const m    = ensureCbModal();
    const code = TSP_STATE.makeSoulCode(soul);
    $("_cbSaga").textContent = `サーガ名 / Saga：${soul.sagaName}`;
    $("_cbArea").value       = code;

    if (!_cbModalBound) {
      _cbModalBound = true;

      $("_cbCopy").onclick = async () => {
        try {
          const area = $("_cbArea");
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(area.value);
            toast("コピーしました / Copied");
          } else {
            area.focus(); area.select();
            openNotice("コピー", "自動コピー非対応です。\n選択された状態なので手動でコピーしてください。");
          }
        } catch (e) { showError("cbCopy", e); }
      };

      $("_cbReborn").onclick = () => {
        closeCbModal();
        goToStart();
      };

      $("_cbClose").onclick = () => closeCbModal();
    }

    m.classList.add("active");
  }

  function closeCbModal() {
    _cbModal && _cbModal.classList.remove("active");
  }

  /* =========================================================
     状態変数
     ========================================================= */
  const G = window.TSP_GAME;
  const TSP_STATE = window.TSP_STATE;

  // ゲーム状態
  let soul        = null;
  let envDraft    = { temp: 0, hum: 50, light: 50 };
  let envApplied  = { temp: 0, hum: 50, light: 50 };
  const elemCounter = { magic: 0, counter: 0, attack: 0, recover: 0 };

  // ループ
  let lastRafMs   = null;
  let secondsAccum = 0;
  let uiLocked    = false;

  // スプライト
  const walk = { x: 0, facing: "right", stepTimer: 0, stepFrame: 1, turnTimer: 0 };
  const idle = { timer: 0, frame: 1 };

  // FX
  const fxAcc    = { super: 0, best: 0, good: 0 };
  let lastRankKey = null;

  // DOM refs（boot()で初期化）
  let elStartView, elMainView;
  let elHeaderLine1, elHeaderLine2, elHeaderLine3;
  let elSagaInput, elSoulTextInput, elNewSoulBtn, elTextRebornBtn;
  let elTabBtns, elTabEls;
  let elScene;
  let elEnvAttrLabel, elGrowthTimer, elGrowthPreview;
  let elHpAlert, elHomeNeutralBtn;
  let elSpriteMover, elSpriteViewport, elSpriteSheet, elSpriteFx;
  let elTempSlider, elHumSlider;
  let elTempVal, elHumVal, elLightVal, elLightLabel;
  let elLightBtn0, elLightBtn50, elLightBtn100;
  let elLightGuide, elEnvPreview, elNeutralBtn, elApplyEnvBtn;
  let elSpeciesName, elLegAttr;
  let elNickInput, elNickApplyBtn;
  let elHpStat, elMagicStat, elCounterStat, elAttackStat, elRecoverStat;
  let elGrowHpProg, elGrowHpBar;
  let elSkillSlots, elCrystalList;
  let elComebackBtn;

  /* =========================================================
     UI Lock
     ========================================================= */
  function lockUI(on) {
    uiLocked = on;
    if (elTabBtns)    elTabBtns.forEach((b) => { b.disabled = on; });
    if (elApplyEnvBtn) elApplyEnvBtn.disabled = on;
    if (elNeutralBtn)  elNeutralBtn.disabled  = on;
    if (elHomeNeutralBtn) elHomeNeutralBtn.disabled = on;
  }

  /* =========================================================
     View / Tab
     ========================================================= */
  function showView(view) {
    elStartView.classList.remove("active");
    elMainView.classList.remove("active");
    view.classList.add("active");
    document.body.classList.toggle("unreborn", view === elStartView);
  }

  function activeTabKey() {
    const b = elTabBtns.find((b) => b.classList.contains("active"));
    return (b && b.dataset.tab) || "home";
  }

  function switchTab(key) {
    elTabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === key));
    Object.values(elTabEls).forEach((el) => el.classList.remove("active"));
    if (elTabEls[key]) elTabEls[key].classList.add("active");
  }

  function goToStart() {
    soul = null;
    updateHeader();
    showView(elStartView);
  }

  /* =========================================================
     Header
     ========================================================= */
  function updateHeader() {
    if (!soul) {
      elHeaderLine1.textContent = "";
      elHeaderLine2.textContent = "";
      elHeaderLine3.textContent = "未リボーン / Not Reborn";
      return;
    }
    const meta = G.ATTR_META[soul.attribute];
    const attrJp = meta ? `${meta.jp} / ${meta.en}` : soul.attribute;
    elHeaderLine1.textContent = `Saga：${soul.sagaName}`;
    elHeaderLine2.textContent = `${soul.speciesName}  [${attrJp}]`;
    elHeaderLine3.textContent = soul.nickname
      ? `"${soul.nickname}"`
      : "Nickname：未設定";
  }

  /* =========================================================
     属性ラベル（日英）
     ========================================================= */
  function attrLabel(attrKey) {
    const meta = G.ATTR_META[attrKey];
    if (!meta) return String(attrKey || "");
    return `${meta.jp} / ${meta.en}`;
  }

  /* =========================================================
     シーン背景クラス
     ========================================================= */
  function setSceneBg(envAttr) {
    elScene.classList.remove(
      "attr-none", "attr-volcano", "attr-tornado", "attr-earthquake", "attr-storm"
    );
    switch (envAttr) {
      case "volcano":    elScene.classList.add("attr-volcano");    break;
      case "tornado":    elScene.classList.add("attr-tornado");    break;
      case "earthquake": elScene.classList.add("attr-earthquake"); break;
      case "storm":      elScene.classList.add("attr-storm");      break;
      default:           elScene.classList.add("attr-none");
    }
  }

  /* =========================================================
     Stats UI
     ========================================================= */
  function refreshStatsUI() {
    if (!soul) return;

    const mx = G.maxHP(soul);
    elHpStat.textContent      = `${soul.currentHP} / ${mx}`;
    elMagicStat.textContent   = String(soul.baseStats.magic   + soul.growStats.magic);
    elCounterStat.textContent = String(soul.baseStats.counter + soul.growStats.counter);
    elAttackStat.textContent  = String(soul.baseStats.attack  + soul.growStats.attack);
    elRecoverStat.textContent = String(soul.baseStats.recover + soul.growStats.recover);

    elSpeciesName.textContent = soul.speciesName;
    elLegAttr.textContent     = attrLabel(soul.attribute);
    elNickInput.value         = soul.nickname || "";

    // 育成進捗
    const def       = TSP_STATE.DEFAULT_LEGENDZ;
    const maxGrowHP = def.maxGrowHP;
    const pct       = Math.min(100, Math.round((soul.growHP / maxGrowHP) * 100));
    elGrowHpProg.textContent   = `${soul.growHP} / ${maxGrowHP}`;
    elGrowHpBar.style.width    = `${pct}%`;

    // HP危機アラート（maxHPの20%以下）
    if (elHpAlert) {
      const ratio = mx > 0 ? soul.currentHP / mx : 1;
      elHpAlert.style.display = ratio <= 0.2 ? "block" : "none";
    }
  }

  /* =========================================================
     Crystal UI
     ========================================================= */
  function refreshCrystalUI() {
    if (!soul || !elCrystalList) return;
    const crystals = soul.crystals || {};
    const keys     = Object.keys(crystals);

    if (keys.length === 0) {
      elCrystalList.innerHTML =
        `<p class="label-muted" style="text-align:center; padding:20px 0;">
           クリスタルなし / No Crystals
         </p>`;
      return;
    }

    elCrystalList.innerHTML = "";
    for (const id of keys) {
      const cnt  = crystals[id] || 0;
      const item = document.createElement("div");
      item.className = "crystal-item";
      item.innerHTML = `
        <div class="crystal-info">
          <div class="crystal-name">${id}</div>
          <div class="crystal-desc">使用機能はv0.8で実装予定</div>
        </div>
        <div class="crystal-count">×${cnt}</div>`;
      elCrystalList.appendChild(item);
    }
  }

  /* =========================================================
     Skills UI
     ========================================================= */
  function refreshSkillsUI() {
    if (!soul || !elSkillSlots) return;
    elSkillSlots.innerHTML = "";

    const moves = soul.moves || [];
    for (let i = 0; i < 15; i++) {
      const skillId = moves[i] || null;
      const slot    = document.createElement("div");
      slot.className = "skill-slot";

      if (skillId) {
        // v0.8でSkillDataから取得予定。現行はIDをそのまま表示
        slot.innerHTML = `
          <div class="slot-left">
            <div class="slot-name">${skillId}</div>
            <div class="slot-meta">Slot ${i + 1}</div>
          </div>`;
      } else {
        slot.classList.add("slot-empty");
        slot.innerHTML = `
          <div class="slot-left">
            <div class="slot-name">── 空きスロット / Empty ──</div>
            <div class="slot-meta">Slot ${i + 1}</div>
          </div>`;
      }
      elSkillSlots.appendChild(slot);
    }
  }

  /* =========================================================
     Env UI
     ========================================================= */
  function initSliders() {
    const TEMP = G.TEMP_STEPS;
    const HUM  = G.HUM_STEPS;
    elTempSlider.min  = "0";
    elTempSlider.max  = String(TEMP.length - 1);
    elTempSlider.step = "1";
    elHumSlider.min   = "0";
    elHumSlider.max   = String(HUM.length - 1);
    elHumSlider.step  = "1";
  }

  function setLightDraft(val) {
    envDraft.light = val;
    elLightVal.textContent = String(val);
    [elLightBtn0, elLightBtn50, elLightBtn100].forEach((b) => b.classList.remove("active"));
    if      (val === 0)   elLightBtn0.classList.add("active");
    else if (val === 50)  elLightBtn50.classList.add("active");
    else if (val === 100) elLightBtn100.classList.add("active");
  }

  function readDraftFromSliders() {
    envDraft.temp = G.TEMP_STEPS[Number(elTempSlider.value)] ?? 0;
    envDraft.hum  = G.HUM_STEPS[Number(elHumSlider.value)]  ?? 50;
  }

  function setSlidersFromDraft() {
    const tIdx = G.TEMP_STEPS.indexOf(Number(envDraft.temp));
    const hIdx = G.HUM_STEPS.indexOf(Number(envDraft.hum));
    elTempSlider.value = String(tIdx >= 0 ? tIdx : 10); // デフォルト index 10 = 0℃
    elHumSlider.value  = String(hIdx >= 0 ? hIdx : 10); // デフォルト index 10 = 50%
  }

  function refreshEnvUI() {
    elTempVal.textContent = `${envDraft.temp}℃`;
    elHumVal.textContent  = `${envDraft.hum}％`;

    // 光量 / 水深ラベル切替
    elLightLabel.textContent =
      Number(envDraft.hum) === 100 ? "水深 / Depth" : "光量 / Light";

    // 予想環境
    const attr = G.envAttribute(envDraft.temp, envDraft.hum, envDraft.light);
    elEnvPreview.textContent = attrLabel(attr);

    // 期待光量ガイド
    const expected = G.expectedLightByTime(new Date());
    elLightGuide.textContent =
      `現在の期待光量 / Expected：${expected}　（陸上はこの値に合わせてください）`;
  }

  /* =========================================================
     Home: 成長プレビュー・タイマー表示
     ========================================================= */
  function updateHomeInfo() {
    if (!soul) return;

    const info = G.computeMinutePreview(soul, MONSTER, envApplied, new Date(), elemCounter);

    if (info.rank === G.Rank.neutral) {
      elGrowthTimer.textContent   = "環境成長なし / No Growth";
      elGrowthPreview.textContent = "";
      return;
    }

    const sec = Math.max(0, Math.floor(60 - secondsAccum));
    const mm  = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss  = String(sec % 60).padStart(2, "0");
    elGrowthTimer.textContent = `${mm}:${ss}`;

    const parts = [];
    if (info.heal    > 0) parts.push(`回復 +${info.heal}`);
    if (info.hpDmg   > 0) parts.push(`HP -${info.hpDmg}`);
    if (info.hpGrow  > 0) parts.push(`HP成長 +${info.hpGrow}`);
    if (info.statKey && info.statGrow > 0) {
      const meta = G.ATTR_META[envApplied.light !== undefined
        ? G.envAttribute(envApplied.temp, envApplied.hum, envApplied.light)
        : "neutral"];
      // statKeyから日本語名へ
      const statNameMap = { magic:"マホウ", counter:"カウンター", attack:"ダゲキ", recover:"カイフク" };
      parts.push(`${statNameMap[info.statKey] || info.statKey} +${info.statGrow}`);
    }
    elGrowthPreview.textContent = parts.join("  /  ");
  }

  /* =========================================================
     Sprite helpers
     ========================================================= */
  function initSpriteSize() {
    const w = SHEET.frameW * SHEET.scale;
    const h = SHEET.frameH * SHEET.scale;
    const sw = SHEET.frameW * SHEET.cols * SHEET.scale;  // 288
    const sh = SHEET.frameH * 2           * SHEET.scale; // 192（2行）

    elSpriteViewport.style.width    = `${w}px`;
    elSpriteViewport.style.height   = `${h}px`;
    elSpriteSheet.style.width       = `${sw}px`;
    elSpriteSheet.style.height      = `${sh}px`;
    elSpriteSheet.style.backgroundImage    = `url("${MONSTER.spritePath}")`;
    elSpriteSheet.style.backgroundRepeat   = "no-repeat";
    elSpriteSheet.style.backgroundSize     = `${sw}px ${sh}px`;
    elSpriteSheet.style.imageRendering     = "pixelated";
  }

  function renderFrame(frameIdx) {
    const rc = SHEET.frameToRC(frameIdx);
    const x  = -(rc.c * SHEET.frameW * SHEET.scale);
    const y  = -(rc.r * SHEET.frameH * SHEET.scale);
    elSpriteSheet.style.backgroundPosition = `${x}px ${y}px`;
  }

  function setFacing(dir) {
    elSpriteViewport.style.transform = dir === "right" ? "scaleX(-1)" : "scaleX(1)";
  }

  function applyMoveX(x) {
    elSpriteMover.style.transform = `translateX(${x}px)`;
  }

  function centerSprite() {
    walk.x = 0;
    applyMoveX(0);
  }

  /* =========================================================
     Sprite tick
     ========================================================= */
  function tickIdle(dt) {
    idle.timer += dt;
    if (idle.timer >= 0.5) {
      idle.timer -= 0.5;
      idle.frame  = idle.frame === 1 ? 2 : 1;
    }
  }

  function tickWalk(dt) {
    if (walk.turnTimer > 0) {
      walk.turnTimer -= dt;
      setFacing(walk.facing);
      renderFrame(3);
      applyMoveX(walk.x);
      return;
    }

    const dir = walk.facing === "right" ? 1 : -1;
    walk.x   += WALK_SPEED_PX_PER_S * dt * dir;

    if (walk.x > WALK_HALF_RANGE_PX) {
      walk.x        = WALK_HALF_RANGE_PX;
      walk.facing   = "left";
      walk.turnTimer = WALK_TURN_PAUSE;
      walk.stepTimer = 0;
    } else if (walk.x < -WALK_HALF_RANGE_PX) {
      walk.x        = -WALK_HALF_RANGE_PX;
      walk.facing   = "right";
      walk.turnTimer = WALK_TURN_PAUSE;
      walk.stepTimer = 0;
    }

    walk.stepTimer += dt;
    if (walk.stepTimer >= WALK_STEP_INTERVAL) {
      walk.stepTimer  -= WALK_STEP_INTERVAL;
      walk.stepFrame   = walk.stepFrame === 1 ? 2 : 1;
    }

    setFacing(walk.facing);
    renderFrame(walk.stepFrame);
    applyMoveX(walk.x);
  }

  /* =========================================================
     FX（DOMパーティクル）
     ========================================================= */
  function clearSceneFx() {
    elScene.classList.remove("fx-superbest", "fx-best", "fx-good", "fx-bad");
    qsa(".tsp-particle").forEach((p) => p.remove());
  }

  function spawnParticle({ text, xPct, yPct, cls, dur, dx, dy, rot, scale, sizePx }) {
    const p = document.createElement("div");
    p.className         = `tsp-particle ${cls}`;
    p.textContent       = text;
    p.style.left        = `${xPct}%`;
    p.style.top         = `${yPct}%`;
    p.style.fontSize    = `${sizePx}px`;
    p.style.setProperty("--tspDur", `${dur}s`);
    p.style.setProperty("--tspDX",  `${dx}px`);
    p.style.setProperty("--tspDY",  `${dy}px`);
    p.style.setProperty("--tspR",   `${rot}deg`);
    p.style.setProperty("--tspS",   `${scale}`);
    elScene.appendChild(p);
    const rm = Math.max(900, dur * 1000 + 220);
    setTimeout(() => { try { p.remove(); } catch {} }, rm);
  }

  function emitSuperbest(dt) {
    elScene.classList.add("fx-superbest");
    fxAcc.super += dt;
    const interval = 0.06;
    while (fxAcc.super >= interval) {
      fxAcc.super -= interval;
      for (let i = 0; i < 6; i++) {
        const isSpark = Math.random() > 0.52;
        spawnParticle({
          text:   isSpark ? "✨" : "♪",
          xPct:   rand(2, 98),
          yPct:   rand(2, 98),
          cls:    "tsp-fly",
          dur:    rand(1.0, 1.9),
          dx:     rand(-140, 140),
          dy:     rand(-220, 80),
          rot:    rand(-30, 30),
          scale:  rand(0.9, 1.35),
          sizePx: isSpark ? rand(16, 24) : rand(14, 22)
        });
      }
    }
  }

  function emitBest(dt) {
    elScene.classList.add("fx-best");
    fxAcc.best += dt;
    const interval = 0.12;
    while (fxAcc.best >= interval) {
      fxAcc.best -= interval;
      for (let i = 0; i < 4; i++) {
        const isSpark = Math.random() > 0.86;
        spawnParticle({
          text:   isSpark ? "✨" : "♪",
          xPct:   rand(4, 96),
          yPct:   rand(-8, 6),
          cls:    "tsp-fall",
          dur:    rand(1.4, 2.2),
          dx:     rand(-22, 22),
          dy:     rand(220, 340),
          rot:    rand(-12, 12),
          scale:  rand(0.9, 1.2),
          sizePx: isSpark ? rand(16, 22) : rand(14, 20)
        });
      }
    }
  }

  function emitGood(dt) {
    elScene.classList.add("fx-good");
    fxAcc.good += dt;
    const interval = 0.45;
    while (fxAcc.good >= interval) {
      fxAcc.good -= interval;
      const cnt = 1 + (Math.random() > 0.7 ? 1 : 0);
      for (let i = 0; i < cnt; i++) {
        spawnParticle({
          text:   "♪",
          xPct:   rand(8, 92),
          yPct:   rand(-6, 10),
          cls:    "tsp-drift",
          dur:    rand(1.8, 2.6),
          dx:     rand(-14, 14),
          dy:     rand(160, 240),
          rot:    rand(-14, 14),
          scale:  rand(0.9, 1.15),
          sizePx: rand(13, 18)
        });
      }
    }
  }

  /* =========================================================
     Home メインレンダリング（毎フレーム）
     ========================================================= */
  function renderHome(dt) {
    if (!soul) return;

    const now  = new Date();
    const info = G.computeRank(MONSTER, envApplied, now, soul.attribute);
    const R    = G.Rank;

    // シーン背景
    setSceneBg(info.envAttr);

    // 環境ラベル
    if (info.rank === R.neutral) {
      elEnvAttrLabel.textContent = "無属性 / Neutral";
    } else {
      const areaJp = info.areaName   || "";
      const areaEn = info.areaNameEn || "";
      const name   = areaJp && areaEn ? `${areaJp} / ${areaEn}` : (areaJp || areaEn || attrLabel(info.envAttr));
      elEnvAttrLabel.textContent = `${name}  [${G.rankLabel(info.rank)}]`;
    }

    // 無属性ボタン表示
    if (elHomeNeutralBtn) {
      elHomeNeutralBtn.style.display = info.rank !== R.neutral ? "block" : "none";
    }

    // ランクキー変化 → FX リセット
    const key = `${info.rank}|${info.envAttr}`;
    if (key !== lastRankKey) {
      clearSceneFx();
      fxAcc.super = 0; fxAcc.best = 0; fxAcc.good = 0;
      lastRankKey = key;
    }

    // ランク別スプライト・演出
    switch (info.rank) {
      case R.superbest:
        setFacing("left"); renderFrame(7); centerSprite();
        emitSuperbest(dt);
        break;
      case R.best:
        setFacing("left"); renderFrame(7); centerSprite();
        emitBest(dt);
        break;
      case R.good:
        tickIdle(dt); setFacing("left"); renderFrame(idle.frame); centerSprite();
        emitGood(dt);
        break;
      case R.normal:
        tickIdle(dt); setFacing("left"); renderFrame(idle.frame); centerSprite();
        break;
      case R.bad:
        setFacing("left"); renderFrame(8); centerSprite();
        elScene.classList.add("fx-bad");
        break;
      default: // neutral
        tickWalk(dt);
        break;
    }
  }

  /* =========================================================
     rafLoop（メインゲームループ）
     ========================================================= */
  function rafLoop(msNow) {
    if (lastRafMs == null) lastRafMs = msNow;
    const dt    = Math.min(0.05, (msNow - lastRafMs) / 1000); // 最大50ms cap
    lastRafMs   = msNow;

    const tab = activeTabKey();

    if (soul && tab === "home") {
      secondsAccum += dt;

      // 1分処理
      if (secondsAccum >= 60) {
        secondsAccum -= 60;
        try {
          G.applyOneMinute(soul, MONSTER, envApplied, new Date(), elemCounter);
          refreshStatsUI();
          saveGame(); // 成長処理後に自動保存
        } catch (e) {
          showError("applyOneMinute", e);
        }
      }

      try {
        updateHomeInfo();
        renderHome(dt);
      } catch (e) {
        showError("homeRender", e);
      }
    }

    requestAnimationFrame(rafLoop);
  }

  /* =========================================================
     LocalStorage 保存 / 読み込み
     ========================================================= */
  function saveGame() {
    if (!soul) return;
    try {
      localStorage.setItem(LS_KEY, TSP_STATE.makeSoulCode(soul));
    } catch (e) {
      console.warn("[saveGame] 保存失敗（継続）", e);
    }
  }

  function loadGame() {
    try {
      const code = localStorage.getItem(LS_KEY);
      if (!code) return null;
      return TSP_STATE.parseSoulCode(code);
    } catch (e) {
      console.warn("[loadGame] 読み込み失敗（新規として扱う）", e);
      return null;
    }
  }

  /* =========================================================
     環境リセット
     ========================================================= */
  function resetEnvToNeutral(applyToo) {
    envDraft = { temp: 0, hum: 50, light: 50 };
    setSlidersFromDraft();
    setLightDraft(50);
    refreshEnvUI();
    if (applyToo) {
      envApplied   = { ...envDraft };
      secondsAccum = 0;
      lastRankKey  = null;
      updateHomeInfo();
      renderHome(0);
    }
  }

  /* =========================================================
     環境決定（冒険オーバーレイ付き）
     ========================================================= */
  async function applyEnvironment() {
    if (uiLocked) return;
    lockUI(true);
    try {
      showAdventure("冒険中… / Exploring…");
      await sleep(3000);
    } finally {
      hideAdventure();
      envApplied   = { ...envDraft };
      secondsAccum = 0;
      lastRankKey  = null;
      switchTab("home");
      lockUI(false);
      updateHomeInfo();
      renderHome(0);
    }
  }

  /* =========================================================
     リボーン後の初期化
     ========================================================= */
  function pipelineAfterReborn() {
    // 環境初期化
    resetEnvToNeutral(true);

    // スプライト初期化
    initSpriteSize();
    setFacing("left");
    renderFrame(1);
    applyMoveX(0);
    walk.x = 0; walk.facing = "right";
    walk.stepTimer = 0; walk.stepFrame = 1; walk.turnTimer = 0;
    idle.timer = 0; idle.frame = 1;

    // FX リセット
    clearSceneFx();
    fxAcc.super = 0; fxAcc.best = 0; fxAcc.good = 0;
    lastRankKey = null;
    lastRafMs   = null;

    // UI 更新
    updateHeader();
    refreshStatsUI();
    refreshCrystalUI();
    refreshSkillsUI();

    // 画面遷移
    showView(elMainView);
    switchTab("home");

    // 保存
    saveGame();
  }

  /* =========================================================
     イベント登録
     ========================================================= */
  function bindEvents() {

    /* ---------- タブ ---------- */
    elTabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (uiLocked) return;
        switchTab(btn.dataset.tab);
        if (btn.dataset.tab === "home") {
          updateHomeInfo();
          renderHome(0);
        }
      });
    });

    /* ---------- 新規リボーン ---------- */
    elNewSoulBtn.addEventListener("click", () => {
      try {
        const saga = safeText(elSagaInput.value);
        if (!saga) return openNotice("入力エラー", "サーガ名を入力してください");
        soul = TSP_STATE.makeNewSoul(saga);
        pipelineAfterReborn();
      } catch (e) { showError("newReborn", e); }
    });

    /* ---------- 記憶からリボーン ---------- */
    elTextRebornBtn.addEventListener("click", () => {
      try {
        const saga = safeText(elSagaInput.value);
        if (!saga) return openNotice("入力エラー", "サーガ名を入力してください");

        const code = safeText(elSoulTextInput.value);
        if (!code) return openNotice("入力エラー", "ソウルドールコードを入力してください");

        const parsed = TSP_STATE.parseSoulCode(code);
        TSP_STATE.assertSagaMatch(parsed, saga);

        soul = parsed;
        pipelineAfterReborn();
      } catch (e) { showError("memoryReborn", e); }
    });

    /* ---------- カムバック ---------- */
    elComebackBtn.addEventListener("click", () => {
      if (!soul) return openNotice("未リボーン", "レジェンズがいません");
      try { openCbModal(soul); }
      catch (e) { showError("comeback", e); }
    });

    /* ---------- 無属性（Home） ---------- */
    if (elHomeNeutralBtn) {
      elHomeNeutralBtn.addEventListener("click", () => {
        if (!soul) return;
        openConfirm(
          "無属性環境にする / Set Neutral",
          "育成環境を無属性にリセットします。よろしいですか？",
          () => {
            resetEnvToNeutral(true);
            toast("無属性環境にしました / Set to Neutral");
            saveGame();
          }
        );
      });
    }

    /* ---------- ニックネーム ---------- */
    elNickApplyBtn.addEventListener("click", () => {
      if (!soul) return;
      try {
        soul.nickname = safeText(elNickInput.value).slice(0, 15);
        updateHeader();
        saveGame();
        toast("ニックネームを変更しました / Nickname updated");
      } catch (e) { showError("nickname", e); }
    });

    /* ---------- 環境スライダー ---------- */
    const onSliderInput = () => {
      try { readDraftFromSliders(); refreshEnvUI(); }
      catch (e) { showError("sliderInput", e); }
    };
    elTempSlider.addEventListener("input",  onSliderInput);
    elHumSlider.addEventListener("input",   onSliderInput);

    /* ---------- 光量ボタン ---------- */
    [[elLightBtn0, 0], [elLightBtn50, 50], [elLightBtn100, 100]].forEach(([btn, val]) => {
      btn.addEventListener("click", () => {
        setLightDraft(val);
        refreshEnvUI();
      });
    });

    /* ---------- 無属性に戻す（Env） ---------- */
    elNeutralBtn.addEventListener("click", () => {
      resetEnvToNeutral(false);
      toast("ドラフトを無属性に戻しました / Draft reset to Neutral");
    });

    /* ---------- 環境決定 ---------- */
    elApplyEnvBtn.addEventListener("click", async () => {
      try { await applyEnvironment(); }
      catch (e) {
        lockUI(false);
        hideAdventure();
        showError("applyEnv", e);
      }
    });
  }

  /* =========================================================
     Boot
     ========================================================= */
  let _booted = false;

  function boot() {
    if (_booted) return;
    _booted = true;

    try {
      /* 依存チェック */
      if (!window.TSP_STATE) throw new Error("TSP_STATE が見つかりません（state.js未読込）");
      if (!window.TSP_GAME)  throw new Error("TSP_GAME が見つかりません（game.js未読込）");
      if (!window.TSP_AREA)  throw new Error("TSP_AREA が見つかりません（areaResolver.js未読込）");

      /* DOM 参照取得 */
      elStartView    = must("startView");
      elMainView     = must("mainView");
      elHeaderLine1  = must("headerLine1");
      elHeaderLine2  = must("headerLine2");
      elHeaderLine3  = must("headerLine3");
      elSagaInput    = must("sagaInput");
      elSoulTextInput = must("soulTextInput");
      elNewSoulBtn    = must("newSoulBtn");
      elTextRebornBtn = must("textRebornBtn");
      elComebackBtn   = must("comebackBtn");

      elTabBtns = qsa(".tab-btn");
      elTabEls  = {
        home:        must("tab-home"),
        environment: must("tab-environment"),
        legendz:     must("tab-legendz"),
        crystal:     must("tab-crystal")
      };

      elScene          = must("scene");
      elEnvAttrLabel   = must("envAttributeLabel");
      elGrowthTimer    = must("growthTimer");
      elGrowthPreview  = must("growthPreview");
      elHpAlert        = $("hpAlert");
      elHomeNeutralBtn = $("homeNeutralBtn");

      elSpriteMover    = must("spriteMover");
      elSpriteViewport = must("spriteViewport");
      elSpriteSheet    = must("spriteSheetLayer");
      elSpriteFx       = must("spriteFxLayer");

      elTempSlider  = must("tempSlider");
      elHumSlider   = must("humiditySlider");
      elTempVal     = must("tempValue");
      elHumVal      = must("humidityValue");
      elLightVal    = must("lightValue");
      elLightLabel  = must("lightLabel");
      elLightBtn0   = must("lightBtn0");
      elLightBtn50  = must("lightBtn50");
      elLightBtn100 = must("lightBtn100");
      elLightGuide  = must("lightGuide");
      elEnvPreview  = must("envPreviewLabel");
      elNeutralBtn  = must("neutralBtn");
      elApplyEnvBtn = must("applyEnvBtn");

      elSpeciesName   = must("speciesName");
      elLegAttr       = must("legendzAttribute");
      elNickInput     = must("nicknameInput");
      elNickApplyBtn  = must("nicknameApplyBtn");
      elHpStat        = must("hpStat");
      elMagicStat     = must("magicStat");
      elCounterStat   = must("counterStat");
      elAttackStat    = must("attackStat");
      elRecoverStat   = must("recoverStat");
      elGrowHpProg    = must("growHPProgress");
      elGrowHpBar     = must("growHPBar");
      elSkillSlots    = must("skillSlots");
      elCrystalList   = must("crystalList");

      /* スライダー初期化 */
      initSliders();

      /* 環境初期化 */
      envDraft   = { temp: 0, hum: 50, light: 50 };
      envApplied = { ...envDraft };
      setSlidersFromDraft();
      setLightDraft(50);
      refreshEnvUI();

      /* スプライト初期化 */
      initSpriteSize();
      setFacing("left");
      renderFrame(1);
      applyMoveX(0);

      /* イベント登録 */
      bindEvents();

      /* LocalStorage からの自動復元 */
      const saved = loadGame();
      if (saved) {
        soul = saved;
        pipelineAfterReborn();
        toast("前回のデータを復元しました / Save loaded");
      } else {
        /* 起動時はスタート画面 */
        showView(elStartView);
        updateHeader();
      }

      /* ゲームループ開始 */
      requestAnimationFrame(rafLoop);

    } catch (e) {
      _booted = false;
      // bootエラーはページに直接表示（UIが使えない可能性があるため）
      document.body.innerHTML =
        `<div style="color:#ff4444;padding:20px;font-family:monospace;">
           <h2>起動エラー / Boot Error</h2>
           <pre>${e && e.message ? e.message : String(e)}</pre>
         </div>`;
      console.error("[boot]", e);
    }
  }

  /* ページロード後に起動 */
  window.addEventListener("load", boot, { once: true });

})();
