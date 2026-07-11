// 카카오 책 검색 API를 대신 호출해주는 Edge Function.
// 카카오 REST API 키를 클라이언트에 노출하지 않으려고 서버(Edge Function)를 거친다 —
// 예전 GAS의 searchKakaoBooks()/getKakaoKey_()와 같은 역할.
//
// 배포 전에 시크릿을 등록해야 한다:
//   supabase secrets set KAKAO_REST_API_KEY=발급받은_키

const KAKAO_KEY = Deno.env.get('KAKAO_REST_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!KAKAO_KEY) {
      throw new Error('카카오 API 키가 설정되지 않았어요. supabase secrets set KAKAO_REST_API_KEY=... 를 실행해주세요.');
    }

    const { query } = await req.json();
    const q = (query || '').trim();
    if (!q) return jsonResponse([]);

    const url = 'https://dapi.kakao.com/v3/search/book?query=' + encodeURIComponent(q) + '&size=10';
    const res = await fetch(url, { headers: { Authorization: 'KakaoAK ' + KAKAO_KEY } });

    if (!res.ok) {
      let msg = '카카오 API 호출 실패 (코드 ' + res.status + ')';
      try {
        const errBody = await res.json();
        if (errBody.message) msg += ': ' + errBody.message;
      } catch (_e) { /* 무시 */ }
      throw new Error(msg);
    }

    const data = await res.json();
    const items = data.documents || [];
    // isbn 필드는 "isbn10 isbn13" 형태로 공백 구분되어 옴. 13자리를 우선 사용.
    const results = items.map((it: any) => {
      const isbnParts = (it.isbn || '').split(' ').filter((s: string) => s.length > 0);
      const isbn13 = isbnParts.find((s: string) => s.length === 13) || isbnParts[isbnParts.length - 1] || '';
      return {
        title: it.title || '',
        author: (it.authors || []).join(', '),
        publisher: it.publisher || '',
        pubDate: (it.datetime || '').slice(0, 10),
        isbn13,
        cover: it.thumbnail || '',
        description: it.contents || '',
        itemId: isbn13 || it.url || '',
      };
    });

    return jsonResponse(results);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
