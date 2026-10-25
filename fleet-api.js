(function (root) {
  class FleetAPI {
    constructor(onState, onConnection) { this.onState = onState; this.onConnection = onConnection; this.key = ""; }
    async request(path, body) {
      const response = await fetch(`/api/${path}`, {
        method: body === undefined ? "GET" : "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", "X-Fleet-Key": this.key },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(typeof value.detail === "string" ? value.detail : `HTTP ${response.status}`);
      return value;
    }
    async start() {
      const layout = await this.request("layout");
      this.onState(await this.request("robots"));
      this.events = new EventSource("/api/events");
      this.lastEventAt = Date.now();
      this.events.addEventListener("fleet", (event) => { this.lastEventAt = Date.now(); this.onConnection(true); this.onState(JSON.parse(event.data)); });
      this.events.onerror = () => this.onConnection(false);
      this.watchdog = setInterval(() => { if (Date.now() - this.lastEventAt > 10000) this.onConnection(false); }, 1000);
      return layout;
    }
    order(value) { return this.request("orders", value); }
    fleet(operation) { return this.request(`fleet/${operation}`, {}); }
    cancel(id) { return this.request(`orders/${encodeURIComponent(id)}/cancel`, {}); }
  }
  root.FleetAPI = FleetAPI;
})(globalThis);
