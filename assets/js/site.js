// Mon Group site behaviour: nav, service tabs, in-view video playback, lead form.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  $$("[data-year]").forEach((el) => { el.textContent = String(new Date().getFullYear()); });

  // Sticky header hairline once the page scrolls.
  const header = $(".site-header");
  if (header) {
    const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // Mobile menu.
  const toggle = $(".nav-toggle");
  if (toggle) {
    const nav = toggle.closest(".nav");
    const setOpen = (open) => {
      nav.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    toggle.addEventListener("click", () => setOpen(!nav.classList.contains("nav-open")));
    $$(".nav-links a", nav).forEach((a) => a.addEventListener("click", () => setOpen(false)));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  }

  // Videos play only while on screen, and never for people who asked for less motion.
  const videos = $$("video[data-autoplay]");
  if (!reduceMotion && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting && target.offsetParent !== null) {
          const p = target.play();
          if (p && p.catch) p.catch(() => {});
        } else {
          target.pause();
        }
      });
    }, { rootMargin: "120px 0px", threshold: 0.15 });
    videos.forEach((v) => io.observe(v));
    window.__mgVideoObserver = io;
  }

  // Report numbers count up each time their panel is shown.
  const countUp = (root) => {
    $$("[data-count]", root).forEach((el) => {
      const to = parseFloat(el.dataset.count);
      const dec = Number(el.dataset.decimals || 0);
      const fmt = (v) => `${el.dataset.prefix || ""}${v.toFixed(dec)}${el.dataset.suffix || ""}`;
      if (reduceMotion) { el.textContent = fmt(to); return; }
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 1100);
        el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  };

  // Service tabs.
  const tabs = $$(".svc-tab");
  if (tabs.length) {
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        const desc = $(`.svc-desc[data-for="${t.id}"]`);
        if (desc) desc.hidden = !on;
        const panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) {
          panel.classList.toggle("active", on);
          $$("video", panel).forEach((v) => {
            if (on && !reduceMotion) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else { v.pause(); }
          });
          if (on) countUp(panel);
        }
      });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(tab, false));
      tab.addEventListener("keydown", (e) => {
        const next = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (next) { e.preventDefault(); select(tabs[(i + next + tabs.length) % tabs.length], true); }
        if (e.key === "Home") { e.preventDefault(); select(tabs[0], true); }
        if (e.key === "End") { e.preventDefault(); select(tabs[tabs.length - 1], true); }
      });
    });
  }

  // Remember where a visitor came from so the lead form can carry it, even after they browse.
  const ATTR_KEY = "mg_attribution";
  try {
    const params = new URLSearchParams(location.search);
    const utm = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((k) => { if (params.get(k)) utm[k] = params.get(k); });
    const stored = JSON.parse(sessionStorage.getItem(ATTR_KEY) || "null");
    if (!stored) {
      sessionStorage.setItem(ATTR_KEY, JSON.stringify({ ...utm, landing_page: location.pathname + location.search, referrer: document.referrer || "" }));
    } else if (Object.keys(utm).length) {
      sessionStorage.setItem(ATTR_KEY, JSON.stringify({ ...stored, ...utm }));
    }
  } catch (_) { /* storage blocked: attribution is optional */ }

  const form = $("#contact-form");
  if (!form) return;

  const card = form.closest(".form-card");
  const status = $(".form-status", form);
  const submit = $(".form-submit", form);
  const referredField = $("#referred-field");
  const heard = $("#heard_from");
  const startedAt = Date.now();

  try {
    const attr = JSON.parse(sessionStorage.getItem(ATTR_KEY) || "{}");
    Object.entries(attr).forEach(([k, v]) => { const input = form.elements.namedItem(k); if (input) input.value = v; });
  } catch (_) { /* ignore */ }

  heard.addEventListener("change", () => { referredField.hidden = heard.value !== "Referral"; });

  const FREE_MAIL = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com", "hotmail.com", "hotmail.co.uk",
    "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
    "pm.me", "gmx.com", "gmx.net", "mail.com", "zoho.com", "yandex.com", "yandex.ru", "hey.com", "fastmail.com", "tutanota.com",
  ]);
  const emailOk = (v) => {
    const m = /^[^\s@]+@([^\s@]+\.[^\s@]{2,})$/.exec(v.trim().toLowerCase());
    return Boolean(m) && !FREE_MAIL.has(m[1]);
  };
  const websiteOk = (v) => /^(https?:\/\/)?[^\s/$.?#][^\s]*\.[a-z]{2,}(\/\S*)?$/i.test(v.trim());

  const checks = {
    full_name: (v) => v.trim().length >= 2,
    email: emailOk,
    website: websiteOk,
    ad_spend: (v) => v !== "",
    help_with: (v) => v !== "",
  };

  const validate = (name) => {
    const input = form.elements.namedItem(name);
    const ok = checks[name](input.value);
    input.closest(".field").classList.toggle("invalid", !ok);
    input.setAttribute("aria-invalid", String(!ok));
    return ok;
  };
  Object.keys(checks).forEach((name) => {
    const input = form.elements.namedItem(name);
    input.addEventListener("blur", () => { if (input.value) validate(name); });
    input.addEventListener("change", () => { if (input.closest(".field").classList.contains("invalid")) validate(name); });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "";
    const bad = Object.keys(checks).filter((name) => !validate(name));
    if (bad.length) {
      form.elements.namedItem(bad[0]).focus();
      status.textContent = "Please fix the highlighted fields.";
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    data.elapsed_ms = Date.now() - startedAt;
    data.page = location.href;

    submit.disabled = true;
    const label = submit.innerHTML;
    submit.textContent = "Sending…";
    try {
      const res = await fetch(form.dataset.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const first = String(data.full_name || "").trim().split(/\s+/)[0];
      const slot = $("[data-first-name]", card);
      if (slot && first) slot.textContent = `, ${first}`;
      card.classList.add("sent");
      const done = $(".form-done", card);
      if (done) done.focus();
      try { sessionStorage.removeItem(ATTR_KEY); } catch (_) { /* ignore */ }
    } catch (err) {
      submit.disabled = false;
      submit.innerHTML = label;
      status.innerHTML = 'Something went wrong sending the form. Please try again, or email <a href="mailto:cyrus@mon.group">cyrus@mon.group</a>.';
    }
  });
})();
