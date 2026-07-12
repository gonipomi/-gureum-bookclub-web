// ============ Supabase 연결 + 인증/그룹 부트스트랩 ============
// client.js(예전 Client.html 로직을 거의 그대로 옮긴 파일)는 이 파일이 만들어주는
// window.callServer / window.__CURRENT_PROFILE_ID__ / window.__mountApp__ 등에 의존한다.
// 역할 분담: 이 파일 = 로그인·그룹 선택(신규), client.js = 서고/책 렌더링(기존 그대로).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

const authGateEl = document.getElementById('authGate');
const topbarEl = document.getElementById('topbar');
const mainEl = document.getElementById('main');
const fabEl = document.getElementById('fabBtn');

function showAuthGate(html) {
    topbarEl.style.display = 'none';
    mainEl.style.display = 'none';
    fabEl.style.display = 'none';
    authGateEl.style.display = 'flex';
    authGateEl.innerHTML = html;
}

function showApp() {
    authGateEl.style.display = 'none';
    topbarEl.style.display = '';
    mainEl.style.display = '';
}

function toast(msg, isError) {
    // client.js의 showToast는 이 시점엔 아직 안 붙어있을 수 있어 authGate 화면에서는 alert 대신 간단히 표기
    var box = document.getElementById('authGateMsg');
    if (box) {
        box.textContent = msg;
        box.style.color = isError ? 'var(--stamp)' : 'var(--line-green)';
    }
}

// ---------- 1) 이메일 + 비밀번호 로그인 ----------
// 매직링크는 매번 메일함 왔다갔다 해야 해서 번거롭다는 피드백으로 비밀번호 방식으로 바꿨다.
// 이 앱은 보안이 중요한 곳이 아니라서(예전 PIN 시스템과 같은 신뢰 수준), 비밀번호도
// 생일·전화번호 뒷자리처럼 외우기 쉬운 걸 쓰라고 안내한다.
function renderSignInScreen() {
    showAuthGate(
        '<div class="field" style="max-width:320px;margin:40px auto 0;">' +
        '<h3 style="margin-bottom:6px;">구름멍멍교환독서클럽</h3>' +
        '<p style="font-size:12.5px;color:var(--pencil);margin-bottom:16px;">이메일과 4자리 코드로 로그인해요.</p>' +
        '<label>이메일</label>' +
        '<input type="email" id="authEmail" placeholder="you@example.com" autocomplete="email">' +
        '<label style="margin-top:10px;">4자리 코드</label>' +
        '<input type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="authPassword" placeholder="••••" autocomplete="current-password" style="text-align:center;font-size:24px;letter-spacing:8px;font-family:\'JetBrains Mono\',monospace;">' +
        '<p style="font-size:11px;color:var(--pencil);margin-top:4px;line-height:1.5;">' +
        '이 앱은 보안이 중요한 곳이 아니니, 생년월일 뒷자리나 전화번호 뒷자리처럼 외우기 쉬운 숫자 4개로 정해도 괜찮아요.' +
        '</p>' +
        '<button class="btn-primary" id="signInBtn" style="margin-top:10px;">로그인</button>' +
        '<button class="btn-secondary" id="signUpBtn" style="margin-top:8px;">처음이에요 (가입하기)</button>' +
        '<p id="authGateMsg" style="font-size:12.5px;margin-top:10px;min-height:1.4em;"></p>' +
        '<details style="margin-top:18px;font-size:12px;color:var(--pencil);line-height:1.6;">' +
        '<summary style="cursor:pointer;color:var(--ink-soft);">📱 홈 화면에 앱처럼 추가하기</summary>' +
        '<p style="margin-top:8px;"><b>아이폰(사파리)</b><br>공유 버튼(⬆️) 누르고 &rarr; "홈 화면에 추가"</p>' +
        '<p style="margin-top:8px;"><b>안드로이드(크롬)</b><br>오른쪽 위 점 세 개(⋮) 메뉴 &rarr; "홈 화면에 추가" 또는 "앱 설치"</p>' +
        '</details>' +
        '</div>'
    );
    function readCreds() {
        return {
            email: document.getElementById('authEmail').value.trim(),
            pin: document.getElementById('authPassword').value.trim()
        };
    }
    function validCreds(email, pin) {
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            toast('올바른 이메일 주소를 입력해주세요', true);
            return false;
        }
        if (!/^\d{4}$/.test(pin)) {
            toast('코드는 숫자 4자리로 입력해주세요', true);
            return false;
        }
        return true;
    }
    // Supabase 관리형 서비스는 비밀번호 최소 길이를 6자 밑으로 못 낮춘다(대시보드에서도 안 됨).
    // 그래서 사용자에게는 4자리 코드만 보여주고, 실제로 Supabase에 보내는 값은 고정 접두어를
    // 붙여 6자 이상으로 맞춘다 — 보안용이 아니라 그냥 글자 수를 맞추기 위한 것뿐이다.
    function pinToPassword(pin) {
        return 'gm-' + pin;
    }
    document.getElementById('signInBtn').onclick = async function (e) {
        var creds = readCreds();
        if (!validCreds(creds.email, creds.pin)) return;
        e.target.disabled = true;
        e.target.textContent = '로그인하는 중...';
        try {
            const { error } = await supabase.auth.signInWithPassword({ email: creds.email, password: pinToPassword(creds.pin) });
            if (error) throw error;
            // 성공하면 onAuthStateChange(SIGNED_IN)가 알아서 다음 화면으로 넘겨준다
        } catch (err) {
            toast(err.message || '로그인에 실패했어요', true);
            e.target.disabled = false;
            e.target.textContent = '로그인';
        }
    };
    document.getElementById('signUpBtn').onclick = async function (e) {
        var creds = readCreds();
        if (!validCreds(creds.email, creds.pin)) return;
        e.target.disabled = true;
        e.target.textContent = '가입하는 중...';
        try {
            const { error } = await supabase.auth.signUp({ email: creds.email, password: pinToPassword(creds.pin) });
            if (error) throw error;
            // 성공하면 onAuthStateChange(SIGNED_IN)가 알아서 다음 화면으로 넘겨준다
        } catch (err) {
            toast(err.message || '가입에 실패했어요', true);
            e.target.disabled = false;
            e.target.textContent = '처음이에요 (가입하기)';
        }
    };
}

