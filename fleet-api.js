(function (root) {
  const STORE = "fleet-command-receipts.v1";
  const TAB_ACTIVITY = "fleet-tab-operation:";
  const copy = value => JSON.parse(JSON.stringify(value));
  const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === "object" ? Object.keys(v).sort().reduce((o,k)=>(o[k]=v[k],o),{}) : v);
  // Commands that create a task: one unresolved create per vehicle at a time.
  const creates = command => command?.type === "create_order" || command?.type === "create_transport_order";
  const final = status => status === "ACCEPTED" || status === "REJECTED";
  const identifier = value => typeof value==="string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
  const object = value => value && typeof value==="object" && !Array.isArray(value);
  const timestamp = value => typeof value==="string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  const TASK_ACTIONS=["move","pick","drop","wait","charge"];
  function validTransport(command) {
    const keys=Object.keys(command).filter(k=>k!=="type");
    return keys.every(k=>k==="robotId" || k==="steps") && (!("robotId" in command) || identifier(command.robotId)) &&
      Array.isArray(command.steps) && command.steps.length>=1 && command.steps.length<=8 &&
      command.steps.every(step=>object(step) && Object.keys(step).length===2 && identifier(step.station) && TASK_ACTIONS.includes(step.action));
  }
  function validCommand(command) {
    if(!object(command)) return false;
    if(command.type==="create_transport_order") return validTransport(command);
    if(command.type==="confirm_station_action") return Object.keys(command).length===2 && identifier(command.robotId);
    if(command.type==="acknowledge_alert") return Object.keys(command).length===2 && typeof command.alertId==="string" && /^[A-Z_]{3,32}:[A-Za-z0-9_.:-]{1,160}$/.test(command.alertId);
    const fields=command.type==="create_order"?["type","robotId","destination"]:command.type==="pause" || command.type==="resume"?["type","robotId"]:command.type==="cancel_order"?["type","orderId"]:command.type==="finish_stopped_run"?["type","runId","orderId","robotId","releaseId","sourceId"]:[];
    return fields.length && Object.keys(command).length===fields.length && fields.every(k=>k==="type" || (k==="orderId" ? /^fleet-[a-f0-9]{32}$/.test(command[k]) : k==="releaseId" ? /^[a-f0-9]{32}$/.test(command[k]) : identifier(command[k])));
  }
  function validReceipt(value,id) {
    return object(value) && value.protocolVersion==="1.0" && value.requestId===id && identifier(id) &&
      ["ACCEPTED","REJECTED","DISPATCHING","UNKNOWN"].includes(value.status) && timestamp(value.updatedAt) &&
      object(value.resource) && typeof value.confirmation==="string" &&
      (value.result===null || object(value.result)) && (value.error===null || object(value.error) &&
        ["code","category","message","retry"].every(k=>typeof value.error[k]==="string")) &&
      (value.status!=="ACCEPTED" || object(value.result)) && (value.status!=="REJECTED" || object(value.error));
  }
  function validRecord(record,scope) {
    if(!object(record) || record.scope!==scope || !object(record.envelope) || !identifier(record.envelope.requestId) ||
       !["PREPARED","DISPATCHING","UNKNOWN","ACCEPTED","REJECTED"].includes(record.status)) return false;
    if(record.lookupOnly) {
      if(record.envelope.command?.type!=="server_lookup" || !validReceipt(record.receipt,record.envelope.requestId)) return false;
    } else if(record.envelope.protocolVersion!=="1.0" || !timestamp(record.envelope.issuedAt) || !timestamp(record.envelope.expiresAt) || !validCommand(record.envelope.command)) return false;
    if(record.receipt!==null && !validReceipt(record.receipt,record.envelope.requestId)) return false;
    return !final(record.status) || validReceipt(record.receipt,record.envelope.requestId) && record.receipt.status===record.status;
  }
  class FleetAPI {
    constructor(onState, onConnection, onReceipts = () => {}) {
      this.onState=onState; this.onConnection=onConnection; this.onReceipts=onReceipts;
      this._key=""; this.authorized=false; this.keyRevision=0; this.portalRole=null;
      this.pending=new Map(); this.inFlight=new Map();
      this.apiBase=new URL("/api/v1/", root.location?.origin || "http://localhost").href;
      this.scope=this.apiBase;this.deploymentId=null;this.deploymentConfirmed=false;this.capabilities=null;this.requestCount=0;this.scopeBoundRequests=0;this.receiptOperations=0;this.mutationRequests=0;
      this.records=[];this.legacyRecords=[];this.readOnlyResults=new Map();this.storageError=null;this.load();
      root.addEventListener?.("storage",event=>{
        if(event.key!==STORE && event.key!==null) return;
        const reload=()=>{this.load();this.emit();};
        if(root.navigator?.locks?.request) root.navigator.locks.request("fleet-command:"+this.scope,reload).catch(()=>{});
        else reload();
      });
    }
    get key() { return this._key; }
    set key(value) { this._key=value; this.portalRole=null; this.keyRevision++; this.authorized=false; this.emit(); }
    portalSessionURL() {
      const origin=root.location?.origin;
      if(!origin?.startsWith("https://") || this.apiBase!==new URL("/api/v1/",origin).href) return null;
      return new URL("portal/session",this.apiBase).href;
    }
    async portalSessionRequest(method,key) {
      const url=this.portalSessionURL();
      if(!url) throw this.failure("当前连接不支持共享门户登录","PORTAL_SESSION_UNAVAILABLE");
      const signal=root.AbortSignal?.timeout?.(15000);
      let response;
      try {
        response=await fetch(url,{method,credentials:"same-origin",mode:"same-origin",cache:"no-store",redirect:"error",
          ...(signal?{signal}:{}),...(key?{headers:{"X-Fleet-Key":key}}:{})});
      } catch(_) { throw this.failure("无法联系登录服务，请稍后重试","PORTAL_SESSION_UNAVAILABLE"); }
      if(!response.ok) {
        const message=response.status===401 ? "操作密钥无效，请检查后重试" : "登录服务暂不可用，请稍后重试";
        throw this.failure(message,"PORTAL_SESSION_HTTP",response.status);
      }
      const value=await response.json().catch(()=>null);
      if(!object(value) || !(value.authenticated===false && value.role===null ||
         value.authenticated===true && ["operator","automation"].includes(value.role)) ||
         method==="POST" && !value.authenticated || method==="DELETE" && value.authenticated)
        throw this.failure("登录服务返回了无法核验的状态","INVALID_PORTAL_SESSION");
      return value.role;
    }
    setPortalRole(role, invalidate=false) {
      const authorized=role==="operator" && this.deploymentConfirmed;
      if(!invalidate && this.portalRole===role && this.authorized===authorized) return;
      this.portalRole=role; this.authorized=authorized; this.keyRevision++; this.emit();
    }
    async restorePortalSession() {
      if(!this.portalSessionURL() || this.key || this.portalSessionChanging || this.logoutPending) return;
      if(this.portalSessionReading) return this.portalSessionReading;
      const revision=this.keyRevision;
      this.portalSessionReading=(async()=>{
        try {
          if(!this.deploymentConfirmed) await this.confirmDeployment();
          const scope=this.scope, role=await this.portalSessionRequest("GET");
          if(revision===this.keyRevision && scope===this.scope) this.setPortalRole(role);
        } catch(_) {
          if(revision===this.keyRevision) this.setPortalRole(null);
        }
      })();
      try { await this.portalSessionReading; }
      finally { this.portalSessionReading=null; }
    }
    watchPortalSession() {
      this.portalSessionWatching=true;
      if(!this.portalSessionURL()) return Promise.resolve();
      const restore=()=>this.restorePortalSession();
      if(root.BroadcastChannel) {
        this.portalSessionChannel=new root.BroadcastChannel("fleet-portal-session");
        this.portalSessionChannel.onmessage=async event=>{
          if(event.data!=="changed" || this.key || this.portalSessionChanging || this.logoutPending) return;
          this.setPortalRole(null,true);
          await this.portalSessionReading;
          await restore();
        };
      }
      root.addEventListener?.("focus",restore);
      root.addEventListener?.("pageshow",event=>{if(event.persisted) restore();});
      root.document?.addEventListener("visibilitychange",()=>{if(root.document.visibilityState==="visible") restore();});
      root.setInterval?.(()=>{if(this.portalRole && root.document?.visibilityState==="visible") restore();},30000);
      return restore();
    }
    async loginPortal(key) {
      if(!key) throw this.failure("请输入操作密钥","AUTH_REQUIRED",401);
      if(this.portalSessionChanging) throw this.failure("登录服务正在处理，请稍候","PORTAL_SESSION_BUSY");
      this.portalSessionChanging=true;
      try {
        await this.confirmDeployment();
        if(this.portalSessionURL()) {
          let role;
          try { role=await this.portalSessionRequest("POST",key); }
          catch(error) { if(![404,405].includes(error.status)) throw error; }
          if(role) {
            this._key=""; this.logoutPending=false; this.setPortalRole(role,true);
            this.portalSessionChannel?.postMessage("changed");
            return;
          }
        }
        this.key=key;
        try { await this.verifyKey(); }
        catch(error) { this.key=""; throw error; }
        this.logoutPending=false;
      } finally { this.portalSessionChanging=false; }
    }
    async logoutPortal() {
      if(this.portalSessionChanging) throw this.failure("登录服务正在处理，请稍候","PORTAL_SESSION_BUSY");
      if(this.key || !this.portalSessionURL()) {this.key="";return;}
      this.portalSessionChanging=true; this.logoutPending=true;
      this.setPortalRole(null,true);
      try {
        await this.portalSessionRequest("DELETE");
        this.logoutPending=false;
        this.portalSessionChannel?.postMessage("changed");
      } finally { this.portalSessionChanging=false; this.emit(); }
    }
    failure(message, code, status, requestId, definitive=false) {
      return Object.assign(new Error(message),{code,status,requestId,definitive});
    }
    configureDeployment(capabilities) {
      if(!object(capabilities)) throw this.failure("部署能力响应无效","INVALID_CAPABILITIES");
      const id=capabilities.deploymentId;
      if(id!=null && !identifier(id)) throw this.failure("部署身份无效，保持只读","INVALID_DEPLOYMENT_ID");
      if(capabilities.environment==="SIM" && capabilities.targetId && !id) throw this.failure("隔离仿真尚未声明部署身份，保持只读","DEPLOYMENT_UNDECLARED");
      const scope=id?this.apiBase+"#deployment="+encodeURIComponent(id):this.apiBase;
      if(scope!==this.scope && (this.inFlight.size || this.scopeBoundRequests || this.receiptOperations)) {this.deploymentConfirmed=false;this.authorized=false;this.emit();throw this.failure("请求进行中，不能更换部署范围","DEPLOYMENT_BUSY");}
      if(scope!==this.scope) {this.scope=scope;this.authorized=false;this.records=[];this.readOnlyResults.clear();}
      this.deploymentId=id || null;this.capabilities=copy(capabilities);this.deploymentConfirmed=true;this.load();this.emit();
      return this.capabilities;
    }
    async confirmDeployment() {
      if(this.confirmingDeployment) return this.confirmingDeployment;
      this.confirmingDeployment=this.request("capabilities").then(value=>this.configureDeployment(value)).finally(()=>{this.confirmingDeployment=null;});
      return this.confirmingDeployment;
    }
    load() {
      try {
        if(!root.localStorage) throw Error("Browser storage is unavailable");
        const value=JSON.parse(root.localStorage.getItem(STORE) || '{"version":1,"scopes":{}}');
        if(value.version!==1 || !object(value.scopes)) throw Error("Unsupported receipt storage");
        const records=value.scopes[this.scope] || [];
        if(!Array.isArray(records) || records.some(r=>!validRecord(r,this.scope))) throw Error("Invalid receipt storage scope or record");
        this.records=records;
        this.legacyRecords=[];
        if(this.scope!==this.apiBase) for(const [key,history] of Object.entries(value.scopes)) {
          if(key!==this.scope && (key===this.apiBase || key.startsWith(this.apiBase+"#deployment=")) && Array.isArray(history) && history.every(r=>validRecord(r,key))) this.legacyRecords.push(...history);
        }
        if(!root.navigator?.locks?.request) for(const [id,result] of this.readOnlyResults) {
          const index=this.records.findIndex(r=>r.envelope.requestId===id);
          const current=index<0 ? null : this.records[index];
          const observed=r=>Date.parse(r?.queryErrorObservedAt || r?.receiptObservedAt || "") || 0;
          if(!current) this.records.unshift(copy(result));
          else if(observed(result)>=observed(current)) this.records[index]=copy(result);
        }
        this.storageError=null;
        return value;
      } catch(error) { this.storageError="Cannot guarantee request recovery: "+error.message; return null; }
    }
    save() {
      try {
        if(!root.localStorage) throw Error("Browser storage is unavailable");
        const value=JSON.parse(root.localStorage.getItem(STORE) || '{"version":1,"scopes":{}}');
        if(value.version!==1 || !object(value.scopes)) throw Error("Unsupported receipt storage");
        value.scopes[this.scope]=this.records;
        root.localStorage.setItem(STORE,JSON.stringify(value)); this.storageError=null;
      } catch(error) { this.storageError="Cannot guarantee request recovery: "+error.message; this.emit(); throw this.failure(this.storageError,"STORAGE_UNAVAILABLE"); }
      this.emit();
    }
    receiptSnapshot() {
      const writeBlockedReason=this.storageError || (!this.deploymentConfirmed ? "尚未确认 API 部署身份，请等待读取连接能力" : !this.authorized ? "请先登录操作员会话" : !root.navigator?.locks?.request ? "当前浏览器来源不支持跨标签页请求锁；仅可查询，请使用受支持的 HTTPS 或 localhost 安全来源" : null);
      return copy({deploymentConfirmed:this.deploymentConfirmed,deploymentId:this.deploymentId,apiBase:this.apiBase,legacyRecords:this.legacyRecords,queryPersistence:!!root.navigator?.locks?.request,canWrite:!writeBlockedReason,writeBlockedReason,records:this.records,scope:this.scope,storageError:this.storageError,authorized:this.authorized}); }
    emit() { this.onReceipts?.(this.receiptSnapshot()); }
    hasUnresolvedCreate(robotId) { return this.records.some(r=>!final(r.status) && creates(r.envelope.command) && (!robotId || r.envelope.command.robotId===robotId)); }
    hasUnresolved(command) { return this.records.some(r=>!final(r.status) && (creates(command) ? creates(r.envelope.command) && r.envelope.command.robotId===command.robotId : stable(r.envelope.command)===stable(command))); }
    requireAuthorization() { if(!this.authorized || !this.key && (this.portalRole!=="operator" || !this.portalSessionURL())) throw this.failure("请先登录操作员会话","AUTH_REQUIRED",401); }
    hasSubmittedInTab() {
      if(this.submittedInTab?.has(this.scope)) return true;
      try { return root.sessionStorage?.getItem(TAB_ACTIVITY+this.scope)==="1"; }
      catch(_) { return false; }
    }
    async request(path, body, options={}) {
      if(options.method!==undefined && (options.method!=="PUT" || !/^sim-scenarios\/[A-Za-z0-9_.:%-]+$/.test(path))) throw this.failure("Unsupported request method","INVALID_METHOD",422);
      if (options.floorplanImage || options.rasterImage) {
        const imagePath=options.floorplanImage ? /^map-workspace\/scene-floorplans\/[a-f0-9]{32}\/image\.png$/ : /^map-workspace\/rasters\/[a-f0-9]{32}\/image\.png$/;
        if (body !== undefined || options.method || !imagePath.test(path)) throw this.failure("Invalid map image path", "INVALID_PATH", 422);
        this.requireAuthorization();
      }
      const method=options.method||(body===undefined?'GET':'POST');
      // Clearance reads unsaved geometry from a request body and never creates an intent.
      const mutation=method!=='GET' && !(method==='POST'&&path==='map-workspace/scene-clearance');
      if(method!=='GET' && this.portalSessionWatching) this.requireAuthorization();
      this.requestCount++;
      if(mutation) {
        this.mutationRequests++;
        (this.submittedInTab ||= new Set()).add(this.scope);
        try { root.sessionStorage?.setItem(TAB_ACTIVITY+this.scope,"1"); } catch(_) { /* Retain the marker in this page. */ }
      }
      // Public background/model/capability GETs do not own ledger state. Receipt
      // queries and every mutation do: their response must stay in its scope.
      const scopeBound=body!==undefined || options.floorplanImage || options.rasterImage || /^(?:commands\/(?!access-check-)|orders\/|map-workspace\/scenes(?:\/|$)|sim-publishing\/|sim-runs(?:\/|$)|sim-scenarios(?:\/|$)|sim-replay\/|sim\/environment(?:\/|$))/.test(path);
      if(scopeBound) this.scopeBoundRequests++;
      let response,value;
      const keyRevision = this.keyRevision, scope = this.scope;
      const controller=root.AbortController ? new root.AbortController() : null;
      const abortExternal=()=>controller?.abort();
      if(options.signal?.aborted)abortExternal();else options.signal?.addEventListener('abort',abortExternal,{once:true});
      const timeoutMs=body!==undefined && /^sim-publishing\/publications\/[A-Za-z0-9_.:%-]+\/retire$/.test(path) ? 45000 : 15000;
      const timer=controller && root.setTimeout ? root.setTimeout(()=>controller.abort(),timeoutMs) : null;
      try {
        const url=new URL(path,this.apiBase).href, key=this.key;
        response=await fetch(url,{method,cache:"no-store",credentials:key?"omit":"same-origin",...(controller?{signal:controller.signal}:{}),
          headers:{"Content-Type":"application/json",...(key?{"X-Fleet-Key":key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
        if((response.status===401 || response.status===403 && key) && this.keyRevision===keyRevision && this.scope===scope) {
          if(key) this.key="";
          else this.setPortalRole(null);
        }
        if ((options.floorplanImage || options.rasterImage) && response.ok) return await response.blob();
        try { value=await response.json(); }
        catch(_) { throw this.failure("Non-JSON API response; request outcome is uncertain","INVALID_RESPONSE",response.status,body?.requestId); }
        if(!value || typeof value!=="object") throw this.failure("Invalid API response","INVALID_RESPONSE",response.status,body?.requestId);
      } catch(error) { if(typeof error.code==="string") throw error; throw this.failure("Request outcome is uncertain; query the original receipt","NETWORK_UNCERTAIN",undefined,body?.requestId); } finally {this.requestCount--;if(scopeBound)this.scopeBoundRequests--;if(mutation)this.mutationRequests--;if(timer!==null)root.clearTimeout(timer);options.signal?.removeEventListener('abort',abortExternal);}
      if(!response.ok) {
        if(response.status===403 && !this.key && this.portalRole && this.keyRevision===keyRevision && this.scope===scope)
          this.restorePortalSession();
        const error=this.failure(value.error?.message || value.detail || `HTTP ${response.status}`,value.error?.code || `HTTP_${response.status}`,response.status,body?.requestId || value.requestId,false);
        error.protocolFault=value.protocolVersion==="1.0" && object(value.error) && ["code","category","message","retry"].every(k=>typeof value.error[k]==="string");
        throw error;
      }
      return value;
    }
    id() { return Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join(""); }
    async verifyKey() {
      this.authorized=false;
      if(!this.key) throw this.failure("Control key required","AUTH_REQUIRED",401);
      const probe="access-check-"+this.id(), keyAtStart=this.key, revision=this.keyRevision;
      if(!this.deploymentConfirmed) await this.confirmDeployment();
      const verifiedScope=this.scope;
      try {const receipt=await this.request("commands/"+probe);if(!validReceipt(receipt,probe)) throw this.failure("Invalid authentication probe response","INVALID_RESPONSE");}
      catch(error) { if(error.status!==404 || error.code!=="REQUEST_NOT_FOUND" || !error.protocolFault) throw error; }
      if(this.key!==keyAtStart || this.keyRevision!==revision || this.scope!==verifiedScope || !this.deploymentConfirmed) throw this.failure("Control key or deployment changed during verification","AUTH_CHANGED",401);
      this.authorized=true; this.emit();
    }
    command(command, requestId, transport) {
      const slot=requestId || stable(command);
      if(this.inFlight.has(slot)) {
        const active=this.inFlight.get(slot);
        if(active.content!==stable(command)) return Promise.reject(this.failure("Pending request content cannot change","REQUEST_ID_CONFLICT",409,requestId));
        return active.promise;
      }
      const work=this.sendCommand(copy(command),requestId,transport).finally(()=>this.inFlight.delete(slot));
      this.inFlight.set(slot,{content:stable(command),promise:work}); return work;
    }
    async sendCommand(command, requestId, transport) {
      this.requireAuthorization();
      if(!this.deploymentConfirmed) throw this.failure("尚未确认 API 部署身份，未发送命令","DEPLOYMENT_UNCONFIRMED");
      if(!validCommand(command) || requestId && !identifier(requestId)) throw this.failure("Invalid command or request ID","INVALID_MESSAGE",422,requestId,true);
      if(!root.navigator?.locks?.request) throw this.failure("Cross-tab command lock unavailable; no command sent","CROSS_TAB_LOCK_UNAVAILABLE");
      return root.navigator.locks.request("fleet-command:"+this.scope,async()=>{
        this.requireAuthorization();
        if(!this.load()) throw this.failure(this.storageError,"STORAGE_UNAVAILABLE");
        this.emit();
        const prior=requestId ? this.records.find(r=>r.envelope.requestId===requestId) : null;
        if(prior) {
          if(stable(prior.envelope.command)!==stable(command)) throw this.failure("Pending request content cannot change","REQUEST_ID_CONFLICT",409,requestId);
          if(prior.status==="ACCEPTED") return copy(prior.receipt.result);
          if(prior.status==="REJECTED") throw this.failure(prior.receipt?.error?.message || "Request rejected","REJECTED",undefined,requestId,true);
          throw this.failure("Query receipt before another intent; saved requests are never automatically reposted","PENDING_INTENT",409,requestId);
        }
        if(this.hasUnresolved(command)) throw this.failure("Query receipt before another intent for this vehicle/operation","PENDING_INTENT",409);
        const now=Date.now(), envelope={protocolVersion:"1.0",requestId:requestId || this.id(),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),command};
        const record={scope:this.scope,envelope,status:"PREPARED",receipt:null};this.records.unshift(record);
        this.save(); // Durable intent precedes every side effect.
        record.status="DISPATCHING";this.save();
        try {
          const receipt=transport ? await transport(copy(envelope)) : await this.request("commands",envelope);
          if(!validReceipt(receipt,envelope.requestId)) throw this.failure("Receipt identity mismatch","RECEIPT_MISMATCH");
          record.receipt=receipt;record.receiptObservedAt=new Date().toISOString();record.status=["ACCEPTED","REJECTED","DISPATCHING","UNKNOWN"].includes(receipt.status)?receipt.status:"UNKNOWN";
          this.save();
          if(record.status==="ACCEPTED") return receipt.result;
          throw this.failure(`${receipt.error?.message || record.status}; requestId=${envelope.requestId}. Query receipt before another intent.`,receipt.error?.code || record.status,undefined,envelope.requestId,record.status==="REJECTED");
        } catch(error) {
          if(!final(record.status) && !record.receipt) record.status="UNKNOWN";
          record.lastError={message:error.message,code:error.code,status:error.status};
          try {this.save();} catch(_) { /* The pre-send durable envelope remains recoverable. */ }
          error.requestId=envelope.requestId;throw error;
        }
      });
    }
    async queryReceipt(requestId) {
      this.requireAuthorization();
      if(!this.deploymentConfirmed) throw this.failure("尚未确认 API 部署身份，不能向未知部署查询历史请求","DEPLOYMENT_UNCONFIRMED");
      if(this.legacyRecords.some(r=>r.envelope.requestId===requestId) && !this.records.some(r=>r.envelope.requestId===requestId)) throw this.failure("此请求属于历史连接，不能向当前部署查询","HISTORICAL_DEPLOYMENT",undefined,requestId);
      if(!identifier(requestId)) throw this.failure("Invalid request ID","INVALID_REQUEST_ID",422,requestId);
      const persist=()=>{
        if(root.navigator?.locks?.request) this.save();
        else { // Keep this page's query observations without writing shared storage.
          for(const record of this.records) if(record.receiptObservedAt || record.queryErrorObservedAt)
            this.readOnlyResults.set(record.envelope.requestId,copy(record));
          this.emit();
        }
      };
      const run=async()=>{
        this.requireAuthorization();
        if(!this.load()) throw this.failure(this.storageError,"STORAGE_UNAVAILABLE");
        this.emit();
        let record=this.records.find(r=>r.envelope.requestId===requestId);
        try {
          const receipt=await this.request("commands/"+encodeURIComponent(requestId));
          if(!validReceipt(receipt,requestId)) throw this.failure("Receipt identity mismatch","RECEIPT_MISMATCH");
          if(!record) {record={scope:this.scope,envelope:{requestId,command:{type:"server_lookup"}},status:"UNKNOWN",receipt:null,lookupOnly:true};this.records.unshift(record);}
          record.receipt=receipt;record.receiptObservedAt=new Date().toISOString(); record.status=["ACCEPTED","REJECTED","DISPATCHING","UNKNOWN"].includes(receipt.status)?receipt.status:"UNKNOWN"; delete record.queryError;delete record.queryErrorObservedAt;
          persist();
          const orderId=receipt.resource?.type==="transport_order" ? receipt.resource.id : null;
          if(/^fleet-[a-f0-9]{32}$/.test(orderId || "")) {
            try {record.order=await this.queryOrder(orderId);record.orderObservedAt=new Date().toISOString();delete record.orderError;} catch(error) {record.orderError={code:error.code,status:error.status,message:error.message};}
            persist();
          }
          return copy(record);
        } catch(error) {
          if(record) {record.queryErrorObservedAt=new Date().toISOString();record.queryError={code:error.status===404?"RECEIPT_NOT_FOUND":error.code,status:error.status,message:error.status===404?"Receipt not found; original intent remains unresolved":error.message};persist();}
          error.requestId=requestId;throw error;
        }
      };
      this.receiptOperations++;
      try {return await (root.navigator?.locks?.request ? root.navigator.locks.request("fleet-command:"+this.scope,run) : run());}
      finally {this.receiptOperations--;}
    }
    async queryOrder(orderId) { this.requireAuthorization(); if(!/^fleet-[a-f0-9]{32}$/.test(orderId)) throw this.failure("Only gateway order IDs can be queried","INVALID_ORDER_ID",422);return this.request("orders/"+encodeURIComponent(orderId)); }
    async start() {
      if(!this.deploymentConfirmed) await this.confirmDeployment();
      const layout = await this.request("layout");
      this.onState(await this.request("robots"));
      this.events = new EventSource("/api/v1/events");
      this.lastEventAt = Date.now();
      this.events.addEventListener("fleet", (event) => {
        try {
          const state = JSON.parse(event.data);
          this.lastEventAt = Date.now();
          this.onConnection(true);
          this.onState(state);
        } catch (_) {
          this.onConnection(false);
        }
      });
      this.events.onerror = () => this.onConnection(false);
      this.watchdog = setInterval(() => {
        if (Date.now() - this.lastEventAt > 10000) this.onConnection(false);
      }, 1000);
      return layout;
    }
    // whenBusy "queue": if the station is taken, the gateway queues the order
    // and sends it once the station is free (result.queued, result.position).
    order(value) {
      const command = { type: "create_order", robotId: value.robotId, destination: value.to };
      if (value.whenBusy) command.whenBusy = value.whenBusy;
      return this.command(command, value.requestId);
    }
    // A task of 1..8 station steps; without robotId openTCS picks a free vehicle.
    transport(value) {
      const command = { type: "create_transport_order", steps: value.steps.map(s => ({ station: s.station, action: s.action })) };
      if (value.robotId) command.robotId = value.robotId;
      if (value.whenBusy) command.whenBusy = value.whenBusy;
      return this.command(command, value.requestId);
    }
    confirmStation(robotId) { return this.command({ type: "confirm_station_action", robotId }); }
    acknowledgeAlert(alertId) { return this.command({ type: "acknowledge_alert", alertId }); }
    model() {
      return this.request("model");
    }
    async fleet(operation, expectedRobotIds = null) {
      const capabilities = await this.request("capabilities");
      if(expectedRobotIds && (!Array.isArray(capabilities.robotIds) || JSON.stringify([...expectedRobotIds].sort())!==JSON.stringify([...capabilities.robotIds].sort())))throw Error('车辆范围已变化，请重新审阅全车控制；未发送请求。');
      const results = [];
      for (const id of capabilities.robotIds) {
        try {
          await this.command({ type: operation, robotId: id });
          results.push({ id, accepted: true });
        } catch (error) {
          results.push({ id, accepted: false, detail: error.message });
        }
      }
      return { results, allAccepted: results.every((r) => r.accepted) };
    }
    cancel(id) {
      return this.command({ type: "cancel_order", orderId: id });
    }
  }
  root.FleetAPI = FleetAPI;
})(globalThis);
