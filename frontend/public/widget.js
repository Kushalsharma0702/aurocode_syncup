/*
 * SyncUp feedback widget.
 * Embed with:
 *   <script src="https://your-syncup-host/widget.js" data-project="KEY" data-api="https://your-syncup-host/api" async></script>
 *
 * Self-contained, no build step, no dependencies until a report is actually
 * started (html2canvas is then pulled from a CDN on demand).
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

  var HTML2CANVAS_URL = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
  var PREFIX = "su-fb-";

  var state = { picking: false, pin: null };

  // ---- styles (scoped by prefix, isolated from the host page) ----
  var style = document.createElement("style");
  style.textContent = "" +
    "." + PREFIX + "btn{position:fixed;bottom:20px;right:20px;z-index:2147483000;" +
      "background:#171923;color:#fff;border:none;border-radius:999px;padding:10px 16px;" +
      "font:600 13px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
      "box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer;display:flex;align-items:center;gap:6px;}" +
    "." + PREFIX + "btn:hover{background:#2d3142;}" +
    "." + PREFIX + "btn.picking{background:#c53030;}" +
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
      "padding:10px 16px;border-radius:8px;font:13px -apple-system,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);}" +
    "." + PREFIX + "hint{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483001;" +
      "background:#171923;color:#fff;padding:8px 16px;border-radius:999px;font:13px -apple-system,sans-serif;}";
  document.head.appendChild(style);

  // ---- floating launcher button ----
  var btn = document.createElement("button");
  btn.className = PREFIX + "btn";
  btn.type = "button";
  btn.textContent = "💬 Feedback";
  btn.addEventListener("click", function () {
    if (state.picking) {
      stopPicking();
    } else {
      startPicking();
    }
  });
  if (document.body) {
    document.body.appendChild(btn);
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      document.body.appendChild(btn);
    });
  }

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
    if (e.target === btn) return;
    e.preventDefault();
    e.stopPropagation();
    var xPercent = (e.pageX / Math.max(document.documentElement.scrollWidth, 1)) * 100;
    var yPercent = (e.pageY / Math.max(document.documentElement.scrollHeight, 1)) * 100;
    stopPicking();
    showPin(e.pageX, e.pageY);
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
    var overlay = document.createElement("div");
    overlay.className = PREFIX + "overlay";
    overlay.innerHTML =
      "<div class='" + PREFIX + "card'>" +
        "<h3>What's the issue?</h3>" +
        "<p class='sub'>A screenshot of this page is attached automatically.</p>" +
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

    function close() {
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
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
      captureScreenshot(function (blob) {
        submitFeedback({
          message: message,
          name: nameInput.value.trim(),
          x: xPercent,
          y: yPercent,
        }, blob, function (ok) {
          close();
          showToast(ok ? "Feedback sent — thank you!" : "Couldn't send feedback. Please try again.");
        });
      });
    });
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
        window.html2canvas(document.body, { logging: false, useCORS: true, scale: 1 })
          .then(function (canvas) { canvas.toBlob(function (blob) { callback(blob); }, "image/png", 0.7); })
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

    fetch(apiBase + "/public/widget/" + encodeURIComponent(projectKey) + "/feedback", {
      method: "POST",
      body: fd,
    })
      .then(function (res) { done(res.ok); })
      .catch(function () { done(false); });
  }

  function showToast(text) {
    var toast = document.createElement("div");
    toast.className = PREFIX + "toast";
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 3500);
  }
})();
