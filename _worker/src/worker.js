// Lead form backend for www.mon.group.
// POST /lead (JSON) from the contact page: validate, save to KV, email the lead to MAIL_TO via Resend.
// A lead is stored before the email is attempted, so a mail failure never loses one.

const SITE_ORIGINS = ["https://www.mon.group", "https://mon.group"];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const MAX_BODY = 20_000;
const PER_IP_PER_HOUR = 8;

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com", "hotmail.com", "hotmail.co.uk",
  "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "pm.me", "gmx.com", "gmx.net", "mail.com", "zoho.com", "yandex.com", "yandex.ru", "hey.com", "fastmail.com", "tutanota.com",
]);

const FIELDS = {
  full_name: 120, email: 200, website: 200, ad_spend: 60, help_with: 80, heard_from: 60, referred_by: 120,
  details: 3000, utm_source: 200, utm_medium: 200, utm_campaign: 200, utm_content: 200, utm_term: 200,
  landing_page: 500, referrer: 500, page: 500,
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...(origin ? corsHeaders(origin) : {}) },
  });
}

function clean(raw) {
  const lead = {};
  for (const [key, max] of Object.entries(FIELDS)) {
    const v = raw[key];
    lead[key] = typeof v === "string" ? v.trim().slice(0, max) : "";
  }
  return lead;
}

function problems(lead) {
  const out = [];
  if (lead.full_name.length < 2) out.push("full_name");
  const m = /^[^\s@]+@([^\s@]+\.[^\s@]{2,})$/.exec(lead.email.toLowerCase());
  if (!m || FREE_MAIL.has(m[1])) out.push("email");
  if (!/^(https?:\/\/)?[^\s/$.?#][^\s]*\.[a-z]{2,}(\/\S*)?$/i.test(lead.website)) out.push("website");
  if (!lead.ad_spend) out.push("ad_spend");
  if (!lead.help_with) out.push("help_with");
  return out;
}

function emailHtml(lead, meta) {
  const row = (label, value) =>
    value
      ? `<tr><td style="padding:7px 14px 7px 0;color:#6b6a85;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:7px 0;color:#14132b">${esc(value)}</td></tr>`
      : "";
  const site = /^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`;
  return `<!doctype html><html><body style="margin:0;background:#f6f5fb;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:28px 20px">
<h1 style="font-size:20px;margin:0 0 6px;color:#14132b">New discovery call request</h1>
<p style="margin:0 0 20px;color:#55546f;font-size:14px">From the contact form on www.mon.group. Reply to this email to answer ${esc(lead.full_name)} directly.</p>
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:15px;line-height:1.45;background:#fff;border:1px solid #e6e4f0;border-radius:12px;width:100%">
<tbody><tr><td style="padding:16px 20px"><table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%">
${row("Name", lead.full_name)}
${row("Email", lead.email)}
<tr><td style="padding:7px 14px 7px 0;color:#6b6a85;white-space:nowrap">Website</td><td style="padding:7px 0"><a href="${esc(site)}" style="color:#e0620a">${esc(lead.website)}</a></td></tr>
${row("Monthly ad spend", lead.ad_spend)}
${row("Wants help with", lead.help_with)}
${row("Heard about us", lead.heard_from)}
${row("Referred by", lead.referred_by)}
${row("Details", lead.details)}
</table></td></tr></tbody></table>
<p style="margin:20px 0 6px;color:#6b6a85;font-size:12px">Attribution</p>
<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:12px;color:#55546f">
${row("utm_source", lead.utm_source)}${row("utm_medium", lead.utm_medium)}${row("utm_campaign", lead.utm_campaign)}${row("utm_content", lead.utm_content)}${row("utm_term", lead.utm_term)}
${row("Landing page", lead.landing_page)}${row("Referrer", lead.referrer)}${row("Country", meta.country)}${row("Received", meta.received_at)}${row("Lead id", meta.id)}
</table>
</div></body></html>`;
}

async function sendEmail(env, lead, meta) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  const company = lead.website.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [env.MAIL_TO],
      reply_to: lead.email,
      subject: `New lead: ${lead.full_name} (${company}), ${lead.ad_spend}/mo, ${lead.help_with}`,
      html: emailHtml(lead, meta),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = SITE_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin) ? origin : "";

    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname !== "/lead") return new Response("Not found", { status: 404 });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin || SITE_ORIGINS[0]) });
    }
    if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, allowedOrigin);
    if (!allowedOrigin) return json({ ok: false, error: "origin_not_allowed" }, 403, "");

    const text = await request.text();
    if (text.length > MAX_BODY) return json({ ok: false, error: "too_large" }, 413, allowedOrigin);
    let raw;
    try { raw = JSON.parse(text); } catch { return json({ ok: false, error: "bad_json" }, 400, allowedOrigin); }

    // Bots fill the hidden field or submit instantly. Tell them it worked and drop it.
    if ((typeof raw.company_fax === "string" && raw.company_fax.trim()) || Number(raw.elapsed_ms) < 2500) {
      return json({ ok: true }, 200, allowedOrigin);
    }

    const lead = clean(raw);
    const bad = problems(lead);
    if (bad.length) return json({ ok: false, error: "invalid", fields: bad }, 422, allowedOrigin);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const hour = new Date().toISOString().slice(0, 13);
    const rlKey = `rl:${ip}:${hour}`;
    const count = Number((await env.LEADS.get(rlKey)) || 0);
    if (count >= PER_IP_PER_HOUR) return json({ ok: false, error: "rate_limited" }, 429, allowedOrigin);
    await env.LEADS.put(rlKey, String(count + 1), { expirationTtl: 7200 });

    const received_at = new Date().toISOString();
    const id = `lead:${received_at}:${crypto.randomUUID().slice(0, 8)}`;
    const meta = { id, received_at, country: request.cf?.country || "", user_agent: request.headers.get("User-Agent") || "" };
    await env.LEADS.put(id, JSON.stringify({ ...lead, ...meta, emailed: false }));

    try {
      await sendEmail(env, lead, meta);
      await env.LEADS.put(id, JSON.stringify({ ...lead, ...meta, emailed: true }));
    } catch (err) {
      // The lead is saved; list it with `npm run leads` in _worker/ if the email never arrives.
      console.error("lead email failed", id, String(err));
    }
    return json({ ok: true }, 200, allowedOrigin);
  },
};
