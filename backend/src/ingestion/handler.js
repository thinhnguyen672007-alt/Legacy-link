import { IngestionError } from './errors.js';

// publish is injectable so tests can prove ACK ordering and lost-ACK recovery.
export function createIngestionHandler({ kind, validate, save, publish, logger = console }) {
  return async (deviceId, payload) => {
    const result = validate(deviceId, payload);
    if (!result.ok) {
      logger.warn(`[INGESTION] ${kind} invalid_payload: ${result.errors.join('; ')}`);
      return; // Do not publish to an unvalidated gateway/topic.
    }
    const event = result.value;
    const messageId = kind === 'alarm' ? event.eventId : event.messageId;
    const reply = (status, reason) => publish(
      `legacy-link/gateways/${event.gatewayId}/ingestion/ack`,
      { schemaVersion: 1, deviceId, kind, messageId, status, ...(reason ? { reason } : {}) });
    try {
      const saved = await save(event); // Resolves only AFTER COMMIT (including duplicates).
      if (messageId) await reply('committed');
      logger.info(`[INGESTION] ${kind} ${deviceId}: ${saved.inserted ? 'stored' : 'duplicate'}`);
    } catch (error) {
      logger.error(`[INGESTION] ${kind} ${deviceId}: ${error.code ?? error.message}`);
      // A rejected event is NOT persisted. Firmware must surface/quarantine it,
      // never count it as committed. Infrastructure errors get no success ACK.
      if (messageId && error instanceof IngestionError) {
        try { await reply('rejected', error.code); }
        catch (ackError) { logger.error(`[INGESTION] ACK failed: ${ackError.message}`); }
      }
    }
  };
}
