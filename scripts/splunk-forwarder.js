export default {
    async fetch(req, env) {
        const url = new URL(req.url);

        // --- Validate endpoint ---
        if (req.method !== "POST" || url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        // --- Validate env vars ---
        const { SIGNING_KEY, SPLUNK_URL, SPLUNK_TOKEN } = env;
        if (!SIGNING_KEY || !SPLUNK_URL || !SPLUNK_TOKEN) {
            console.error("[Init] Missing environment variables");
            return new Response("Missing configuration", { status: 500 });
        }

        // --- Validate signature header ---
        const signatureHeader = req.headers.get("zitadel-signature");
        if (!signatureHeader) {
            console.warn("[Verify] Missing signature header");
            return new Response("Missing signature", { status: 400 });
        }

        // --- Read body ---
        const rawBody = await req.text();

        // --- Verify signature ---
        const isValid = await verifySignature(signatureHeader, rawBody, SIGNING_KEY);
        if (!isValid) {
            console.warn("[Verify] Invalid signature");
            return new Response("Invalid signature", { status: 400 });
        }

        // --- Parse JSON ---
        let jsonBody;
        try {
            jsonBody = JSON.parse(rawBody);
        } catch {
            console.error("[Parse] Invalid JSON");
            return new Response("Invalid JSON", { status: 400 });
        }

        console.log("[Input] Received Zitadel event:", JSON.stringify(jsonBody));

        // --- Forward to Splunk ---
        try {
            const forwardRes = await sendToSplunk(jsonBody, SPLUNK_URL, SPLUNK_TOKEN);
            console.log(`[Forward] Sent to Splunk: ${forwardRes.status}`);
        } catch (err) {
            console.error("[Forward] Failed to send to Splunk:", err);
            // Still return 200 to Zitadel — we don’t want retries to pile up
        }

        // --- Respond to Zitadel ---
        return new Response("Event processed", { status: 200 });
    },
};

// --- Verify Zitadel signature ---
async function verifySignature(signatureHeader, rawBody, signingKey) {
    const parts = signatureHeader.split(",");
    const timestamp = parts.find(p => p.startsWith("t="))?.split("=")[1];
    const signature = parts.find(p => p.startsWith("v1="))?.split("=")[1];
    if (!timestamp || !signature) return false;

    const signedPayload = `${timestamp}.${rawBody}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(signingKey),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
    const computedSignature = Array.from(new Uint8Array(sigBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

    return computedSignature === signature;
}

// --- Send data to Splunk via HEC ---
async function sendToSplunk(data, url, token) {
    const endpoint = `${url}/services/collector/event`;
    console.log("[Forward] Sending to:", endpoint);

    let res;
    try {
        res = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Authorization": `Splunk ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ event: data }),
        });
    } catch (err) {
        console.error("[Forward] Network error:", err);
        throw err;
    }

    const text = await res.text(); // always read body for more info
    if (!res.ok) {
        console.error(`[Forward] Splunk returned HTTP ${res.status}`);
        console.error(`[Forward] Response body: ${text}`);
        throw new Error(`Splunk returned ${res.status}`);
    }

    console.log("[Forward] Successfully sent to Splunk, response:", text);
    return text;
}

