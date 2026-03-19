/**
 * Spotify OAuth で使うリダイレクトURIを決定する。
 * 優先: SPOTIFY_REDIRECT_URI > リクエストの Host > VERCEL_URL > request.url
 */
export function getSpotifyRedirectUri(request: Request): string | undefined {
  const envUri = process.env.SPOTIFY_REDIRECT_URI;
  if (envUri && envUri.trim()) return envUri.trim();

  // カスタムドメイン対応: リクエストの Host から組み立て（Vercel で確実に取得できる）
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto =
    request.headers.get('x-forwarded-proto') ||
    (host?.includes('localhost') ? 'http' : 'https');
  if (host) return `${proto}://${host.split(',')[0].trim()}/api/spotify/callback`;

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, '')}/api/spotify/callback`;

  try {
    const url = new URL(request.url);
    return `${url.origin}/api/spotify/callback`;
  } catch {
    return undefined;
  }
}
