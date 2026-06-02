import test from "node:test";
import assert from "node:assert/strict";
import { buildMessage } from "../api/do-alert.js";

test("compresses DigitalOcean down alert into a short SMS", () => {
  const message = buildMessage({
    text: ":rotating_light: Monitor triggered: relay.example.com - relay-ping-down-global | relay.example.com has been detected as down in all regions for the last 3m | View Uptime Check: <https://cloud.digitalocean.com/monitors/uptime/checks/00000000-0000-0000-0000-000000000000>",
  });

  assert.equal(message, "Relay down: relay.example.com down globally for 3m.");
});

test("compresses recovery-style alert into a short SMS", () => {
  const message = buildMessage({
    text: ":white_check_mark: Monitor resolved: relay.example.com - relay-ping-down-global | relay.example.com has been detected as up in all regions",
  });

  assert.equal(message, "Relay recovered: relay.example.com reachable again.");
});

test("keeps unknown alerts concise and strips Slack URL markup", () => {
  const message = buildMessage({
    text: "Something happened | View Uptime Check: <https://example.com/check>",
  });

  assert.equal(message, "Relay alert: Something happened");
});
