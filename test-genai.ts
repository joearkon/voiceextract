import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: '' });
ai.models.generateContent({
  model: 'gemini-3-flash-preview',
  contents: 'hello'
}).then(console.log).catch(e => console.error("ERROR:", e.message));
