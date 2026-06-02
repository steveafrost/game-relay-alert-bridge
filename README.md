# Game Relay Alert Bridge

Vercel Function that receives the DigitalOcean Uptime alert webhook and sends an SMS through Twilio.

```text
DigitalOcean Uptime alert -> Vercel Function -> Twilio SMS -> phone
```

## Endpoint

```text
/api/do-alert?token=ALERT_SHARED_SECRET
```

DigitalOcean Uptime does not expose a generic webhook target, but it does expose Slack webhook fields. Use this function URL as the Slack webhook URL. The function accepts Slack-shaped JSON and turns the message text into an SMS.

## DigitalOcean Setup

Create or edit a DigitalOcean Uptime alert and use the Vercel function URL as a Slack webhook URL:

```text
https://YOUR_PROJECT.vercel.app/api/do-alert?token=YOUR_SHARED_SECRET
```

Keep an email notification enabled as a fallback if you want a second alert path.

## Required Environment Variables

Set these in Vercel for Production:

```text
ALERT_SHARED_SECRET
TWILIO_ACCOUNT_SID
TWILIO_API_KEY
TWILIO_API_SECRET
TWILIO_FROM
ALERT_TO
```

`TWILIO_AUTH_TOKEN` is also supported instead of `TWILIO_API_KEY` / `TWILIO_API_SECRET`, but API key auth is preferred.

Use E.164 phone numbers for `TWILIO_FROM` and `ALERT_TO`, for example `+15555551212`.

After adding or changing Vercel Production environment variables, redeploy the project:

```bash
npx vercel deploy --prod
```

## Health Check

After setting env vars:

```bash
curl "https://PROJECT.vercel.app/api/do-alert?token=SECRET"
```

Expected response:

```json
{
  "ok": true,
  "configured": {
    "twilioAccountSid": true,
    "twilioApiKey": true,
    "twilioApiSecret": true,
    "twilioAuthToken": false,
    "twilioFrom": true,
    "alertTo": true
  }
}
```
