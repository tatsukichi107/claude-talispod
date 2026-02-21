// FILE: js/areaMap.js
/* =========================================================
   TalisPod  areaMap.js  v0.79
   エリアマスタ定義（ID / 名称 / 属性 / 種別）
   - import/export 不使用（file://動作保証）
   - 全オブジェクトはObject.freezeで不変化

   ID体系：
     火 = V（Volcano）  風 = T（Tornado）
     土 = E（Earthquake）水 = S（Storm）
     水中南海 = SS_*    水中北海 = SN_*

   公開: window.TSP_AREAMAP
   ========================================================= */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     属性定数（大文字。game.jsで小文字に正規化して使用）
     --------------------------------------------------------- */
  const ATTRIBUTES = Object.freeze({
    VOLCANO:    "VOLCANO",
    TORNADO:    "TORNADO",
    EARTHQUAKE: "EARTHQUAKE",
    STORM:      "STORM"
  });

  /* ---------------------------------------------------------
     エリアマスタ
     --------------------------------------------------------- */
  const AREAS = Object.freeze({

    /* ===== 火（VOLCANO）===== */
    V1: Object.freeze({ id: "V1", name: "火山",     nameEn: "Volcano",        attribute: "VOLCANO",    type: "land" }),
    V2: Object.freeze({ id: "V2", name: "砂漠",     nameEn: "Desert",         attribute: "VOLCANO",    type: "land" }),
    V3: Object.freeze({ id: "V3", name: "乾燥帯",   nameEn: "Arid Zone",      attribute: "VOLCANO",    type: "land" }),
    V4: Object.freeze({ id: "V4", name: "広葉樹林", nameEn: "Broad Forest",   attribute: "VOLCANO",    type: "land" }),

    /* ===== 風（TORNADO）===== */
    T1: Object.freeze({ id: "T1", name: "成層圏",   nameEn: "Stratosphere",   attribute: "TORNADO",    type: "land" }),
    T2: Object.freeze({ id: "T2", name: "山岳地帯", nameEn: "Mountains",      attribute: "TORNADO",    type: "land" }),
    T3: Object.freeze({ id: "T3", name: "高原",     nameEn: "Highland",       attribute: "TORNADO",    type: "land" }),
    T4: Object.freeze({ id: "T4", name: "針葉樹林", nameEn: "Conifer Forest", attribute: "TORNADO",    type: "land" }),

    /* ===== 土（EARTHQUAKE）===== */
    E1: Object.freeze({ id: "E1", name: "地底",     nameEn: "Underground",    attribute: "EARTHQUAKE", type: "land" }),
    E2: Object.freeze({ id: "E2", name: "熱帯雨林", nameEn: "Rainforest",     attribute: "EARTHQUAKE", type: "land" }),
    E3: Object.freeze({ id: "E3", name: "熱帯",     nameEn: "Tropics",        attribute: "EARTHQUAKE", type: "land" }),
    E4: Object.freeze({ id: "E4", name: "温帯草原", nameEn: "Temperate",      attribute: "EARTHQUAKE", type: "land" }),

    /* ===== 水（STORM）陸上 ===== */
    S1: Object.freeze({ id: "S1", name: "絶対零度", nameEn: "Absolute Zero",  attribute: "STORM",      type: "land" }),
    S2: Object.freeze({ id: "S2", name: "極寒地帯", nameEn: "Polar Zone",     attribute: "STORM",      type: "land" }),
    S3: Object.freeze({ id: "S3", name: "寒帯",     nameEn: "Tundra",         attribute: "STORM",      type: "land" }),
    S4: Object.freeze({ id: "S4", name: "寒帯草原", nameEn: "Cold Steppe",    attribute: "STORM",      type: "land" }),

    /* ===== 水（STORM）水中・南海 ===== */
    SS_SHALLOW: Object.freeze({ id: "SS_SHALLOW", name: "南海浅瀬", nameEn: "South Shallows", attribute: "STORM", type: "sea", side: "south", depth: 0   }),
    SS_MID:     Object.freeze({ id: "SS_MID",     name: "南海水中", nameEn: "South Mid Sea",  attribute: "STORM", type: "sea", side: "south", depth: 50  }),
    SS_DEEP:    Object.freeze({ id: "SS_DEEP",    name: "南海深海", nameEn: "South Deep Sea", attribute: "STORM", type: "sea", side: "south", depth: 100 }),

    /* ===== 水（STORM）水中・北海 ===== */
    SN_SHALLOW: Object.freeze({ id: "SN_SHALLOW", name: "北海浅瀬", nameEn: "North Shallows", attribute: "STORM", type: "sea", side: "north", depth: 0   }),
    SN_MID:     Object.freeze({ id: "SN_MID",     name: "北海水中", nameEn: "North Mid Sea",  attribute: "STORM", type: "sea", side: "north", depth: 50  }),
    SN_DEEP:    Object.freeze({ id: "SN_DEEP",    name: "北海深海", nameEn: "North Deep Sea", attribute: "STORM", type: "sea", side: "north", depth: 100 })
  });

  /* ---------------------------------------------------------
     helpers
     --------------------------------------------------------- */
  function getAreaById(id) {
    return AREAS[id] || null;
  }

  function getAreaName(id) {
    const a = AREAS[id];
    return a ? a.name : null;
  }

  function getAreaNameEn(id) {
    const a = AREAS[id];
    return a ? a.nameEn : null;
  }

  function getAreaAttribute(id) {
    const a = AREAS[id];
    return a ? a.attribute : null;
  }

  function isSea(id) {
    const a = AREAS[id];
    return !!a && a.type === "sea";
  }

  function isLand(id) {
    const a = AREAS[id];
    return !!a && a.type === "land";
  }

  /* ---------------------------------------------------------
     公開
     --------------------------------------------------------- */
  window.TSP_AREAMAP = {
    ATTRIBUTES,
    AREAS,
    getAreaById,
    getAreaName,
    getAreaNameEn,
    getAreaAttribute,
    isSea,
    isLand
  };

})();
