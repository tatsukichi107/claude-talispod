// FILE: js/state.js
/* =========================================================
   TalisPod  state.js  v0.79
   - Soulデータ生成・正規化
   - ソウルドールコード生成 / 解析（SOUL1: Base64URL）
   - サーガ名認証
   公開: window.TSP_STATE
   ========================================================= */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     定数
     --------------------------------------------------------- */
  const CODE_PREFIX  = "SOUL1:";
  const CODE_VERSION = 1;
  const SPECIES_ID   = "windragon";

  /* ---------------------------------------------------------
     デフォルト種族定義（LegendzData移行前の暫定定義）
     v0.8で TSP_LEGENDZ_DATA["windragon"] に移行する
     --------------------------------------------------------- */
  const DEFAULT_LEGENDZ = Object.freeze({
    speciesId:   SPECIES_ID,
    speciesName: "ウインドラゴン",
    attribute:   "tornado",
    baseHP:      400,
    baseStats:   Object.freeze({ magic: 60, counter: 100, attack: 60, recover: 20 }),
    maxGrowHP:   5110,
    maxGrowStats: Object.freeze({ magic: 630, counter: 630, attack: 630, recover: 630 }),
    defaultMoves: Object.freeze([
      null, null, null, null, null,
      null, null, null, null, null,
      null, null, null, null, null
    ])
  });

  /* ---------------------------------------------------------
     UTF-8 / Base64URL helpers
     --------------------------------------------------------- */
  function utf8ToBytes(str) {
    return new TextEncoder().encode(str);
  }

  function bytesToUtf8(bytes) {
    return new TextDecoder().decode(bytes);
  }

  function b64Encode(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function b64Decode(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function b64UrlEncode(bytes) {
    return b64Encode(bytes)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  function b64UrlDecode(b64url) {
    let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return b64Decode(b64);
  }

  /* ---------------------------------------------------------
     汎用ユーティリティ
     --------------------------------------------------------- */
  function clampInt(n, min, max) {
    n = Number(n);
    if (!Number.isFinite(n)) n = min;
    n = Math.floor(n);
    return n < min ? min : n > max ? max : n;
  }

  function safeStr(v, fallback) {
    const s = String(v ?? "").trim();
    return s.length > 0 ? s : (fallback ?? "");
  }

  /* ---------------------------------------------------------
     新規 Soul 生成（windragon固定）
     --------------------------------------------------------- */
  function makeNewSoul(sagaName) {
    const saga = safeStr(sagaName);
    if (!saga) throw new Error("サーガ名が空です");

    return {
      version:     CODE_VERSION,

      // identity
      sagaName:    saga,
      speciesId:   DEFAULT_LEGENDZ.speciesId,
      speciesName: DEFAULT_LEGENDZ.speciesName,
      attribute:   DEFAULT_LEGENDZ.attribute,
      nickname:    "",

      // base stats（LegendzDataから取得・固定値）
      baseHP:    DEFAULT_LEGENDZ.baseHP,
      baseStats: { ...DEFAULT_LEGENDZ.baseStats },

      // grow stats（育成で増加）
      growHP:    0,
      growStats: { magic: 0, counter: 0, attack: 0, recover: 0 },

      // current
      currentHP: DEFAULT_LEGENDZ.baseHP,

      // inventory（クリスタルID辞書形式）
      crystals: {},

      // moves（15スロット。SkillData IDまたはnull）
      moves: DEFAULT_LEGENDZ.defaultMoves.slice(),

      // metadata
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /* ---------------------------------------------------------
     Soul 正規化（保存payload生成）
     --------------------------------------------------------- */
  function normalizeSoul(soul) {
    if (!soul || typeof soul !== "object") throw new Error("ソウルが不正です");

    const saga = safeStr(soul.sagaName);
    if (!saga) throw new Error("サーガ名が不正です");

    // growStats
    const gs = soul.growStats || {};
    const maxGs = DEFAULT_LEGENDZ.maxGrowStats;
    const normalizedGs = {
      magic:   clampInt(gs.magic   ?? 0, 0, maxGs.magic),
      counter: clampInt(gs.counter ?? 0, 0, maxGs.counter),
      attack:  clampInt(gs.attack  ?? 0, 0, maxGs.attack),
      recover: clampInt(gs.recover ?? 0, 0, maxGs.recover)
    };

    // growHP
    const growHP = clampInt(soul.growHP ?? 0, 0, DEFAULT_LEGENDZ.maxGrowHP);

    // currentHP
    const maxHP = DEFAULT_LEGENDZ.baseHP + growHP;
    const currentHP = clampInt(soul.currentHP ?? maxHP, 0, maxHP);

    // crystals（IDをキー・所持数を値のオブジェクト）
    const rawCr = soul.crystals;
    const crystals = {};
    if (rawCr && typeof rawCr === "object" && !Array.isArray(rawCr)) {
      for (const [id, cnt] of Object.entries(rawCr)) {
        const n = clampInt(cnt, 0, 999999);
        if (n > 0) crystals[String(id)] = n;
      }
    }

    // moves（15スロット・nullまたは文字列）
    const rawMv = Array.isArray(soul.moves) ? soul.moves : [];
    const moves = Array.from({ length: 15 }, (_, i) => {
      const v = rawMv[i];
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s.length > 0 ? s : null;
    });

    return {
      v:   CODE_VERSION,
      sp:  SPECIES_ID,
      s:   saga,
      nn:  safeStr(soul.nickname),
      chp: currentHP,
      ghp: growHP,
      gs:  normalizedGs,
      cr:  crystals,
      mv:  moves
    };
  }

  /* ---------------------------------------------------------
     payload → Soul オブジェクト復元
     --------------------------------------------------------- */
  function inflateSoul(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("記憶データが壊れています");
    }
    if (payload.v !== CODE_VERSION) {
      throw new Error(`記憶データのバージョンが不正です（v${payload.v}）`);
    }
    if (payload.sp !== SPECIES_ID) {
      throw new Error(`このソウルドールの種族（${payload.sp}）は未対応です`);
    }

    const saga = safeStr(payload.s);
    if (!saga) throw new Error("記憶データのサーガ名が不正です");

    const soul = makeNewSoul(saga);

    soul.nickname  = safeStr(payload.nn);
    soul.growHP    = clampInt(payload.ghp ?? 0, 0, DEFAULT_LEGENDZ.maxGrowHP);

    const gs = payload.gs || {};
    const maxGs = DEFAULT_LEGENDZ.maxGrowStats;
    soul.growStats = {
      magic:   clampInt(gs.magic   ?? 0, 0, maxGs.magic),
      counter: clampInt(gs.counter ?? 0, 0, maxGs.counter),
      attack:  clampInt(gs.attack  ?? 0, 0, maxGs.attack),
      recover: clampInt(gs.recover ?? 0, 0, maxGs.recover)
    };

    // currentHP
    const maxHP = soul.baseHP + soul.growHP;
    soul.currentHP = clampInt(payload.chp ?? maxHP, 0, maxHP);

    // crystals
    const rawCr = payload.cr;
    soul.crystals = {};
    if (rawCr && typeof rawCr === "object" && !Array.isArray(rawCr)) {
      for (const [id, cnt] of Object.entries(rawCr)) {
        const n = clampInt(cnt, 0, 999999);
        if (n > 0) soul.crystals[String(id)] = n;
      }
    }

    // moves
    const rawMv = Array.isArray(payload.mv) ? payload.mv : [];
    soul.moves = Array.from({ length: 15 }, (_, i) => {
      const v = rawMv[i];
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s.length > 0 ? s : null;
    });

    soul.updatedAt = Date.now();
    return soul;
  }

  /* ---------------------------------------------------------
     ソウルドールコード生成
     --------------------------------------------------------- */
  function makeSoulCode(soul) {
    const payload = normalizeSoul(soul);
    const json    = JSON.stringify(payload);
    const bytes   = utf8ToBytes(json);
    const b64u    = b64UrlEncode(bytes);
    return CODE_PREFIX + b64u;
  }

  /* ---------------------------------------------------------
     sanitize：コピペ時の事故を吸収
     --------------------------------------------------------- */
  function sanitizeSoulText(raw) {
    let s = String(raw ?? "");

    // 1) ゼロ幅文字・BOM除去
    s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");

    // 2) 全角コロン → 半角
    s = s.replace(/：/g, ":");

    // 3) 全体から SOUL\d*:xxxxx の形を正規表現で拾う（文章貼り付け対応）
    const m = s.match(/SOUL\d*:[A-Za-z0-9\-_]+/i);
    if (m) {
      s = m[0];
    }

    // 4) 空白・改行を除去（Base64URL部分の保護）
    s = s.replace(/\s+/g, "");

    // 5) プレフィックス除去（SOUL / SOUL1 / SOUL2... に対応）
    s = s.replace(/^SOUL\d*:/i, "");

    return s;
  }

  /* ---------------------------------------------------------
     ソウルドールコード解析
     --------------------------------------------------------- */
  function parseSoulCode(code) {
    const body = sanitizeSoulText(code);
    if (!body) throw new Error("ソウルドールコードが空です");

    let payload;
    try {
      const bytes = b64UrlDecode(body);
      const json  = bytesToUtf8(bytes);
      payload     = JSON.parse(json);
    } catch (e) {
      throw new Error("ソウルドールコードを読み込めませんでした（形式が違うか壊れています）");
    }

    return inflateSoul(payload);
  }

  /* ---------------------------------------------------------
     サーガ名認証
     --------------------------------------------------------- */
  function assertSagaMatch(parsedSoul, sagaInput) {
    const input = safeStr(sagaInput);
    if (!input) throw new Error("サーガ名が空です");

    const saved = safeStr(parsedSoul?.sagaName);
    if (!saved) throw new Error("記憶データのサーガ名が不正です");

    if (saved !== input) {
      throw new Error(
        `サーガ名が一致しません。\n記憶のサーガ名：${saved}\n入力したサーガ名：${input}`
      );
    }
  }

  /* ---------------------------------------------------------
     maxHP helper（game.js と同じロジック、単独でも使えるよう定義）
     --------------------------------------------------------- */
  function maxHP(soul) {
    return Number(soul.baseHP || 0) + Number(soul.growHP || 0);
  }

  /* ---------------------------------------------------------
     公開
     --------------------------------------------------------- */
  window.TSP_STATE = {
    DEFAULT_LEGENDZ,    // game.js / app.js から参照用
    makeNewSoul,
    makeSoulCode,
    parseSoulCode,
    assertSagaMatch,
    maxHP
  };

})();
