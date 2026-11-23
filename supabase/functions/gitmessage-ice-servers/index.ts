import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const apiKey = Deno.env.get("TWILIO_API_KEY");
  const apiSecret = Deno.env.get("TWILIO_API_SECRET");
  if (!accountSid || !apiKey || !apiSecret) {
    return new Response(JSON.stringify({ error: "TURN credentials are not configured on the server." }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const credentials = btoa(`${apiKey}:${apiSecret}`);
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Ttl: "3600" }),
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      console.error("Twilio TURN token request failed:", response.status, detail.slice(0, 500));
      return new Response(JSON.stringify({ error: "Could not obtain call relay credentials." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = await response.json();
    if (!Array.isArray(token.ice_servers) || token.ice_servers.length === 0) {
      throw new Error("Twilio returned no ICE servers.");
    }
    return new Response(JSON.stringify({ iceServers: token.ice_servers, expiresIn: 3600 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("TURN credential error:", error);
    return new Response(JSON.stringify({ error: "Call relay credentials are temporarily unavailable." }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