// ---------- 2) 그룹 만들기 / 초대코드로 참가 ----------
function renderGroupGateScreen() {
    showAuthGate(
        '<div class="field" style="max-width:320px;margin:40px auto 0;">' +
        '<h3 style="margin-bottom:6px;">그룹이 아직 없어요</h3>' +
        '<p style="font-size:12.5px;color:var(--pencil);margin-bottom:16px;">새 독서모임을 만들거나, 초대 코드로 기존 그룹에 참가하세요.</p>' +
        '<label>화면에 보일 내 이름</label>' +
        '<input type="text" id="gateDisplayName" placeholder="예: 박구름" maxlength="12" style="margin-bottom:14px;">' +
        '<label>새 그룹 이름</label>' +
        '<input type="text" id="gateGroupName" placeholder="예: 구름멍멍교환독서클럽" maxlength="30">' +
        '<button class="btn-primary" id="createGroupBtn" style="margin-top:8px;">그룹 만들기</button>' +
        '<div style="height:1px;background:var(--rule,rgba(0,0,0,0.1));margin:18px 0;"></div>' +
        '<label>초대 코드</label>' +
        '<input type="text" id="gateInviteCode" placeholder="예: A7K92Q" maxlength="6" style="text-transform:uppercase;letter-spacing:2px;">' +
        '<button class="btn-secondary" id="joinGroupBtn" style="margin-top:8px;">코드로 참가하기</button>' +
        '<p id="authGateMsg" style="font-size:12.5px;margin-top:10px;min-height:1.4em;"></p>' +
        '</div>'
    );
    document.getElementById('createGroupBtn').onclick = async function (e) {
        var name = document.getElementById('gateGroupName').value.trim();
        var displayName = document.getElementById('gateDisplayName').value.trim();
        if (!name) { toast('그룹 이름을 입력해주세요', true); return; }
        e.target.disabled = true;
        try {
            const { data, error } = await supabase.rpc('create_group', { p_name: name, p_display_name: displayName });
            if (error) throw error;
            const row = Array.isArray(data) ? data[0] : data;
            toast('그룹을 만들었어요! 초대 코드: ' + row.invite_code);
            await bootstrapAfterAuth(row.group_id);
        } catch (err) {
            if (await handleStaleSessionError_(err)) return;
            toast(err.message || '그룹 생성에 실패했어요', true);
            e.target.disabled = false;
        }
    };
    document.getElementById('joinGroupBtn').onclick = async function (e) {
        var code = document.getElementById('gateInviteCode').value.trim();
        var displayName = document.getElementById('gateDisplayName').value.trim();
        if (!code) { toast('초대 코드를 입력해주세요', true); return; }
        e.target.disabled = true;
        try {
            const { data, error } = await supabase.rpc('join_group_with_code', { p_code: code, p_display_name: displayName });
            if (error) throw error;
            const row = Array.isArray(data) ? data[0] : data;
            await bootstrapAfterAuth(row.group_id);
        } catch (err) {
            if (await handleStaleSessionError_(err)) return;
            toast(err.message || '참가에 실패했어요', true);
            e.target.disabled = false;
        }
    };
}

