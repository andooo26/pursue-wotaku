import { NextResponse } from 'next/server';

const SCOPE = 'playlist-modify-public playlist-modify-private';

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Spotify redirect URI not configured. Set SPOTIFY_REDIRECT_URI (e.g. http://localhost:3000/api/spotify/callback)' },
      { status: 500 }
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPE,
  });

  const url = `https://accounts.spotify.com/authorize?${params.toString()}`;
  return NextResponse.redirect(url);
}
