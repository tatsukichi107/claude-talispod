// FILE: js/game.js
/* =========================================================
   TalisPod  game.js  v0.79
   ゲームロジック全般
   - 環境属性取得
   - ランク判定（computeRank）
   - 成長プロファイル
   - 1分処理（applyOneMinute）
   - 1分プレビュー（computeMinutePreview）

   依存:
     window.TSP_AREAMAP（areaMap.js）
     window.TSP_AREA（areaResolver.js）
     window.TSP_STATE（state.js）

   公開: window.TSP_GAME
   ========================================================= */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     依存チェック
     --------------------------------------------------------- */
  const AM = window.TSP_AREAMAP;
  const AR = window.TSP_AREA;

  if (!AM || !AR) {
    console.error("[game] 依存ライブラリが不足しています", {
      TSP_AREAMAP: !!AM,
      TSP_AREA:    !!AR
    });
    window.TSP_GAME = window.TSP_GAME || {};
    return;
  }

  const AREAS   = AM.AREAS;
  const ATTR_UP = AM.ATTRIBUTES; // "VOLCANO" / "TORNADO" / "EARTHQUAKE" / "STORM"

  /* ---------------------------------------------------------
     スライダーステップ値
     --------------------------------------------------------- */
  const TEMP_STEPS = [
    -273,
    -45, -40, -35,
    -30, -25, -20, -15, -10, -5,
    0,
    5, 10, 15, 20, 25, 30, 35, 40, 45,
    999
  ];

  const HUM_STEPS = [
    0, 5, 10, 15, 20, 25, 30, 35, 40, 45,
    50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 99, 100
  ];

  /* ---------------------------------------------------------
     属性キー（小文字・内部統一）
     --------------------------------------------------------- */
  const Attr = Object.freeze({
    neutral:    "neutral",
    volcano:    "volcano",
    tornado:    "tornado",
    earthquake: "earthquake",
    storm:      "storm",
    // レジェンズ専用属性（バトル相性用。環境属性としては存在しない）
    spiritual:  "spiritual",
    necrom:     "necrom"
  });

  /** AREAMAP の大文字属性 → 小文字キー変換 */
  function areaAttrToKey(upper) {
    switch (upper) {
      case ATTR_UP.VOLCANO:    return Attr.volcano;
      case ATTR_UP.TORNADO:    return Attr.tornado;
      case ATTR_UP.EARTHQUAKE: return Attr.earthquake;
      case ATTR_UP.STORM:      return Attr.storm;
      default:                 return Attr.neutral;
    }
  }

  /* ---------------------------------------------------------
     属性メタ
     key: soul.growStats / elemCounter のキー名
     --------------------------------------------------------- */
  const ATTR_META = Object.freeze({
    [Attr.volcano]:    { jp: "ヴォルケーノ", en: "Volcano",    statKey: "magic"   },
    [Attr.tornado]:    { jp: "トルネード",   en: "Tornado",    statKey: "counter" },
    [Attr.earthquake]: { jp: "アースクエイク", en: "Earthquake", statKey: "attack"  },
    [Attr.storm]:      { jp: "ストーム",     en: "Storm",      statKey: "recover" },
    [Attr.neutral]:    { jp: "無属性",       en: "Neutral",    statKey: null      },
    [Attr.spiritual]:  { jp: "スピリチュアル", en: "Spiritual",  statKey: null      },
    [Attr.necrom]:     { jp: "ネクロム",     en: "Necrom",     statKey: null      }
  });

  /* ---------------------------------------------------------
     ランク定数
     --------------------------------------------------------- */
  const Rank = Object.freeze({
    neutral:   "neutral",
    superbest: "superbest",
    best:      "best",
    good:      "good",
    normal:    "normal",
    bad:       "bad"
  });

  /* ---------------------------------------------------------
     光量：時刻による期待値
     6:00〜9:59   → 50
     10:00〜15:59 → 100
     上記以外      → 0
     --------------------------------------------------------- */
  function expectedLightByTime(dateObj) {
    const h = dateObj.getHours();
    if (h >= 6  && h <= 9)  return 50;
    if (h >= 10 && h <= 15) return 100;
    return 0;
  }

  /* ---------------------------------------------------------
     逆属性（環境属性 vs レジェンズ属性）
     spiritual / necrom は環境属性として存在しないので null
     --------------------------------------------------------- */
  function oppositeEnvAttr(legendzAttr) {
    switch (legendzAttr) {
      case Attr.volcano:    return Attr.storm;
      case Attr.storm:      return Attr.volcano;
      case Attr.tornado:    return Attr.earthquake;
      case Attr.earthquake: return Attr.tornado;
      default:              return null;
    }
  }

  /* ---------------------------------------------------------
     属性相性ランク
     - spiritual / necrom レジェンズ → 全環境属性で good
     - neutral 環境                  → neutral（成長なし）
     - 同属性環境                    → good
     - 逆属性環境                    → bad
     - それ以外                      → normal
     --------------------------------------------------------- */
  function relationRank(legendzAttr, envAttrKey) {
    // neutral 環境は常に neutral
    if (!envAttrKey || envAttrKey === Attr.neutral) return Rank.neutral;

    // spiritual / necrom は全環境で good（逆属性はバトルのみで使用）
    if (legendzAttr === Attr.spiritual || legendzAttr === Attr.necrom) {
      return Rank.good;
    }

    // neutral レジェンズ（属性未設定）→ normal
    if (!legendzAttr || legendzAttr === Attr.neutral) return Rank.normal;

    // 同属性
    if (envAttrKey === legendzAttr) return Rank.good;

    // 逆属性
    const opp = oppositeEnvAttr(legendzAttr);
    if (opp && envAttrKey === opp) return Rank.bad;

    // それ以外（隣接属性）
    return Rank.normal;
  }

  /* ---------------------------------------------------------
     superBest 判定
     mon.superBest = { temp, hum, waterDepth }
     --------------------------------------------------------- */
  function isSuperBest(mon, env) {
    if (!mon || !mon.superBest) return false;
    const sb = mon.superBest;

    const tOk = Number(env.temp) === Number(sb.temp);
    const hOk = Number(env.hum)  === Number(sb.hum);
    if (!tOk || !hOk) return false;

    // 水中の場合は水深も一致確認
    if (Number(env.hum) === 100) {
      return Number(env.light) === Number(sb.waterDepth);
    }
    return true;
  }

  /* ---------------------------------------------------------
     best 判定
     mon.bestAreaId が指定されていればそのIDと一致確認
     未指定の場合は superBest のエリアIDをフォールバック
     --------------------------------------------------------- */
  function isBest(mon, areaId) {
    if (!mon) return false;

    if (mon.bestAreaId) {
      return String(areaId) === String(mon.bestAreaId);
    }

    // fallback: superBest 条件のエリアID を best として扱う
    if (mon.superBest) {
      const sb = mon.superBest;
      const l  = (Number(sb.hum) === 100) ? Number(sb.waterDepth) : 50;
      const fallbackId = AR.resolveAreaId(sb.temp, sb.hum, l);
      if (fallbackId && fallbackId !== "NEUTRAL") {
        return String(areaId) === String(fallbackId);
      }
    }
    return false;
  }

  /* ---------------------------------------------------------
     envAttribute
     温度・湿度・光量 → 環境属性キー（小文字）
     --------------------------------------------------------- */
  function envAttribute(temp, hum, lightOrDepth) {
    const areaId = AR.resolveAreaId(temp, hum, lightOrDepth);
    if (areaId === "NEUTRAL") return Attr.neutral;
    const area = AREAS[areaId];
    if (!area) return Attr.neutral;
    return areaAttrToKey(area.attribute);
  }

  /* ---------------------------------------------------------
     computeRank
     戻り値:
     {
       rank,
       areaId,
       envAttr,      // "volcano" etc
       areaName,     // "火山" etc（NEUTRAL は null）
       areaNameEn,   // "Volcano" etc
       isSea,
       lightExpected,// 陸上の期待光量（水中は null）
       lightOk       // 光量一致フラグ
     }
     --------------------------------------------------------- */
  function computeRank(mon, envApplied, now, legendzAttr) {
    const temp  = Number(envApplied.temp);
    const hum   = Number(envApplied.hum);
    const light = Number(envApplied.light);

    const areaId = AR.resolveAreaId(temp, hum, light);

    /* 1) 無属性（最優先） */
    if (areaId === "NEUTRAL") {
      return {
        rank:          Rank.neutral,
        areaId:        "NEUTRAL",
        envAttr:       Attr.neutral,
        areaName:      null,
        areaNameEn:    null,
        isSea:         false,
        lightExpected: expectedLightByTime(now),
        lightOk:       true
      };
    }

    const area       = AREAS[areaId] || null;
    const envAttrKey = area ? areaAttrToKey(area.attribute) : Attr.neutral;
    const seaFlag    = AR.isSeaAreaId(areaId);

    /* 2) 水中（湿度100）：光量足切りなし */
    if (seaFlag) {
      let rank;
      if (isSuperBest(mon, { temp, hum, light })) {
        rank = Rank.superbest;
      } else if (isBest(mon, areaId)) {
        rank = Rank.best;
      } else {
        rank = relationRank(legendzAttr, envAttrKey);
      }
      return {
        rank,
        areaId,
        envAttr:       envAttrKey,
        areaName:      area ? area.name   : null,
        areaNameEn:    area ? area.nameEn : null,
        isSea:         true,
        lightExpected: null,
        lightOk:       true
      };
    }

    /* 3) 陸上：光量足切り（最優先） */
    const lightExpected = expectedLightByTime(now);
    const lightOk       = (light === lightExpected);

    if (!lightOk) {
      return {
        rank:          Rank.bad,
        areaId,
        envAttr:       envAttrKey,
        areaName:      area ? area.name   : null,
        areaNameEn:    area ? area.nameEn : null,
        isSea:         false,
        lightExpected,
        lightOk:       false
      };
    }

    /* 4) superbest / best（光量OKのときのみ） */
    let rank;
    if (isSuperBest(mon, { temp, hum, light })) {
      rank = Rank.superbest;
    } else if (isBest(mon, areaId)) {
      rank = Rank.best;
    } else {
      rank = relationRank(legendzAttr, envAttrKey);
    }

    return {
      rank,
      areaId,
      envAttr:       envAttrKey,
      areaName:      area ? area.name   : null,
      areaNameEn:    area ? area.nameEn : null,
      isSea:         false,
      lightExpected,
      lightOk:       true
    };
  }

  /* ---------------------------------------------------------
     成長プロファイル
     --------------------------------------------------------- */
  function growthProfile(rank) {
    switch (rank) {
      case Rank.superbest:
        return { hpGrow: 50, statGrow: 20, statInterval: 1, healCap: 500, hpDmg: 0 };
      case Rank.best:
        return { hpGrow: 30, statGrow: 10, statInterval: 1, healCap: 300, hpDmg: 0 };
      case Rank.good:
        return { hpGrow: 20, statGrow: 10, statInterval: 2, healCap: 200, hpDmg: 0 };
      case Rank.normal:
        return { hpGrow: 10, statGrow: 10, statInterval: 3, healCap: 100, hpDmg: 0 };
      case Rank.bad:
        return { hpGrow: 10, statGrow: 10, statInterval: 5, healCap:   0, hpDmg: 10 };
      default: // neutral
        return { hpGrow:  0, statGrow:  0, statInterval: 0, healCap:   0, hpDmg:  0 };
    }
  }

  /* ---------------------------------------------------------
     ユーティリティ
     --------------------------------------------------------- */
  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function maxHP(soul) {
    return Number(soul.baseHP || 0) + Number(soul.growHP || 0);
  }

  /** 育成上限（LegendzData移行前は TSP_STATE.DEFAULT_LEGENDZ を参照） */
  function getMaxGrow(soul) {
    // v0.8以降: TSP_LEGENDZ_DATA[soul.speciesId].maxGrowHP / maxGrowStats
    const def = (window.TSP_STATE && window.TSP_STATE.DEFAULT_LEGENDZ)
      ? window.TSP_STATE.DEFAULT_LEGENDZ
      : { maxGrowHP: 5110, maxGrowStats: { magic:630, counter:630, attack:630, recover:630 } };
    return { maxGrowHP: def.maxGrowHP, maxGrowStats: def.maxGrowStats };
  }

  /** 環境属性キー → soul.growStats のキー名 */
  function envAttrToStatKey(envAttrKey) {
    const meta = ATTR_META[envAttrKey];
    return meta ? meta.statKey : null;
  }

  /* ---------------------------------------------------------
     1分処理プレビュー（UI表示用・副作用なし）
     --------------------------------------------------------- */
  function computeMinutePreview(soul, mon, envApplied, now, elemCounter) {
    const info = computeRank(mon, envApplied, now, soul.attribute);
    if (info.rank === Rank.neutral) {
      return { rank: Rank.neutral, heal: 0, hpDmg: 0, hpGrow: 0, statKey: null, statGrow: 0 };
    }

    const prof    = growthProfile(info.rank);
    const mx      = maxHP(soul);
    const cur     = Number(soul.currentHP != null ? soul.currentHP : mx);
    const missing = Math.max(0, mx - cur);
    const { maxGrowHP, maxGrowStats } = getMaxGrow(soul);

    // 回復
    const heal = (prof.healCap > 0) ? Math.min(prof.healCap, missing) : 0;

    // HP成長
    const hpGrow = (Number(soul.growHP || 0) >= maxGrowHP) ? 0 : prof.hpGrow;

    // 属性成長
    const statKey = envAttrToStatKey(info.envAttr);
    let statGrow = 0;
    if (statKey && prof.statInterval > 0) {
      const cnt = Number((elemCounter && elemCounter[statKey]) || 0) + 1;
      if (cnt >= prof.statInterval) {
        const curStat = Number(soul.growStats[statKey] || 0);
        const maxStat = maxGrowStats[statKey] || 630;
        statGrow = (curStat < maxStat) ? prof.statGrow : 0;
      }
    }

    // ダメージ
    const hpDmg = (info.rank === Rank.bad) ? prof.hpDmg : 0;

    return { rank: info.rank, heal, hpDmg, hpGrow, statKey, statGrow };
  }

  /* ---------------------------------------------------------
     1分処理（副作用あり・soul を直接更新）
     --------------------------------------------------------- */
  function applyOneMinute(soul, mon, envApplied, now, elemCounter) {
    // growStats 初期化ガード
    soul.growStats = soul.growStats || { magic: 0, counter: 0, attack: 0, recover: 0 };
    if (typeof soul.growHP !== "number") soul.growHP = 0;

    const info = computeRank(mon, envApplied, now, soul.attribute);
    if (info.rank === Rank.neutral) return;

    const prof = growthProfile(info.rank);
    const { maxGrowHP, maxGrowStats } = getMaxGrow(soul);

    /* 1) 回復 */
    if (prof.healCap > 0) {
      const mx      = maxHP(soul);
      const cur     = Number(soul.currentHP != null ? soul.currentHP : mx);
      const missing = Math.max(0, mx - cur);
      const heal    = Math.min(prof.healCap, missing);
      if (heal > 0) soul.currentHP = cur + heal;
    }

    /* 2) HP成長 */
    if (prof.hpGrow > 0) {
      const before = Number(soul.growHP || 0);
      if (before < maxGrowHP) {
        const add      = Math.min(prof.hpGrow, maxGrowHP - before);
        soul.growHP    = before + add;
        // currentHP も同量増やす（最大HP が増えた分）
        const cur = Number(soul.currentHP != null ? soul.currentHP : maxHP(soul));
        soul.currentHP = cur + add;
      }
    }

    /* 3) 属性成長 */
    const statKey = envAttrToStatKey(info.envAttr);
    if (statKey && prof.statInterval > 0) {
      elemCounter       = elemCounter || {};
      elemCounter[statKey] = Number(elemCounter[statKey] || 0) + 1;

      if (elemCounter[statKey] >= prof.statInterval) {
        elemCounter[statKey] = 0;
        const before  = Number(soul.growStats[statKey] || 0);
        const maxStat = maxGrowStats[statKey] || 630;
        if (before < maxStat) {
          const add             = Math.min(prof.statGrow, maxStat - before);
          soul.growStats[statKey] = before + add;
        }
      }
    }

    /* 4) HP ダメージ（bad のみ） */
    if (info.rank === Rank.bad && prof.hpDmg > 0) {
      const mx  = maxHP(soul);
      const cur = Number(soul.currentHP != null ? soul.currentHP : mx);
      soul.currentHP = clamp(cur - prof.hpDmg, 0, mx);
    }

    /* 5) 最終クランプ */
    const mxFinal  = maxHP(soul);
    soul.currentHP = clamp(
      Number(soul.currentHP != null ? soul.currentHP : mxFinal),
      0, mxFinal
    );

    soul.updatedAt = Date.now();
  }

  /* ---------------------------------------------------------
     ランク表示ラベル（日英）
     --------------------------------------------------------- */
  function rankLabel(rank) {
    switch (rank) {
      case Rank.superbest: return "超ベスト / Super Best";
      case Rank.best:      return "ベスト / Best";
      case Rank.good:      return "良好 / Good";
      case Rank.normal:    return "普通 / Normal";
      case Rank.bad:       return "最悪 / Bad";
      default:             return "無属性 / Neutral";
    }
  }

  /* ---------------------------------------------------------
     公開
     --------------------------------------------------------- */
  window.TSP_GAME = {
    Rank,
    Attr,
    TEMP_STEPS,
    HUM_STEPS,
    ATTR_META,

    expectedLightByTime,
    envAttribute,
    computeRank,
    rankLabel,

    maxHP,
    computeMinutePreview,
    applyOneMinute
  };

})();
