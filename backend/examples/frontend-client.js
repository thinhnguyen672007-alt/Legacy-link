// Browser ES module. Configure API_BASE_URL to the HTTP service, never MQTT.
export function createLegacyLinkApi(baseUrl) {
  async function request(path,{method='GET',body,signal}={}) {
    const response=await fetch(baseUrl.replace(/\/$/,'')+path,{method,signal,
      ...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
    const data=await response.json();
    if(!response.ok) { const error=new Error(data.error??'API unavailable'); error.status=response.status;error.data=data;throw error; }
    return data;
  }
  const query=options=>{const p=new URLSearchParams();for(const [k,v] of Object.entries(options??{})) if(v!==null&&v!==undefined)p.set(k,String(v));return p.toString();};
  const id=encodeURIComponent;
  return {
    health:()=>request('/health/ready'),
    machines:()=>request('/machines'),
    machine:device=>request(`/machines/${id(device)}`),
    telemetry:(device,options)=>request(`/machines/${id(device)}/telemetry?${query(options)}`),
    alarms:options=>request(`/alarms?${query(options)}`),
    acknowledgeAlarm:alarm=>request(`/alarms/${id(alarm)}/ack`,{method:'POST'}),
    gateways:()=>request('/gateways'),
    catalog:device=>request(`/catalog?${query({deviceId:device})}`),
    probe:(gateway,config)=>request(`/gateways/${id(gateway)}/probe`,{method:'POST',body:{config}}),
    apply:(gateway,{config,probeRequestId,machineType,acceptWarnings=false})=>request(`/gateways/${id(gateway)}/apply`,{method:'POST',body:{config,probeRequestId,machineType,acceptWarnings}}),
    operation:operation=>request(`/operations/${id(operation)}`),
    dispatchCatalog:device=>request(`/devices/${id(device)}/config`,{method:'POST'}),
    configRequest:requestId=>request(`/config-requests/${id(requestId)}`),
    uptime:(limit=20)=>request(`/uptime?${query({limit})}`),
  };
}
