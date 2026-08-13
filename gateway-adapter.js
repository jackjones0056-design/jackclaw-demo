const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const GATEWAY_SCOPES = Object.freeze([
  'operator.read',
  'operator.write',
  'operator.approvals'
]);

export class GatewayAdapter extends EventTarget {
  constructor() {
    super();
    this.connected = false;
    this.mode = 'offline';
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async connect() {
    throw new Error('GatewayAdapter.connect() must be implemented.');
  }

  async disconnect() {
    this.connected = false;
    this.emit('status', { connected: false, mode: this.mode });
  }

  async sendDirective() {
    throw new Error('GatewayAdapter.sendDirective() must be implemented.');
  }

  async resolveApproval() {
    throw new Error('GatewayAdapter.resolveApproval() must be implemented.');
  }
}

export class DemoGatewayAdapter extends GatewayAdapter {
  constructor() {
    super();
    this.mode = 'demo';
    this.run = 0;
  }

  async connect() {
    await wait(240);
    this.connected = true;
    this.emit('status', {
      connected: true,
      mode: this.mode,
      serverVersion: 'MISSION-CONTROL-DEMO',
      scopes: GATEWAY_SCOPES
    });
    return { connected: true, mode: this.mode };
  }

  async sendDirective(text, context = {}) {
    if (!this.connected) await this.connect();
    const runId = `demo-${Date.now()}-${++this.run}`;
    const lower = String(text).toLowerCase();
    let agentId = 'research';

    if (/code|build|repo|github|debug|program/.test(lower)) agentId = 'coding';
    else if (/money|finance|budget|cost|trade/.test(lower)) agentId = 'finance';
    else if (/secure|security|skill|malware|permission|audit/.test(lower)) agentId = 'security';
    else if (/aip|waiver|accession|recruit/.test(lower)) agentId = 'aip';
    else if (/voice|speak|audio|glass/.test(lower)) agentId = 'voice';
    else if (/memory|remember|recall/.test(lower)) agentId = 'memory';
    else if (/vision|image|camera|see/.test(lower)) agentId = 'vision';
    else if (/business|market|customer|revenue/.test(lower)) agentId = 'business';

    this.emit('run.started', { runId, agentId, text, context });
    await wait(420);
    this.emit('tool.started', {
      runId,
      agentId,
      tool: agentId === 'coding' ? 'repository.inspect' : agentId === 'security' ? 'policy.scan' : 'context.retrieve'
    });

    if (/delete|sudo|shell|install|credential|secret|send email|transfer/.test(lower)) {
      await wait(380);
      const approval = {
        id: `approval-${Date.now()}`,
        runId,
        agentId,
        kind: 'exec',
        risk: 'high',
        summary: `Potentially consequential request: ${text.slice(0, 92)}`,
        createdAtMs: Date.now(),
        expiresAtMs: Date.now() + 120000,
        allowedDecisions: ['allow-once', 'deny']
      };
      this.emit('approval.requested', approval);
      return { runId, agentId, awaitingApproval: true };
    }

    await wait(650);
    this.emit('tool.finished', { runId, agentId });
    this.emit('run.completed', {
      runId,
      agentId,
      text: `Directive routed through ${agentId.toUpperCase()}. Mission Control is currently running in simulation mode.`
    });
    return { runId, agentId, awaitingApproval: false };
  }

  async resolveApproval(id, decision) {
    await wait(180);
    this.emit('approval.resolved', { id, decision });
    return { ok: true, id, decision };
  }
}

/**
 * Adapter for the real OpenClaw Gateway client.
 *
 * Mission Control intentionally does not implement browser device signing or store
 * Gateway bootstrap credentials itself. Inject an authenticated, paired client
 * created by the official @openclaw/gateway-client/browser package (or a trusted
 * local backend bridge) and map its request/event interface here.
 */
export class OpenClawGatewayAdapter extends GatewayAdapter {
  constructor(client) {
    super();
    if (!client) throw new Error('An authenticated OpenClaw Gateway client is required.');
    this.client = client;
    this.mode = 'openclaw';
    this.bound = false;
  }

  bindEvents() {
    if (this.bound) return;
    this.bound = true;

    const on = this.client.on?.bind(this.client);
    if (!on) return;

    on('agent', (payload) => this.emit('agent.event', payload));
    on('sessions.changed', (payload) => this.emit('sessions.changed', payload));
    on('exec.approval.requested', (payload) => this.emit('approval.requested', payload));
    on('exec.approval.resolved', (payload) => this.emit('approval.resolved', payload));
    on('plugin.approval.requested', (payload) => this.emit('approval.requested', payload));
    on('plugin.approval.resolved', (payload) => this.emit('approval.resolved', payload));
    on('tool', (payload) => this.emit('tool.event', payload));
    on('disconnect', (payload) => {
      this.connected = false;
      this.emit('status', { connected: false, mode: this.mode, payload });
    });
  }

  async connect() {
    this.bindEvents();
    const hello = await this.client.connect?.({
      role: 'operator',
      scopes: GATEWAY_SCOPES,
      caps: ['tool-events']
    });
    this.connected = true;
    this.emit('status', {
      connected: true,
      mode: this.mode,
      serverVersion: hello?.server?.version,
      scopes: hello?.auth?.scopes || GATEWAY_SCOPES,
      hello
    });

    try {
      await this.client.request?.('sessions.subscribe', {});
    } catch (error) {
      this.emit('warning', { message: 'Session subscription was not established.', error });
    }

    try {
      const approvals = await this.client.request?.('exec.approval.list', {});
      for (const approval of approvals?.approvals || []) this.emit('approval.requested', approval);
    } catch (error) {
      this.emit('warning', { message: 'Approval backfill was not available.', error });
    }

    return hello;
  }

  async disconnect() {
    await this.client.disconnect?.();
    return super.disconnect();
  }

  async request(method, params = {}) {
    if (!this.connected) throw new Error('OpenClaw Gateway is not connected.');
    if (!this.client.request) throw new Error('Injected Gateway client does not expose request().');
    return this.client.request(method, params);
  }

  async sendDirective(text, context = {}) {
    if (typeof this.client.sendDirective === 'function') {
      return this.client.sendDirective(text, context);
    }

    // The exact chat.send payload is deliberately delegated to the paired client
    // wrapper so Mission Control does not guess session-specific RPC parameters.
    throw new Error('Real Gateway client must expose sendDirective(text, context).');
  }

  async resolveApproval(id, decision) {
    if (typeof this.client.resolveApproval === 'function') {
      return this.client.resolveApproval(id, decision);
    }
    return this.request('exec.approval.resolve', { id, decision });
  }
}

export function createGatewayAdapter() {
  const injected = globalThis.JACKCLAW_GATEWAY_CLIENT;
  if (injected) return new OpenClawGatewayAdapter(injected);
  return new DemoGatewayAdapter();
}
