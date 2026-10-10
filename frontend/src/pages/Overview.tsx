import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useApi, polling } from "../session";
import { PageHead, QueryState } from "../components/ui";
// Thống kê từ API thiết bị; không tự suy ra máy đang sản xuất từ trạng thái gateway.
export function Overview(){
 const api=useApi();
 const q=useQuery({queryKey:["machines"],queryFn:({signal})=>api.machines(signal),refetchInterval:polling(5000),refetchIntervalInBackground:false});
 const data=q.data??[];
 return <><PageHead title="Tổng quan" description="Trạng thái liên lạc và độ mới dữ liệu từ thiết bị."/><QueryState error={q.error} loading={q.isPending} updated={q.dataUpdatedAt}/>{q.data&&<div className="overview-grid">{[["Thiết bị",data.length],["Liên lạc được",data.filter(m=>m.gatewayOnline).length],["Dữ liệu mới",data.filter(m=>m.dataFresh).length],["Cần chú ý",data.filter(m=>!m.gatewayOnline||!m.dataFresh||m.readHealth!=="healthy"||m.deliveryHealth!=="healthy").length]].map(([label,value])=><article className="surface overview-stat" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>}<Link className="button primary" to="/machines">Xem danh sách thiết bị</Link><p className="help">Liên lạc được không chứng minh máy đang sản xuất. Xem riêng số đo và kết quả đọc thiết bị.</p></>;
}
