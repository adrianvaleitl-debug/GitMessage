import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return Response.json({ error: "Sign in required." }, { status: 401, headers: cors });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) return Response.json({ error: "AI is not configured yet. Set the OPENAI_API_KEY Supabase secret." }, { status: 503, headers: cors });

    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const token = authorization.replace(/^Bearer\\s+/i, "");
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return Response.json({ error: "Your session is invalid. Sign in again." }, { status: 401, headers: cors });

    const body = await req.json();
    const scope = body.scope === "shared" ? "shared" : body.scope === "private" ? "private" : "";
    const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 12000) : "";
    if (!scope || !prompt) return Response.json({ error: "A message is required." }, { status: 400, headers: cors });
    if (scope === "shared" && !conversationId) return Response.json({ error: "Conversation is required." }, { status: 400, headers: cors });

    const admin = createClient(supabaseUrl, serviceKey);
    let history: { role: "user" | "assistant"; content: string }[] = [];
    let sharedChatContext = "";
    if (scope === "shared") {
      const { data: membership, error: membershipError } = await admin.from("conversation_members")
        .select("user_id").eq("conversation_id", conversationId).eq("user_id", user.id).maybeSingle();
      if (membershipError || !membership) return Response.json({ error: "You are not a member of this conversation." }, { status: 403, headers: cors });
      const { error: insertError } = await admin.from("gitmessage_shared_ai_messages")
        .insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: prompt });
      if (insertError) throw insertError;
      const { data, error } = await admin.from("gitmessage_shared_ai_messages")
        .select("role,content").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(24);
      if (error) throw error;
      history = (data || []).reverse().map((row) => ({ role: row.role, content: row.content }));
      const { data: chatRows, error: chatError } = await admin.from("messages")
        .select("sender_id,body,created_at").eq("conversation_id", conversationId).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(20);
      if (chatError) throw chatError;
      const senderIds = [...new Set((chatRows || []).map((row) => row.sender_id))];
      const { data: chatProfiles } = senderIds.length
        ? await admin.from("profiles").select("id,username,display_name").in("id", senderIds)
        : { data: [] };
      const profileById = new Map((chatProfiles || []).map((profile) => [profile.id, profile.display_name || profile.username || "Member"]));
      sharedChatContext = (chatRows || []).reverse()
        .map((row) => (profileById.get(row.sender_id) || "Member") + ": " + row.body)
        .join("\\n").slice(-12000);
    } else {
      const { error: insertError } = await admin.from("gitmessage_private_ai_messages")
        .insert({ user_id: user.id, role: "user", content: prompt });
      if (insertError) throw insertError;
      const { data, error } = await admin.from("gitmessage_private_ai_messages")
        .select("role,content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(24);
      if (error) throw error;
      history = (data || []).reverse().map((row) => ({ role: row.role, content: row.content }));
    }

    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + openAiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: scope === "shared"
            ? "You are GitMessage Shared AI. You are assisting everyone in this conversation. Treat all prompts as visible to every conversation member. Be concise, practical, and collaborative. Never claim to see private AI chats.\n\nRecent messages from this shared chat (context only; all members can already see them):\n" + (sharedChatContext || "No recent chat messages.")
            : "You are GitMessage Private AI. This conversation is private to the signed-in user. Be useful, direct, and practical. Never imply that other GitMessage users can see this history." },
          ...history,
        ],
        temperature: 0.6,
      }),
    });
    const completionJson = await completion.json();
    if (!completion.ok) throw new Error(completionJson.error?.message || "AI provider request failed.");
    const answer = completionJson.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("The AI returned an empty response.");

    const table = scope === "shared" ? "gitmessage_shared_ai_messages" : "gitmessage_private_ai_messages";
    const assistantRow = scope === "shared"
      ? { conversation_id: conversationId, user_id: null, role: "assistant", content: answer }
      : { user_id: user.id, role: "assistant", content: answer };
    const { data: saved, error: saveError } = await admin.from(table).insert(assistantRow).select("id,role,content,created_at").single();
    if (saveError) throw saveError;
    return Response.json({ message: saved }, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed.";
    return Response.json({ error: message }, { status: 500, headers: cors });
  }
});
