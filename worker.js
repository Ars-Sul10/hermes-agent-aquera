export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, x-cid, x-api-key",
        },
      });
    }

    // 2. Health check endpoint directly on Worker
    if (url.pathname === "/api/v1/health/edge") {
      return new Response(JSON.stringify({
        status: "healthy",
        edge: "cloudflare-workers-kv",
        kv_bound: Boolean(env.AQUERA_KV),
        timestamp: new Date().toISOString()
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 3. Cache-First Endpoint: Lookup User via Phone Number
    if (url.pathname === "/api/v1/user-context") {
      const phone = url.searchParams.get("phone") || url.searchParams.get("phone_number") || url.searchParams.get("sender_phone");

      // Check Cloudflare KV Cache
      if (phone && env.AQUERA_KV) {
        try {
          const cachedUser = await env.AQUERA_KV.get(`phone:${phone}`, "json");
          if (cachedUser) {
            return new Response(JSON.stringify({
              success: true,
              source: "cloudflare_kv_cache",
              user_context: cachedUser
            }), {
              headers: {
                "Content-Type": "application/json",
                "X-Cache": "HIT-KV",
                "Access-Control-Allow-Origin": "*"
              }
            });
          }
        } catch (e) {
          console.error("KV read error:", e);
        }
      }

      // Fallback to origin Aquera API on Vercel
      const targetUrl = `https://aquera.id${url.pathname}${url.search}`;
      const originRes = await fetch(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined
      });

      // Save to KV on success
      if (phone && env.AQUERA_KV && originRes.ok) {
        try {
          const data = await originRes.clone().json();
          if (data.success && data.user_context) {
            await env.AQUERA_KV.put(`phone:${phone}`, JSON.stringify(data.user_context), { expirationTtl: 3600 });
          }
        } catch (e) {
          console.error("KV write error:", e);
        }
      }

      return originRes;
    }

    // 4. Cache-First Endpoint: Lookup WhatsApp Group CID
    if (url.pathname === "/api/v1/whatsapp-groups") {
      const groupJid = url.searchParams.get("group_jid");

      if (groupJid && env.AQUERA_KV && request.method === "GET") {
        try {
          const cachedGroup = await env.AQUERA_KV.get(`group:${groupJid}`, "json");
          if (cachedGroup) {
            return new Response(JSON.stringify({
              success: true,
              source: "cloudflare_kv_cache",
              data: cachedGroup
            }), {
              headers: {
                "Content-Type": "application/json",
                "X-Cache": "HIT-KV",
                "Access-Control-Allow-Origin": "*"
              }
            });
          }
        } catch (e) {
          console.error("KV group read error:", e);
        }
      }

      const targetUrl = `https://aquera.id${url.pathname}${url.search}`;
      const originRes = await fetch(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined
      });

      if (groupJid && env.AQUERA_KV && originRes.ok && request.method === "GET") {
        try {
          const data = await originRes.clone().json();
          if (data.success && data.data) {
            await env.AQUERA_KV.put(`group:${groupJid}`, JSON.stringify(data.data), { expirationTtl: 86400 });
          }
        } catch (e) {
          console.error("KV group write error:", e);
        }
      }

      return originRes;
    }

    // 5. Invalidate Group Cache on Pair Link
    if (url.pathname === "/api/v1/whatsapp/link" && request.method === "POST") {
      const targetUrl = `https://aquera.id${url.pathname}${url.search}`;
      const originRes = await fetch(targetUrl, {
        method: "POST",
        headers: request.headers,
        body: request.body
      });

      if (env.AQUERA_KV && originRes.ok) {
        try {
          const data = await originRes.clone().json();
          if (data.group_jid) {
            await env.AQUERA_KV.delete(`group:${data.group_jid}`);
          }
        } catch (e) {
          console.error("KV delete error:", e);
        }
      }

      return originRes;
    }

    // 6. Proxy all other endpoints directly to origin Aquera API
    const targetUrl = `https://aquera.id${url.pathname}${url.search}`;
    return fetch(targetUrl, request);
  }
};
