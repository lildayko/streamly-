 "use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, Bell, Bookmark, Check, ChevronDown, Compass, Grid2X2,
  Heart, Home, Layers3, Menu, MonitorPlay, MoreHorizontal, Radio,
  Search, Settings2, Sparkles, Tv2, Video, X, Zap
} from "lucide-react";

type Platform = "YouTube" | "Twitch" | "VK Видео";
type VideoItem = {
  id: number | string; title: string; creator: string; channelId?: string; platform: Platform; category: string;
  views: string; age: string; duration: string; image: string; live?: boolean; tag?: string; url?: string;
};
type ApiStatus = { configured: boolean; message: string };

const platformClass: Record<Platform, string> = {
  YouTube: "youtube", Twitch: "twitch", "VK Видео": "vk"
};

const unique = (items: VideoItem[]) => Array.from(new Map(items.map(item => [item.id, item])).values());

export default function HomePage() {
  const [activeNav, setActiveNav] = useState("Для тебя");
  const [platform, setPlatform] = useState("Все платформы");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<(number | string)[]>([]);
  const [savedItems, setSavedItems] = useState<VideoItem[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchPlatform, setSearchPlatform] = useState("Все платформы");
  const [nextCursor, setNextCursor] = useState("");
  const [discovery, setDiscovery] = useState<VideoItem[]>([]);
  const [discoveryCursor, setDiscoveryCursor] = useState("");
  const searchRequest = useRef(0);
  const playerRequest = useRef(0);
  const [following, setFollowing] = useState<string[]>(["Кирилл играет", "neonfox", "Техно Просто"]);
  const [showPlatforms, setShowPlatforms] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [remoteResults, setRemoteResults] = useState<VideoItem[] | null>(null);
  const [apiStatuses, setApiStatuses] = useState<Record<string, ApiStatus>>({});
  const [searching, setSearching] = useState(false);
  const [playerVideo, setPlayerVideo] = useState<VideoItem | null>(null);
  const [shortsMode, setShortsMode] = useState(false);
  const [shortsIndex, setShortsIndex] = useState(0);
  const [shortsNotice, setShortsNotice] = useState("");
  const [recommendations, setRecommendations] = useState<VideoItem[]>([]);
  const [playerQuery, setPlayerQuery] = useState("");
  const [history, setHistory] = useState<VideoItem[]>([]);
  const [playerSearching, setPlayerSearching] = useState(false);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<{id:string; name:string} | null>(null);
  const [accountRecommendations, setAccountRecommendations] = useState<VideoItem[]>([]);
  const [subscriptionChannels, setSubscriptionChannels] = useState<{id:string; title:string; thumbnail?:string; description?:string; subscriberCount?:string}[]>([]);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState("");

  const loadYouTubeSubscriptions = useCallback(async (force = false) => {
    setLoadingSubscriptions(true);
    setSubscriptionMessage("");
    try {
      const response = await fetch(`/api/youtube/recommendations${force ? "?refresh=1" : ""}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.connected) {
        if (response.status === 401) {
          setYoutubeConnected(false);
          setSubscriptionChannels([]);
          setAccountRecommendations([]);
        }
        if (body.message) setSubscriptionMessage(String(body.message));
        return;
      }
      setYoutubeConnected(true);
      setSubscriptionChannels(Array.isArray(body.channels) ? body.channels : []);
      const failed = new Set<string>(body.failedChannelIds || []);
      setAccountRecommendations(old => unique([...(Array.isArray(body.items) ? body.items : []), ...old.filter(item => item.channelId && failed.has(item.channelId))]));
      if (!body.channels?.length) setSubscriptionMessage("Подписок не найдено. Проверь подключённый YouTube-аккаунт.");
      else if (body.partial) setSubscriptionMessage("Часть каналов не удалось обновить. Повтори обновление позже.");
      else setSubscriptionMessage(`Загружено каналов: ${body.channels.length}; видео: ${(body.items || []).length}.`);
    } catch {
      setSubscriptionMessage("Не удалось загрузить подписки. Проверь соединение и подключение YouTube.");
    } finally {
      setLoadingSubscriptions(false);
    }
  }, []);

  useEffect(() => {
    try {
      const rawFollowing = localStorage.getItem("streamly-following");
      const rawSaved = localStorage.getItem("streamly-saved");
      const rawHistory = localStorage.getItem("streamly-history");
      const params = new URLSearchParams(window.location.search);
      if (params.get("youtube") === "connected") { setYoutubeConnected(true); window.history.replaceState({}, "", window.location.pathname); notify("YouTube-аккаунт подключён"); }
      const readArray = (raw: string | null) => { try { const value = JSON.parse(raw || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } };
      if (rawFollowing) setFollowing(readArray(rawFollowing).filter(x => typeof x === "string"));
      const validVideos = (raw: string | null) => readArray(raw).filter(x => x && typeof x.title === "string" && typeof x.creator === "string" && typeof x.duration === "string" && ["YouTube", "Twitch", "VK Видео"].includes(x.platform) && (typeof x.id === "string" || typeof x.id === "number"));
      const library = validVideos(localStorage.getItem("streamly-saved-items"));
      setSavedItems(library);
      setSaved([...new Set([...readArray(rawSaved).filter(x => typeof x === "string" || typeof x === "number"), ...library.map(x => x.id)])]);
      if (rawHistory) setHistory(validVideos(rawHistory));
    } catch { /* Ignore invalid local browser data. */ }
    setStorageReady(true);
    void loadYouTubeSubscriptions();
  }, [loadYouTubeSubscriptions]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem("streamly-following", JSON.stringify(following));
      localStorage.setItem("streamly-saved", JSON.stringify(saved));
      localStorage.setItem("streamly-saved-items", JSON.stringify(savedItems));
      localStorage.setItem("streamly-history", JSON.stringify(history));
    } catch { /* Storage may be disabled by the browser. */ }
  }, [following, saved, savedItems, history, storageReady]);

  useEffect(() => {
    document.body.style.overflow = playerVideo ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [playerVideo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSearching(true);
      try {
        const response = await fetch("/api/search?discover=1&platform=YouTube");
        const body = await response.json();
        if (!cancelled) { setDiscovery((body.items ?? []) as VideoItem[]); setDiscoveryCursor(body.nextCursor || ""); setApiStatuses(body.statuses ?? {}); }
      } catch { if (!cancelled) setRemoteResults([]); }
      finally { if (!cancelled) setSearching(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const feedSource = submittedQuery ? (remoteResults ?? [])
    : activeNav === "Сохранённое" ? savedItems
    : activeNav === "История" ? history
    : selectedChannel ? unique([...accountRecommendations, ...discovery, ...(remoteResults ?? []), ...savedItems, ...history]).filter(v => (v.channelId || v.creator) === selectedChannel.id)
    : youtubeConnected && ["Для тебя", "Подписки", "Shorts"].includes(activeNav) ? accountRecommendations
    : discovery;
  const durationSeconds = (value: string) => {
    const parts = (value || "").trim().split(":").map(Number);
    if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0) || parts.length > 3) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  };
  const isShort = (v: VideoItem) => {
    if (v.platform !== "YouTube" || v.live) return false;
    const seconds = durationSeconds(v.duration);
    return seconds !== null && seconds > 0 && seconds < 165;
  };
  const shorts = feedSource.filter(v => isShort(v) && (platform === "Все платформы" || v.platform === platform));
  const filtered = feedSource.filter((v) => {
    // Unknown durations remain visible; the short-video filter requires a known duration.
    if (!submittedQuery && !["История", "Сохранённое", "Канал"].includes(activeNav) && activeNav !== "Shorts" && isShort(v)) return false;
    if (!submittedQuery && activeNav === "Shorts" && !isShort(v)) return false;
    const matchesPlatform = platform === "Все платформы" || v.platform === platform;
    const matchesNav = Boolean(submittedQuery) || activeNav !== "Подписки" || youtubeConnected || following.includes(v.channelId || v.creator);
    const matchesLive = Boolean(submittedQuery) || activeNav !== "В эфире" || v.live;
    const matchesSaved = Boolean(submittedQuery) || activeNav !== "Сохранённое" || saved.includes(v.id);
    const matchesHistory = Boolean(submittedQuery) || activeNav !== "История" || history.some((item) => item.id === v.id);
    return matchesPlatform && matchesNav && matchesLive && matchesSaved && matchesHistory;
  });

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function toggleSave(id: number | string) {
    const item = [...feedSource, ...recommendations, ...history].find(v => v.id === id);
    setSavedItems(old => saved.includes(id) ? old.filter(v => v.id !== id) : item ? unique([...old, item]) : old);
    setSaved((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);
    notify(saved.includes(id) ? "Убрано из сохранённого" : "Добавлено в сохранённое");
  }

  async function runSearch(append = false, override?: string) {
    const q = override ?? (append ? submittedQuery : query.trim());
    const cursor = append ? (q ? nextCursor : discoveryCursor) : "";
    const requestId = ++searchRequest.current;
    if (!q && !append) { setSubmittedQuery(""); setSearching(false); return; }
    setSearching(true);
    try {
      const params = new URLSearchParams({ platform: q ? (append ? searchPlatform : platform) : "YouTube" });
      if (q) params.set("q", q); else params.set("discover", "1");
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/search?${params}`);
      const body = await response.json();
      if (requestId !== searchRequest.current) return;
      if (!response.ok) throw new Error(body.error || "Не удалось выполнить поиск");
      if (!body.items?.length && Object.values(body.statuses || {}).some((status: unknown) => (status as ApiStatus).message !== "Подключено")) {
        setApiStatuses(body.statuses || {});
        throw new Error("Поиск недоступен: проверь статусы платформ. Предыдущие результаты сохранены.");
      }
      if (q) {
        setRemoteResults(old => append ? unique([...(old || []), ...(body.items || [])]) : body.items || []);
        setSubmittedQuery(q);
        if (!append) setSearchPlatform(platform);
        setNextCursor(body.nextCursor || "");
        setSelectedChannel(null);
      } else {
        setDiscovery(old => unique([...old, ...(body.items || [])]));
        setDiscoveryCursor(body.nextCursor || "");
      }
      setApiStatuses(body.statuses || {});
    } catch (error) {
      if (requestId === searchRequest.current) notify(error instanceof Error ? error.message : "Ошибка поиска");
    } finally {
      if (requestId === searchRequest.current) setSearching(false);
    }
  }

  async function openVideo(v: VideoItem) {
    const requestId = ++playerRequest.current;
    setShortsMode(isShort(v));
    setShortsIndex(Math.max(0, shorts.findIndex(item => item.id === v.id)));
    setRecommendations([]);
    setPlayerSearching(false);
    setPlayerQuery("");
    setPlayerVideo(v);
    setHistory((old) => [v, ...old.filter((item) => item.id !== v.id)].slice(0, 100));
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(v.title)}&platform=${encodeURIComponent(v.platform)}`);
      const body = await response.json();
      if (requestId !== playerRequest.current) return;
      setRecommendations(((body.items ?? []) as VideoItem[]).filter((item) => item.id !== v.id).slice(0, 8));
    } catch { if (requestId === playerRequest.current) setRecommendations([]); }
  }

  async function searchInPlayer() {
    const q = playerQuery.trim();
    if (!q) return;
    const requestId = ++playerRequest.current;
    setPlayerSearching(true);
    try {
      const params = new URLSearchParams({ q, platform: platform === "Все платформы" ? "YouTube" : platform });
      const response = await fetch(`/api/search?${params.toString()}`);
      const body = await response.json();
      if (requestId !== playerRequest.current) return;
      setRecommendations(((body.items ?? []) as VideoItem[]).filter((item) => item.id !== playerVideo?.id).slice(0, 20));
      if (!(body.items ?? []).length) notify("По этому запросу ничего не найдено.");
    } catch { notify("Не удалось выполнить поиск в плеере."); }
    finally { if (requestId === playerRequest.current) setPlayerSearching(false); }
  }

  function toggleFollow(creator: string, channelId?: string) {
    const followKey = channelId || creator;
    const isFollowing = following.includes(followKey);
    setFollowing((old) => isFollowing ? old.filter((name) => name !== followKey) : [...old, followKey]);
    notify(isFollowing ? `Вы отписались от ${creator}` : `Автор ${creator} добавлен в Streamly`);
  }

  const navItems = [
    { label: "Для тебя", icon: Home },
    { label: "Shorts", icon: Zap },
    { label: "Подписки", icon: Layers3 },
    { label: "В эфире", icon: Radio },
    { label: "История", icon: Activity },
    { label: "Сохранённое", icon: Bookmark },
  ];
  const categories = ["Все", "Игры", "Технологии", "Музыка", "Творчество", "Документальное"];

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); setActiveNav("Для тебя"); setSelectedChannel(null); setSubmittedQuery(""); setQuery(""); ++searchRequest.current; setSearching(false); }}>
          <span className="brand-mark"><Activity size={21} strokeWidth={2.7}/></span>
          <span>streamly<span className="brand-dot">.</span></span>
        </a>
        <div className="workspace-label">ТВОЁ ПРОСТРАНСТВО</div>
        <a href="/api/youtube/auth" className="nav-item" style={{margin:"8px 0",textDecoration:"none",color:"inherit"}}><span className="platform-icon yt">▶</span>{youtubeConnected ? "YouTube подключён" : "Подключить YouTube"}</a>
        <nav className="main-nav">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${activeNav === label ? "active" : ""}`} onClick={() => { setActiveNav(label); setSelectedChannel(null); setSubmittedQuery(""); setQuery(""); ++searchRequest.current; setSearching(false); setMobileMenu(false); }}>
              <Icon size={19}/><span>{label}</span>
              {label === "В эфире" && <span className="live-count">2</span>}{label === "История" && <span className="live-count">{history.length}</span>}
            </button>
          ))}
        </nav>
        <div className="side-divider"/>
        <div className="side-heading"><span>ПЛАТФОРМЫ</span><button aria-label="Настроить платформы" onClick={() => setShowPlatforms(!showPlatforms)}><Settings2 size={16}/></button></div>
        {showPlatforms && <div className="platform-popover">
          {["Все платформы", "YouTube", "Twitch", "VK Видео"].map(p => <button key={p} onClick={() => {setPlatform(p); setShowPlatforms(false);}}>{p === platform && <Check size={14}/>}<span>{p}</span></button>)}
        </div>}
        <button className={`platform-row ${platform === "YouTube" ? "platform-selected" : ""}`} onClick={() => setPlatform(platform === "YouTube" ? "Все платформы" : "YouTube")}><span className="platform-icon yt">▶</span><span>YouTube</span><span className="connection-dot"/></button>
        <button className={`platform-row ${platform === "Twitch" ? "platform-selected" : ""}`} onClick={() => setPlatform(platform === "Twitch" ? "Все платформы" : "Twitch")}><span className="platform-icon tw">▰</span><span>Twitch</span><span className="connection-dot"/></button>
        <button className={`platform-row ${platform === "VK Видео" ? "platform-selected" : ""}`} onClick={() => setPlatform(platform === "VK Видео" ? "Все платформы" : "VK Видео")}><span className="platform-icon vk">ᴠκ</span><span>VK Видео</span><span className="connection-dot"/></button>
        <button className="connect-platform" onClick={() => notify("Подключение аккаунтов появится после настройки API.")}><span>+</span> Подключить платформу</button>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon"><Sparkles size={17}/></div>
            <strong>Твой контент. В одном месте.</strong>
            <p>Меньше переключений — больше интересного.</p>
            <button onClick={() => notify("Планы подписки появятся после запуска MVP.")}>Узнать о Plus <span>↗</span></button>
          </div>
          <button className="profile-row" onClick={() => notify("Профиль пользователя — демонстрационный режим.")}>
            <span className="avatar">S</span><span className="profile-info"><strong>Мой профиль</strong><small>Бесплатный план</small></span><MoreHorizontal size={19}/>
          </button>
        </div>
      </aside>

      {mobileMenu && <button className="mobile-backdrop" aria-label="Закрыть меню" onClick={() => setMobileMenu(false)}/>}

      <section className="main-area">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" aria-label="Открыть меню" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={21}/></button>
          <div className="breadcrumb"><span>Главная</span><span className="crumb-slash">/</span><strong>{activeNav}</strong></div>
          <div className="top-actions">
            <label className="search-box"><Search size={18}/><input value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) { ++searchRequest.current; setSubmittedQuery(""); setSearching(false); } }} onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }} placeholder="Найти видео, автора..."/><button type="button" aria-label="Искать" onClick={() => void runSearch()} style={{border:0,background:"transparent",color:"inherit",cursor:"pointer",fontSize:12,fontWeight:700}}>{searching ? "…" : "Найти"}</button></label>
            <button className="icon-button notification-button" aria-label="Уведомления" onClick={() => notify("Новых уведомлений пока нет.")}><Bell size={19}/><span/></button>
          </div>
        </header>

        <div className="content">
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="eyebrow-spark">✳</span> ТВОЙ МЕДИА-ЦЕНТР</div><h1>Всё интересное.<br/><span>В одном потоке.</span></h1><p className="welcome-copy">Видео и стримы с любимых платформ — собраны для тебя.</p></div>
            <div className="welcome-art" aria-hidden="true"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-core"><Activity size={39}/></div><div className="float-tile tile-play"><Video size={20}/></div><div className="float-tile tile-live"><span/> LIVE</div><div className="float-tile tile-spark"><Sparkles size={17}/></div></div>
          </section>

          <section className="stats-row">
            <div className="stat-card"><span className="stat-icon purple"><Grid2X2 size={17}/></span><div><strong>3</strong><span>платформы в ленте</span></div></div>
            <div className="stat-card"><span className="stat-icon coral"><Radio size={17}/></span><div><strong>2 <i className="live-pulse"/></strong><span>эфира сейчас</span></div></div>
            <div className="stat-card"><span className="stat-icon blue"><Bookmark size={17}/></span><div><strong>{saved.length}</strong><span>сохранено</span></div></div>
          </section>

          <section className="feed-section">
            <div className="section-heading"><div><div className="eyebrow">{submittedQuery ? "ПОИСК ПО ПЛАТФОРМАМ" : "РЕАЛЬНЫЕ ВИДЕО"}</div><h2>{submittedQuery ? `Результаты: ${submittedQuery}` : activeNav === "Для тебя" ? "Видео для тебя" : activeNav === "Shorts" ? "Shorts до 2:45" : activeNav}</h2></div><button className="sort-button" onClick={() => notify("В демо используется сортировка по релевантности.")}><Activity size={16}/> Для тебя <ChevronDown size={15}/></button></div>
            {false && activeNav === "Для тебя" && !query.trim() && shorts.length > 0 && <section className="shorts-section">
              <div className="shorts-heading"><h2><span>▶</span> Shorts</h2><div className="shorts-arrows"><button aria-label="Прокрутить Shorts влево" onClick={() => document.querySelector(".shorts-rail")?.scrollBy({left:-320,behavior:"smooth"})}>‹</button><button aria-label="Прокрутить Shorts вправо" onClick={() => document.querySelector(".shorts-rail")?.scrollBy({left:320,behavior:"smooth"})}>›</button></div></div>
              <div className="shorts-rail">{shorts.map((v, i) => <button className="short-card" key={v.id} onClick={() => { setShortsIndex(i); void openVideo(v); }}><img src={v.image} alt=""/><span className="short-play">▶</span><strong>{v.title}</strong><small>{v.creator}</small></button>)}</div>
            </section>}
            <div className="filter-row">
              {categories.map((cat) => <button key={cat} className={`filter-chip ${((cat === "Все" && !categories.slice(1).includes(platform)) || cat === platform) ? "selected" : ""}`} onClick={() => { if (cat === "Все") setPlatform("Все платформы"); else { setQuery(""); setActiveNav("Для тебя"); setSelectedChannel(null); notify(`Категория «${cat}» доступна в демо через поиск.`); setQuery(cat); void runSearch(false, cat); } }}>{cat}</button>)}
              <button className="filter-platform" onClick={() => setShowPlatforms(!showPlatforms)}><Tv2 size={15}/> {platform} <ChevronDown size={14}/></button>
            </div>

            {Object.keys(apiStatuses).length > 0 && <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"8px 0 16px",fontSize:12,color:"var(--muted, #999)"}}>{Object.entries(apiStatuses).map(([name,status]) => <span key={name} style={{border:"1px solid rgba(255,255,255,.12)",borderRadius:999,padding:"6px 10px"}}><span style={{color:status.configured && status.message === "Подключено" ? "#55d6a0" : "#f0b36c"}}>●</span> {name}: {status.message}</span>)}</div>}
            {activeNav === "Подписки" && !youtubeConnected && <div className="empty-state"><h3>Подключи свой YouTube</h3><p>Streamly загрузит список подписок и последние 50 видео из загрузок каждого доступного канала.</p><a className="primary-button" href="/api/youtube/auth">Подключить YouTube</a>{subscriptionMessage && <p>{subscriptionMessage}</p>}</div>}
              {activeNav === "Подписки" && !selectedChannel && youtubeConnected && <section className="subscribed-channels">
                <div className="channel-list-heading"><h3>Твои каналы</h3><span>{subscriptionChannels.length} подписок</span><button onClick={() => void loadYouTubeSubscriptions(true)} disabled={loadingSubscriptions}>{loadingSubscriptions ? "Обновляем…" : "Обновить"}</button></div>
                {subscriptionMessage && <p className="subscription-message" role="status">{subscriptionMessage}</p>}
                <div className="channel-list">{subscriptionChannels.map(channel => <button className="channel-pill" key={channel.id} onClick={() => { setSelectedChannel({id: channel.id, name: channel.title}); setSubmittedQuery(""); setActiveNav("Подписки"); setQuery(""); }}>
                  {channel.thumbnail ? <img src={channel.thumbnail} alt="" /> : <span className="channel-fallback">{channel.title.slice(0,1).toUpperCase()}</span>}
                  <span><strong>{channel.title}</strong><small>{channel.subscriberCount ? `${Number(channel.subscriberCount).toLocaleString("ru-RU")} подписчиков` : "YouTube канал"}</small></span>
                </button>)}</div>
              </section>}

            {filtered.length > 0 ? <>
              {selectedChannel && <div className="channel-heading"><h2>{selectedChannel.name}</h2><p>Канал · {filtered.length} видео из подписок/результатов</p><button onClick={() => setSelectedChannel(null)}>← Назад к каналам</button></div>}
              <div className="video-grid">
              {filtered.map((v) => <article className="video-card" key={v.id}>
                <button className="thumbnail-button" onClick={() => openVideo(v)} aria-label={`Открыть ${v.title}`}>
                  {/* Remote images are used in this prototype to simulate platform thumbnails. */}
                  <img className="thumbnail" src={v.image} alt="" />
                  <span className={`source-badge ${platformClass[v.platform]}`}>{v.platform === "YouTube" ? "▶ YouTube" : v.platform === "Twitch" ? "▰ Twitch" : "ᴠκ Видео"}</span>
                  {v.tag && <span className="content-tag">{v.tag}</span>}
                  <span className={`duration ${v.live ? "duration-live" : ""}`}>{v.duration}</span>
                  <span className="thumbnail-play"><MonitorPlay size={24}/></span>
                </button>
                <div className="video-info">
                  <button className="creator-avatar" onClick={() => {setSelectedChannel({id: v.channelId || v.creator, name: v.creator}); setSubmittedQuery(""); setQuery(""); setActiveNav("Канал");}}>{v.creator.slice(0,1).toUpperCase()}</button>
                  <div className="video-copy"><button className="video-title" onClick={() => openVideo(v)}>{v.title}</button><button className="creator-name" onClick={() => {setSelectedChannel({id: v.channelId || v.creator, name: v.creator}); setSubmittedQuery(""); setQuery(""); setActiveNav("Канал");}}>{v.creator}</button><button className="creator-follow" style={{display:"block",border:0,background:"transparent",color:"var(--accent, #b5a0ff)",padding:"3px 0",cursor:"pointer",fontSize:12}} onClick={() => toggleFollow(v.creator, v.channelId)}>{following.includes(v.channelId || v.creator) ? "Вы подписаны" : "+ Следить в Streamly"}</button><div className="video-meta"><span>{v.views}</span><span className="meta-dot">·</span><span>{v.age}</span></div></div>
                  <button className={`save-button ${saved.includes(v.id) ? "is-saved" : ""}`} aria-label="Сохранить видео" onClick={() => toggleSave(v.id)}>{saved.includes(v.id) ? <Heart size={17} fill="currentColor"/> : <Bookmark size={17}/>}</button>
                </div>
              </article>)}
            </div>
            </> : <div className="empty-state"><div className="empty-icon"><Search size={25}/></div><h3>{activeNav === "Shorts" ? "Пока нет коротких видео" : "Ничего не нашлось"}</h3><p>{activeNav === "Shorts" ? "Здесь появятся YouTube-видео короче 2:45, когда их длительность будет доступна." : "Попробуй изменить запрос или выбрать другую платформу."}</p><button className="primary-button" onClick={() => {setQuery("");setSubmittedQuery("");setSelectedChannel(null);setPlatform("Все платформы");setActiveNav("Для тебя");}}>Сбросить фильтры</button></div>}

            {(submittedQuery ? nextCursor : !youtubeConnected && ["Для тебя", "Shorts", "В эфире"].includes(activeNav) ? discoveryCursor : "") && <div className="load-more-wrap"><button className="load-more" disabled={searching} onClick={() => void runSearch(true)}><Compass size={17}/> {searching ? "Загружаем…" : "Загрузить ещё"}</button></div>}
          </section>
          <footer><span className="footer-brand">streamly<span>.</span></span><span>Один поток. Больше открытий.</span><span className="demo-label"><span/> {searching ? "Загружаем видео…" : `${filtered.length} видео в ленте`}</span></footer>
        </div>
      </section>
      {playerVideo && <div className={`player-overlay ${shortsMode ? "shorts-player-overlay" : ""}`} role="dialog" aria-modal="true" aria-label={shortsMode ? "Просмотр Shorts" : "Видеоплеер"} onWheel={(e) => { if (shortsMode && Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 12) setShortsNotice("Для перемотки используй полосу прогресса в самом YouTube-плеере: встроенное видео не отдаёт Streamly точное время по жесту тачпада."); }}><div className={`player-modal ${shortsMode ? "shorts-player-modal" : ""}`}>{shortsMode ? <><button className="shorts-close" aria-label="Закрыть Shorts" onClick={() => setPlayerVideo(null)}><X size={22}/></button><div className="shorts-stage">{playerVideo.platform === "YouTube" && String(playerVideo.id).startsWith("yt-") ? <iframe className="shorts-frame" src={`https://www.youtube-nocookie.com/embed/${String(playerVideo.id).slice(3)}?autoplay=1&controls=1&rel=0&modestbranding=1`} title={playerVideo.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /> : <div className="player-unavailable"><MonitorPlay size={36}/><p>Этот Short нельзя встроить.</p><a href={playerVideo.url} target="_blank" rel="noreferrer">Открыть оригинал ↗</a></div>}<div className="shorts-side-actions"><button onClick={() => notify("Лайк выполняется на стороне YouTube.")}>♡<small>Нравится</small></button><button onClick={() => notify("Комментарии доступны на YouTube.")}>☰<small>Комментарии</small></button><button onClick={() => { if (playerVideo.url) void navigator.clipboard?.writeText(playerVideo.url); notify("Ссылка на видео скопирована, если браузер разрешил доступ."); }}>↗<small>Поделиться</small></button></div><div className="shorts-caption"><strong>{playerVideo.creator}</strong><span>{playerVideo.title}</span><small>{playerVideo.views}</small></div></div>{shortsNotice && <p className="shorts-notice">{shortsNotice}</p>}<div className="shorts-nav"><button disabled={shortsIndex <= 0} onClick={() => { const v = shorts[shortsIndex-1]; if(v){setShortsIndex(shortsIndex-1); void openVideo(v);} }}>↑ Предыдущий</button><button disabled={shortsIndex >= shorts.length-1} onClick={() => { const v = shorts[shortsIndex+1]; if(v){setShortsIndex(shortsIndex+1); void openVideo(v);} }}>Следующий ↓</button></div></> : <><div className="player-top"><strong>{playerVideo.title}</strong><button className="icon-button" aria-label="Закрыть плеер" onClick={() => setPlayerVideo(null)}><X size={22}/></button></div><div className="player-layout"><div className="player-main">{playerVideo.platform === "YouTube" && String(playerVideo.id).startsWith("yt-") ? <iframe className="player-frame" src={`https://www.youtube-nocookie.com/embed/${String(playerVideo.id).slice(3)}?autoplay=1&rel=0`} title={playerVideo.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /> : playerVideo.platform === "Twitch" ? <iframe className="player-frame" src={`https://player.twitch.tv/?channel=${encodeURIComponent(playerVideo.url?.split("/").filter(Boolean).pop() || playerVideo.creator)}&parent=${typeof window === "undefined" ? "localhost" : window.location.hostname}&autoplay=true`} title={playerVideo.title} allowFullScreen /> : <div className="player-unavailable"><MonitorPlay size={36}/><p>Встроенный плеер для этого видео недоступен.</p><a href={playerVideo.url} target="_blank" rel="noreferrer">Открыть оригинал на {playerVideo.platform} ↗</a></div>}<h2>{playerVideo.title}</h2><div className="player-channel-row"><p className="player-creator">{playerVideo.creator} · {playerVideo.views}</p><button className={`follow-button ${following.includes(playerVideo.channelId || playerVideo.creator) ? "following" : ""}`} onClick={() => toggleFollow(playerVideo.creator, playerVideo.channelId)}>{following.includes(playerVideo.channelId || playerVideo.creator) ? "✓ Вы подписаны" : "+ Следить в Streamly"}</button></div></div><aside className="recommendations"><h3>Поиск и рекомендации</h3><form className="player-search" onSubmit={(e) => {e.preventDefault(); void searchInPlayer();}}><Search size={16}/><input value={playerQuery} onChange={(e) => setPlayerQuery(e.target.value)} placeholder="Найти видео..."/><button type="submit" disabled={playerSearching}>{playerSearching ? "…" : "Найти"}</button></form>{recommendations.map((item) => <button key={item.id} className="recommendation" onClick={() => void openVideo(item)}><img src={item.image} alt=""/><span><strong>{item.title}</strong><small>{item.creator} · {item.platform}</small></span></button>)}{recommendations.length === 0 && <p className="recommendation-empty">Похожие видео появятся после загрузки результатов API.</p>}</aside></div></>}</div></div>}
      {toast && <div className="toast"><Check size={17}/>{toast}<button aria-label="Закрыть" onClick={() => setToast("")}><X size={15}/></button></div>}
    </main>
  );
}
