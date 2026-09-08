export class BootstrapError extends Error { constructor(message: string, options?: { cause?: unknown }) { super(message, options); this.name = 'BootstrapError'; } }
