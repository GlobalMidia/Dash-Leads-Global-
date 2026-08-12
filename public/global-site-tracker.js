(function () {
  "use strict";

  if (window.__globalMidiaSiteTracker) return;
  window.__globalMidiaSiteTracker = true;

  var currentScript = document.currentScript;
  var endpoint =
    (currentScript && currentScript.getAttribute("data-site-tracking-endpoint")) ||
    "https://dash-leads-global.vercel.app/api/site-tracking";
  var visitorKey = "gm_site_visitor_id";
  var sessionKey = "gm_site_session";
  var attributionKey = "gm_site_attribution";
  var sessionDuration = 30 * 60 * 1000;
  var queue = [];
  var sentNames = {};
  var flushTimer = null;
  var identity = null;

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, function (char) {
      return (Number(char) ^ (window.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(char) / 4)))).toString(16);
    });
  }

  function readJson(storage, key) {
    try { return JSON.parse(storage.getItem(key) || "null"); } catch { return null; }
  }

  function safeUrl(value) {
    if (!value) return "";
    try {
      var parsed = new URL(value, window.location.href);
      return parsed.origin + parsed.pathname.replace(/\/+$/, "") + (parsed.hash || "");
    } catch { return window.location.origin + window.location.pathname; }
  }

  function valueOf(name) {
    return new URLSearchParams(window.location.search).get(name) || "";
  }

  var visitorId = localStorage.getItem(visitorKey) || uuid();
  localStorage.setItem(visitorKey, visitorId);

  var storedSession = readJson(sessionStorage, sessionKey);
  var now = Date.now();
  if (!storedSession || !storedSession.id || now - Number(storedSession.lastSeenAt || 0) > sessionDuration) {
    storedSession = { id: uuid(), startedAt: new Date().toISOString(), lastSeenAt: now };
  }
  storedSession.lastSeenAt = now;
  sessionStorage.setItem(sessionKey, JSON.stringify(storedSession));

  var capturedAttribution = {
    source: valueOf("utm_source"),
    medium: valueOf("utm_medium"),
    campaign: valueOf("utm_campaign"),
    content: valueOf("utm_content"),
    term: valueOf("utm_term"),
    gclid: valueOf("gclid"),
    fbclid: valueOf("fbclid")
  };
  var storedAttribution = readJson(localStorage, attributionKey) || {};
  var hasNewAttribution = Object.keys(capturedAttribution).some(function (key) { return capturedAttribution[key]; });
  var attribution = hasNewAttribution ? capturedAttribution : storedAttribution;
  if (hasNewAttribution) localStorage.setItem(attributionKey, JSON.stringify(attribution));
  var landingPage = safeUrl(window.location.href);

  function stringData(data) {
    var result = {};
    Object.keys(data || {}).forEach(function (key) {
      if (data[key] != null && data[key] !== "") result[key] = String(data[key]).slice(0, 500);
    });
    return result;
  }

  function event(name, data, once) {
    if (once && sentNames[name]) return;
    if (once) sentNames[name] = true;
    queue.push({
      id: uuid(),
      name: name,
      occurredAt: new Date().toISOString(),
      pageUrl: safeUrl(window.location.href),
      pageTitle: document.title.slice(0, 300),
      referrer: safeUrl(document.referrer || ""),
      data: stringData(data)
    });
    if (queue.length >= 10 || name === "form_submit") flush();
    else scheduleFlush();
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = window.setTimeout(flush, 5000);
  }

  function flush() {
    if (flushTimer) window.clearTimeout(flushTimer);
    flushTimer = null;
    if (!queue.length) return;
    var events = queue.splice(0, 25);
    var payload = {
      visitorId: visitorId,
      sessionId: storedSession.id,
      sessionStartedAt: storedSession.startedAt,
      attribution: attribution,
      landingPage: landingPage,
      events: events
    };
    if (identity) payload.identity = identity;
    fetch(endpoint, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(function () {
      queue = events.concat(queue).slice(0, 50);
    });
    if (queue.length) scheduleFlush();
  }

  function fieldValue(form, selectors) {
    for (var index = 0; index < selectors.length; index += 1) {
      var field = form.querySelector(selectors[index]);
      if (field && field.value) return String(field.value).trim();
    }
    return "";
  }

  function fieldValueByLabel(form, pattern) {
    var labels = form.querySelectorAll("label");
    for (var index = 0; index < labels.length; index += 1) {
      if (!pattern.test(labels[index].textContent || "")) continue;
      var field = labels[index].querySelector("input,textarea") ||
        (labels[index].htmlFor && document.getElementById(labels[index].htmlFor));
      if (field && field.value) return String(field.value).trim();
    }
    return "";
  }

  function formIdentity(form) {
    return {
      name: fieldValue(form, ['input[name*="name" i]', 'input[autocomplete="name"]']) || fieldValueByLabel(form, /nome/i),
      email: fieldValue(form, ['input[type="email"]', 'input[name*="email" i]']),
      phone: fieldValue(form, ['input[type="tel"]', 'input[name*="phone" i]', 'input[name*="telefone" i]']),
      company: fieldValue(form, ['input[name*="company" i]', 'input[name*="empresa" i]']) || fieldValueByLabel(form, /empresa|negócio|negocio/i)
    };
  }

  document.addEventListener("focusin", function (browserEvent) {
    var form = browserEvent.target && browserEvent.target.closest && browserEvent.target.closest("form");
    if (form) event("form_start", { formId: form.id || "", formName: form.getAttribute("data-formid") || "" }, true);
  }, true);

  document.addEventListener("submit", function (browserEvent) {
    var form = browserEvent.target;
    if (!form || form.tagName !== "FORM") return;
    identity = formIdentity(form);
    event("form_submit", { formId: form.id || "", formName: form.getAttribute("data-formid") || "" }, false);
  }, true);

  document.addEventListener("click", function (browserEvent) {
    var target = browserEvent.target && browserEvent.target.closest && browserEvent.target.closest("a,button");
    if (!target) return;
    var href = target.getAttribute("href") || "";
    var label = (target.textContent || target.getAttribute("aria-label") || "").trim().slice(0, 160);
    if (/wa\.me|whatsapp\.com|api\.whatsapp/i.test(href)) {
      event("whatsapp_click", { label: label, destination: safeUrl(href) }, false);
    } else if (href || target.tagName === "BUTTON") {
      event("cta_click", { label: label, destination: safeUrl(href) }, false);
    }
  }, true);

  document.addEventListener("play", function (browserEvent) {
    if (browserEvent.target && browserEvent.target.tagName === "VIDEO") event("video_start", {}, true);
  }, true);
  document.addEventListener("timeupdate", function (browserEvent) {
    var video = browserEvent.target;
    if (video && video.tagName === "VIDEO" && video.duration && video.currentTime / video.duration >= 0.5) {
      event("video_progress_50", {}, true);
    }
  }, true);
  document.addEventListener("ended", function (browserEvent) {
    if (browserEvent.target && browserEvent.target.tagName === "VIDEO") event("video_complete", {}, true);
  }, true);

  var forms = document.querySelectorAll("form");
  if (forms.length) event("form_view", { forms: forms.length }, true);
  event("page_view", {}, false);
  window.setTimeout(function () { event("engagement_30", {}, true); }, 30000);
  window.setTimeout(function () { event("engagement_60", {}, true); }, 60000);

  window.addEventListener("scroll", function () {
    var available = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    var progress = window.scrollY / available;
    if (progress >= 0.5) event("scroll_50", {}, true);
    if (progress >= 0.9) event("scroll_90", {}, true);
  }, { passive: true });

  window.addEventListener("pagehide", flush);
  window.GlobalMidiaTracker = { track: event, flush: flush, visitorId: visitorId };
})();
