/*
 * SyncUp feedback widget.
 * Embed with:
 *   <script src="https://your-syncup-host/widget.js" data-project="KEY" data-api="https://your-syncup-host/api" async></script>
 *
 * Self-contained and dependency-free until a report is actually started, at
 * which point html2canvas is loaded from the SyncUp host that served this
 * script — never from a third-party CDN, so embedding the widget doesn't hand
 * a stranger script-execution rights on the client's site.
 */
(function () {
  "use strict";

  var scriptEl = document.currentScript;
  if (!scriptEl) return;

  var projectKey = scriptEl.getAttribute("data-project");
  var apiBase = scriptEl.getAttribute("data-api") || "/api";
  if (!projectKey) {
    console.error("[syncup-widget] missing data-project attribute");
    return;
  }

  // Resolved against this script's own URL so it follows the host it came from.
  var HTML2CANVAS_URL = new URL("vendor/html2canvas.min.js", scriptEl.src).href;
  var PREFIX = "su-fb-";
  var MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

  var state = { picking: false, pin: null, formOpen: false };

  function api(path) {
    return apiBase.replace(/\/$/, "") + "/public/widget/" + encodeURIComponent(projectKey) + path;
  }

  // Fire-and-forget funnel telemetry. Never blocks or surfaces errors.
  function track(event, extra) {
    try {
      var fd = new FormData();
      fd.append("event", event);
      fd.append("page_url", location.href);
      if (extra) Object.keys(extra).forEach(function (k) { fd.append(k, extra[k]); });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(api("/event"), fd);
      } else {
        fetch(api("/event"), { method: "POST", body: fd, keepalive: true }).catch(function () {});
      }
    } catch (err) { /* telemetry must never break the page */ }
  }

  // ---- styles (scoped by prefix, isolated from the host page) ----
  var style = document.createElement("style");
  style.textContent = "" +
    "." + PREFIX + "bar{position:fixed;bottom:20px;right:20px;z-index:2147483000;display:flex;gap:8px;" +
      "font:600 13px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}" +
    "." + PREFIX + "btn{background:#171923;color:#fff;border:none;border-radius:999px;padding:10px 16px;" +
      "font:inherit;box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer;display:flex;align-items:center;gap:6px;}" +
    "." + PREFIX + "btn:hover{background:#2d3142;}" +
    "." + PREFIX + "btn.picking{background:#c53030;}" +
    "." + PREFIX + "btn.ghost{background:#fff;color:#171923;border:1px solid #d7d9e0;}" +
    "." + PREFIX + "btn.ghost:hover{background:#f4f5f7;}" +
    "." + PREFIX + "btn:disabled{opacity:.6;cursor:default;}" +
    "." + PREFIX + "pin{position:absolute;z-index:2147483001;width:22px;height:22px;margin:-22px 0 0 -11px;" +
      "border-radius:50% 50% 50% 0;background:#e53e3e;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);" +
      "transform:rotate(-45deg);}" +
    "." + PREFIX + "overlay{position:fixed;inset:0;z-index:2147483002;background:rgba(15,17,23,.45);" +
      "display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}" +
    "." + PREFIX + "card{background:#fff;color:#171923;width:340px;max-width:92vw;border-radius:12px;" +
      "padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.3);}" +
    "." + PREFIX + "card h3{margin:0 0 4px;font-size:15px;}" +
    "." + PREFIX + "card p.sub{margin:0 0 12px;font-size:12px;color:#666;}" +
    "." + PREFIX + "card textarea{width:100%;box-sizing:border-box;border:1px solid #d7d9e0;border-radius:8px;" +
      "padding:8px 10px;font:13px/1.4 inherit;resize:vertical;min-height:70px;}" +
    "." + PREFIX + "card input[type=text]{width:100%;box-sizing:border-box;border:1px solid #d7d9e0;" +
      "border-radius:8px;padding:8px 10px;font:13px inherit;margin-top:8px;}" +
    "." + PREFIX + "card .row{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;}" +
    "." + PREFIX + "card button{font:600 13px inherit;border-radius:8px;padding:8px 14px;cursor:pointer;border:none;}" +
    "." + PREFIX + "card .cancel{background:#f0f1f4;color:#333;}" +
    "." + PREFIX + "card .submit{background:#171923;color:#fff;}" +
    "." + PREFIX + "card .submit:disabled{opacity:.6;cursor:default;}" +
    "." + PREFIX + "toast{position:fixed;bottom:20px;right:20px;z-index:2147483003;background:#171923;color:#fff;" +
      "padding:12px 16px;border-radius:8px;max-width:300px;" +
      "font:13px/1.45 -apple-system,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);}" +
    "." + PREFIX + "hint{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483001;" +
      "background:#171923;color:#fff;padding:8px 16px;border-radius:999px;font:13px -apple-system,sans-serif;}";
  document.head.appendChild(style);

  // ---- floating launcher ----
  var bar = document.createElement("div");
  bar.className = PREFIX + "bar";

  var btn = document.createElement("button");
  btn.className = PREFIX + "btn";
  btn.type = "button";
  btn.textContent = "💬 Feedback";
  btn.addEventListener("click", function () {
    if (state.picking) {
      stopPicking();
    } else {
      track("widget_opened");
      startPicking();
    }
  });

  // A reason to open the widget when nothing is wrong.
  var approveBtn = document.createElement("button");
  approveBtn.className = PREFIX + "btn ghost";
  approveBtn.type = "button";
  approveBtn.textContent = "👍 Looks good";
  approveBtn.addEventListener("click", function () {
    approveBtn.disabled = true;
    var fd = new FormData();
    fd.append("page_url", location.href);
    fd.append("reporter_name", localStorage.getItem(PREFIX + "name") || "");
    fetch(api("/approve"), { method: "POST", body: fd })
      .then(function (res) {
        showToast(res.ok ? "Thanks — we've noted this page looks good." : "Couldn't record that. Please try again.");
        if (!res.ok) approveBtn.disabled = false;
      })
      .catch(function () {
        showToast("Couldn't record that. Please try again.");
        approveBtn.disabled = false;
      });
  });

  bar.appendChild(approveBtn);
  bar.appendChild(btn);

  function mount() { document.body.appendChild(bar); }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  var hintEl = null;

  function startPicking() {
    state.picking = true;
    btn.classList.add("picking");
    btn.textContent = "✕ Cancel";
    document.body.style.cursor = "crosshair";
    hintEl = document.createElement("div");
    hintEl.className = PREFIX + "hint";
    hintEl.textContent = "Click anything on the page to attach feedback to it";
    document.body.appendChild(hintEl);
    document.addEventListener("click", onPagePick, true);
  }

  function stopPicking() {
    state.picking = false;
    btn.classList.remove("picking");
    btn.textContent = "💬 Feedback";
    document.body.style.cursor = "";
    document.removeEventListener("click", onPagePick, true);
    if (hintEl) { hintEl.remove(); hintEl = null; }
  }

  function onPagePick(e) {
    if (bar.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    var xPercent = (e.pageX / Math.max(document.documentElement.scrollWidth, 1)) * 100;
    var yPercent = (e.pageY / Math.max(document.documentElement.scrollHeight, 1)) * 100;
    stopPicking();
    showPin(e.pageX, e.pageY);
    track("pin_started");
    openForm(xPercent, yPercent);
  }

  function showPin(pageX, pageY) {
    var pin = document.createElement("div");
    pin.className = PREFIX + "pin";
    pin.style.left = pageX + "px";
    pin.style.top = pageY + "px";
    document.body.appendChild(pin);
    state.pin = pin;
  }

  function clearPin() {
    if (state.pin) { state.pin.remove(); state.pin = null; }
  }

  function openForm(xPercent, yPercent) {
    state.formOpen = true;
    var submitted = false;

    var overlay = document.createElement("div");
    overlay.className = PREFIX + "overlay";
    overlay.innerHTML =
      "<div class='" + PREFIX + "card'>" +
        "<h3>What's the issue?</h3>" +
        "<p class='sub'>A screenshot of this page is attached automatically. " +
          "Anything you've typed into the page is blanked out first.</p>" +
        "<textarea placeholder='Describe what you see…' autofocus></textarea>" +
        "<input type='text' placeholder='Your name (optional)' />" +
        "<div class='row'>" +
          "<button type='button' class='cancel'>Cancel</button>" +
          "<button type='button' class='submit'>Send feedback</button>" +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    var textarea = overlay.querySelector("textarea");
    var nameInput = overlay.querySelector("input");
    var submitBtn = overlay.querySelector(".submit");
    var cancelBtn = overlay.querySelector(".cancel");

    nameInput.value = localStorage.getItem(PREFIX + "name") || "";

    function close() {
      state.formOpen = false;
      if (!submitted) track("pin_abandoned");
      overlay.remove();
      clearPin();
    }

    cancelBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });

    submitBtn.addEventListener("click", function () {
      var message = textarea.value.trim();
      if (!message) {
        textarea.focus();
        return;
      }
      submitted = true;
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
      try { localStorage.setItem(PREFIX + "name", nameInput.value.trim()); } catch (err) {}

      captureScreenshot(function (blob) {
        submitFeedback({
          message: message,
          name: nameInput.value.trim(),
          x: xPercent,
          y: yPercent,
        }, blob, function (ok, data) {
          close();
          if (ok && data && data.update_by) {
            showToast("Received — we'll update you by " + formatDate(data.update_by) + ".");
          } else if (ok) {
            showToast("Received — thank you!");
          } else {
            showToast("Couldn't send feedback. Please try again.");
          }
        });
      });
    });
  }

  function formatDate(iso) {
    try {
      return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" });
    } catch (err) {
      return iso;
    }
  }

  /* Blank out anything the visitor has typed before rasterising. Screenshots of
     a client's own site routinely contain live form data, so the default is to
     capture the layout, not the contents. */
  function maskInputs(doc) {
    var fields = doc.querySelectorAll("input, textarea, select");
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var type = (f.getAttribute("type") || "").toLowerCase();
      if (type === "checkbox" || type === "radio" || type === "button" || type === "submit") continue;
      if (f.value) f.value = "•".repeat(Math.min(String(f.value).length, 12));
      f.setAttribute("placeholder", "");
    }
    // Anything the host site marks as sensitive is blanked wholesale.
    var redact = doc.querySelectorAll("[data-syncup-redact], .syncup-redact");
    for (var j = 0; j < redact.length; j++) {
      redact[j].style.filter = "blur(10px)";
    }
  }

  function captureScreenshot(callback) {
    if (window.html2canvas) return render();
    var s = document.createElement("script");
    s.src = HTML2CANVAS_URL;
    s.onload = render;
    s.onerror = function () { callback(null); };
    document.head.appendChild(s);

    function render() {
      try {
        window.html2canvas(document.body, {
          logging: false,
          useCORS: true,
          scale: 1,
          ignoreElements: function (el) { return el === bar || el === hintEl; },
          onclone: function (clonedDoc) { maskInputs(clonedDoc); },
        })
          .then(function (canvas) {
            canvas.toBlob(function (blob) {
              if (blob && blob.size > MAX_SCREENSHOT_BYTES) return callback(null);
              callback(blob);
            }, "image/png");
          })
          .catch(function () { callback(null); });
      } catch (err) {
        callback(null);
      }
    }
  }

  function submitFeedback(data, screenshotBlob, done) {
    var fd = new FormData();
    fd.append("message", data.message);
    fd.append("page_url", location.href);
    fd.append("pin_x", String(data.x));
    fd.append("pin_y", String(data.y));
    fd.append("reporter_name", data.name || "");
    fd.append("browser_info", navigator.userAgent);
    if (screenshotBlob) fd.append("screenshot", screenshotBlob, "screenshot.png");

    fetch(api("/feedback"), { method: "POST", body: fd })
      .then(function (res) {
        if (!res.ok) return done(false, null);
        return res.json().then(function (body) { done(true, body); }).catch(function () { done(true, null); });
      })
      .catch(function () { done(false, null); });
  }

  function showToast(text) {
    var toast = document.createElement("div");
    toast.className = PREFIX + "toast";
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 4500);
  }
})();
