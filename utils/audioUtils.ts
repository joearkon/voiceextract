/**
 * Converts a time string (MM:SS or SS.ms) to seconds
 */
export const parseTime = (timeStr: string): number => {
  if (!timeStr) return 0;
  
  if (timeStr.includes(':')) {
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    }
  }
  return parseFloat(timeStr);
};

/**
 * Extracts a segment from an AudioBuffer
 */
export const extractAudioSegment = (
  sourceBuffer: AudioBuffer,
  startSeconds: number,
  endSeconds: number,
  audioContext: AudioContext
): AudioBuffer | null => {
  const sampleRate = sourceBuffer.sampleRate;
  
  // Validate timestamps
  const startOffset = Math.max(0, startSeconds * sampleRate);
  const endOffset = Math.min(sourceBuffer.length, endSeconds * sampleRate);
  const frameCount = endOffset - startOffset;

  if (frameCount <= 0) return null;

  const newBuffer = audioContext.createBuffer(
    sourceBuffer.numberOfChannels,
    frameCount,
    sampleRate
  );

  for (let i = 0; i < sourceBuffer.numberOfChannels; i++) {
    const channelData = sourceBuffer.getChannelData(i);
    const newChannelData = newBuffer.getChannelData(i);
    // Copy the slice
    for (let j = 0; j < frameCount; j++) {
      newChannelData[j] = channelData[startOffset + j];
    }
  }

  return newBuffer;
};

/**
 * Concatenates multiple AudioBuffers into a single buffer
 */
export const concatenateAudioBuffers = (
  buffers: AudioBuffer[],
  audioContext: AudioContext
): AudioBuffer | null => {
  if (!buffers.length) return null;

  // Calculate total length
  let totalLength = 0;
  buffers.forEach(b => totalLength += b.length);

  // Create new buffer
  const output = audioContext.createBuffer(
    buffers[0].numberOfChannels,
    totalLength,
    buffers[0].sampleRate
  );

  // Copy data
  for (let channel = 0; channel < output.numberOfChannels; channel++) {
    const outputData = output.getChannelData(channel);
    let offset = 0;
    buffers.forEach(buffer => {
      outputData.set(buffer.getChannelData(channel), offset);
      offset += buffer.length;
    });
  }

  return output;
};

/**
 * Encodes AudioBuffer to WAV format
 */
export const bufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this specific encoder)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while (pos < buffer.length) {
    for (i = 0; i < numOfChan; i++) {
      // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(44 + offset, sample, true); // write 16-bit sample
      offset += 2;
    }
    pos++;
  }

  return new Blob([bufferArray], { type: 'audio/wav' });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
};