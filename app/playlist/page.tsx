'use client';

import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

interface PlaylistData {
  id: string;
  title: string;
  artist: string;
  timeText: string;
  genres: string[];
  trackId?: string;
}

interface GenreGroup {
  genre: string;
  songs: PlaylistData[];
}

function PlaylistContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [genreGroups, setGenreGroups] = useState<GenreGroup[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expandedGenres, setExpandedGenres] = useState<Set<string>>(new Set());
  const [genreSectionOpen, setGenreSectionOpen] = useState(false);
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);
  const [spotifyLinked, setSpotifyLinked] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      fetchPlaylistData();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetch('/api/spotify/me', { credentials: 'include' })
      .then((r) => r.ok)
      .then(setSpotifyLinked)
      .catch(() => setSpotifyLinked(false));
  }, [user]);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) {
      alert(decodeURIComponent(err));
      router.replace('/playlist', { scroll: false });
    }
  }, [searchParams, router]);

  const toggleSongSelection = (songId: string) => {
    setSelectedSongIds((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  };

  const getSelectedTracks = (): { uri: string; title: string }[] => {
    const seen = new Set<string>();
    const result: { uri: string; title: string }[] = [];
    for (const group of genreGroups) {
      for (const song of group.songs) {
        if (selectedSongIds.has(song.id) && song.trackId && !seen.has(song.id)) {
          seen.add(song.id);
          result.push({ uri: `spotify:track:${song.trackId}`, title: song.title });
        }
      }
    }
    return result;
  };

  const addToSpotifyPlaylist = async () => {
    const tracks = getSelectedTracks();
    if (tracks.length === 0) {
      const selectedWithoutTrack = Array.from(selectedSongIds).length;
      if (selectedWithoutTrack > 0) {
        alert('選択された楽曲のうち、Spotify ID が登録されているものがないか、Spotify と連携されていません。まず「Spotify と連携」を押してログインしてください。');
      } else {
        alert('楽曲を選択してください。');
      }
      return;
    }
    setAddingToPlaylist(true);
    try {
      const res = await fetch('/api/spotify/add-to-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackUris: tracks.map((t) => t.uri) }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          setSpotifyLinked(false);
          alert('Spotify の連携が切れています。「Spotify と連携」から再度ログインしてください。');
        } else {
          alert(data.error || 'プレイリストへの追加に失敗しました。');
        }
        return;
      }
      alert(`${data.addedCount ?? tracks.length} 曲をプレイリストに追加しました。`);
      setSelectedSongIds(new Set());
    } catch (e) {
      console.error(e);
      alert('プレイリストへの追加に失敗しました。');
    } finally {
      setAddingToPlaylist(false);
    }
  };

  const fetchPlaylistData = async () => {
    if (!user) {
      setLoadingData(false);
      return;
    }

    try {
      const q = query(
        collection(db, 'Rekog'),
        where('userId', '==', user.uid),
        orderBy('timeStamp', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const allSongs: PlaylistData[] = [];

      querySnapshot.forEach((docSnapshot) => {
        const docData = docSnapshot.data() as any;
        const ts = docData.timeStamp;
        const date = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
        const timeText = date ? date.toLocaleString('ja-JP') : '';
        const genres = docData.genres || [];

        // ジャンルがある楽曲のみを追加
        if (genres.length > 0) {
          allSongs.push({
            id: docSnapshot.id,
            title: docData.title || '',
            artist: docData.artist || '',
            timeText,
            genres,
            trackId: docData.trackId || undefined,
          });
        }
      });

      // ジャンルごとにグループ化
      const genreMap = new Map<string, PlaylistData[]>();

      allSongs.forEach((song) => {
        song.genres.forEach((genre) => {
          if (!genreMap.has(genre)) {
            genreMap.set(genre, []);
          }
          genreMap.get(genre)!.push(song);
        });
      });

      // ジャンル名でソートして配列に変換
      const groups: GenreGroup[] = Array.from(genreMap.entries())
        .map(([genre, songs]) => ({
          genre,
          songs: songs.sort((a, b) => {
            // タイムスタンプでソート（新しい順）
            return b.timeText.localeCompare(a.timeText);
          }),
        }))
        .sort((a, b) => a.genre.localeCompare(b.genre));

      setGenreGroups(groups);
    } catch (error: any) {
      console.error('Error fetching playlist data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  if (loading || loadingData) {
    return null;
  }

  if (!user) {
    return null;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflowX: 'hidden',
        paddingTop: '40px',
        paddingBottom: '80px',
        color: '#fff',
      }}
    >
      {genreGroups.length === 0 ? (
        <div>ジャンル別のデータがありません</div>
      ) : (
        <div style={{ width: '90%', maxWidth: '800px' }}>
          <div
            style={{
              marginBottom: '24px',
              border: '2px solid #ff0000',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => setGenreSectionOpen((prev) => !prev)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '18px',
                  fontWeight: '600',
                  textAlign: 'left',
                }}
              >
                <span>ジャンル別の認識履歴</span>
                <span
                  style={{
                    display: 'inline-block',
                    transition: 'transform 0.2s ease',
                    transform: genreSectionOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                >
                  ▼
                </span>
              </button>
              {spotifyLinked ? (
                <button
                  type="button"
                  onClick={addToSpotifyPlaylist}
                  disabled={addingToPlaylist || selectedSongIds.size === 0}
                  style={{
                    flexShrink: 0,
                    padding: '8px 16px',
                    background: selectedSongIds.size > 0 ? '#1db954' : '#333',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '20px',
                    cursor: addingToPlaylist || selectedSongIds.size === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                  }}
                >
                  {addingToPlaylist ? '追加中...' : 'プレイリストへ追加'}
                </button>
              ) : (
                <a
                  href="/api/spotify/auth"
                  style={{
                    flexShrink: 0,
                    padding: '8px 16px',
                    background: '#1db954',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                    textDecoration: 'none',
                  }}
                >
                  Spotify と連携
                </a>
              )}
            </div>
            {genreSectionOpen && (
              <div style={{ padding: '0 20px 20px', borderTop: '1px solid #333' }}>
                {genreGroups.map((group) => (
                  <div
                    key={group.genre}
                    style={{
                      marginTop: '24px',
                      padding: '20px',
                      border: '1px solid #444',
                      borderRadius: '8px',
                    }}
                  >
                    <h2
                      style={{
                        margin: '0 0 20px 0',
                        fontSize: '20px',
                        fontWeight: '600',
                        borderBottom: '1px solid #333',
                        paddingBottom: '10px',
                      }}
                    >
                      # {group.genre}
                    </h2>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {(expandedGenres.has(group.genre) ? group.songs : group.songs.slice(0, 5)).map((song, index) => (
                        <li key={`${song.id}-${index}`} style={{ marginBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <span style={{ marginRight: '4px' }}>{index + 1}.</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div>{song.title}</div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '14px',
                                  color: '#ccc',
                                  marginTop: '4px',
                                  gap: '8px',
                                }}
                              >
                                <span>{song.artist}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                  {song.timeText && <span>{song.timeText}</span>}
                                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedSongIds.has(song.id)}
                                      onChange={() => toggleSongSelection(song.id)}
                                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                    />
                                  </label>
                                </span>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {group.songs.length > 5 && !expandedGenres.has(group.genre) && (
                      <button
                        onClick={() => {
                          setExpandedGenres((prev) => new Set(prev).add(group.genre));
                        }}
                        style={{
                          marginTop: '12px',
                          padding: '6px 12px',
                          background: 'transparent',
                          color: '#808080',
                          border: '1px solid #808080',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '500',
                        }}
                      >
                        もっと見る
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlaylistPage() {
  return (
    <Suspense fallback={null}>
      <PlaylistContent />
    </Suspense>
  );
}
