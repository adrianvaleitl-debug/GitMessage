import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import { Search, Plus, Send, Paperclip, Settings, MessageCircle, Users, ShieldCheck, LogOut, Sparkles, Command, Phone, Video } from "lucide-react";

type Conversation = { id: string; title: string | null; updated_at?: string };
type Message = { id: string; body: string; sender_id: string; created_at: string };
export default function App() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin"|"signup">("signin");
  const [notice, setNotice] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({data}) => setSession(data.session));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session || !supabase) { setConversations([]); setActive(""); return; }
    let alive = true;
    supabase.from("conversations").select("id,title,updated_at").order("updated_at",{ascending:false})
      .then(({data,error}) => { if (!alive) return; if (error) setNotice(error.message); else { const rows=(data||[]) as Conversation[]; setConversations(rows); if(rows[0]) setActive(v=>v||rows[0].id); }});
    return () => { alive = false; };
  }, [session]);
  useEffect(() => {
    if (!active || !supabase) { setMessages([]); return; }
    let alive = true;
    const load = async () => { const {data,error}=await supabase!.from("messages").select("id,body,sender_id,created_at").eq("conversation_id",active).order("created_at",{ascending:true}).limit(200); if(alive){ if(error)setNotice(error.message); else setMessages((data||[]) as Message[]); }};
    void load();
    const channel=supabase.channel("messages-"+active).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`conversation_id=eq.${active}`},payload=>setMessages(v=>[...v,payload.new as Message])).subscribe();
    return ()=>{alive=false; void supabase!.removeChannel(channel);};
  },[active]);
  const filtered=useMemo(()=>conversations.filter(c=>(c.title||"Conversation").toLowerCase().includes(query.toLowerCase())),[conversations,query]);
  async function authenticate() {
    if(!supabase){setNotice("Add your Supabase URL and publishable key to .env.local first.");return;}
    setLoading(true); setNotice("");
    const result=mode==="signin" ? await supabase.auth.signInWithPassword({email,password}) : await supabase.auth.signUp({email,password});
    setLoading(false); setNotice(result.error?.message || (mode==="signup" ? "Account created. Check your email if confirmation is enabled." : ""));
  }
  async function sendMessage() {
    if(!supabase || !active || !session || !draft.trim()) return;
    const body=draft.trim(); setDraft("");
    const {error}=await supabase.from("messages").insert({conversation_id:active,sender_id:session.user.id,body});
    if(error){setNotice(error.message);setDraft(body);}
  }
  if(!session) return <main className="auth-shell"><div className="orb orb-a"/><div className="orb orb-b"/><section className="auth-card"><div className="brand-mark"><MessageCircle size={25}/></div><div className="eyebrow"><Sparkles size={13}/> YOUR SPACE, RECONNECTED</div><h1>Messages,<br/><span>without the noise.</span></h1><p className="muted">A quieter place for your conversations.</p><div className="auth-form"><label>Email address</label><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@example.com"/><label>Password</label><input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="At least 6 characters" onKeyDown={e=>e.key==="Enter"&&void authenticate()}/><button className="primary" disabled={loading} onClick={()=>void authenticate()}>{loading?"Please wait…":mode==="signin"?"Sign in":"Create account"}</button><button className="text-button" onClick={()=>setMode(mode==="signin"?"signup":"signin")}>{mode==="signin"?"New to GitMessage? Create an account":"Already registered? Sign in"}</button>{notice&&<p className="notice">{notice}</p>}</div><div className="secure-note"><ShieldCheck size={15}/> Secured with Supabase authentication</div></section></main>;
  const current=conversations.find(c=>c.id===active);
  return <main className="app-shell"><aside className="sidebar"><div className="sidebar-top"><div className="mini-brand"><div className="brand-mark small"><MessageCircle size={18}/></div><span>GitMessage</span></div><button className="icon-btn"><Plus size={18}/></button></div><div className="profile"><div className="avatar">{(session.user.email||"G").slice(0,1).toUpperCase()}</div><div className="profile-copy"><b>{session.user.email?.split("@")[0]}</b><small>Available</small></div><button className="icon-btn" onClick={()=>void supabase?.auth.signOut()} title="Sign out"><LogOut size={16}/></button></div><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search messages"/><kbd>⌘ K</kbd></div><div className="section-label">MESSAGES <span>{filtered.length}</span></div><div className="conversation-list">{filtered.map(c=><button key={c.id} className={"conversation "+(active===c.id?"selected":"")} onClick={()=>setActive(c.id)}><div className="conversation-avatar"><Users size={17}/></div><div className="conversation-copy"><b>{c.title||"Conversation"}</b><small>Open conversation</small></div><span className="presence"/></button>)}{filtered.length===0&&<p className="empty">{conversations.length?"No matches":"No conversations yet"}</p>}</div><div className="sidebar-bottom"><div className="plan-card"><div className="plan-icon"><Sparkles size={16}/></div><div><b>Your space</b><small>Private conversations</small></div></div><button className="nav-item"><Settings size={17}/> Settings</button><div className="version">GITMESSAGE 3.0.0 <span>•</span> DESKTOP</div></div></aside><section className="chat-area"><header className="chat-header"><div className="chat-heading"><div className="conversation-avatar large"><Users size={19}/></div><div><h2>{current?.title||"Select a conversation"}</h2><p><span className="online-dot"/> Your messages, in sync</p></div></div><div className="header-actions"><button className="icon-btn"><Phone size={17}/></button><button className="icon-btn"><Video size={18}/></button><div className="divider"/><button className="icon-btn"><Settings size={17}/></button></div></header><div className="message-stage">{active?messages.length?messages.map(m=><div key={m.id} className={"message-row "+(m.sender_id===session.user.id?"mine":"")}><div className="message-bubble">{m.body}<time>{new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</time></div></div>):<div className="welcome"><div className="welcome-icon"><MessageCircle size={28}/></div><h3>It starts with a message.</h3><p>Your conversation is ready when you are.</p></div>:<div className="welcome"><div className="welcome-icon"><Command size={28}/></div><h3>Your conversations live here.</h3><p>Choose a conversation from the sidebar.</p></div>}</div><footer className="composer-wrap"><div className="composer"><button className="icon-btn"><Paperclip size={18}/></button><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),void sendMessage())} placeholder={active?"Write a message…":"Select a conversation to start"} disabled={!active}/><button className="send-btn" onClick={()=>void sendMessage()} disabled={!active||!draft.trim()}><Send size={17}/></button></div><div className="composer-hint">Press <kbd>Enter</kbd> to send <span>•</span> Messages sync in real time</div>{notice&&<p className="notice inline">{notice}</p>}</footer></section></main>;
}