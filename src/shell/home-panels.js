/*
 * Home page side column: the exception list and the task queue.
 * Pure rendering from data that app.js already holds; no requests here.
 * Buttons carry data-confirm-robot (operator confirms station work) or
 * data-ack-alert (operator acknowledges an alert); app.js handles the clicks.
 */
(function (root) {
  "use strict";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const disabledAttr = (reason) => ` disabled title="${esc(reason)}"`;
  function confirmButton(confirm, canOperate) {
    if (!confirm) return "";
    return `<button type="button" class="button button-primary button-small" data-confirm-robot="${esc(confirm.robotId)}"${canOperate ? "" : disabledAttr("登录后可确认")}>${esc(confirm.label)}</button>`;
  }

  function attentionMarkup(items, { canOperate = false } = {}) {
    if (!items.length) return '<li class="attention-empty">一切正常</li>';
    return items.map((item) => {
      const action = item.confirm ? confirmButton(item.confirm, canOperate)
        : item.id && !item.acknowledged ? `<button type="button" class="button button-quiet button-small" data-ack-alert="${esc(item.id)}"${canOperate ? "" : disabledAttr("登录后可操作")}>知道了</button>`
        : item.route ? `<a href="#/${esc(item.route)}">查看</a>` : "";
      return `<li class="attention-item ${item.level === "alert" ? "is-alert" : "is-warn"}${item.acknowledged ? " is-acknowledged" : ""}"><i aria-hidden="true"></i>` +
        `<span>${item.vehicle ? `<strong>${esc(item.vehicle)}</strong> ` : ""}${esc(item.text)}` +
        `${item.detail ? `<small>${esc(item.detail)}</small>` : ""}</span>${action}</li>`;
    }).join("");
  }

  function taskMarkup(row, formatTime, { canOperate = false } = {}) {
    const time = row.active ? formatTime(row.created) : formatTime(row.finished || row.created);
    return `<li class="task-row tone-${esc(row.tone)}" title="${esc(row.id)}">` +
      `<span class="task-vehicle">${esc(row.vehicle)}</span>` +
      `<span class="task-main"><strong>${esc(row.to)}</strong><small>${esc(row.detail)}</small></span>` +
      (row.confirm ? confirmButton(row.confirm, canOperate)
        : row.cancel ? `<button type="button" class="button button-quiet button-small" data-cancel-queue="${esc(row.cancel.orderId)}"${canOperate ? "" : disabledAttr("登录后可操作")}>撤销排队</button>`
        : `<time>${esc(time)}</time>`) +
      `<details class="task-raw eng-only"><summary>详情</summary><code>${esc(row.id)}</code></details></li>`;
  }

  function render({ document = root.document, items = [], queue = { active: [], recent: [] }, formatTime, canOperate = false }) {
    const $ = (id) => document.getElementById(id);
    if (!$("attentionList")) return;
    const open = items.filter((i) => !i.acknowledged);
    const alerts = open.filter((i) => i.level === "alert").length;
    const level = alerts ? "alert" : open.length ? "warn" : "ok";
    $("attentionList").innerHTML = attentionMarkup(items, { canOperate });
    $("attentionCount").textContent = String(open.length);
    $("attentionCount").dataset.level = level;
    $("attentionPanel").dataset.level = level;
    const nav = $("alertNavCount");
    if (nav) { nav.textContent = String(open.length); nav.hidden = !open.length; nav.dataset.level = level; }
    $("taskQueue").innerHTML = queue.active.length
      ? queue.active.map((row) => taskMarkup(row, formatTime, { canOperate })).join("")
      : '<li class="task-empty">没有进行中的任务</li>';
    $("taskRecentTitle").hidden = !queue.recent.length;
    $("taskRecent").innerHTML = queue.recent.map((row) => taskMarkup(row, formatTime)).join("");
  }

  const api = { render, attentionMarkup, taskMarkup };
  root.HomePanels = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
