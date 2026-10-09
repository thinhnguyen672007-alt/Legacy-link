// Client mẫu: frontend gọi các hàm ở đây thay vì tự ghép URL và xử lý lỗi lặp lại ở nhiều màn hình.
// File mẫu dùng trong trình duyệt. baseUrl trỏ tới HTTP API, ví dụ http://localhost:3000.
export function createLegacyLinkApi(baseUrl, { getToken = () => '' } = {}) {
  // Hàm chung gửi HTTP và biến response lỗi thành Error để màn hình bắt bằng try/catch.
  async function request(path,{method='GET',body,signal}={}) {
    const response=await fetch(baseUrl.replace(/\/$/,'')+path,{method,signal,
      headers:{...(getToken()?{Authorization:`Bearer ${getToken()}`} : {}),...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await response.json();
    if(!response.ok) { const error=new Error(data.error??'API unavailable'); error.status=response.status;error.data=data;throw error; }
    return data;
  }
  const query=options=>{const p=new URLSearchParams();for(const [k,v] of Object.entries(options??{})) if(v!==null&&v!==undefined)p.set(k,String(v));return p.toString();};
  const id=encodeURIComponent;
  // Mỗi hàm bên dưới tương ứng một thao tác trên màn hình: xem máy, biểu đồ, cấu hình...
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
