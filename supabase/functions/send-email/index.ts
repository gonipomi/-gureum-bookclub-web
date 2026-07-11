// Gmail SMTP로 메일 한 통을 보내는 범용 발신 함수.
// Postgres 쪽 notify_send_email_()이 pg_net.http_post로 이 함수를 호출한다
// (즉시 알림 6종 + 매시간 다이제스트가 전부 여기를 거쳐 나간다).
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }

  let payload: { to?: string[]; subject?: string; body?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const { to, subject, body } = payload;
  if (!Array.isArray(to) || to.length === 0 || !subject || !body) {
    return new Response("bad request", { status: 400 });
  }

  const gmailUser = Deno.env.get("GMAIL_USER")!;
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: gmailUser, password: Deno.env.get("GMAIL_APP_PASSWORD")! },
    },
  });

  try {
    await client.send({ from: gmailUser, to, subject, content: body });
  } catch (err) {
    return new Response(`send failed: ${err}`, { status: 500 });
  } finally {
    await client.close();
  }

  return new Response("ok");
});
