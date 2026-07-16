// Gmail SMTP로 메일 한 통을 보내는 범용 발신 함수.
// Postgres 쪽 notify_send_email_()이 pg_net.http_post로 이 함수를 호출한다
// (즉시 알림 6종 + 매시간 다이제스트가 전부 여기를 거쳐 나간다).
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// denomailer의 헤더 인코더(quotedPrintableEncodeInline)가 본문용 quoted-printable
// 인코더를 그대로 재사용하는 바람에, 인코딩된 텍스트가 74자를 넘으면(한글 8자 정도면
// 바로 넘음) 줄바꿈(=\r\n)을 인코딩된 단어 "안"에 그대로 끼워 넣는다. RFC 2047 인코디드
// 워드는 줄바꿈을 포함할 수 없어서, 메일 클라이언트가 디코딩을 포기하고 "=EC=95=88"
// 같은 이스케이프를 그대로 보여준다 — 제목이 깨져서 오는 원인이 이거였다.
// 그래서 제목만 직접, 여러 개의 짧은(줄바꿈 없는) 인코디드 워드로 나눠 인코딩한다.
function encodeSubjectHeader(subject: string): string {
  if (!/[^\x00-\x7f]/.test(subject)) return subject;

  const encoder = new TextEncoder();
  const units = Array.from(subject).map((ch) => {
    const bytes = encoder.encode(ch);
    if (bytes.length === 1) {
      const code = bytes[0];
      if (code === 0x20) return "_"; // space -> underscore (Q-encoding 규칙)
      if (code >= 0x21 && code <= 0x7e && code !== 0x3d && code !== 0x3f && code !== 0x5f) {
        return ch;
      }
    }
    return Array.from(bytes).map((b) => "=" + b.toString(16).toUpperCase().padStart(2, "0")).join("");
  });

  // RFC 2047 인코디드 워드는 최대 75자(래퍼 포함)라 60자 선에서 자른다. 한 글자의
  // 바이트 이스케이프(예: 한 음절 = "=XX=XX=XX")는 절대 쪼개지 않는다.
  const chunks: string[] = [];
  let current = "";
  for (const u of units) {
    if (current.length + u.length > 60) {
      chunks.push(current);
      current = u;
    } else {
      current += u;
    }
  }
  if (current) chunks.push(current);

  // 맨 앞 공백 한 칸: denomailer의 quotedPrintableEncodeInline은 "=?"로 시작하는
  // 문자열을 "이미 인코딩됐어도" 다시 인코딩해버려서, 우리가 정성껏 만든 결과물이
  // 그 함수를 한 번 더 통과하면 도로 깨진다. 공백으로 시작하게 해서 그 재인코딩을
  // 피한다(전체가 ASCII라 다른 조건도 안 걸림 — 안 걸리는 걸 확인했다).
  return " " + chunks.map((c) => `=?utf-8?Q?${c}?=`).join(" ");
}

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
    await client.send({ from: gmailUser, to, subject: encodeSubjectHeader(subject), content: body });
  } catch (err) {
    return new Response(`send failed: ${err}`, { status: 500 });
  } finally {
    await client.close();
  }

  return new Response("ok");
});
