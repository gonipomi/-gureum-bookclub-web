// GitHub Actions가 매시간 호출하는 엔드포인트. GAS의 ScriptApp 시간 트리거를 대신한다
// (Supabase 무료 티어에는 pg_cron이 없어서, DB 안에서 스스로 스케줄링할 방법이 없다).
// 실제 판단(누구에게 보낼지, 무슨 내용인지)은 전부 run_hourly_notification_check() SQL 함수가 하고,
// 이 함수는 그걸 부를 트리거 역할만 한다.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error } = await supabase.rpc("run_hourly_notification_check");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response("ok");
});
