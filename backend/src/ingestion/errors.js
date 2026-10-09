// Các lỗi nghiệp vụ cần báo rõ cho firmware: thiết bị lạ, gateway không khớp hoặc ID bị dùng lại sai.
export class IngestionError extends Error {
  constructor(code) { super(code); this.code = code; }
}
