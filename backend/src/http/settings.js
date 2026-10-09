// Đọc địa chỉ/cổng HTTP từ môi trường. Cổng 0 chỉ dùng khi test để hệ điều hành chọn cổng còn trống.
export function httpSettings(env=process.env) {
  const raw=env.HTTP_PORT??'3000';
  if(!/^\d+$/.test(raw) || Number(raw)>65535) throw new Error('HTTP_PORT must be an integer between 0 and 65535');
  return {host:env.HTTP_HOST??'0.0.0.0',port:Number(raw)};
}
