
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { BookResult, BookLocation, SoftcopyLink, BookRecommendation, Language } from "../types";

const API_KEY = process.env.API_KEY!;

export const searchBookDetails = async (
  query: string,
  language: Language,
  location?: { lat: number; lng: number }
): Promise<BookResult> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // 1. Get Hardcopy Locations using Maps Grounding (Gemini 2.5 Flash)
  const mapsResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Find libraries or bookstores near me that might have "${query}".`,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: location ? {
          latLng: {
            latitude: location.lat,
            longitude: location.lng
          }
        } : undefined
      }
    },
  });

  const locations: BookLocation[] = (mapsResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
    .filter(chunk => chunk.maps)
    .map(chunk => ({
      name: chunk.maps.title || "Library/Store",
      uri: chunk.maps.uri,
      type: chunk.maps.uri.includes("library") ? 'library' : 'bookstore'
    }));

  // 2. Get Softcopy links using Search Grounding (Gemini 3 Flash Preview)
  const searchResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Find legitimate softcopy sources or ebook purchase links for "${query}".`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const softcopies: SoftcopyLink[] = (searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
    .filter(chunk => chunk.web)
    .map(chunk => ({
      title: chunk.web.title || "E-Book Source",
      uri: chunk.web.uri
    }));

  // 3. Get concise metadata including author bio and awards
  const infoResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are a book expert. For the book "${query}", provide details in ${language}.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          author: { type: Type.STRING },
          summary: { type: Type.STRING, description: "A concise 2-sentence summary." },
          isbn: { type: Type.STRING, description: "Standard ISBN-13." },
          authorBio: { type: Type.STRING, description: "A brief professional biography of the author." },
          awards: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "A list of notable awards or recognition the book has received." 
          }
        },
        required: ["author", "summary", "isbn", "authorBio", "awards"]
      }
    }
  });

  let bookInfo;
  try {
    bookInfo = JSON.parse(infoResponse.text || "{}");
  } catch (e) {
    bookInfo = {
      author: "Unknown Author",
      summary: "No summary found.",
      isbn: "",
      authorBio: "No biography available.",
      awards: []
    };
  }
  
  const { author, summary, isbn, authorBio, awards } = bookInfo;

  // Use Open Library Covers API if ISBN is available
  const coverImageUrl = isbn 
    ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
    : `https://images.placeholders.dev/?width=400&height=600&text=${encodeURIComponent(query)}&bgColor=%23f3f4f6&textColor=%239ca3af`;

  return {
    title: query,
    author,
    summary,
    authorBio,
    awards,
    locations,
    softcopies,
    coverImageUrl
  };
};

export const getDetailedSummary = async (query: string, language: Language): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Provide a detailed, multi-paragraph summary and literary analysis of the book "${query}" in ${language}. Include key themes, plot overview (no spoilers), and why it is significant.`,
  });
  return response.text || "Detailed summary unavailable.";
};

export const chatWithLibrarian = async (message: string, language: Language, useThinking: boolean = false) => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const model = "gemini-3-pro-preview";
  
  const config: any = {
    systemInstruction: `You are a professional librarian with deep knowledge of literature. You provide thoughtful, accurate, and helpful advice. IMPORTANT: Always respond in ${language}. If the user asks in another language, you must still respond in ${language}.`
  };

  if (useThinking) {
    config.thinkingConfig = { thinkingBudget: 32768 };
  }

  const response = await ai.models.generateContent({
    model,
    contents: message,
    config
  });

  return response.text;
};

export const getBookRecommendations = async (history: string[], language: Language): Promise<BookRecommendation[]> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Based on the following book history: ${history.join(', ')}. Recommend 3 unique books the user might enjoy. Provide the title and a very short reason in ${language}.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            reason: { type: Type.STRING }
          },
          required: ["title", "reason"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch {
    return [];
  }
};

export const transcribeAudio = async (base64Audio: string, mimeType: string = 'audio/webm') => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { data: base64Audio, mimeType } },
        { text: "Identify the book name or author mentioned in this audio. Return only the name." }
      ]
    }
  });
  return response.text?.trim() || "";
};

export const analyzeBookCover = async (base64Image: string, language: Language) => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
        { text: `Identify this book cover. Provide the title, author, and a short explanation in ${language}.` }
      ]
    }
  });
  return response.text;
};

export const speakText = async (text: string) => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};
