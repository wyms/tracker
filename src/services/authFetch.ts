import { auth } from './firebase';

/**
 * Fetch wrapper that includes the Firebase ID token as a Bearer token
 * when a user is authenticated. Falls back to regular fetch if not.
 */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);

  if (auth?.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    } catch {
      // Token retrieval failed — proceed without auth
    }
  }

  return fetch(url, { ...init, headers });
}
