// Luồng nhận dữ liệu: kiểm tra payload → lưu database → gửi ACK. ACK committed nghĩa là đã lưu, không chỉ đã nhận MQTT.
import { count, startTiming } from '../observability.js';
import { IngestionError } from './errors.js';

// Nhận hàm publish từ bên ngoài để kiểm thử được thứ tự: lưu database xong mới trả ACK.
export function createIngestionHandler({ kind, validate, save, publish, logger = console }) {
  return async (deviceId, payload, packet) => {
    count('received');
    const finish = startTiming(packet?.receivedAt);
    const result = validate(deviceId, payload);
    if (!result.ok) {
      count('validationRejected');
      logger.warn(`[INGESTION] ${kind} invalid_payload: ${result.errors.join('; ')}`);
      return; // Dữ liệu sai chưa được xác minh: không gửi ACK tới một địa chỉ gateway tùy ý.
    }
    const event = result.value;
    const messageId = kind === 'alarm' ? event.eventId : event.messageId;
    const reply = (status, reason) =>
      publish(`legacy-link/gateways/${event.gatewayId}/ingestion/ack`, {
        schemaVersion: 1,
        deviceId,
        kind,
        messageId,
        status,
        ...(reason ? { reason } : {}),
      });
    try {
      const saved = await save(event); // Chỉ trả kết quả sau COMMIT: database đã lưu xong, hoặc xác nhận bản trùng đã lưu trước đó.
      finish();
      count(saved.inserted ? 'stored' : 'duplicate');
      if (messageId) {
        try {
          await reply('committed');
          count('ackCommitted');
        } catch (error) {
          count('ackFailed');
          logger.error('[INGESTION] ACK failed:', error.message);
        }
      }
      logger.info(`[INGESTION] ${kind} ${deviceId}: ${saved.inserted ? 'stored' : 'duplicate'}`);
    } catch (error) {
      count(error instanceof IngestionError ? 'policyRejected' : 'saveFailed');
      logger.error(`[INGESTION] ${kind} ${deviceId}: ${error.code ?? error.message}`);
      // rejected nghĩa là dữ liệu chưa được chấp nhận; firmware phải giữ/cách ly và báo lỗi.
      // Chỉ committed mới cho phép xóa mẫu. Database lỗi thì không có ACK thành công.
      if (messageId && error instanceof IngestionError) {
        try {
          await reply('rejected', error.code);
        } catch (ackError) {
          logger.error(`[INGESTION] ACK failed: ${ackError.message}`);
        }
      }
    }
  };
}
