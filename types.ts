
export type Language = 'English' | 'Tamil' | 'Malayalam' | 'Telugu' | 'French' | 'Spanish' | 'German';

export interface BookLocation {
  name: string;
  address?: string;
  uri: string;
  type: 'library' | 'bookstore';
}

export interface SoftcopyLink {
  title: string;
  uri: string;
}

export interface BookResult {
  title: string;
  author: string;
  summary: string;
  authorBio?: string;
  awards?: string[];
  locations: BookLocation[];
  softcopies: SoftcopyLink[];
  coverImageUrl?: string;
}

export interface HistoryEntry {
  id: string;
  query: string;
  timestamp: number;
  result: BookResult;
}

export interface Journal {
  id: string;
  name: string;
  bookTitles: string[]; // List of book titles belonging to this journal
  createdAt: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  isThinking?: boolean;
}

export interface BookRecommendation {
  title: string;
  reason: string;
}

export enum AppMode {
  HOME = 'home',
  SEARCH = 'search',
  LIBRARIAN = 'librarian',
  SCANNER = 'scanner',
  VOICE = 'voice',
  SETTINGS = 'settings',
  FAVORITES = 'favorites',
  HISTORY = 'history'
}
