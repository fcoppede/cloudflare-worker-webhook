export default {
  async fetch(req, env) {
    if (req.method !== "POST" || new URL(req.url).pathname !== "/claim") {
      return new Response("Not found", { status: 404 });
    }

    if (!env.SIGNING_KEY) {
      return new Response("Missing signing key", { status: 500 });
    }

    const signatureHeader = req.headers.get("zitadel-signature");
    if (!signatureHeader) {
      console.log("Missing Signature");
      return new Response("Missing signature", { status: 400 });
    }

    const rawBody = await req.text();

    const elements = signatureHeader.split(",");
    const timestamp = elements.find(e => e.startsWith("t="))?.split("=")[1];
    const signature = elements.find(e => e.startsWith("v1="))?.split("=")[1];

    if (!timestamp || !signature) {
      console.log("Malformed signature header");
      return new Response("Malformed signature header", { status: 400 });
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.SIGNING_KEY),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));

    const hmac = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    if (hmac !== signature) {
      console.log("Invalid Signature");
      console.log("Signature received: ", signatureHeader);
      console.log("Signing key: ", env.SIGNING_KEY);
      console.log("Computed signature: ", hmac);
      return new Response("Invalid signature", { status: 400 });
    }

    const jsonBody = JSON.parse(rawBody);

    console.log('Received body:');
    console.log(JSON.stringify(jsonBody));

    const response = {
      "append_claims": [
        {
          "key": "group",
          "value": "ADMIN"
        }
      ]
    };


    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
};
