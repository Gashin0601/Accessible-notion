import { LOG_PREFIX } from './constants';

let debugEnabled = false;

export function setDebugMode(enabled: boolean): void {
  debugEnabled = enabled;
}

export function logDebug(module: string, ...args: unknown[]): void {
  if (debugEnabled) {
    console.debug(`${LOG_PREFIX}[${module}]`, ...args);
  }
}

export function logInfo(module: string, ...args: unknown[]): void {
  console.info(`${LOG_PREFIX}[${module}]`, ...args);
}

export function logWarn(module: string, ...args: unknown[]): void {
  console.warn(`${LOG_PREFIX}[${module}]`, ...args);
}

export function logError(module: string, ...args: unknown[]): void {
  console.error(`${LOG_PREFIX}[${module}]`, ...args);
}
