import { GoogleGenAI, Type, Modality } from "@google/genai";
import { AnalysisResult, VoiceSegment } from "../types";

const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

export const analyzeVideoForCharacter = async (
  videoBase64: string,
  mimeType: string,
  characterName: string
): Promise<AnalysisResult> => {
  
  const prompt = `
    Analyze this video clip carefully.
    I need to extract audio samples for the character: "${characterName}".
    
    Task:
    1. Identify every exact time segment where "${characterName}" is speaking.
    2. Ignore segments where other characters are speaking over them if possible, but prioritize getting the main lines.
    3. Transcribe the dialogue spoken in that segment. The language could be Japanese, Chinese, or English.
    4. Provide the start and end timestamps precisely.

    Return the data in a strict JSON format.
  `;

  try {
    // Using gemini-3-flash-preview as it is the current recommended model for general tasks
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: videoBase64,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            segments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  startTime: { type: Type.STRING, description: "Start time in seconds (e.g. '12.5') or MM:SS format" },
                  endTime: { type: Type.STRING, description: "End time in seconds (e.g. '15.2') or MM:SS format" },
                  text: { type: Type.STRING, description: "Transcription of the dialogue" },
                  confidence: { type: Type.NUMBER, description: "Confidence score 0-1" }
                },
                required: ["startTime", "endTime", "text"],
              },
            },
            characterName: { type: Type.STRING },
          },
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    const result = JSON.parse(text) as AnalysisResult;
    // Add unique IDs
    result.segments = result.segments.map((s, i) => ({ ...s, id: `seg-${i}-${Date.now()}` }));
    return result;

  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    // Extract a more meaningful error message if possible
    const message = error.message || "Unknown error occurred";
    if (message.includes("413")) {
        throw new Error("File is too large for inline analysis (Max ~20MB). Please clip the video or use a smaller file.");
    }
    if (message.includes("404")) {
        throw new Error("Model not found. Please check API availability for gemini-3-flash-preview.");
    }
    throw new Error(message);
  }
};

export const generateCharacterSpeech = async (
  text: string,
  characterName: string,
  referenceContext: string[],
  language: string = 'Japanese'
): Promise<string> => {
  try {
    // Contextual prompt to help the model act
    // We join the reference lines to give the model a "vibe" check
    const contextStr = referenceContext.join(" | ");
    
    const prompt = `
      You are acting as the anime character: ${characterName}.
      
      Here are some lines you have spoken recently to establish your personality and tone:
      "${contextStr}"
      
      TASK:
      Speak the following line in ${language}. 
      Mimic the intensity, emotion, and pacing implied by the reference lines above.
      Do not output any text, only the audio.
      
      Line to speak: "${text}"
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            // Fenrir is deep/intense. 
            // We stick to one consistent voice but change the acting via prompt.
            prebuiltVoiceConfig: { voiceName: 'Fenrir' }, 
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio data returned from generation");
    }

    return base64Audio;
  } catch (error: any) {
    console.error("Speech Generation Error:", error);
    throw new Error("Failed to generate speech: " + error.message);
  }
};