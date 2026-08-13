# JackClaw Mission Control

JackClaw Mission Control is the animated operator dashboard for the JackClaw/OpenClaw system.

## Current build

The root `index.html` now loads:

- `mission-control.css` — Ultron-inspired command-center interface
- `mission-control.js` — living cellular field, agent topology, pulses, activity feed, approvals, drawers, command routing, and responsive layout
- `gateway-adapter.js` — isolated OpenClaw connection layer with a safe demo adapter and a real-client adapter hook

The existing `security/`, `openclaw/`, and skill-security files remain separate from the UI.

## Run locally

Do not open `index.html` directly with a `file://` URL because browser ES-module security rules may block module imports.

From the repository directory:

```bash
python3 -m http.server 8787
```

Then open:

```text
http://localhost:8787
```

If GitHub Pages is enabled for the repository, the same static build can be hosted there without a build step.

## What works now

- Animated living-cellular background
- Floating multi-agent topology
- Animated curved links and routed energy pulses
- JackClaw core states: BOOT / ONLINE / THINKING / EXECUTING / ALERT
- Research, Coding, Finance, Security, Memory, Vision, Voice, AIP, and Business nodes
- Activity feed
- Mission drawer
- Skills trust drawer
- Security-kernel drawer
- System/control-plane drawer
- Human approval cards with allow-once / deny interactions
- Responsive desktop/tablet/mobile layout
- Demo event bus so the interface remains interactive before Gateway pairing

Try directives such as:

```text
Research current OpenClaw security issues
Build the AIP dashboard
Audit a third-party skill
Delete a system file
```

The last example intentionally triggers the simulated human-approval gate.

## Real OpenClaw Gateway integration

Mission Control does not put a reusable Gateway bootstrap token in browser JavaScript.

The browser-safe OpenClaw client requires persistent device identity, challenge signing, device pairing, and a device token. Build the authenticated client with the official OpenClaw Gateway client package or provide a trusted local backend bridge. Then expose the authenticated client before `mission-control.js` loads:

```js
window.JACKCLAW_GATEWAY_CLIENT = authenticatedClient;
```

`gateway-adapter.js` will then select `OpenClawGatewayAdapter` instead of `DemoGatewayAdapter`.

The intended operator scopes are deliberately limited to:

```text
operator.read
operator.write
operator.approvals
```

Mission Control does not request `operator.admin` by default.

The real client wrapper should expose:

```js
client.connect(options)
client.disconnect()
client.on(eventName, handler)
client.request(method, params)
client.sendDirective(text, context)
client.resolveApproval(id, decision) // optional; RPC fallback exists
```

The adapter subscribes to session changes, approval events, agent events, and tool events. Consequential execution should continue to be enforced by OpenClaw approvals plus the JackClaw security kernel, not by UI state.

## Security rule

The dashboard is an operator surface, not an authority boundary. A malicious or compromised front end must not be capable of bypassing execution policy. Keep deterministic permission enforcement in the JackClaw/OpenClaw runtime.
