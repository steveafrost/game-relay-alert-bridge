const MAX_SMS_BODY = 1200;

function env(name) {
  return process.env[name]?.trim();
}

function getSecretFromRequest(req) {
  const header = req.headers["x-alert-secret"];
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }

  const rawUrl = req.url || "";
  const url = new URL(rawUrl, `https://${req.headers.host || "localhost"}`);
  return url.searchParams.get("token")?.trim() || "";
}

function requireSharedSecret(req) {
  const expected = env("ALERT_SHARED_SECRET");
  if (!expected) {
    return { ok: false, status: 500, message: "ALERT_SHARED_SECRET is not configured" };
  }

  const actual = getSecretFromRequest(req);
  if (actual !== expected) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  return { ok: true };
}

function summarizeSlackPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const candidates = [];
  if (typeof payload.text === "string") {
    candidates.push(payload.text);
  }

  if (Array.isArray(payload.attachments)) {
    for (const attachment of payload.attachments) {
      if (typeof attachment?.title === "string") {
        candidates.push(attachment.title);
      }
      if (typeof attachment?.text === "string") {
        candidates.push(attachment.text);
      }
      if (Array.isArray(attachment?.fields)) {
        for (const field of attachment.fields) {
          if (field?.title || field?.value) {
            candidates.push(`${field.title || "Field"}: ${field.value || ""}`);
          }
        }
      }
    }
  }

  return candidates
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" | ");
}

function normalizeAlertText(value) {
  return String(value || "")
    .replace(/<https?:\/\/[^>|]+(?:\|([^>]+))?>/g, (_, label) => label || "")
    .replace(/:[a-z0-9_+-]+:/gi, "")
    .replace(/\bView Uptime Check:\s*/gi, "")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/(?:^\s*\|\s*|\s*\|\s*$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstDomain(value) {
  return normalizeAlertText(value).match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/i)?.[0] || "relay";
}

function conciseDigitalOceanMessage(summary) {
  const text = normalizeAlertText(summary);
  const host = firstDomain(text);
  const duration = text.match(/down in all regions.*?(?:last|for)\s+([0-9]+\s*[smhd])/i)?.[1]?.replace(/\s+/g, "");

  if (/down in all regions|detected as down|monitor triggered/i.test(text)) {
    return `Relay down: ${host} down globally${duration ? ` for ${duration}` : ""}.`;
  }

  if (/recovered|resolved|back up|detected as up|monitor resolved/i.test(text)) {
    return `Relay recovered: ${host} reachable again.`;
  }

  return "";
}

export function buildMessage(payload) {
  const fallback = "DigitalOcean reports a game relay uptime alert.";
  const summary = summarizeSlackPayload(payload) || fallback;
  const concise = conciseDigitalOceanMessage(summary);
  const message = concise || `Relay alert: ${normalizeAlertText(summary)}`;

  if (message.length <= MAX_SMS_BODY) {
    return message;
  }

  return `${message.slice(0, MAX_SMS_BODY - 3)}...`;
}

async function readPayload(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return { text: req.body };
    }
  }

  return {};
}

async function sendTwilioSms(body) {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const apiKey = env("TWILIO_API_KEY");
  const apiSecret = env("TWILIO_API_SECRET");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_FROM");
  const to = env("ALERT_TO");
  const username = apiKey || accountSid;
  const password = apiSecret || authToken;

  const missing = [
    ["TWILIO_ACCOUNT_SID", accountSid],
    ["TWILIO_API_KEY or TWILIO_AUTH_TOKEN", apiKey || authToken],
    ["TWILIO_API_SECRET or TWILIO_AUTH_TOKEN", apiSecret || authToken],
    ["TWILIO_FROM", from],
    ["ALERT_TO", to],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    return {
      ok: false,
      status: 503,
      body: { ok: false, missing },
    };
  }

  const form = new URLSearchParams({
    From: from,
    To: to,
    Body: body,
  });

  const credentials = Buffer.from(`${username}:${password}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body: {
        ok: false,
        twilioStatus: response.status,
        twilioCode: result.code,
        message: result.message || "Twilio send failed",
      },
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      sid: result.sid,
      status: result.status,
    },
  };
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const auth = requireSharedSecret(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, message: auth.message });
    }

    return res.status(200).json({
      ok: true,
      configured: {
        twilioAccountSid: Boolean(env("TWILIO_ACCOUNT_SID")),
        twilioApiKey: Boolean(env("TWILIO_API_KEY")),
        twilioApiSecret: Boolean(env("TWILIO_API_SECRET")),
        twilioAuthToken: Boolean(env("TWILIO_AUTH_TOKEN")),
        twilioFrom: Boolean(env("TWILIO_FROM")),
        alertTo: Boolean(env("ALERT_TO")),
      },
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const auth = requireSharedSecret(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, message: auth.message });
  }

  const payload = await readPayload(req);
  const message = buildMessage(payload);
  const result = await sendTwilioSms(message);

  return res.status(result.status).json(result.body);
}
