'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, updateDoc, doc } from 'firebase/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface RekogData {
  id: string;
  title: string;
  artist: string;
  timeText: string;
  genres: string[];
}

interface RekogProps {
  maxItems?: number;
}

export function Rekog({ maxItems }: RekogProps) {
  const { user } = useAuth();
  const [rekogList, setRekogList] = useState<RekogData[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchRekogData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      let q = query(
        collection(db, 'Rekog'),
        where('userId', '==', user.uid),
        orderBy('timeStamp', 'desc')
      );
      if (maxItems) {
        q = query(q, limit(maxItems));
      }
      const querySnapshot = await getDocs(q);
      const data: RekogData[] = [];
      querySnapshot.forEach((docSnapshot) => {
        const docData = docSnapshot.data() as any;
        const ts = docData.timeStamp;
        const date = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
        const timeText = date ? date.toLocaleString('ja-JP') : '';

        data.push({
          id: docSnapshot.id,
          title: docData.title || '',
          artist: docData.artist || '',
          timeText,
          genres: docData.genres || [],
        });
      });
      setRekogList(data);
    } catch (error: any) {
      console.error('Error fetching rekog data:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      if (error.code === 'permission-denied') {
        console.error('security rules');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRekogData();
  }, [user, maxItems]);

  const translateWithGemini = async (title: string, artist: string): Promise<{ title: string; artist: string }> => {
    const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
You are a music metadata normalization system.

Use Google Search to verify that the song and artist combination exists.

Tasks:
- Verify the song exists.
- Convert title and artist into the most commonly used Japanese localized names.
- If no Japanese localization is used, keep the English.
- Do not hallucinate.
- If not verified, return null.

Output JSON only.

Input:
Title: "{{TITLE}}"
Artist: "{{ARTIST}}"

`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // JSON整形
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          title: parsed.title || title,
          artist: parsed.artist || artist,
        };
      }
      return { title, artist };
    } catch (error) {
      console.error('Error translating with Gemini:', error);
      return { title, artist };
    }
  };

  const handleSync = async () => {
    if (!user || syncing) return;

    setSyncing(true);
    try {
      // 全てのドキュメントを取得
      let q = query(
        collection(db, 'Rekog'),
        where('userId', '==', user.uid),
        orderBy('timeStamp', 'desc')
      );
      if (maxItems) {
        q = query(q, limit(maxItems));
      }
      const querySnapshot = await getDocs(q);
      
      const docsToTranslate: Array<{ id: string; title: string; artist: string }> = [];
      querySnapshot.forEach((docSnapshot) => {
        const docData = docSnapshot.data();
        // analysisがfalseのもののみを処理
        if (docData.analysis === false) {
          docsToTranslate.push({
            id: docSnapshot.id,
            title: docData.title || '',
            artist: docData.artist || '',
          });
        }
      });

      // 各ドキュメントを日本語化
      for (const item of docsToTranslate) {
        const translated = await translateWithGemini(item.title, item.artist);
        await updateDoc(doc(db, 'Rekog', item.id), {
          title: translated.title,
          artist: translated.artist,
          analysis: true,
        });
      }

      // 再取得
      await fetchRekogData();
    } catch (error) {
      console.error('Error syncing:', error);
    } finally {
      setSyncing(false);
    }
  };

  // データがなければありません、あれば title / artist / timeStamp のリスト
  return (
    <div style={{ border: '2px solid #ff8c00', padding: '20px', margin: '40px auto', width: '80%', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-10px', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>認識履歴</h2>
        {maxItems === undefined && (
          <button
            onClick={handleSync}
            disabled={syncing || loading}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              color: syncing ? '#6c757d' : '#28a745',
              border: '1px solid #fff',
              borderRadius: '4px',
              cursor: syncing || loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            {syncing ? '同期中' : '変更を同期'}
          </button>
        )}
      </div>
      {loading ? (
        <div></div>
      ) : rekogList.length === 0 ? (
        <div>データがありません</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rekogList.map((item, index) => (
            <li key={item.id} style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <span style={{ marginRight: '8px' }}>{index + 1}.</span>
                <div style={{ flex: 1 }}>
                  <div>{item.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#ccc', marginTop: '4px' }}>
                    <span>{item.artist}</span>
                    {item.timeText && <span>{item.timeText}</span>}
                  </div>
                  {item.genres && item.genres.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                      {item.genres.map((genre, genreIndex) => (
                        <span
                          key={genreIndex}
                          style={{
                            background: '#808080',
                            color: '#fff',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                          }}
                        >
                          {genre}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
