'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Rekog } from '@/components/Rekog';
import { db } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [result, setResult] = useState<{ title: string; artist: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // 録音
  const startRecognition = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendToAudd(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      setIsRecording(true);
      setResult(null);
      mediaRecorder.start();

      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          setIsRecording(false);
        }
      }, 8000); // 秒数
    } catch (error) {
      console.error('Error starting recognition:', error);
      setIsRecording(false);
    }
  };

  // audd叩く
  const sendToAudd = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('return', 'spotify');
      formData.append('api_token', process.env.NEXT_PUBLIC_AUDD_API_KEY || '');

      const response = await fetch('https://api.audd.io/', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.status === 'success' && data.result) {
        const title = data.result.title || '';
        const artist = data.result.artist || '';

        setResult({ title, artist });

        // DBに保存
        if (user) {
          try {
            await addDoc(collection(db, 'Rekog'), {
              title,
              artist,
              userId: user.uid,
              timeStamp: serverTimestamp(),
              analysis: false,
            });
            // 保存完了後リロード
            window.location.reload();
          } catch (e) {
            console.error('Error:', e);
          }
        }
      } else {
        setResult({ title: '音楽を認識できませんでした', artist: '' });
      }
    } catch (error) {
      console.error('Error sending to audd:', error);
      setResult({ title: 'エラーが発生しました', artist: '' });
    }
  };

  if (loading) {
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
      }}
    >
      <div
        style={{
          marginTop: '40px',
          width: '220px',
          height: '220px',
          borderRadius: '50%',
          border: '3px solid #fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <button
          onClick={startRecognition}
          disabled={isRecording}
          className="rekog-button"
          style={{ 
            cursor: isRecording ? 'not-allowed' : 'pointer',
            background: 'transparent',
            outline: 'none',
          }}
        >
          {isRecording ? '認識中...' : '認識開始'}
        </button>
      </div>
      {result && (
        <div style={{ marginTop: '20px', color: '#fff', textAlign: 'center' }}>
          {result.title} / {result.artist}
        </div>
      )}
      <Rekog />
    </div>
  );
}
