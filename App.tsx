import React, { useState, useRef, useCallback } from 'react';
import { VideoPlayer } from './components/VideoPlayer';
import { analyzeVideoForCharacter, generateCharacterSpeech } from './services/geminiService';
import { AppState, VoiceSegment, ProcessedAudio, SynthesisState } from './types';
import { parseTime, extractAudioSegment, bufferToWav, concatenateAudioBuffers } from './utils/audioUtils';

// Icons
const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

const LinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

const ChipIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
  </svg>
);

const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-1.818a1 1 0 000-1.764l-3-1.818z" clipRule="evenodd" />
  </svg>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const WaveformIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
  </svg>
);

const LayersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

// --- HELPER FOR DECODING RAW PCM FROM GEMINI TTS ---
const decodeBase64Audio = async (base64: string, ctx: AudioContext): Promise<AudioBuffer> => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  try {
     return await ctx.decodeAudioData(bytes.buffer.slice(0));
  } catch (e) {
     const sampleRate = 24000;
     const numChannels = 1;
     const dataInt16 = new Int16Array(bytes.buffer);
     const frameCount = dataInt16.length;
     const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
     const channelData = buffer.getChannelData(0);
     for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
     }
     return buffer;
  }
};

type InputMode = 'FILE' | 'URL';

// Add raw buffer to ProcessedAudio interface internally
interface ExtendedProcessedAudio extends ProcessedAudio {
    rawBuffer?: AudioBuffer;
}

