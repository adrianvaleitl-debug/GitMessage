import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "./lib/supabase";
import {
  MessageCircle, Search, Plus, Send, Settings, Users, LogOut, Sparkles,
  ShieldCheck, X, Moon, Sun, MoreHorizontal, ArrowUpRight, Check,
  RefreshCw, PanelLeftClose, PanelLeftOpen, UserRoundPlus, Mail
} from "lucide-react";

type Conversation = { id: string; title: string | null; updated_at?: string };
type Message = { id: string; body: string; sender_id: string; created_at: string };
type ContactMatch = { user_id: string; email: string };

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<"new" | "settings" | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactResults, setContactResults] = useState<ContactMatch[]>([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [lightMode, setLightMode] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setNotice(error.message);
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setNotice("");
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  async function loadConversations() {
    if (!supabase || !session) return;
    const { data, error } = await supabase.rpc("get_my_conversations");
    if (error) { setNotice(error.message); return; }
    const rows = (data || []) as Conversation[];
    setConversations(rows);
    if (active && !rows.some(row => row.id === active)) setActive("");
    if (!active && rows[0]) setActive(rows[0].id);
  }

  useEffect(() => {
    if (!session || !supabase) {
      setConversations([]);
      setMessages([]);
      setActive("");
      return;
    }
    void loadConversations();
  }, [session]);

  useEffect(() => {
    if (!active || !supabase) { setMessages([]); return; }
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase!.from("messages")
        .select("id,body,sender_id,created_at").eq("conversation_id", active)
        .order("created_at", { ascending: true }).limit(300);
      if (!alive) return;
      if (error) setNotice(error.message);
      else setMessages((data || []) as Message[]);
    };
    void load();
    const channel = supabase.channel("gitmessage-messages-" + active)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "conversation_id=eq." + active },
        payload => setMessages(current => {
          const incoming = payload.new as Message;
          return current.some(message => message.id === incoming.id) ? current : [...current, incoming];
        }))
      .subscribe();
    return () => { alive = false; void supabase!.removeChannel(channel); };
  }, [active]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filtered = useMemo(() => conversations.filter(c =>
    (c.title || "Conversation").toLowerCase().includes(query.trim().toLowerCase())
  ), [conversations, query]);
  const current = conversations.find(c => c.id === active);

  async function authenticate(event?: FormEvent) {
    event?.preventDefault();
    if (!supabase) { setNotice("GitMessage is missing its Supabase configuration. Rebuild the installer with the repository secret set."); return; }
    if (!email.trim() || !password) { setNotice("Enter your email address and password."); return; }
    if (authMode === "signup" && password.length < 6) { setNotice("Use a password with at least 6 characters."); return; }
    setBusy(true); setNotice("");
    const result = authMode === "signin"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (result.error) setNotice(result.error.message);
    else if (authMode === "signup" && !result.data.session) setNotice("Account created. Check your email to confirm it, then sign in.");
  }

  async function searchContacts(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !contactEmail.trim()) return;
    setContactLoading(true); setNotice(""); setContactResults([]);
    const { data, error } = await supabase.rpc("search_gitmessage_users", {
      search_email: contactEmail.trim()
    });
    setContactLoading(false);
    if (error) { setNotice(error.message); return; }
    setContactResults((data || []) as ContactMatch[]);
    if (!data?.length) setNotice("No GitMessage account found for that exact email address.");
  }

  async function startDirectConversation(user: ContactMatch) {
    if (!supabase) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("create_direct_conversation", {
      target_user_id: user.user_id
    });
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    const conversationId = data as string;
    await loadConversations();
    setActive(conversationId);
    setModal(null);
    setContactEmail("");
    setContactResults([]);
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (!supabase || !active || !session || !draft.trim() || sending) return;
    const body = draft.trim();
    setSending(true);
    const { data, error } = await supabase.from("messages")
      .insert({ conversation_id: active, sender_id: session.user.id, body })
      .select("id,body,sender_id,created_at").single();
    setSending(false);
    if (error) { setNotice(error.message); return; }
    if (data) setMessages(rows => rows.some(m => m.id === data.id) ? rows : [...rows, data as Message]);
    setDraft("");
    setNotice("");
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setNotice(error.message);
    else setModal(null);
  }

  if (!authReady) return <main className="boot-screen"><div className="boot-orb"/><div className="boot-mark"><MessageCircle size={25}/></div><span>Preparing your space</span></main>;

  if (!session) return (
    <main className={"auth-shell" + (lightMode ? " light" : "")}>
      <div className="aurora aurora-one"/><div className="aurora aurora-two"/><div className="aurora aurora-three"/>
      <div className="auth-top"><div className="brand-lockup"><span className="brand-icon"><MessageCircle size={19}/></span><span>GitMessage</span></div><span className="top-caption">A little more connected.</span></div>
      <section className="auth-layout">
        <div className="auth-copy"><div className="eyebrow"><span className="eyebrow-dot"/> YOUR WORLD, IN ONE PLACE</div><h1>Closer,<br/><span>even apart.</span></h1><p>Good conversations deserve a space that feels as considered as the words inside them.</p><div className="auth-proof"><span className="proof-icon"><ShieldCheck size={17}/></span><span><b>Private by design</b><small>Your account is secured with Supabase authentication.</small></span></div></div>
        <form className="auth-card glass-panel" onSubmit={authenticate}>
          <div className="card-glint"/>
          <div className="auth-card-heading"><div className="auth-symbol"><MessageCircle size={22}/></div><div><h2>{authMode === "signin" ? "Welcome back" : "Make it yours"}</h2><p>{authMode === "signin" ? "Sign in to pick up where you left off." : "Create your GitMessage account."}</p></div></div>
          <label htmlFor="email">Email address</label><input id="email" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/>
          <label htmlFor="password">Password</label><input id="password" autoComplete={authMode === "signin" ? "current-password" : "new-password"} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters"/>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "One moment…" : authMode === "signin" ? "Sign in" : "Create account"}<ArrowUpRight size={17}/></button>
          <button type="button" className="switch-auth" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setNotice(""); }}>{authMode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
          {notice && <p className="notice">{notice}</p>}
          <div className="auth-foot"><ShieldCheck size={14}/> Encrypted connection to your account</div>
        </form>
      </section>
      <div className="auth-bottom"><span>GITMESSAGE</span><span>MADE FOR THE MOMENTS BETWEEN.</span><span>01 — 03</span></div>
    </main>
  );

  return (
    <main className={"desktop-shell" + (lightMode ? " light" : "")}>
      <div className="desktop-aurora aurora-one"/><div className="desktop-aurora aurora-two"/>
      <aside className={"sidebar glass-panel" + (!sidebarOpen ? " collapsed" : "")}>
        <div className="sidebar-brand"><div className="brand-lockup"><span className="brand-icon"><MessageCircle size={18}/></span><span>GitMessage</span></div><button className="glass-icon" title="Collapse sidebar" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={17}/></button></div>
        <div className="account-chip"><div className="account-avatar">{(session.user.email || "G").slice(0,1).toUpperCase()}</div><div className="account-copy"><b>{session.user.email?.split("@")[0]}</b><small><i/> Online</small></div><button className="glass-icon tiny" title="Account settings" onClick={() => setModal("settings")}><MoreHorizontal size={18}/></button></div>
        <div className="search-field"><Search size={16}/><input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a conversation"/><kbd>⌘ K</kbd></div>
        <div className="list-heading"><span>YOUR MESSAGES</span><button className="glass-icon tiny" title="New conversation" onClick={() => setModal("new")}><Plus size={17}/></button></div>
        <div className="conversation-list">
          {filtered.map((conversation, index) => <button key={conversation.id} className={"conversation-item" + (active === conversation.id ? " active" : "")} onClick={() => setActive(conversation.id)}>
            <div className={"conversation-avatar avatar-tone-" + (index % 4)}><Users size={17}/></div><div className="conversation-meta"><b>{conversation.title || "Conversation"}</b><small>Open conversation</small></div>{active === conversation.id && <span className="active-indicator"/>}
          </button>)}
          {filtered.length === 0 && <div className="list-empty"><div className="empty-orb"><MessageCircle size={19}/></div><b>{query ? "Nothing found" : "A quiet beginning"}</b><p>{query ? "Try another name." : "Start a conversation to see it here."}</p>{!query && <button onClick={() => setModal("new")}>Start a conversation <Plus size={14}/></button>}</div>}
        </div>
        <div className="sidebar-bottom"><div className="sync-card"><span className="sync-icon"><Sparkles size={16}/></span><span><b>All caught up</b><small>Your space, in sync.</small></span><span className="sync-pulse"/></div><button className="settings-row" onClick={() => setModal("settings")}><Settings size={17}/> Preferences <span>›</span></button><div className="sidebar-footer"><span>GITMESSAGE DESKTOP</span><span>•</span><span>DESKTOP</span></div></div>
      </aside>
      {!sidebarOpen && <button className="reopen-sidebar glass-icon" title="Show sidebar" onClick={() => setSidebarOpen(true)}><PanelLeftOpen size={18}/></button>}
      <section className="conversation-pane glass-panel">
        <header className="conversation-header"><div className="header-person"><div className="header-avatar"><Users size={18}/></div><div><h2>{current?.title || "Your messages"}</h2><p><span className="status-light"/> {current ? "Conversation space" : "A little room for good conversations"}</p></div></div><div className="header-tools"><span className="live-pill"><i/> LIVE SYNC</span><button className="glass-icon" title="Refresh conversations" onClick={() => void loadConversations()}><RefreshCw size={16}/></button><button className="glass-icon" title="Preferences" onClick={() => setModal("settings")}><Settings size={16}/></button></div></header>
        <div className="message-canvas">
          {active ? messages.length ? messages.map(message => {
            const mine = message.sender_id === session.user.id;
            return <div key={message.id} className={"message-line" + (mine ? " mine" : "")}><div className="message-content"><div className="message-bubble">{message.body}</div><div className="message-meta">{mine ? <><span>You</span><Check size={12}/></> : <span>{current?.title || "Message"}</span>}<time>{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div></div></div>;
          }) : <div className="empty-conversation"><div className="empty-art"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-core"><MessageCircle size={27}/></div><span className="art-spark spark-one"/><span className="art-spark spark-two"/></div><div className="eyebrow">A SPACE OF YOUR OWN</div><h3>Every good conversation<br/><span>starts somewhere.</span></h3><p>Send the first message and let it unfold.</p></div> : <div className="empty-conversation"><div className="empty-art"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-core"><Sparkles size={27}/></div><span className="art-spark spark-one"/><span className="art-spark spark-two"/></div><div className="eyebrow">YOUR PEOPLE, YOUR PLACE</div><h3>Make room for<br/><span>the good stuff.</span></h3><p>Choose a conversation or create a new one.</p><button className="empty-create" onClick={() => setModal("new")}><Plus size={15}/> New conversation</button></div>}
          <div ref={endRef}/>
        </div>
        <form className="composer-area" onSubmit={sendMessage}><div className="composer-glass"><textarea rows={1} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={active ? "iMessage…" : "Choose a conversation first"} disabled={!active || sending}/><button className="send-button" type="submit" disabled={!active || !draft.trim() || sending} title="Send message"><Send size={17}/></button></div><div className="composer-caption"><span>Messages are synced in real time</span><span><kbd>ENTER</kbd> TO SEND <i>·</i> <kbd>SHIFT + ENTER</kbd> NEW LINE</span></div>{notice && <p className="notice inline">{notice}</p>}</form>
      </section>
      {modal && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}><section className="modal-card glass-panel">
        <button className="modal-close glass-icon" onClick={() => setModal(null)} title="Close"><X size={17}/></button>
        {modal === "new" ? <><div className="modal-icon"><UserRoundPlus size={20}/></div><div className="eyebrow">FIND YOUR PEOPLE</div><h2>New message</h2><p className="modal-description">Enter someone's exact email address to find their GitMessage account and start a private chat.</p><form onSubmit={searchContacts}><label htmlFor="contact-email">Email address</label><div className="contact-search-input"><Mail size={16}/><input id="contact-email" autoFocus type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="friend@example.com"/></div><button className="primary-button" type="submit" disabled={contactLoading || !contactEmail.trim()}>{contactLoading ? "Searching…" : "Find account"}<Search size={17}/></button></form>{contactResults.map(user => <div className="contact-result" key={user.user_id}><div className="contact-result-avatar">{user.email.slice(0,1).toUpperCase()}</div><div className="contact-result-copy"><b>{user.email.split("@")[0]}</b><small>{user.email}</small></div><button className="contact-start-button" disabled={busy} onClick={() => void startDirectConversation(user)}>{busy ? "Opening…" : "Message"}<ArrowUpRight size={14}/></button></div>)}{notice && <p className="notice">{notice}</p>}</> : <><div className="modal-icon"><Settings size={20}/></div><div className="eyebrow">YOUR GITMESSAGE</div><h2>Preferences</h2><p className="modal-description">A few details about your space.</p><div className="settings-account"><div className="account-avatar large">{(session.user.email || "G").slice(0,1).toUpperCase()}</div><div><b>{session.user.email}</b><small>Signed in account</small></div></div><button className="preference-row" onClick={() => setLightMode(value => !value)}><span className="preference-icon">{lightMode ? <Sun size={17}/> : <Moon size={17}/>}</span><span><b>Appearance</b><small>{lightMode ? "Light glass" : "Midnight glass"}</small></span><span className="preference-action">{lightMode ? "Light" : "Dark"}</span></button><button className="preference-row signout-row" onClick={() => void signOut()}><span className="preference-icon"><LogOut size={17}/></span><span><b>Sign out</b><small>Sign out of this device</small></span><span className="preference-action">›</span></button></>}
      </section></div>}
    </main>
  );
}