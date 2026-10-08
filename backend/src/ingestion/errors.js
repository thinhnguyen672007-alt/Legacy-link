export class IngestionError extends Error {
  constructor(code) { super(code); this.code = code; }
}
