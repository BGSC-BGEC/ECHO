// Small persisted settings. AFTER_FIRST_UNLOCK so the background uploader can read the session
// while an iPhone is locked (the default WHEN_UNLOCKED keychain class fails there).
import * as SecureStore from 'expo-secure-store';

const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
/** null = not stored; undefined = couldn't read right now (e.g. iPhone locked before first unlock) — retry later. */
export const kvGet = (k: string): Promise<string | null | undefined> => SecureStore.getItemAsync(k, opts).catch(() => undefined);
export const kvSet = (k: string, v: string) => SecureStore.setItemAsync(k, v, opts).catch(() => {});
export const kvDel = (k: string) => SecureStore.deleteItemAsync(k, opts).catch(() => {});
