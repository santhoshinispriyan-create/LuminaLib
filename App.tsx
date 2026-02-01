
import React, { useState, useEffect, useRef } from 'react';
import { AppMode, BookResult, ChatMessage, BookRecommendation, Language, Journal, HistoryEntry } from './types';
import { 
  searchBookDetails, 
  chatWithLibrarian, 
  speakText,
  transcribeAudio,
  getBookRecommendations,
  getDetailedSummary
} from './services/geminiService';
import { 
  Search, 
  Mic, 
  MapPin, 
  MessageSquare, 
  Loader2, 
  Volume2,
  Square,
  Sun,
  Moon,
  Settings,
  Navigation,
  ExternalLink,
  Home,
  Star,
  Zap,
  Flame,
  Globe,
  Play,
  Pause,
  History as HistoryIcon,
  Compass,
  Building
} from 'lucide-react';
import { decode, decodeAudioData } from './utils/audioUtils';

const CURATED_JOURNALS = [
  {
    id: 'scientific',
    name: 'Scientific American',
    icon: <Zap className="text-blue-500" />,
    description: 'Premier science journal tracking modern innovation.',
    famousBooks: ['Nature', 'Science', 'Scientific American', 'The Lancet']
  },
  {
    id: 'literary',
    name: 'Literary Reviews',
    icon: <Star className="text-amber-500" />,
    description: 'Critiques and essays on modern and classic works.',
    famousBooks: ['The New Yorker', 'Granta', 'Paris Review', 'London Review of Books']
  },
  {
    id: 'history',
    name: 'Historical Archives',
    icon: <Globe className="text-emerald-500" />,
    description: 'Preserved chronicles of civilizations.',
    famousBooks: ['National Geographic', 'American Historical Review', 'History Today']
  },
  {
    id: 'business',
    name: 'Business & Econ',
    icon: <Flame className="text-orange-500" />,
    description: 'Global markets and economic insights.',
    famousBooks: ['The Economist', 'Harvard Business Review', 'Forbes', 'Fortune']
  }
];

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.HOME);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<BookResult | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  const [favorites] = useState<BookResult[]>(() => {
    const saved = localStorage.getItem('lumina-favorites');
    return saved ? JSON.parse(saved) : [];
  });

  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    const saved = localStorage.getItem('lumina-history');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [language] = useState<Language>(() => {
    const saved = localStorage.getItem('lumina-lang');
    return (saved as Language) || 'English';
  });

  const [isDarkMode, setIsDarkMode] = useState(true);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => localStorage.setItem('lumina-history', JSON.stringify(history)), [history]);

  const stopAudio = () => {
    if (activeAudioSourceRef.current) {
      try { activeAudioSourceRef.current.stop(); } catch (e) { }
      activeAudioSourceRef.current = null;
    }
    setIsPlayingAudio(false);
    setIsAudioPaused(false);
    setIsAudioLoading(false);
    isAudioLockedRef.current = false;
  };

  const handleAudioToggle = async (text?: string) => {
    if (isAudioLockedRef.current) return;
    if (isPlayingAudio) {
      if (isAudioPaused) {
        audioContextRef.current?.resume();
        setIsAudioPaused(false);
      } else {
        audioContextRef.current?.suspend();
        setIsAudioPaused(true);
      }
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
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => {
          setIsPlayingAudio(false);
          activeAudioSourceRef.current = null;
          isAudioLockedRef.current = false;
        };
        activeAudioSourceRef.current = source;
        setIsAudioLoading(false);
        setIsPlayingAudio(true);
        source.start();
      }
    } catch (error) { 
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
    stopAudio();
    setMode(AppMode.SEARCH);
    try {
      const result = await searchBookDetails(queryToUse, language, userLocation || undefined);
      setSearchResult(result);
      setHistory(prev => [{
        id: Date.now().toString(),
        query: queryToUse,
        timestamp: Date.now(),
        result
      }, ...prev].slice(0, 50));
    } catch (error) {
      console.error(error);
      alert("Search failed. Check connection.");
    } finally {
      setIsSearching(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => audioChunksRef.current.push(event.data);
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
          } finally { setIsTranscribing(false); }
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) { alert("Mic permission error."); }
  };

  return (
    <div className={`min-h-screen flex flex-col max-w-4xl mx-auto shadow-2xl transition-all duration-500 ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-[#fcfaf7] text-slate-900'}`}>
      
      {/* Header */}
      <header className={`p-6 sticky top-0 z-50 border-b transition-all duration-500 ${isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-amber-50/90 border-amber-200 backdrop-blur-md'}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setMode(AppMode.HOME); stopAudio(); }}>
            <Building className={`${isDarkMode ? 'text-amber-400' : 'text-amber-700'} w-8 h-8 group-hover:scale-110 transition-transform`} />
            <h1 className={`serif text-3xl ${isDarkMode ? 'text-amber-100' : 'text-amber-900'}`}>LuminaScout</h1>
          </div>
          <div className="flex items-center gap-2">
             <button onClick={() => setMode(AppMode.HISTORY)} className="p-2 text-slate-400 hover:text-amber-500"><HistoryIcon size={20} /></button>
             <button onClick={() => setMode(AppMode.LIBRARIAN)} className="p-2 text-slate-400 hover:text-amber-500"><MessageSquare size={20} /></button>
             <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 text-slate-400 hover:text-amber-500">{isDarkMode ? <Sun size={20} /> : <Moon size={20} />}</button>
          </div>
        </div>
        
        <form onSubmit={handleSearch} className="relative">
          <input 
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Journal, Book or Archive..."
            className={`w-full rounded-2xl py-4 pl-12 pr-28 border-2 transition-all focus:outline-none focus:ring-4 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white focus:ring-amber-500/20' : 'bg-white border-amber-100 text-slate-900 focus:ring-amber-200'}`}
          />
          <Search className={`absolute left-4 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-500' : 'text-amber-400'}`} />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
            <button type="button" onClick={isRecording ? () => mediaRecorderRef.current?.stop() : startRecording} className={`p-2 transition-colors ${isRecording ? 'text-red-500 animate-pulse' : 'text-amber-600'}`}>
              {isTranscribing ? <Loader2 className="animate-spin" size={24} /> : <Mic size={24} />}
            </button>
            <button type="submit" className="bg-amber-700 hover:bg-amber-800 text-white px-5 py-2 rounded-xl font-bold transition-all">Scout</button>
          </div>
        </form>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 space-y-10 pb-32">
        
        {mode === AppMode.HOME && (
          <div className="animate-in fade-in duration-700 space-y-12">
            <section className="text-center py-6 space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 text-amber-500 text-xs font-bold uppercase tracking-widest border border-amber-500/20">
                <Compass size={14} /> Nearby Availability Active
              </div>
              <h2 className="serif text-5xl text-amber-950 dark:text-amber-100 leading-tight">Locate Hardcopy <br/>Journals Nearby</h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto text-sm">Real-time scouting for physical books and scholarly journals in local libraries and specialty bookstores.</p>
            </section>

            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="text-amber-500" size={20} />
                  <h3 className="serif text-2xl">Journal Archives</h3>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {CURATED_JOURNALS.map((cj) => (
                  <div key={cj.id} className={`group p-6 rounded-3xl border transition-all hover:shadow-2xl hover:border-amber-500/50 cursor-default ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-amber-100'}`}>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl group-hover:bg-amber-500/10 transition-colors">
                        {cj.icon}
                      </div>
                      <div>
                        <h4 className="font-bold text-lg">{cj.name}</h4>
                        <p className="text-xs text-slate-500">{cj.description}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cj.famousBooks.map((book) => (
                        <button 
                          key={book} 
                          onClick={() => { setSearchQuery(book); handleSearch(undefined, book); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isDarkMode ? 'bg-slate-800 text-amber-400 hover:bg-amber-400 hover:text-slate-950' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
                        >
                          {book}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {mode === AppMode.SEARCH && isSearching && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 animate-pulse">
            <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="serif text-xl text-amber-500">Scouting nearby locations...</p>
          </div>
        )}

        {mode === AppMode.SEARCH && searchResult && (
          <div className="animate-in slide-in-from-bottom-6 duration-500 space-y-6">
            <div className={`p-8 rounded-3xl border ${isDarkMode ? 'bg-slate-900/50 border-slate-800 shadow-2xl' : 'bg-amber-50/50 border-amber-100 shadow-sm'}`}>
              <div className="flex flex-col md:flex-row gap-8">
                {searchResult.coverImageUrl && <img src={searchResult.coverImageUrl} className="w-full md:w-48 rounded-2xl shadow-2xl border-2 border-slate-800/50" alt={searchResult.title} />}
                <div className="flex-1 space-y-4">
                  <div>
                    <h2 className="serif text-4xl leading-tight">{searchResult.title}</h2>
                    <p className="text-xl font-medium text-amber-500">{searchResult.author}</p>
                  </div>
                  
                  <div className={`p-4 rounded-2xl flex items-center justify-between border-2 ${isDarkMode ? 'bg-slate-900/80 border-slate-700' : 'bg-white border-amber-100'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${isPlayingAudio ? 'bg-amber-500 text-slate-900 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
                        <Volume2 size={20} />
                      </div>
                      <p className="text-xs font-black uppercase tracking-widest">{isAudioLoading ? 'Loading Voice...' : 'Voice Preview'}</p>
                    </div>
                    <button onClick={() => handleAudioToggle(searchResult.summary)} className="p-3 bg-amber-700 text-white rounded-xl hover:scale-105 transition-all">
                      {isPlayingAudio ? <Pause size={20} /> : <Play size={20} />}
                    </button>
                  </div>

                  <p className="text-lg italic text-slate-400 leading-relaxed">"{searchResult.summary}"</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {searchResult.authorBio && (
                       <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                         <h4 className="text-[10px] font-black uppercase text-amber-500 mb-2">Editor/Author</h4>
                         <p className="text-xs line-clamp-3">{searchResult.authorBio}</p>
                       </div>
                     )}
                     {searchResult.awards && searchResult.awards.length > 0 && (
                       <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                         <h4 className="text-[10px] font-black uppercase text-amber-500 mb-2">Field/Impact</h4>
                         <p className="text-xs">{searchResult.awards[0]}</p>
                       </div>
                     )}
                  </div>
                </div>
              </div>
            </div>

            <div className={`rounded-3xl border overflow-hidden ${isDarkMode ? 'bg-slate-900 border-slate-800 shadow-2xl' : 'bg-white border-amber-100'}`}>
              <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500"><MapPin size={20} /></div>
                   <h3 className="font-bold text-xl serif">Nearby Availability</h3>
                 </div>
                 <div className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase rounded-full">Real-time Grounding</div>
              </div>
              <div className="p-6 space-y-8">
                <div className="space-y-4">
                  <span className="text-[10px] font-black uppercase text-amber-600 tracking-widest block">Hardcopy Locations (Physical)</span>
                  {searchResult.locations.length > 0 ? searchResult.locations.map((l, i) => (
                    <a key={i} href={l.uri} target="_blank" className="flex items-center justify-between p-4 bg-slate-800/40 rounded-2xl border border-transparent hover:border-amber-500/50 transition-all group">
                      <div className="flex items-center gap-3">
                         <div className={`p-2 rounded-lg ${l.type === 'library' ? 'bg-blue-500/10 text-blue-400' : 'bg-orange-500/10 text-orange-400'}`}>
                           <Building size={16} />
                         </div>
                         <div>
                            <p className="font-bold group-hover:text-amber-400 transition-colors">{l.name}</p>
                            <p className="text-[10px] text-slate-500 uppercase">{l.type}</p>
                         </div>
                      </div>
                      <Navigation size={18} className="text-slate-600 group-hover:text-amber-500" />
                    </a>
                  )) : (
                    <div className="text-center py-6 border border-dashed border-slate-700 rounded-2xl text-slate-500 text-sm">
                      No physical copies found nearby. Try searching a neighboring city.
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <span className="text-[10px] font-black uppercase text-blue-500 tracking-widest block">Digital Archives (Softcopy)</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {searchResult.softcopies.map((s, i) => (
                      <a key={i} href={s.uri} target="_blank" className="flex items-center gap-3 p-3 bg-slate-800/20 rounded-xl border border-slate-800 hover:bg-slate-800 transition-all text-xs truncate">
                        <ExternalLink size={14} className="flex-shrink-0 text-blue-400" />
                        <span className="truncate opacity-80">{s.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      <footer className={`p-4 flex justify-around items-center sticky bottom-0 z-50 border-t ${isDarkMode ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 backdrop-blur-md shadow-2xl'}`}>
        <button onClick={() => setMode(AppMode.HOME)} className={`flex flex-col items-center gap-1 transition-all ${mode === AppMode.HOME ? 'text-amber-500' : 'text-slate-500'}`}>
          <Home size={22} />
          <span className="text-[10px] font-bold uppercase">Home</span>
        </button>
        <button onClick={() => setMode(AppMode.SEARCH)} className={`flex flex-col items-center gap-1 transition-all ${mode === AppMode.SEARCH ? 'text-amber-500' : 'text-slate-500'}`}>
          <Compass size={22} />
          <span className="text-[10px] font-bold uppercase">Scout</span>
        </button>
        <button onClick={isRecording ? () => mediaRecorderRef.current?.stop() : startRecording} className={`p-4 rounded-full -mt-10 border-4 ${isRecording ? 'bg-red-500 border-white animate-pulse' : 'bg-amber-600 border-slate-950'} text-white shadow-2xl active:scale-90 transition-all z-50`}>
          {isRecording ? <Square size={24} /> : <Mic size={24} />}
        </button>
        <button onClick={() => setMode(AppMode.LIBRARIAN)} className={`flex flex-col items-center gap-1 transition-all ${mode === AppMode.LIBRARIAN ? 'text-amber-500' : 'text-slate-500'}`}>
          <MessageSquare size={22} />
          <span className="text-[10px] font-bold uppercase">Expert</span>
        </button>
        <button onClick={() => setMode(AppMode.SETTINGS)} className={`flex flex-col items-center gap-1 transition-all ${mode === AppMode.SETTINGS ? 'text-amber-500' : 'text-slate-500'}`}>
          <Settings size={22} />
          <span className="text-[10px] font-bold uppercase">Setup</span>
        </button>
      </footer>
    </div>
  );
};

export default App;
