/*
 * Portal language switch (中文 / English).
 *
 * The portal source text is Chinese. In English mode this module rewrites
 * visible text nodes and a few attributes using the dictionary in
 * portal-i18n-en.js, and keeps rewriting as the pages re-render. In Chinese
 * mode it puts the original text back and translates the few English
 * leftovers listed in ZH below.
 *
 * Only presentation text changes. Form values, request payloads, ids and
 * anything marked translate="no" or data-i18n-skip stay as they are.
 */
(function (root) {
  "use strict";
  const STORAGE_KEY = "agv.portal.lang";
  const CJK = /[㐀-鿿（），：；、。]/;
  const HAN = /[㐀-鿿]/;

  // English text that still sits in the Chinese source; shown in Chinese mode.
  const ZH = {
    "Fleetserver · Operations": "Fleetserver · 运行总览",
    "OPERATIONS WORKSPACE": "运行工作区",
    WORKSPACE: "工作区",
    "FLEET OPERATIONS": "车队运行",
    Connecting: "连接中",
    "Live feedback is unavailable. Last reported positions may be out of date.": "实时反馈不可用，最后报告的位置可能已过期。",
    "Loading model": "正在读取模型",
    "Map layers": "地图图层",
    Paths: "路线",
    Points: "点位",
    Stations: "站点",
    Labels: "标签",
    "PLANT SETUP": "场地配置",
    "Connecting to your workspace": "正在连接工作区",
    "Waiting for the live plant model.": "等待实时运行模型。",
    "Map setup guide": "地图配置指南",
    Server: "服务器",
    "Plant model": "运行模型",
    Path: "路线",
    Point: "点位",
    Vehicle: "车辆",
    "Coordinates in metres": "坐标单位：米",
    "Vehicles appear here when they are available in the connected fleet.": "接入车队中的车辆可用后会显示在这里。",
    "No selection": "未选择对象",
    "One site. Two map layers.": "同一场地，两层地图。",
    "Your robot's navigation map describes free space. The openTCS plant model defines the permitted network of points, paths and stations.":
      "机器人的导航地图描述可通行空间；openTCS 运行模型定义允许使用的点位、路线和站点网络。",
    "Survey the real workspace": "测量实际场地",
    "Build and validate a SLAM map on the robot. Save the image and its map metadata together.": "在机器人上建立并验证 SLAM 地图，图片与地图元数据一起保存。",
    "Align the coordinate systems": "对齐坐标系",
    "Use the same origin, orientation and measured scale. ROS uses metres; openTCS model coordinates use millimetres.":
      "使用相同的原点、朝向和实测比例。ROS 以米为单位，openTCS 模型坐标以毫米为单位。",
    "Load a measured plant model": "载入实测运行模型",
    "Import the original map in the web editor and draw a draft route network. Kernel publication is a separate commissioning step.":
      "在网页编辑器中导入原始地图并绘制路网草稿；发布到内核是单独的调试步骤。",
    "This view displays the live plant model. It does not generate or approve routes from an image.": "此视图显示实时运行模型，不会根据图片生成或批准路线。",
    "Open web map editor": "打开网页地图编辑器",
    "Open the openTCS guide": "打开 openTCS 指南",
    "Fleetserver home": "Fleetserver 首页",
    "Plant map": "运行地图",
    "Refresh plant model": "刷新运行模型",
    "Positive Y points upwards": "Y 轴正方向朝上",
    "Zoom out": "缩小",
    "Fit plant to view": "适应视图",
    "Vehicle overview": "车辆概览",
    "Object inspector": "对象详情",
    "Inspector tabs": "详情标签页",
    "Close map setup guide": "关闭地图配置指南",
    "Fleet navigation": "车队导航",
    "Vehicle list": "车辆列表",
    Overview: "运行总览",
    "Your fleet, routes and transport orders in one workspace.": "在同一工作区查看车队、路线和运输订单。",
    "Request an operational pause; this is not an emergency stop": "请求运营暂停；这不是急停",
    "Request fleet resume": "请求全车恢复",
    "Pause requested": "已请求暂停",
    "Kernel connected": "内核已连接",
    "Awaiting live feedback": "等待实时反馈",
    "Waiting for current feedback": "等待当前反馈",
    "Waiting for server": "等待服务器",
    "Speed limit": "速度上限",
    "Linked points": "关联点位",
    "Empty model": "模型为空",
    "Waiting for model": "等待模型",
    "Live fleet connection established.": "已建立实时车队连接。",
    "Live feedback interrupted. Waiting to reconnect.": "实时反馈中断，等待重新连接。",
    "Invalid plant model response": "运行模型响应无效",
    "Plant model refreshed.": "运行模型已刷新。",
    "Unable to refresh the plant model.": "无法刷新运行模型。",
    "Request accepted. Awaiting vehicle confirmation.": "请求已受理，等待车辆确认。",
    "Some vehicles did not accept the request. See Activity.": "部分车辆未接受请求，请查看页面连接日志。",
    "No reported order to withdraw.": "没有可撤回的已报告订单。",
    "Withdrawal requested. Awaiting vehicle confirmation.": "已请求撤回，等待车辆确认。",
    "just now": "刚刚",
    "Live data · No sample orders": "实时数据 · 无示例订单",
    "The plant model is empty.": "运行模型为空。",
  };
  const ZH_PATTERNS = [
    [/^(\d+) reported$/, (m) => `${m[1]} 台已报告`],
    [/^Unable to load the fleet\. (.+)$/, (m) => `无法读取车队：${m[1]}`],
    [/^(\d+)s ago$/, (m) => `${m[1]} 秒前`],
  ];

  // Chinese punctuation -> English, applied to English output only.
  const PUNCT = [
    [/，\s*/g, ", "],
    [/。\s*/g, ". "],
    [/：\s*/g, ": "],
    [/；\s*/g, "; "],
    [/、\s*/g, ", "],
    [/\s*（/g, " ("],
    [/）/g, ")"],
    [/[“”「」]/g, '"'],
    [/！\s*/g, "! "],
    [/？\s*/g, "? "],
    [/＝/g, " = "],
  ];

  let dict = null;
  let segmentRe = null;
  function dictionary() {
    if (!dict) {
      dict = root.PortalI18nEN || {};
      const keys = Object.keys(dict)
        .filter((k) => k.trim().length >= 2)
        .sort((a, b) => b.length - a.length)
        .map((k) => k.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      segmentRe = keys.length ? new RegExp(keys.join("|"), "g") : null;
    }
    return dict;
  }

  const cache = new Map();
  function remember(key, value) {
    if (cache.size > 5000) cache.clear();
    cache.set(key, value);
    return value;
  }

  function splitSpace(text) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    return [m[1], m[2], m[3]];
  }

  function toEnglish(text) {
    if (!CJK.test(text)) return text;
    const hit = cache.get("en:" + text);
    if (hit !== undefined) return hit;
    const d = dictionary();
    const [lead, raw, tail] = splitSpace(text);
    const core = raw.replace(/\s+/g, " "); // HTML source wraps long text across lines
    let out;
    if (Object.hasOwn(d, core)) out = d[core];
    else {
      out = segmentRe ? core.replace(segmentRe, (seg) => "\u0001" + d[seg] + "\u0001") : core;
      out = out.replace(/\u0001+/g, (_m, offset, whole) => {
        const prev = whole[offset - 1];
        const next = whole[offset + _m.length];
        if (!prev || !next) return "";
        if (/[\s(\[/"'#·\-–]/.test(prev) || /[\s)\],.:;!?/"'%·\-–]/.test(next)) return "";
        return " ";
      });
      for (const [re, rep] of PUNCT) out = out.replace(re, rep);
      out = out.replace(/ {2,}/g, " ").trim();
    }
    return remember("en:" + text, lead + out + tail);
  }

  function toChinese(text) {
    const [lead, core, tail] = splitSpace(text);
    if (!core || HAN.test(core)) return text;
    if (Object.hasOwn(ZH, core)) return lead + ZH[core] + tail;
    for (const [re, fn] of ZH_PATTERNS) {
      const m = re.exec(core);
      if (m) return lead + fn(m) + tail;
    }
    return text;
  }

  function readStored() {
    try {
      const v = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      return v === "en" || v === "zh" ? v : null;
    } catch (_) {
      return null;
    }
  }

  let lang = readStored() || "zh";
  const translate = (text) => (lang === "en" ? toEnglish(text) : toChinese(text));

  const api = {
    get lang() {
      return lang;
    },
    t: translate,
    toEnglish,
    toChinese,
    setLang,
    onChange: null,
  };
  root.PortalI18n = api;
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined") return;

  const ATTRS = ["title", "placeholder", "aria-label", "alt"];
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "NOSCRIPT", "CODE", "PRE"]);
  const textState = new WeakMap(); // Text node -> {src, out}
  const attrState = new WeakMap(); // Element -> {attr: {src, out}}

  function skipped(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (SKIP_TAGS.has(e.tagName)) return true;
      if (e.isContentEditable) return true;
      if (e.getAttribute("translate") === "no" || e.hasAttribute("data-i18n-skip")) return true;
    }
    return false;
  }

  function doText(node) {
    const cur = node.nodeValue;
    const st = textState.get(node);
    const src = st && st.out === cur ? st.src : cur;
    if (!st && !CJK.test(src) && !/[A-Za-z]/.test(src)) return;
    const out = translate(src);
    textState.set(node, { src, out });
    if (out !== cur) node.nodeValue = out;
  }

  function doAttrs(el) {
    let st = attrState.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      const prev = st && st[a];
      const src = prev && prev.out === cur ? prev.src : cur;
      const out = translate(src);
      if (!st) attrState.set(el, (st = {}));
      st[a] = { src, out };
      if (out !== cur) el.setAttribute(a, out);
    }
    if (el.tagName === "INPUT" && /^(button|submit|reset)$/i.test(el.type) && el.value) {
      const cur = el.value;
      const prev = st && st.value;
      const src = prev && prev.out === cur ? prev.src : cur;
      const out = translate(src);
      if (!st) attrState.set(el, (st = {}));
      st.value = { src, out };
      if (out !== cur) el.value = out;
    }
  }

  function walk(rootNode) {
    if (rootNode.nodeType === 3) {
      if (rootNode.parentElement && !skipped(rootNode.parentElement)) doText(rootNode);
      return;
    }
    if (rootNode.nodeType !== 1 && rootNode.nodeType !== 9 && rootNode.nodeType !== 11) return;
    if (rootNode.nodeType === 1 && skipped(rootNode)) return;
    if (rootNode.nodeType === 1) doAttrs(rootNode);
    const tw = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1)
          return SKIP_TAGS.has(n.tagName) || n.isContentEditable || n.getAttribute("translate") === "no" || n.hasAttribute("data-i18n-skip")
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else doAttrs(n);
    }
  }

  let observer = null;
  function observe() {
    if (observer) return;
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") {
          if (r.target.parentElement && !skipped(r.target.parentElement)) doText(r.target);
        } else if (r.type === "attributes") {
          if (!skipped(r.target)) doAttrs(r.target);
        } else for (const n of r.addedNodes) walk(n);
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS, "value"],
    });
  }

  function applyDocument() {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    walk(document.documentElement);
    renderToggles();
  }

  function setLang(next, { persist = true } = {}) {
    if (next !== "en" && next !== "zh") return;
    if (next === lang) return;
    lang = next;
    if (persist) {
      try {
        root.localStorage.setItem(STORAGE_KEY, lang);
      } catch (_) {
        /* private window: the choice lasts for this page only */
      }
    }
    applyDocument();
    if (typeof api.onChange === "function") api.onChange(lang);
  }

  // Dialog text from confirm()/alert()/prompt() is translated too.
  for (const name of ["alert", "confirm", "prompt"]) {
    const original = root[name];
    if (typeof original !== "function") continue;
    root[name] = function (message, ...rest) {
      return original.call(this, typeof message === "string" ? translate(message) : message, ...rest);
    };
  }

  const toggles = new Set();
  function renderToggles() {
    for (const b of toggles) {
      b.textContent = lang === "en" ? "中文" : "English";
      b.setAttribute("aria-label", lang === "en" ? "切换到中文" : "Switch to English");
      b.setAttribute("lang", lang === "en" ? "zh-CN" : "en");
    }
  }
  function mountToggle() {
    if (document.querySelector(".lang-toggle")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "button button-quiet lang-toggle";
    b.setAttribute("translate", "no");
    b.addEventListener("click", () => setLang(lang === "en" ? "zh" : "en"));
    toggles.add(b);
    const slot = document.querySelector(".header-right") || document.querySelector("header");
    if (slot) slot.insertBefore(b, slot.firstChild);
    else {
      b.classList.add("lang-toggle-floating");
      document.body.appendChild(b);
    }
    renderToggles();
  }

  root.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && (e.newValue === "en" || e.newValue === "zh")) setLang(e.newValue, { persist: false });
  });

  function start() {
    mountToggle();
    applyDocument();
  }
  // Watch from the first parsed node so English pages don't flash Chinese.
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  observe();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})(typeof window !== "undefined" ? window : globalThis);
