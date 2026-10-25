(function (root) {
  class FleetAPI {
    constructor(onState, onConnection) {
      this.onState = onState; this.onConnection = onConnection; this.key = "";
      this.pending = new Map();
    }
    async request(path, body) {
      const response = await fetch(`/api/v1/${path}`, {
        method: body === undefined ? "GET" : "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", "X-Fleet-Key": this.key },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error?.message || value.detail || `HTTP ${response.status}`);
      return value;
    }
    id() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join(""); }
    async command(command, requestId) {
      const slot = requestId || JSON.stringify(command);
      let message = this.pending.get(slot);
      if (!message) {
        const now = Date.now();
        message = {protocolVersion: "1.0", requestId: requestId || this.id(),
          issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60000).toISOString(), command};
        this.pending.set(slot, message);
      } else if (JSON.stringify(message.command) !== JSON.stringify(command)) {
        throw new Error("Pending request content cannot change");
      }
      const receipt = await this.request("commands", message);
      if (receipt.status === "ACCEPTED") { this.pending.delete(slot); return receipt.result; }
      const error = new Error(`${receipt.error?.message || receipt.status}; requestId=${message.requestId}. Query receipt before another intent.`);
      error.definitive = receipt.status === "REJECTED";
      if (error.definitive) this.pending.delete(slot);
      throw error;
    }
    async start() {
      const layout = await this.request("layout");
      this.onState(await this.request("robots"));
      this.events = new EventSource("/api/v1/events");
      this.lastEventAt = Date.now();
      this.events.addEventListener("fleet", (event) => {
        try { const state = JSON.parse(event.data); this.lastEventAt = Date.now(); this.onConnection(true); this.onState(state); }
        catch (_) { this.onConnection(false); }
      });
      this.events.onerror = () => this.onConnection(false);
      this.watchdog = setInterval(() => { if (Date.now() - this.lastEventAt > 10000) this.onConnection(false); }, 1000);
      return layout;
    }
    order(value) { return this.command({type: "create_order", robotId: value.robotId, destination: value.to}, value.requestId); }
    async fleet(operation) {
      const capabilities = await this.request("capabilities");
      const results = [];
      for (const id of capabilities.robotIds) {
        try { await this.command({type: operation, robotId: id}); results.push({id, accepted: true}); }
        catch (error) { results.push({id, accepted: false, detail: error.message}); }
      }
      return {results, allAccepted: results.every(r => r.accepted)};
    }
    cancel(id) { return this.command({type: "cancel_order", orderId: id}); }
  }
  root.FleetAPI = FleetAPI;
})(globalThis);
