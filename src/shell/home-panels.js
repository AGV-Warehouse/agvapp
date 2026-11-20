/*
 * Home page side column: the exception list and the task queue.
 * Pure rendering from data that app.js already holds; no requests here.
 */
(function (root) {
  "use strict";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function attentionMarkup(items) {
    if (!items.length) return '<li class="attention-empty">一切正常</li>';
    return items.map((item) =>
      `<li class="attention-item ${item.level === "alert" ? "is-alert" : "is-warn"}"><i aria-hidden="true"></i>` +
      `<span>${item.vehicle ? `<strong>${esc(item.vehicle)}</strong> ` : ""}${esc(item.text)}</span>` +
      (item.route ? `<a href="#/${esc(item.route)}">查看</a>` : "") + "</li>").join("");
  }

  function taskMarkup(row, formatTime) {
    const time = row.active ? formatTime(row.created) : formatTime(row.finished || row.created);
    return `<li class="task-row tone-${esc(row.tone)}" title="${esc(row.id)}">` +
      `<span class="task-vehicle">${esc(row.vehicle)}</span>` +
      `<span class="task-main"><strong>${esc(row.to)}</strong><small>${esc(row.detail)}</small></span>` +
      `<time>${esc(time)}</time>` +
      `<details class="task-raw eng-only"><summary>详情</summary><code>${esc(row.id)}</code></details></li>`;
  }

  function render({ document = root.document, items = [], queue = { active: [], recent: [] }, formatTime }) {
    const $ = (id) => document.getElementById(id);
    if (!$("attentionList")) return;
    const alerts = items.filter((i) => i.level === "alert").length;
    $("attentionList").innerHTML = attentionMarkup(items);
    $("attentionCount").textContent = String(items.length);
    $("attentionCount").dataset.level = alerts ? "alert" : items.length ? "warn" : "ok";
    $("attentionPanel").dataset.level = $("attentionCount").dataset.level;
    const nav = $("alertNavCount");
    if (nav) { nav.textContent = String(items.length); nav.hidden = !items.length; nav.dataset.level = $("attentionCount").dataset.level; }
    $("taskQueue").innerHTML = queue.active.length
      ? queue.active.map((row) => taskMarkup(row, formatTime)).join("")
      : '<li class="task-empty">没有进行中的任务</li>';
    $("taskRecentTitle").hidden = !queue.recent.length;
    $("taskRecent").innerHTML = queue.recent.map((row) => taskMarkup(row, formatTime)).join("");
  }

  const api = { render, attentionMarkup, taskMarkup };
  root.HomePanels = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
