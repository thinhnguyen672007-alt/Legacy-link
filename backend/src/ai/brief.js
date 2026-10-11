// Chỉ câu hỏi giám sát đơn giản, độc lập mới đi thẳng tới rules.
// Câu hỏi có mã máy, lịch sử hoặc đại từ vẫn dùng Gemini và conversation context.
export function basicMonitoringAction(question) {
  const text = question.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/đ/g, "d").replace(/[?!.]/g, "").trim();
  if (/^(?:hien tai )?(?:may|thiet bi) nao (?:dang )?(?:offline|mat ket noi)$/.test(text)) return "offline";
  if (/^(?:hien tai )?(?:may|thiet bi) nao (?:dang )?(?:qua nong|qua nhiet|overheat)$/.test(text)) return "overheat";
  if (/^(?:hien tai )?(?:may|thiet bi) nao (?:dang )?(?:duoi nguong nhiet|qua lanh|underheat)$/.test(text)) return "underheat";
  return null;
}
export function monitoringBrief(action, results, language) {
  const en = language === "en";
  const result = results[0];
  if (!result) return "";
  const devices = result.devices ?? [];
  if (["offline", "overheat", "underheat"].includes(action)) {
    const label = en ? {offline:"offline",overheat:"overheating",underheat:"below their low threshold"}[action] : {offline:"mất kết nối",overheat:"quá nóng",underheat:"dưới ngưỡng nhiệt thấp"}[action];
    const scope = result.truncated || result.partial ? (en ? "In the retrieved results" : "Trong kết quả đã truy xuất") : (en ? "In the checked scope" : "Trong phạm vi đã kiểm tra");
    const headline = en ? `${scope}: ${devices.length} device(s) ${label}${devices.length ? ": " + devices.map(d=>d.deviceId).join(", ") : ""}.` : `${scope}: ${devices.length} thiết bị ${label}${devices.length ? ": " + devices.map(d=>d.deviceId).join(", ") : ""}.`;
    // Thời gian truy vấn không được gọi là lần thiết bị cập nhật cuối.
    return headline + (result.queriedAt ? `\n${en ? "Database queried at" : "Truy vấn database lúc"}: ${result.queriedAt}.` : "");
  }
  if (action === "summary" && result.counts) {
    const c=result.counts;
    return en ? `Checked ${c.inspected} devices: ${c.gatewayOnline} gateways online, ${c.offline} offline, ${c.stale} with stale data, ${c.overheat} overheat, ${c.underheat} underheat. Categories can overlap.` : `Đã kiểm tra ${c.inspected} thiết bị: ${c.gatewayOnline} gateway có kết nối, ${c.offline} mất kết nối, ${c.stale} dữ liệu cũ, ${c.overheat} quá nóng, ${c.underheat} dưới ngưỡng nhiệt. Các nhóm có thể trùng nhau.`;
  }
  if (action === "alerts" && result.alerts) return en ? `${result.alerts.length} alert events in the queried period.` : `${result.alerts.length} sự kiện cảnh báo trong khoảng đã truy vấn.`;
  return "";
}
