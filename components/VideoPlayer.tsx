import React, { useRef, useEffect } from 'react';

interface VideoPlayerProps {
  videoFile: File | null;
  onLoadedMetadata?: (duration: number) => void;
  currentTime?: number;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoFile, onLoadedMetadata, currentTime }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    if (videoFile && videoRef.current) {
      if (objectUrl.current) {
        URL.revokeObjectURL(objectUrl.current);
      }
      objectUrl.current = URL.createObjectURL(videoFile);
      videoRef.current.src = objectUrl.current;
    }

    return () => {
      if (objectUrl.current) {
        URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = null;
      }
    };
  }, [videoFile]);

  useEffect(() => {
    if (videoRef.current && currentTime !== undefined) {
      videoRef.current.currentTime = currentTime;
      videoRef.current.play().catch(() => {
        // Autoplay might be blocked, user needs to interact
      });
    }
  }, [currentTime]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-mecha-panel bg-black shadow-2xl group">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-mecha-accent to-transparent opacity-50 z-10"></div>
      <video
        ref={videoRef}
        className="w-full h-auto max-h-[400px] object-contain"
        controls
        onLoadedMetadata={(e) => onLoadedMetadata?.(e.currentTarget.duration)}
      />
      {!videoFile && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-mecha-panel font-display text-xl tracking-widest uppercase">No Signal</p>
        </div>
      )}
    </div>
  );
};