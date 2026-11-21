import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "./lib/supabase";
import {
  MessageCircle, Search, Plus, ArrowUp, Settings, Users, LogOut, Sparkles,
  ShieldCheck, X, Moon, Sun, MoreHorizontal, ArrowUpRight, Check,
  RefreshCw, UserRoundPlus, Paperclip, Pencil, Trash2, Mic, MicOff, Phone, Video, PhoneOff
} from "lucide-react";

type Conversation = { id: string; title: string | null; updated_at?: string; is_group?: boolean; avatar_path?: string | null };
type Message = { id: string; body: string; sender_id: string; created_at: string; edited_at?: string | null; deleted_at?: string | null };
type AttachmentPreview = { file_name: string; mime_type: string; size_bytes: number; url: string };
type ContactMatch = { user_id: string; email: string; username?: string };

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<Record<string, AttachmentPreview>>({});
  const [imageViewerUrl, setImageViewerUrl] = useState("");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<"new" | "group" | "profile" | "friends" | "settings" | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [contactResults, setContactResults] = useState<ContactMatch[]>([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMembers, setGroupMembers] = useState<ContactMatch[]>([]);
  const [profileUsername, setProfileUsername] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [friendRequests, setFriendRequests] = useState<any[]>([]);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [desktopAlerts, setDesktopAlerts] = useState(typeof Notification !== "undefined" && Notification.permission === "granted");
  const [sending, setSending] = useState(false);
  const [reactions, setReactions] = useState<Record<string, {emoji:string;user_id:string}[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [someoneTyping, setSomeoneTyping] = useState(false);
  const [readMessageIds, setReadMessageIds] = useState<string[]>([]);
  const [lightMode, setLightMode] = useState(() => { try { return localStorage.getItem("gitmessage-theme") !== "dark"; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem("gitmessage-theme", lightMode ? "light" : "dark"); } catch { /* Storage may be unavailable. */ } }, [lightMode]);
  const endRef = useRef<HTMLDivElement>(null);
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
      setProfileAvatar(profile?.avatar_path ? supabase!.storage.from("gitmessage-avatars").getPublicUrl(profile.avatar_path).data.publicUrl : "");
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
  }, [session]);

  useEffect(() => {
    if (!active || !supabase) { setMessages([]); return; }
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase!.from("messages")
        .select("id,body,sender_id,created_at,edited_at,deleted_at").eq("conversation_id", active)
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
          if (incoming.sender_id !== session?.user?.id && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("New GitMessage", { body: incoming.body });
          return current.some(message => message.id === incoming.id) ? current : [...current, incoming];
        }))
      .subscribe();
    return () => { alive = false; void supabase!.removeChannel(channel); };
  }, [active]);

  useEffect(() => {
    if (!supabase || !session || !messages.length) { setReadMessageIds([]); return; }
    const incoming = messages.filter(message => message.sender_id !== session.user.id);
    if (incoming.length) {
      void supabase.from("gitmessage_read_receipts").upsert(
        incoming.map(message => ({ message_id: message.id, user_id: session.user.id, read_at: new Date().toISOString() })),
        { onConflict: "message_id,user_id" }
      );
    }
    const ownIds = messages.filter(message => message.sender_id === session.user.id).map(message => message.id);
    if (!ownIds.length) { setReadMessageIds([]); return; }
    void supabase.from("gitmessage_read_receipts").select("message_id").in("message_id", ownIds).neq("user_id", session.user.id)
      .then(({ data }) => setReadMessageIds((data || []).map(row => row.message_id)));
  }, [messages, session]);

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

  async function loadProfile() {
    if (!supabase || !session) return;
    setModal("profile"); setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("get_my_gitmessage_profile");
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    const profile = Array.isArray(data) ? data[0] : data;
    setProfileUsername(profile?.username || "");
    setProfileDisplayName(profile?.display_name || "");
    setProfileAvatar(profile?.avatar_path ? supabase.storage.from("gitmessage-avatars").getPublicUrl(profile.avatar_path).data.publicUrl : "");
  }

  async function sendFriendRequest(user: ContactMatch) {
    if (!supabase) return;
    const { error } = await supabase.rpc("send_gitmessage_friend_request", { target_user_id: user.user_id });
    setNotice(error ? error.message : "Friend request sent.");
  }

  async function loadFriendRequests() {
    if (!supabase || !session) return;
    setModal("friends");
    const { data, error } = await supabase.from("friend_requests").select("id,sender_id,created_at").eq("recipient_id", session.user.id).eq("status","pending").order("created_at",{ascending:false});
    if (error) setNotice(error.message); else setFriendRequests(data || []);
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

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("update_gitmessage_profile", { new_username: profileUsername, new_display_name: profileDisplayName });
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
    const path = active + "/" + session.user.id + "/" + crypto.randomUUID() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uploaded = await supabase.storage.from("gitmessage-attachments").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploaded.error) { setSending(false); setNotice(uploaded.error.message); return; }
    const { data: message, error } = await supabase.from("messages").insert({ conversation_id: active, sender_id: session.user.id, body: "📎 " + file.name }).select("id,body,sender_id,created_at,edited_at,deleted_at").single();
    if (error || !message) { setSending(false); setNotice(error?.message || "Could not create attachment message."); return; }
    const { error: metadataError } = await supabase.from("gitmessage_attachments").insert({ message_id: message.id, conversation_id: active, user_id: session.user.id, file_name: file.name, storage_path: path, mime_type: file.type || "application/octet-stream", size_bytes: file.size });
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

  async function startCall(kind: "audio" | "video") {
    if (!supabase || !active || !session || callState !== "idle") return;
    const { data: members, error } = await supabase.from("conversation_members").select("user_id").eq("conversation_id",active).neq("user_id",session.user.id).limit(1);
    if (error || !members?.length) { setNotice(error?.message || "No other person is in this conversation."); return; }
    const recipient = members[0].user_id as string;
    callRecipientRef.current = recipient;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true, video:kind==="video" });
      localStreamRef.current = stream; setCallKind(kind); setCallState("calling");
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const peer = await makePeer(recipient);
      stream.getTracks().forEach(track => peer.addTrack(track,stream));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendCallSignal(recipient,"offer",{description:offer,kind});
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not start the call. Check microphone/camera permissions."); await endCall(); }
  }

  async function acceptCall() {
    if (!pendingCall || !supabase || !session) return;
    try {
      const kind = pendingCall.payload?.kind === "video" ? "video" : "audio";
      const stream = await navigator.mediaDevices.getUserMedia({audio:true,video:kind==="video"});
      localStreamRef.current = stream; setCallKind(kind);
      const peer = await makePeer(pendingCall.sender_id);
      stream.getTracks().forEach(track => peer.addTrack(track,stream));
      await peer.setRemoteDescription(new RTCSessionDescription(pendingCall.payload.description));
      const answer = await peer.createAnswer(); await peer.setLocalDescription(answer);
      await sendCallSignal(pendingCall.sender_id,"answer",{description:answer});
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

      <div className="auth-top"><div className="brand-lockup"><span>GitMessage</span></div><span className="top-caption">A little more connected.</span></div>
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
    <main className={"desktop-shell" + (lightMode ? " light" : "")}>
      <nav className="app-rail" aria-label="Main navigation">

        <button className="rail-button selected" title="Messages" onClick={() => { setQuery(""); setActive(conversations[0]?.id || ""); }}><MessageCircle size={20}/></button>
        <button className="rail-button" title="Friends" onClick={() => void loadFriendRequests()}><Users size={20}/></button>
        <button className="rail-button rail-add" title="New message" onClick={() => setModal("new")}><Plus size={21}/></button>
        <div className="rail-spacer"/>
        <button className="rail-button" title="Appearance and preferences" onClick={() => setModal("settings")}><Settings size={19}/></button>
        <button className="rail-user" title="Edit profile" onClick={() => void loadProfile()}>{profileAvatar ? <img src={profileAvatar} alt="Your profile"/> : (profileDisplayName || session.user.email || session.user.phone || "G").slice(0,1).toUpperCase()}</button>
      </nav>
      <aside className="sidebar glass-panel">
        <div className="sidebar-brand"><div className="brand-lockup"><span>GitMessage</span></div></div>
        <div className="account-chip"><div className="account-avatar">{profileAvatar ? <img src={profileAvatar} alt="Your profile"/> : (profileDisplayName || session.user.email || session.user.phone || "G").slice(0,1).toUpperCase()}</div><div className="account-copy"><b>{session.user.email?.split("@")[0] || session.user.phone || "Your account"}</b><small><i/> Online</small></div><button className="glass-icon tiny" title="Account settings" onClick={() => setModal("settings")}><MoreHorizontal size={18}/></button></div>
        <div className="search-field"><Search size={16}/><input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a conversation"/><kbd>⌘ K</kbd></div>
        <div className="list-heading"><span>DIRECT MESSAGES</span><button className="glass-icon tiny" title="New conversation" onClick={() => setModal("new")}><Plus size={17}/></button></div>
        <div className="conversation-list">
          {filtered.map((conversation, index) => <button key={conversation.id} className={"conversation-item" + (active === conversation.id ? " active" : "")} onClick={() => setActive(conversation.id)}>
            <div className={"conversation-avatar avatar-tone-" + (index % 4)}>{conversation.avatar_path && supabase ? <img src={supabase.storage.from("gitmessage-avatars").getPublicUrl(conversation.avatar_path).data.publicUrl} alt=""/> : <MessageCircle size={17}/>}</div><div className="conversation-meta"><b>{conversation.title || "Conversation"}</b><small>Open conversation</small></div>{active === conversation.id && <span className="active-indicator"/>}
          </button>)}
          {filtered.length === 0 && <div className="list-empty"><div className="empty-orb"><MessageCircle size={19}/></div><b>{query ? "Nothing found" : "A quiet beginning"}</b><p>{query ? "Try another name." : "Start a conversation to see it here."}</p>{!query && <button onClick={() => setModal("new")}>Start a conversation <Plus size={14}/></button>}</div>}
        </div>
        <div className="sidebar-bottom"><div className="sync-card"><span className="sync-icon"><Sparkles size={16}/></span><span><b>All caught up</b><small>Your space, in sync.</small></span><span className="sync-pulse"/></div><button className="settings-row" onClick={() => void loadProfile()}><UserRoundPlus size={17}/> Edit profile <span>›</span></button><button className="settings-row" onClick={() => void loadFriendRequests()}><Users size={17}/> Friend requests <span>›</span></button><button className="settings-row" onClick={() => setModal("group")}><Users size={17}/> New group <span>›</span></button><button className="settings-row" onClick={() => setModal("settings")}><Settings size={17}/> Preferences <span>›</span></button><div className="sidebar-footer"><span>GITMESSAGE DESKTOP</span><span>•</span><span>DESKTOP</span></div></div>
      </aside>
      
      <section className="conversation-pane glass-panel">
        <header className="conversation-header"><div className="header-person"><div className="header-avatar"><MessageCircle size={18}/></div><div><h2>{current?.title || "Your messages"}</h2><p><span className="status-light"/> {someoneTyping ? "Someone is typing…" : current ? "Conversation space" : "A little room for good conversations"}</p></div></div><div className="header-tools"><button className="glass-icon" title="Voice call" disabled={!active || callState!=="idle"} onClick={() => void startCall("audio")}><Phone size={16}/></button><button className="glass-icon" title="Video call" disabled={!active || callState!=="idle"} onClick={() => void startCall("video")}><Video size={16}/></button><span className="live-pill"><i/> LIVE SYNC</span><button className="glass-icon" title="Refresh conversations" onClick={() => void loadConversations()}><RefreshCw size={16}/></button><button className="glass-icon" title="Preferences" onClick={() => setModal("settings")}><Settings size={16}/></button></div></header>
        <div className="message-canvas">
          {active ? messages.length ? messages.map(message => {
            const mine = message.sender_id === session.user.id;
            return <div key={message.id} className={"message-line" + (mine ? " mine" : "")}><div className="message-avatar">{mine ? (profileAvatar ? <img src={profileAvatar} alt="Your profile"/> : (profileDisplayName || session.user.email || session.user.phone || "Y").slice(0,1).toUpperCase()) : (current?.avatar_path && supabase ? <img src={supabase.storage.from("gitmessage-avatars").getPublicUrl(current.avatar_path).data.publicUrl} alt=""/> : (current?.title || "G").slice(0,1).toUpperCase())}</div><div className="message-content"><div className="message-author">{mine ? "You" : (current?.title || "Contact")} <time>{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>{message.body.startsWith("📎 ") && attachmentPreviews[message.id] ? <div className="message-attachment-card">
                {attachmentPreviews[message.id].mime_type.startsWith("image/") ? <button type="button" className="image-attachment" onClick={() => void openAttachment(message.id, true)} title="View full-size image"><img src={attachmentPreviews[message.id].url} alt={attachmentPreviews[message.id].file_name}/></button> : null}
                <div className="attachment-file-row"><Paperclip size={15}/><span><b>{attachmentPreviews[message.id].file_name}</b><small>{(attachmentPreviews[message.id].size_bytes / 1024 / 1024).toFixed(2)} MB</small></span><button type="button" onClick={() => void openAttachment(message.id)}>Open</button></div>
              </div> : <div className="message-bubble">{message.body}</div>}<div className="message-actions"><button title="Like" onClick={() => void toggleReaction(message.id, "❤️")}>❤️</button><button title="Laugh" onClick={() => void toggleReaction(message.id, "😂")}>😂</button><button title="Surprised" onClick={() => void toggleReaction(message.id, "😮")}>😮</button>{message.body.startsWith("📎 ") && <button title="Open attachment" onClick={() => void openAttachment(message.id)}><Paperclip size={12}/></button>}{mine && !message.deleted_at && <><button title="Edit message" onClick={() => void editMessage(message)}><Pencil size={12}/></button><button title="Delete message" onClick={() => void deleteMessage(message)}><Trash2 size={12}/></button></>}</div>{(reactions[message.id] || []).length > 0 && <div className="reaction-strip">{Array.from(new Set((reactions[message.id] || []).map(r => r.emoji))).map(emoji => <button key={emoji} onClick={() => void toggleReaction(message.id, emoji)}>{emoji} {(reactions[message.id] || []).filter(r => r.emoji === emoji).length}</button>)}</div>}<div className="message-meta">{message.edited_at && <span>Edited</span>}{mine && <>{readMessageIds.includes(message.id) && <span>Read</span>}<Check size={12}/></>}</div></div></div>;
          }) : <div className="empty-conversation"><div className="empty-art"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-core"><MessageCircle size={27}/></div><span className="art-spark spark-one"/><span className="art-spark spark-two"/></div><div className="eyebrow">A SPACE OF YOUR OWN</div><h3>Every good conversation<br/><span>starts somewhere.</span></h3><p>Send the first message and let it unfold.</p></div> : <div className="empty-conversation"><div className="empty-art"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-core"><Sparkles size={27}/></div><span className="art-spark spark-one"/><span className="art-spark spark-two"/></div><div className="eyebrow">YOUR PEOPLE, YOUR PLACE</div><h3>Make room for<br/><span>the good stuff.</span></h3><p>Choose a conversation or create a new one.</p><button className="empty-create" onClick={() => setModal("new")}><Plus size={15}/> New conversation</button></div>}
          <div ref={endRef}/><audio ref={remoteAudioRef} autoPlay/><video ref={remoteVideoRef} autoPlay playsInline className={"remote-call-video" + (callState !== "idle" && callKind === "video" ? " visible" : "")}/><video ref={localVideoRef} autoPlay muted playsInline className={"local-call-video" + (callState !== "idle" && callKind === "video" ? " visible" : "")}/>
        </div>
        <form className="composer-area" onSubmit={sendMessage}><input ref={fileInputRef} type="file" hidden onChange={event => { const file=event.target.files?.[0]; void uploadAttachment(file); event.target.value=""; }}/><div className="composer-glass"><button type="button" className="glass-icon" title={recording ? "Stop voice message" : "Record voice message"} disabled={!active || sending} onClick={() => void toggleVoiceRecording()}>{recording ? <MicOff size={17}/> : <Mic size={17}/>}</button><button type="button" className="glass-icon" title="Attach file" disabled={!active || sending} onClick={() => fileInputRef.current?.click()}><Paperclip size={17}/></button><textarea rows={1} value={draft} onChange={e => void updateDraft(e.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={active ? "Write a message…" : "Choose a conversation first"} disabled={!active || sending}/><button className="send-button" type="submit" disabled={!active || !draft.trim() || sending} title="Send message"><ArrowUp size={18}/></button></div><div className="composer-caption"><span>{recording ? "Recording voice message…" : "Messages are synced in real time"}</span><span><kbd>ENTER</kbd> TO SEND <i>·</i> <kbd>SHIFT + ENTER</kbd> NEW LINE</span></div>{notice && <p className="notice inline">{notice}</p>}</form>
      </section>
      <aside className="conversation-details">
        <div className="details-heading">CONVERSATION DETAILS</div>
        <div className="details-profile">
          <div className="details-avatar">{current?.avatar_path && supabase ? <img src={supabase.storage.from("gitmessage-avatars").getPublicUrl(current.avatar_path).data.publicUrl} alt=""/> : (current?.title || "G").slice(0,1).toUpperCase()}</div>
          <h3>{current?.title || "No conversation selected"}</h3>
          <p>{current ? (current.is_group ? "Group conversation" : "Direct message") : "Select a conversation to see its details."}</p>
        </div>
        {current && <>
          <div className="details-section">
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
      {imageViewerUrl && <div className="image-viewer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setImageViewerUrl(""); }}><button className="image-viewer-close" onClick={() => setImageViewerUrl("")} title="Close image">×</button><img src={imageViewerUrl} alt="Full-size attachment" onClick={event => event.stopPropagation()}/></div>}\n      {callState !== "idle" && <div className="call-banner">{callState === "incoming" ? "Incoming " + callKind + " call" : callState === "connected" ? "Call connected" : "Calling…"}{callState === "incoming" && <button onClick={() => void acceptCall()}>Answer</button>}{callState === "incoming" && <button onClick={() => { if (pendingCall?.sender_id) void sendCallSignal(pendingCall.sender_id,"reject",{}); void endCall(false); }}>Decline</button>}<button onClick={() => void endCall()}><PhoneOff size={14}/> End</button></div>}{modal && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}><section className="modal-card glass-panel">
        <button className="modal-close glass-icon" onClick={() => setModal(null)} title="Close"><X size={17}/></button>
        {modal === "group" ? <><div className="modal-icon"><Users size={20}/></div><div className="eyebrow">BRING EVERYONE TOGETHER</div><h2>New group</h2><p className="modal-description">Name the group, then add people by username or email.</p><label htmlFor="group-title">Group name</label><input id="group-title" value={groupTitle} onChange={e => setGroupTitle(e.target.value)} placeholder="Weekend plans"/><form onSubmit={searchContacts}><label htmlFor="group-contact-email">Add a member</label><div className="contact-search-input"><Search size={16}/><input id="group-contact-email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="@username or friend@example.com"/></div><button className="primary-button" type="submit" disabled={contactLoading || !contactEmail.trim()}>{contactLoading ? "Searching…" : "Find account"}<Search size={17}/></button></form>{contactResults.map(user => <div className="contact-result" key={user.user_id}><div className="contact-result-avatar">{(user.username || user.email || "G").slice(0,1).toUpperCase()}</div><div className="contact-result-copy"><b>@{user.username || user.email?.split("@")[0] || "GitMessage user"}</b><small>{user.email || "Phone account"}</small></div><button className="contact-start-button" onClick={() => { setGroupMembers(rows => rows.some(x => x.user_id === user.user_id) ? rows : [...rows,user]); setContactResults([]); setContactEmail(""); }}>Add</button></div>)}{groupMembers.map(user => <div className="contact-result" key={user.user_id}><div className="contact-result-copy"><b>@{user.username || user.email || "GitMessage user"}</b><small>Added to group</small></div><button className="contact-start-button" onClick={() => setGroupMembers(rows => rows.filter(x => x.user_id !== user.user_id))}>Remove</button></div>)}<button className="primary-button" disabled={busy || !groupTitle.trim() || groupMembers.length===0} onClick={() => void createGroupConversation()}>{busy ? "Creating…" : "Create group"}<Users size={17}/></button>{notice && <p className="notice">{notice}</p>}</> : null}
        {modal === "friends" ? <><div className="modal-icon"><Users size={20}/></div><div className="eyebrow">YOUR PEOPLE</div><h2>Friend requests</h2><p className="modal-description">Accept requests to add people to your contacts.</p>{friendRequests.length ? friendRequests.map(request => <div className="contact-result" key={request.id}><div className="contact-result-avatar">G</div><div className="contact-result-copy"><b>GitMessage user</b><small>Wants to connect</small></div><button className="contact-start-button" onClick={() => void respondFriendRequest(request.id,true)}>Accept</button><button className="contact-start-button" onClick={() => void respondFriendRequest(request.id,false)}>Decline</button></div>) : <p className="modal-description">No pending friend requests.</p>}{notice && <p className="notice">{notice}</p>}</> : null}
        {modal === "profile" ? <><div className="modal-icon"><UserRoundPlus size={20}/></div><div className="eyebrow">YOUR IDENTITY</div><h2>Edit profile</h2><p className="modal-description">Choose the name and username other people see.</p><div className="profile-photo-row"><div className="profile-photo">{profileAvatar ? <img src={profileAvatar} alt="Profile"/> : (profileDisplayName || "G").slice(0,1).toUpperCase()}</div><label className="avatar-upload-label">{avatarBusy ? "Uploading…" : "Change photo"}<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { void uploadAvatar(event.target.files?.[0]); event.target.value=""; }}/></label></div><form onSubmit={saveProfile}><label htmlFor="profile-display-name">Display name</label><input id="profile-display-name" value={profileDisplayName} onChange={e => setProfileDisplayName(e.target.value)} maxLength={48}/><label htmlFor="profile-username">Username</label><input id="profile-username" value={profileUsername} onChange={e => setProfileUsername(e.target.value)} maxLength={24}/><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}<Check size={17}/></button></form>{notice && <p className="notice">{notice}</p>}</> : null}
        {modal === "new" ? <><div className="modal-icon"><UserRoundPlus size={20}/></div><div className="eyebrow">FIND YOUR PEOPLE</div><h2>New message</h2><p className="modal-description">Search by username or email address to find someone and start a private chat.</p><form onSubmit={searchContacts}><label htmlFor="contact-email">Username or email</label><div className="contact-search-input"><Search size={16}/><input id="contact-email" autoFocus value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="@username or friend@example.com"/></div><button className="primary-button" type="submit" disabled={contactLoading || !contactEmail.trim()}>{contactLoading ? "Searching…" : "Find account"}<Search size={17}/></button></form>{contactResults.map(user => <div className="contact-result" key={user.user_id}><div className="contact-result-avatar">{user.email.slice(0,1).toUpperCase()}</div><div className="contact-result-copy"><b>@{user.username || user.email?.split("@")[0] || "GitMessage user"}</b><small>{user.email || "Phone account"}</small></div><button className="contact-start-button" onClick={() => void sendFriendRequest(user)}>Add friend</button><button className="contact-start-button" disabled={busy} onClick={() => void startDirectConversation(user)}>{busy ? "Opening…" : "Message"}<ArrowUpRight size={14}/></button></div>)}{notice && <p className="notice">{notice}</p>}</> : modal === "settings" ? <><div className="modal-icon"><Settings size={20}/></div><div className="eyebrow">YOUR GITMESSAGE</div><h2>Preferences</h2><p className="modal-description">A few details about your space.</p><div className="settings-account"><div className="account-avatar large">{profileAvatar ? <img src={profileAvatar} alt="Your profile"/> : (profileDisplayName || session.user.email || session.user.phone || "G").slice(0,1).toUpperCase()}</div><div><b>{session.user.email || session.user.phone}</b><small>Signed in account</small></div></div><button className="preference-row" onClick={() => void loadProfile()}><span className="preference-icon"><UserRoundPlus size={17}/></span><span><b>Edit profile</b><small>Display name and username</small></span><span className="preference-action">›</span></button><button className="preference-row" onClick={() => setLightMode(value => !value)}><span className="preference-icon">{lightMode ? <Sun size={17}/> : <Moon size={17}/>}</span><span><b>Appearance</b><small>{lightMode ? "Light glass" : "Midnight glass"}</small></span><span className="preference-action">{lightMode ? "Light" : "Dark"}</span></button><button className="preference-row" onClick={() => void enableDesktopAlerts()}><span className="preference-icon"><MessageCircle size={17}/></span><span><b>Desktop notifications</b><small>Alerts when GitMessage is running</small></span><span className="preference-action">{desktopAlerts ? "On" : "Enable"}</span></button><button className="preference-row signout-row" onClick={() => void signOut()}><span className="preference-icon"><LogOut size={17}/></span><span><b>Sign out</b><small>Sign out of this device</small></span><span className="preference-action">›</span></button></> : null}
      </section></div>}
    </main>
  );
}