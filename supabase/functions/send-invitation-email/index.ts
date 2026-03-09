import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "re_i2uke9rf_GacGyc1vHoPnuZNqdyScsGkR";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitationPayload {
  to: string;
  customerName: string;
  inviteLink: string;
  invitedBy?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, customerName, inviteLink, invitedBy } =
      (await req.json()) as InvitationPayload;

    if (!to || !customerName || !inviteLink) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, customerName, inviteLink" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f7f4;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#d4a017 0%,#b8860b 100%);padding:32px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">RW Pharma</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Portail Client</p>
    </div>
    <div style="padding:32px 28px;">
      <h2 style="margin:0 0 8px;font-size:18px;color:#1a1a1a;font-weight:600;">Invitation au portail</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">
        Vous avez ete invite a rejoindre le portail client de <strong>${customerName}</strong> sur RW Pharma.
      </p>
      ${invitedBy ? `<p style="margin:0 0 20px;font-size:13px;color:#888;">Invite par : ${invitedBy}</p>` : ""}
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">Ce portail vous permet de :</p>
      <ul style="margin:0 0 24px;padding-left:20px;font-size:13px;color:#555;line-height:1.8;">
        <li>Suivre vos commandes mensuelles</li>
        <li>Confirmer ou refuser vos allocations</li>
        <li>Acceder au stock disponible</li>
        <li>Gerer vos documents reglementaires</li>
      </ul>
      <div style="text-align:center;margin:28px 0;">
        <a href="${inviteLink}" style="display:inline-block;background:#d4a017;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.2px;">Creer mon compte</a>
      </div>
      <p style="margin:24px 0 0;font-size:12px;color:#999;line-height:1.6;">Ce lien est valable 7 jours. Si vous n'avez pas demande cette invitation, ignorez cet email.</p>
      <div style="margin-top:20px;padding:12px 16px;background:#f8f7f4;border-radius:8px;word-break:break-all;">
        <p style="margin:0;font-size:11px;color:#999;">Lien direct :</p>
        <p style="margin:4px 0 0;font-size:12px;color:#666;">${inviteLink}</p>
      </div>
    </div>
    <div style="padding:16px 28px;background:#fafaf8;border-top:1px solid #eee;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">RW Pharma &mdash; Courtier en medicaments</p>
    </div>
  </div>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "RW Pharma <onboarding@resend.dev>",
        to: [to],
        subject: `${customerName} \u2014 Invitation au portail RW Pharma`,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend error:", data);
      return new Response(
        JSON.stringify({ error: "Email send failed", details: data }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Function error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
