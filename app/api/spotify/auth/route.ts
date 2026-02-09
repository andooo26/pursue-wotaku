import { NextResponse } from 'next/server';
import { getSpotifyRedirectUri } from '@/lib/spotify-auth';

const SCOPE =
  'playlist-modify-public playlist-modify-private playlist-read-private playlist-read-collaborative';

export async function GET(request: Request) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = getSpotifyRedirectUri(request);

  if (!clientId) {
    return NextResponse.json(
      { error: 'Spotify CLIENT_ID not configured. Set SPOTIFY_CLIENT_ID in environment variables.' },
      { status: 500 }
    );
  }

  if (!redirectUri) {
    return NextResponse.json(
      { error: 'Could not determine redirect URI. Set SPOTIFY_REDIRECT_URI (e.g. https://your-app.vercel.app/api/spotify/callback) or ensure the request has Host header.' },
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
