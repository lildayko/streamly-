"use client";
import { useEffect, useState } from 'react';
export function ChannelAvatar({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <img className="channel-avatar-image" src={src} alt={`Аватар ${name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <span className="channel-avatar-fallback" aria-label={name}>{name.slice(0, 1).toUpperCase()}</span>;
}