// 브라우저에 남아있는 로그인 세션이 이미 지워진 계정을 가리키고 있으면(다른 탭에서
// 테스트용으로 계정을 지웠을 때 등) profiles/memberships에 FK 위반이 난다. 이런 경우
// 조용히 로그아웃시키고 로그인 화면부터 다시 시작하게 한다.
async function handleStaleSessionError_(err) {
    var isForeignKeyError = err && (err.code === '23503' || /foreign key constraint/i.test(err.message || ''));
    if (!isForeignKeyError) return false;
    await supabase.auth.signOut();
    window.__CURRENT_GROUP_ID__ = null;
    window.__CURRENT_PROFILE_ID__ = null;
    renderSignInScreen();
    toast('로그인 세션이 오래돼서 다시 로그인해주세요.', true);
    return true;
}

// ---------- 3) 그룹 선택 완료 → client.js(포팅된 기존 화면) 부팅 ----------
const LAST_GROUP_KEY = 'gureumBookclub.lastGroupId';

async function selectGroup(groupId, memberships) {
    var mine = memberships.find(function (m) { return m.group_id === groupId; });
    if (!mine) { toast('그 그룹의 멤버가 아니에요', true); return; }
    const { data: { user } } = await supabase.auth.getUser();
    window.__CURRENT_GROUP_ID__ = groupId;
    var groupNameEl = document.getElementById('currentGroupName');
    if (groupNameEl) groupNameEl.textContent = mine.group_name;
    // 책 소유/대여 상태를 그룹과 무관하게 "한 사람 것"으로 공유하기로 하면서, 책 관련
    // memberId는 전부 membership id 대신 profile id를 쓰도록 바뀌었다 (get_state의
    // members[].id도 profile id로 나간다. client.js는 이 값을 그냥 opaque id로만 쓰기 때문에
    // 수정 없이 그대로 동작한다).
    window.__CURRENT_PROFILE_ID__ = user.id;
    window.__MY_MEMBERSHIPS__ = memberships;
    try { localStorage.setItem(LAST_GROUP_KEY, groupId); } catch (e) { /* ignore */ }

    showApp();
    if (typeof window.__mountApp__ === 'function') {
        await window.__mountApp__();
    }
}

async function bootstrapAfterAuth(preferredGroupId) {
    const { data: memberships, error } = await supabase.rpc('my_memberships');
    if (error) { toast(error.message || '그룹 정보를 불러오지 못했어요', true); return; }
    window.__MY_MEMBERSHIPS__ = memberships || [];

    if (!memberships || memberships.length === 0) {
        renderGroupGateScreen();
        return;
    }

    var target = preferredGroupId;
    if (!target) {
        var last = null;
        try { last = localStorage.getItem(LAST_GROUP_KEY); } catch (e) { /* ignore */ }
        target = memberships.some(function (m) { return m.group_id === last; }) ? last : memberships[0].group_id;
    }
    await selectGroup(target, memberships);
}

