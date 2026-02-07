'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface RekogData {
  id: string;
  title: string;
  artist: string;
}

export function Rekog() {
  const { user } = useAuth();
  const [rekogList, setRekogList] = useState<RekogData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // userIdがログイン中のユーザのもの, titleとartistを取得
    const fetchRekogData = async () => {
      try {
        const q = query(
          collection(db, 'Rekog'),
          where('userId', '==', user.uid)
        );
        const querySnapshot = await getDocs(q);
        const data: RekogData[] = [];
        querySnapshot.forEach((doc) => {
          const docData = doc.data();
          console.log('Document ID:', doc.id);
          console.log('Document Data:', docData);
          data.push({
            id: doc.id,
            title: docData.title || '',
            artist: docData.artist || '',
          });
        });
        console.log('Total documents:', data.length);
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

    fetchRekogData();
  }, [user]);

  // データがなければありません、あればtitle/artistのリスト
  return (
    <div style={{ border: '2px solid #ff8c00', padding: '20px', margin: '40px auto', width: '80%', color: '#fff' }}>
      <h2 style={{ marginTop: '-10px' }}>認識履歴</h2>
      {loading ? (
        <div></div>
      ) : rekogList.length === 0 ? (
        <div>データがありません</div>
      ) : (
<<<<<<< Updated upstream
        <ul>
          {rekogList.map((item) => (
            <li key={item.id}>
              {item.title} / {item.artist}
=======
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
                </div>
              </div>
>>>>>>> Stashed changes
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
