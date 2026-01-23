
import React, { useState, useEffect, useRef } from 'react';
import { AppMode, BookResult, ChatMessage, BookRecommendation, Language, Journal, HistoryEntry } from './types';
import { 
  searchBookDetails, 
  chatWithLibrarian, 
  analyzeBookCover, 
  speakText,
  transcribeAudio,
  getBookRecommendations,
  getDetailedSummary
} from './services/geminiService';
import { 
  Search, 
  BookOpen, 
  Camera, 
  Mic, 
  MapPin, 
  MessageSquare, 
  Loader2, 
  ChevronRight, 
  Link as LinkIcon,
  BrainCircuit,
  Volume2,
  Square,
  Sparkles,
  RefreshCw,
  Sun,
  Moon,
  Settings,
  Languages,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  BookMarked,
  Share2,
  Heart,
  Trash2,
  Library,
  Navigation,
  ExternalLink,
  VolumeX,
  FolderPlus,
  Folder,
  Plus,
  FolderTree,
  Home,
  Star,
  Zap,
  Flame,
  Globe,
  Play,
  Pause,
  Lightbulb,
  History as HistoryIcon,
  Clock,
  User,
  Trophy
} from 'lucide-react';
import { decode, decodeAudioData } from './utils/audioUtils';

const CURATED_JOURNALS = [
  {
    id: 'classics',
    name: 'Classic Literature',
    icon: <Star className="text-amber-500" />,
    description: 'Timeless masterpieces that shaped the world.',
    famousBooks: ['Pride and Prejudice', 'The Great Gatsby', 'To Kill a Mockingbird', 'Moby Dick']
  },
  {
    id: 'sci-fi',
    name: 'Science & Tech',
    icon: <Zap className="text-blue-500" />,
    description: 'Exploring the boundaries of reality and technology.',
    famousBooks: ['Dune', 'Neuromancer', 'Foundation', 'Project Hail Mary']
  },
  {
    id: 'history',
    name: 'History Journals',
    icon: <Globe className="text-emerald-500" />,
    description: 'Chronicles of human civilization and struggle.',
    famousBooks: ['Sapiens', 'The Guns of August', 'A People\'s History', 'The Silk Roads']
  },
  {
    id: 'mystery',
    name: 'Mystery & Thriller',
    icon: <Flame className="text-red-500" />,
    description: 'Unraveling the darkest secrets of the human mind.',
    famousBooks: ['The Silent Patient', 'Gone Girl', 'The Big Sleep', 'And Then There Were None']
  }
];

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.HOME);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<BookResult | null>(null);
  const [detailedSummary, setDetailedSummary] = useState<string | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [isAccessExpanded, setIsAccessExpanded] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [useThinkingMode, setUseThinkingMode] = useState(false);

  const [librarianRecs, setLibrarianRecs] = useState<BookRecommendation[]>([]);
  const [isFetchingRecs, setIsFetchingRecs] = useState(false);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Audio Control State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  const [favorites, setFavorites] = useState<BookResult[]>(() => {
    const saved = localStorage.getItem('lumina-favorites');
    return saved ? JSON.parse(saved) : [];
  });

  const [journals, setJournals] = useState<Journal[]>(() => {
    const saved = localStorage.getItem('lumina-journals');
    return saved ? JSON.parse(saved) : [];
  });

  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    const saved = localStorage.getItem('lumina-history');
    return saved ? JSON.parse(saved) : [];
  });

  const [activeJournalId, setActiveJournalId] = useState<string | 'all' | 'uncategorized'>('all');
  const [isCreatingJournal, setIsCreatingJournal] = useState(false);
  const [newJournalName, setNewJournalName] = useState('');
  const [movingBookTitle, setMovingBookTitle] = useState<string | null>(null);
  
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('lumina-lang') as Language) || 'English');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('lumina-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const activeAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isAudioLockedRef = useRef<boolean>(false);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.warn("Geolocation denied", err)
      );
    }
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('lumina-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('lumina-theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => localStorage.setItem('lumina-lang', language), [language]);
  useEffect(() => localStorage.setItem('lumina-favorites', JSON.stringify(favorites)), [favorites]);
  useEffect(() => localStorage.setItem('lumina-journals', JSON.stringify(journals)), [journals]);
  useEffect(() => localStorage.setItem('lumina-history', JSON.stringify(history)), [history]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isThinking]);

  const isFavorited = (title: string) => {
    return favorites.some(f => f.title.toLowerCase() === title.toLowerCase());
  };

  const stopAudio = () => {
    if (activeAudioSourceRef.current) {
      try {
        activeAudioSourceRef.current.stop();
      } catch (e) { }
      activeAudioSourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    setIsPlayingAudio(false);
    setIsAudioPaused(false);
    setIsAudioLoading(false);
    isAudioLockedRef.current = false;
  };

  const pauseAudio = async () => {
    if (audioContextRef.current && audioContextRef.current.state === 'running') {
      await audioContextRef.current.suspend();
      setIsAudioPaused(true);
    }
  };

  const resumeAudio = async () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
      setIsAudioPaused(false);
    }
  };

  const handleAudioToggle = async (text?: string) => {
    if (isAudioLockedRef.current) return;
    if (isPlayingAudio) {
      if (isAudioPaused) await resumeAudio();
      else await pauseAudio();
      return;
    }
    if (text) await startAudioPlayback(text);
  };

  const startAudioPlayback = async (text: string) => {
    try {
      isAudioLockedRef.current = true;
      setIsAudioLoading(true);
      const base64Audio = await speakText(text);
      if (base64Audio) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') await ctx.resume();
        const buffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
        if (!isAudioLockedRef.current) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => {
          setIsPlayingAudio(false);
          setIsAudioPaused(false);
          activeAudioSourceRef.current = null;
          isAudioLockedRef.current = false;
        };
        activeAudioSourceRef.current = source;
        setIsAudioLoading(false);
        setIsPlayingAudio(true);
        setIsAudioPaused(false);
        source.start();
      } else {
        setIsAudioLoading(false);
        isAudioLockedRef.current = false;
      }
    } catch (error) { 
      console.error(error); 
      setIsAudioLoading(false);
      isAudioLockedRef.current = false;
    }
  };

  const handleSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const queryToUse = overrideQuery || searchQuery;
    if (!queryToUse.trim()) return;

    setIsSearching(true);
    setSearchResult(null);
    setDetailedSummary(null);
    setIsSummaryExpanded(false);
    setIsAccessExpanded(false);
    stopAudio();
    setMode(AppMode.SEARCH);
    try {
      const result = await searchBookDetails(queryToUse, language, userLocation || undefined);
      setSearchResult(result);
      // Add to History
      const entry: HistoryEntry = {
        id: Date.now().toString(),
        query: queryToUse,
        timestamp: Date.now(),
        result
      };
      setHistory(prev => [entry, ...prev].slice(0, 50));
    } catch (error) {
      console.error(error);
      alert("Failed to find book details.");
    } finally {
      setIsSearching(false);
    }
  };

  const toggleFavorite = (book: BookResult) => {
    setFavorites(prev => {
      const exists = prev.find(f => f.title.toLowerCase() === book.title.toLowerCase());
      if (exists) {
        setJournals(jPrev => jPrev.map(j => ({
          ...j,
          bookTitles: j.bookTitles.filter(t => t.toLowerCase() !== book.title.toLowerCase())
        })));
        return prev.filter(f => f.title.toLowerCase() !== book.title.toLowerCase());
      }
      return [book, ...prev];
    });
  };

  const createJournal = () => {
    if (!newJournalName.trim()) return;
    const newJ: Journal = {
      id: Date.now().toString(),
      name: newJournalName,
      bookTitles: [],
      createdAt: Date.now()
    };
    setJournals(prev => [...prev, newJ]);
    setNewJournalName('');
    setIsCreatingJournal(false);
  };

  const deleteJournal = (id: string) => {
    if (confirm("Delete this journal folder?")) {
      setJournals(prev => prev.filter(j => j.id !== id));
      if (activeJournalId === id) setActiveJournalId('all');
    }
  };

  const assignBookToJournal = (bookTitle: string, journalId: string | null) => {
    setJournals(prev => prev.map(j => {
      const cleanBooks = j.bookTitles.filter(t => t !== bookTitle);
      if (j.id === journalId) return { ...j, bookTitles: [...cleanBooks, bookTitle] };
      return { ...j, bookTitles: cleanBooks };
    }));
    setMovingBookTitle(null);
  };

  const filteredFavorites = favorites.filter(book => {
    if (activeJournalId === 'all') return true;
    if (activeJournalId === 'uncategorized') {
      return !journals.some(j => j.bookTitles.includes(book.title));
    }
    const journal = journals.find(j => j.id === activeJournalId);
    return journal?.bookTitles.includes(book.title);
  });

  const toggleSummaryExpansion = async () => {
    if (isSummaryExpanded) {
      setIsSummaryExpanded(false);
      return;
    }
    if (!detailedSummary && searchResult) {
      setIsExpanding(true);
      try {
        const fullSummary = await getDetailedSummary(searchResult.title, language);
        setDetailedSummary(fullSummary);
      } catch (error) { console.error(error); } finally { setIsExpanding(false); }
    }
    setIsSummaryExpanded(true);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          setIsTranscribing(true);
          try {
            const transcription = await transcribeAudio(base64);
            if (transcription) {
              setSearchQuery(transcription);
              handleSearch(undefined, transcription);
            }
          } catch (err) { console.error(err); } finally { setIsTranscribing(false); }
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) { alert("Mic permission error."); }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsThinking(true);
    try {
      const response = await chatWithLibrarian(chatInput, language, useThinkingMode);
      setChatMessages(prev => [...prev, { role: 'model', content: response || "", isThinking: useThinkingMode }]);
    } catch (error) { console.error(error); } finally { setIsThinking(false); }
  };

  const fetchLibrarianRecs = async () => {
    if (chatMessages.length === 0) {
      alert("Chat with me first so I can understand your taste!");
      return;
    }
    setIsFetchingRecs(true);
    try {
      const context = chatMessages
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .slice(-5);
      const recs = await getBookRecommendations(context, language);
      setLibrarianRecs(recs);
    } catch (err) { console.error(err); } finally { setIsFetchingRecs(false); }
  };

  const clearHistory = () => {
    if (confirm("Are you sure you want to clear your search history?")) {
      setHistory([]);
    }
  };

  const deleteHistoryEntry = (id: string) => {
    setHistory(prev => prev.filter(h => h.id !== id));
  };

  return (
    <div className={`min-h-screen flex flex-col max-w-4xl mx-auto shadow-2xl transition-all duration-500 ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-[#fcfaf7] text-slate-900'}`}>
      
      {/* Modals */}
      {isCreatingJournal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className={`w-full max-w-md p-8 rounded-3xl shadow-2xl ${isDarkMode ? 'bg-slate-900 border border-slate-800' : 'bg-white'}`}>
            <h3 className="serif text-2xl mb-6">New Journal</h3>
            <input autoFocus type="text" value={newJournalName} onChange={(e) => setNewJournalName(e.target.value)} placeholder="e.g., Space Exploration" className={`w-full p-4 rounded-xl mb-6 border-2 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-100'}`} />
            <div className="flex gap-3">
              <button onClick={() => setIsCreatingJournal(false)} className="flex-1 py-3 font-bold text-slate-500">Cancel</button>
              <button onClick={createJournal} className="flex-1 py-3 font-bold bg-amber-700 text-white rounded-xl">Create</button>
            </div>
          </div>
        </div>
      )}

      {movingBookTitle && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className={`w-full max-w-md p-8 rounded-3xl shadow-2xl ${isDarkMode ? 'bg-slate-900 border border-slate-800' : 'bg-white'}`}>
            <h3 className="serif text-xl mb-6">Organize into Folder</h3>
            <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
              <button onClick={() => assignBookToJournal(movingBookTitle, null)} className="w-full text-left p-4 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center gap-3">
                <X size={18} className="text-slate-400" /> Uncategorized
              </button>
              {journals.map(j => (
                <button key={j.id} onClick={() => assignBookToJournal(movingBookTitle, j.id)} className="w-full text-left p-4 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center gap-3">
                  <Folder size={18} className="text-amber-500" /> {j.name}
                </button>
              ))}
            </div>
            <button onClick={() => { setMovingBookTitle(null); setIsCreatingJournal(true); }} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 flex items-center justify-center gap-2">
              <Plus size={18} /> Create New
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`p-6 sticky top-0 z-50 border-b transition-all duration-500 ${isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-amber-50/90 border-amber-200 backdrop-blur-md'}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setMode(AppMode.HOME); stopAudio(); }}>
            <BookOpen className={`${isDarkMode ? 'text-amber-400' : 'text-amber-700'} w-8 h-8 group-hover:scale-110 transition-transform`} />
            <h1 className={`serif text-3xl ${isDarkMode ? 'text-amber-100' : 'text-amber-900'}`}>LuminaLib</h1>
          </div>
          <div className="flex items-center gap-4">
             <button onClick={() => setMode(AppMode.HISTORY)} className={`p-2 transition-all ${mode === AppMode.HISTORY ? 'text-amber-700' : 'text-slate-400'}`} title="Search History">
              <HistoryIcon size={22} />
             </button>
             <button onClick={() => setMode(AppMode.FAVORITES)} className={`p-2 transition-all ${mode === AppMode.FAVORITES ? 'text-amber-700' : 'text-slate-400'}`}>
              <Heart size={22} className={favorites.length > 0 ? 'fill-current' : ''} />
             </button>
             <button onClick={() => setMode(AppMode.LIBRARIAN)} className={`p-2 transition-all ${mode === AppMode.LIBRARIAN ? 'text-amber-700' : 'text-slate-400'}`}>
              <MessageSquare size={22} />
             </button>
          </div>
        </div>
        
        {mode !== AppMode.SETTINGS && (
          <form onSubmit={handleSearch} className="relative">
            <input 
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Book or author name..."
              className={`w-full rounded-2xl py-4 pl-12 pr-28 border-2 focus:outline-none focus:ring-4 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-amber-100 text-slate-900'}`}
            />
            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-500' : 'text-amber-400'}`} />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
              <button type="button" onClick={isRecording ? () => mediaRecorderRef.current?.stop() : startRecording} className={`p-2 ${isRecording ? 'text-red-500 animate-pulse' : 'text-amber-600'}`}>
                {isTranscribing ? <Loader2 className="animate-spin" size={24} /> : <Mic size={24} />}
              </button>
              <button type="submit" className="bg-amber-700 text-white px-5 py-2 rounded-xl font-medium">Search</button>
            </div>
          </form>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6 space-y-8 pb-32">
        
        {mode === AppMode.HOME && (
          <div className="animate-in fade-in duration-500 space-y-12">
            <section className="text-center py-10 space-y-4">
              <h2 className="serif text-5xl text-amber-950 dark:text-amber-100 leading-tight">Your Personal <br/> Literary Scout</h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto">Discover hardcopies nearby, access digital links, and explore our curated scholarly journals.</p>
            </section>

            <section className="space-y-6">
              <div className="flex items-center gap-2">
                <Sparkles className="text-amber-500" size={20} />
                <h3 className="serif text-2xl">Curated Scholarly Journals</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {CURATED_JOURNALS.map((cj) => (
                  <div key={cj.id} className={`p-6 rounded-3xl border transition-all hover:shadow-xl hover:-translate-y-1 cursor-default ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-amber-100 shadow-sm'}`}>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                        {cj.icon}
                      </div>
                      <div>
                        <h4 className="font-bold text-lg">{cj.name}</h4>
                        <p className="text-xs text-slate-500">{cj.description}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Famous Books</p>
                      <div className="flex flex-wrap gap-2">
                        {cj.famousBooks.map((book) => (
                          <button 
                            key={book} 
                            onClick={() => { setSearchQuery(book); handleSearch(undefined, book); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDarkMode ? 'bg-slate-800 text-amber-400 hover:bg-amber-400 hover:text-slate-950' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
                          >
                            {book}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {history.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="serif text-xl">Recently Scouted</h3>
                  <button onClick={() => setMode(AppMode.HISTORY)} className="text-xs text-amber-700 font-bold hover:underline">See All</button>
                </div>
                <div className="flex flex-wrap gap-3">
                  {history.slice(0, 5).map((h) => (
                    <button key={h.id} onClick={() => { setSearchResult(h.result); setMode(AppMode.SEARCH); }} className="px-5 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-sm font-medium hover:bg-amber-100 transition-all flex items-center gap-2">
                      <Clock size={12} className="text-slate-400" /> {h.query}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {mode === AppMode.SEARCH && searchResult && (
          <div className="animate-in slide-in-from-bottom-6 duration-500">
            <div className={`p-8 rounded-3xl border mb-10 ${isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-amber-50/50 border-amber-100 shadow-sm'}`}>
              <div className="flex flex-col md:flex-row gap-8 mb-8">
                {searchResult.coverImageUrl && <img src={searchResult.coverImageUrl} className="w-full md:w-48 lg:w-56 rounded-2xl shadow-2xl border-4 border-white dark:border-slate-800" alt={searchResult.title} />}
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="serif text-4xl leading-tight mb-1">{searchResult.title}</h2>
                      <p className={`text-xl font-medium ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>by {searchResult.author}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleFavorite(searchResult)} className={`p-4 rounded-2xl ${isDarkMode ? 'bg-slate-800' : 'bg-white'} text-red-500 shadow-sm hover:scale-105 active:scale-95 transition-all`}>
                        <Heart size={26} className={isFavorited(searchResult.title) ? 'fill-current' : ''} />
                      </button>
                    </div>
                  </div>
                  
                  {/* Enhanced Audio Control Overlay */}
                  <div className={`mb-6 p-4 rounded-2xl flex items-center justify-between border-2 transition-all ${isDarkMode ? 'bg-slate-900/80 border-slate-700' : 'bg-white border-amber-100 shadow-inner'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${isPlayingAudio ? 'bg-amber-100 text-amber-700 animate-pulse' : 'bg-slate-100 text-slate-400'}`}>
                        <Volume2 size={20} />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Audio Preview</p>
                        <p className="text-[10px] text-slate-400">{isAudioLoading ? 'Fetching voice...' : isPlayingAudio ? (isAudioPaused ? 'Playback Paused' : 'Playing Summary') : 'Ready to speak'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleAudioToggle(`${searchResult.title} by ${searchResult.author}. ${searchResult.summary}`)}
                        className={`p-3 rounded-xl transition-all active:scale-90 ${isAudioLoading ? 'opacity-50 cursor-not-allowed' : (isPlayingAudio ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700')}`}
                        disabled={isAudioLoading}
                      >
                        {isAudioLoading ? <Loader2 className="animate-spin" /> : (isPlayingAudio && !isAudioPaused ? <Pause /> : <Play />)}
                      </button>
                      {(isPlayingAudio || isAudioLoading) && (
                        <button 
                          onClick={stopAudio}
                          className="p-3 rounded-xl bg-red-100 text-red-600 hover:bg-red-200 active:scale-90 transition-all"
                        >
                          <Square fill="currentColor" size={20} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className={`p-6 rounded-2xl border mb-6 ${isDarkMode ? 'bg-slate-950/40 border-slate-800' : 'bg-white/50 border-amber-100'}`}>
                    <p className="italic text-lg">"{searchResult.summary}"</p>
                    {isSummaryExpanded && <p className="mt-6 pt-6 border-t border-amber-100 whitespace-pre-wrap">{detailedSummary}</p>}
                    <button onClick={toggleSummaryExpansion} className="mt-4 w-full py-3 bg-amber-100 text-amber-900 rounded-xl font-bold text-sm hover:bg-amber-200 transition-colors">
                      {isExpanding ? <Loader2 className="animate-spin mx-auto" /> : isSummaryExpanded ? 'Collapse Analysis' : 'Show Detailed Analysis'}
                    </button>
                  </div>

                  {/* Author Details Section */}
                  {searchResult.authorBio && (
                    <div className={`p-6 rounded-2xl border mb-6 transition-all ${isDarkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-amber-50 shadow-sm'}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <User size={20} className="text-amber-600" />
                        <h3 className="font-bold text-lg uppercase tracking-wide text-amber-800 dark:text-amber-400">About the Author</h3>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{searchResult.authorBio}</p>
                    </div>
                  )}

                  {/* Awards and Recognition Section */}
                  {searchResult.awards && searchResult.awards.length > 0 && (
                    <div className={`p-6 rounded-2xl border mb-6 transition-all ${isDarkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-amber-50 shadow-sm'}`}>
                      <div className="flex items-center gap-3 mb-4">
                        <Trophy size={20} className="text-amber-600" />
                        <h3 className="font-bold text-lg uppercase tracking-wide text-amber-800 dark:text-amber-400">Awards & Recognition</h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {searchResult.awards.map((award, i) => (
                          <div key={i} className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${isDarkMode ? 'bg-amber-900/20 text-amber-400 border border-amber-800' : 'bg-amber-100 text-amber-900 border border-amber-200'}`}>
                            <Sparkles size={12} /> {award}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Acquisition Section */}
              <div className={`rounded-3xl border overflow-hidden ${isDarkMode ? 'bg-slate-950/40 border-slate-800' : 'bg-white border-amber-100'}`}>
                <button onClick={() => setIsAccessExpanded(!isAccessExpanded)} className="w-full flex items-center justify-between p-6 hover:bg-amber-50/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <Navigation size={24} className="text-amber-600" />
                    <h3 className="font-bold text-xl">Find a Copy</h3>
                  </div>
                  {isAccessExpanded ? <ChevronUp /> : <ChevronDown />}
                </button>
                {isAccessExpanded && (
                  <div className="p-6 pt-0 space-y-6 animate-in slide-in-from-top-4">
                    <div className="space-y-3">
                      <span className="text-[10px] font-black uppercase text-amber-600 tracking-widest">Digital Sources (Softcopy)</span>
                      {searchResult.softcopies.length > 0 ? searchResult.softcopies.map((s, i) => (
                        <a key={i} href={s.uri} target="_blank" className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-900 rounded-xl hover:border-amber-500 border-2 border-transparent transition-all group">
                          <div className="flex items-center gap-3 truncate"><LinkIcon size={16} className="text-slate-400 group-hover:text-amber-500" /><span className="truncate font-bold">{s.title}</span></div>
                          <ExternalLink size={16} />
                        </a>
                      )) : <p className="text-xs text-slate-500 italic px-4">No online sources found.</p>}
                    </div>
                    <div className="space-y-3">
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Physical Locations (Hardcopy)</span>
                      {searchResult.locations.length > 0 ? searchResult.locations.map((l, i) => (
                        <a key={i} href={l.uri} target="_blank" className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-900 rounded-xl hover:border-amber-500 border-2 border-transparent transition-all group">
                          <div className="flex items-center gap-3 truncate"><MapPin size={16} className="text-slate-400 group-hover:text-amber-500" /><span className="truncate font-bold">{l.name}</span></div>
                          <ChevronRight size={16} />
                        </a>
                      )) : <p className="text-xs text-slate-500 italic px-4">No libraries found nearby.</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {mode === AppMode.FAVORITES && (
          <div className="animate-in fade-in space-y-8">
            <h2 className="serif text-4xl">Saved Library</h2>
            <div className="flex items-center gap-3 overflow-x-auto pb-4 no-scrollbar">
              <button onClick={() => setActiveJournalId('all')} className={`px-6 py-2 rounded-full font-bold text-sm ${activeJournalId === 'all' ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-500'}`}>All</button>
              {journals.map(j => (
                <div key={j.id} className="relative group flex-shrink-0">
                  <button onClick={() => setActiveJournalId(j.id)} className={`px-6 py-2 rounded-full font-bold text-sm flex items-center gap-2 ${activeJournalId === j.id ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Folder size={14} /> {j.name}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); deleteJournal(j.id); }} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100"><X size={10} /></button>
                </div>
              ))}
              <button onClick={() => setIsCreatingJournal(true)} className="p-2 border-2 border-dashed rounded-full text-slate-400"><Plus size={18} /></button>
            </div>
            {filteredFavorites.length === 0 ? (
               <div className="text-center py-20 bg-slate-50 dark:bg-slate-900 rounded-3xl border-2 border-dashed">
                 <BookMarked size={48} className="mx-auto mb-4 text-slate-300" />
                 <p className="text-slate-500">No books saved here yet.</p>
               </div>
            ) : (
              <div className="grid gap-6">
                {filteredFavorites.map((f, i) => (
                  <div key={i} className={`p-6 rounded-3xl border flex gap-6 items-start ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100 shadow-sm'} animate-in slide-in-from-bottom-2`}>
                    {f.coverImageUrl && <img src={f.coverImageUrl} className="w-24 h-36 object-cover rounded-xl shadow-md" alt={f.title} />}
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <h3 className="serif text-2xl hover:text-amber-700 cursor-pointer" onClick={() => { setSearchResult(f); setMode(AppMode.SEARCH); }}>{f.title}</h3>
                        <div className="flex gap-2">
                          <button onClick={() => setMovingBookTitle(f.title)} className="p-2 text-slate-400 hover:text-amber-600"><FolderPlus size={18} /></button>
                          <button onClick={() => toggleFavorite(f)} className="p-2 text-slate-400 hover:text-red-500"><Trash2 size={18} /></button>
                        </div>
                      </div>
                      <p className="text-sm italic text-slate-500 mt-1">by {f.author}</p>
                      <button onClick={() => { setSearchResult(f); setMode(AppMode.SEARCH); }} className="mt-4 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-200 transition-colors">View Analysis</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === AppMode.HISTORY && (
          <div className="animate-in fade-in space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="serif text-4xl">Search History</h2>
              {history.length > 0 && (
                <button onClick={clearHistory} className="text-xs text-red-500 font-bold hover:underline flex items-center gap-1">
                  <Trash2 size={14} /> Clear All
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="text-center py-20 bg-slate-50 dark:bg-slate-900 rounded-3xl border-2 border-dashed">
                <HistoryIcon size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="text-slate-500">Your scout history is empty.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {history.map((entry) => (
                  <div key={entry.id} className={`p-5 rounded-2xl border flex items-center justify-between transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800 hover:border-amber-700' : 'bg-white border-slate-100 hover:border-amber-200 shadow-sm'}`}>
                    <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => { setSearchResult(entry.result); setMode(AppMode.SEARCH); }}>
                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                        <Clock size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-lg">{entry.query}</p>
                        <p className="text-xs text-slate-400">{new Date(entry.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                       <button onClick={() => { setSearchResult(entry.result); setMode(AppMode.SEARCH); }} className="p-3 text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-800 rounded-xl">
                         <ChevronRight size={20} />
                       </button>
                       <button onClick={() => deleteHistoryEntry(entry.id)} className="p-3 text-slate-300 hover:text-red-500 transition-colors">
                         <X size={18} />
                       </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === AppMode.LIBRARIAN && (
          <div className="flex flex-col h-[600px] rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in shadow-2xl">
             <div className="bg-slate-900 text-white p-4 flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-slate-900"><BookOpen size={20} /></div>
                  <div>
                    <p className="font-bold text-sm">Lumina Librarian</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">Always Active</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={fetchLibrarianRecs}
                    disabled={isFetchingRecs}
                    className="p-2 text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
                    title="Get personalized recommendations"
                  >
                    {isFetchingRecs ? <Loader2 className="animate-spin" size={20} /> : <Lightbulb size={20} />}
                  </button>
                  <label className="flex items-center gap-2 text-xs cursor-pointer group">
                    <BrainCircuit size={16} className="group-hover:text-amber-400 transition-colors" /> 
                    <span className="hidden sm:inline">Deep Reason</span> 
                    <input type="checkbox" checked={useThinkingMode} onChange={(e) => setUseThinkingMode(e.target.checked)} className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-500" />
                  </label>
                </div>
             </div>
             
             {/* Recommendations Horizontal Slider */}
             {librarianRecs.length > 0 && (
               <div className="bg-amber-50 dark:bg-slate-800 p-4 border-b border-amber-100 dark:border-slate-700 animate-in slide-in-from-top-2">
                 <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-widest">My Picks for You</span>
                    <button onClick={() => setLibrarianRecs([])} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>
                 </div>
                 <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                    {librarianRecs.map((rec, i) => (
                      <button 
                        key={i} 
                        onClick={() => { setSearchQuery(rec.title); handleSearch(undefined, rec.title); }}
                        className="flex-shrink-0 w-48 p-3 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-amber-100 dark:border-slate-700 text-left hover:border-amber-500 transition-all"
                      >
                        <p className="font-bold text-xs truncate mb-1">{rec.title}</p>
                        <p className="text-[10px] text-slate-500 line-clamp-2">{rec.reason}</p>
                      </button>
                    ))}
                 </div>
               </div>
             )}

             <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50 dark:bg-slate-900">
                {chatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                    <MessageSquare size={48} className="opacity-10" />
                    <p className="text-center max-w-xs">Hello! I'm your literary guide. Ask me about plot analysis, book history, or reading recommendations.</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-4 rounded-2xl ${msg.role === 'user' ? 'bg-amber-700 text-white rounded-br-none' : 'bg-white dark:bg-slate-800 rounded-bl-none shadow-sm text-slate-800 dark:text-slate-100'}`}>
                      {msg.isThinking && <div className="text-[8px] font-black uppercase mb-1 text-amber-500 tracking-tighter">Analyzed Deeply</div>}
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {isThinking && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
             </div>
             <form onSubmit={handleChat} className="p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex gap-3 shadow-inner">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Type your message..." className={`flex-1 p-3 rounded-xl focus:ring-2 focus:ring-amber-500 transition-all ${isDarkMode ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`} />
                <button type="submit" className="p-3 bg-amber-700 text-white rounded-xl hover:bg-amber-800 transition-colors disabled:opacity-50" disabled={isThinking || !chatInput.trim()}><ChevronRight /></button>
             </form>
          </div>
        )}

      </main>

      {/* Nav Controls */}
      <footer className={`p-4 flex justify-around items-center sticky bottom-0 z-50 border-t ${isDarkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 backdrop-blur-md shadow-2xl'}`}>
        <button onClick={() => { setMode(AppMode.HOME); stopAudio(); }} className={`flex flex-col items-center gap-1 transition-all ${mode === AppMode.HOME ? 'text-amber-700 scale-110' : 'text-slate-400 hover:text-slate-600'}`}>
          <Home size={22} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Home</span>
        </button>
        <button onClick={() => { setMode(AppMode.SEARCH); stopAudio(); }} className={`flex flex-col items-center gap-1 transition-all ${mode === AppMode.SEARCH ? 'text-amber-700 scale-110' : 'text-slate-400 hover:text-slate-600'}`}>
          <Search size={22} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Scout</span>
        </button>
        <button onClick={isRecording ? () => mediaRecorderRef.current?.stop() : startRecording} className={`p-5 rounded-full -mt-10 border-4 ${isRecording ? 'bg-red-500 border-white shadow-red-200 animate-pulse' : 'bg-amber-700 border-white shadow-xl hover:bg-amber-800'} text-white transition-all active:scale-90 z-50`}>
          {isRecording ? <Square size={24} /> : <Mic size={24} />}
        </button>
        <button onClick={() => { setMode(AppMode.FAVORITES); stopAudio(); }} className={`flex flex-col items-center gap-1 transition-all ${mode === AppMode.FAVORITES ? 'text-amber-700 scale-110' : 'text-slate-400 hover:text-slate-600'}`}>
          <Heart size={22} className={favorites.length > 0 && mode === AppMode.FAVORITES ? 'fill-current' : ''} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Saved</span>
        </button>
        <button onClick={() => { setMode(AppMode.SETTINGS); stopAudio(); }} className={`flex flex-col items-center gap-1 transition-all ${mode === AppMode.SETTINGS ? 'text-amber-700 scale-110' : 'text-slate-400 hover:text-slate-600'}`}>
          <Settings size={22} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Setup</span>
        </button>
      </footer>
    </div>
  );
};

export default App;