// ---------- 4) client.js가 호출하는 그룹 스위처/초대코드/로그아웃 훅 ----------
window.__switchGroup__ = function (groupId) {
    bootstrapAfterAuth(groupId);
};
window.__promptJoinGroup__ = function () {
    renderGroupGateScreen();
};
window.__showInviteCode__ = async function () {
    var groupId = window.__CURRENT_GROUP_ID__;
    var mine = (window.__MY_MEMBERSHIPS__ || []).find(function (m) { return m.group_id === groupId; });
    const { data, error } = await supabase.from('groups').select('invite_code').eq('id', groupId).single();
    if (error) { alert('초대 코드를 불러오지 못했어요: ' + error.message); return; }

    // alert()은 브라우저마다 텍스트 선택/복사가 안 되는 경우가 많아서, 복사 버튼이 있는
    // 모달로 대체한다 (client.js의 openModal과 같은 #modalSheet/#modalBackdrop을 그냥 직접 씀 —
    // client.js 안쪽 함수라 여기서 못 불러서, 같은 DOM을 공유하는 식으로 처리).
    var sheet = document.getElementById('modalSheet');
    var backdrop = document.getElementById('modalBackdrop');
    sheet.innerHTML =
        '<h3>' + esc(mine ? mine.group_name : '초대 코드') + '</h3>' +
        '<p style="font-size:12.5px;color:var(--pencil);margin-bottom:14px;">이 코드를 공유하면 그룹에 참가할 수 있어요.</p>' +
        '<div class="field"><input type="text" id="inviteCodeInput" readonly value="' + esc(data.invite_code) + '" style="font-size:20px;font-weight:700;text-align:center;letter-spacing:2px;"></div>' +
        '<button class="btn-primary" id="copyInviteCodeBtn">복사하기</button>' +
        '<button class="close-x" id="modalCloseX">✕</button>';
    backdrop.classList.add('open');

    function close() { backdrop.classList.remove('open'); }
    document.getElementById('modalCloseX').onclick = close;
    backdrop.onclick = function (e) { if (e.target.id === 'modalBackdrop') close(); };

    var copyBtn = document.getElementById('copyInviteCodeBtn');
    copyBtn.onclick = async function () {
        var input = document.getElementById('inviteCodeInput');
        try {
            await navigator.clipboard.writeText(data.invite_code);
        } catch (e) {
            input.select();
            document.execCommand('copy');
        }
        copyBtn.textContent = '복사됐어요!';
        setTimeout(function () { copyBtn.textContent = '복사하기'; }, 1500);
    };
};
window.__signOut__ = async function () {
    await supabase.auth.signOut();
    window.__CURRENT_GROUP_ID__ = null;
    window.__CURRENT_PROFILE_ID__ = null;
    renderSignInScreen();
};

// 프로필 사진 업로드: 본인 profile 폴더 아래에만 쓸 수 있도록 Storage RLS가 막아준다.
window.__uploadAvatarPhoto__ = async function (file) {
    var profileId = window.__CURRENT_PROFILE_ID__;
    if (!profileId) throw new Error('로그인이 필요해요.');
    var ext = (file.name && file.name.split('.').pop()) || 'jpg';
    var path = profileId + '/' + Date.now() + '.' + ext;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type || 'image/jpeg'
    });
    if (uploadError) throw new Error(uploadError.message || '사진 업로드에 실패했어요');
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
};

// ---------- 5) callServer: client.js가 부르는 서버 함수 이름을 Supabase 호출로 연결 ----------
// Phase 1(getState) + Phase 2(책 CRUD)를 연결한다. 나머지는 다음 단계에서 하나씩 추가.
window.callServer = function callServer(fnName) {
    var args = Array.prototype.slice.call(arguments, 1);
    return dispatchServerCall(fnName, args);
};

async function rpc(name, params) {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw new Error(error.message);
    return JSON.stringify(data);
}

