// FILE: js/areaResolver.js
/* =========================================================
   TalisPod  areaResolver.js  v0.79
   温度・湿度・光量（水深）→ エリアID を決定する

   ルール：
   1. 温度=0 AND 湿度=50           → "NEUTRAL"（最優先）
   2. 湿度=100                     → 水中（南海 / 北海）
   3. 上記以外                     → LAND_MAPから陸上エリアID
   4. マッチなし                   → "NEUTRAL"

   依存: window.TSP_AREAMAP（areaMap.js より後に読み込む）
   公開: window.TSP_AREA
   ========================================================= */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     依存チェック
     --------------------------------------------------------- */
  const AM = window.TSP_AREAMAP;
  if (!AM || !AM.AREAS) {
    console.error("[areaResolver] TSP_AREAMAP が見つかりません。areaMap.js を先に読み込んでください。");
    window.TSP_AREA = {
      resolveAreaId:  () => "NEUTRAL",
      isSeaAreaId:    () => false,
      isLandAreaId:   () => false
    };
    return;
  }

  const AREAS = AM.AREAS;

  /* ---------------------------------------------------------
     温度帯（行キー）
     --------------------------------------------------------- */
  const TEMP_BANDS = [
    { key: "999",     match: (t) => t === 999 },
    { key: "40-45",   match: (t) => t >= 40 && t <= 45 },
    { key: "35",      match: (t) => t === 35 },
    { key: "5-30",    match: (t) => t >= 5  && t <= 30 },
    { key: "0",       match: (t) => t === 0 },
    { key: "-5--30",  match: (t) => t <= -5  && t >= -30 },
    { key: "-35",     match: (t) => t === -35 },
    { key: "-40--45", match: (t) => t <= -40 && t >= -45 },
    { key: "-273",    match: (t) => t === -273 }
  ];

  /* ---------------------------------------------------------
     湿度帯（列キー）
     --------------------------------------------------------- */
  const HUM_BANDS = [
    { key: "0",      match: (h) => h === 0 },
    { key: "5-10",   match: (h) => h >= 5  && h <= 10 },
    { key: "15-20",  match: (h) => h >= 15 && h <= 20 },
    { key: "25-45",  match: (h) => h >= 25 && h <= 45 },
    { key: "50",     match: (h) => h === 50 },
    { key: "55-75",  match: (h) => h >= 55 && h <= 75 },
    { key: "80-85",  match: (h) => h >= 80 && h <= 85 },
    { key: "90-95",  match: (h) => h >= 90 && h <= 95 },
    { key: "99",     match: (h) => h === 99 }
  ];

  /* ---------------------------------------------------------
     陸上マップ（LAND_MAP）
     行 = 温度帯キー / 列 = 湿度帯キー
     "NEUTRAL" セルは無属性扱い（温度0・湿度50 の交点のみ）
     --------------------------------------------------------- */
  const LAND_MAP = {
    "999":     { "0":"V1",  "5-10":"V2",  "15-20":"V3",  "25-45":"V3",  "50":"V3",      "55-75":"E3",  "80-85":"E3",  "90-95":"E2",  "99":"E1"  },
    "40-45":   { "0":"V2",  "5-10":"V2",  "15-20":"V3",  "25-45":"V3",  "50":"V3",      "55-75":"E3",  "80-85":"E3",  "90-95":"E2",  "99":"E2"  },
    "35":      { "0":"V3",  "5-10":"V3",  "15-20":"V3",  "25-45":"V3",  "50":"V3",      "55-75":"E3",  "80-85":"E3",  "90-95":"E3",  "99":"E3"  },
    "5-30":    { "0":"V3",  "5-10":"V3",  "15-20":"V3",  "25-45":"V4",  "50":"V4",      "55-75":"E4",  "80-85":"E4",  "90-95":"E3",  "99":"E3"  },
    "0":       { "0":"T3",  "5-10":"T3",  "15-20":"T3",  "25-45":"T4",  "50":"NEUTRAL", "55-75":"E4",  "80-85":"E4",  "90-95":"E3",  "99":"E3"  },
    "-5--30":  { "0":"T3",  "5-10":"T3",  "15-20":"T3",  "25-45":"T4",  "50":"S4",      "55-75":"S4",  "80-85":"S3",  "90-95":"S3",  "99":"S3"  },
    "-35":     { "0":"T3",  "5-10":"T3",  "15-20":"T3",  "25-45":"T4",  "50":"S4",      "55-75":"S4",  "80-85":"S3",  "90-95":"S3",  "99":"S3"  },
    "-40--45": { "0":"T2",  "5-10":"T2",  "15-20":"T3",  "25-45":"T3",  "50":"S3",      "55-75":"S3",  "80-85":"S3",  "90-95":"S2",  "99":"S2"  },
    "-273":    { "0":"T1",  "5-10":"T2",  "15-20":"T3",  "25-45":"T3",  "50":"S3",      "55-75":"S3",  "80-85":"S3",  "90-95":"S2",  "99":"S1"  }
  };

  /* ---------------------------------------------------------
     水中マップ（湿度=100）
     side: temp>=0 → south / temp<0 → north
     depth: 0→浅瀬 / 50→水中 / 100→深海
     --------------------------------------------------------- */
  const SEA_MAP = Object.freeze({
    south: Object.freeze({ 0: "SS_SHALLOW", 50: "SS_MID", 100: "SS_DEEP" }),
    north: Object.freeze({ 0: "SN_SHALLOW", 50: "SN_MID", 100: "SN_DEEP" })
  });

  /* ---------------------------------------------------------
     helpers
     --------------------------------------------------------- */
  function pickTempBandKey(t) {
    for (const b of TEMP_BANDS) if (b.match(t)) return b.key;
    return null;
  }

  function pickHumBandKey(h) {
    for (const b of HUM_BANDS) if (b.match(h)) return b.key;
    return null;
  }

  /** 水深値を 0 / 50 / 100 に正規化 */
  function normalizeDepth(v) {
    const n = Number(v);
    if (n <= 25)  return 0;
    if (n <= 75)  return 50;
    return 100;
  }

  function isSeaAreaId(areaId) {
    const s = String(areaId || "");
    return s.startsWith("SS_") || s.startsWith("SN_");
  }

  function isLandAreaId(areaId) {
    if (!areaId || areaId === "NEUTRAL") return false;
    return !isSeaAreaId(areaId);
  }

  /* ---------------------------------------------------------
     resolveAreaId（公開メイン関数）
     --------------------------------------------------------- */
  function resolveAreaId(temp, hum, lightOrDepth) {
    const t = Number(temp);
    const h = Number(hum);
    const l = Number(lightOrDepth);

    // 1) 無属性：最優先
    if (t === 0 && h === 50) return "NEUTRAL";

    // 2) 水中：湿度100のみ
    if (h === 100) {
      const side  = (t >= 0) ? "south" : "north";
      const depth = normalizeDepth(l);
      return SEA_MAP[side][depth] || (side === "south" ? "SS_MID" : "SN_MID");
    }

    // 3) 陸上：LAND_MAPから引く
    const tKey = pickTempBandKey(t);
    const hKey = pickHumBandKey(h);

    if (!tKey || !hKey) return "NEUTRAL";

    const row    = LAND_MAP[tKey];
    const areaId = row ? row[hKey] : null;

    if (!areaId || areaId === "NEUTRAL") return "NEUTRAL";

    // 定義漏れガード
    if (!AREAS[areaId]) {
      console.warn("[resolveAreaId] 未定義のエリアID:", areaId, { t, h, l, tKey, hKey });
      return "NEUTRAL";
    }

    return areaId;
  }

  /* ---------------------------------------------------------
     公開
     --------------------------------------------------------- */
  window.TSP_AREA = {
    resolveAreaId,
    isSeaAreaId,
    isLandAreaId
  };

})();
