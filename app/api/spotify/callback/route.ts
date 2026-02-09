import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (error || !code) {
    const message = error === 'access_denied' ? 'Spotify へのアクセスが許可されませんでした。' : 'Spotify 認証に失敗しました。';
    return NextResponse.redirect(new URL(`/playlist?error=${encodeURIComponent(message)}`, request.url));
  }

  if (!redirectUri || !clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/playlist?error=' + encodeURIComponent('Spotify の設定がありません。'), request.url));
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Spotify token exchange failed:', response.status, text);
    return NextResponse.redirect(new URL('/playlist?error=' + encodeURIComponent('Spotify トークンの取得に失敗しました。'), request.url));
  }

  const data = await response.json();
  const refreshToken = data.refresh_token;

  if (!refreshToken) {
    return NextResponse.redirect(new URL('/playlist?error=' + encodeURIComponent('Spotify のリフレッシュトークンが取得できませんでした。'), request.url));
  }

  const cookieStore = await cookies();
  const isProd = process.env.NODE_ENV === 'production';
  cookieStore.set('spotify_refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1年
  });

  return NextResponse.redirect(new URL('/playlist', request.url));
}
