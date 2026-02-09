/**
 * Spotify OAuth で使うリダイレクトURIを決定する。
 * 優先: SPOTIFY_REDIRECT_URI > VERCEL_URL > リクエストの origin
 */
export function getSpotifyRedirectUri(request: Request): string | undefined {
  const envUri = process.env.SPOTIFY_REDIRECT_URI;
  if (envUri && envUri.trim()) return envUri.trim();

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, '')}/api/spotify/callback`;

  try {
    const url = new URL(request.url);
    return `${url.origin}/api/spotify/callback`;
  } catch {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const proto =
      request.headers.get('x-forwarded-proto') ||
      (host?.includes('localhost') ? 'http' : 'https');
    if (host) return `${proto}://${host}/api/spotify/callback`;
  }
  return undefined;
}
