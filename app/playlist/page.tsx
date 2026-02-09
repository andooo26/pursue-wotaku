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

interface SpotifyPlaylistItem {
  id: string;
  name: string;
  uri: string;
  tracksTotal?: number;
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

  // 既存プレイリストをジャンル分け
  const [playlistSectionOpen, setPlaylistSectionOpen] = useState(false);
  const [playlistsSearch, setPlaylistsSearch] = useState('');
  const [userPlaylists, setUserPlaylists] = useState<SpotifyPlaylistItem[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedPlaylistName, setSelectedPlaylistName] = useState<string>('');
  const [playlistGenreGroups, setPlaylistGenreGroups] = useState<GenreGroup[]>([]);
  const [loadingPlaylistTracks, setLoadingPlaylistTracks] = useState(false);
  const [expandedGenresPlaylist, setExpandedGenresPlaylist] = useState<Set<string>>(new Set());
  const [selectedPlaylistSongIds, setSelectedPlaylistSongIds] = useState<Set<string>>(new Set());
  const [addingToPlaylistFromSelection, setAddingToPlaylistFromSelection] = useState(false);

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

  const togglePlaylistSongSelection = (songId: string) => {
    setSelectedPlaylistSongIds((prev) => {
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

  const getSelectedTracksFromPlaylist = (): { uri: string; title: string }[] => {
    const seen = new Set<string>();
    const result: { uri: string; title: string }[] = [];
    for (const group of playlistGenreGroups) {
      for (const song of group.songs) {
        if (selectedPlaylistSongIds.has(song.id) && song.trackId && !seen.has(song.id)) {
          seen.add(song.id);
          result.push({ uri: `spotify:track:${song.trackId}`, title: song.title });
        }
      }
    }
    return result;
  };

  const addToSpotifyPlaylistFromSelection = async () => {
    const tracks = getSelectedTracksFromPlaylist();
    if (tracks.length === 0) {
      if (selectedPlaylistSongIds.size > 0) {
        alert('選択された楽曲に Spotify ID がありません。');
      } else {
        alert('楽曲を選択してください。');
      }
      return;
    }
    setAddingToPlaylistFromSelection(true);
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
      setSelectedPlaylistSongIds(new Set());
    } catch (e) {
      console.error(e);
      alert('プレイリストへの追加に失敗しました。');
    } finally {
      setAddingToPlaylistFromSelection(false);
    }
  };

  const fetchUserPlaylists = async () => {
    setLoadingPlaylists(true);
    try {
      const q = playlistsSearch ? `?q=${encodeURIComponent(playlistsSearch)}` : '';
      const res = await fetch(`/api/spotify/playlists${q}`, { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) setSpotifyLinked(false);
        setUserPlaylists([]);
        return;
      }
      const data = await res.json();
      setUserPlaylists(data.playlists ?? []);
    } catch {
      setUserPlaylists([]);
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const loadPlaylistTracks = async (playlistId: string, playlistName: string) => {
    setSelectedPlaylistId(playlistId);
    setSelectedPlaylistName(playlistName);
    setSelectedPlaylistSongIds(new Set());
    setLoadingPlaylistTracks(true);
    setPlaylistGenreGroups([]);
    try {
      const res = await fetch(
        `/api/spotify/playlist-tracks?playlistId=${encodeURIComponent(playlistId)}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'トラックの取得に失敗しました。');
        setSelectedPlaylistId(null);
        setSelectedPlaylistName('');
        return;
      }
      const data = await res.json();
      const tracks: PlaylistData[] = (data.tracks ?? [])
        .filter((t: any) => t.genres && t.genres.length > 0)
        .map((t: any) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          timeText: '',
          genres: t.genres,
          trackId: t.trackId ?? t.id,
        }));
      const genreMap = new Map<string, PlaylistData[]>();
      tracks.forEach((song) => {
        song.genres.forEach((genre) => {
          if (!genreMap.has(genre)) genreMap.set(genre, []);
          genreMap.get(genre)!.push(song);
        });
      });
      const groups: GenreGroup[] = Array.from(genreMap.entries())
        .map(([genre, songs]) => ({ genre, songs }))
        .sort((a, b) => a.genre.localeCompare(b.genre));
      setPlaylistGenreGroups(groups);
      setExpandedGenresPlaylist(new Set());
    } catch (e) {
      console.error(e);
      setSelectedPlaylistId(null);
      setSelectedPlaylistName('');
    } finally {
      setLoadingPlaylistTracks(false);
    }
  };

  useEffect(() => {
    if (!spotifyLinked || !playlistSectionOpen) return;
    fetchUserPlaylists();
  }, [spotifyLinked, playlistSectionOpen]);

  useEffect(() => {
    if (!spotifyLinked || !playlistSectionOpen) return;
    const t = setTimeout(() => fetchUserPlaylists(), 300);
    return () => clearTimeout(t);
  }, [playlistsSearch]);

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
      <div style={{ width: '90%', maxWidth: '800px' }}>
        {genreGroups.length === 0 && !spotifyLinked && (
          <div style={{ marginBottom: '24px' }}>ジャンル別のデータがありません</div>
        )}

        {genreGroups.length > 0 && (
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
        )}

        {/* 既存プレイリストをジャンル分け */}
        <div
          style={{
            marginBottom: '24px',
            border: '2px solid #1db954',
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
              onClick={() => setPlaylistSectionOpen((prev) => !prev)}
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
              <span>既存プレイリストをジャンル分け</span>
              <span
                style={{
                  display: 'inline-block',
                  transition: 'transform 0.2s ease',
                  transform: playlistSectionOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              >
                ▼
              </span>
            </button>
          </div>
          {playlistSectionOpen && (
            <div style={{ padding: '0 20px 20px', borderTop: '1px solid #333' }}>
              {!spotifyLinked ? (
                <div style={{ margin: '16px 0' }}>
                  <p style={{ color: '#aaa', marginBottom: '12px' }}>
                    Spotify と連携すると、既存のプレイリストを検索してジャンル別に表示できます。
                  </p>
                  <a
                    href="/api/spotify/auth"
                    style={{
                      display: 'inline-block',
                      padding: '8px 16px',
                      background: '#1db954',
                      color: '#fff',
                      borderRadius: '20px',
                      fontSize: '14px',
                      fontWeight: '600',
                      textDecoration: 'none',
                    }}
                  >
                    Spotify と連携
                  </a>
                </div>
              ) : (
                <>
                  <div style={{ marginTop: '16px', marginBottom: '16px' }}>
                    <input
                      type="text"
                      placeholder="プレイリスト名で検索"
                      value={playlistsSearch}
                      onChange={(e) => setPlaylistsSearch(e.target.value)}
                      style={{
                        width: '100%',
                        maxWidth: '400px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid #444',
                        background: '#222',
                        color: '#fff',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                  {loadingPlaylists ? (
                    <p style={{ color: '#aaa' }}>プレイリスト一覧を取得中...</p>
                  ) : userPlaylists.length === 0 ? (
                    <p style={{ color: '#aaa' }}>プレイリストがありません。</p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0' }}>
                      {userPlaylists.map((p) => (
                        <li key={p.id} style={{ marginBottom: '8px' }}>
                          <button
                            type="button"
                            onClick={() => loadPlaylistTracks(p.id, p.name)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '12px 16px',
                              background: selectedPlaylistId === p.id ? '#1db95433' : '#333',
                              border: '1px solid #444',
                              borderRadius: '8px',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: '14px',
                            }}
                          >
                            {p.name}
                            {p.tracksTotal != null && (
                              <span style={{ color: '#888', marginLeft: '8px' }}>({p.tracksTotal} 曲)</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {selectedPlaylistId && (
                    <>
                      <h3
                        style={{
                          margin: '16px 0 12px 0',
                          fontSize: '16px',
                          fontWeight: '600',
                          color: '#ccc',
                        }}
                      >
                        ジャンル別の選択したプレイリスト: {selectedPlaylistName}
                      </h3>
                      {loadingPlaylistTracks ? (
                        <p style={{ color: '#aaa' }}>トラックを取得中...</p>
                      ) : playlistGenreGroups.length === 0 ? (
                        <p style={{ color: '#aaa' }}>ジャンル情報がある楽曲がありません。</p>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                          {spotifyLinked && (
                            <button
                              type="button"
                              onClick={addToSpotifyPlaylistFromSelection}
                              disabled={
                                addingToPlaylistFromSelection || selectedPlaylistSongIds.size === 0
                              }
                              style={{
                                padding: '8px 16px',
                                background:
                                  selectedPlaylistSongIds.size > 0 ? '#1db954' : '#333',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '20px',
                                cursor:
                                  addingToPlaylistFromSelection || selectedPlaylistSongIds.size === 0
                                    ? 'not-allowed'
                                    : 'pointer',
                                fontSize: '14px',
                                fontWeight: '600',
                              }}
                            >
                              {addingToPlaylistFromSelection ? '追加中...' : 'プレイリストへ追加'}
                            </button>
                          )}
                        </div>
                      )}
                      {!loadingPlaylistTracks &&
                        playlistGenreGroups.map((group) => (
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
                              {(expandedGenresPlaylist.has(group.genre)
                                ? group.songs
                                : group.songs.slice(0, 5)
                              ).map((song, index) => (
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
                                        <span
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            flexShrink: 0,
                                          }}
                                        >
                                          <label
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              cursor: 'pointer',
                                            }}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={selectedPlaylistSongIds.has(song.id)}
                                              onChange={() =>
                                                togglePlaylistSongSelection(song.id)
                                              }
                                              style={{
                                                width: '18px',
                                                height: '18px',
                                                cursor: 'pointer',
                                              }}
                                            />
                                          </label>
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                            {group.songs.length > 5 && !expandedGenresPlaylist.has(group.genre) && (
                              <button
                                onClick={() => {
                                  setExpandedGenresPlaylist((prev) =>
                                    new Set(prev).add(group.genre)
                                  );
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
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
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
