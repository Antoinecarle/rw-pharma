import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreatePortalUserPayload {
  email: string;
  password: string;
  invitation_token: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password, invitation_token } =
      (await req.json()) as CreatePortalUserPayload;

    if (!email || !password || !invitation_token) {
      return new Response(
        JSON.stringify({
          error:
            "Missing required fields: email, password, invitation_token",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create admin Supabase client with service_role key
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Validate the invitation
    const { data: invitation, error: invError } = await supabaseAdmin
      .from("customer_invitations")
      .select("*, customers(name)")
      .eq("token", invitation_token)
      .eq("status", "pending")
      .maybeSingle();

    if (invError || !invitation) {
      return new Response(
        JSON.stringify({ error: "Invitation invalide ou expiree" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Cette invitation a expire" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (invitation.email !== email) {
      return new Response(
        JSON.stringify({
          error: "Email ne correspond pas a l'invitation",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Create auth user with auto-confirmed email (admin API)
    const { data: userData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createError) {
      // If user already exists but unconfirmed, try to update and confirm
      if (createError.message?.includes("already been registered")) {
        const {
          data: { users },
        } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = users?.find((u: any) => u.email === email);

        if (existingUser && !existingUser.email_confirmed_at) {
          const { error: updateError } =
            await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
              password,
              email_confirm: true,
            });
          if (updateError) throw updateError;

          // Check if already linked to customer_users
          const { data: existingLink } = await supabaseAdmin
            .from("customer_users")
            .select("id")
            .eq("auth_user_id", existingUser.id)
            .maybeSingle();

          if (!existingLink) {
            const { error: linkError } = await supabaseAdmin
              .from("customer_users")
              .insert({
                auth_user_id: existingUser.id,
                customer_id: invitation.customer_id,
                role: invitation.role || "viewer",
                email,
              });
            if (linkError) throw linkError;
          }

          // Mark invitation accepted
          await supabaseAdmin
            .from("customer_invitations")
            .update({
              status: "accepted",
              accepted_at: new Date().toISOString(),
            })
            .eq("id", invitation.id);

          return new Response(
            JSON.stringify({
              success: true,
              user_id: existingUser.id,
              recovered: true,
            }),
            {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }
      }
      throw createError;
    }

    if (!userData.user) throw new Error("User creation failed");

    // 3. Link to customer
    const { error: linkError } = await supabaseAdmin
      .from("customer_users")
      .insert({
        auth_user_id: userData.user.id,
        customer_id: invitation.customer_id,
        role: invitation.role || "viewer",
        email,
      });
    if (linkError) throw linkError;

    // 4. Mark invitation as accepted
    await supabaseAdmin
      .from("customer_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    return new Response(
      JSON.stringify({ success: true, user_id: userData.user.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
