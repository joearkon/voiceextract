export interface VoiceSegment {
  id: string;
  startTime: string; // MM:SS format or seconds as string
  endTime: string;
  text: string;
  confidence: number;
}

export interface AnalysisResult {
  segments: VoiceSegment[];
  characterName: string;
}

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  READY = 'READY',
  ERROR = 'ERROR',
}

export interface ProcessedAudio {
  id: string;
  blob: Blob;
  url: string;
  duration: number;
}

export enum SynthesisState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface SynthesisResult {
  audioUrl: string;
  text: string;
}