export default function App() {
  const [inputMode, setInputMode] = useState<InputMode>('FILE');
  const [urlInput, setUrlInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [characterName, setCharacterName] = useState('Kou Uraki');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [segments, setSegments] = useState<VoiceSegment[]>([]);
  const [processedAudio, setProcessedAudio] = useState<Map<string, ExtendedProcessedAudio>>(new Map());
  const [previewTime, setPreviewTime] = useState<number>(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  // Merging State
  const [selectedSegments, setSelectedSegments] = useState<Set<string>>(new Set());
  const [mergedAudioUrl, setMergedAudioUrl] = useState<string | null>(null);
  const [totalSelectedDuration, setTotalSelectedDuration] = useState<number>(0);

  // Synthesis State
  const [synthesisState, setSynthesisState] = useState<SynthesisState>(SynthesisState.IDLE);
  const [synthesisText, setSynthesisText] = useState('');
  const [synthesizedAudioUrl, setSynthesizedAudioUrl] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState('Japanese');

  // Audio Processing Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceBufferRef = useRef<AudioBuffer | null>(null);

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-4), `> ${msg}`]);

  const processFile = (selectedFile: File) => {
      setFileError(null);
      // Check file size (approx 20MB limit for inline API calls)
      if (selectedFile.size > 20 * 1024 * 1024) {
        setFileError("文件过大 (>20MB)。请使用较短的视频片段。");
        addLog("WARNING: File exceeds 20MB. API may reject payload.");
      }

      setFile(selectedFile);
      setAppState(AppState.IDLE);
      setSegments([]);
      setProcessedAudio(new Map());
      setSelectedSegments(new Set());
      setTotalSelectedDuration(0);
      setMergedAudioUrl(null);
      setLogs([]);
      // Reset synthesis
      setSynthesisState(SynthesisState.IDLE);
      setSynthesizedAudioUrl(null);
      setSynthesisText('');
      
      addLog(`已加载文件: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`);
      
      // Initialize Audio Context and decode for later extraction
      const reader = new FileReader();
      reader.onload = async (evt) => {
        if (evt.target?.result) {
          try {
            const arrayBuffer = evt.target.result as ArrayBuffer;
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioContextRef.current = ctx;
            addLog("正在解码音轨...");
            const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
            sourceBufferRef.current = decodedBuffer;
            addLog(`音轨解码完成。时长: ${decodedBuffer.duration.toFixed(2)}s`);
          } catch (err) {
            console.error(err);
            addLog("音轨解码失败。");
          }
        }
      };
      reader.readAsArrayBuffer(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        processFile(e.target.files[0]);
    }
  };

  const handleUrlLoad = async () => {
      if (!urlInput) return;
      setIsDownloading(true);
      setFileError(null);
      addLog(`连接到远程流: ${urlInput}...`);

      try {
          const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(urlInput)}`;
          const response = await fetch(proxyUrl);
          if (!response.ok) {
              throw new Error(`Failed to fetch video: ${response.statusText}`);
          }
          const blob = await response.blob();
          const filename = urlInput.split('/').pop() || 'downloaded_video.mp4';
          const downloadedFile = new File([blob], filename, { type: blob.type || 'video/mp4' });
          
          addLog("下载完成。");
          setIsDownloading(false);
          processFile(downloadedFile);

      } catch (error: any) {
          console.error(error);
          setIsDownloading(false);
          setFileError("无法加载视频。可能是跨域限制(CORS)或链接无效。");
          addLog("连接失败。");
      }
  };

  const handleAnalyze = async () => {
    if (!file || !characterName) return;

    setAppState(AppState.ANALYZING);
    addLog("启动 Gemini 3.0 分析协议...");

    try {
      // Convert file to Base64 for Gemini
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        const base64Content = base64String.split(',')[1];

        try {
          const result = await analyzeVideoForCharacter(
            base64Content, 
            file.type, 
            characterName
          );
          
          setSegments(result.segments);
          addLog(`分析完成。找到 ${result.segments.length} 个片段。`);
          setAppState(AppState.READY);
          
          // Pre-process audio clips
          if (audioContextRef.current && sourceBufferRef.current) {
            addLog("正在提取音频片段...");
            const newProcessed = new Map<string, ExtendedProcessedAudio>();
            
            result.segments.forEach(seg => {
              const start = parseTime(seg.startTime);
              const end = parseTime(seg.endTime);
              const buffer = extractAudioSegment(
                sourceBufferRef.current!, 
                start, 
                end, 
                audioContextRef.current!
              );
              
              if (buffer) {
                const wavBlob = bufferToWav(buffer);
                const url = URL.createObjectURL(wavBlob);
                newProcessed.set(seg.id, {
                  id: seg.id,
                  blob: wavBlob,
                  url: url,
                  duration: end - start,
                  rawBuffer: buffer // Save raw buffer for merging later
                });
              }
            });
            setProcessedAudio(newProcessed);
            addLog("音频片段准备就绪。");
          }

        } catch (apiError: any) {
          console.error(apiError);
          addLog(`协议失败: ${apiError.message}`);
          setAppState(AppState.ERROR);
        }
      };
    } catch (error: any) {
      console.error(error);
      addLog(`系统错误: ${error.message}`);
      setAppState(AppState.ERROR);
    }
  };

  const handleToggleSelection = (id: string, duration: number) => {
    const newSelection = new Set(selectedSegments);
    if (newSelection.has(id)) {
      newSelection.delete(id);
      setTotalSelectedDuration(prev => Math.max(0, prev - duration));
    } else {
      newSelection.add(id);
      setTotalSelectedDuration(prev => prev + duration);
    }
    setSelectedSegments(newSelection);
  };

  const handleMergeAudio = () => {
    if (selectedSegments.size < 2 || !audioContextRef.current) return;
    
    // Sort selected segments by their order in the original segments array to maintain chronological order
    const orderedIds = segments
        .filter(seg => selectedSegments.has(seg.id))
        .map(seg => seg.id);

    const buffersToMerge: AudioBuffer[] = [];
    orderedIds.forEach(id => {
      const data = processedAudio.get(id);
      if (data && data.rawBuffer) {
        buffersToMerge.push(data.rawBuffer);
      }
    });

    addLog(`正在合并 ${buffersToMerge.length} 个片段...`);
    const mergedBuffer = concatenateAudioBuffers(buffersToMerge, audioContextRef.current);
    
    if (mergedBuffer) {
      const wavBlob = bufferToWav(mergedBuffer);
      const url = URL.createObjectURL(wavBlob);
      setMergedAudioUrl(url);
      addLog(`合并成功。总时长: ${mergedBuffer.duration.toFixed(2)}s`);
    } else {
      addLog("合并失败。");
    }
  };

  const handleSynthesize = async () => {
    if (!synthesisText || !characterName) return;
    setSynthesisState(SynthesisState.GENERATING);
    addLog("初始化神经拟态引擎 (Neural Mimicry Engine)...");

    // Determine Context: Use selected segments if available, otherwise use all (up to 5 to save tokens)
    let contextSegments = segments.filter(seg => selectedSegments.has(seg.id));
    if (contextSegments.length === 0) {
        contextSegments = segments.slice(0, 5);
        addLog("未选定特定片段，默认使用前5个作为参考。");
    } else {
        addLog(`使用 ${contextSegments.length} 个选中片段作为风格参考。`);
    }
    const contextLines = contextSegments.map(s => s.text);

    try {
        const base64Audio = await generateCharacterSpeech(
            synthesisText, 
            characterName, 
            contextLines,
            targetLanguage
        );
        
        // Decode the response
        if (audioContextRef.current) {
            const buffer = await decodeBase64Audio(base64Audio, audioContextRef.current);
            const wavBlob = bufferToWav(buffer);
            const url = URL.createObjectURL(wavBlob);
            setSynthesizedAudioUrl(url);
            addLog("拟态完成。音频已生成。");
            setSynthesisState(SynthesisState.COMPLETE);
        }
    } catch (e: any) {
        console.error(e);
        addLog(`合成错误: ${e.message}`);
        setSynthesisState(SynthesisState.ERROR);
    }
  };

  const playSegment = (segment: VoiceSegment) => {
    const start = parseTime(segment.startTime);
    setPreviewTime(start);
  };

  const downloadClip = (segmentId: string) => {
    const audioData = processedAudio.get(segmentId);
    if (audioData) {
      const a = document.createElement('a');
      a.href = audioData.url;
      a.download = `${characterName.replace(/\s+/g, '_')}_${segmentId}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="min-h-screen bg-mecha-dark text-slate-300 font-body selection:bg-mecha-accent selection:text-white p-6 pb-20">
      
      {/* Header */}
      <header className="max-w-6xl mx-auto mb-8 border-b border-mecha-panel pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-display font-bold text-white tracking-wider">
            VOICE<span className="text-mecha-accent">EXTRACT</span>
          </h1>
          <p className="text-slate-500 mt-1 uppercase tracking-widest text-xs">AI驱动的角色音频提取系统</p>
        </div>
        <div className="hidden md:flex items-center space-x-2 text-mecha-accent/50 text-xs font-mono">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          <span>系统在线 SYSTEM ONLINE</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Controls & Player */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* File Input */}
          <div className={`bg-mecha-panel/30 border p-6 rounded-lg backdrop-blur-sm ${fileError ? 'border-mecha-danger/50' : 'border-mecha-panel'}`}>
            
            {/* Input Mode Toggle */}
            <div className="flex space-x-4 mb-4 border-b border-mecha-panel/50 pb-2">
                <button 
                  onClick={() => setInputMode('FILE')}
                  className={`text-xs font-display uppercase tracking-widest pb-1 border-b-2 transition-colors ${inputMode === 'FILE' ? 'border-mecha-accent text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                    文件上传 (UPLOAD)
                </button>
                <button 
                  onClick={() => setInputMode('URL')}
                  className={`text-xs font-display uppercase tracking-widest pb-1 border-b-2 transition-colors ${inputMode === 'URL' ? 'border-mecha-accent text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                    直链加载 (URL)
                </button>
            </div>

            {inputMode === 'FILE' ? (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-mecha-panel rounded-lg cursor-pointer hover:border-mecha-accent hover:bg-mecha-accent/5 transition-all group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <div className="text-slate-400 group-hover:text-mecha-accent transition-colors mb-2">
                    <UploadIcon />
                    </div>
                    <p className="mb-2 text-sm text-slate-400 font-display">
                    {file ? file.name : "拖入视频文件 (DROP VIDEO DATA HERE)"}
                    </p>
                    <p className="text-xs text-slate-600">MP4, WEBM (最大 20MB)</p>
                </div>
                <input type="file" className="hidden" accept="video/*" onChange={handleFileChange} />
                </label>
            ) : (
                <div className="flex flex-col items-center justify-center w-full h-32 bg-black/20 rounded-lg p-4">
                     <div className="w-full flex space-x-2">
                        <input 
                           type="text" 
                           className="flex-1 bg-black/50 border border-mecha-panel text-white text-sm rounded-md focus:ring-mecha-accent focus:border-mecha-accent p-2.5 font-mono placeholder-slate-600"
                           placeholder="https://example.com/video.mp4"
                           value={urlInput}
                           onChange={(e) => setUrlInput(e.target.value)}
                        />
                        <button 
                           onClick={handleUrlLoad}
                           disabled={isDownloading || !urlInput}
                           className="bg-mecha-panel hover:bg-mecha-accent hover:text-black text-mecha-accent font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isDownloading ? '...' : <LinkIcon />}
                        </button>
                     </div>
                     <p className="mt-2 text-[10px] text-slate-500">
                        必须是视频文件的直链。由于跨域限制(CORS)，YouTube/B站等链接通常无法直接加载。
                     </p>
                </div>
            )}
            {fileError && <p className="mt-2 text-xs text-mecha-danger font-mono">{fileError}</p>}
          </div>

          {/* Video Player */}
          <VideoPlayer videoFile={file} currentTime={previewTime} />

          {/* Controls */}
          <div className="bg-mecha-panel/30 border border-mecha-panel p-6 rounded-lg space-y-4">
            <div>
              <label className="block text-xs font-display text-mecha-accent uppercase mb-2">目标角色 TARGET CHARACTER</label>
              <div className="flex gap-4">
                <input 
                  type="text" 
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  className="bg-black/50 border border-mecha-panel text-white text-sm rounded-md focus:ring-mecha-accent focus:border-mecha-accent block w-full p-2.5 font-mono"
                  placeholder="例如：浦木宏 (e.g. Kou Uraki)"
                />
                <button
                  onClick={handleAnalyze}
                  disabled={!file || appState === AppState.ANALYZING}
                  className={`px-6 py-2.5 rounded-md font-display font-bold uppercase tracking-wider transition-all
                    ${!file || appState === AppState.ANALYZING 
                      ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                      : 'bg-mecha-accent text-mecha-dark hover:bg-white hover:shadow-[0_0_15px_rgba(56,189,248,0.5)]'
                    }`}
                >
                  {appState === AppState.ANALYZING ? '扫描中...' : '开始提取 EXTRACT'}
                </button>
              </div>
            </div>

            {/* System Logs */}
            <div className="bg-black border border-mecha-panel/50 rounded p-3 h-32 overflow-hidden font-mono text-xs text-green-500/80">
               {logs.length === 0 && <span className="text-slate-700 opacity-50">系统就绪。等待指令。</span>}
               {logs.map((log, i) => (
                 <div key={i} className={`animate-pulse-slow ${log.includes("Failure") || log.includes("Error") ? 'text-mecha-danger' : log.includes("WARNING") ? 'text-mecha-warn' : ''}`}>
                   {log}
                 </div>
               ))}
            </div>
          </div>

          {/* Voice Cloning/Synthesis Lab */}
          <div className="bg-mecha-panel/30 border border-mecha-panel p-6 rounded-lg space-y-4 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-2 opacity-10">
                <WaveformIcon />
             </div>
             <div className="flex justify-between items-center border-b border-mecha-panel/50 pb-2">
                 <h3 className="text-lg font-display text-white">声音克隆实验室 (Voice Mimicry Lab)</h3>
                 <select 
                   value={targetLanguage}
                   onChange={(e) => setTargetLanguage(e.target.value)}
                   className="bg-black border border-mecha-panel text-xs text-mecha-accent rounded p-1 font-mono focus:border-mecha-accent outline-none"
                 >
                    <option value="Japanese">日语 (Japanese)</option>
                    <option value="Chinese">中文 (Chinese)</option>
                    <option value="English">英语 (English)</option>
                 </select>
             </div>
             
             <p className="text-xs text-slate-400">
                基于 
                {selectedSegments.size > 0 ? (
                    <span className="text-white mx-1 font-bold">{selectedSegments.size} 个选中片段</span>
                ) : (
                    <span className="text-slate-500 mx-1 italic">提取的内容</span>
                )}
                的音色风格，合成 <span className="text-mecha-accent">{targetLanguage}</span> 新台词。
             </p>
             
             <textarea 
                className="w-full bg-black/50 border border-mecha-panel rounded p-3 text-sm text-white font-mono focus:border-mecha-accent focus:ring-1 focus:ring-mecha-accent transition-all h-24 resize-none"
                placeholder={`输入想让 ${characterName} 说的话 (${targetLanguage})...`}
                value={synthesisText}
                onChange={(e) => setSynthesisText(e.target.value.slice(0, 300))}
                disabled={segments.length === 0 || synthesisState === SynthesisState.GENERATING}
             />
             <div className="flex justify-between items-center">
                 <span className="text-xs text-slate-500">{synthesisText.length}/300 字</span>
                 <button 
                    onClick={handleSynthesize}
                    disabled={segments.length === 0 || !synthesisText || synthesisState === SynthesisState.GENERATING}
                    className={`px-4 py-2 rounded text-xs font-bold font-display uppercase tracking-widest
                        ${segments.length === 0 || !synthesisText 
                            ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                            : 'bg-mecha-accent/20 text-mecha-accent border border-mecha-accent hover:bg-mecha-accent hover:text-black transition-all'
                        }
                    `}
                 >
                    {synthesisState === SynthesisState.GENERATING ? '生成中...' : '克隆音色 CLONE VOICE'}
                 </button>
             </div>

             {synthesizedAudioUrl && (
                 <div className="mt-4 p-4 bg-black/60 border border-mecha-accent/30 rounded flex items-center justify-between animate-pulse-slow">
                     <div className="flex items-center space-x-3">
                         <div className="w-8 h-8 rounded-full bg-mecha-accent flex items-center justify-center text-black">
                            <PlayIcon />
                         </div>
                         <div>
                             <p className="text-xs text-mecha-accent font-display">生成结果 (Generated Output)</p>
                             <p className="text-[10px] text-slate-500 uppercase">WAV • 24kHz • {targetLanguage}</p>
                         </div>
                     </div>
                     <audio controls src={synthesizedAudioUrl} className="h-8 w-48" />
                 </div>
             )}
          </div>

        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-5 flex flex-col h-full min-h-[500px]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display text-white">提取片段 (Extracted Segments)</h2>
            <span className="bg-mecha-panel px-2 py-1 rounded text-xs font-mono text-mecha-accent border border-mecha-accent/30">
              已找到 {segments.length}
            </span>
          </div>

          <div className="flex-1 bg-mecha-panel/20 border border-mecha-panel rounded-lg overflow-y-auto p-4 space-y-3 relative pb-32">
             {segments.length === 0 && appState !== AppState.ANALYZING && (
               <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 opacity-50">
                 <ChipIcon />
                 <p className="mt-2 font-display text-sm">暂无数据 NO DATA EXTRACTED</p>
               </div>
             )}

             {appState === AppState.ANALYZING && (
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-black/80 z-20">
                  <div className="w-16 h-1 bg-mecha-panel relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-mecha-accent animate-scan"></div>
                  </div>
                  <p className="font-mono text-mecha-accent text-xs animate-pulse">正在分析音频波形 ANALYZING AUDIO WAVEFORMS...</p>
                </div>
             )}

             {segments.map((seg) => {
               const processed = processedAudio.get(seg.id);
               const isSelected = selectedSegments.has(seg.id);
               return (
               <div key={seg.id} className={`border p-3 rounded group transition-all duration-300 ${isSelected ? 'bg-mecha-accent/10 border-mecha-accent' : 'bg-black/40 border-mecha-panel hover:border-mecha-accent/50'}`}>
                 <div className="flex justify-between items-start mb-2">
                   <div className="flex items-center space-x-3">
                     <input 
                       type="checkbox"
                       checked={isSelected}
                       onChange={() => processed && handleToggleSelection(seg.id, processed.duration)}
                       disabled={!processed}
                       className="w-4 h-4 rounded border-mecha-panel bg-black/50 text-mecha-accent focus:ring-mecha-accent focus:ring-offset-0 cursor-pointer disabled:opacity-50"
                     />
                     <span className="text-mecha-accent font-mono text-xs bg-mecha-accent/10 px-1 rounded">
                       {seg.startTime} - {seg.endTime}
                     </span>
                   </div>
                   <div className="flex space-x-2">
                     <button 
                       onClick={() => playSegment(seg)}
                       className="p-1 hover:text-white text-slate-400 transition-colors"
                       title="跳转视频进度"
                     >
                       <PlayIcon />
                     </button>
                     <button 
                       onClick={() => downloadClip(seg.id)}
                       disabled={!processed}
                       className={`p-1 transition-colors ${processed ? 'hover:text-mecha-accent text-slate-400' : 'text-slate-700'}`}
                       title="下载 WAV"
                     >
                       <DownloadIcon />
                     </button>
                   </div>
                 </div>
                 <p className={`text-sm italic transition-colors ${isSelected ? 'text-white' : 'text-slate-300'}`}>"{seg.text}"</p>
                 {processed && (
                   <div className="mt-2 flex items-center space-x-2">
                     <div className="flex-1 h-1 bg-slate-800 rounded overflow-hidden">
                       <div className={`h-full w-full ${isSelected ? 'bg-mecha-accent' : 'bg-green-500/50'}`}></div>
                     </div>
                     <span className="text-[10px] text-slate-500 font-mono">{processed.duration.toFixed(1)}s</span>
                   </div>
                 )}
               </div>
             )})}
          </div>

          {/* Merge Control Panel - Fixed at bottom of column */}
          <div className="mt-4 p-4 bg-mecha-panel/40 border-t-2 border-mecha-accent rounded-b-lg backdrop-blur sticky bottom-0">
             <div className="flex justify-between items-center mb-3">
                <div className="flex items-center space-x-2">
                    <LayersIcon />
                    <span className="text-sm font-display text-white">音频合并 MERGE BUFFER</span>
                </div>
                <div className={`text-xs font-mono px-2 py-1 rounded ${totalSelectedDuration >= 10 ? 'bg-green-500/20 text-green-400' : 'bg-mecha-warn/20 text-mecha-warn'}`}>
                    总时长: {totalSelectedDuration.toFixed(2)}s {totalSelectedDuration < 10 && '(建议 10s+)'}
                </div>
             </div>
             
             {mergedAudioUrl ? (
                <div className="flex items-center space-x-3 bg-black/50 p-2 rounded border border-green-500/30 animate-pulse-slow">
                     <audio controls src={mergedAudioUrl} className="h-8 flex-1" />
                     <a 
                       href={mergedAudioUrl} 
                       download={`${characterName.replace(/\s+/g, '_')}_merged_${Date.now()}.wav`}
                       className="p-2 bg-green-500 text-black rounded hover:bg-white transition-colors"
                     >
                        <DownloadIcon />
                     </a>
                     <button 
                       onClick={() => setMergedAudioUrl(null)}
                       className="text-xs text-slate-500 hover:text-white"
                     >
                        重置 (Reset)
                     </button>
                </div>
             ) : (
                <button
                    onClick={handleMergeAudio}
                    disabled={selectedSegments.size < 2}
                    className={`w-full py-3 rounded font-display font-bold uppercase tracking-widest text-sm transition-all
                        ${selectedSegments.size < 2
                            ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                            : 'bg-mecha-accent text-mecha-dark hover:bg-white hover:shadow-[0_0_15px_rgba(56,189,248,0.5)]'
                        }
                    `}
                >
                    合并选中片段 ({selectedSegments.size})
                </button>
             )}
          </div>

        </div>
      </main>
    </div>
  );
}