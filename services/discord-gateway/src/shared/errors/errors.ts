export class AppError extends Error {
  public code: string;
  public statusCode: number;

  constructor(message: string, code: string, statusCode: number = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigError extends AppError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR", 500);
    this.name = "ConfigError";
  }
}

export class AudioError extends AppError {
  constructor(message: string) {
    super(message, "AUDIO_ERROR", 500);
    this.name = "AudioError";
  }
}

export class VoiceConnectionError extends AppError {
  constructor(message: string) {
    super(message, "VOICE_CONNECTION_ERROR", 500);
    this.name = "VoiceConnectionError";
  }
}

export class ValidationError extends AppError {
  public details?: Record<string, string[]>;

  constructor(message: string, details?: Record<string, string[]>) {
    super(message, "VALIDATION_ERROR", 400);
    this.details = details;
    this.name = "ValidationError";
  }
}
