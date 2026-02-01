
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { BookResult, BookLocation, SoftcopyLink, BookRecommendation, Language } from "../types";

const API_KEY = process.env.API_KEY!;

export const searchBookDetails = async (
  query: string,
  language: Language,
  location?: { lat: number; lng: number }
): Promise<BookResult> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // 1. Get Hardcopy Locations using Maps Grounding (Requires 2.5 series)
  const mapsResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash-native-audio-preview-12-2025",
    contents: `Find libraries or bookstores near me that stock or archive "${query}". Look for hardcopy availability.`,
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
    .filter(chunk => !!chunk.maps)
    .map(chunk => ({
      name: chunk.maps!.title || "Library/Store",
      uri: chunk.maps!.uri || "",
      type: (chunk.maps!.uri || "").toLowerCase().includes("library") ? 'library' : 'bookstore'
    }));

  // 2. Get Softcopy links using Search Grounding
  const searchResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Find legitimate digital archives, softcopy sources, or ebook purchase links for the journal or book: "${query}".`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const softcopies: SoftcopyLink[] = (searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
    .filter(chunk => !!chunk.web)
    .map(chunk => ({
      title: chunk.web!.title || "Digital Archive",
      uri: chunk.web!.uri || ""
    }));

  // 3. Get metadata
  const infoResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Provide metadata for "${query}" in ${language}. If it is a journal, include its publication frequency and field of study.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          author: { type: Type.STRING, description: "Author or Chief Editor" },
          summary: { type: Type.STRING, description: "A concise 2-sentence summary." },
          isbn: { type: Type.STRING, description: "Standard ISBN or ISSN." },
          authorBio: { type: Type.STRING, description: "Brief background of author/publication." },
          awards: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Notable recognition or impact factor." 
          }
        },
        required: ["author", "summary", "isbn", "authorBio", "awards"]
      }
    }
  });

  let bookInfo;
  try {
    const text = infoResponse.text;
    bookInfo = JSON.parse(text || "{}");
  } catch (e) {
    bookInfo = {
      author: "Various Contributors",
      summary: "Search details unavailable.",
      isbn: "",
      authorBio: "Information pending.",
      awards: []
    };
  }
  
  const { author, summary, isbn, authorBio, awards } = bookInfo;

  const coverImageUrl = isbn && !isbn.includes('-')
    ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
    : `https://images.placeholders.dev/?width=400&height=600&text=${encodeURIComponent(query)}&bgColor=%231e293b&textColor=%23fbbf24`;

  return {
    title: query,
    author: author || "Unknown",
    summary: summary || "No summary available.",
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
    contents: `Provide a detailed literary or scholarly analysis of "${query}" in ${language}. Include significance, key themes, and intended audience.`,
  });
  return response.text || "Detailed summary unavailable.";
};

export const chatWithLibrarian = async (message: string, language: Language, useThinking: boolean = false) => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const model = "gemini-3-pro-preview";
  
  const config: any = {
    systemInstruction: `You are a professional research librarian. You specialize in locating rare journals and hardcopy books. You are helpful, precise, and academic. IMPORTANT: Respond in ${language}.`
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
    contents: `Based on these interests: ${history.join(', ')}. Recommend 3 related journals or books. Respond in ${language}.`,
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
        { text: "Extract the name of the book or journal mentioned." }
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
        { text: `Identify this publication. Title, Author, and a summary in ${language}.` }
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
