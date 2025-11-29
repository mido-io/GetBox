
export class PlatformNotSupportedError extends Error {
  constructor(url) {
    super(`No extractor found for URL: ${url}`);
    this.name = "PlatformNotSupportedError";
  }
}

export class ExtractionError extends Error {
  constructor(message, platform) {
    super(`[${platform}] ${message}`);
    this.name = "ExtractionError";
    this.platform = platform;
  }
}

export class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = "NetworkError";
  }
}
