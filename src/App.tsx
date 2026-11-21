import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent, ReactNode } from "react";
import { supabase } from "./lib/supabase";
import {
  MessageCircle, Search, Plus, ArrowUp, ArrowLeft, Settings, Users, UserRound, LogOut, Sparkles,
  ShieldCheck, X, Moon, Sun, MoreHorizontal, ArrowUpRight, Check,
  RefreshCw, UserRoundPlus, Paperclip, Pencil, Trash2, Mic, MicOff, Phone, Video, PhoneOff
} from "lucide-react";

type Conversation = { id: string; title: string | null; updated_at?: string; is_group?: boolean; avatar_path?: string | null };
type Message = { id: string; body: string; sender_id: string; created_at: string; edited_at?: string | null; deleted_at?: string | null };
type AttachmentPreview = { file_name: string; mime_type: string; size_bytes: number; url: string };
type ContactMatch = { user_id: string; email: string; username?: string; display_name?: string; avatar_path?: string | null };

function renderBioWithLinks(bio: string) {
  const urlPattern = /(?:https?:\/\/|www\.)[^\s<]+/gi;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = urlPattern.exec(bio)) !== null) {
    let rawUrl = match[0];
    let url = rawUrl;
    while (/[.,!?;:)]$/.test(url)) url = url.slice(0, -1);
    if (!url) continue;
    if (match.index > lastIndex) parts.push(bio.slice(lastIndex, match.index));
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    parts.push(<a key={match.index} href={href} target="_blank" rel="noopener noreferrer">{url}</a>);
    parts.push(rawUrl.slice(url.length));
    lastIndex = match.index + rawUrl.length;
  }
  if (lastIndex < bio.length) parts.push(bio.slice(lastIndex));
  return parts;
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageProfiles, setMessageProfiles] = useState<Record<string, {display_name?:string;username?:string;avatar_path?:string|null}>>({});
  const [attachmentPreviews, setAttachmentPreviews] = useState<Record<string, AttachmentPreview>>({});
  const [imageViewerUrl, setImageViewerUrl] = useState("");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<"new" | "group" | "profile" | "public-profile" | "friends" | "settings" | "group-admin" | "servers" | "server-chat" | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [contactResults, setContactResults] = useState<ContactMatch[]>([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMembers, setGroupMembers] = useState<ContactMatch[]>([]);
  const [profileUsername, setProfileUsername] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profilePalette, setProfilePalette] = useState("graphite");
  const [profileBadge, setProfileBadge] = useState("");
  const [profileFrame, setProfileFrame] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [profileBanner, setProfileBanner] = useState("");
  const [publicProfile, setPublicProfile] = useState<any>(null);
  const [publicProfileAvatar, setPublicProfileAvatar] = useState("");
  const [publicProfileBanner, setPublicProfileBanner] = useState("");
  const [friendRequests, setFriendRequests] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [groupAdminMembers, setGroupAdminMembers] = useState<any[]>([]);
  const [profileContextMenu, setProfileContextMenu] = useState<{x:number;y:number;userId:string;username:string;messageBody?:string;isOwn?:boolean} | null>(null);
  const [serverRows, setServerRows] = useState<any[]>([]);
  const [serverName, setServerName] = useState("");
  const [serverDescription, setServerDescription] = useState("");
  const [serverJoinCode, setServerJoinCode] = useState("");
  const [activeServer, setActiveServer] = useState<any>(null);
  const [serverChannels, setServerChannels] = useState<any[]>([]);
  const [serverChannelName, setServerChannelName] = useState("");
  const [activeServerChannel, setActiveServerChannel] = useState("");
  const [serverMessages, setServerMessages] = useState<any[]>([]);
  const [serverDraft, setServerDraft] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [desktopAlerts, setDesktopAlerts] = useState(typeof Notification !== "undefined" && Notification.permission === "granted");
  const [sending, setSending] = useState(false);
  const [reactions, setReactions] = useState<Record<string, {emoji:string;user_id:string}[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [someoneTyping, setSomeoneTyping] = useState(false);

  const [lightMode, setLightMode] = useState(() => { try { return localStorage.getItem("gitmessage-theme") !== "dark"; } catch { return true; } });
  const mobileSwipeStart = useRef<{x:number;y:number}|null>(null);
  const lastMobileConversation = useRef("");
  useEffect(()=>{const forceMobileDark=()=>{if(window.matchMedia("(max-width: 760px)").matches)setLightMode(false)};forceMobileDark();window.addEventListener("resize",forceMobileDark);return()=>window.removeEventListener("resize",forceMobileDark)},[]);
  useEffect(()=>{if(active)lastMobileConversation.current=active;},[active]);
  const handleMobileSwipeEnd=(event:React.TouchEvent<HTMLElement>)=>{const start=mobileSwipeStart.current;mobileSwipeStart.current=null;if(!start)return;const dx=event.changedTouches[0].clientX-start.x;const dy=event.changedTouches[0].clientY-start.y;if(Math.abs(dx)<65||Math.abs(dx)<Math.abs(dy)*1.35||!window.matchMedia("(max-width: 760px)").matches)return;if(dx>0&&active){lastMobileConversation.current=active;setActive("");}else if(dx<0&&!active){const restore=lastMobileConversation.current||conversations[0]?.id;if(restore)setActive(restore);}};

  useEffect(() => { try { localStorage.setItem("gitmessage-theme", lightMode ? "light" : "dark"); } catch { /* Storage may be unavailable. */ } }, [lightMode]);
  const [accentChoice, setAccentChoice] = useState(() => { try { return localStorage.getItem("gitmessage-accent") || "blue"; } catch { return "blue"; } });
  const [density, setDensity] = useState(() => { try { return localStorage.getItem("gitmessage-density") || "comfortable"; } catch { return "comfortable"; } });
  const [messageSize, setMessageSize] = useState(() => { try { return localStorage.getItem("gitmessage-message-size") || "medium"; } catch { return "medium"; } });
  const [animations, setAnimations] = useState(() => { try { return localStorage.getItem("gitmessage-animations") !== "off"; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem("gitmessage-accent",accentChoice); localStorage.setItem("gitmessage-density",density); localStorage.setItem("gitmessage-message-size",messageSize); localStorage.setItem("gitmessage-animations",animations?"on":"off"); } catch { /* Storage may be unavailable. */ } },[accentChoice,density,messageSize,animations]);
  const [profileCardStyle,setProfileCardStyle]=useState(()=>{try{return localStorage.getItem("gitmessage-profile-card-style")||"glass"}catch{return "glass"}});
  const [profileAvatarRing,setProfileAvatarRing]=useState(()=>{try{return localStorage.getItem("gitmessage-profile-avatar-ring")||"accent"}catch{return "accent"}});
  const [profileShowBio,setProfileShowBio]=useState(()=>{try{return localStorage.getItem("gitmessage-profile-show-bio")!=="off"}catch{return true}});
  const [profileShowUsername,setProfileShowUsername]=useState(()=>{try{return localStorage.getItem("gitmessage-profile-show-username")!=="off"}catch{return true}});
  const [profilePreviewOpen,setProfilePreviewOpen]=useState(false);

  const messageCanvasRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const callRecipientRef = useRef<string>("");
  const [callState, setCallState] = useState<"idle" | "calling" | "incoming" | "connected">("idle");
  const [pendingCall, setPendingCall] = useState<any>(null);
  const [callKind, setCallKind] = useState<"audio" | "video">("audio");

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

  async function loadServers() {
    if (!supabase || !session) return;
    const { data, error } = await supabase.rpc("get_my_gitmessage_servers");
    if (error) { setNotice(error.message); return; }
    setServerRows(data || []);
  }
  async function openServers() {
    setModal("servers");
    await loadServers();
  }
  async function createServer(event?:FormEvent) {
    event?.preventDefault();
    if (!supabase || !serverName.trim()) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("create_gitmessage_server",{server_name:serverName.trim(),server_description:serverDescription.trim()});
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    setServerName(""); setServerDescription("");
    await loadServers();
    setNotice("Server created. Share its invite code from the server list.");
  }
  async function joinServer(event?:FormEvent) {
    event?.preventDefault();
    if (!supabase || !serverJoinCode.trim()) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("join_gitmessage_server",{server_invite_code:serverJoinCode.trim()});
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    setServerJoinCode("");
    await loadServers();
    setNotice("Joined server.");
  }
  async function openServerChat(server:any) {
    if (!supabase) return;
    setBusy(true); setNotice("");
    const { data: channels, error } = await supabase.from("gitmessage_server_channels").select("id,name").eq("server_id",server.server_id).order("created_at",{ascending:true});
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    if (!channels?.length) { setNotice("This server has no channels yet."); return; }
    setActiveServer(server);
    setServerChannels(channels);
    setActiveServerChannel(channels[0].id);
    const { data: messages, error: messageError } = await supabase.from("gitmessage_server_messages").select("id,body,sender_id,created_at").eq("server_id",server.server_id).eq("channel_id",channels[0].id).order("created_at",{ascending:true}).limit(300);
    if (messageError) { setNotice(messageError.message); return; }
    setServerMessages(messages || []);
    setServerDraft("");
    setModal("server-chat");
  }
  async function selectServerChannel(channel:any) {
    if (!supabase || !activeServer) return;
    setActiveServerChannel(channel.id);
    const { data, error } = await supabase.from("gitmessage_server_messages").select("id,body,sender_id,created_at").eq("server_id",activeServer.server_id).eq("channel_id",channel.id).order("created_at",{ascending:true}).limit(300);
    if (error) { setNotice(error.message); return; }
    setServerMessages(data || []);
  }
  async function createServerChannel(event?:FormEvent) {
    event?.preventDefault();
    if (!supabase || !activeServer || !serverChannelName.trim()) return;
    const name=serverChannelName.trim().toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").slice(0,48);
    if (!name) { setNotice("Enter a valid channel name."); return; }
    const { data, error } = await supabase.from("gitmessage_server_channels").insert({server_id:activeServer.server_id,name}).select("id,name").single();
    if (error) { setNotice(error.message); return; }
    setServerChannels(rows=>[...rows,data]);
    setServerChannelName("");
    await selectServerChannel(data);
  }
  async function sendServerMessage(event?:FormEvent) {
    event?.preventDefault();
    if (!supabase || !session || !activeServer || !activeServerChannel || !serverDraft.trim()) return;
    const body=serverDraft.trim();
    const { data,error } = await supabase.from("gitmessage_server_messages").insert({
      channel_id:activeServerChannel,server_id:activeServer.server_id,sender_id:session.user.id,body
    }).select("id,body,sender_id,created_at").single();
    if (error) { setNotice(error.message); return; }
    setServerMessages(rows => [...rows,data]);
    setServerDraft("");
  }

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
    if (!session || !supabase) { setProfileAvatar(""); return; }
    let alive = true;
    supabase.rpc("get_my_gitmessage_profile").then(({ data, error }) => {
      if (!alive || error) return;
      const profile = Array.isArray(data) ? data[0] : data;
      setProfileUsername(profile?.username || "");
      setProfileDisplayName(profile?.display_name || "");
      setProfileBio(profile?.bio || "");
      setProfilePalette(profile?.profile_palette || "graphite");
      setProfileBadge(profile?.profile_badge || "");
      setProfileFrame(profile?.profile_frame || "");
      setProfileAvatar(profile?.avatar_path ? supabase!.storage.from("gitmessage-avatars").getPublicUrl(profile.avatar_path).data.publicUrl : "");
      setProfileCardStyle(profile?.profile_card_style || "glass");
      setProfileAvatarRing(profile?.profile_avatar_ring || "accent");
      setProfileShowBio(profile?.profile_show_bio ?? true);
      setProfileShowUsername(profile?.profile_show_username ?? true);
    });
    return () => { alive = false; };
  }, [session]);
  useEffect(() => {
    if (!session || !supabase) {
      setConversations([]);
      setMessages([]);
      setActive("");
      return;
    }
    void loadConversations();
    void loadServers();
  }, [session]);

  useEffect(() => {
    if (!supabase || !active || !session) { setMessageProfiles({}); return; }
    let alive = true;
    void supabase.from("conversation_members").select("user_id").eq("conversation_id",active).then(async ({data,error}) => {
      if (!alive || error || !data?.length) return;
      const ids = data.map(row => row.user_id);
      const { data: profiles } = await supabase!.from("profiles").select("id,display_name,username,avatar_path").in("id",ids);
      if (!alive) return;
      const next: Record<string,{display_name?:string;username?:string;avatar_path?:string|null}> = {};
      (profiles || []).forEach((profile:any) => { next[profile.id] = profile; });
      setMessageProfiles(next);
    });
    return () => { alive = false; };
  }, [active, session]);

  useEffect(() => {
    if (!active || !supabase || !session?.user?.id) { setMessages([]); return; }
    let alive = true;
    const refreshMessages = async () => {
      const { data, error } = await supabase!.from("messages")
        .select("id,body,sender_id,created_at,edited_at,deleted_at")
        .eq("conversation_id", active)
        .order("created_at", { ascending: true })
        .limit(300);
      if (!alive) return;
      if (error) {
        console.error("GitMessage message refresh failed:", error.message);
        return;
      }
      const next = (data || []) as Message[];
      setMessages(current => {
        if (current.length === next.length && current.every((message, index) =>
          message.id === next[index].id &&
          message.body === next[index].body &&
          message.edited_at === next[index].edited_at &&
          message.deleted_at === next[index].deleted_at
        )) return current;
        return next;
      });
    };

    void refreshMessages();
    // Realtime is the fast path; periodic reconciliation also covers projects
    // where the messages table has not been added to Supabase's realtime publication.
    const channel = supabase.channel("gitmessage-messages-" + active)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: "conversation_id=eq." + active },
        payload => {
          if (!alive) return;
          if (payload.eventType === "INSERT") {
            const incoming = payload.new as Message;
            if (incoming.sender_id !== session.user.id && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification("New GitMessage", { body: incoming.body });
            }
            setMessages(current => current.some(message => message.id === incoming.id) ? current : [...current, incoming].sort((a, b) => a.created_at.localeCompare(b.created_at)));
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Message;
            setMessages(current => current.map(message => message.id === updated.id ? { ...message, ...updated } : message));
          } else if (payload.eventType === "DELETE") {
            const removed = payload.old as Partial<Message>;
            if (removed.id) setMessages(current => current.filter(message => message.id !== removed.id));
          }
          // Reconcile against the database shortly after every realtime event.
          void refreshMessages();
        })
      .subscribe(status => {
        if (status === "SUBSCRIBED") void refreshMessages();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn("GitMessage realtime channel status:", status);
        }
      });

    const poll = window.setInterval(() => void refreshMessages(), 4000);
    const onVisible = () => { if (!document.hidden) void refreshMessages(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase!.removeChannel(channel);
    };
  }, [active, session?.user?.id]);

  useEffect(() => {
    if (!supabase || !session || !activeServerChannel) { setServerMessages([]); return; }
    let alive=true;
    const refresh=async()=>{
      const {data,error}=await supabase!.from("gitmessage_server_messages")
        .select("id,body,sender_id,created_at").eq("channel_id",activeServerChannel)
        .order("created_at",{ascending:true}).limit(300);
      if (!alive || error) return;
      setServerMessages(data || []);
    };
    void refresh();
    const poll=window.setInterval(()=>void refresh(),4000);
    const channel=supabase.channel("gitmessage-server-"+activeServerChannel)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"gitmessage_server_messages",filter:"channel_id=eq."+activeServerChannel},()=>void refresh())
      .subscribe();
    return()=>{alive=false;window.clearInterval(poll);void supabase!.removeChannel(channel);};
  },[activeServerChannel,session]);

  useEffect(() => {
    if (!supabase || !active || !session) { setSomeoneTyping(false); return; }
    const refreshTyping = async () => {
      const { data } = await supabase!.from("gitmessage_typing").select("user_id,updated_at").eq("conversation_id", active).neq("user_id", session.user.id);
      setSomeoneTyping((data || []).some(row => Date.now() - new Date(row.updated_at).getTime() < 5000));
    };
    void refreshTyping();
    const channel = supabase.channel("gitmessage-typing-" + active)
      .on("postgres_changes", { event: "*", schema: "public", table: "gitmessage_typing", filter: "conversation_id=eq." + active }, () => void refreshTyping())
      .subscribe();
    return () => { void supabase!.removeChannel(channel); };
  }, [active, session]);

  async function updateDraft(value: string) {
    setDraft(value);
    if (!supabase || !active || !session) return;
    if (value.trim()) {
      const { error } = await supabase.from("gitmessage_typing").upsert({ conversation_id: active, user_id: session.user.id, updated_at: new Date().toISOString() });
      if (error) setNotice(error.message);
    } else {
      await supabase.from("gitmessage_typing").delete().eq("conversation_id", active).eq("user_id", session.user.id);
    }
  }

  useEffect(() => {
    const canvas = messageCanvasRef.current;
    if (!canvas) return;
    const frame = requestAnimationFrame(() => {
      canvas.scrollTop = canvas.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, active, attachmentPreviews]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape") { setModal(null); setImageViewerUrl(""); }
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
    if (authMode === "signup" && password.length < 8) { setNotice("Use at least 8 characters for a stronger password."); return; }
    const cleanUsername = signupUsername.trim().toLowerCase();
    if (authMode === "signup" && !/^[a-z0-9_]{3,24}$/.test(cleanUsername)) { setNotice("Username must be 3–24 characters using lowercase letters, numbers or underscores."); return; }
    setBusy(true); setNotice("");
    const result = authMode === "signin"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username: cleanUsername, display_name: cleanUsername } } });
    setBusy(false);
    if (result.error) setNotice(result.error.message);
    else if (authMode === "signup" && !result.data.session) setNotice("Account created. Check your email to confirm it, then sign in.");
  }

  async function searchContacts(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !contactEmail.trim()) return;
    setContactLoading(true); setNotice(""); setContactResults([]);
    const { data, error } = await supabase.rpc("search_gitmessage_users", {
      search_query: contactEmail.trim().replace(/^@/, "")
    });
    setContactLoading(false);
    if (error) { setNotice(error.message); return; }
    setContactResults((data || []) as ContactMatch[]);
    if (!data?.length) setNotice("No GitMessage account found. Check the username or email.");
  }

  async function createGroupConversation() {
    if (!supabase || !groupTitle.trim() || groupMembers.length === 0) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("create_group_conversation", { group_title: groupTitle.trim(), member_ids: groupMembers.map(user => user.user_id) });
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    await loadConversations(); setActive(data as string); setModal(null); setGroupTitle(""); setGroupMembers([]); setContactEmail(""); setContactResults([]);
  }

  async function blockPublicProfile() {
    if (!supabase || !session || !publicProfile?.user_id) return;
    if (!window.confirm("Block this user? They will no longer be able to message you.")) return;
    const { error } = await supabase.from("gitmessage_blocks").insert({ blocker_id: session.user.id, blocked_id: publicProfile.user_id });
    if (error && !error.message.toLowerCase().includes("duplicate")) { setNotice(error.message); return; }
    setNotice("User blocked.");
  }

  async function reportPublicProfile() {
    if (!supabase || !session || !publicProfile?.user_id) return;
    const reason = window.prompt("Why are you reporting this user? (At least 5 characters)");
    if (!reason || reason.trim().length < 5) return;
    const { error } = await supabase.from("gitmessage_reports").insert({ reporter_id: session.user.id, reported_user_id: publicProfile.user_id, reason: reason.trim() });
    setNotice(error ? error.message : "Report submitted.");
  }

  function showProfileContextMenu(event: MouseEvent, userId: string, username: string, messageBody?: string, isOwn = false) {
    event.preventDefault();
    event.stopPropagation();
    setProfileContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - (messageBody ? 210 : 150))),
      userId, username, messageBody, isOwn
    });
  }

  async function openUsernameProfile(username: string) {
    if (!supabase) return;
    const clean=username.replace(/^@/,"").trim().toLowerCase();
    if (!clean) return;
    const {data,error}=await supabase.rpc("search_gitmessage_users",{search_query:clean});
    if (error) { setNotice(error.message); return; }
    const match=(data || []).find((user:any)=>(user.username || "").toLowerCase()===clean);
    if (match?.user_id) await openPublicProfile(match.user_id);
    else setNotice("No profile found for @"+clean+".");
  }

  function renderMessageText(value: string) {
    const pattern=/(https?:\/\/[^\s<]+|www\.[^\s<]+|@[a-zA-Z0-9_]{3,24})/g;
    return value.split(pattern).filter(Boolean).map((part,index)=>{
      if (/^https?:\/\//i.test(part) || /^www\./i.test(part)) {
        const href=part.startsWith("www.") ? "https://"+part : part;
        return <a key={index} className="message-inline-link" href={href} target="_blank" rel="noopener noreferrer" onClick={event=>event.stopPropagation()}>{part}</a>;
      }
      if (/^@[a-zA-Z0-9_]{3,24}$/.test(part)) return <button key={index} type="button" className="message-mention-link" onClick={()=>void openUsernameProfile(part)}>{part}</button>;
      return part;
    });
  }

  async function openPublicProfile(userId: string) {
    if (!supabase || !userId) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("get_gitmessage_public_profile", { target_user_id: userId });
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    const profile = Array.isArray(data) ? data[0] : data;
    if (!profile) { setNotice("Profile unavailable."); return; }
    setPublicProfile(profile);
    setPublicProfileAvatar(profile.avatar_path ? supabase.storage.from("gitmessage-avatars").getPublicUrl(profile.avatar_path).data.publicUrl : "");
    setPublicProfileBanner(profile.banner_path ? supabase.storage.from("gitmessage-avatars").getPublicUrl(profile.banner_path).data.publicUrl : "");
    setModal("public-profile");
  }

  async function openConversationProfile() {
    if (!supabase || !active || current?.is_group) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("get_gitmessage_conversation_profile", { target_conversation_id: active });
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    const profile = Array.isArray(data) ? data[0] : data;
    if (!profile) { setNotice("Profile unavailable."); return; }
    setPublicProfile(profile);
    setPublicProfileAvatar(profile.avatar_path ? supabase.storage.from("gitmessage-avatars").getPublicUrl(profile.avatar_path).data.publicUrl : "");
    setPublicProfileBanner(profile.banner_path ? supabase.storage.from("gitmessage-avatars").getPublicUrl(profile.banner_path).data.publicUrl : "");
    setModal("public-profile");
  }

  async function loadProfile() {
    if (!supabase || !session) return;
    setModal("profile"); setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("get_my_gitmessage_profile");
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    const profile = Array.isArray(data) ? data[0] : data;
    setProfileUsername(profile?.username || "");
    setProfileDisplayName(profile?.display_name || "");
    setProfileBio(profile?.bio || "");
    setProfilePalette(profile?.profile_palette || "graphite");
    setProfileBadge(profile?.profile_badge || "");
    setProfileFrame(profile?.profile_frame || "");
    setProfileAvatar(profile?.avatar_path ? supabase.storage.from("gitmessage-avatars").getPublicUrl(profile.avatar_path).data.publicUrl : "");
    setProfileBanner(profile?.banner_path ? supabase.storage.from("gitmessage-avatars").getPublicUrl(profile.banner_path).data.publicUrl : "");
    setProfileCardStyle(profile?.profile_card_style || "glass");
    setProfileAvatarRing(profile?.profile_avatar_ring || "accent");
    setProfileShowBio(profile?.profile_show_bio ?? true);
    setProfileShowUsername(profile?.profile_show_username ?? true);
  }

  async function sendFriendRequest(user: ContactMatch) {
    if (!supabase) return;
    const { error } = await supabase.rpc("send_gitmessage_friend_request", { target_user_id: user.user_id });
    setNotice(error ? error.message : "Friend request sent.");
  }

  async function openGroupAdmin() {
    if (!supabase || !active || !current?.is_group) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.from("conversation_members").select("user_id,member_role,member_permissions").eq("conversation_id",active);
    if (error) { setBusy(false); setNotice(error.message); return; }
    const ids = (data || []).map(row => row.user_id);
    const { data: profiles } = await supabase.from("profiles").select("id,username,display_name").in("id",ids);
    setGroupAdminMembers((data || []).map(member => ({...member,profile:(profiles || []).find(profile => profile.id===member.user_id)})));
    setBusy(false); setModal("group-admin");
  }
  async function renameCurrentGroup() {
    if (!supabase || !active || !current) return;
    const title = window.prompt("New group name",current.title || "");
    if (!title?.trim()) return;
    const { error } = await supabase.rpc("update_gitmessage_group",{target_conversation_id:active,new_title:title.trim(),new_avatar_path:null});
    if (error) { setNotice(error.message); return; }
    setConversations(rows => rows.map(row => row.id===active ? {...row,title:title.trim()} : row));
    setNotice("Group name updated.");
  }
  async function uploadGroupAvatar(file?:File) {
    if (!supabase || !session || !active || !current || !file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size>5*1024*1024) { setNotice("Choose a JPG, PNG or WebP image under 5 MB."); return; }
    const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
    const path=active+"/"+crypto.randomUUID()+"."+ext;
    const uploaded=await supabase.storage.from("gitmessage-group-avatars").upload(path,file,{contentType:file.type,upsert:false});
    if (uploaded.error) { setNotice(uploaded.error.message); return; }
    const {error}=await supabase.rpc("update_gitmessage_group",{target_conversation_id:active,new_title:current.title || "Group",new_avatar_path:path});
    if (error) { setNotice(error.message); return; }
    setConversations(rows=>rows.map(row=>row.id===active?{...row,avatar_path:path}:row));
    setNotice("Group picture updated.");
  }
  async function changeGroupMember(userId:string, permissions:any, role:string) {
    if (!supabase || !active) return;
    const { error } = await supabase.rpc("set_gitmessage_group_member_permissions",{target_conversation_id:active,target_user_id:userId,new_permissions:permissions,new_role:role});
    if (error) { setNotice(error.message); return; }
    setGroupAdminMembers(rows => rows.map(row => row.user_id===userId ? {...row,member_role:role,member_permissions:permissions} : row));
  }
  async function kickGroupMember(userId:string) {
    if (!supabase || !active || !window.confirm("Remove this member from the group?")) return;
    const { error } = await supabase.rpc("kick_gitmessage_group_member",{target_conversation_id:active,target_user_id:userId});
    if (error) { setNotice(error.message); return; }
    setGroupAdminMembers(rows => rows.filter(row => row.user_id!==userId));
  }

  async function loadFriendRequests() {
    if (!supabase || !session) return;
    setModal("friends");
    const [requests, friendRows] = await Promise.all([
      supabase.from("friend_requests").select("id,sender_id,created_at").eq("recipient_id", session.user.id).eq("status","pending").order("created_at",{ascending:false}),
      supabase.rpc("get_my_gitmessage_friends")
    ]);
    if (requests.error) setNotice(requests.error.message); else setFriendRequests(requests.data || []);
    if (friendRows.error) setNotice(friendRows.error.message); else setFriends(friendRows.data || []);
  }

  async function unfriend(userId: string) {
    if (!supabase || !window.confirm("Unfriend this person? Your existing conversation will remain in your inbox.")) return;
    const { error } = await supabase.rpc("unfriend_gitmessage_user", { target_user_id: userId });
    if (error) { setNotice(error.message); return; }
    setFriends(rows => rows.filter(friend => friend.user_id !== userId));
    setNotice("Friend removed.");
  }

  async function removeConversation(conversation: Conversation) {
    if (!supabase || !window.confirm("Remove this conversation from your inbox? The other person's copy will remain.")) return;
    const { error } = await supabase.rpc("leave_gitmessage_conversation", { target_conversation_id: conversation.id });
    if (error) { setNotice(error.message); return; }
    setConversations(rows => rows.filter(row => row.id !== conversation.id));
    if (active === conversation.id) { setActive(""); setMessages([]); }
    setNotice("Conversation removed from your inbox.");
  }

  async function respondFriendRequest(id: string, accept: boolean) {
    if (!supabase) return;
    const { error } = await supabase.rpc("respond_gitmessage_friend_request", { request_id:id, accept_request:accept });
    if (error) setNotice(error.message); else setFriendRequests(rows => rows.filter(row => row.id !== id));
  }

  async function uploadAvatar(file?: File) {
    if (!supabase || !session || !file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 5*1024*1024) { setNotice("Choose a JPG, PNG or WebP image under 5 MB."); return; }
    setAvatarBusy(true);
    const path = session.user.id + "/" + crypto.randomUUID() + "." + (file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg");
    const uploaded = await supabase.storage.from("gitmessage-avatars").upload(path,file,{upsert:false,contentType:file.type});
    if (uploaded.error) { setNotice(uploaded.error.message); setAvatarBusy(false); return; }
    const updated = await supabase.from("profiles").update({avatar_path:path}).eq("id",session.user.id);
    setAvatarBusy(false);
    if (updated.error) { setNotice(updated.error.message); return; }
    setProfileAvatar(supabase.storage.from("gitmessage-avatars").getPublicUrl(path).data.publicUrl);
  }

  async function uploadProfileBanner(file?: File) {
    if (!supabase || !session || !file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 8*1024*1024) { setNotice("Choose a JPG, PNG or WebP banner under 8 MB."); return; }
    setAvatarBusy(true); setNotice("");
    const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
    const path=session.user.id+"/banners/"+crypto.randomUUID()+"."+ext;
    const uploaded=await supabase.storage.from("gitmessage-avatars").upload(path,file,{upsert:false,contentType:file.type});
    if(uploaded.error){setNotice(uploaded.error.message);setAvatarBusy(false);return;}
    const updated=await supabase.from("profiles").update({banner_path:path}).eq("id",session.user.id);
    setAvatarBusy(false);
    if(updated.error){setNotice(updated.error.message);return;}
    setProfileBanner(supabase.storage.from("gitmessage-avatars").getPublicUrl(path).data.publicUrl);
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("update_gitmessage_profile", { new_username: profileUsername, new_display_name: profileDisplayName, new_bio: profileBio, new_profile_palette: profilePalette, new_profile_card_style: profileCardStyle, new_profile_avatar_ring: profileAvatarRing, new_profile_show_bio: profileShowBio, new_profile_show_username: profileShowUsername });
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    setModal("settings");
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
      .select("id,body,sender_id,created_at,edited_at,deleted_at").single();
    setSending(false);
    if (error) { setNotice(error.message); return; }
    if (data) setMessages(rows => rows.some(m => m.id === data.id) ? rows : [...rows, data as Message]);
    setDraft("");
    setNotice("");
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!supabase || !session) return;
    const existing = (reactions[messageId] || []).find(r => r.emoji === emoji && r.user_id === session.user.id);
    const result = existing
      ? await supabase.from("gitmessage_reactions").delete().eq("message_id", messageId).eq("user_id", session.user.id).eq("emoji", emoji)
      : await supabase.from("gitmessage_reactions").insert({ message_id: messageId, user_id: session.user.id, emoji });
    if (result.error) { setNotice(result.error.message); return; }
    const { data } = await supabase.from("gitmessage_reactions").select("emoji,user_id").eq("message_id", messageId);
    setReactions(rows => ({ ...rows, [messageId]: (data || []) as {emoji:string;user_id:string}[] }));
  }

  async function editMessage(message: Message) {
    if (!supabase || message.sender_id !== session.user.id || message.deleted_at) return;
    const next = window.prompt("Edit message", message.body);
    if (next === null || !next.trim() || next.trim() === message.body) return;
    const { error } = await supabase.from("messages").update({ body: next.trim(), edited_at: new Date().toISOString() }).eq("id", message.id);
    if (error) { setNotice(error.message); return; }
    setMessages(rows => rows.map(row => row.id === message.id ? { ...row, body: next.trim(), edited_at: new Date().toISOString() } : row));
  }

  async function deleteMessage(message: Message) {
    if (!supabase || message.sender_id !== session.user.id) return;
    if (!window.confirm("Delete this message?")) return;
    const { error } = await supabase.from("messages").update({ body: "This message was deleted.", deleted_at: new Date().toISOString() }).eq("id", message.id);
    if (error) { setNotice(error.message); return; }
    setMessages(rows => rows.map(row => row.id === message.id ? { ...row, body: "This message was deleted.", deleted_at: new Date().toISOString() } : row));
  }

  useEffect(() => {
    if (!supabase || messages.length === 0) { setAttachmentPreviews({}); return; }
    let alive = true;
    const ids = messages.map(message => message.id);
    void supabase.from("gitmessage_attachments").select("message_id,file_name,mime_type,size_bytes,storage_path").in("message_id", ids).then(async ({data,error}) => {
      if (!alive || error || !data) return;
      const entries = await Promise.all(data.map(async (item: any) => {
        const { data: signed } = await supabase!.storage.from("gitmessage-attachments").createSignedUrl(item.storage_path, 3600);
        return signed?.signedUrl ? [item.message_id, { file_name:item.file_name, mime_type:item.mime_type, size_bytes:Number(item.size_bytes), url:signed.signedUrl }] as const : null;
      }));
      if (!alive) return;
      const next: Record<string, AttachmentPreview> = {};
      entries.forEach(entry => { if (entry) next[entry[0]] = entry[1]; });
      setAttachmentPreviews(next);
    });
    return () => { alive = false; };
  }, [messages, active]);

  async function openAttachment(messageId: string, previewImage = false) {
    if (!supabase) return;
    setNotice("");
    const { data, error } = await supabase.from("gitmessage_attachments").select("storage_path,file_name").eq("message_id", messageId).maybeSingle();
    if (error || !data) { setNotice(error?.message || "Attachment not found."); return; }
    const { data: signed, error: signedError } = await supabase.storage.from("gitmessage-attachments").createSignedUrl(data.storage_path, 3600);
    if (signedError || !signed) { setNotice(signedError?.message || "Could not open attachment."); return; }
    if (previewImage) setImageViewerUrl(signed.signedUrl);
    else window.open(signed.signedUrl, "_blank");
  }

  async function toggleVoiceRecording() {
    if (recording && recorderRef.current) { recorderRef.current.stop(); setRecording(false); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setNotice("Voice recording is not supported on this device."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder; recordingChunks.current = [];
      recorder.ondataavailable = event => { if (event.data.size) recordingChunks.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordingChunks.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], "Voice message.webm", { type: blob.type });
        stream.getTracks().forEach(track => track.stop());
        void uploadAttachment(file);
      };
      recorder.start(); setRecording(true);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Microphone permission was denied."); }
  }

  async function uploadAttachment(file?: File) {
    if (!supabase || !active || !session || !file) return;
    if (file.size > 25 * 1024 * 1024) { setNotice("Files must be 25 MB or smaller."); return; }
    setSending(true); setNotice("");
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const inferredMime: Record<string,string> = { mp4:"video/mp4", m4v:"video/mp4", mov:"video/quicktime", webm:file.type.startsWith("audio/")?"audio/webm":"video/webm", mp3:"audio/mpeg", m4a:"audio/mp4", wav:"audio/wav", ogg:"audio/ogg", oga:"audio/ogg", jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", gif:"image/gif", webp:"image/webp", pdf:"application/pdf", txt:"text/plain" };
    const contentType = inferredMime[ext] || file.type || "application/octet-stream";
    const path = active + "/" + session.user.id + "/" + crypto.randomUUID() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uploaded = await supabase.storage.from("gitmessage-attachments").upload(path, file, { contentType, upsert: false });
    if (uploaded.error) { setSending(false); setNotice(uploaded.error.message); return; }
    const { data: message, error } = await supabase.from("messages").insert({ conversation_id: active, sender_id: session.user.id, body: "📎 " + file.name }).select("id,body,sender_id,created_at,edited_at,deleted_at").single();
    if (error || !message) { setSending(false); setNotice(error?.message || "Could not create attachment message."); return; }
    const { error: metadataError } = await supabase.from("gitmessage_attachments").insert({ message_id: message.id, conversation_id: active, user_id: session.user.id, file_name: file.name, storage_path: path, mime_type: contentType, size_bytes: file.size });
    setSending(false);
    if (metadataError) { setNotice(metadataError.message); return; }
    setMessages(rows => rows.some(row => row.id === message.id) ? rows : [...rows, message as Message]);
  }

  useEffect(() => {
    if (!supabase || messages.length === 0) { setReactions({}); return; }
    const ids = messages.map(message => message.id);
    void supabase.from("gitmessage_reactions").select("message_id,emoji,user_id").in("message_id", ids).then(({data}) => {
      const grouped: Record<string, {emoji:string;user_id:string}[]> = {};
      (data || []).forEach((row: any) => { (grouped[row.message_id] ||= []).push({emoji:row.emoji,user_id:row.user_id}); });
      setReactions(grouped);
    });
  }, [messages]);

  async function sendCallSignal(recipientId: string, signalType: string, payload: any = {}) {
    if (!supabase || !active || !session) return;
    const { error } = await supabase.from("gitmessage_call_signals").insert({
      conversation_id: active, sender_id: session.user.id, recipient_id: recipientId, signal_type: signalType, payload
    });
    if (error) setNotice(error.message);
  }

  async function makePeer(recipientId: string) {
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] });
    peerRef.current = peer;
    peer.onicecandidate = event => { if (event.candidate) void sendCallSignal(recipientId, "ice", { candidate: event.candidate.toJSON() }); };
    peer.ontrack = event => { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0]; if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0]; setCallState("connected"); };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setCallState("connected");
      if (["failed","closed","disconnected"].includes(peer.connectionState)) setCallState("idle");
    };
    return peer;
  }

  async function getOptionalCallMedia(kind: "audio" | "video") {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true, video:kind==="video" });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch {
      localStreamRef.current = null;
      setNotice("Joined without microphone or camera. You can still hear the call; enable device permissions to speak or show video.");
      return null;
    }
  }

  async function startCall(kind: "audio" | "video") {
    if (!supabase || !active || !session || callState !== "idle") return;
    const { data: members, error } = await supabase.from("conversation_members").select("user_id").eq("conversation_id",active).neq("user_id",session.user.id).limit(1);
    if (error || !members?.length) { setNotice(error?.message || "No other person is in this conversation."); return; }
    const recipient = members[0].user_id as string;
    callRecipientRef.current = recipient;
    try {
      const stream = await getOptionalCallMedia(kind);
      setCallKind(kind); setCallState("calling");
      const peer = await makePeer(recipient);
      const audio = peer.addTransceiver("audio", { direction:"recvonly" });
      const audioTrack = stream?.getAudioTracks()[0];
      if (audioTrack) { await audio.sender.replaceTrack(audioTrack); audio.direction = "sendrecv"; }
      if (kind === "video") {
        const video = peer.addTransceiver("video", { direction:"recvonly" });
        const videoTrack = stream?.getVideoTracks()[0];
        if (videoTrack) { await video.sender.replaceTrack(videoTrack); video.direction = "sendrecv"; }
      }
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const callerName = profileDisplayName || profileUsername || "Your contact";
      const callLabel = kind === "video" ? "video" : "voice";
      const { error: callMessageError } = await supabase.from("messages").insert({
        conversation_id: active,
        sender_id: session.user.id,
        body: `📞 [GITMESSAGE_CALL:${kind}] ${callerName} started a ${callLabel} call. Join the call below.`
      });
      if (callMessageError) setNotice("Call started, but the chat notification could not be posted: " + callMessageError.message);
      await sendCallSignal(recipient,"offer",{description:offer,kind});
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not start the call."); await endCall(); }
  }

  async function acceptCall() {
    if (!pendingCall || !supabase || !session) return;
    try {
      const kind = pendingCall.payload?.kind === "video" ? "video" : "audio";
      const stream = await getOptionalCallMedia(kind);
      setCallKind(kind);
      const peer = await makePeer(pendingCall.sender_id);
      await peer.setRemoteDescription(new RTCSessionDescription(pendingCall.payload.description));
      for (const transceiver of peer.getTransceivers()) {
        const track = transceiver.receiver.track.kind === "audio" ? stream?.getAudioTracks()[0] : stream?.getVideoTracks()[0];
        if (track) { await transceiver.sender.replaceTrack(track); transceiver.direction = "sendrecv"; }
      }
      const answer = await peer.createAnswer(); await peer.setLocalDescription(answer);
      await sendCallSignal(pendingCall.sender_id,"answer",{description:answer});
      callRecipientRef.current = pendingCall.sender_id;
      setPendingCall(null); setCallState("calling");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not accept call."); }
  }

  async function endCall(notifyRemote = true) {
    if (notifyRemote && supabase && callRecipientRef.current && callState !== "incoming") await sendCallSignal(callRecipientRef.current,"hangup",{});
    callRecipientRef.current = "";
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (peerRef.current) peerRef.current.close();
    peerRef.current = null;
    setPendingCall(null); setCallState("idle");
  }

  useEffect(() => {
    if (!supabase || !session) return;
    const channel = supabase.channel("gitmessage-call-signals-" + session.user.id)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"gitmessage_call_signals",filter:"recipient_id=eq."+session.user.id},async payload => {
        const signal = payload.new as any;
        if (signal.signal_type === "offer" && callState === "idle") { setPendingCall(signal); setCallKind(signal.payload?.kind === "video" ? "video" : "audio"); setCallState("incoming"); return; }
        if (signal.signal_type === "answer" && peerRef.current && signal.sender_id) {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(signal.payload.description));
          setCallState("connected");
        } else if (signal.signal_type === "ice" && peerRef.current && signal.payload?.candidate) {
          try { await peerRef.current.addIceCandidate(new RTCIceCandidate(signal.payload.candidate)); } catch { /* Candidate can arrive before remote description. */ }
        } else if (["hangup","reject"].includes(signal.signal_type)) { await endCall(false); }
      }).subscribe();
    return () => { void supabase!.removeChannel(channel); };
  }, [session, callState]);

  async function enableDesktopAlerts() {
    if (typeof Notification === "undefined") { setNotice("Desktop notifications are not supported here."); return; }
    const permission = await Notification.requestPermission();
    setDesktopAlerts(permission === "granted");
    setNotice(permission === "granted" ? "Desktop alerts enabled while GitMessage is running." : "Notification permission was not granted.");
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

      <div className="auth-top"><div className="brand-lockup"><span>Messages</span></div><span className="top-caption">A little more connected.</span></div>
      <section className="auth-layout">
        <div className="auth-copy"><div className="eyebrow">MESSAGES, MADE SIMPLE</div><h1>Stay close.<br/><span>Say more.</span></h1><p>Simple, private conversations with the people who matter.</p></div>
        <form className="auth-card glass-panel" onSubmit={authenticate}>
          <div className="card-glint"/>
          <div className="auth-card-heading"><div className="auth-symbol"><MessageCircle size={22}/></div><div><h2>{authMode === "signin" ? "Sign in" : "Create account"}</h2><p>{authMode === "signin" ? "Your conversations are waiting." : "A few details and you are in."}</p></div></div>
          <label htmlFor="email">Email address</label><input id="email" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/>
          {authMode === "signup" && <><label htmlFor="signup-username">Username</label><input id="signup-username" autoComplete="username" value={signupUsername} onChange={e => setSignupUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24))} placeholder="your_username" maxLength={24}/></>}
          <label htmlFor="password">Password</label><div className="password-wrap"><input id="password" autoComplete={authMode === "signin" ? "current-password" : "new-password"} type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder={authMode === "signup" ? "At least 8 characters" : "Your password"}/><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide" : "Show"}</button></div>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "One moment…" : authMode === "signin" ? "Sign in" : "Create account"}<ArrowUpRight size={17}/></button>
          <button type="button" className="switch-auth" onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setNotice(""); }}>{authMode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
          {notice && <p className="notice">{notice}</p>}
          <div className="auth-foot"><ShieldCheck size={14}/> Encrypted connection to your account</div>
        </form>
      </section>
      
    </main>
  );

  return (
    <main onTouchStart={e=>{const t=e.touches[0];mobileSwipeStart.current={x:t.clientX,y:t.clientY};}} onTouchEnd={handleMobileSwipeEnd} className={"desktop-shell accent-" + accentChoice + " density-" + density + " text-" + messageSize + " profile-card-" + profileCardStyle + " profile-ring-" + profileAvatarRing + (profileShowBio ? " profile-show-bio" : " profile-hide-bio") + (profileShowUsername ? " profile-show-username" : " profile-hide-username") + (!animations ? " no-animations" : "") + (lightMode ? " light" : "") + (active ? " mobile-chat-open" : "") + (navigator.userAgent.includes("Electron") ? " electron-shell" : "")}>
      <nav className="app-rail" aria-label="Main navigation">

        <button className="rail-button selected" title="Messages" onClick={() => { setQuery(""); setActive(conversations[0]?.id || ""); }}><MessageCircle size={20}/></button>
        <button className="rail-button" title="Friends" onClick={() => void loadFriendRequests()}><Users size={20}/></button>
        <button className="rail-button rail-add" title="Create or join server" aria-label="Create or join server" onClick={() => void openServers()}><Plus size={21}/></button>
        <div className="rail-server-list">{serverRows.map((server:any)=><button key={server.server_id} type="button" className={"rail-server-button"+(activeServer?.server_id===server.server_id?" selected":"")} title={server.name} aria-label={server.name} onClick={()=>void openServerChat(server)}>{server.avatar_path && supabase ? <img src={supabase.storage.from("gitmessage-avatars").getPublicUrl(server.avatar_path).data.publicUrl} alt=""/> : server.name.slice(0,2).toUpperCase()}</button>)}</div>
        <div className="rail-spacer"/>
        <button className="rail-button" title="Appearance and preferences" onClick={() => setModal("settings")}><Settings size={19}/></button>
        <button className="rail-user" title="Edit profile" onClick={() => void loadProfile()}>{profileAvatar ? <img src={profileAvatar} alt="Your profile"/> : <UserRound size={22} strokeWidth={1.8}/>}</button>
      </nav>
      <aside className="sidebar glass-panel">
        <div className="sidebar-brand"><div className="brand-lockup"><span>Messages</span></div><button type="button" className="sidebar-new-message" title="New message" onClick={() => setModal("new")}><Plus size={17}/></button></div>
        <div className="account-chip"><button type="button" className="account-avatar profile-trigger" title="View your profile" onClick={() => void loadProfile()}>{profileAvatar ? <img src={profileAvatar} alt="Your profile"/> : <UserRound size={22} strokeWidth={1.8}/>}</button><button type="button" className="account-copy account-profile-link" title="Edit your profile" onClick={() => void loadProfile()}><b>{profileDisplayName || session.user.email?.split("@")[0] || session.user.phone || "Your account"}</b><small><i/> Online</small>{profileBadge && <span className={"profile-special-tag " + profileBadge}>{profileBadge}</span>}</button><button className="glass-icon tiny" title="Account settings" onClick={() => setModal("settings")}><MoreHorizontal size={18}/></button></div>
        <div className="search-field"><Search size={16}/><input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a conversation"/><kbd>⌘ K</kbd></div>
        <div className="list-heading"><span>DIRECT MESSAGES</span><button className="glass-icon tiny" title="New conversation" onClick={() => setModal("new")}><Plus size={17}/></button></div>
        <div className="conversation-list">
          {filtered.map((conversation, index) => <div key={conversation.id} role="button" tabIndex={0} className={"conversation-item" + (active === conversation.id ? " active" : "")} onClick={() => setActive(conversation.id)} onTouchEnd={event => { event.preventDefault(); event.stopPropagation(); setActive(conversation.id); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive(conversation.id); } }}>
            <div className={"conversation-avatar avatar-tone-" + (index % 4)}>{conversation.avatar_path && supabase ? <img src={supabase.storage.from("gitmessage-avatars").getPublicUrl(conversation.avatar_path).data.publicUrl} alt=""/> : <MessageCircle size={17}/>}</div><div className="conversation-meta"><b>{conversation.title || "Conversation"}</b><small>Open conversation</small></div>{active === conversation.id && <span className="active-indicator"/>}
          <button className="conversation-delete" title="Remove from inbox" aria-label="Remove from inbox" onClick={event => { event.stopPropagation(); void removeConversation(conversation); }}><Trash2 size={14}/></button></div>)}
          {filtered.length === 0 && <div className="list-empty"><div className="empty-orb"><MessageCircle size={19}/></div><b>{query ? "Nothing found" : "A quiet beginning"}</b><p>{query ? "Try another name." : "Start a conversation to see it here."}</p>{!query && <button onClick={() => setModal("new")}>Start a conversation <Plus size={14}/></button>}</div>}
        </div>
        <div className="sidebar-bottom"><div className="sync-card"><span className="sync-icon"><Sparkles size={16}/></span><span><b>All caught up</b><small>Your space, in sync.</small></span><span className="sync-pulse"/></div><button className="settings-row" onClick={() => void loadProfile()}><UserRoundPlus size={17}/> Edit profile <span>›</span></button><button className="settings-row" onClick={() => void loadFriendRequests()}><Users size={17}/> Friend requests <span>›</span></button><button className="settings-row" onClick={() => setModal("group")}><Users size={17}/> New group <span>›</span></button><button className="settings-row" onClick={() => void openServers()}><Users size={17}/> Servers <span>›</span></button><button className="settings-row" onClick={() => setModal("settings")}><Settings size={17}/> Preferences <span>›</span></button><div className="sidebar-footer"><span>GITMESSAGE DESKTOP</span><span>•</span><span>DESKTOP</span></div></div>
      </aside>
      
      <section className="conversation-pane glass-panel">
        <header className="conversation-header"><button className="mobile-back glass-icon" title="Back to conversations" onClick={() => setActive("")}><ArrowLeft size={19}/></button><div className="header-person"><button type="button" className="header-avatar" title="View conversation profile" onClick={() => void openConversationProfile()}><MessageCircle size={18}/></button><div><h2><button type="button" className="header-title-link" onClick={() => void openConversationProfile()}>{current?.title || "Your messages"}</button></h2><p><span className="status-light"/> {someoneTyping ? "Someone is typing…" : current ? "Conversation space" : "A little room for good conversations"}</p></div></div><div className="header-tools call-header-tools"><button type="button" className="call-action-button voice-call-button" title={callState==="incoming" && callKind==="audio" ? "Join voice call" : "Start voice call"} aria-label={callState==="incoming" && callKind==="audio" ? "Join voice call" : "Start voice call"} disabled={!active || (callState!=="idle" && !(callState==="incoming" && callKind==="audio"))} onClick={() => callState==="incoming" && callKind==="audio" ? void acceptCall() : void startCall("audio")}><Phone size={17}/><span>{callState==="incoming" && callKind==="audio" ? "Join call" : "Call"}</span></button><button type="button" className="call-action-button video-call-button" title={callState==="incoming" && callKind==="video" ? "Join video call" : "Start video call"} aria-label={callState==="incoming" && callKind==="video" ? "Join video call" : "Start video call"} disabled={!active || (callState!=="idle" && !(callState==="incoming" && callKind==="video"))} onClick={() => callState==="incoming" && callKind==="video" ? void acceptCall() : void startCall("video")}><Video size={17}/><span>{callState==="incoming" && callKind==="video" ? "Join call" : "Video"}</span></button><span className="live-pill"><i/> LIVE SYNC</span><button className="glass-icon" title="Refresh conversations" onClick={() => void loadConversations()}><RefreshCw size={16}/></button><button className="glass-icon" title="Conversation details" aria-label="Toggle conversation details" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)}><MoreHorizontal size={18}/></button></div></header>
        <div className="message-canvas" ref={messageCanvasRef}>
          {active ? messages.length ? messages.map((message, index, displayedMessages) => {
            const mine = message.sender_id === session.user.id;
            const previous = displayedMessages[index - 1];
            const grouped = !!previous && previous.sender_id === message.sender_id && Math.abs(new Date(message.created_at).getTime() - new Date(previous.created_at).getTime()) <= 5 * 60 * 1000;
            return <div key={message.id} onContextMenu={event => showProfileContextMenu(event,message.sender_id,mine ? (profileUsername || "you") : (messageProfiles[message.sender_id]?.username || "user"),message.body,mine)} className={"message-line" + (mine ? " mine" : "") + (grouped ? " grouped" : "")}>{!grouped && <button type="button" className="message-avatar profile-trigger" title="View profile" onContextMenu={event => !mine && showProfileContextMenu(event,message.sender_id,messageProfiles[message.sender_id]?.username || "user")} onClick={() => mine ? void loadProfile() : void openPublicProfile(message.sender_id)}>{mine ? (profileAvatar ? <img src={profileAvatar} alt="Your profile"/> : <UserRound size={22} strokeWidth={1.8}/>) : (messageProfiles[message.sender_id]?.avatar_path && supabase ? <img src={supabase.storage.from("gitmessage-avatars").getPublicUrl(messageProfiles[message.sender_id].avatar_path!).data.publicUrl} alt=""/> : <UserRound size={22} strokeWidth={1.8}/>)}</button>}<div className="message-content">{!grouped && <div className="message-author"><button type="button" className="profile-name-trigger" onContextMenu={event => !mine && showProfileContextMenu(event,message.sender_id,messageProfiles[message.sender_id]?.username || "user")} onClick={() => mine ? void loadProfile() : void openPublicProfile(message.sender_id)}>{mine ? (profileDisplayName || "You") : (messageProfiles[message.sender_id]?.display_name || messageProfiles[message.sender_id]?.username || "Member")}</button> <time>{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>}{message.body.startsWith("📞 [GITMESSAGE_CALL:") ? <div className="call-message-card"><div className="call-message-icon">{message.body.includes(":video]") ? <Video size={19}/> : <Phone size={19}/>}</div><div className="call-message-copy"><b>{message.body.includes(":video]") ? "Video call" : "Voice call"}</b><span>{message.body.replace(/^📞 \[GITMESSAGE_CALL:(audio|video)\] /,"")}</span></div>{!mine && pendingCall && pendingCall.sender_id===message.sender_id && active===pendingCall.conversation_id && <button type="button" className="call-message-accept" onClick={() => void acceptCall()}>Accept</button>}</div> : message.body.startsWith("📎 ") && attachmentPreviews[message.id] ? <div className={attachmentPreviews[message.id].mime_type.startsWith("image/") ? "image-attachment-wrap" : "message-attachment-card"}>
                {attachmentPreviews[message.id].mime_type.startsWith("image/") ? <button type="button" className="image-attachment" onClick={() => setImageViewerUrl(attachmentPreviews[message.id].url)} title="Maximise image"><img src={attachmentPreviews[message.id].url} alt={attachmentPreviews[message.id].file_name}/></button> : attachmentPreviews[message.id].mime_type.startsWith("video/") || /\\.mp4$/i.test(attachmentPreviews[message.id].file_name) ? <div className="media-attachment"><video controls playsInline preload="metadata" src={attachmentPreviews[message.id].url}><track kind="captions"/></video><small>{attachmentPreviews[message.id].file_name}</small></div> : attachmentPreviews[message.id].mime_type.startsWith("audio/") || /\\.(webm|mp3|m4a|wav|ogg)$/i.test(attachmentPreviews[message.id].file_name) ? <div className="media-attachment audio-attachment"><div><Mic size={16}/><b>{attachmentPreviews[message.id].file_name}</b></div><audio controls preload="metadata" src={attachmentPreviews[message.id].url}/></div> : <div className="attachment-file-row"><Paperclip size={15}/><span><b>{attachmentPreviews[message.id].file_name}</b><small>{(attachmentPreviews[message.id].size_bytes / 1024 / 1024).toFixed(2)} MB</small></span><button type="button" onClick={() => void openAttachment(message.id)}>Open</button></div>}
              </div> : <div className="message-bubble">{renderMessageText(message.body)}</div>}<div className="message-actions"><button title="Like" onClick={() => void toggleReaction(message.id, "❤️")}>❤️</button><button title="Laugh" onClick={() => void toggleReaction(message.id, "😂")}>😂</button><button title="Surprised" onClick={() => void toggleReaction(message.id, "😮")}>😮</button>{mine && !message.deleted_at && <><button title="Edit message" onClick={() => void editMessage(message)}><Pencil size={12}/></button><button title="Delete message" onClick={() => void deleteMessage(message)}><Trash2 size={12}/></button></>}</div>{(reactions[message.id] || []).length > 0 && <div className="reaction-strip">{Array.from(new Set((reactions[message.id] || []).map(r => r.emoji))).map(emoji => <button key={emoji} onClick={() => void toggleReaction(message.id, emoji)}>{emoji} {(reactions[message.id] || []).filter(r => r.emoji === emoji).length}</button>)}</div>}<div className="message-meta">{message.edited_at && <span>Edited</span>}</div></div></div>;
          }) : <div className="empty-conversation"><div className="empty-art"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-core"><MessageCircle size={27}/></div><span className="art-spark spark-one"/><span className="art-spark spark-two"/></div><div className="eyebrow">A SPACE OF YOUR OWN</div><h3>Every good conversation<br/><span>starts somewhere.</span></h3><p>Send the first message and let it unfold.</p></div> : <div className="empty-conversation"><div className="empty-art"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-core"><Sparkles size={27}/></div><span className="art-spark spark-one"/><span className="art-spark spark-two"/></div><div className="eyebrow">YOUR PEOPLE, YOUR PLACE</div><h3>Make room for<br/><span>the good stuff.</span></h3><p>Choose a conversation or create a new one.</p><button className="empty-create" onClick={() => setModal("new")}><Plus size={15}/> New conversation</button></div>}
          <audio ref={remoteAudioRef} autoPlay/><video ref={remoteVideoRef} autoPlay playsInline className={"remote-call-video" + (callState !== "idle" && callKind === "video" ? " visible" : "")}/><video ref={localVideoRef} autoPlay muted playsInline className={"local-call-video" + (callState !== "idle" && callKind === "video" ? " visible" : "")}/>
        </div>
        <form className="composer-area" onSubmit={sendMessage}><input ref={fileInputRef} type="file" accept="image/*,video/mp4,audio/*,.mp4,.m4a,.mp3,.wav,.webm,.ogg" hidden onChange={event => { const file=event.target.files?.[0]; void uploadAttachment(file); event.target.value=""; }}/><div className="composer-glass"><button type="button" className="glass-icon" title={recording ? "Stop voice message" : "Record voice message"} disabled={!active || sending} onClick={() => void toggleVoiceRecording()}>{recording ? <MicOff size={17}/> : <Mic size={17}/>}</button><button type="button" className="glass-icon" title="Attach file" disabled={!active || sending} onClick={() => fileInputRef.current?.click()}><Paperclip size={17}/></button><textarea rows={1} value={draft} onChange={e => void updateDraft(e.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={active ? "Write a message…" : "Choose a conversation first"} disabled={!active || sending}/><button className="send-button" type="submit" disabled={!active || !draft.trim() || sending} title="Send message"><ArrowUp size={18}/></button></div><div className="composer-caption"><span>{recording ? "Recording voice message…" : "Messages are synced in real time"}</span><span><kbd>ENTER</kbd> TO SEND <i>·</i> <kbd>SHIFT + ENTER</kbd> NEW LINE</span></div>{notice && <p className="notice inline">{notice}</p>}</form>
      </section>
      <aside className={"conversation-details" + (detailsOpen ? " details-open" : "")}><button type="button" className="details-close glass-icon" title="Close conversation details" onClick={() => setDetailsOpen(false)}><X size={16}/></button>
        <div className="details-heading">CONVERSATION DETAILS</div>
        <div className="details-profile">
          <button type="button" className="details-avatar profile-trigger" title="View profile" onClick={() => void openConversationProfile()}>{current?.avatar_path && supabase ? <img src={supabase.storage.from("gitmessage-avatars").getPublicUrl(current.avatar_path).data.publicUrl} alt=""/> : <UserRound size={20} strokeWidth={1.8}/>}</button>
          <h3><button type="button" className="profile-name-trigger" onClick={() => void openConversationProfile()}>{current?.title || "No conversation selected"}</button></h3>
          <p>{current ? (current.is_group ? "Group conversation" : "Direct message") : "Select a conversation to see its details."}</p>
        </div>
        {current && <>
          <div className="details-section">{current.is_group && <button className="settings-row" onClick={() => void openGroupAdmin()}><ShieldCheck size={15}/> Manage group <span>›</span></button>}
            <div className="details-label">ABOUT</div>
            <div className="details-row"><MessageCircle size={15}/><span>{current.is_group ? "Group chat" : "Private conversation"}</span></div>
            <div className="details-row"><ShieldCheck size={15}/><span>Conversation members only</span></div>
          </div>
          <div className="details-section">
            <div className="details-label">ACTIVITY</div>
            <div className="details-row"><span className="status-light"/><span>Real-time sync enabled</span></div>
            <div className="details-row"><RefreshCw size={15}/><span>Updated {current.updated_at ? new Date(current.updated_at).toLocaleString([], {dateStyle:"medium",timeStyle:"short"}) : "recently"}</span></div>
          </div>
          <div className="details-section">
            <div className="details-label">MESSAGES</div>
            <div className="details-count">{messages.length}</div>
            <div className="details-muted">In this conversation</div>
          </div>
        </>}
      </aside>
      {profileContextMenu && <div className="profile-context-backdrop" onMouseDown={() => setProfileContextMenu(null)}><div className="gitmessage-context-menu" style={{left:profileContextMenu.x,top:profileContextMenu.y}} onMouseDown={event => event.stopPropagation()}><div className="context-menu-heading">{profileContextMenu.messageBody ? "MESSAGE OPTIONS" : "@"+profileContextMenu.username}</div>{profileContextMenu.messageBody && <button onClick={() => { void navigator.clipboard?.writeText(profileContextMenu.messageBody || ""); setProfileContextMenu(null); }}><Check size={15}/> Copy message</button>}{!profileContextMenu.isOwn && <><button onClick={() => { const id=profileContextMenu.userId; setProfileContextMenu(null); void openPublicProfile(id); }}><Users size={15}/> View profile</button><button onClick={() => { const id=profileContextMenu.userId; const username=profileContextMenu.username; setProfileContextMenu(null); void startDirectConversation({user_id:id,email:"",username,display_name:username}); }}><MessageCircle size={15}/> Send message</button><button onClick={() => { void navigator.clipboard?.writeText("@"+profileContextMenu.username); setProfileContextMenu(null); }}><Check size={15}/> Copy username</button></>}</div></div>}{imageViewerUrl && <div className="image-viewer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setImageViewerUrl(""); }}><button className="image-viewer-close" onClick={() => setImageViewerUrl("")} title="Close image">×</button><img src={imageViewerUrl} alt="Full-size attachment" onClick={event => event.stopPropagation()}/></div>}
      {callState !== "idle" && <div className={"call-banner " + (callState === "incoming" ? "incoming-call-banner" : "active-call-banner")} role="status"><span className="call-banner-icon">{callState === "incoming" ? <Phone size={17}/> : callKind === "video" ? <Video size={17}/> : <Phone size={17}/>}</span><span className="call-banner-copy"><b>{callState === "incoming" ? "Incoming " + callKind + " call" : callState === "connected" ? "Call connected" : "Calling…"}</b><small>{callState === "incoming" ? "Someone is trying to reach you" : callState === "connected" ? "You’re connected" : "Waiting for them to answer"}</small></span>{callState === "incoming" && <button className="call-answer-button" onClick={() => void acceptCall()}><Phone size={15}/> Answer</button>}{callState === "incoming" && <button className="call-decline-button" onClick={() => { if (pendingCall?.sender_id) void sendCallSignal(pendingCall.sender_id,"reject",{}); void endCall(false); }}>Decline</button>}<button className="call-end-button" onClick={() => void endCall()}><PhoneOff size={15}/> {callState === "incoming" ? "Dismiss" : "End"}</button></div>}{modal && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}><section className="modal-card glass-panel">
        <button className="modal-close glass-icon" onClick={() => setModal(null)} title="Close"><X size={17}/></button>
        {modal === "group" ? <><div className="modal-icon"><Users size={20}/></div><div className="eyebrow">BRING EVERYONE TOGETHER</div><h2>New group</h2><p className="modal-description">Name the group, then add people by username or email.</p><label htmlFor="group-title">Group name</label><input id="group-title" value={groupTitle} onChange={e => setGroupTitle(e.target.value)} placeholder="Weekend plans"/><form onSubmit={searchContacts}><label htmlFor="group-contact-email">Add a member</label><div className="contact-search-input"><Search size={16}/><input id="group-contact-email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="@username or friend@example.com"/></div><button className="primary-button" type="submit" disabled={contactLoading || !contactEmail.trim()}>{contactLoading ? "Searching…" : "Find account"}<Search size={17}/></button></form>{contactResults.map(user => <div className="contact-result" key={user.user_id}><div className="contact-result-avatar">{<UserRound size={20} strokeWidth={1.8}/>}</div><button type="button" className="contact-result-copy profile-name-trigger" title="View profile" onClick={()=>void openPublicProfile(user.user_id)}><b>{user.display_name || user.username || "GitMessage user"}</b><small>@{user.username || user.email?.split("@")[0] || "user"}</small></button><button className="contact-start-button" onClick={() => { setGroupMembers(rows => rows.some(x => x.user_id === user.user_id) ? rows : [...rows,user]); setContactResults([]); setContactEmail(""); }}>Add</button></div>)}{groupMembers.map(user => <div className="contact-result" key={user.user_id}><div className="contact-result-copy"><b>@{user.username || user.email || "GitMessage user"}</b><small>Added to group</small></div><button className="contact-start-button" onClick={() => setGroupMembers(rows => rows.filter(x => x.user_id !== user.user_id))}>Remove</button></div>)}<button className="primary-button" disabled={busy || !groupTitle.trim() || groupMembers.length===0} onClick={() => void createGroupConversation()}>{busy ? "Creating…" : "Create group"}<Users size={17}/></button>{notice && <p className="notice">{notice}</p>}</> : null}
        {modal === "servers" ? <><div className="modal-icon"><Users size={20}/></div><div className="eyebrow">COMMUNITIES</div><h2>Servers</h2><p className="modal-description">Servers are separate spaces with their own members and channels, not group chats.</p><form onSubmit={createServer}><label htmlFor="server-name">Create a server</label><input id="server-name" value={serverName} onChange={e => setServerName(e.target.value)} maxLength={64} placeholder="Server name"/><label htmlFor="server-description">Description</label><input id="server-description" value={serverDescription} onChange={e => setServerDescription(e.target.value)} maxLength={500} placeholder="What is this server for?"/><button className="primary-button" type="submit" disabled={busy || serverName.trim().length<2}>{busy ? "Creating…" : "Create server"}<Plus size={16}/></button></form><form onSubmit={joinServer}><label htmlFor="server-invite">Join with invite code</label><input id="server-invite" value={serverJoinCode} onChange={e => setServerJoinCode(e.target.value)} placeholder="Paste server invite code"/><button className="primary-button" type="submit" disabled={busy || !serverJoinCode.trim()}>Join server<ArrowUpRight size={16}/></button></form><div className="eyebrow">YOUR SERVERS</div>{serverRows.length ? serverRows.map(server => <div className="contact-result server-result" key={server.server_id}><div className="contact-result-avatar"><Users size={16}/></div><div className="contact-result-copy"><b>{server.name}</b><small>{server.member_role} · Invite: {server.invite_code}</small></div><button className="contact-start-button" onClick={() => void openServerChat(server)}>Open</button></div>) : <p className="modal-description">You have not joined any servers yet.</p>}{notice && <p className="notice">{notice}</p>}</> : null}{modal === "server-chat" && activeServer ? <div className="server-workspace"><aside className="server-channel-sidebar"><div className="server-workspace-title"><b>{activeServer.name}</b><small>Invite: {activeServer.invite_code}</small></div><div className="server-channel-heading">TEXT CHANNELS</div>{serverChannels.map(channel=><button type="button" key={channel.id} className={"server-channel-link"+(activeServerChannel===channel.id?" active":"")} onClick={()=>void selectServerChannel(channel)}><span>#</span>{channel.name}</button>)}<form className="server-channel-create" onSubmit={createServerChannel}><input aria-label="New channel name" value={serverChannelName} onChange={e=>setServerChannelName(e.target.value)} placeholder="New channel name"/><button type="submit" disabled={!serverChannelName.trim()} title="Create channel"><Plus size={15}/></button></form></aside><section className="server-channel-main"><header className="server-channel-header"><b># {serverChannels.find(channel=>channel.id===activeServerChannel)?.name || "channel"}</b><span>{activeServer.name}</span></header><div className="server-chat-messages">{serverMessages.map(message=><div className="server-chat-message" key={message.id}><b>{message.sender_id===session.user.id ? "You" : "Member"}</b><span>{message.body}</span><time>{new Date(message.created_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</time></div>)}</div><form className="server-chat-composer" onSubmit={sendServerMessage}><input value={serverDraft} onChange={e=>setServerDraft(e.target.value)} placeholder={"Message #"+(serverChannels.find(channel=>channel.id===activeServerChannel)?.name||"channel")}/><button className="send-button" type="submit" disabled={!serverDraft.trim()}>Send</button></form>{notice && <p className="notice">{notice}</p>}</section></div> : null}{modal === "group-admin" ? <div className="group-control-panel"><div className="group-control-hero"><div className="group-control-icon"><ShieldCheck size={21}/></div><div className="eyebrow">COMMUNITY SETTINGS</div><h2>Manage group</h2><p className="modal-description">Control the group identity, member roles and permissions.</p></div><div className="group-control-actions"><label className="group-action-tile"><span className="group-action-symbol">▧</span><span><b>Group picture</b><small>Upload a custom group image</small></span><input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { void uploadGroupAvatar(event.target.files?.[0]); event.target.value=""; }}/><strong>Change</strong></label><button className="group-action-tile" onClick={() => void renameCurrentGroup()}><span className="group-action-symbol">✎</span><span><b>Group name</b><small>{current?.title || "Set a group name"}</small></span><strong>Edit</strong></button></div><div className="group-members-heading"><div><div className="eyebrow">MEMBERS</div><b>{groupAdminMembers.length} people</b></div><span>OWNER CONTROLS</span></div><div className="group-admin-list">{groupAdminMembers.map(member => <article className="group-member-card" key={member.user_id}><div className="group-member-top"><button type="button" className="group-member-avatar profile-trigger" title="View profile" onClick={()=>void openPublicProfile(member.user_id)}>{<UserRound size={20} strokeWidth={1.8}/>}</button><button type="button" className="group-member-identity profile-name-trigger" title="View profile" onClick={()=>void openPublicProfile(member.user_id)}><b>{member.profile?.display_name || member.profile?.username || "Member"}</b><small>@{member.profile?.username || "user"}</small></button><span className={"group-role-pill " + (member.member_role==="owner" ? "owner" : "member")}>{member.member_role}</span><button className="group-member-more" title="Member options" onClick={event => { event.currentTarget.nextElementSibling?.classList.toggle("open"); }}><MoreHorizontal size={18}/></button><div className="group-member-menu"><button onClick={() => void openPublicProfile(member.user_id)}>View profile</button><button onClick={() => void startDirectConversation({user_id:member.user_id,email:"",username:member.profile?.username,display_name:member.profile?.display_name})}>Message</button></div></div>{member.member_role!=="owner" && <div className="group-permission-grid"><label className="group-role-select"><span>Member role</span><select value={member.member_role==="admin"||member.member_role==="moderator"?member.member_role:"member"} onChange={e => void changeGroupMember(member.user_id,member.member_permissions || {},e.target.value)}><option value="member">Member</option><option value="moderator">Moderator</option><option value="admin">Administrator</option></select></label><label className="group-permission"><input type="checkbox" checked={!!member.member_permissions?.manage_group} onChange={e => void changeGroupMember(member.user_id,{...member.member_permissions,manage_group:e.target.checked},member.member_role)}/><span><b>Manage group</b><small>Change name and picture</small></span></label><label className="group-permission"><input type="checkbox" checked={!!member.member_permissions?.manage_members} onChange={e => void changeGroupMember(member.user_id,{...member.member_permissions,manage_members:e.target.checked},member.member_role)}/><span><b>Manage members</b><small>Invite and remove people</small></span></label><label className="group-permission"><input type="checkbox" checked={!!member.member_permissions?.manage_messages} onChange={e => void changeGroupMember(member.user_id,{...member.member_permissions,manage_messages:e.target.checked},member.member_role)}/><span><b>Manage messages</b><small>Moderate group messages</small></span></label><div className="group-member-footer"><span>Permissions apply immediately</span><button className="group-kick-button" onClick={() => void kickGroupMember(member.user_id)}>Remove member</button></div></div>}</article>)}</div>{notice && <p className="notice">{notice}</p>}</div> : null}{modal === "friends" ? <><div className="modal-icon"><Users size={20}/></div><div className="eyebrow">YOUR PEOPLE</div><h2>Friends</h2><p className="modal-description">Manage your friends and incoming requests.</p><div className="eyebrow">FRIENDS</div>{friends.length ? friends.map(friend => <div className="contact-result" key={friend.user_id}><button type="button" className="contact-result-avatar profile-trigger" title="View profile" onClick={()=>void openPublicProfile(friend.user_id)}>{<UserRound size={20} strokeWidth={1.8}/>}</button><button type="button" className="contact-result-copy profile-name-trigger" title="View profile" onClick={()=>void openPublicProfile(friend.user_id)}><b>{friend.display_name || friend.username || "GitMessage user"}</b><small>@{friend.username || "friend"}</small></button><button className="contact-start-button" onClick={() => void unfriend(friend.user_id)}>Unfriend</button></div>) : <p className="modal-description">You have no friends added yet.</p>}<div className="eyebrow">PENDING REQUESTS</div>{friendRequests.length ? friendRequests.map(request => <div className="contact-result" key={request.id}><div className="contact-result-avatar">G</div><div className="contact-result-copy"><b>GitMessage user</b><small>Wants to connect</small></div><button className="contact-start-button" onClick={() => void respondFriendRequest(request.id,true)}>Accept</button><button className="contact-start-button" onClick={() => void respondFriendRequest(request.id,false)}>Decline</button></div>) : <p className="modal-description">No pending friend requests.</p>}{notice && <p className="notice">{notice}</p>}</> : null}{modal === "public-profile" ? <div className={"public-profile-card palette-" + (publicProfile?.profile_palette || "graphite") + " profile-card-" + (publicProfile?.profile_card_style || "glass") + " profile-ring-" + (publicProfile?.profile_avatar_ring || "accent")}>
  {publicProfileBanner && <div className="profile-banner public-profile-banner"><img src={publicProfileBanner} alt="Profile banner"/></div>}<div className="public-profile-heading"><div><div className="eyebrow">GITMESSAGE PROFILE</div><h2>{publicProfile?.display_name || publicProfile?.username || "User"}</h2></div></div>
  <div className="public-profile-identity">
    <div className={"profile-photo profile-accent-" + (publicProfile?.profile_palette || "graphite") + (publicProfile?.profile_frame ? " profile-frame-" + publicProfile.profile_frame : "")}>{publicProfileAvatar ? <img src={publicProfileAvatar} alt="Profile"/> : <UserRound size={30} strokeWidth={1.7}/>}</div>
    <div className="public-profile-names"><b>{publicProfile?.display_name || publicProfile?.username || "User"}</b>{publicProfile?.profile_show_username !== false && <span>@{publicProfile?.username || "user"}</span>}{publicProfile?.profile_badge && <span className={"profile-special-tag " + publicProfile.profile_badge}>{publicProfile.profile_badge}</span>}</div>
  </div>
  {publicProfile?.profile_show_bio !== false ? (publicProfile?.bio ? <p className="profile-bio">{renderBioWithLinks(publicProfile.bio)}</p> : <p className="public-profile-empty-bio">No bio added yet.</p>) : null}
  <button className="primary-button public-profile-message" onClick={() => { if(publicProfile?.user_id) void startDirectConversation({user_id:publicProfile.user_id,email:"",username:publicProfile.username,display_name:publicProfile.display_name}); }}>Message <ArrowUpRight size={17}/></button>
  <div className="profile-safety-actions"><button type="button" onClick={() => void blockPublicProfile()}>Block user</button><button type="button" onClick={() => void reportPublicProfile()}>Report user</button></div>
  {notice && <p className="notice">{notice}</p>}
</div> : null}{modal === "profile" ? <div className="profile-editor"><div className="modal-icon"><UserRoundPlus size={20}/></div><div className="eyebrow">YOUR IDENTITY</div><h2>Edit profile</h2><p className="modal-description">Personalise your public profile. Your creator or staff badge is managed separately.</p><button type="button" className="profile-preview-toggle" onClick={()=>setProfilePreviewOpen(value=>!value)}>{profilePreviewOpen ? "Hide profile preview" : "Preview profile"}<ArrowUpRight size={16}/></button><div className="profile-customize"><h3>Profile appearance</h3><p>Choose how your profile card and photo appear to other people.</p><label htmlFor="profile-card-style">Profile card style</label><select id="profile-card-style" value={profileCardStyle} onChange={e=>setProfileCardStyle(e.target.value)}><option value="glass">Glass</option><option value="solid">Solid</option><option value="minimal">Minimal</option></select><label htmlFor="profile-avatar-ring">Photo outline</label><select id="profile-avatar-ring" value={profileAvatarRing} onChange={e=>setProfileAvatarRing(e.target.value)}><option value="accent">Accent ring</option><option value="subtle">Subtle ring</option><option value="none">No ring</option></select><label className="profile-customize-toggle"><input type="checkbox" checked={profileShowBio} onChange={e=>setProfileShowBio(e.target.checked)}/> Show about me on profile</label><label className="profile-customize-toggle"><input type="checkbox" checked={profileShowUsername} onChange={e=>setProfileShowUsername(e.target.checked)}/> Show username on profile</label></div>{profilePreviewOpen && <div className={"profile-preview-card profile-card-"+profileCardStyle+" profile-accent-"+profilePalette}><div className="profile-preview-topline">PROFILE PREVIEW</div>{profileBanner && <div className="profile-banner profile-banner-preview"><img src={profileBanner} alt="Profile banner preview"/></div>}<div className="public-profile-identity"><div className={"profile-photo profile-accent-"+profilePalette+(profileAvatarRing==="none"?"":profileAvatarRing==="subtle"?" profile-ring-subtle":" profile-ring-accent")}>{profileAvatar ? <img src={profileAvatar} alt="Your profile"/> : <UserRound size={30} strokeWidth={1.7}/>}</div><div className="public-profile-names"><b>{profileDisplayName || "Your display name"}</b>{profileShowUsername && <span>@{profileUsername || "username"}</span>}</div></div>{profileShowBio && <p className="profile-bio">{profileBio || "Your bio will appear here."}</p>}</div>}<div className="profile-banner-editor"><div className="profile-banner-editor-preview">{profileBanner ? <img src={profileBanner} alt="Your profile banner"/> : <span>PROFILE BANNER</span>}</div><label className="avatar-upload-label">{avatarBusy ? "Uploading…" : profileBanner ? "Change banner" : "Add banner"}<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{void uploadProfileBanner(event.target.files?.[0]);event.target.value="";}}/></label>{profileBanner && <button type="button" className="profile-banner-remove" onClick={async()=>{if(!supabase||!session)return;const {error}=await supabase.from("profiles").update({banner_path:null}).eq("id",session.user.id);if(error){setNotice(error.message);return;}setProfileBanner("");}}>Remove banner</button>}<small>Wide image · JPG, PNG or WebP · up to 8 MB</small></div><div className="profile-photo-row"><div className={"profile-photo profile-accent-" + profilePalette + (profileFrame ? " profile-frame-" + profileFrame : "")}>{profileAvatar ? <img src={profileAvatar} alt="Profile"/> : <UserRound size={22} strokeWidth={1.8}/>}</div><label className="avatar-upload-label">{avatarBusy ? "Uploading…" : "Change photo"}<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { void uploadAvatar(event.target.files?.[0]); event.target.value=""; }}/></label></div><form onSubmit={saveProfile}><label htmlFor="profile-display-name">Display name</label><input id="profile-display-name" value={profileDisplayName} onChange={e => setProfileDisplayName(e.target.value)} maxLength={48}/><label htmlFor="profile-username">Username</label><input id="profile-username" value={profileUsername} onChange={e => setProfileUsername(e.target.value)} maxLength={24}/><label htmlFor="profile-bio">About me</label><textarea id="profile-bio" className="profile-bio-input" value={profileBio} onChange={e => setProfileBio(e.target.value)} maxLength={240} placeholder="A little about yourself…"/><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}<Check size={17}/></button></form><div className="profile-editor-note"><UserRound size={15}/> Your profile photo, display name, username and bio are shown to other people when they open your profile.</div>{notice && <p className="notice">{notice}</p>}</div> : null}
        {modal === "new" ? <><div className="modal-icon"><UserRoundPlus size={20}/></div><div className="eyebrow">FIND YOUR PEOPLE</div><h2>New message</h2><p className="modal-description">Search by username or email address to find someone and start a private chat.</p><form onSubmit={searchContacts}><label htmlFor="contact-email">Username or email</label><div className="contact-search-input"><Search size={16}/><input id="contact-email" autoFocus value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="@username or friend@example.com"/></div><button className="primary-button" type="submit" disabled={contactLoading || !contactEmail.trim()}>{contactLoading ? "Searching…" : "Find account"}<Search size={17}/></button></form>{contactResults.map(user => <div className="contact-result" key={user.user_id}><button type="button" className="contact-result-avatar profile-trigger" title="View profile" onClick={() => void openPublicProfile(user.user_id)}>{user.avatar_path && supabase ? <img src={supabase.storage.from("gitmessage-avatars").getPublicUrl(user.avatar_path).data.publicUrl} alt=""/> : <UserRound size={20} strokeWidth={1.8}/>}</button><div className="contact-result-copy"><b>{user.display_name || user.username || "GitMessage user"}</b><small>@{user.username || user.email?.split("@")[0] || "user"}</small></div><button className="contact-start-button" onClick={() => void sendFriendRequest(user)}>Add friend</button><button className="contact-start-button" disabled={busy} onClick={() => void startDirectConversation(user)}>{busy ? "Opening…" : "Message"}<ArrowUpRight size={14}/></button></div>)}{notice && <p className="notice">{notice}</p>}</> : modal === "settings" ? <><div className="modal-icon"><Settings size={20}/></div><div className="eyebrow">YOUR GITMESSAGE</div><h2>Preferences</h2><p className="modal-description">A few details about your space.</p><div className="settings-account"><div className="account-avatar large">{profileAvatar ? <img src={profileAvatar} alt="Your profile"/> : <UserRound size={22} strokeWidth={1.8}/>}</div><div><b>{session.user.email || session.user.phone}</b><small>Signed in account</small></div></div><button className="preference-row" onClick={() => void loadProfile()}><span className="preference-icon"><UserRoundPlus size={17}/></span><span><b>Edit profile</b><small>Display name and username</small></span><span className="preference-action">›</span></button><button className="preference-row" onClick={() => setLightMode(value => !value)}><span className="preference-icon">{lightMode ? <Sun size={17}/> : <Moon size={17}/>}</span><span><b>Appearance</b><small>{lightMode ? "Light glass" : "Midnight glass"}</small></span><span className="preference-action">{lightMode ? "Light" : "Dark"}</span></button><div className="settings-customize"><h3>Personalise your app</h3><label htmlFor="accent-choice">Interface accent</label><select id="accent-choice" value={accentChoice} onChange={e=>setAccentChoice(e.target.value)}><option value="blue">Blue</option><option value="purple">Purple</option><option value="teal">Teal</option><option value="orange">Orange</option><option value="pink">Pink</option></select><label htmlFor="density-choice">Layout density</label><select id="density-choice" value={density} onChange={e=>setDensity(e.target.value)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select><label htmlFor="message-size">Message text size</label><select id="message-size" value={messageSize} onChange={e=>setMessageSize(e.target.value)}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select><label className="settings-toggle"><input type="checkbox" checked={animations} onChange={e=>setAnimations(e.target.checked)}/> Interface animations</label></div><button className="preference-row" onClick={() => void enableDesktopAlerts()}><span className="preference-icon"><MessageCircle size={17}/></span><span><b>Desktop notifications</b><small>Alerts when GitMessage is running</small></span><span className="preference-action">{desktopAlerts ? "On" : "Enable"}</span></button><button className="preference-row signout-row" onClick={() => void signOut()}><span className="preference-icon"><LogOut size={17}/></span><span><b>Sign out</b><small>Sign out of this device</small></span><span className="preference-action">›</span></button></> : null}
      </section></div>}
    </main>
  );
}