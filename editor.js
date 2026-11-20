(function (root) {
  "use strict";
  const geometry = {
    pixelToWorld(m, u, v) {
      const [x, y, a] = m.origin,
        r = m.resolution;
      return {
        x: x + r * (u * Math.cos(a) - (m.height - v) * Math.sin(a)),
        y: y + r * (u * Math.sin(a) + (m.height - v) * Math.cos(a)),
      };
    },
    worldToPixel(m, x, y) {
      const [ox, oy, a] = m.origin,
        r = m.resolution;
      return {
        u: ((x - ox) * Math.cos(a) + (y - oy) * Math.sin(a)) / r,
        v: m.height - (-(x - ox) * Math.sin(a) + (y - oy) * Math.cos(a)) / r,
      };
    },
    rasterMatrix(m) {
      const [x, y, a] = m.origin,
        r = m.resolution;
      return [
        r * Math.cos(a),
        -r * Math.sin(a),
        r * Math.sin(a),
        r * Math.cos(a),
        x - r * m.height * Math.sin(a),
        -y - r * m.height * Math.cos(a),
      ];
    },
  };
  root.MapGeometry = geometry;
  if (typeof module !== "undefined") module.exports = geometry;
  if (typeof document === "undefined") return;
  const $ = (id) => document.getElementById(id);
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const esc = (v) =>
    String(v).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const round = (v) => Math.round(v * 1000) / 1000;
  // Translate presentation text only; server payloads and exported data stay intact.
  const serverMessages = {
    "Map YAML aliases/anchors are not supported.": "地图 YAML 不支持别名或锚点。",
    "Invalid map YAML.": "地图 YAML 格式无效。",
    "Map YAML must contain a metadata object.": "地图 YAML 必须包含元数据对象。",
    "Select the PGM/PNG named by the YAML image field; do not select a viewer screenshot.": "请选择 YAML 的 image 字段指定的 PGM / PNG 原图，不能使用查看器截图。",
    "Resolution must be finite metres per pixel, from 0.0001 to 10.": "分辨率必须为 0.0001–10 米 / 像素之间的有限数值。",
    "Origin must be three finite numbers: x, y, yaw in radians.": "原点必须包含三个有限数值：x、y 和以弧度表示的偏航角。",
    "Require 0 <= free_thresh < occupied_thresh <= 1.": "阈值必须满足 0 ≤ free_thresh < occupied_thresh ≤ 1。",
    "negate must be 0 or 1.": "反相值 negate 必须为 0 或 1。",
    "Unsupported map mode.": "不支持此地图模式。",
    "Invalid base64 image.": "图片的 Base64 编码无效。",
    "Map image must be at most 5 MiB.": "地图图片不能超过 5 MiB。",
    "A PGM must use the P2 or P5 format.": "PGM 图片必须使用 P2 或 P5 格式。",
    "Image type does not match its filename, or contains animation.": "图片类型与文件名不符，或图片包含动画。",
    "Map image exceeds the 8-million-cell limit.": "地图图片超过 800 万栅格上限。",
    "Normalized map image exceeds 5 MiB; reduce map extent or resolution.": "地图图片转换后超过 5 MiB，请缩小地图范围或调整分辨率。",
    "Image could not be decoded safely.": "无法安全读取图片，请检查图片格式或大小。",
    "Object names must be unique across the model.": "场地内的对象名称不能重复。",
    "Add at least one measured point.": "请至少添加一个按实测坐标设置的点位。",
    "Path endpoint does not exist.": "路线引用的起点或终点不存在。",
    "Path endpoints must be distinct positions, at least 1 mm apart.": "路线起终点必须位于不同位置，且至少相距 1 毫米。",
    "A directed connection already exists.": "相同方向的路线已存在。",
    "Station must link to an existing parking/stop point.": "停车工位必须关联到已有的停车或停靠点位。",
    "Block needs distinct, existing point/path members.": "通行区必须包含已有的点位或路线，成员不能重复。",
    "The network has disconnected components; review intended connectivity.": "路线网络存在未连通的部分，请核对是否符合预期。",
    "No business stations are defined.": "尚未定义停车工位。",
    "No traffic blocks are defined; crossing/shared-lane conflicts require review.": "尚未定义通行区，请复核交叉或共用车道的冲突。",
    "Structural checks do not validate localization, robot clearance, braking, turns or physical safety.": "结构检查不验证定位、机器人净空、制动、转弯或实际安全性。",
    "Draft structure only; not commissioned or published": "仅检查草稿结构；尚未完成实地调试，也未发布为运行版本。",
    "Map image not found.": "找不到地图图片。",
    "Draft or revision not found.": "找不到草稿或修订。",
    "Draft changed in another tab or no longer exists. Reload before saving.": "草稿已在其他标签页修改或已不存在，请重新加载后再保存。",
    "A new draft must use expectedRevision 0.": "新草稿的预期修订号必须为 0。",
    "Non-JSON API response; request outcome is uncertain": "服务器返回的内容不是有效 JSON，请检查连接后重新查询草稿状态。",
    "Invalid API response": "服务器响应格式无效，请检查连接后重试。",
    "Request outcome is uncertain; query the original receipt": "请求结果尚不确定，请重新查询草稿状态后再操作。",
    "Operator key required": "需要操作控制密钥。",
    "Invalid operator key": "操作控制密钥无效。",
  };
  function displayMessage(value) {
    if (typeof value !== "string" || !value) return "请求失败，请检查输入或连接后重试。";
    if (Object.hasOwn(serverMessages, value)) return serverMessages[value];
    if (value.startsWith("Fix draft errors before export: "))
      return "导出前请修正草稿错误：" + value.slice("Fix draft errors before export: ".length);
    if (/^HTTP \d+$/.test(value)) return "请求失败（" + value + "），请检查连接后重试。";
    if (/[\u3400-\u9fff]/.test(value)) return value;
    return "请求失败，请检查输入、地图文件或连接状态后重试。";
  }
  function errorMessage(error) {
    if (error?.status === 401 || error?.status === 403) return error.code === "PORTAL_SESSION_HTTP" ? error.message : "请使用有效的操作员密钥登录。";
    if (error instanceof SyntaxError) return "地图包 JSON 格式无效，请选择完整的地图包文件。";
    const message = displayMessage(error?.message);
    return error?.code ? `${message}（${error.code}）` : message;
  }
  const kinds = ["points", "paths", "stations", "blocks"];
  const kindLabels = { points: "点位", paths: "路线", stations: "停车工位", blocks: "通行区" };
  const fresh = () => ({
    schemaVersion: "1.0",
    name: "未命名场地",
    mapId: "site-map-v1",
    rasterId: null,
    points: [],
    paths: [],
    stations: [],
    blocks: [],
  });
  const api = new FleetAPI(
    () => {},
    () => {},
    onSessionChange,
  );
  let sessionReady = false, sessionRevision = null;
  let defaultBackground = null;
  let requestedDraftId = new URLSearchParams(window.location.search).get("draftId");
  let draft = fresh(),
    identifier = null,
    revision = 0,
    dirty = false,
    selected = null;
  let mode = "select",
    pathStart = null,
    raster = null,
    rasterUrl = null,
    rasterBytes = null;
  let undo = [],
    redo = [],
    busy = false,
    drag = null,
    loadGeneration = 0;
  let camera = { x: -1, y: -8, w: 12, h: 9 };
  function toast(message) {
    $("editorToast").textContent = displayMessage(message);
    $("editorToast").hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ($("editorToast").hidden = true), 6500);
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    try {
      await action();
    } catch (error) {
      toast(errorMessage(error));
    } finally {
      busy = false;
    }
  }
  const request = (path, body) => {
    api.requireAuthorization();
    return api.request("map-workspace/" + path, body);
  };
  function requireSession() {
    if (api.authorized) return true;
    $("editorAccessDialog").showModal();
    return false;
  }
  function checkpoint() {
    undo.push(copy(draft));
    if (undo.length > 60) undo.shift();
    redo = [];
  }
  function changed() {
    dirty = true;
    $("validationResults").innerHTML =
      "<p>草稿已修改，请在导出前重新检查。</p>";
    render();
  }
  function edit(action) {
    checkpoint();
    action();
    changed();
  }
  function nextId(prefix) {
    let n = 1;
    const ids = kinds.flatMap((k) => draft[k].map((v) => v.id));
    while (ids.includes(prefix + n)) n++;
    return prefix + n;
  }
  function object() {
    return selected && draft[selected.kind].find((v) => v.id === selected.id);
  }
  function setTool(value) {
    mode = value;
    pathStart = null;
    render();
  }
  function select(kind, id) {
    selected = { kind, id };
    render();
  }
  function applyCamera() {
    $("editorSvg").setAttribute(
      "viewBox",
      `${camera.x} ${camera.y} ${camera.w} ${camera.h}`,
    );
  }
  function fit() {
    const positions = [...draft.points, ...draft.stations];
    if (raster)
      for (const [u, v] of [
        [0, 0],
        [raster.width, 0],
        [0, raster.height],
        [raster.width, raster.height],
      ])
        positions.push(geometry.pixelToWorld(raster, u, v));
    if (!positions.length) {
      camera = { x: -1, y: -8, w: 12, h: 9 };
      applyCamera();
      return;
    }
    const xs = positions.map((p) => p.x),
      ys = positions.map((p) => -p.y);
    const minX = Math.min(...xs),
      minY = Math.min(...ys),
      w = Math.max(2, Math.max(...xs) - minX),
      h = Math.max(2, Math.max(...ys) - minY);
    camera = { x: minX - w * 0.1, y: minY - h * 0.1, w: w * 1.2, h: h * 1.2 };
    applyCamera();
  }
  function zoom(factor) {
    const w = Math.min(2000000, Math.max(0.05, camera.w * factor)),
      h = (w * camera.h) / camera.w;
    camera = {
      x: camera.x + (camera.w - w) / 2,
      y: camera.y + (camera.h - h) / 2,
      w,
      h,
    };
    applyCamera();
  }
  function scenePosition(event) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      $("editorSvg").getScreenCTM().inverse(),
    );
    return { x: point.x, y: -point.y };
  }
  function mark(kind, id) {
    return selected?.kind === kind && selected.id === id ? " selected" : "";
  }
  function render() {
    $("draftTitle").textContent = draft.name;
    $("draftStatus").textContent =
      `${identifier ? "修订 " + revision : "草稿未保存"}${dirty ? " · 有未保存的修改" : ""} · 未发布`;
    $("editorAccess").textContent = api.authorized ? "操作员已登录" : "操作员登录";
    $("editorAccessStatus").textContent = api.authorized
      ? "已登录，可读取和保存地图草稿。"
      : api.portalRole === "automation" ? "当前使用自动化凭据。请使用操作员密钥登录。"
      : "登录后可读取已保存的草稿、导入地图和保存修订。";
    $("editorCredentials").hidden = api.authorized;
    $("editorKey").disabled = api.authorized;
    $("editorLogin").hidden = api.authorized;
    $("endEditorSession").hidden = !(api.authorized || api.portalRole || api.logoutPending);
    $("saveDraft").disabled = !api.authorized;
    $("undoEdit").disabled = !undo.length;
    $("redoEdit").disabled = !redo.length;
    $("deleteObject").disabled = !object();
    document.querySelectorAll("button[data-tool]").forEach((el) => {
      const active = el.dataset.tool === mode;
      el.classList.toggle("active", active);
      el.setAttribute("aria-pressed", active);
    });
    $("canvasWelcome").hidden = !!(
      raster ||
      draft.points.length ||
      mode !== "select"
    );
    $("toolHint").textContent = {
      select:
        "选择对象；拖动对象可移动，拖动空白处可平移画布。",
      point:
        "点击放置点位；可在属性中输入精确的世界坐标。",
      path: pathStart
        ? `已选起点 ${pathStart}，请选择终点。路线为单向。`
        : "依次选择起点和终点；路线为单向。",
      station: "选择停车点位，关联一个 NOP 停车工位。",
    }[mode];
    const unit = Math.max(0.018, camera.w / 150);
    $("draftPaths").innerHTML = draft.paths
      .map((p) => {
        const a = draft.points.find((v) => v.id === p.source),
          b = draft.points.find((v) => v.id === p.target);
        if (!a || !b) return "";
        return `<g data-kind="paths" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="路线 ${esc(p.id)}" class="edit-path${mark("paths", p.id)}${p.locked ? " locked" : ""}"><path class="path-target" d="M${a.x},${-a.y} L${b.x},${-b.y}"/><path class="draft-path" d="M${a.x},${-a.y} L${b.x},${-b.y}" marker-end="url(#editorArrow)"/><text x="${(a.x + b.x) / 2}" y="${-(a.y + b.y) / 2 - unit}" font-size="${unit * 1.25}">${esc(p.id)}</text></g>`;
      })
      .join("");
    $("draftStations").innerHTML = draft.stations
      .map((s) => {
        const p = draft.points.find((v) => v.id === s.pointId);
        return `<g data-kind="stations" data-id="${esc(s.id)}" tabindex="0" role="button" aria-label="停车工位 ${esc(s.id)}" class="edit-station${mark("stations", s.id)}">${p ? `<line class="station-connector" x1="${p.x}" y1="${-p.y}" x2="${s.x}" y2="${-s.y}"/>` : ""}<rect class="draft-station" x="${s.x - unit * 1.3}" y="${-s.y - unit * 1.3}" width="${unit * 2.6}" height="${unit * 2.6}" rx="${unit * 0.3}"/><text x="${s.x + unit * 1.8}" y="${-s.y + unit * 0.5}" font-size="${unit * 1.4}">${esc(s.id)}</text></g>`;
      })
      .join("");
    $("draftPoints").innerHTML = draft.points
      .map(
        (p) =>
          `<g data-kind="points" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="点位 ${esc(p.id)}" class="edit-point${mark("points", p.id)}${pathStart === p.id ? " path-start" : ""}"><circle class="draft-point" cx="${p.x}" cy="${-p.y}" r="${unit}"/><text x="${p.x + unit * 1.4}" y="${-p.y - unit}" font-size="${unit * 1.4}">${esc(p.id)}</text></g>`,
      )
      .join("");
    $("objectTotal").textContent =
      `${kinds.reduce((n, k) => n + draft[k].length, 0)} 个对象`;
    $("editorSvg").dataset.tool = mode;
    $("objectTree").innerHTML = kinds
      .map(
        (k) =>
          `<details open><summary>${kindLabels[k]}<span>${draft[k].length}</span></summary><div class="object-group">${draft[k].map((v) => `<button data-kind="${k}" data-id="${esc(v.id)}" class="object-row${mark(k, v.id)}"><span class="object-kind-dot ${k}"></span><span>${esc(v.id)}</span></button>`).join("") || '<p class="empty-group">暂无对象</p>'}</div></details>`,
      )
      .join("");
    renderProperties();
    applyCamera();
  }
  function field(label, name, value, type = "text", extra = "") {
    return `<label>${label}<input name="${name}" value="${esc(value ?? "")}" type="${type}" ${extra} required></label>`;
  }
  function options(values, chosen, labels = {}) {
    return values
      .map(
        (v) =>
          `<option value="${esc(v)}" ${v === chosen ? "selected" : ""}>${esc(Object.hasOwn(labels, v) ? labels[v] : v)}</option>`,
      )
      .join("");
  }
  function renderProperties() {
    const item = object();
    $("propertyHeading").textContent = item ? item.id : "草稿属性";
    $("propertyKind").textContent = item ? kindLabels[selected.kind] : "米";
    let html = item
      ? field("对象名称", "id", item.id)
      : field("场地名称", "name", draft.name) +
        field("地图版本标识", "mapId", draft.mapId);
    if (item && ["points", "stations"].includes(selected.kind))
      html +=
        field(
          "X · 米",
          "x",
          item.x,
          "number",
          'step="0.001" min="-1000000" max="1000000"',
        ) +
        field(
          "Y · 米",
          "y",
          item.y,
          "number",
          'step="0.001" min="-1000000" max="1000000"',
        );
    if (selected?.kind === "points" && item)
      html += `<label>点位类型<select name="type">${options(["HALT_POSITION", "PARK_POSITION"], item.type, { HALT_POSITION: "停靠点", PARK_POSITION: "停车点" })}</select></label>`;
    if (selected?.kind === "paths" && item)
      html +=
        `<label>起点<select name="source">${options(
          draft.points.map((v) => v.id),
          item.source,
        )}</select></label><label>终点<select name="target">${options(
          draft.points.map((v) => v.id),
          item.target,
        )}</select></label>` +
        field(
          "速度上限 · m/s",
          "maxVelocity",
          item.maxVelocity,
          "number",
          'min="0.001" max="0.05" step="0.001"',
        ) +
        `<label class="checkbox-label"><input type="checkbox" name="locked" ${item.locked ? "checked" : ""}>锁定路线</label><p class="property-description">直线、仅允许正向行驶。当前 Bridge 配置的速度上限为 0.05 m/s。</p>`;
    if (selected?.kind === "stations" && item)
      html += `<label>关联点位<select name="pointId">${options(
        draft.points.map((v) => v.id),
        item.pointId,
      )}</select></label><p class="property-description">停车工位操作为 NOP，不执行装卸或外设控制。</p>`;
    if (selected?.kind === "blocks" && item)
      html += `<label>通行区成员<select name="members" multiple size="7">${[...draft.points, ...draft.paths].map((v) => `<option value="${esc(v.id)}" ${item.members.includes(v.id) ? "selected" : ""}>${esc(v.id)}</option>`).join("")}</select></label><p class="property-description">仅允许单车占用。按住 Ctrl / Cmd 可选择多个资源；实际净空需单独复核。</p>`;
    html = `<form id="propertyForm" class="property-form">${html}<button class="button" type="submit">应用属性</button></form>`;
    if (!item && raster)
      html += `<section class="raster-info"><h3>ROS 地图背景</h3><dl><dt>图片</dt><dd>${esc(raster.originalImage || raster.image || raster.source || "发布环境占据图")}</dd><dt>栅格尺寸</dt><dd>${raster.width} × ${raster.height}</dd><dt>分辨率</dt><dd>${raster.resolution} 米 / 栅格</dd><dt>原点与偏航角</dt><dd>${raster.origin.map((v) => Number(v).toFixed(3)).join(", ")}</dd><dt>模式 / 反相值</dt><dd>${esc(raster.mode)} / ${raster.negate}</dd><dt>空闲 / 占据阈值</dt><dd>${raster.free_thresh} / ${raster.occupied_thresh}</dd></dl><label>背景不透明度<input id="rasterOpacity" type="range" min="0" max="1" step="0.05" value="${$("rasterImage").style.opacity || 0.75}"></label><button id="detachRaster" class="button" type="button">移除背景关联</button></section>`;
    if (!item && identifier)
      html +=
        '<section class="raster-info"><h3>已保存修订</h3><button id="loadHistory" class="button" type="button">查看修订历史</button><div id="revisionList"></div></section>';
    $("propertyBody").innerHTML = html;
    $("propertyForm").onsubmit = (event) => {
      event.preventDefault();
      try {
        applyProperties(new FormData(event.target));
      } catch (e) {
        toast(errorMessage(e));
      }
    };
    if ($("rasterOpacity"))
      $("rasterOpacity").oninput = (e) =>
        ($("rasterImage").style.opacity = e.target.value);
    if ($("detachRaster"))
      $("detachRaster").onclick = () => {
        if (busy) return;
        edit(() => (draft.rasterId = null));
        clearRaster();
        render();
      };
    if ($("loadHistory"))
      $("loadHistory").onclick = () =>
        run(async () => {
          if (!requireSession()) return;
          const list = await request(`drafts/${identifier}/history`);
          $("revisionList").innerHTML = list
            .map(
              (v) =>
                `<button class="revision-button" data-revision="${v.revision}">修订 ${v.revision} · ${esc(v.updatedAt.slice(0, 16).replace("T", " "))}</button>`,
            )
            .join("");
        });
  }
  function applyProperties(data) {
    if (busy) return;
    const item = object(),
      values = Object.fromEntries(data);
    for (const name of ["id", "name", "mapId"])
      if (values[name] !== undefined) {
        values[name] = values[name].trim();
        if (
          !values[name] ||
          values[name].length > 80 ||
          /[\x00-\x1f<>/\\]/.test(values[name])
        )
          throw Error(
            "名称应为 1–80 个字符，不能包含控制字符、<、>、/ 或反斜杠。",
          );
      }
    if (
      item &&
      values.id !== item.id &&
      kinds.some((k) => draft[k].some((v) => v.id === values.id))
    )
      throw Error("对象名称不能重复。");
    for (const key of ["x", "y", "maxVelocity"])
      if (key in values) {
        values[key] = Number(values[key]);
        if (!Number.isFinite(values[key]))
          throw Error("坐标和速度必须为有限数值。");
      }
    if (
      "maxVelocity" in values &&
      (values.maxVelocity <= 0 || values.maxVelocity > 0.05)
    )
      throw Error("速度必须大于 0，且不超过 0.05 m/s。");
    if (selected?.kind === "paths") values.locked = data.has("locked");
    if (selected?.kind === "blocks") values.members = data.getAll("members");
    edit(() => {
      if (!item) {
        Object.assign(draft, values);
        return;
      }
      const oldId = item.id,
        dx = (values.x ?? item.x) - item.x,
        dy = (values.y ?? item.y) - item.y;
      Object.assign(item, values);
      if (selected.kind === "points") {
        draft.paths.forEach((p) => {
          if (p.source === oldId) p.source = item.id;
          if (p.target === oldId) p.target = item.id;
        });
        draft.stations.forEach((s) => {
          if (s.pointId === oldId) {
            s.pointId = item.id;
            s.x = round(s.x + dx);
            s.y = round(s.y + dy);
          }
        });
      }
      if (["points", "paths"].includes(selected.kind))
        draft.blocks.forEach(
          (b) =>
            (b.members = b.members.map((id) => (id === oldId ? item.id : id))),
        );
      selected.id = item.id;
    });
  }
  function removeSelected() {
    if (!object()) return;
    edit(() => {
      const removed = new Set([selected.id]);
      if (selected.kind === "points") {
        draft.paths
          .filter((p) => p.source === selected.id || p.target === selected.id)
          .forEach((p) => removed.add(p.id));
        draft.stations = draft.stations.filter(
          (s) => s.pointId !== selected.id,
        );
      }
      draft[selected.kind] = draft[selected.kind].filter(
        (v) => v.id !== selected.id,
      );
      draft.paths = draft.paths.filter((p) => !removed.has(p.id));
      draft.blocks.forEach(
        (b) => (b.members = b.members.filter((id) => !removed.has(id))),
      );
      selected = null;
      pathStart = null;
    });
  }
  function clearRaster() {
    loadGeneration++;
    if (rasterUrl) URL.revokeObjectURL(rasterUrl);
    rasterUrl = null;
    raster = null;
    rasterBytes = null;
    $("rasterImage").removeAttribute("href");
  }
  async function imageBytes(id) {
    if (id !== defaultBackground?.id) {
      const image = await api.request(`map-workspace/rasters/${id}/image.png`, undefined, { rasterImage: true });
      return new Uint8Array(await image.arrayBuffer());
    }
    const response = await fetch("/api/v1/map-background/image.png", { cache: "no-store" });
    if (!response.ok) throw Error("地图图片暂不可用。");
    return new Uint8Array(await response.arrayBuffer());
  }
  async function loadRaster() {
    clearRaster();
    const generation = loadGeneration,
      id = draft.rasterId;
    if (!id || (!api.authorized && id !== defaultBackground?.id)) return;
    const metadata =
        id === defaultBackground?.id
          ? defaultBackground
          : await request(`rasters/${id}`),
      bytes = await imageBytes(id);
    if (generation !== loadGeneration || id !== draft.rasterId) return;
    raster = metadata;
    rasterBytes = bytes;
    rasterUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
    const image = $("rasterImage");
    image.setAttribute("href", rasterUrl);
    image.setAttribute("width", raster.width);
    image.setAttribute("height", raster.height);
    image.setAttribute(
      "transform",
      `matrix(${geometry.rasterMatrix(raster).join(" ")})`,
    );
    image.style.opacity = 0.75;
    render();
  }
  async function catalog() {
    const revision = api.keyRevision;
    const value = await request("catalog");
    if (revision !== api.keyRevision) throw Error("登录状态已变化，请重新读取草稿。");
    $("savedDrafts").innerHTML =
      '<option value="">请选择已保存的草稿</option>' +
      value.drafts
        .map(
          (v) =>
            `<option value="${v.id}" ${v.id === identifier ? "selected" : ""}>${esc(v.name)} · 修订 ${v.revision}</option>`,
        )
        .join("");
    return value;
  }
  function discard() {
    return !dirty || confirm("放弃草稿中尚未保存的修改？");
  }
  async function openDraft(value, asRevision = false) {
    clearRaster();
    draft = copy(value.draft);
    if (!asRevision) {
      identifier = value.id;
      revision = value.revision;
      undo = [];
      redo = [];
      dirty = false;
      $("savedDrafts").value = identifier || "";
    } else {
      dirty = true;
    }
    selected = null;
    pathStart = null;
    render();
    await loadRaster();
    fit();
    render();
  }
  function report(value) {
    $("validationResults").innerHTML =
      `<p class="validation-summary ${value.valid ? "valid" : "invalid"}">${value.valid ? "草稿结构检查通过" : `有 ${value.errors.length} 项错误需修正`}</p>${value.errors.map((v) => `<p class="validation-error">${v.objectId?esc(v.objectId)+" · ":""}${esc(displayMessage(v.message))}</p>`).join("")}${value.warnings.map((v) => `<p class="validation-warning">${esc(displayMessage(v))}</p>`).join("")}<small>${esc(displayMessage(value.scope))}</small><details><summary>校验原始依据</summary><pre>${esc(JSON.stringify(value,null,2))}</pre></details>`;
  }
  function download(value, name) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function base64(bytes) {
    let value = "";
    for (let n = 0; n < bytes.length; n += 8192)
      value += String.fromCharCode(...bytes.subarray(n, n + 8192));
    return btoa(value);
  }
  function mapYaml(m) {
    return `image: map.png\nresolution: ${m.resolution}\norigin: [${m.origin.join(", ")}]\nnegate: ${m.negate}\nmode: ${m.mode}\nfree_thresh: ${m.free_thresh}\noccupied_thresh: ${m.occupied_thresh}\n`;
  }
  function nameFile(suffix) {
    return (draft.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "map") + suffix;
  }
  async function loadWorkspace() {
    const accessRevision = api.keyRevision;
    const index = await catalog();
    let id = null;
    if (requestedDraftId && discard()) id = requestedDraftId;
    else if (!dirty && !identifier && index.defaultDraftId && draft.rasterId === defaultBackground?.id) id = index.defaultDraftId;
    if (!id) return loadRaster();
    const value = await request(`drafts/${encodeURIComponent(id)}`);
    if (accessRevision !== api.keyRevision) return;
    await openDraft(value);
    if (id === requestedDraftId) requestedDraftId = null;
  }
  function onSessionChange() {
    if (!sessionReady) return;
    if (sessionRevision !== api.keyRevision) {
      sessionRevision = api.keyRevision;
      if (api.authorized) run(loadWorkspace);
      else {
        if (draft.rasterId !== defaultBackground?.id) clearRaster();
        $("savedDrafts").innerHTML = '<option value="">登录后加载草稿</option>';
      }
    }
    render();
  }
  $("editorAccess").onclick = () => {
    $("editorAccessError").hidden = true;
    $("editorAccessDialog").showModal();
  };
  $("editorAccessDialog").addEventListener("close", () => { $("editorKey").value = ""; });
  $("editorAccessForm").onsubmit = async (event) => {
    event.preventDefault();
    if (busy || api.authorized) return;
    busy = true;
    $("editorAccessError").hidden = true;
    const key = $("editorKey").value.trim();
    $("editorKey").value = "";
    try {
      await api.loginPortal(key);
      if (!api.authorized) return;
      await loadWorkspace();
      $("editorAccessDialog").close();
      toast("操作员已登录，可读取和保存地图草稿。");
    } catch (error) {
      $("editorAccessError").textContent = errorMessage(error);
      $("editorAccessError").hidden = false;
    } finally {
      busy = false;
      render();
    }
  };
  $("endEditorSession").onclick = async () => {
    if (busy) return;
    busy = true;
    try {
      await api.logoutPortal();
      $("editorAccessDialog").close();
      toast("已退出登录。");
    } catch (_) {
      $("editorAccessError").textContent = "未能确认已退出，请重试。";
      $("editorAccessError").hidden = false;
    } finally { busy = false; render(); }
  };
  document
    .querySelectorAll("[data-close-dialog]")
    .forEach((el) => (el.onclick = () => el.closest("dialog").close()));
  for (const id of ["importRasterButton", "welcomeImport"])
    $(id).onclick = () => {
      if (requireSession()) $("rasterDialog").showModal();
    };
  $("rasterForm").onsubmit = async (event) => {
    event.preventDefault();
    if (busy || !requireSession()) return;
    busy = true;
    $("uploadRaster").disabled = true;
    $("rasterError").hidden = true;
    try {
      const yaml = $("yamlFile").files[0],
        image = $("rasterFile").files[0];
      if (!yaml || !image || yaml.size > 65536 || image.size > 5 * 1024 * 1024)
        throw Error(
          "请选择 YAML（最大 64 KiB）及其原始图片（最大 5 MiB）。",
        );
      const value = await request("rasters", {
        yamlText: await yaml.text(),
        imageName: image.name,
        imageBase64: base64(new Uint8Array(await image.arrayBuffer())),
      });
      edit(() => (draft.rasterId = value.id));
      await loadRaster();
      fit();
      render();
      $("rasterDialog").close();
      toast("地图已导入，请保存草稿以保留背景关联。");
    } catch (error) {
      $("rasterError").textContent = errorMessage(error);
      $("rasterError").hidden = false;
    } finally {
      busy = false;
      $("uploadRaster").disabled = false;
    }
  };
  $("newDraft").onclick = () => {
    if (busy || !discard()) return;
    clearRaster();
    draft = fresh();
    if (defaultBackground)
      Object.assign(draft, {
        name: defaultBackground.name,
        mapId: defaultBackground.mapId,
        rasterId: defaultBackground.id,
      });
    identifier = null;
    revision = 0;
    dirty = false;
    undo = [];
    redo = [];
    selected = null;
    fit();
    render();
    run(async () => {
      await loadRaster();
      fit();
      render();
    });
  };
  $("savedDrafts").onchange = (event) => {
    const id = event.target.value;
    if (busy || !id || !discard()) {
      event.target.value = identifier || "";
      return;
    }
    run(async () => openDraft(await request(`drafts/${id}`)));
  };
  $("saveDraft").onclick = () =>
    run(async () => {
      if (!requireSession()) return;
      const snapshot = copy(draft);
      const value = await request("drafts/save", {
        id: identifier,
        expectedRevision: revision,
        draft: snapshot,
      });
      identifier = value.id;
      revision = value.revision;
      dirty = JSON.stringify(snapshot) !== JSON.stringify(draft);
      await catalog();
      render();
      report(value.validation);
      toast(`已保存修订 ${revision}，尚未发布。`);
    });
  $("validateDraft").onclick = () =>
    run(async () => {
      if (requireSession()) report(await request("drafts/validate", { draft }));
    });
  $("exportModel").onclick = () =>
    run(async () => {
      if (!requireSession()) return;
      const value = await request("drafts/export", { draft });
      report(value.validation);
      download(value.model, nameFile(".opentcs.json"));
      toast(
        "已下载 openTCS REST 模型 JSON，仅包含新拓扑，不含车辆或驱动属性，尚未发布。",
      );
    });
  $("saveBundle").onclick = () =>
    run(async () => {
      if (draft.rasterId && (!raster || !rasterBytes))
        throw Error(
          "请重新连接操作会话，以将地图背景包含在地图包中。",
        );
      download(
        {
          schema: "fleetserver-map-bundle/1",
          draft,
          raster: raster
            ? { metadata: raster, imageBase64: base64(rasterBytes) }
            : null,
        },
        nameFile(".fleetmap.json"),
      );
    });
  $("importBundleButton").onclick = () => $("bundleFile").click();
  $("bundleFile").onchange = (event) =>
    run(async () => {
      const file = event.target.files[0];
      event.target.value = "";
      if (!file || !discard()) return;
      if (!requireSession()) return;
      if (file.size > 10 * 1024 * 1024) throw Error("地图包超过 10 MiB 上限。");
      const value = JSON.parse(await file.text());
      if (
        value.schema !== "fleetserver-map-bundle/1" ||
        !value.draft ||
        !kinds.every((k) => Array.isArray(value.draft[k]))
      )
        throw Error("不支持此地图包格式。");
      const candidate = copy(value.draft);
      candidate.rasterId = null;
      if (value.raster) {
        const m = value.raster.metadata;
        const stored = await request("rasters", {
          yamlText: mapYaml(m),
          imageName: "map.png",
          imageBase64: value.raster.imageBase64,
        });
        candidate.rasterId = stored.id;
      }
      await request("drafts/validate", { draft: candidate });
      await openDraft({ id: null, revision: 0, draft: candidate });
      dirty = true;
      render();
      toast("地图包已作为新草稿打开，请保存以保留在当前服务器上。");
    });
  $("importLive").onclick = () =>
    run(async () => {
      if (!requireSession()) return;
      if (!confirm(dirty
        ? "复制运行拓扑将替换当前未保存的编辑内容。已保存修订不会覆盖；通行区、车辆与驱动属性不保证包含。继续复制？"
        : "复制运行拓扑将替换编辑器当前草稿内容，作为一个新的未保存草稿。已保存修订不会覆盖；通行区、车辆与驱动属性不保证包含。继续复制？")) return;
      const m = await api.model();
      const model = m.model || m;
      if (!Array.isArray(model.points))
        throw Error("运行版本拓扑暂不可用。");
      if (
        model.paths.some(
          (p) => p.connectionType && p.connectionType !== "DIRECT",
        )
      )
        throw Error(
          "运行版本包含曲线路线；此编辑器仅支持直线路线。",
        );
      const candidate = fresh();
      candidate.name = model.name || "运行版本拓扑副本";
      candidate.points = model.points.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        type: p.type || "HALT_POSITION",
      }));
      candidate.paths = model.paths.map((p) => ({
        id: p.id,
        source: p.source,
        target: p.target,
        maxVelocity: Math.min(0.05, p.maxVelocity || 0.05),
        locked: !!p.locked,
      }));
      candidate.stations = (model.stations || []).map((s) => {
        if (s.links?.length !== 1)
          throw Error("只能复制关联单个点位的停车工位。");
        return { id: s.id, pointId: s.links[0], x: s.x, y: s.y };
      });
      candidate.blocks = (model.blocks || []).map((b) => ({
        id: b.id,
        type: "SINGLE_VEHICLE_ONLY",
        members: b.members,
      }));
      await request("drafts/validate", { draft: candidate });
      await openDraft({ id: null, revision: 0, draft: candidate });
      dirty = true;
      render();
      toast(
        "已复制点位、直线路线和关联单个点位的停车工位。通行区、车辆和驱动属性需单独复核。",
      );
    });
  $("propertyBody").addEventListener("click", (event) => {
    const button = event.target.closest("[data-revision]");
    if (!button || !discard()) return;
    run(async () => {
      const value = await request(
        `drafts/${identifier}/revisions/${button.dataset.revision}`,
      );
      checkpoint();
      await openDraft(value, true);
      toast(
        "历史修订已载入为未保存的编辑内容；保存后会生成新修订。",
      );
    });
  });
  document.querySelectorAll("button[data-tool]").forEach(
    (el) =>
      (el.onclick = () => {
        if (!busy) setTool(el.dataset.tool);
      }),
  );
  $("addBlock").onclick = () => {
    if (busy) return;
    edit(() => {
      const id = nextId("B");
      draft.blocks.push({ id, type: "SINGLE_VEHICLE_ONLY", members: [] });
      selected = { kind: "blocks", id };
    });
  };
  $("deleteObject").onclick = () => {
    if (!busy) removeSelected();
  };
  function travel(from, to) {
    if (!from.length || busy) return;
    to.push(copy(draft));
    draft = from.pop();
    selected = null;
    pathStart = null;
    changed();
    run(loadRaster);
  }
  $("undoEdit").onclick = () => travel(undo, redo);
  $("redoEdit").onclick = () => travel(redo, undo);
  $("objectTree").onclick = (event) => {
    const el = event.target.closest("[data-kind]");
    if (el) select(el.dataset.kind, el.dataset.id);
  };
  function activate(kind, id) {
    if (busy) return;
    if (kind === "points" && mode === "path") {
      if (!pathStart) {
        pathStart = id;
        selected = { kind, id };
        render();
        return;
      }
      if (
        pathStart === id ||
        draft.paths.some((p) => p.source === pathStart && p.target === id)
      ) {
        toast(
          "请选择不同的终点，且不要与已有的单向路线重复。",
        );
        return;
      }
      edit(() => {
        const name = nextId("R");
        draft.paths.push({
          id: name,
          source: pathStart,
          target: id,
          maxVelocity: 0.05,
          locked: false,
        });
        pathStart = null;
        selected = { kind: "paths", id: name };
      });
    } else if (kind === "points" && mode === "station")
      edit(() => {
        const point = draft.points.find((p) => p.id === id),
          name = nextId("S");
        draft.stations.push({
          id: name,
          pointId: id,
          x: round(point.x + 0.3),
          y: round(point.y + 0.3),
        });
        selected = { kind: "stations", id: name };
      });
    else select(kind, id);
  }
  $("editorSvg").addEventListener("pointerdown", (event) => {
    if (busy || event.button !== 0) return;
    const element = event.target.closest("[data-kind]"),
      p = scenePosition(event);
    if (element) {
      const { kind, id } = element.dataset;
      activate(kind, id);
      if (mode === "select" && ["points", "stations"].includes(kind))
        drag = {
          type: "object",
          start: p,
          snapshot: copy(draft),
          kind,
          id,
          moved: false,
        };
    } else if (mode === "point")
      edit(() => {
        const id = nextId("P");
        draft.points.push({
          id,
          x: round(p.x),
          y: round(p.y),
          type: "HALT_POSITION",
        });
        selected = { kind: "points", id };
      });
    else if (mode === "select") {
      selected = null;
      render();
      drag = {
        type: "pan",
        start: p,
        clientX: event.clientX,
        clientY: event.clientY,
        camera: { ...camera },
        moved: false,
      };
    }
    if (drag) $("editorSvg").setPointerCapture(event.pointerId);
  });
  $("editorSvg").addEventListener("pointermove", (event) => {
    const p = scenePosition(event);
    $("cursorPosition").textContent =
      `X ${p.x.toFixed(3)} · Y ${p.y.toFixed(3)} m`;
    if (!drag) return;
    if (drag.type === "pan") {
      const scale = $("editorSvg").getScreenCTM().a;
      camera.x = drag.camera.x - (event.clientX - drag.clientX) / scale;
      camera.y = drag.camera.y - (event.clientY - drag.clientY) / scale;
      applyCamera();
      return;
    }
    const dx = round(p.x - drag.start.x),
      dy = round(p.y - drag.start.y);
    if (!dx && !dy && !drag.moved) return;
    const before = drag.snapshot[drag.kind].find((v) => v.id === drag.id),
      item = draft[drag.kind].find((v) => v.id === drag.id);
    item.x = round(before.x + dx);
    item.y = round(before.y + dy);
    if (drag.kind === "points")
      draft.stations.forEach((s) => {
        if (s.pointId === item.id) {
          const old = drag.snapshot.stations.find((v) => v.id === s.id);
          s.x = round(old.x + dx);
          s.y = round(old.y + dy);
        }
      });
    drag.moved = true;
    changed();
  });
  function finishDrag(cancel) {
    if (!drag) return;
    if (drag.type === "object" && drag.moved) {
      if (cancel) draft = drag.snapshot;
      else {
        undo.push(drag.snapshot);
        if (undo.length > 60) undo.shift();
        redo = [];
        dirty = true;
      }
    }
    drag = null;
    render();
  }
  $("editorSvg").addEventListener("pointerup", () => finishDrag(false));
  $("editorSvg").addEventListener("pointercancel", () => finishDrag(true));
  $("editorSvg").addEventListener("keydown", (event) => {
    const el = event.target.closest("[data-kind]");
    if (el && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      activate(el.dataset.kind, el.dataset.id);
    }
  });
  $("editorZoomIn").onclick = () => {
    zoom(0.8);
    render();
  };
  $("editorZoomOut").onclick = () => {
    zoom(1.25);
    render();
  };
  $("editorFit").onclick = () => {
    fit();
    render();
  };
  $("showObjects").onclick = () => $("objectSidebar").classList.add("open");
  $("closeObjects").onclick = () => $("objectSidebar").classList.remove("open");
  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input,select,textarea,dialog") || busy) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      travel(event.shiftKey ? redo : undo, event.shiftKey ? undo : redo);
    } else if ((event.ctrlKey || event.metaKey) && key === "s") {
      event.preventDefault();
      $("saveDraft").click();
    } else if (key === "delete" || key === "backspace") {
      event.preventDefault();
      removeSelected();
    } else if (key === "escape") {
      selected = null;
      setTool("select");
    } else if (
      !(event.ctrlKey || event.metaKey || event.altKey) &&
      { v: "select", p: "point", l: "path", s: "station" }[key]
    )
      setTool({ v: "select", p: "point", l: "path", s: "station" }[key]);
  });
  window.addEventListener("beforeunload", (event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  root.PortalUpdates?.addGuard('map-editor',()=>dirty?'地图编辑器有未保存修改，请先保存或明确放弃修改，再更新。':busy?'地图编辑器正在处理，请等待完成后再更新。':root.PortalUpdates.apiBlocker(api));
  root.PortalUpdates?.ready();
  render();
  run(async () => {
    const value = await api.request("map-background");
    defaultBackground = value.available ? value.map : null;
    if (defaultBackground && !dirty && !identifier && !draft.rasterId) {
      Object.assign(draft, {
        name: defaultBackground.name,
        mapId: defaultBackground.mapId,
        rasterId: defaultBackground.id,
      });
      await loadRaster();
      fit();
      render();
    }
  }).finally(() => { sessionReady = true; api.watchPortalSession(); });
  const embeddedWorkspace=new URL(location.href).searchParams.get('embedded')==='1'&&parent!==window;
  function leaveWorkspace(){if(!discard())return;if(embeddedWorkspace)parent.postMessage({type:'fleet-editor-close'},location.origin);else location.href='./#/maps';}
  document.querySelectorAll('a[href="./#/maps"]').forEach(a=>a.onclick=e=>{e.preventDefault();leaveWorkspace();});
  window.addEventListener('message',e=>{if(!embeddedWorkspace||e.origin!==location.origin||e.source!==parent)return;if(e.data?.type==='fleet-editor-close-request')leaveWorkspace();});
  // Localized file controls; retain native file handles and all existing import validation.
  for(const input of document.querySelectorAll('#yamlFile,#rasterFile')){
    const field=input.parentElement,button=document.createElement('button'),status=document.createElement('span');
    button.type='button';button.className='button file-choose';button.textContent='选择文件';button.setAttribute('aria-label','选择'+field.textContent.trim());
    status.className='file-selection';status.textContent='尚未选择文件';status.setAttribute('aria-live','polite');input.hidden=true;input.required=false;
    button.onclick=event=>{event.preventDefault();input.click();};input.addEventListener('change',()=>{status.textContent=input.files?.length?Array.from(input.files).map(file=>file.name).join('、'):'尚未选择文件';});field.append(button,status);
  }
})(globalThis);
