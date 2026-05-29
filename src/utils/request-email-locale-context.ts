import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestEmailLocaleStore = {
  acceptLanguage?: string;
};

export const requestEmailLocaleStorage = new AsyncLocalStorage<RequestEmailLocaleStore>();

export function getRequestAcceptLanguage(): string | undefined {
  return requestEmailLocaleStorage.getStore()?.acceptLanguage;
}