async function dispatchServerCall(fnName, args) {
    const groupId = window.__CURRENT_GROUP_ID__;

    switch (fnName) {
        case 'getState':
            return rpc('get_state', { p_group_id: groupId });

        case 'addBook': {
            var payload = args[0] || {};
            return rpc('add_book', {
                p_group_id: groupId,
                p_title: payload.title,
                p_author: payload.author,
                p_owner_membership_id: payload.ownerId,
                p_status: payload.status,
                p_start_date: payload.startDate,
                p_end_date: payload.endDate,
                p_cover_url: payload.coverUrl,
                p_publisher: payload.publisher,
                p_isbn13: payload.isbn13,
                p_page_count: payload.pageCount,
                p_current_page: payload.currentPage,
                p_external_borrow: !!payload.externalBorrow,
                p_want_to_read: !!payload.wantToRead
            });
        }

        case 'updateBookInfo':
            return rpc('update_book_info', { p_group_id: groupId, p_book_id: args[0], p_title: args[1], p_author: args[2] });

        case 'updateBookCoverInfo':
            return rpc('update_book_cover_info', { p_group_id: groupId, p_book_id: args[0], p_cover_url: args[1], p_publisher: args[2], p_isbn13: args[3] });

        case 'deleteBook':
            return rpc('delete_book', { p_group_id: groupId, p_book_id: args[0], p_requester_id: args[1] });

        case 'assignReader':
            return rpc('assign_reader', { p_group_id: groupId, p_book_id: args[0], p_member_id: args[1], p_start_date: args[2] || null, p_exchange_date: args[3] || null });

        case 'markFinished':
            return rpc('mark_finished', { p_group_id: groupId, p_book_id: args[0], p_requester_id: args[1], p_review: args[2] || null, p_end_date: args[3] || null });

        case 'updateBookProgress':
            return rpc('update_book_progress', { p_group_id: groupId, p_book_id: args[0], p_requester_id: args[1], p_current_page: args[2], p_page_count: args[3] });

        case 'updateReadingStartDate':
            return rpc('update_reading_start_date', { p_group_id: groupId, p_book_id: args[0], p_actor_id: args[1], p_start_date: args[2] });

        case 'updateLastHistoryDates':
            return rpc('update_last_history_dates', { p_group_id: groupId, p_book_id: args[0], p_actor_id: args[1], p_start_date: args[2], p_end_date: args[3] });

        case 'setBookWantToRead':
            return rpc('set_book_want_to_read', { p_group_id: groupId, p_book_id: args[0], p_actor_id: args[1], p_want_to_read: !!args[2] });

        case 'toggleBookHeart':
            return rpc('toggle_book_heart', { p_group_id: groupId, p_book_id: args[0], p_member_id: args[1], p_hearted: !!args[2] });

        case 'toggleBookRecommend':
            return rpc('toggle_book_recommend', { p_group_id: groupId, p_book_id: args[0], p_member_id: args[1], p_recommended: !!args[2], p_comment: args[3] || null });

        case 'searchKakaoBooks': {
            const { data, error } = await supabase.functions.invoke('search-kakao-books', { body: { query: args[0] } });
            if (error) throw new Error(error.message || '카카오 검색에 실패했어요');
            if (data && data.error) throw new Error(data.error);
            return JSON.stringify(data || []);
        }

        // ---- 멤버 프로필 ----
        case 'updateMemberProfile':
            return rpc('update_member_profile', {
                p_group_id: groupId, p_membership_id: args[0], p_name: args[1],
                // args[5]는 그대로 넘긴다 — 빈 문자열('')은 "사진 지우기", null/undefined는 "그대로 두기"라서
                // ||로 합치면 안 됨(빈 문자열도 null로 뭉개져서 삭제가 안 먹음).
                p_color: args[2], p_emoji: args[3], p_bio: args[4], p_photo_url: args[5] === undefined ? null : args[5]
            });
        case 'updateMemberNotify':
            return rpc('update_member_notify', {
                p_group_id: groupId, p_membership_id: args[0], p_email: args[1],
                p_notify_time: args[2], p_notify_days: args[3], p_enabled: !!args[4],
                p_notify_on_comment: args[5] === undefined ? true : !!args[5],
                p_notify_on_heart: args[6] === undefined ? true : !!args[6],
                p_notify_on_recommend: args[7] === undefined ? true : !!args[7]
            });

        // ---- 위시리스트 ("이 책 찾아요") ----
        case 'addWishlistItem': {
            var w = args[0] || {};
            return rpc('add_wishlist_item', {
                p_group_id: groupId,
                p_title: w.title,
                p_author: w.author,
                p_requested_by: w.requestedById,
                p_note: w.note,
                p_cover_url: w.coverUrl,
                p_publisher: w.publisher,
                p_isbn13: w.isbn13,
                p_already_owned: !!w.alreadyOwned
            });
        }
        case 'toggleWishlistOwner':
            return rpc('toggle_wishlist_owner', { p_group_id: groupId, p_wish_id: args[0], p_member_id: args[1], p_has_it: !!args[2] });
        case 'deleteWishlistItem':
            return rpc('delete_wishlist_item', { p_group_id: groupId, p_wish_id: args[0] });

        // ---- 읽기 신청 ----
        case 'requestToReadBook':
            return rpc('request_to_read_book', { p_group_id: groupId, p_book_id: args[0], p_member_id: args[1], p_desired_date: args[2] || null });
        case 'approveReadRequest':
            return rpc('approve_read_request', { p_group_id: groupId, p_book_id: args[0], p_request_id: args[1], p_actor_id: args[2] });
        case 'rejectReadRequest':
            return rpc('reject_read_request', { p_group_id: groupId, p_book_id: args[0], p_request_id: args[1], p_actor_id: args[2] });
        case 'counterReadRequestDate':
            return rpc('counter_read_request_date', { p_group_id: groupId, p_book_id: args[0], p_request_id: args[1], p_owner_id: args[2], p_counter_date: args[3] });

        // ---- 찜 신청 / 대기열 ----
        case 'requestToJoinQueue':
            return rpc('request_to_join_queue', { p_group_id: groupId, p_book_id: args[0], p_member_id: args[1], p_desired_date: args[2] || null });
        case 'acceptQueueRequest':
            return rpc('accept_queue_request', { p_group_id: groupId, p_book_id: args[0], p_request_id: args[1], p_actor_id: args[2] });
        case 'rejectQueueRequest':
            return rpc('reject_queue_request', { p_group_id: groupId, p_book_id: args[0], p_request_id: args[1], p_actor_id: args[2] });
        case 'counterQueueRequestDate':
            return rpc('counter_queue_request_date', { p_group_id: groupId, p_book_id: args[0], p_request_id: args[1], p_reader_id: args[2], p_counter_date: args[3] });
        case 'proposeDateForQueueMember':
            return rpc('propose_date_for_queue_member', { p_group_id: groupId, p_book_id: args[0], p_member_id: args[1], p_reader_id: args[2], p_date: args[3] });
        case 'passToNext':
            return rpc('pass_to_next', { p_group_id: groupId, p_book_id: args[0], p_member_id: args[1], p_requester_id: args[2] });
        case 'confirmPickup':
            return rpc('confirm_pickup', { p_group_id: groupId, p_book_id: args[0], p_actor_id: args[1] });
        case 'confirmReturn':
            return rpc('confirm_return', { p_group_id: groupId, p_book_id: args[0], p_actor_id: args[1] });
        case 'removeFromQueue':
            return rpc('remove_from_queue', { p_group_id: groupId, p_book_id: args[0], p_member_id: args[1], p_requester_id: args[2] });
        case 'setMyQueueDate':
            return rpc('set_my_queue_date', { p_group_id: groupId, p_book_id: args[0], p_member_id: args[1], p_date: args[2] });

        // ---- 책 사진 / 텍스트 메모 / 댓글 ----
        case 'uploadPhoto': {
            var bookUrl = await dataUrlToStorageUrl(args[1], groupId + '/books/' + args[0]);
            return rpc('add_book_photo', { p_group_id: groupId, p_book_id: args[0], p_url: bookUrl, p_caption: args[2], p_author_id: args[3] });
        }
        case 'deletePhoto':
            return rpc('delete_book_photo', { p_group_id: groupId, p_book_id: args[0], p_photo_id: args[1] });
        case 'addTextMemo':
            return rpc('add_book_text_memo', { p_group_id: groupId, p_book_id: args[0], p_author_id: args[1], p_text: args[2] });
        case 'addRecordComment':
            return rpc('add_record_comment', { p_group_id: groupId, p_entity_type: args[0], p_entity_id: args[1], p_photo_id: args[2], p_member_id: args[3], p_text: args[4] });
        case 'toggleRecordItemHeart':
            return rpc('toggle_record_item_heart', { p_group_id: groupId, p_entity_type: args[0], p_entity_id: args[1], p_item_id: args[2], p_parent_photo_id: args[3], p_member_id: args[4], p_liked: args[5] });
        case 'setBookReview':
            return rpc('set_book_review', { p_group_id: groupId, p_book_id: args[0], p_member_id: args[1], p_review: args[2] });

        // ---- 교환일 제안/투표/참석/사진 ----
        case 'proposeExchangeDate':
            return rpc('propose_exchange_date', { p_group_id: groupId, p_member_id: args[0], p_date: args[1], p_book_ids: args[2] || [] });
        case 'voteExchangeProposal':
            return rpc('vote_exchange_proposal', { p_group_id: groupId, p_proposal_id: args[0], p_member_id: args[1], p_vote_on: !!args[2], p_book_ids: args[3] || [] });
        case 'deleteExchangeProposal':
            return rpc('delete_exchange_proposal', { p_group_id: groupId, p_proposal_id: args[0] });
        case 'addExchangeDateComment':
            return rpc('add_exchange_date_comment', { p_group_id: groupId, p_date: args[0], p_member_id: args[1], p_text: args[2] });
        case 'joinExchangeDate':
            return rpc('join_exchange_date', { p_group_id: groupId, p_date: args[0], p_member_id: args[1], p_book_ids: args[2] || [] });
        case 'leaveExchangeDate':
            return rpc('leave_exchange_date', { p_group_id: groupId, p_date: args[0], p_member_id: args[1] });
        case 'removeBookFromExchangeDate':
            return rpc('remove_book_from_exchange_date', { p_group_id: groupId, p_date: args[0], p_book_id: args[1], p_actor_id: args[2] });
        case 'uploadExchangePhoto': {
            var exUrl = await dataUrlToStorageUrl(args[1], groupId + '/exchange/' + args[0]);
            return rpc('add_exchange_photo', { p_group_id: groupId, p_date: args[0], p_url: exUrl, p_caption: args[2], p_author_id: args[3] });
        }
        case 'deleteExchangePhoto':
            return rpc('delete_exchange_photo', { p_group_id: groupId, p_date: args[0], p_photo_id: args[1] });
    }
    throw new Error('아직 이 기능은 새 시스템에 연결되지 않았어요 (' + fnName + ') — 다음 단계에서 추가돼요.');
}

// data:image/jpeg;base64,... 형태의 사진을 Storage에 올리고 공개 URL을 돌려준다.
// (책 상세/교환일 상세의 캔버스 형광펜 편집이 끝난 결과물이 이 형태로 넘어온다.)
async function dataUrlToStorageUrl(dataUrl, pathPrefix) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const path = pathPrefix + '/' + Date.now() + '.jpg';
    const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: blob.type || 'image/jpeg' });
    if (error) throw new Error(error.message || '사진 업로드에 실패했어요');
    const { data } = supabase.storage.from('photos').getPublicUrl(path);
    return data.publicUrl;
}

// ---------- 6) 부팅 ----------
supabase.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_IN') {
        bootstrapAfterAuth();
    } else if (event === 'SIGNED_OUT') {
        renderSignInScreen();
    }
});

(async function boot() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        await bootstrapAfterAuth();
    } else {
        renderSignInScreen();
    }
})();
