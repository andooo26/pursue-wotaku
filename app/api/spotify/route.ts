import { NextResponse } from 'next/server';

// アクセストークンを取得
async function getSpotifyAccessToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Spotify credentials not configured');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error('Failed to get Spotify access token');
  }

  const data = await response.json();
  return data.access_token;
}

// TrackIdより楽曲情報を取得
async function getTrackInfo(trackId: string, accessToken: string) {
  const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get track info');
  }

  return await response.json();
}

// ジャンル取得
async function getArtistInfo(artistId: string, accessToken: string) {
  const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get artist info');
  }

  return await response.json();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trackId } = body;

    if (!trackId) {
      return NextResponse.json({ error: 'Track ID is required' }, { status: 400 });
    }

    const accessToken = await getSpotifyAccessToken();
    const trackInfo = await getTrackInfo(trackId, accessToken);
    const artistId = trackInfo.artists?.[0]?.id;
    let genres: string[] = [];
    
    if (artistId) {
      const artistInfo = await getArtistInfo(artistId, accessToken);
      genres = artistInfo.genres || [];
    }

    return NextResponse.json({
      title: trackInfo.name || '',
      artist: trackInfo.artists?.map((a: any) => a.name).join(', ') || '',
      genres: genres,
    });
  } catch (error: any) {
    console.error('Spotify API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch Spotify data' },
      { status: 500 }
    );
  }
}
