export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errorBody = (error, requestId) => ({
  error: {
    code: error.code ?? 'internal_error',
    message: error.message || 'Internal service error',
    requestId,
    ...(error.details !== undefined ? { details: error.details } : {}),
  },
});
