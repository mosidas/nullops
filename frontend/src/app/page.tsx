'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Greet } from '../../wailsjs/go/main/App';

export default function Home() {
  const [name, setName] = useState('');
  const [result, setResult] = useState('Please enter your name below 👇');
  const [loading, setLoading] = useState(false);

  async function handleGreet() {
    if (!name || loading) return;
    setLoading(true);
    try {
      const res = await Greet(name);
      setResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <main className="flex flex-col items-center gap-6 w-full max-w-md">
        <Image src="/logo-universal.png" alt="Logo" width={256} height={202} priority />
        <div className="text-center text-base" id="result">
          {result}
        </div>
        <div className="flex w-full gap-2">
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGreet()}
            className="flex-1 border rounded px-3 py-2 bg-transparent"
            placeholder="Your name"
          />
          <button
            type="button"
            onClick={handleGreet}
            disabled={loading}
            className="px-4 py-2 rounded bg-foreground text-background disabled:opacity-60"
          >
            {loading ? '...' : 'Greet'}
          </button>
        </div>
      </main>
    </div>
  );
}
