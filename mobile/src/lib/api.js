import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const TOKEN_KEY = 'auth_token';

// expo-secure-store is native-only; on web fall back to localStorage
// (guarded because web output is server-rendered, where it doesn't exist).
const isWeb = Platform.OS === 'web';
const webStorage = () => (typeof localStorage !== 'undefined' ? localStorage : null);

export const getToken = async () =>
  isWeb ? webStorage()?.getItem(TOKEN_KEY) ?? null : SecureStore.getItemAsync(TOKEN_KEY);
export const setToken = async (token) =>
  isWeb ? webStorage()?.setItem(TOKEN_KEY, token) : SecureStore.setItemAsync(TOKEN_KEY, token);
export const clearToken = async () =>
  isWeb ? webStorage()?.removeItem(TOKEN_KEY) : SecureStore.deleteItemAsync(TOKEN_KEY);

// api('/listings')  or  api('/listings/5/purchase', { method: 'POST' })
export async function api(path, { method = 'GET', body } = {}) {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
