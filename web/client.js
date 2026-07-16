
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
(function () {
    // ============ 상태 / 로그인 세션 ============
    var COLORS = ['var(--stamp)', 'var(--line-green)', 'var(--ink-soft)', '#C97A3D', '#7A5C8A', '#3D7A8A', '#8A5C5C', '#5C6A8A'];
    var state = { members: [], books: [], wishlist: [], nextExchangeDate: null, exchangeProposals: [], confirmedExchangeDates: [], resolvedExchangeDates: [] };
    var currentView = 'home';
    var detailBookId = null;
    var detailMemberId = null;
    var recordsCategory = 'feed';
    var recordsScope = 'ours';
    var shelfCategory = 'finished';
    var shelfScope = 'ours';
    var exchangeViewMode = 'list';
    var exchangeCalendarMonthOffset = 0;
    // ---------- 로그인 세션 (Supabase Auth 세션 + 로그인한 사람의 profile id는 app.js가 관리) ----------
    function getLoggedInMemberId() {
        return window.__CURRENT_PROFILE_ID__ || null;
    }
    function setLoggedInMemberId(id) {
        window.__CURRENT_PROFILE_ID__ = id || null;
    }
    function clearLoggedInMemberId() {
        window.__CURRENT_PROFILE_ID__ = null;
    }
    function getLoggedInMember() {
        var id = getLoggedInMemberId();
        return id ? getMember(id) : null;
    }
    /**
     * "나에 대한 행동"을 하기 전에 로그인 여부를 확인한다. 이 앱 화면에 들어와 있다는 것
     * 자체가 이미 Supabase Auth로 인증되고 그룹 멤버십도 선택된 상태라서 거의 항상 즉시
     * 통과한다 (예전의 PIN 로그인 모달은 없어짐 — 세션이 끊긴 드문 경우만 안내한다).
     */
    function requireLogin(callback) {
        var id = getLoggedInMemberId();
        if (id) {
            callback(id);
        } else {
            showToast('로그인 세션이 끊겼어요. 새로고침해주세요.', true);
        }
    }
    var loaded = false;
    function showToast(msg, isError) {
        var t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.toggle('error', !!isError);
        t.classList.add('show');
        setTimeout(function () { return t.classList.remove('show'); }, 2200);
    }
    // ============ 서버 통신 (callServer, refreshState) ============
    // callServer(fnName, ...args)는 app.js가 정의한다 (Supabase RPC 호출로 연결).
    var lastLoadError = null;
    /**
     * getState()가 돌려준(또는 다른 뮤테이션 함수가 이미 함께 돌려준) state JSON 문자열을
     * 파싱해서 전역 state에 반영한다. 뮤테이션 호출 후 이 값을 바로 쓰면 별도로
     * refreshState()를 또 호출해서 서버를 두 번 왕복하지 않아도 된다.
     */
    function applyState(raw) {
        if (!raw || typeof raw !== 'string') {
            throw new Error('서버가 빈 응답을 반환했어요 (state 결과가 비어있음)');
        }
        var result;
        try {
            result = JSON.parse(raw);
        }
        catch (parseErr) {
            throw new Error('서버 응답을 해석하지 못했어요: ' + parseErr.message);
        }
        state = {
            members: Array.isArray(result.members) ? result.members : [],
            books: Array.isArray(result.books) ? result.books : [],
            wishlist: Array.isArray(result.wishlist) ? result.wishlist : [],
            nextExchangeDate: result.nextExchangeDate || null,
            exchangeProposals: Array.isArray(result.exchangeProposals) ? result.exchangeProposals : [],
            confirmedExchangeDates: Array.isArray(result.confirmedExchangeDates) ? result.confirmedExchangeDates : [],
            resolvedExchangeDates: Array.isArray(result.resolvedExchangeDates) ? result.resolvedExchangeDates : []
        };
        lastLoadError = null;
    }
    function refreshState() {
        return __awaiter(this, void 0, void 0, function () {
            var raw, e_1, msg;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, callServer('getState')];
                    case 1:
                        raw = _a.sent();
                        applyState(raw);
                        return [3 /*break*/, 3];
                    case 2:
                        e_1 = _a.sent();
                        msg = (e_1 && (e_1.message || e_1.toString())) || '알 수 없는 오류';
                        lastLoadError = msg;
                        showToast('불러오기 실패: ' + msg, true);
                        console.error('getState 실패:', e_1);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    }
    function renderFatalError() {
        return "\n    <div class=\"empty-state\">\n      <div class=\"stamp-big\" style=\"border-color:var(--stamp);color:var(--stamp);\">LOAD ERROR</div>\n      <p style=\"text-align:left;background:var(--card-bg);border:1px solid var(--stamp);border-radius:8px;padding:12px 14px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--stamp);word-break:break-all;line-height:1.6;\">\n        ".concat(escapeHtml(lastLoadError), "\n      </p>\n      <p style=\"margin-top:14px;\">\uC774 \uD654\uBA74\uC744 \uC2A4\uD06C\uB9B0\uC0F7\uC73C\uB85C \uBCF4\uB0B4\uC8FC\uC2DC\uBA74 \uC6D0\uC778\uC744 \uD655\uC778\uD560 \uC218 \uC788\uC5B4\uC694.</p>\n      <button class=\"btn-primary\" style=\"max-width:200px;margin:18px auto 0;\" id=\"retryLoadBtn\">\uB2E4\uC2DC \uC2DC\uB3C4</button>\n    </div>\n  ");
    }
    // ============ 렌더링 유틸 (escapeHtml, fmtDate 등) ============
    function getMember(id) { return state.members.find(function (m) { return m.id === id; }); }
    function getBook(id) { return state.books.find(function (b) { return b.id === id; }); }
    function bookThumbHtml(b, sizeClass) {
        var url = b.coverUrl || (b.photos && b.photos[0] ? b.photos[0].url : null);
        if (url)
            return "<img src=\"".concat(url, "\">");
        return escapeHtml((b.title || '').slice(0, sizeClass === 'detail' ? 14 : 10));
    }
    function initial(name) { return name ? name.trim().slice(0, 1) : '?'; }
    function avatarStyle(color) { return "background:".concat(color, ";"); }
    // 사진이 있으면 사진을, 없으면 이모지, 그것도 없으면 이름 이니셜을 아바타 내용으로 사용
    function avatarContent(member) {
        if (!member)
            return '?';
        if (member.photoUrl)
            return '<img src="' + member.photoUrl + '" style="width:100%;height:100%;object-fit:cover;display:block;">';
        return member.emoji ? member.emoji : initial(member.name);
    }
    function escapeHtml(str) {
        if (str === null || str === undefined)
            return '';
        var div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }
    // 사진·댓글 좋아요 — books.photos/exchange_proposals.photos 배열 항목(사진·텍스트메모)과
    // 그 안에 중첩된 댓글(photo.comments[])에 공용으로 쓰는 버튼. parentPhotoId가 있으면
    // "그 사진의 댓글"을, 없으면 최상위 항목(사진/텍스트메모) 자체를 좋아요한다.
    function recordHeartBtnHtml_(entityType, entityId, itemId, parentPhotoId, hearts) {
        var myId = getLoggedInMemberId();
        var list = hearts || [];
        var liked = !!(myId && list.indexOf(myId) > -1);
        return '<button class="record-heart-btn' + (liked ? ' liked' : '') + '"'
            + ' data-heart-entity-type="' + entityType + '" data-heart-entity-id="' + escapeHtml(String(entityId)) + '"'
            + ' data-heart-item-id="' + escapeHtml(itemId) + '"'
            + (parentPhotoId ? ' data-heart-parent-photo-id="' + escapeHtml(parentPhotoId) + '"' : '')
            + ' data-heart-liked="' + (liked ? '1' : '0') + '">'
            + (liked ? '❤️' : '🤍') + (list.length ? ' ' + list.length : '') + '</button>';
    }
    function fmtDate(d) {
        if (!d)
            return '';
        try {
            var dt = new Date(d);
            if (isNaN(dt.getTime()))
                return d;
            return "".concat(dt.getMonth() + 1, ".").concat(dt.getDate());
        }
        catch (e) {
            return d;
        }
    }
    function fmtDateFull(d) {
        if (!d)
            return '';
        try {
            var dt = new Date(d);
            if (isNaN(dt.getTime()))
                return d;
            return "".concat(dt.getFullYear(), ".").concat(String(dt.getMonth() + 1).padStart(2, '0'), ".").concat(String(dt.getDate()).padStart(2, '0'));
        }
        catch (e) {
            return d;
        }
    }
    function todayIso() {
        var d = new Date();
        return "".concat(d.getFullYear(), "-").concat(String(d.getMonth() + 1).padStart(2, '0'), "-").concat(String(d.getDate()).padStart(2, '0'));
    }
    function daysUntil(dateStr) {
        if (!dateStr)
            return null;
        var clean = String(dateStr).slice(0, 10);
        var target = new Date(clean + 'T00:00:00');
        if (isNaN(target.getTime()))
            return null;
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var diff = Math.round((target - today) / 86400000);
        return diff;
    }
    function relativeTimeText_(value) {
        if (!value) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            var days = -daysUntil(value);
            if (days <= 0) return '오늘';
            if (days === 1) return '어제';
            if (days < 7) return days + '일 전';
            return fmtDate(value);
        }
        var then = new Date(value).getTime();
        if (isNaN(then)) return '';
        var minutes = Math.floor((Date.now() - then) / 60000);
        if (minutes < 1) return '방금';
        if (minutes < 60) return minutes + '분 전';
        var hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + '시간 전';
        var days2 = Math.floor(hours / 24);
        if (days2 < 7) return days2 + '일 전';
        return fmtDate(value.slice(0, 10));
    }
    function recentActivityHtml_() {
        var events = [];
        function push(time, text, bookId) { if (time) events.push({ time: time, text: text, bookId: bookId || null }); }

        state.books.forEach(function (b) {
            var createdDate = (b.createdAt || '').slice(0, 10);
            var history = b.history || [];
            // 완독(또는 읽는 중) 상태로 곧장 등록한 책은 등록/읽기시작/완독이 전부 같은 순간을
            // 가리키는 중복 항목이라, 그 중 가장 의미 있는 것 하나만 남긴다.
            var hasSameDayHistoryEvent = history.some(function (h) {
                return h.startDate === createdDate || h.endDate === createdDate;
            });

            history.forEach(function (h) {
                var m = getMember(h.memberId);
                if (!m) return;
                var closedSameDay = !!(h.endDate && h.startDate === h.endDate);
                if (!closedSameDay) {
                    push(h.startDate, '📖 ' + escapeHtml(m.name) + '님이 <b>' + escapeHtml(b.title) + '</b> 읽기 시작', b.id);
                }
                push(h.endDate, '✅ ' + escapeHtml(m.name) + '님이 <b>' + escapeHtml(b.title) + '</b> 완독', b.id);
            });
            if (b.createdAt && !hasSameDayHistoryEvent) {
                var owner = getMember(b.ownerId);
                push(b.createdAt, '➕ ' + (owner ? escapeHtml(owner.name) + '님이 ' : '') + '<b>' + escapeHtml(b.title) + '</b> 등록', b.id);
            }
            (b.photos || []).forEach(function (p) {
                var author = getMember(p.authorId);
                if (!author) return;
                if (p.type === 'photo') push(p.createdAt, '📷 ' + escapeHtml(author.name) + '님이 <b>' + escapeHtml(b.title) + '</b>에 독서기록 남김', b.id);
                else if (p.type === 'comment') push(p.createdAt, '💬 ' + escapeHtml(author.name) + '님이 <b>' + escapeHtml(b.title) + '</b>에 댓글', b.id);
            });
            (b.photos || []).forEach(function (p) {
                if (p.type === 'comment' && !p.authorId && p.caption) push(p.createdAt, escapeHtml(p.caption), b.id);
                (p.comments || []).forEach(function (c) {
                    var m = getMember(c.memberId);
                    if (m) push(c.createdAt, '💬 ' + escapeHtml(m.name) + '님이 <b>' + escapeHtml(b.title) + '</b> 사진에 댓글', b.id);
                });
            });
            (b.readRequests || []).forEach(function (r) {
                var m = getMember(r.memberId);
                if (m) push(r.requestedAt, '🙋 ' + escapeHtml(m.name) + '님이 <b>' + escapeHtml(b.title) + '</b> 읽기 신청', b.id);
            });
            (b.queueRequests || []).forEach(function (r) {
                var m = getMember(r.memberId);
                if (m) push(r.requestedAt, '💛 ' + escapeHtml(m.name) + '님이 <b>' + escapeHtml(b.title) + '</b> 읽기 신청', b.id);
            });
            // 찜(hearts)은 시각(created 시점)을 저장하지 않는 가벼운 신호라 여기 못 넣는다 — SNS의
            // "좋아요"처럼 매번 다 보여주면 피드가 시끄러워지니, 타임스탬프가 있는 추천만 넣는다.
            (b.recommendations || []).forEach(function (r) {
                var m = getMember(r.memberId);
                if (m) push(r.createdAt, '⭐ ' + escapeHtml(m.name) + '님이 <b>' + escapeHtml(b.title) + '</b> 추천', b.id);
            });
        });
        (state.wishlist || []).forEach(function (w) {
            var requester = getMember(w.requestedById);
            if (requester) push(w.createdAt, '🔍 ' + escapeHtml(requester.name) + '님이 <b>' + escapeHtml(w.title) + '</b>을(를) 찾아요에 등록');
        });
        (state.exchangeProposals || []).forEach(function (p) {
            var proposer = getMember(p.proposedById);
            if (proposer) push(p.createdAt, '📅 ' + escapeHtml(proposer.name) + '님이 ' + fmtDate(p.date) + ' 교환일 제안');
            (p.comments || []).forEach(function (c) {
                var m = getMember(c.memberId);
                if (m) push(c.createdAt, '💬 ' + escapeHtml(m.name) + '님이 ' + fmtDate(p.date) + ' 교환일에 댓글');
            });
            (p.photos || []).forEach(function (ph) {
                var author = getMember(ph.authorId);
                if (author) push(ph.createdAt, '📷 ' + escapeHtml(author.name) + '님이 ' + fmtDate(p.date) + ' 모임 사진 남김');
                (ph.comments || []).forEach(function (c) {
                    var m = getMember(c.memberId);
                    if (m) push(c.createdAt, '💬 ' + escapeHtml(m.name) + '님이 모임 사진에 댓글');
                });
            });
        });

        events.sort(function (a, b) { return String(b.time).localeCompare(String(a.time)); });
        events = events.slice(0, 5);
        if (!events.length) return '';
        return '<div class="section-label" style="margin-bottom:8px;"><span class="num mono">🕓</span><h2>최근 활동</h2><span class="line"></span></div>'
            + '<div class="activity-feed">' + events.map(function (e) {
                var attrs = e.bookId ? ' data-goto-book="' + e.bookId + '" style="cursor:pointer;"' : '';
                return '<div class="activity-item"' + attrs + '><span class="activity-item-text">' + e.text + '</span><span class="activity-time">' + relativeTimeText_(e.time) + '</span></div>';
            }).join('') + '</div>';
    }
    // 큐 항목은 {memberId, desiredDate} 형태. 예전 문자열 배열 데이터도 방어적으로 처리.
    function qMemberId(q) { return typeof q === 'string' ? q : (q && q.memberId); }
    function queueHasMember(queue, memberId) { return (queue || []).some(function (q) { return qMemberId(q) === memberId; }); }
    // 책은 사람 소속이라 여러 그룹에 걸쳐 보이는데, 신청자가 지금 보는 그룹의 멤버가
    // 아니면(다른 그룹에서 신청) get_state가 그 사람 이름을 안 줘서 getMember가 실패한다.
    // 이럴 때 조용히 숨기지 말고 어느 그룹에서 왔는지 알려주고 전환 버튼을 준다.
    function crossGroupRequestFallbackHtml_(r) {
        var myGroups = window.__MY_MEMBERSHIPS__ || [];
        var otherGroup = r.groupId ? myGroups.find(function (g) { return g.group_id === r.groupId; }) : null;
        if (otherGroup) {
            return '<div class="queue-item" style="flex-wrap:wrap;">'
                + '<span class="qname" style="color:var(--pencil);">⏰ <b>' + escapeHtml(otherGroup.group_name) + '</b> 모임에서 신청이 왔어요.</span>'
                + '<button class="btn-text" data-switch-group="' + escapeHtml(r.groupId) + '">' + escapeHtml(otherGroup.group_name) + '으로 전환하기</button>'
                + '</div>';
        }
        return '<div class="queue-item" style="flex-wrap:wrap;"><span class="qname" style="color:var(--pencil);">다른 모임 멤버에게서 신청이 왔어요.</span></div>';
    }
    // 책주인이 볼 "읽기 신청" 목록 — 'finished'(완독)든 'shelved'(안읽음)든 지금 읽는
    // 사람이 없는 책이면 누구나 신청할 수 있으므로, 두 상태 모두에서 같은 승인/거절 UI를 써야 한다.
    function incomingReadRequestsSectionHtml_(b, incomingReadRequests) {
        var html = '<div class="section-label" style="margin:0 0 8px;"><span class="num mono">R</span><h2>읽기 신청</h2><span class="line"></span></div>';
        html += '<div class="queue-list" style="margin-bottom:12px;">';
        html += incomingReadRequests.map(function (r) {
            var m = getMember(r.memberId);
            if (!m) return crossGroupRequestFallbackHtml_(r);
            var dateText = r.desiredDate ? fmtDate(r.desiredDate) + ' 희망' : '날짜는 나중에';
            return '<div class="queue-item" style="flex-wrap:wrap;">'
                + '<div class="qavatar" style="' + avatarStyle(m.color) + '">' + avatarContent(m) + '</div>'
                + '<span class="qname">' + escapeHtml(m.name) + ' · ' + dateText + '</span>'
                + '<button class="heart-btn" data-approve-request="' + r.id + '" data-request-book="' + b.id + '" style="flex-shrink:0;">승인</button>'
                + '<button class="btn-text" style="color:var(--stamp);" data-reject-request="' + r.id + '" data-request-book="' + b.id + '">거절</button>'
                + '<button class="btn-text" data-counter-read-request="' + r.id + '" data-request-book="' + b.id + '">다른 날짜 제안</button>'
                + '</div>';
        }).join('');
        html += '</div>';
        return html;
    }
    function memberNamesText(memberIds) {
        return (memberIds || []).map(function (id) {
            var m = getMember(id);
            return m ? m.name : null;
        }).filter(Boolean).join(', ');
    }
    function bookProgressPercent(b) {
        var total = parseInt(b.pageCount || 0, 10) || 0;
        var current = parseInt(b.currentPage || 0, 10) || 0;
        if (!total) return 0;
        return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
    }
    function progressBarHtml(b) {
        var total = parseInt(b.pageCount || 0, 10) || 0;
        var current = parseInt(b.currentPage || 0, 10) || 0;
        if (!total && !current) return '';
        var pct = bookProgressPercent(b);
        var label = total ? (current + ' / ' + total + '쪽') : (current + '쪽까지');
        return '<div class="progress-wrap"><div class="progress-track"><div class="progress-fill" style="width:' + pct + '%;"></div></div><div class="progress-text">' + escapeHtml(label) + (total ? ' · ' + pct + '%' : '') + '</div></div>';
    }
    // ============ 뷰 렌더링 (renderHome, renderBookDetail, ...) ============
    // ---------- RENDER ROOT ----------
    function render() {
        document.querySelectorAll('.tab-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.view === currentView);
        });
        document.getElementById('fabBtn').style.display =
            currentView === 'home' ? 'flex' : 'none';
        var main = document.getElementById('main');
        if (currentView === 'home')
            main.innerHTML = renderHome();
        else if (currentView === 'myPage')
            main.innerHTML = renderMyPage();
        else if (currentView === 'members')
            main.innerHTML = renderMembers();
        else if (currentView === 'shelf')
            main.innerHTML = renderShelf();
        else if (currentView === 'wishlist')
            main.innerHTML = renderWishlist();
        else if (currentView === 'records')
            main.innerHTML = renderRecords();
        else if (currentView === 'recommend')
            main.innerHTML = renderRecommend();
        else if (currentView === 'bookDetail')
            main.innerHTML = renderBookDetail(detailBookId);
        else if (currentView === 'memberDetail')
            main.innerHTML = renderMemberDetail(detailMemberId);
        attachRootEvents();
        renderLoginStatusUI();
    }
    // ---------- HOME ----------
    function lastReadSummary(b) {
        var history = b.history || [];
        if (history.length === 0)
            return null;
        var last = history[history.length - 1];
        var m = getMember(last.memberId);
        if (!m)
            return null;
        var range = last.endDate ? "".concat(fmtDate(last.startDate), " ~ ").concat(fmtDate(last.endDate)) : "".concat(fmtDate(last.startDate), " ~");
        return { member: m, range: range };
    }
    function bookCardHtml(b) {
        var reader = getMember(b.currentReaderId);
        var owner = getMember(b.ownerId);
        var queue = b.queue || [];
        var matchedNext = b.nextExchangeDate ? queue.find(function (q) { return typeof q === 'object' && q.desiredDate === b.nextExchangeDate; }) : null;
        var matchedNextMember = matchedNext ? getMember(qMemberId(matchedNext)) : null;
        var recruitingProposal = (!b.nextExchangeDate && b.currentReaderId)
            ? (state.exchangeProposals || []).find(function (p) {
                return (p.votes || []).includes(b.currentReaderId)
                    && ((p.bookIdsByMember || {})[b.currentReaderId] || []).includes(b.id);
            })
            : null;

        var statusHtml = '';
        if (reader) {
            // 홈 카드는 이미 "우리가 지금 읽는 책" 박스 안이라 READING 딱지는 중복 정보라 뺐다.
            statusHtml = '<span class="reader-name">' + escapeHtml(reader.name) + '</span>';
        } else if (b.status === 'finished') {
            statusHtml = '<span class="stamp done">DONE</span>';
        } else {
            statusHtml = '<span class="queue-empty">지금 읽는 사람 없음</span>';
        }


        var exchangeHtml = '';
        if (matchedNextMember && b.nextExchangeDate) {
            exchangeHtml = '<div class="date-range" style="margin-top:4px;color:var(--stamp);">🤝 ' + escapeHtml(matchedNextMember.name) + '님과 ' + fmtDate(b.nextExchangeDate) + ' 교환 예정</div>';
        } else if (recruitingProposal) {
            exchangeHtml = '<div class="date-range" style="margin-top:4px;color:var(--gold);cursor:pointer;" data-detail-date="' + recruitingProposal.date + '">📣 ' + fmtDate(recruitingProposal.date) + ' 교환 멤버 모집 중</div>';
        } else if (b.nextExchangeDate) {
            exchangeHtml = '<div class="date-range" style="margin-top:4px;color:var(--gold);">📣 ' + fmtDate(b.nextExchangeDate) + ' 교환 멤버 모집 중</div>';
        }

        var readRequestHtml = '';
        var incomingReadRequestCount = (b.readRequests || []).filter(function (r) { return !r.counterDate; }).length;
        if (!b.currentReaderId && getLoggedInMemberId() === b.ownerId && incomingReadRequestCount) {
            readRequestHtml = '<div class="date-range" style="margin-top:4px;color:var(--stamp);">📩 읽기 신청 ' + incomingReadRequestCount + '건</div>';
        }
        var queueRequestCount = (b.queueRequests || []).filter(function (r) { return !r.counterDate; }).length;
        if (b.status === 'reading' && getLoggedInMemberId() === b.currentReaderId && queueRequestCount) {
            readRequestHtml += '<div class="date-range" style="margin-top:4px;color:var(--stamp);">📩 읽기 신청 ' + queueRequestCount + '건</div>';
        }
        var myOwnReadRequest = (b.readRequests || []).find(function (r) { return r.memberId === getLoggedInMemberId(); });
        if (myOwnReadRequest) {
            var myReadReqDateText = myOwnReadRequest.counterDate
                ? fmtDate(myOwnReadRequest.counterDate) + ' 제안받음'
                : (myOwnReadRequest.desiredDate ? '내가 ' + fmtDate(myOwnReadRequest.desiredDate) + ' 신청' : '내가 신청함');
            readRequestHtml += '<div class="date-range" style="margin-top:4px;color:var(--gold);">📩 ' + myReadReqDateText + ' · 수락 대기중</div>';
        }
        var myOwnQueueRequest = (b.queueRequests || []).find(function (r) { return r.memberId === getLoggedInMemberId(); });
        if (myOwnQueueRequest) {
            var myReqDateText = myOwnQueueRequest.counterDate
                ? fmtDate(myOwnQueueRequest.counterDate) + ' 제안받음'
                : (myOwnQueueRequest.desiredDate ? '내가 ' + fmtDate(myOwnQueueRequest.desiredDate) + ' 신청' : '내가 신청함');
            readRequestHtml += '<div class="date-range" style="margin-top:4px;color:var(--gold);">📩 ' + myReqDateText + ' · 수락 대기중</div>';
        }
        if (b.status === 'reading' && getLoggedInMemberId() !== b.currentReaderId && !myOwnQueueRequest && (b.queueRequests || []).length) {
            var pendingNames = (b.queueRequests || []).map(function (r) { var m = getMember(r.memberId); return m ? m.name : null; }).filter(Boolean);
            if (pendingNames.length) {
                readRequestHtml += '<div class="date-range" style="margin-top:4px;color:var(--pencil);">💌 ' + pendingNames.map(escapeHtml).join(', ') + '님이 찜 수락을 기다리는 중</div>';
            }
        }
        if (b.pendingReturn) {
            var pendingHolder = getMember(b.holderId);
            if (getLoggedInMemberId() === b.ownerId) {
                readRequestHtml += '<div class="date-range" style="margin-top:4px;color:var(--stamp);">📦 ' + escapeHtml((pendingHolder || {}).name || '') + '님에게서 반납받아야 해요</div>';
            } else if (getLoggedInMemberId() === b.holderId) {
                readRequestHtml += '<div class="date-range" style="margin-top:4px;color:var(--stamp);">📦 ' + escapeHtml((owner || {}).name || '책주인') + '님에게 반납해주세요</div>';
            }
        }

        // 대기자가 없으면 "아직 기다리는 사람이 없어요" 같은 무의미한 기본 문구 대신 그냥 아무것도 안 보여준다.
        var queueWaitingHtml = '';
        if (queue.length > 0) {
            var queueNames = queue.map(function (q) {
                var m = getMember(qMemberId(q));
                return m ? m.name : null;
            }).filter(Boolean);
            var queueText;
            if (queueNames.length === 1) {
                queueText = '💛 ' + escapeHtml(queueNames[0]) + '님이 기다리고 있어요';
            } else if (queueNames.length > 1) {
                queueText = '💛 ' + queueNames.map(escapeHtml).join(', ') + '님이 기다리고 있어요';
            } else {
                queueText = '💛 ' + queue.length + '명이 기다리고 있어요';
            }
            queueWaitingHtml = '<span class="queue-waiting-highlight">' + queueText + '</span>';
        }

        // 홈 카드는 최대한 압축 — 댓글은 미리보기 박스 대신 작은 배지만 두고, 실제로 달거나
        // 읽는 건 책 상세에서 하도록 한다(입력창을 카드마다 두면 스크롤이 너무 길어짐).
        var comments = (b.photos || []).filter(function (p) { return p && p.type === 'comment' && p.caption; });
        var commentBadgeHtml = comments.length ? '<span class="card-comment-badge">💬 ' + comments.length + '</span>' : '';

        var myIdForCard = getLoggedInMemberId();
        var canHeartCard = !!myIdForCard && b.ownerId !== myIdForCard && !b.externalBorrow;
        var isHeartedCard = !!(myIdForCard && (b.hearts || []).indexOf(myIdForCard) > -1);
        var heartCardBtn = canHeartCard
            ? '<button class="btn-text card-heart-toggle" data-heart-book="' + b.id + '" data-hearted="' + (isHeartedCard ? '1' : '0') + '">' + (isHeartedCard ? '❤️ 찜함' : '🤍 찜') + '</button>'
            : '';

        // 압축 우선순위: 내가 처리해야 할 알림(readRequestHtml)이 있으면 그것만, 없으면
        // 교환일 정보만 — 소장자·시작일·진행률·완독기록 같은 참고용 정보는 상세 페이지로 옮겼다.
        var priorityLineHtml = readRequestHtml || exchangeHtml;

        // "읽기 신청"은 남이 읽는 중인 책에 대기(찜)를 거는 버튼이라, 지금 읽는 사람이
        // 나 자신이거나(내 책을 내가 읽는 중 포함) 이미 대기열·신청 중이면 눌러봐야
        // 에러 토스트만 뜬다 — 그런 경우엔 버튼 자체를 안 보여준다.
        var canJoinQueueCard = !!myIdForCard && b.status === 'reading' && b.currentReaderId
            && myIdForCard !== b.currentReaderId
            && !queueHasMember(queue, myIdForCard)
            && !(b.queueRequests || []).some(function (r) { return r.memberId === myIdForCard; });
        var joinQueueBtnHtml = canJoinQueueCard
            ? '<button class="heart-btn heart-toggle" data-book="' + b.id + '">📖 읽기 신청</button>'
            : '';

        // 표지 밑에 남는 여백에 진행률을 채운다 (쪽수를 입력해둔 책만 — 없으면 그냥 비워둔다).
        var thumbProgressHtml = '';
        if (parseInt(b.pageCount || 0, 10) > 0) {
            thumbProgressHtml = '<div class="thumb-progress"><div class="thumb-progress-fill" style="width:' + bookProgressPercent(b) + '%;"></div></div>';
        }

        return '<div class="due-card" data-book="' + b.id + '">' +
            '<div class="due-card-top">' +
            '<div class="thumb-col"><div class="book-thumb">' + bookThumbHtml(b) + '</div>' + thumbProgressHtml + '</div>' +
            '<div class="due-card-info">' +
            '<div class="title">' + escapeHtml(b.title) + '</div>' +
            '<div class="author">' + escapeHtml(b.author || '저자 미상') + '</div>' +
            '<div class="stamp-row">' + statusHtml + commentBadgeHtml + '</div>' +
            (priorityLineHtml ? '<div class="due-card-extra">' + priorityLineHtml + '</div>' : '') +
            '</div></div>' +
            (queueWaitingHtml || joinQueueBtnHtml || heartCardBtn
                ? '<div class="due-card-bottom">' + queueWaitingHtml + joinQueueBtnHtml + heartCardBtn + '</div>'
                : '') +
            '</div>';
    }
    function exchangeCommentPreviewHtml_(dateStr) {
        var proposal = (state.exchangeProposals || []).find(function (p) { return p.date === dateStr; });
        var comments = (proposal && proposal.comments) || [];
        if (!comments.length) return '';
        var latest = comments[comments.length - 1];
        var author = getMember(latest.memberId);
        return '<div class="exchange-mini-names" style="color:var(--stamp);">💬 ' + (author ? escapeHtml(author.name) + ': ' : '') + escapeHtml(latest.text) + '</div>';
    }
    function visibleProposals_() {
        var confirmedDates = state.confirmedExchangeDates || [];
        return (state.exchangeProposals || []).filter(function (p) {
            return (p.votes || []).length > 0 && !confirmedDates.some(function (d) { return d.date === p.date; });
        });
    }
    /**
     * 확정된 교환일(실선 점)과 모집 중인 제안(점선 테두리)을 한 달치 달력으로 보여준다.
     * 참석자 이름 대신 멤버 색상 점으로 "누가 오는지"를 표시 — 칸을 누르면 기존 상세 모달로 이동.
     */
    function renderExchangeMonthCalendar_() {
        var base = new Date();
        base.setDate(1);
        base.setMonth(base.getMonth() + exchangeCalendarMonthOffset);
        var year = base.getFullYear();
        var month = base.getMonth();
        var firstWeekday = new Date(year, month, 1).getDay();
        var daysInMonth = new Date(year, month + 1, 0).getDate();
        var todayStr = todayIso();

        var confirmedByDate = {};
        (state.confirmedExchangeDates || []).forEach(function (d) { confirmedByDate[d.date] = d; });
        var proposalByDate = {};
        visibleProposals_().forEach(function (p) { proposalByDate[p.date] = p; });
        // 완료/취소 처리된 날짜는 "확정된 교환일" 목록에서는 빠지지만, 달력에서는 계속
        // 찾아 들어가서 사진·기록을 볼 수 있어야 한다 — 다른 표시(체크/취소 아이콘)로 남긴다.
        var resolvedByDate = {};
        (state.resolvedExchangeDates || []).forEach(function (r) { resolvedByDate[r.date] = r.status; });

        var cells = [];
        for (var i = 0; i < firstWeekday; i++) cells.push('<div class="cal-cell cal-cell-empty"></div>');
        for (var day = 1; day <= daysInMonth; day++) {
            var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
            var confirmed = confirmedByDate[dateStr];
            var proposal = proposalByDate[dateStr];
            var resolvedStatus = resolvedByDate[dateStr];
            var memberIds = confirmed ? confirmed.memberIds : (proposal ? proposal.votes : []);
            var dotsHtml = resolvedStatus
                ? '<span class="cal-resolved-icon">' + (resolvedStatus === 'completed' ? '✅' : '🚫') + '</span>'
                : (memberIds || []).slice(0, 6).map(function (mid) {
                    var m = getMember(mid);
                    return m ? '<span class="cal-dot" style="' + avatarStyle(m.color) + '"></span>' : '';
                }).join('');
            var cellClass = 'cal-cell' + (confirmed ? ' cal-confirmed' : (proposal ? ' cal-proposal' : (resolvedStatus ? ' cal-resolved' : ''))) + (dateStr === todayStr ? ' cal-today' : '');
            var clickAttr = (confirmed || proposal || resolvedStatus) ? ' data-detail-date="' + dateStr + '"' : '';
            cells.push('<div class="' + cellClass + '"' + clickAttr + '><span class="cal-daynum">' + day + '</span><div class="cal-dots">' + dotsHtml + '</div></div>');
        }
        var monthLabel = year + '년 ' + (month + 1) + '월';
        var weekdayRow = ['일', '월', '화', '수', '목', '금', '토'].map(function (w) { return '<div class="cal-weekday">' + w + '</div>'; }).join('');

        return '<div class="exchange-calendar">'
            + '<div class="cal-nav"><button class="btn-text" id="calPrevMonthBtn">‹</button><span class="cal-month-label">' + monthLabel + '</span><button class="btn-text" id="calNextMonthBtn">›</button></div>'
            + '<div class="cal-grid cal-weekday-row">' + weekdayRow + '</div>'
            + '<div class="cal-grid">' + cells.join('') + '</div>'
            + '</div>';
    }
    function renderHome() {
        if (state.members.length === 0) {
            return '<div class="empty-state"><div class="stamp-big">NO MEMBERS YET</div><p>아직 멤버가 없어요.<br>먼저 함께 읽을 친구들을 추가해보세요.</p><button class="btn-primary" style="max-width:220px;margin:18px auto 0;" id="emptyAddMemberBtn">멤버 추가하기</button></div>';
        }
        var myId = getLoggedInMemberId();
        var confirmedDates = state.confirmedExchangeDates || [];
        var proposals = visibleProposals_().sort(function (a, b) { return (b.votes || []).length - (a.votes || []).length; });
        var confirmedSection = '';
        if (confirmedDates.length) {
            confirmedSection += '<div class="exchange-card-grid" style="' + (proposals.length ? 'margin-bottom:16px;' : '') + '">';
            confirmedSection += confirmedDates.map(function (d) {
                var dday = daysUntil(d.date);
                var ddayText = dday === 0 ? 'D-DAY' : (dday > 0 ? 'D-' + dday : Math.abs(dday) + '일 지남');
                var names = memberNamesText(d.memberIds);
                var exchangeBookCount = state.books.filter(function (b) { return b.status === 'reading' && b.nextExchangeDate === d.date; }).length;
                // 날짜가 지났거나 오늘이면 참석/불참 대신 완료/취소 처리를 유도한다 —
                // 지난 모임에 "참석할래요" 버튼은 의미가 없고, 계속 화면에 남아있으면 안 되니까.
                var actionsHtml = (dday !== null && dday <= 0)
                    ? '<div class="exchange-actions"><button class="heart-btn" data-resolve-date="' + d.date + '" data-resolve-status="completed">✅ 모임 완료</button><button class="btn-text" style="color:var(--stamp);" data-resolve-date="' + d.date + '" data-resolve-status="cancelled">모임 취소</button></div>'
                    : '<div class="exchange-actions"><button class="heart-btn home-join-date-btn" data-date="' + d.date + '">참석</button><button class="btn-text" data-cancel-date="' + d.date + '">불참</button></div>';
                return '<div class="due-card exchange-mini-card" style="cursor:default;">' +
                    '<div class="exchange-mini-top" data-detail-date="' + d.date + '">' +
                    '<div class="exchange-mini-head"><div class="exchange-mini-date">' + fmtDateFull(d.date) + '</div><span class="exchange-mini-dday">' + ddayText + '</span></div>' +
                    '<div class="exchange-mini-stats">👥 ' + (d.memberIds || []).length + '명 · 📚 ' + exchangeBookCount + '권</div>' +
                    '<div class="exchange-mini-names">' + (names ? escapeHtml(names) : '참석자 없음') + '</div>' +
                    exchangeCommentPreviewHtml_(d.date) +
                    '</div>' +
                    actionsHtml +
                    '</div>';
            }).join('');
            confirmedSection += '</div>';
        }
        var proposalsSection = '';
        if (proposals.length) {
            proposalsSection += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><span class="ex-icon">📅</span><div class="ex-text"><div class="ex-label" style="opacity:1;color:var(--pencil);">다음 교환</div><div class="ex-date" style="font-size:14px;">참석 가능한 사람 모여라~</div></div></div>';
            proposalsSection += '<div class="exchange-card-grid">';
            proposalsSection += proposals.map(function (p) {
                var proposer = getMember(p.proposedById);
                var votes = p.votes || [];
                var names = memberNamesText(votes);
                var bookCount = (p.bookIds || p.bookIdsJson || []).length || state.books.filter(function (b) { return b.status === 'reading' && b.nextExchangeDate === p.date; }).length;
                var attending = myId && votes.indexOf(myId) > -1;
                return '<div class="due-card exchange-mini-card" style="cursor:default;">' +
                    '<div class="exchange-mini-top" data-detail-date="' + p.date + '">' +
                    '<div class="exchange-mini-head"><div class="exchange-mini-date">' + fmtDateFull(p.date) + '</div></div>' +
                    '<div class="exchange-mini-stats">👥 ' + votes.length + '명' + (bookCount ? ' · 📚 ' + bookCount + '권' : '') + '</div>' +
                    '<div class="exchange-mini-names">' + (names ? escapeHtml(names) : (proposer ? escapeHtml(proposer.name) + ' 제안' : '제안됨')) + '</div>' +
                    exchangeCommentPreviewHtml_(p.date) +
                    '</div>' +
                    '<div class="exchange-actions"><button class="heart-btn home-attend-btn" data-proposal="' + p.id + '">' + (attending ? '불참' : '참석') + '</button></div>' +
                    '</div>';
            }).join('');
            proposalsSection += '</div><p style="font-size:10.5px;color:var(--pencil);margin-top:8px;">참석할 사람만 눌러주세요. 참석하면 선택한 책에 바로 교환일이 표시돼요.</p>';
        }
        var banner = '';
        if (confirmedDates.length || proposals.length) {
            var viewToggleHtml = '<div class="assign-select-row" style="margin-bottom:10px;">'
                + '<button class="btn-secondary' + (exchangeViewMode === 'list' ? ' active' : '') + '" data-exchange-view="list" style="flex:1;margin-top:0;">📋 리스트</button>'
                + '<button class="btn-secondary' + (exchangeViewMode === 'calendar' ? ' active' : '') + '" data-exchange-view="calendar" style="flex:1;margin-top:0;">🗓 달력</button>'
                + '</div>';
            var exchangeBodyHtml = exchangeViewMode === 'calendar' ? renderExchangeMonthCalendar_() : (confirmedSection + proposalsSection);
            banner = '<div class="exchange-banner" style="cursor:default;background:var(--paper-dark);color:var(--ink);border:1.5px dashed var(--pencil);flex-direction:column;align-items:stretch;gap:0;">' + viewToggleHtml + exchangeBodyHtml + '<button class="btn-secondary" id="homeProposeOtherBtn" style="margin-top:10px;">다른 날짜 제안하기</button></div>';
        } else {
            banner = '<div class="exchange-banner" id="exchangeBanner" style="cursor:pointer;background:var(--paper-dark);color:var(--ink);border:1.5px dashed var(--pencil);"><span class="ex-icon">📅</span><div class="ex-text"><div class="ex-label" style="opacity:1;color:var(--pencil);">다음 교환일이 아직 없어요</div><div class="ex-date" style="font-size:14px;">탭해서 날짜 제안하기</div></div></div>';
        }
        var currentlyReading = state.books.filter(function (b) { return b.status === 'reading'; });

        // ---------- 나의 서재 (내 공간) — 읽는 중 + 다음에 읽을 책 + 대기 중인 책을 한 줄 책장으로 압축 ----------
        var myReading = myId ? state.books.filter(function (b) { return b.currentReaderId === myId && b.status === 'reading'; }) : [];
        var nextToReadBooks = myId ? state.books.filter(function (b) { return b.ownerId === myId && b.status === 'shelved' && b.wantToRead; }) : [];
        var myQueuedBooks = myId ? state.books.filter(function (b) { return queueHasMember(b.queue, myId); }) : [];
        var myShelfCombined = myReading.concat(nextToReadBooks, myQueuedBooks);
        // 세 종류가 한 책장에 섞이면 뭐가 뭔지 구분이 안 되니, 책등 위에 작은 이모지 배지를 붙인다.
        var mySpaceEmojiByBookId_ = {};
        myReading.forEach(function (b) { mySpaceEmojiByBookId_[b.id] = '📖'; });
        nextToReadBooks.forEach(function (b) { mySpaceEmojiByBookId_[b.id] = '📚'; });
        myQueuedBooks.forEach(function (b) { mySpaceEmojiByBookId_[b.id] = '⏳'; });
        var mySpaceCountsHtml = (myReading.length ? '📖 읽는 중 ' + myReading.length + '권' : '')
            + (myReading.length && nextToReadBooks.length ? ' · ' : '')
            + (nextToReadBooks.length ? '📚 다음에 읽을 책 ' + nextToReadBooks.length + '권' : '')
            + ((myReading.length || nextToReadBooks.length) && myQueuedBooks.length ? ' · ' : '')
            + (myQueuedBooks.length ? '⏳ 대기 중 ' + myQueuedBooks.length + '권' : '');
        var mySpaceSpineHtml_ = function (b, i) {
            var color = COLORS[i % COLORS.length];
            var cover = b.coverUrl || (b.photos && b.photos[0] ? b.photos[0].url : null);
            var badgeHtml = '<span class="shelf-book-badge">' + (mySpaceEmojiByBookId_[b.id] || '') + '</span>';
            if (cover) {
                return '<div class="shelf-book" style="background-image:url(\'' + cover + '\');background-size:cover;background-position:center;" data-book="' + b.id + '">' + badgeHtml + '</div>';
            }
            return '<div class="shelf-book" style="background:' + color + ';" data-book="' + b.id + '">' + badgeHtml + '<span class="spine-title">' + escapeHtml(b.title) + '</span></div>';
        };
        var mySpaceHtml = !myId ? '' : '<div class="home-section my-space" id="home-myspace">'
            + '<div class="section-label" style="margin-bottom:8px;"><span class="num mono">★</span><h2>나의 서재</h2><span class="line"></span></div>'
            + (myShelfCombined.length
                ? spineShelfOrEmpty_(myShelfCombined, mySpaceSpineHtml_, '') + '<p style="font-size:11px;color:var(--pencil);margin-top:8px;">' + mySpaceCountsHtml + '</p>'
                : '<p style="color:var(--pencil);font-size:13px;">아직 읽는 책도, 다음에 읽을 책도 없어요.</p>')
            + '</div>';

        // ---------- 아래부터는 공용 공간 (클럽 전체) ----------
        var recentActivity = recentActivityHtml_();
        var recentActivitySection = recentActivity ? '<div class="home-section" id="home-activity">' + recentActivity + '</div>' : '';

        var readingSection = '<div class="home-section" id="home-reading">'
            + '<div class="section-label"><span class="num mono">' + currentlyReading.length + '권</span><h2>우리가 지금 읽는 책</h2><span class="line"></span></div>'
            + '<div class="card-stack book-card-grid">' + (currentlyReading.length ? currentlyReading.map(bookCardHtml).join('') : '<p style="color:var(--pencil);font-size:13px;padding:8px 4px;">📖 지금 읽는 책이 없어요.</p>') + '</div>'
            + '</div>';

        var exchangeSection = '<div class="home-section" id="home-exchange">'
            + '<div class="section-label" style="margin-bottom:8px;"><span class="num mono">🤝</span><h2>우리 모임 교환일</h2><span class="line"></span></div>'
            + banner
            + '</div>';

        // 홈에 섹션이 많아서 뭐가 있는지 한눈에 안 들어온다는 피드백 — 맨 위에 작은
        // 바로가기를 둬서 원하는 섹션으로 바로 스크롤할 수 있게 한다.
        var quickNavHtml = '<div class="home-quicknav">'
            + (mySpaceHtml ? '<a href="#home-myspace" class="home-quicknav-item">★ 내 서재</a>' : '')
            + (recentActivitySection ? '<a href="#home-activity" class="home-quicknav-item">🕓 활동</a>' : '')
            + '<a href="#home-reading" class="home-quicknav-item">📖 읽는 책</a>'
            + '<a href="#home-exchange" class="home-quicknav-item">🤝 교환일</a>'
            + '</div>';

        // 순서: 나의 서재(내 공간) → 최근 활동 → 우리가 지금 읽는 책 → 교환일 (전부 공용 공간)
        return quickNavHtml + mySpaceHtml + recentActivitySection + readingSection + exchangeSection;
    }

    // ---------- 우리 서고 (전부 책등으로 꽂아서, 카테고리별로 구분) ----------
    function chunk_(arr, size) {
        var out = [];
        for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
    }
    function bookSpineHtml_(b, i) {
        var color = COLORS[i % COLORS.length];
        var cover = b.coverUrl || (b.photos && b.photos[0] ? b.photos[0].url : null);
        if (cover) {
            return '<div class="shelf-book" style="background-image:url(\'' + cover + '\');background-size:cover;background-position:center;" data-book="' + b.id + '"></div>';
        }
        return '<div class="shelf-book" style="background:' + color + ';" data-book="' + b.id + '"><span class="spine-title">' + escapeHtml(b.title) + '</span></div>';
    }
    function wishSpineHtml_(w, i) {
        var color = COLORS[i % COLORS.length];
        var cover = w.coverUrl;
        if (cover) {
            return '<div class="shelf-book" style="background-image:url(\'' + cover + '\');background-size:cover;background-position:center;" data-wish-detail="' + w.id + '"></div>';
        }
        return '<div class="shelf-book" style="background:' + color + ';" data-wish-detail="' + w.id + '"><span class="spine-title">' + escapeHtml(w.title) + '</span></div>';
    }
    function spineShelfOrEmpty_(items, spineFn, emptyText) {
        if (!items.length) return '<div class="shelf-empty">' + emptyText + '</div>';
        return chunk_(items, 8).map(function (row) {
            return '<div class="bookshelf">' + row.map(spineFn).join('') + '</div>';
        }).join('');
    }
    /**
     * 홈 화면의 bookCardHtml(찜·교환·댓글 미리보기 포함)과 겹치지 않게, 표지+제목+한 줄만 보여주는
     * 압축 카드. .library-compact-grid 안에 넣어 여러 열로 배치한다.
     */
    function compactBookTileHtml_(b, metaLine) {
        return '<div class="due-card" data-book="' + b.id + '">'
            + '<div class="due-card-top" style="align-items:center;">'
            + '<div class="book-thumb">' + bookThumbHtml(b) + '</div>'
            + '<div class="due-card-info">'
            + '<div class="title">' + escapeHtml(b.title) + '</div>'
            + '<div class="author">' + metaLine + '</div>'
            + '</div></div></div>';
    }
    var SHELF_CATEGORIES_ = [
        { key: 'finished', label: '완독' },
        { key: 'reading', label: '읽는 중' },
        { key: 'unread', label: '아직 안 읽었어요' }
    ];
    // "다음에 읽을 책"과 "찜한 책"은 둘 다 내 개인 관심사라, 그룹 전체를 섞어 보는
    // "우리 서고"에선 의미가 없다 — "내 서고"에서만 탭으로 노출한다.
    var SHELF_NEXT_TO_READ_CATEGORY_ = { key: 'nextToRead', label: '다음에 읽을 책' };
    var SHELF_WANTED_CATEGORY_ = { key: 'wanted', label: '찜한 책' };
    var SHELF_EMPTY_TEXT_ = {
        wish: '🔍 아직 등록된 책이 없어요. 갖고 있는 사람이 있는지 물어볼 책을 등록해보세요.',
        reading: '📖 지금 읽는 책이 없어요.',
        unread: '🌱 아직 아무도 안 읽은 책이 없어요.',
        finished: '✅ 아직 다 읽은 책이 없어요.',
        nextToRead: '🌱 다음에 읽을 책으로 찜한 게 없어요. 안 읽은 책 카드에서 체크해보세요.',
        wanted: '🤍 아직 찜한 책이 없어요. 다른 사람 책 상세에서 찜하기를 눌러보세요.'
    };
    function shelfCategoryList_(category, reading, finished, unread, nextToRead, wanted) {
        return category === 'reading' ? reading
            : category === 'unread' ? unread
            : category === 'nextToRead' ? (nextToRead || [])
            : category === 'wanted' ? (wanted || [])
            : finished;
    }
    function shelfSearchFilter_(list, query) {
        var q = (query || '').trim().toLowerCase();
        if (!q) return list;
        return list.filter(function (item) {
            return (item.title || '').toLowerCase().indexOf(q) > -1 || (item.author || '').toLowerCase().indexOf(q) > -1;
        });
    }
    function shelfCardsHtml_(category, list, emptyText) {
        if (!list.length) return '<p style="color:var(--pencil);font-size:13px;">' + emptyText + '</p>';
        var mapper;
        // 마이페이지와 같은 카드(libraryBookCardHtml_)를 그대로 쓴다 — "다음에 읽을 책" 체크박스나
        // 빠른 상태 변경 드롭다운을 마이페이지까지 안 들어가도 우리서고에서 바로 쓸 수 있게.
        // memberId 자리에 b.ownerId를 넣으면, 그 책 주인이 로그인한 나 자신일 때만
        // "내 책" 전용 컨트롤(체크박스/드롭다운/삭제)이 뜬다.
        if (category === 'wish') {
            mapper = wishCompactCardHtml_;
        } else if (category === 'reading') {
            mapper = function (b) {
                var reader = getMember(b.currentReaderId);
                return libraryBookCardHtml_(b, b.ownerId, 'reading', '📖 ' + (reader ? escapeHtml(reader.name) + '님이 읽는 중' : '읽는 중'));
            };
        } else if (category === 'unread') {
            mapper = function (b) {
                var owner = getMember(b.ownerId);
                return libraryBookCardHtml_(b, b.ownerId, 'shelved', '🏷 ' + (owner ? escapeHtml(owner.name) + '님 소장' : '소장자 미상'));
            };
        } else if (category === 'nextToRead') {
            mapper = function (b) { return libraryBookCardHtml_(b, b.ownerId, 'nextToRead'); };
        } else if (category === 'wanted') {
            // "찜한 책"은 남의 책에 찜한 것(hearted)과 그룹에 아무도 안 갖고 있어 등록한
            // 위시리스트 항목(wish)이 섞여 있다 — 위시리스트 항목만 requestedById를 갖는다.
            var viewerId = getLoggedInMemberId();
            mapper = function (item) {
                return item.requestedById !== undefined ? wishCompactCardHtml_(item) : libraryBookCardHtml_(item, viewerId, 'wanted');
            };
        } else {
            mapper = function (b) {
                var last = lastReadSummary(b);
                var extra = last ? '✓ ' + escapeHtml(last.member.name) + '님 완독' : '✓ 완독';
                return libraryBookCardHtml_(b, b.ownerId, 'finished', extra + (b.externalBorrow ? ' · 🏛 외부에서 빌려 읽음' : ''));
            };
        }
        return '<div class="card-stack library-compact-grid">' + list.map(mapper).join('') + '</div>';
    }
    function renderShelf() {
        var myId = getLoggedInMemberId();
        var scopeMine = shelfScope === 'mine';
        var reading = state.books.filter(function (b) { return b.status === 'reading' && (!scopeMine || b.ownerId === myId); });
        var finished = state.books.filter(function (b) { return b.status === 'finished' && (!scopeMine || b.ownerId === myId); });
        var unread = state.books.filter(function (b) { return b.status === 'shelved' && (!scopeMine || b.ownerId === myId); });
        var nextToRead = state.books.filter(function (b) { return b.status === 'shelved' && b.wantToRead && b.ownerId === myId; });
        var wanted = scopeMine && myId ? (function () {
            var groups = libraryGroupsForMember_(myId);
            return groups.hearted.concat(groups.wishItems);
        })() : [];
        var counts = { finished: finished.length, reading: reading.length, unread: unread.length, nextToRead: nextToRead.length, wanted: wanted.length };

        // 맨 위: 소장도서·완독도서·읽는 중인 책을 한 서고에 다 같이 꽂아서 총 진열
        // ('이 책 찾아요'는 별도 탭이라 여기엔 포함하지 않는다 — 우리가 실제로 갖고 있는 책만 서고에 꽂는다)
        var combined = finished.concat(reading, unread);
        var overviewHtml = spineShelfOrEmpty_(combined, bookSpineHtml_, scopeMine ? '📚 아직 등록한 책이 없어요.' : '📚 아직 서고에 책이 없어요.');

        // "우리 서고"(그룹 전체)와 "내 서고"(내 책만)를 오가는 스코프 토글 — 기본은 우리 서고.
        // 아래 완독/읽는 중/아직 안 읽었어요 카테고리 탭과 층위가 다르다는 걸 보여주려고
        // 책장 맨 위에, 더 작은 크기로 둔다.
        var scopeHtml = '<div class="shelf-scope-tabs">'
            + '<button class="btn-secondary' + (!scopeMine ? ' active' : '') + '" data-shelf-scope="ours">우리 서고</button>'
            + '<button class="btn-secondary' + (scopeMine ? ' active' : '') + '" data-shelf-scope="mine">내 서고</button>'
            + '</div>';

        // "아직 안 읽었어요" 탭이 flex-wrap 때문에 둘째 줄에 혼자 남는 자리라,
        // 책 추가 버튼을 같은 탭 목록 안에 넣어서 바로 그 옆에 붙인다.
        var categories = scopeMine ? SHELF_CATEGORIES_.concat([SHELF_NEXT_TO_READ_CATEGORY_, SHELF_WANTED_CATEGORY_]) : SHELF_CATEGORIES_;
        var tabsHtml = '<div class="shelf-category-tabs">' + categories.map(function (c) {
            return '<button class="btn-secondary' + (shelfCategory === c.key ? ' active' : '') + '" data-shelf-category="' + c.key + '">'
                + escapeHtml(c.label) + ' ' + counts[c.key] + '권</button>';
        }).join('') + '<button class="btn-secondary" id="addShelfBookBtn">＋ 책 추가</button></div>';

        var searchHtml = '<div class="assign-select-row" style="margin-bottom:12px;">'
            + '<input type="text" id="shelfSearchInput" class="input-plain" placeholder="제목·저자 검색" style="flex:1;">'
            + '</div>';
        var currentList = shelfCategoryList_(shelfCategory, reading, finished, unread, nextToRead, wanted);
        var bodyHtml = '<div id="shelfCardsBox">' + shelfCardsHtml_(shelfCategory, currentList, SHELF_EMPTY_TEXT_[shelfCategory]) + '</div>';

        return scopeHtml + overviewHtml + tabsHtml + searchHtml + bodyHtml;
    }
    function renderWishlist() {
        var wishes = state.wishlist || [];
        var overviewHtml = spineShelfOrEmpty_(wishes, wishSpineHtml_, '🔍 아직 등록된 책이 없어요.');
        var addBtnHtml = '<button class="btn-secondary" id="addWishBtn" style="margin-bottom:10px;">＋ 찾는 책 등록</button>';
        var searchHtml = '<div class="assign-select-row" style="margin-bottom:12px;">'
            + '<input type="text" id="wishSearchInput" class="input-plain" placeholder="제목·저자 검색" style="flex:1;">'
            + '</div>';
        var bodyHtml = '<div id="wishCardsBox">' + shelfCardsHtml_('wish', wishes, SHELF_EMPTY_TEXT_.wish) + '</div>';
        return overviewHtml + addBtnHtml + searchHtml + bodyHtml;
    }
    function openWishDetailModal(wishId) {
        var w = (state.wishlist || []).find(function (x) { return x.id === wishId; });
        if (!w) return;
        var myId = getLoggedInMemberId();
        var owners = w.owners || [];
        var requester = getMember(w.requestedById);
        var isMineRequest = myId && myId === w.requestedById;
        var iHaveIt = myId && owners.indexOf(myId) > -1;

        var ownerLinksHtml = '';
        if (owners.length) {
            var chips = owners.map(function (ownerId) {
                var m = getMember(ownerId);
                if (!m) return '';
                var matchedBook = state.books.find(function (b) {
                    return b.ownerId === ownerId && normalizeTitle_(b.title) === normalizeTitle_(w.title);
                });
                return matchedBook
                    ? '<button class="btn-text" style="text-decoration:underline;color:var(--ink);" data-goto-book="' + matchedBook.id + '">' + escapeHtml(m.name) + '님 서고 →</button>'
                    : escapeHtml(m.name) + '님';
            }).filter(Boolean).join(' · ');
            ownerLinksHtml = '<div class="match-alert" style="background:var(--green-bg);border-color:var(--line-green);margin-bottom:10px;">🙋 <span>갖고 있어요: ' + chips + '</span></div>';
        }

        openModal('<h3>' + escapeHtml(w.title) + '</h3>'
            + (w.author ? '<p style="font-size:12.5px;color:var(--pencil);margin-bottom:8px;">' + escapeHtml(w.author) + '</p>' : '')
            + (w.note ? '<p style="font-size:12.5px;color:var(--ink-soft);margin-bottom:8px;">' + escapeHtml(w.note) + '</p>' : '')
            + (requester ? '<p style="font-size:12px;color:var(--pencil);margin-bottom:10px;">' + escapeHtml(requester.name) + '님이 찾고 있어요</p>' : '')
            + ownerLinksHtml
            + '<button class="btn-primary" id="wishHasBookBtn">' + (iHaveIt ? '있어요 취소' : '저 이 책 있어요') + '</button>'
            + (isMineRequest ? '<button class="btn-secondary" id="wishDeleteBtn">삭제</button>' : ''));

        document.querySelectorAll('#modalSheet [data-goto-book]').forEach(function (btn) {
            btn.onclick = function () {
                closeModal();
                detailBookId = btn.dataset.gotoBook;
                currentView = 'bookDetail';
                render();
                window.scrollTo(0, 0);
            };
        });
        document.getElementById('wishHasBookBtn').onclick = function () {
            requireLogin(async function (loggedInId) {
                try {
                    applyState(await callServer('toggleWishlistOwner', w.id, loggedInId, !iHaveIt));
                    closeModal();
                    render();
                } catch (err) {
                    showToast(err.message || '실패', true);
                }
            });
        };
        var deleteBtn = document.getElementById('wishDeleteBtn');
        if (deleteBtn) {
            deleteBtn.onclick = async function () {
                try {
                    applyState(await callServer('deleteWishlistItem', w.id));
                    closeModal();
                    render();
                    showToast('삭제했어요');
                } catch (err) {
                    showToast(err.message || '실패', true);
                }
            };
        }
    }
    function normalizeTitle_(t) { return (t || '').replace(/\s+/g, '').toLowerCase(); }
    // ---------- MEMBERS LIST ----------

    function photoDisplayUrl(photo) {
        if (!photo || !photo.url) return '';
        // fileId가 있으면(예전 GAS/Drive 사진) 구글 드라이브 썸네일 URL로 바꿔주고,
        // 없으면(Supabase Storage 사진) 이미 완성된 공개 URL이니 그대로 쓴다.
        // 예전엔 fileId가 없을 때 URL 안에서 25자 이상 토큰을 정규식으로 추측했는데,
        // Storage URL 안의 UUID(그룹/책 id)가 이 조건에 걸려 엉뚱한 가짜 드라이브
        // URL을 만들어버려서 사진이 깨지는 버그가 있었다.
        if (photo.fileId) {
            return 'https://lh3.googleusercontent.com/d/' + photo.fileId + '=w1200';
        }
        return photo.url;
    }
    /**
     * 책 사진(독서기록)과 교환일 모임 사진(모임기록)을 같은 모양으로 모아준다.
     * opts.category: 'book' | 'exchange' (생략하면 둘 다). opts.authorId로 특정 멤버 것만 필터 가능.
     */
    function collectRecordItems_(opts) {
        opts = opts || {};
        var items = [];
        if (!opts.category || opts.category === 'book') {
            (state.books || []).forEach(function (b) {
                (b.photos || []).forEach(function (p) {
                    if (p && p.type === 'photo' && (!opts.authorId || p.authorId === opts.authorId)) {
                        items.push({ kind: 'book', entityId: b.id, photo: p, title: b.title, subtitle: b.author || '' });
                    }
                });
            });
        }
        if (!opts.category || opts.category === 'exchange') {
            (state.exchangeProposals || []).forEach(function (pr) {
                (pr.photos || []).forEach(function (p) {
                    if (p && p.type === 'photo' && (!opts.authorId || p.authorId === opts.authorId)) {
                        items.push({ kind: 'exchange', entityId: pr.date, photo: p, title: fmtDateFull(pr.date) + ' 모임', subtitle: '' });
                    }
                });
            });
        }
        items.sort(function (a, b) { return String(b.photo.createdAt || '').localeCompare(String(a.photo.createdAt || '')); });
        return items;
    }
    function collectReviewItems_(opts) {
        opts = opts || {};
        var items = [];
        (state.books || []).forEach(function (b) {
            (b.history || []).forEach(function (h) {
                if (h.review && (!opts.authorId || h.memberId === opts.authorId)) {
                    items.push({ book: b, memberId: h.memberId, review: h.review, date: h.endDate || h.startDate });
                }
            });
        });
        items.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
        return items;
    }
    function reviewListHtml_(items) {
        if (!items.length) return '<p style="color:var(--pencil);font-size:13px;">✍️ 아직 후기가 없어요.</p>';
        return '<div class="entry-list">' + items.map(function (r) {
            var author = getMember(r.memberId);
            return '<div class="entry-item text-only" data-goto-book="' + r.book.id + '" style="cursor:pointer;">'
                + '<div class="entry-body">'
                + '<div class="entry-caption"><b>' + escapeHtml(r.book.title) + '</b><br>' + escapeHtml(r.review) + '</div>'
                + '<div class="entry-meta">'
                + (author ? '<span class="entry-author"><span class="entry-avatar-dot" style="' + avatarStyle(author.color) + '"></span>' + escapeHtml(author.name) + '</span>' : '')
                + '<span class="entry-date">' + fmtDateFull((r.date || '').slice(0, 10)) + '</span>'
                + '</div></div></div>';
        }).join('') + '</div>';
    }
    // 같은 사람이 같은 책(또는 같은 모임)에 여러 장을 남기면, 카드 하나로 묶어서 보여준다
    // (기록이 쌓이면 그리드가 너무 빽빽해져서 보기 불편하다는 피드백 반영). items는 이미
    // 최신순 정렬이라, 그룹의 첫 항목이 곧 그 그룹의 가장 최근 기록이 된다.
    function groupRecordItems_(items) {
        var groups = [];
        var indexByKey = {};
        items.forEach(function (r) {
            var key = r.kind + ':' + r.entityId + ':' + (r.photo.authorId || '');
            if (indexByKey[key] === undefined) {
                indexByKey[key] = groups.length;
                groups.push({ kind: r.kind, entityId: r.entityId, title: r.title, items: [r] });
            } else {
                groups[indexByKey[key]].items.push(r);
            }
        });
        return groups;
    }
    function recordGridHtml_(items) {
        var groups = groupRecordItems_(items);
        return '<div class="record-grid">' + groups.map(function (g) {
            var r = g.items[0];
            var author = getMember(r.photo.authorId);
            var countBadge = g.items.length > 1 ? '<span class="record-count-badge">' + g.items.length + '</span>' : '';
            var groupIds = g.items.map(function (it) { return it.photo.id; }).join(',');
            return '<div class="record-card" data-record-kind="' + r.kind + '" data-record-entity="' + escapeHtml(r.entityId) + '" data-record-photo="' + escapeHtml(r.photo.id) + '" data-record-group="' + escapeHtml(groupIds) + '">' +
                '<img src="' + photoDisplayUrl(r.photo) + '">' + countBadge +
                '<div class="record-card-body"><div class="record-title">' + escapeHtml(r.title) + '</div>' +
                '<div class="record-meta">' + (r.photo.caption ? escapeHtml(r.photo.caption) + '<br>' : '') +
                (author ? escapeHtml(author.name) + ' · ' : '') + relativeTimeText_(r.photo.createdAt) + '</div></div></div>';
        }).join('') + '</div>';
    }
    function collectRecommendItems_() {
        var items = [];
        state.books.forEach(function (b) {
            (b.recommendations || []).forEach(function (r) {
                items.push({ book: b, memberId: r.memberId, comment: r.comment, createdAt: r.createdAt });
            });
        });
        items.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
        return items;
    }
    function renderRecommend() {
        var items = collectRecommendItems_();
        if (!items.length) {
            return '<div class="section-label"><span class="num mono">⭐</span><h2>추천</h2><span class="line"></span></div>'
                + '<div class="empty-state"><div class="stamp-big">NO RECS YET</div><p>읽고 있거나 다 읽은 책 중에 좋았던 걸 추천해보세요. 책 상세 페이지에서 "이 책 추천해요"를 눌러주세요.</p></div>';
        }
        return '<div class="section-label"><span class="num mono">' + items.length + '개</span><h2>추천</h2><span class="line"></span></div>'
            + '<div class="card-stack">' + items.map(function (it) {
                var author = getMember(it.memberId);
                return '<div class="due-card" style="cursor:pointer;" data-book="' + it.book.id + '">'
                    + '<div class="due-card-top" style="align-items:center;">'
                    + '<div class="book-thumb">' + bookThumbHtml(it.book) + '</div>'
                    + '<div class="due-card-info">'
                    + '<div class="title">' + escapeHtml(it.book.title) + '</div>'
                    + '<div class="author">' + escapeHtml(it.book.author || '저자 미상') + '</div>'
                    + '</div></div>'
                    + '<div class="due-card-bottom" style="flex-direction:column;align-items:flex-start;gap:4px;">'
                    + (it.comment ? '<p style="font-size:13px;color:var(--ink);line-height:1.5;margin:0;">' + escapeHtml(it.comment) + '</p>' : '')
                    + '<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--pencil);">'
                    + (author ? '<span class="entry-avatar-dot" style="' + avatarStyle(author.color) + '"></span>' + escapeHtml(author.name) : '')
                    + ' · ' + relativeTimeText_(it.createdAt)
                    + '</div></div></div>';
            }).join('') + '</div>';
    }
    // 통합 피드 — 책 사진/모임 사진/후기를 종류 안 가리고 시간순으로 섞는다(홈 화면의
    // "최근 활동"과 같은 접근). 기존 3분할(책 기록/모임 기록/후기)은 이 피드 위의
    // 필터로 격하됐고, 기본 화면은 이제 "전체" 피드다.
    function feedPhotoGroupHtml_(g) {
        var r = g.items[0];
        var author = getMember(r.photo.authorId);
        var countBadge = g.items.length > 1 ? ' <span class="entry-count-badge">+' + (g.items.length - 1) + '</span>' : '';
        var groupIds = g.items.map(function (it) { return it.photo.id; }).join(',');
        return '<div class="entry-item" data-record-kind="' + r.kind + '" data-record-entity="' + escapeHtml(r.entityId) + '" data-record-photo="' + escapeHtml(r.photo.id) + '" data-record-group="' + escapeHtml(groupIds) + '" style="cursor:pointer;">'
            + '<div class="entry-photo"><img src="' + photoDisplayUrl(r.photo) + '"></div>'
            + '<div class="entry-body">'
            + '<div class="entry-caption"><b>' + escapeHtml(r.title) + '</b>' + countBadge + (r.photo.caption ? '<br>' + escapeHtml(r.photo.caption) : '') + '</div>'
            + '<div class="entry-meta">'
            + (author ? '<span class="entry-author"><span class="entry-avatar-dot" style="' + avatarStyle(author.color) + '"></span>' + escapeHtml(author.name) + '</span>' : '')
            + '<span class="entry-date">' + relativeTimeText_(r.photo.createdAt) + '</span>'
            + recordHeartBtnHtml_(r.kind, r.entityId, r.photo.id, null, r.photo.hearts)
            + '</div></div></div>';
    }
    function feedReviewItemHtml_(r) {
        var author = getMember(r.memberId);
        return '<div class="entry-item text-only" data-goto-book="' + r.book.id + '" style="cursor:pointer;">'
            + '<div class="entry-body">'
            + '<div class="entry-caption">✍️ <b>' + escapeHtml(r.book.title) + '</b><br>' + escapeHtml(r.review) + '</div>'
            + '<div class="entry-meta">'
            + (author ? '<span class="entry-author"><span class="entry-avatar-dot" style="' + avatarStyle(author.color) + '"></span>' + escapeHtml(author.name) + '</span>' : '')
            + '<span class="entry-date">' + relativeTimeText_(r.date) + '</span>'
            + '</div></div></div>';
    }
    function recordFeedHtml_() {
        var photoEntries = groupRecordItems_(collectRecordItems_({})).map(function (g) {
            return { time: g.items[0].photo.createdAt, html: feedPhotoGroupHtml_(g) };
        });
        var reviewEntries = collectReviewItems_().map(function (r) {
            return { time: r.date, html: feedReviewItemHtml_(r) };
        });
        var combined = photoEntries.concat(reviewEntries);
        combined.sort(function (a, b) { return String(b.time || '').localeCompare(String(a.time || '')); });
        if (!combined.length) {
            return '<div class="empty-state"><div class="stamp-big">NO RECORDS YET</div><p>사진이나 후기를 남기면 여기에 시간순으로 모여요.</p></div>';
        }
        return '<div class="entry-list">' + combined.map(function (x) { return x.html; }).join('') + '</div>';
    }
    function renderRecords() {
        var toggleHtml = '<div class="assign-select-row" style="margin-bottom:14px;flex-wrap:wrap;gap:8px;">'
            + '<button class="btn-secondary' + (recordsCategory === 'feed' ? ' active' : '') + '" data-records-category="feed" style="flex:1;margin-top:0;">🕓 전체</button>'
            + '<button class="btn-secondary' + (recordsCategory === 'book' ? ' active' : '') + '" data-records-category="book" style="flex:1;margin-top:0;">📖 책 기록</button>'
            + '<button class="btn-secondary' + (recordsCategory === 'exchange' ? ' active' : '') + '" data-records-category="exchange" style="flex:1;margin-top:0;">🤝 모임 기록</button>'
            + '<button class="btn-secondary' + (recordsCategory === 'review' ? ' active' : '') + '" data-records-category="review" style="flex:1;margin-top:0;">✍️ 후기</button>'
            + '</div>';

        if (recordsCategory === 'feed') {
            return '<div class="section-label"><span class="num mono">🕓</span><h2>독서기록</h2><span class="line"></span></div>' + toggleHtml
                + recordFeedHtml_();
        }

        if (recordsCategory === 'review') {
            var reviewItems = collectReviewItems_();
            var reviewAddBtnHtml = '<button class="btn-secondary" id="addReviewBtn" style="margin-bottom:14px;">＋ 기록 추가</button>';
            return '<div class="section-label"><span class="num mono">' + reviewItems.length + '개</span><h2>독서기록</h2><span class="line"></span></div>' + toggleHtml
                + reviewAddBtnHtml + reviewListHtml_(reviewItems);
        }

        // "책 기록"만 그룹 전체("우리 기록")와 내가 남긴 것("내 기록")을 오가는 스코프 토글을 둔다.
        var scopeMine = recordsCategory === 'book' && recordsScope === 'mine';
        var scopeHtml = '';
        if (recordsCategory === 'book') {
            scopeHtml = '<div class="assign-select-row" style="margin-bottom:12px;gap:8px;">'
                + '<button class="btn-secondary' + (!scopeMine ? ' active' : '') + '" data-records-scope="ours" style="flex:1;margin-top:0;">우리 기록</button>'
                + '<button class="btn-secondary' + (scopeMine ? ' active' : '') + '" data-records-scope="mine" style="flex:1;margin-top:0;">내 기록</button>'
                + '</div>';
        }
        var items = collectRecordItems_({ category: recordsCategory, authorId: scopeMine ? getLoggedInMemberId() : null });
        var headerHtml = '<div class="section-label"><span class="num mono">' + items.length + '장</span><h2>독서기록</h2><span class="line"></span></div>' + toggleHtml + scopeHtml;
        var addBtnHtml = recordsCategory === 'book'
            ? '<button class="btn-secondary" id="addRecordBtn" style="margin-bottom:14px;">＋ 기록 추가</button>'
            : '<button class="btn-secondary" id="addExchangeRecordBtn" style="margin-bottom:14px;">＋ 기록 추가</button>';
        if (!items.length) {
            return headerHtml + addBtnHtml + '<div class="empty-state"><div class="stamp-big">NO PHOTOS YET</div><p>' + (scopeMine ? '아직 내가 남긴 책 사진이 없어요.' : (recordsCategory === 'exchange' ? '교환일 상세에서 모임 사진을 남기면 여기에 모여요.' : '책 상세에서 사진을 남기면 여기에 모여요.')) + '</p></div>';
        }
        return headerHtml + addBtnHtml + recordGridHtml_(items);
    }
    // 독서기록 탭 "＋ 기록 추가" — 책/교환일 상세 페이지까지 안 가도 바로 사진을 남길 수
    // 있게, 대상(책 또는 교환일)부터 고르고 나면 상세 페이지와 같은 사진 캡션 모달
    // (openPhotoCaptionModal)로 이어붙인다.
    function recordBookPickerListHtml_(list) {
        if (!list.length) return '<p style="color:var(--pencil);font-size:13px;">검색 결과가 없어요.</p>';
        return list.map(function (b) {
            return '<button class="due-card" style="cursor:pointer;text-align:left;padding:10px 12px;" data-pick-record-book="' + b.id + '">'
                + '<div style="display:flex;align-items:center;gap:10px;">'
                + '<div class="book-thumb" style="width:34px;height:48px;flex-shrink:0;">' + bookThumbHtml(b) + '</div>'
                + '<div><div class="title" style="font-size:13.5px;">' + escapeHtml(b.title) + '</div>'
                + '<div class="author" style="font-size:11.5px;">' + escapeHtml(b.author || '저자 미상') + '</div></div>'
                + '</div></button>';
        }).join('');
    }
    function pickRecordPhotoFile_(entityType, entityId) {
        closeModal();
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = function (e) {
            var file = e.target.files[0];
            if (!file) return;
            if (file.size > 4 * 1024 * 1024) {
                showToast('사진 용량이 너무 커요 (4MB 이하)', true);
                return;
            }
            var reader = new FileReader();
            reader.onload = function () { openPhotoCaptionModal(entityType, entityId, reader.result); };
            reader.readAsDataURL(file);
        };
        input.click();
    }
    function openRecordBookPickerModal_() {
        var books = (state.books || []).slice().sort(function (a, b) { return (a.title || '').localeCompare(b.title || ''); });
        openModal('<h3>어떤 책 기록을 남길까요?</h3>'
            + '<input type="text" id="recordBookPickerSearch" class="input-plain" placeholder="제목·저자 검색" style="width:100%;margin-bottom:10px;">'
            + '<div class="card-stack" id="recordBookPickerList" style="gap:8px;max-height:50vh;overflow-y:auto;">' + recordBookPickerListHtml_(books) + '</div>');
        function wirePickButtons() {
            document.querySelectorAll('[data-pick-record-book]').forEach(function (btn) {
                btn.onclick = function () { pickRecordPhotoFile_('book', btn.dataset.pickRecordBook); };
            });
        }
        wirePickButtons();
        document.getElementById('recordBookPickerSearch').oninput = function (e) {
            var filtered = shelfSearchFilter_(books, e.target.value);
            document.getElementById('recordBookPickerList').innerHTML = recordBookPickerListHtml_(filtered);
            wirePickButtons();
        };
    }
    // 모임 기록 추가 — 확정된 교환일과 모집 중인 제안 날짜를 합쳐서 고르게 한다
    // (openDateRequestModal의 날짜 합치기 로직과 같은 방식).
    function recordExchangeDatePickerListHtml_(dateMembers, dates) {
        if (!dates.length) return '<p style="color:var(--pencil);font-size:13px;">아직 등록된 교환일이 없어요. 홈에서 교환일을 먼저 제안해보세요.</p>';
        return dates.map(function (d) {
            var names = memberNamesText((dateMembers[d] || []).filter(function (id, idx) { return dateMembers[d].indexOf(id) === idx; }));
            return '<button class="due-card" style="cursor:pointer;text-align:left;padding:12px;" data-pick-record-date="' + d + '">'
                + '<div>' + fmtDateFull(d) + '</div>'
                + '<div style="font-size:11.5px;color:var(--pencil);margin-top:2px;font-weight:400;">' + (names ? escapeHtml(names) : '아직 아무도 없음') + '</div>'
                + '</button>';
        }).join('');
    }
    function openExchangeRecordPickerModal_() {
        var dateMembers = {};
        (state.confirmedExchangeDates || []).forEach(function (d) {
            dateMembers[d.date] = (dateMembers[d.date] || []).concat(d.memberIds || []);
        });
        (state.exchangeProposals || []).forEach(function (p) {
            dateMembers[p.date] = (dateMembers[p.date] || []).concat(p.votes || []);
        });
        var dates = Object.keys(dateMembers).sort().reverse();
        openModal('<h3>어떤 모임 기록을 남길까요?</h3>'
            + '<div class="card-stack" style="gap:8px;max-height:55vh;overflow-y:auto;">' + recordExchangeDatePickerListHtml_(dateMembers, dates) + '</div>');
        document.querySelectorAll('[data-pick-record-date]').forEach(function (btn) {
            btn.onclick = function () { pickRecordPhotoFile_('exchange', btn.dataset.pickRecordDate); };
        });
    }
    // 후기 추가/수정 — 내가 실제로 완독한 책만 고를 수 있고, 이미 쓴 후기가 있으면
    // 수정하는 형태로 이어진다.
    function reviewPickerListHtml_(list, myId) {
        if (!list.length) return '<p style="color:var(--pencil);font-size:13px;">아직 완독한 책이 없어요.</p>';
        return list.map(function (b) {
            var mine = (b.history || []).slice().reverse().find(function (h) { return h.memberId === myId && h.endDate; });
            var preview = mine && mine.review ? '✍️ ' + escapeHtml(mine.review.slice(0, 30)) + (mine.review.length > 30 ? '…' : '') : '후기 없음';
            return '<button class="due-card" style="cursor:pointer;text-align:left;padding:10px 12px;" data-pick-review-book="' + b.id + '">'
                + '<div style="display:flex;align-items:center;gap:10px;">'
                + '<div class="book-thumb" style="width:34px;height:48px;flex-shrink:0;">' + bookThumbHtml(b) + '</div>'
                + '<div><div class="title" style="font-size:13.5px;">' + escapeHtml(b.title) + '</div>'
                + '<div class="author" style="font-size:11.5px;">' + escapeHtml(preview) + '</div></div>'
                + '</div></button>';
        }).join('');
    }
    function openReviewBookPickerModal_() {
        requireLogin(function (myId) {
            var myFinishedBooks = state.books.filter(function (b) {
                return (b.history || []).some(function (h) { return h.memberId === myId && h.endDate; });
            });
            openModal('<h3>어떤 책 후기를 남길까요?</h3>'
                + '<div class="card-stack" style="gap:8px;max-height:55vh;overflow-y:auto;">' + reviewPickerListHtml_(myFinishedBooks, myId) + '</div>');
            document.querySelectorAll('[data-pick-review-book]').forEach(function (btn) {
                btn.onclick = function () { openSetReviewModal_(btn.dataset.pickReviewBook, myId); };
            });
        });
    }
    function openSetReviewModal_(bookId, myId) {
        var b = getBook(bookId);
        var mine = (b.history || []).slice().reverse().find(function (h) { return h.memberId === myId && h.endDate; });
        openModal('<h3>' + escapeHtml(b.title) + '</h3>'
            + '<div class="field"><label>후기</label><textarea id="setReviewInput" placeholder="어떤 책이었나요?" maxlength="500">' + escapeHtml((mine && mine.review) || '') + '</textarea></div>'
            + '<button class="btn-primary" id="saveReviewBtn">저장하기</button>');
        document.getElementById('saveReviewBtn').onclick = async function (e) {
            var review = document.getElementById('setReviewInput').value.trim();
            setBtnLoading(e.target, '저장하는 중...');
            try {
                applyState(await callServer('setBookReview', bookId, myId, review));
                closeModal();
                render();
                showToast('후기를 저장했어요');
            } catch (err) {
                showToast(err.message || '저장 실패', true);
                resetBtn(e.target);
            }
        };
    }
    function renderMembers() {
        if (state.members.length === 0) {
            return "\n      <div class=\"empty-state\">\n        <div class=\"stamp-big\">NO MEMBERS YET</div>\n        <p>\uBA64\uBC84\uB97C \uCD94\uAC00\uD558\uBA74 \uC5EC\uAE30\uC5D0 \uD398\uC774\uC9C0\uAC00 \uC0DD\uACA8\uC694.</p>\n        <button class=\"btn-primary\" style=\"max-width:220px;margin:18px auto 0;\" id=\"emptyAddMemberBtn2\">\uBA64\uBC84 \uCD94\uAC00\uD558\uAE30</button>\n      </div>";
        }
        return "\n    <div class=\"section-label\">\n      <span class=\"num mono\">".concat(state.members.length + '명', "</span>\n      <h2>\uBA64\uBC84</h2>\n      <span class=\"line\"></span>\n    </div>\n    <button class=\"btn-secondary\" id=\"inviteMemberBtn\" style=\"margin-bottom:14px;\">\uBA64\uBC84 \uCD08\uB300</button>\n    <div class=\"card-stack\">\n      ").concat(state.members.map(function (m) {
            var reading = state.books.find(function (b) { return b.currentReaderId === m.id && b.status === 'reading'; });
            var waiting = state.books.filter(function (b) { return queueHasMember(b.queue, m.id); });
            return "\n        <div class=\"due-card\" data-member=\"".concat(m.id, "\">\n          <div class=\"due-card-top\" style=\"align-items:center;\">\n            <div class=\"avatar-circle\" style=\"").concat(avatarStyle(m.color), "\">").concat(avatarContent(m), "</div>\n            <div class=\"due-card-info\">\n              <div class=\"title\" style=\"font-size:15px;\">").concat(escapeHtml(m.name), "</div>\n              <div class=\"author\">").concat(reading ? "\uC77D\uB294 \uC911: ".concat(escapeHtml(reading.title)) : '지금 읽는 책 없음', "</div>\n              ").concat(waiting.length ? "<div class=\"author\" style=\"color:var(--stamp);margin-top:2px;\">\u2661 \uCC1C: ".concat(waiting.map(function (b) { return escapeHtml(b.title); }).join(', '), "</div>") : '', "\n              ").concat(m.bio ? "<div class=\"author\" style=\"color:var(--pencil);margin-top:2px;font-style:italic;\">".concat(escapeHtml(m.bio.slice(0, 40))).concat(m.bio.length > 40 ? '…' : '', "</div>") : '', "\n            </div>\n            ").concat(reading ? "<div class=\"book-thumb\" style=\"width:40px;height:56px;flex-shrink:0;\">".concat(bookThumbHtml(reading), "</div>") : '', "\n          </div>\n        </div>");
        }).join(''), "\n    </div>\n  ");
    }
    // ---------- MEMBER DETAIL ----------
    var BOOK_STATUS_LABELS = { reading: '읽는 중', finished: '완독', shelved: '안 읽음', queued: '대기 중', nextToRead: '다음에 읽을 책', wanted: '찜한 책' };
    var BOOK_STATUS_COLORS = { reading: 'var(--stamp)', finished: 'var(--line-green)', shelved: 'var(--pencil)', queued: 'var(--stamp)', nextToRead: 'var(--gold)', wanted: 'var(--gold)' };
    function libraryGroupsForMember_(memberId) {
        var reading = state.books.filter(function (b) { return b.currentReaderId === memberId && b.status === 'reading'; });
        var queued = state.books.filter(function (b) { return queueHasMember(b.queue, memberId); });
        // "빌려서 읽은 책"도 이 사람이 읽은 책이므로 완독에 합친다 — 소장 여부는 별도 태그(🏷)로만 표시.
        // "다음에 읽을 책"(내 소장, 우선순위)과 "찜한 책"(남의 책에 대한 관심 신호)은
        // 의도가 달라서 따로 모은다 — 전자는 순수 개인 To-Read, 후자는 사회적 신호.
        var finished = [], unread = [], nextToRead = [], hearted = [];
        var seen = {};
        state.books.forEach(function (b) {
            if (seen[b.id]) return;
            var hasClosedHistory = (b.history || []).some(function (h) { return h.memberId === memberId && h.endDate; });
            if (b.ownerId === memberId && b.status === 'finished') {
                seen[b.id] = true;
                finished.push(b);
            } else if (b.ownerId !== memberId && hasClosedHistory) {
                seen[b.id] = true;
                finished.push(b);
            } else if (b.ownerId === memberId && b.status === 'shelved') {
                seen[b.id] = true;
                (b.wantToRead ? nextToRead : unread).push(b);
            } else if (b.ownerId !== memberId && (b.hearts || []).indexOf(memberId) > -1) {
                seen[b.id] = true;
                hearted.push(b);
            }
        });
        var wishItems = (state.wishlist || []).filter(function (w) { return w.requestedById === memberId; });
        return { reading: reading, queued: queued, nextToRead: nextToRead, hearted: hearted, wishItems: wishItems, finished: finished, unread: unread };
    }
    function libraryBookCardHtml_(b, memberId, labelKey, extraLine) {
        var isMine = getLoggedInMemberId() === memberId && b.ownerId === memberId;
        var statusColor = BOOK_STATUS_COLORS[labelKey] || 'var(--pencil)';
        var owner = getMember(b.ownerId);
        var metaLine = b.ownerId !== memberId && owner ? '🏷 ' + escapeHtml(owner.name) + '님 소장' : '';
        var wantToReadToggle = (isMine && b.status === 'shelved')
            ? '<label style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink);cursor:pointer;"><input type="checkbox" class="want-to-read-checkbox" data-want-book="' + b.id + '" ' + (b.wantToRead ? 'checked' : '') + ' style="width:15px;height:15px;">다음에 읽을 책</label>'
            : '';
        return '<div class="due-card" data-book="' + b.id + '">'
            + '<div class="due-card-top" style="align-items:center;">'
            + '<div class="book-thumb">' + bookThumbHtml(b) + '</div>'
            + '<div class="due-card-info">'
            + '<div class="title">' + escapeHtml(b.title) + '</div>'
            + '<div class="author">' + escapeHtml(b.author || '저자 미상') + '</div>'
            + (metaLine ? '<div class="author" style="margin-top:2px;">' + metaLine + '</div>' : '')
            + (extraLine ? '<div class="author" style="margin-top:2px;">' + extraLine + '</div>' : '')
            + '<span class="stamp" style="color:' + statusColor + ';border-color:' + statusColor + ';">' + BOOK_STATUS_LABELS[labelKey] + '</span>'
            + '</div></div>'
            + (isMine
                ? '<div class="due-card-bottom" style="flex-wrap:wrap;gap:8px;">'
                    + (b.externalBorrow
                        ? '<span style="font-size:11px;color:var(--pencil);">🏛 외부 대여 기록이라 상태를 바꿀 수 없어요</span>'
                        : '<select class="library-status-select" data-status-book="' + b.id + '" style="padding:6px 8px;border:1.5px solid var(--ink);border-radius:var(--radius-card);background:var(--card-bg);color:var(--ink);font-size:12.5px;" ' + (b.currentReaderId && b.currentReaderId !== memberId ? 'disabled' : '') + '>'
                            + '<option value="shelved" ' + (b.status === 'shelved' ? 'selected' : '') + '>안 읽음</option>'
                            + '<option value="reading" ' + (b.status === 'reading' ? 'selected' : '') + '>읽는 중</option>'
                            + '<option value="finished" ' + (b.status === 'finished' ? 'selected' : '') + '>완독</option>'
                            + '</select>'
                            + wantToReadToggle)
                    + '<button class="btn-text" style="color:var(--stamp);margin-left:auto;" data-delete-library="' + b.id + '">삭제</button>'
                    + '</div>'
                : '')
            + '</div>';
    }
    function wishCompactCardHtml_(w) {
        var myId = getLoggedInMemberId();
        var owners = w.owners || [];
        var ownerNames = memberNamesText(owners);
        var isMineRequest = myId && myId === w.requestedById;
        var iHaveIt = myId && owners.indexOf(myId) > -1;
        return '<div class="due-card" data-wish-detail="' + w.id + '">'
            + '<div class="due-card-top" style="align-items:center;">'
            + '<div class="book-thumb">' + bookThumbHtml(w) + '</div>'
            + '<div class="due-card-info">'
            + '<div class="title">' + escapeHtml(w.title) + '</div>'
            + '<div class="author">' + escapeHtml(w.author || '저자 미상') + '</div>'
            + (ownerNames ? '<div class="author" style="margin-top:2px;">🙋 ' + escapeHtml(ownerNames) + '님이 갖고 있어요</div>' : '')
            + '<span class="stamp" style="color:' + BOOK_STATUS_COLORS.wanted + ';border-color:' + BOOK_STATUS_COLORS.wanted + ';">위시리스트</span>'
            + '</div></div>'
            + '<div class="due-card-bottom" style="flex-wrap:wrap;gap:8px;">'
            + '<button class="btn-text has-book-btn" style="color:var(--line-green);" data-wish-id="' + w.id + '">' + (iHaveIt ? '있어요 취소' : '저 이 책 있어요') + '</button>'
            + (isMineRequest ? '<button class="btn-text" style="color:var(--stamp);margin-left:auto;" data-delete-wish="' + w.id + '">삭제</button>' : '')
            + '</div></div>';
    }
    function renderLibrarySection(memberId) {
        var isMineProfile = getLoggedInMemberId() === memberId;
        var groups = libraryGroupsForMember_(memberId);
        var queuedCardsHtml = groups.queued.map(function (b) {
            var pos = (b.queue || []).findIndex(function (q) { return qMemberId(q) === memberId; }) + 1;
            return libraryBookCardHtml_(b, memberId, 'queued', '대기 순번 ' + pos + '번째');
        }).join('');
        var nextToReadCardsHtml = groups.nextToRead.map(function (b) { return libraryBookCardHtml_(b, memberId, 'nextToRead'); }).join('');
        var heartedCardsHtml = groups.hearted.map(function (b) { return libraryBookCardHtml_(b, memberId, 'wanted'); }).join('')
            + groups.wishItems.map(wishCompactCardHtml_).join('');
        var sections = [
            { key: 'reading', label: '읽는 중', color: BOOK_STATUS_COLORS.reading, count: groups.reading.length, html: groups.reading.map(function (b) { return libraryBookCardHtml_(b, memberId, 'reading'); }).join('') },
            { key: 'queued', label: '대기 중', color: BOOK_STATUS_COLORS.queued, count: groups.queued.length, html: queuedCardsHtml },
            // "다음에 읽을 책"(내 소장, 순수 개인 우선순위)과 "찜한 책"(남의 책에 대한 관심 신호 + 위시리스트)은
            // 의도가 달라서 분리했다 — 전자는 addBtn이 필요 없고(체크박스로만 표시), 후자만 새로 등록하는 버튼이 있다.
            { key: 'nextToRead', label: '다음에 읽을 책', color: BOOK_STATUS_COLORS.nextToRead, count: groups.nextToRead.length, html: nextToReadCardsHtml },
            { key: 'finished', label: '완독', color: BOOK_STATUS_COLORS.finished, count: groups.finished.length, html: groups.finished.map(function (b) { return libraryBookCardHtml_(b, memberId, 'finished', b.externalBorrow ? '🏛 외부에서 빌려 읽음' : ''); }).join('') },
            { key: 'shelved', label: '안 읽음', color: BOOK_STATUS_COLORS.shelved, count: groups.unread.length, html: groups.unread.map(function (b) { return libraryBookCardHtml_(b, memberId, 'shelved'); }).join('') },
            { key: 'wanted', label: '찜한 책', color: BOOK_STATUS_COLORS.wanted, count: groups.hearted.length + groups.wishItems.length, html: heartedCardsHtml, addBtn: true }
        ];
        var totalCount = sections.reduce(function (sum, sec) { return sum + sec.count; }, 0);
        var body = sections.map(function (sec) {
            if (!sec.count && !sec.addBtn) return '';
            return '<div style="margin:12px 0 8px;display:flex;align-items:center;gap:10px;"><span class="stamp" style="color:' + sec.color + ';border-color:' + sec.color + ';">' + sec.label + ' ' + sec.count + '</span>'
                + (sec.addBtn && isMineProfile ? '<button class="btn-text" id="addWishFromLibraryBtn">＋ 이 책 찾아요 등록</button>' : '') + '</div>'
                + (sec.count ? '<div class="card-stack library-compact-grid">' + sec.html + '</div>' : '');
        }).join('');
        return '<div class="section-label"><span class="num mono">📚</span><h2>서고</h2><span class="line"></span></div>'
            + '<button class="btn-secondary" id="addLibraryBookBtn" data-owner="' + memberId + '" style="margin-bottom:14px;">＋ 서고에 책 추가</button>'
            + body
            + (totalCount ? '' : '<p style="color:var(--pencil);font-size:13px;">' + (isMineProfile ? '📚 아직 등록한 책이 없어요.' : '📚 아직 등록된 책이 없어요.') + '</p>');
    }
    function memberRecordsSectionHtml_(memberId) {
        var items = collectRecordItems_({ authorId: memberId });
        if (!items.length) return '';
        return '<div class="section-label" style="margin-top:18px;"><span class="num mono">' + items.length + '장</span><h2>독서기록</h2><span class="line"></span></div>'
            + recordGridHtml_(items);
    }
    function renderMemberDetail(id) {
        var m = getMember(id);
        if (!m) {
            currentView = 'members';
            return renderMembers();
        }
        // "프로필 수정"은 서버가 항상 로그인한 본인 행만 고치기 때문에(멤버 id는 무시),
        // 남의 페이지에서 눌러도 실제로는 내 프로필이 남의 정보로 덮어써지는 혼란만
        // 생긴다 — 본인 페이지에서만 보여준다.
        var isMine = getLoggedInMemberId() === id;
        return '<button class="back-btn" id="backToMembers">← 멤버 목록</button>'
            + '<div class="member-detail-header">'
            + '<div class="avatar-circle" style="' + avatarStyle(m.color) + '">' + avatarContent(m) + '</div>'
            + '<div class="mname">' + escapeHtml(m.name) + '</div>'
            + (m.bio ? '<p style="font-size:12.5px;color:var(--ink-soft);text-align:center;max-width:280px;line-height:1.5;margin-top:-4px;">' + escapeHtml(m.bio) + '</p>' : '')
            + (isMine ? '<div style="display:flex;gap:14px;"><button class="edit-icon-btn" id="editMemberProfileBtn">프로필 수정</button></div>' : '')
            + '</div>'
            + renderLibrarySection(id)
            + memberRecordsSectionHtml_(id);
    }
    // ---------- MY PAGE ----------
    function renderMyPage() {
        var myId = getLoggedInMemberId();
        if (!myId || !getMember(myId)) {
            return '<div class="empty-state"><div class="stamp-big">LOGIN</div><p>마이페이지를 보려면 먼저 로그인해주세요.</p><button class="btn-primary" style="max-width:220px;margin:18px auto 0;" id="myPageLoginBtn">로그인하기</button></div>';
        }
        var me = getMember(myId);
        var html = '';
        html += '<div class="member-detail-header"><div class="avatar-circle" style="' + avatarStyle(me.color) + '">' + avatarContent(me) + '</div><div class="mname">' + escapeHtml(me.name) + '의 마이페이지</div>';
        if (me.bio) html += '<p style="font-size:12.5px;color:var(--ink-soft);text-align:center;max-width:280px;line-height:1.5;margin-top:-4px;">' + escapeHtml(me.bio) + '</p>';
        html += '<div><button class="edit-icon-btn" id="editMyProfileBtn">프로필 수정</button><button class="edit-icon-btn" id="openAccountModalBtn">그룹 전환</button><button class="edit-icon-btn" id="myPageInviteCodeBtn">그룹 초대 코드</button></div>';
        html += '</div>';
        // 내 서고가 마이페이지에서 제일 중요한 부분이라 맨 위로 (알림 설정 같은 부가 기능보다 먼저).
        html += renderLibrarySection(myId);
        html += memberRecordsSectionHtml_(myId);
        html += '<div class="section-label"><span class="num mono">✉</span><h2>알림 설정</h2><span class="line"></span></div>';
        html += '<div class="field"><label>이메일 주소</label><input type="email" id="notifyEmail" value="' + escapeHtml(me.email || '') + '" placeholder="you@example.com"></div>';
        html += '<div class="field"><label>알림 요일</label>' + dayCheckboxesHtml('memberDetail', me.notifyDays || []) + '</div>';
        html += '<div class="field"><label>알림 시간</label><input type="time" id="notifyTime" value="' + (me.notifyTime || '21:00') + '"></div>';
        html += '<div style="display:flex;align-items:center;gap:8px;margin:6px 0 14px;"><input type="checkbox" id="notifyEnabled" ' + (me.notifyEnabled ? 'checked' : '') + ' style="width:18px;height:18px;"><label for="notifyEnabled" style="font-size:13px;color:var(--ink);cursor:pointer;">알림 받기</label></div>';
        html += '<p style="font-size:11.5px;color:var(--pencil);margin-bottom:10px;line-height:1.5;">내가 읽는 책이나 찜한 책이 있을 때, 설정한 요일·시간대에 이메일로 알려드려요.</p>';
        html += '<p style="font-size:12.5px;color:var(--ink);font-weight:600;margin-bottom:6px;">반응 알림 (즉시 발송)</p>';
        html += '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">'
            + '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);cursor:pointer;"><input type="checkbox" id="notifyOnComment" ' + (me.notifyOnComment !== false ? 'checked' : '') + ' style="width:18px;height:18px;">누가 내 사진에 댓글을 달면</label>'
            + '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);cursor:pointer;"><input type="checkbox" id="notifyOnHeart" ' + (me.notifyOnHeart !== false ? 'checked' : '') + ' style="width:18px;height:18px;">누가 내 사진·댓글에 좋아요를 누르면</label>'
            + '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);cursor:pointer;"><input type="checkbox" id="notifyOnRecommend" ' + (me.notifyOnRecommend !== false ? 'checked' : '') + ' style="width:18px;height:18px;">내가 읽는 책을 누가 추천하면</label>'
            + '</div>';
        html += '<button class="btn-primary" id="saveNotifyBtn" style="margin-bottom:18px;">알림 설정 저장</button>';
        return html;
    }

    // ---------- BOOK DETAIL ----------

    function progressDetailHtml(b) {
        var total = parseInt(b.pageCount || 0, 10) || 0;
        var current = parseInt(b.currentPage || 0, 10) || 0;
        var maxVal = total || Math.max(current, 100);
        var canEdit = getLoggedInMemberId() === b.currentReaderId;
        return '<div class="section-label"><span class="num mono">%</span><h2>독서 진행</h2><span class="line"></span></div>' +
            '<div class="field">' +
            '<input class="progress-range" type="range" id="pageProgressRange" min="0" max="' + maxVal + '" value="' + current + '" ' + (canEdit ? '' : 'disabled') + '>' +
            '<div class="assign-select-row" style="align-items:center;margin-top:8px;">' +
            '<input type="number" id="currentPageInput" class="input-plain" min="0" value="' + current + '" style="flex:1;" ' + (canEdit ? '' : 'disabled') + '>' +
            '<span style="font-size:13px;color:var(--pencil);">/</span>' +
            '<input type="number" id="pageCountInput" class="input-plain" min="0" value="' + total + '" placeholder="총 쪽수" style="flex:1;" ' + (canEdit ? '' : 'disabled') + '>' +
            '<span style="font-size:13px;color:var(--pencil);">쪽</span>' +
            '</div>' + progressBarHtml(b) +
            (canEdit ? '<button class="btn-secondary" id="saveProgressBtn" style="margin-top:10px;">진행 저장</button>' : '<p style="font-size:11.5px;color:var(--pencil);margin-top:8px;">지금 읽는 사람만 수정할 수 있어요.</p>') +
            '</div>';
    }
    function renderBookDetail(id) {
        var b = getBook(id);
        if (!b) {
            currentView = 'home';
            return renderHome();
        }
        var reader = getMember(b.currentReaderId);
        var owner = getMember(b.ownerId);
        var queue = b.queue || [];
        var eligibleForHeart = state.members.filter(function (m) { return m.id !== b.currentReaderId && !queueHasMember(queue, m.id); });
        var myId = getLoggedInMemberId();
        var canDelete = !!myId && (!b.ownerId || b.ownerId === myId);
        // 찜하기(약한 위시리스트) — 외부 대여 도서·본인 소유 책은 제외, 승인 없이 자유롭게 토글
        var canHeart = !!myId && b.ownerId !== myId && !b.externalBorrow;
        var isHearted = !!(myId && (b.hearts || []).indexOf(myId) > -1);
        // "저도 이 책 있어요" — 남의 책인데 나도 같은 책을 소장하고 있으면 내 서고에도 등록.
        // 이미 같은 제목으로 내 서고에 있으면 다시 등록할 필요 없으니 버튼을 숨긴다.
        var iAlreadyHaveThisBook = !!myId && state.books.some(function (x) { return x.ownerId === myId && normalizeTitle_(x.title) === normalizeTitle_(b.title); });
        var canClaimCopy = !!myId && b.ownerId !== myId && !iAlreadyHaveThisBook;
        var currentReader = getMember(b.currentReaderId);
        // 이 책 추천해요 — 실제로 읽어본 사람만(책주인·지금 읽는 사람·읽은 기록이 있는 사람) 가능
        var myRecommendation = (b.recommendations || []).find(function (r) { return r.memberId === myId; });
        var hasReadThisBook = !!myId && (b.ownerId === myId || b.currentReaderId === myId
            || (b.history || []).some(function (h) { return h.memberId === myId; }));
        var canRecommend = hasReadThisBook;
        // 내 소장 미독서 책만 "다음에 읽을 책"으로 표시할 수 있다(우리서고 카드와 같은 체크박스).
        var wantToReadToggleHtml = (myId === b.ownerId && b.status === 'shelved')
            ? '<div style="margin-top:6px;"><label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink);cursor:pointer;"><input type="checkbox" class="want-to-read-checkbox" data-want-book="' + b.id + '" ' + (b.wantToRead ? 'checked' : '') + ' style="width:15px;height:15px;">다음에 읽을 책</label></div>'
            : '';
        // 이미 등록된 읽기 시작일/완독일도 나중에 고칠 수 있게 하는 연필 버튼.
        var canEditStartDate = b.status === 'reading' && !!myId && (myId === b.ownerId || myId === b.currentReaderId);
        var startDateEditBtnHtml = canEditStartDate ? ' <button class="btn-text" id="editStartDateBtn" style="padding:0;text-decoration:underline;">수정</button>' : '';
        var lastHistoryEntry = (b.history || [])[(b.history || []).length - 1] || null;
        var canEditLastHistory = b.status === 'finished' && !!myId && !!lastHistoryEntry && (myId === b.ownerId || myId === lastHistoryEntry.memberId);
        // 날짜 없이 대기 중인 사람에게, 뒤에서 경쟁자가 나타났음을 알려주는 배너.
        // ("읽기 신청"에 날짜를 필수로 만드는 대신, 실제로 경쟁이 생겼을 때만 알려준다)
        var myQueueEntry = queue.find(function (q) { return qMemberId(q) === myId; });
        var iAmDatelessQueued = !!(myQueueEntry && !myQueueEntry.desiredDate);
        var iAmDatelessReader = !!(myId && b.currentReaderId === myId && !b.nextExchangeDate);
        var hasCompetingQueueRequest = (b.queueRequests || []).some(function (r) { return r.memberId !== myId; });
        var nudgeBannerHtml = '';
        if (iAmDatelessQueued && hasCompetingQueueRequest) {
            nudgeBannerHtml = '<div class="field" style="background:var(--card-bg);border:1.5px solid var(--gold);border-radius:8px;padding:12px;margin-bottom:14px;">'
                + '<p style="font-size:12.5px;color:var(--ink);margin-bottom:10px;">⏰ 다른 사람이 이 책에 읽기 신청을 했어요. 대기 순서를 지키려면 날짜를 정해주세요 — 안 그러면 순서가 밀릴 수 있어요.</p>'
                + '<button class="btn-primary" id="setMyQueueDateBtn" style="margin-bottom:8px;">📅 내 날짜 정하기</button>'
                + '<button class="btn-text" style="color:var(--stamp);" id="giveUpMyQueueBtn">대기 포기하기</button>'
                + '</div>';
        } else if (iAmDatelessReader && hasCompetingQueueRequest) {
            nudgeBannerHtml = '<div class="field" style="background:var(--card-bg);border:1.5px solid var(--gold);border-radius:8px;padding:12px;margin-bottom:14px;">'
                + '<p style="font-size:12.5px;color:var(--ink);">⏰ 다른 사람이 이 책에 읽기 신청을 했어요. 아래 "제안·참석"으로 교환일을 정해주세요, 안 그러면 다음 사람에게 순서가 넘어갈 수 있어요.</p>'
                + '</div>';
        }
        var readActionHtml = '';
        if (!b.currentReaderId) {
            // 내 책이면 바로 읽기 시작, 남의 책이면(주인이 있는 책) 승인 절차(읽기 신청)를 거쳐야 한다.
            if (!myId || !b.ownerId || b.ownerId === myId) {
                readActionHtml = '<button class="btn-primary" id="startReadingBtn">📖 이 책 읽기</button>';
                // 'shelved'(안읽음) 책도 남이 바로 읽기 신청할 수 있어서, 완독 책과 마찬가지로
                // 책주인에게 승인/거절 UI를 보여줘야 한다(이전엔 'finished'에서만 보여서 안 보이던 버그).
                if (myId && myId === b.ownerId && b.status !== 'finished') {
                    var incomingReadRequestsShelved = (b.readRequests || []).filter(function (r) { return !r.counterDate; });
                    if (incomingReadRequestsShelved.length) {
                        readActionHtml += incomingReadRequestsSectionHtml_(b, incomingReadRequestsShelved);
                    }
                }
                // 책주인이 먼저 "빌려줄까?" 하고 특정 멤버에게 제안하는 기능 — 읽기 신청은
                // 읽고 싶은 사람이 먼저 움직여야 했는데, 이건 반대로 책주인이 먼저 움직인다.
                if (myId && myId === b.ownerId && !b.pendingReturn && !b.externalBorrow) {
                    readActionHtml += '<div style="margin-top:6px;"><button class="btn-secondary" id="proposeLendBtn">🤝 교환 제안하기</button></div>';
                    var myLendOffers = b.lendOffers || [];
                    if (myLendOffers.length) {
                        readActionHtml += '<div class="queue-list" style="margin-top:8px;">' + myLendOffers.map(function (o) {
                            var m = getMember(o.memberId);
                            if (!m) return '';
                            return '<div class="queue-item" style="flex-wrap:wrap;">'
                                + '<span class="qname">' + escapeHtml(m.name) + '님에게 제안함' + (o.desiredDate ? ' · ' + fmtDate(o.desiredDate) + ' 희망' : '') + '</span>'
                                + '<span style="font-size:11.5px;color:var(--pencil);">응답 기다리는 중</span>'
                                + '<button class="btn-text" style="color:var(--stamp);" data-decline-lend-offer="' + o.id + '" data-lend-book="' + b.id + '">제안 취소</button>'
                                + '</div>';
                        }).join('') + '</div>';
                    }
                }
            } else if (b.externalBorrow) {
                readActionHtml = '';
            } else {
                var myLendOffer_1 = (b.lendOffers || []).find(function (o) { return o.memberId === myId; });
                if (myLendOffer_1) {
                    readActionHtml = '<div class="field" style="background:var(--card-bg);border:1.5px solid var(--gold);border-radius:8px;padding:12px;margin-bottom:12px;">'
                        + '<p style="font-size:12.5px;color:var(--ink);margin-bottom:10px;">🤝 ' + escapeHtml((owner || {}).name || '책주인') + '님이 이 책을 빌려주고 싶어해요' + (myLendOffer_1.desiredDate ? ' (' + fmtDate(myLendOffer_1.desiredDate) + ' 희망)' : '') + '.</p>'
                        + '<button class="heart-btn" data-accept-lend-offer="' + myLendOffer_1.id + '" data-lend-book="' + b.id + '">수락</button>'
                        + '<button class="btn-text" style="color:var(--stamp);" data-decline-lend-offer="' + myLendOffer_1.id + '" data-lend-book="' + b.id + '">거절</button>'
                        + '</div>';
                }
                var myExistingRequest_1 = (b.readRequests || []).find(function (r) { return r.memberId === myId; });
                if (myExistingRequest_1) {
                    readActionHtml += '<p style="font-size:12.5px;color:var(--pencil);">신청했어요. 책주인의 승인을 기다리는 중이에요.</p>'
                        + '<button class="btn-secondary" data-cancel-request="' + myExistingRequest_1.id + '" data-request-book="' + b.id + '">신청 취소</button>';
                } else if (!myLendOffer_1) {
                    readActionHtml += '<button class="btn-primary" id="requestReadBtn">📖 읽기 신청</button>';
                }
            }
        }
        else if (b.currentReaderId === myId) {
            readActionHtml = '<button class="btn-secondary" id="markFinishedBtn">✓ 완독했어요</button>';
        }
        else {
            readActionHtml = '<button class="btn-secondary" disabled>📖 ' + escapeHtml((currentReader || {}).name || '다른 사람') + '님이 읽고 있어요</button>';
        }
        // "읽는 중 취소" — 대기열에서 너무 일찍 "넘기기"를 누르는 등 실수로 읽는 중이 된 걸
        // 되돌리는 복구용 액션. 책주인이나 지금 읽는 사람만 할 수 있다.
        if (myId && b.currentReaderId && (myId === b.ownerId || myId === b.currentReaderId)) {
            readActionHtml += '<div style="margin-top:6px;"><button class="btn-text" style="color:var(--stamp);" id="cancelReadingBtn">읽는 중 취소</button></div>';
        }
        var myQueued = !!(myId && queueHasMember(queue, myId));
        var finishedActionHtml = '';
        if (b.status === 'finished' && b.externalBorrow) {
            finishedActionHtml = '<p style="font-size:12.5px;color:var(--pencil);margin-bottom:12px;">🏛 도서관·모임 밖에서 빌려 읽은 책이에요. 개인 완독 기록용이라 읽기 신청이나 책장 기능은 없어요.</p>';
        } else if (b.status === 'finished') {
            if (b.pendingReturn) {
                var holder_1 = getMember(b.holderId);
                if (myId && myId === b.ownerId) {
                    finishedActionHtml += '<div class="field" style="background:var(--card-bg);border:1px solid var(--stamp);border-radius:8px;padding:10px 12px;margin-bottom:12px;">'
                        + '<p style="font-size:12.5px;color:var(--stamp);margin-bottom:8px;">📦 ' + escapeHtml((holder_1 || {}).name || '읽은 사람') + '님이 다 읽었어요. 책을 돌려받으면 반납을 확인해주세요.</p>'
                        + '<button class="btn-primary" id="confirmReturnBtn">반납받았어요</button>'
                        + '</div>';
                } else if (myId && myId === b.holderId) {
                    finishedActionHtml += '<p style="font-size:12.5px;color:var(--stamp);margin-bottom:12px;">📦 ' + escapeHtml((owner || {}).name || '책주인') + '님에게 반납해주세요.</p>';
                } else {
                    finishedActionHtml += '<p style="font-size:12.5px;color:var(--pencil);margin-bottom:12px;">📦 아직 책주인에게 반납되지 않았어요.</p>';
                }
            } else if (queue.length && myId && queueHasMember(queue, myId)) {
                finishedActionHtml += '<div class="field" style="margin-bottom:12px;"><button class="btn-primary" id="confirmPickupBtn">📦 받았어요</button></div>';
            }
            var myRequest_1 = (b.readRequests || []).find(function (r) { return r.memberId === myId; });
            var incomingReadRequests = (b.readRequests || []).filter(function (r) { return !r.counterDate; });
            if (myId && myId === b.ownerId && incomingReadRequests.length) {
                finishedActionHtml += incomingReadRequestsSectionHtml_(b, incomingReadRequests);
            }
            if (!myId || myId !== b.ownerId) {
                if (myRequest_1 && myRequest_1.counterDate) {
                    finishedActionHtml += '<div class="field"><label>읽기 신청</label><p style="font-size:12.5px;color:var(--pencil);margin-bottom:8px;">' + escapeHtml((owner || {}).name || '책주인') + '님이 ' + fmtDate(myRequest_1.counterDate) + '을 제안했어요.</p>'
                        + '<button class="heart-btn" data-approve-request="' + myRequest_1.id + '" data-request-book="' + b.id + '">수락</button>'
                        + '<button class="btn-text" style="color:var(--stamp);" data-reject-request="' + myRequest_1.id + '" data-request-book="' + b.id + '">거절</button></div>';
                } else if (myRequest_1) {
                    finishedActionHtml += '<div class="field"><label>읽기 신청</label><p style="font-size:12.5px;color:var(--pencil);margin-bottom:8px;">신청했어요. 책주인의 승인을 기다리는 중이에요.</p>'
                        + '<button class="btn-secondary" data-cancel-request="' + myRequest_1.id + '" data-request-book="' + b.id + '">신청 취소</button></div>';
                } else if (b.pendingReturn && b.holderId === myId) {
                    // 지금 반납해야 할 사람 본인 — 이미 읽은 책이라 신청할 이유가 없다.
                } else {
                    finishedActionHtml += '<div class="field"><button class="btn-primary" id="requestReadBtn">📖 읽기 신청</button></div>';
                }
            }
            // "재교환 시작" 같은 별도 단계 없이도 완독된 책은 이미 남이 바로 읽기 신청할 수 있다.
            // 책주인 본인이 다시 읽고 싶을 때만 직접 시작할 수 있게 해주면 된다(반납 대기 중이면 제외).
            if (myId && myId === b.ownerId && !b.pendingReturn) {
                finishedActionHtml += '<button class="btn-secondary" id="startReadingBtn" style="margin-top:8px;">📖 이 책 다시 읽기</button>';
            }
        }
        var pickExchangeDateBtnHtml = (b.status === 'reading' && myId === b.currentReaderId)
            ? '<button class="btn-text" id="pickBookExchangeDateBtn" style="margin-top:6px;">📅 있는 교환일 중에서 고르기</button>'
            : '';
        var queueActionHtml = '';
        if (b.status !== 'finished' && b.currentReaderId) {
            var myQueueRequest_1 = (b.queueRequests || []).find(function (r) { return r.memberId === myId; });
            var incomingRequests = (b.queueRequests || []).filter(function (r) { return !r.counterDate; });

            if (myId === b.currentReaderId && incomingRequests.length) {
                queueActionHtml += '<div class="section-label" style="margin:16px 0 8px;"><span class="num mono">W</span><h2>읽기 신청</h2><span class="line"></span></div>';
                queueActionHtml += '<div class="queue-list" style="margin-bottom:12px;">';
                queueActionHtml += incomingRequests.map(function (r) {
                    var m = getMember(r.memberId);
                    if (!m) return crossGroupRequestFallbackHtml_(r);
                    var dateText = r.desiredDate ? fmtDate(r.desiredDate) + ' 희망' : '날짜는 나중에';
                    return '<div class="queue-item" style="flex-wrap:wrap;">'
                        + '<div class="qavatar" style="' + avatarStyle(m.color) + '">' + avatarContent(m) + '</div>'
                        + '<span class="qname">' + escapeHtml(m.name) + ' · ' + dateText + '</span>'
                        + '<button class="heart-btn" data-accept-queue-request="' + r.id + '" data-queue-book="' + b.id + '" style="flex-shrink:0;">수락</button>'
                        + '<button class="btn-text" style="color:var(--stamp);" data-reject-queue-request="' + r.id + '" data-queue-book="' + b.id + '">거절</button>'
                        + '<button class="btn-text" data-counter-queue-request="' + r.id + '" data-queue-book="' + b.id + '">다른 날짜 제안</button>'
                        + '</div>';
                }).join('');
                queueActionHtml += '</div>';
            }

            if (myId && myId !== b.currentReaderId) {
                if (myQueued) {
                    queueActionHtml += '<div class="field" style="margin-top:16px;"><button class="heart-btn" id="removeMyQueueBtn">대기열에서 빠지기</button></div>';
                }
                else if (myQueueRequest_1 && myQueueRequest_1.counterDate) {
                    queueActionHtml += '<div class="field" style="margin-top:16px;"><label>읽기 신청</label><p style="font-size:12.5px;color:var(--pencil);margin-bottom:8px;">' + escapeHtml((reader || {}).name || '읽는 사람') + '님이 ' + fmtDate(myQueueRequest_1.counterDate) + '을 제안했어요.</p>'
                        + '<button class="heart-btn" data-accept-queue-request="' + myQueueRequest_1.id + '" data-queue-book="' + b.id + '">수락</button>'
                        + '<button class="btn-text" style="color:var(--stamp);" data-reject-queue-request="' + myQueueRequest_1.id + '" data-queue-book="' + b.id + '">거절</button></div>';
                }
                else if (myQueueRequest_1) {
                    queueActionHtml += '<div class="field" style="margin-top:16px;"><label>읽기 신청</label><p style="font-size:12.5px;color:var(--pencil);margin-bottom:8px;">신청했어요. 지금 읽는 사람의 응답을 기다리는 중이에요.</p>'
                        + '<button class="btn-secondary" data-reject-queue-request="' + myQueueRequest_1.id + '" data-queue-book="' + b.id + '">신청 취소</button></div>';
                }
                else {
                    queueActionHtml += '<div class="field" style="margin-top:16px;"><button class="heart-btn" id="addMyQueueBtn">📖 읽기 신청</button></div>';
                }
            }
            else if (!myId) {
                queueActionHtml += '<div class="field" style="margin-top:16px;"><button class="heart-btn" id="loginForQueueBtn">로그인하고 신청하기</button></div>';
            }
        }

        // ---------- 여기부터 화면에 보일 순서대로 조립한다 ----------
        // (헤더 → 넛지 배너 → 주요 액션 → 대기열/신청 처리 → 진행률 → 읽은 기록 →
        //  댓글 → 기록 사진 → 부가 정보(교환일 포함) 순. 교환일은 이제 우선순위가 낮아져
        //  맨 아래 "부가 정보" 카드로 내렸다 — 예전엔 이 자리가 주요 액션 바로 위였다.)

        var headerHtml = '<button class="back-btn" id="backToHome">← 목록으로</button>'
            + '<div class="detail-header">'
            + '<div class="detail-thumb">' + bookThumbHtml(b, 'detail') + '</div>'
            + '<div style="flex:1;">'
            + '<div class="detail-title">' + escapeHtml(b.title) + '</div>'
            + '<div class="detail-author">' + escapeHtml(b.author || '저자 미상') + '</div>'
            + '<div class="detail-author">책주인: ' + (owner ? escapeHtml(owner.name) : '알 수 없음') + '</div>'
            + (reader
                ? '<span class="stamp">READING</span> <span class="reader-name">' + escapeHtml(reader.name) + '</span>'
                : (b.status === 'finished'
                    ? '<span class="stamp done">DONE</span>' + (b.externalBorrow ? ' <span class="stamp" style="color:var(--pencil);border-color:var(--pencil);">🏛 외부 대여</span>' : '')
                    : '<span class="queue-empty">지금 읽는 사람 없음</span>'))
            + (canHeart ? '<div style="margin-top:6px;"><button class="heart-btn" id="toggleHeartBtn">' + (isHearted ? '❤️ 찜함' : '🤍 찜하기') + '</button></div>' : '')
            + (canClaimCopy ? '<div style="margin-top:6px;"><button class="heart-btn" id="claimBookCopyBtn">📚 저도 이 책 있어요</button></div>' : '')
            + (canRecommend ? '<div style="margin-top:6px;"><button class="heart-btn" id="toggleRecommendBtn">' + (myRecommendation ? '⭐ 추천함' : '⭐ 이 책 추천해요') + '</button></div>' : '')
            + wantToReadToggleHtml
            + (canDelete ? '<div><button class="edit-icon-btn" id="editBookInfoBtn">제목·저자 수정</button><button class="edit-icon-btn" style="color:var(--stamp);" id="deleteBookBtn">책 삭제</button></div>' : '')
            + '</div>'
            + '</div>';

        var mainActionHtml = b.status !== 'finished'
            ? '<div class="field">' + readActionHtml + '</div>'
            : finishedActionHtml;

        var queueSectionHtml = '<div class="section-label"><span class="num mono">Q</span><h2>대기열</h2><span class="line"></span></div>'
            + (queue.length
                ? '<div class="queue-list">' + queue.map(function (q, i) {
                    var mid = qMemberId(q);
                    var m = getMember(mid);
                    if (!m) return '';
                    var desired = (typeof q === 'object' && q.desiredDate) ? q.desiredDate : null;
                    var isMatch = desired && b.nextExchangeDate && desired === b.nextExchangeDate;
                    var canPassToNext = !!(myId && myId === b.ownerId && !b.pendingReturn && (!b.currentReaderId || b.currentReaderId === myId));
                    var canRemove = myId && (myId === mid || myId === b.currentReaderId || canPassToNext);
                    var qActionButtons = canRemove ? '<button class="btn-text" style="color:var(--stamp);" data-remove-queue="' + b.id + '" data-remove-member="' + mid + '">빼기</button>' : '';
                    if (myId === b.currentReaderId || canPassToNext) {
                        qActionButtons += '<button class="btn-text" data-pass-to="' + mid + '" data-pass-book="' + b.id + '"' + (desired ? ' data-pass-desired-date="' + desired + '"' : '') + '>넘기기</button>';
                        if (!desired) {
                            var sharedDate_1 = (state.confirmedExchangeDates || []).find(function (d) { return d.memberIds.indexOf(myId) > -1 && d.memberIds.indexOf(mid) > -1; });
                            if (sharedDate_1) {
                                qActionButtons += '<button class="btn-text" style="color:var(--gold);" data-suggest-date="' + sharedDate_1.date + '" data-suggest-member="' + mid + '" data-suggest-book="' + b.id + '">' + escapeHtml(m.name) + '님과 이미 ' + fmtDate(sharedDate_1.date) + '에 만나요 · 이 책도 제안</button>';
                            }
                        }
                    }
                    return '<div class="queue-item ' + (i === 0 ? 'first' : '') + '" style="flex-wrap:wrap;">'
                        + '<span class="qnum mono">' + (i + 1) + '</span>'
                        + '<div class="qavatar" style="' + avatarStyle(m.color) + '">' + avatarContent(m) + '</div>'
                        + '<span class="qname">' + escapeHtml(m.name) + (desired ? ' <span style="color:' + (isMatch ? 'var(--stamp)' : 'var(--pencil)') + ';font-weight:' + (isMatch ? '700' : '400') + ';">' + (isMatch ? '🔁 교환일 일치' : '· 희망') + ' ' + fmtDate(desired) + '</span>' : '') + '</span>'
                        + (i === 0 ? '<span class="qtag">다음 차례</span>' : '')
                        + qActionButtons
                        + '</div>';
                }).join('') + '</div>'
                : '<p style="color:var(--pencil);font-size:13px;">아직 읽기 신청한 사람이 없어요.</p>')
            + queueActionHtml;

        var historyHtml = (b.history || []).length
            ? '<div class="section-label"><span class="num mono">H</span><h2>읽은 기록</h2><span class="line"></span></div>'
                + '<div class="queue-list" style="margin-bottom:6px;">'
                + [].concat(b.history || []).reverse().map(function (h, i) {
                    var m = getMember(h.memberId);
                    if (!m) return '';
                    var range = h.endDate ? fmtDateFull(h.startDate) + ' ~ ' + fmtDateFull(h.endDate) : fmtDateFull(h.startDate) + ' ~ 읽는 중';
                    var reviewHtml = h.review ? '<p style="font-size:12.5px;color:var(--ink-soft);line-height:1.5;margin:2px 0 8px 42px;">' + escapeHtml(h.review) + '</p>' : '';
                    var editHtml = (i === 0 && canEditLastHistory) ? '<button class="btn-text" data-edit-last-history="1" style="padding:0;text-decoration:underline;margin-left:6px;">수정</button>' : '';
                    return '<div class="queue-item">'
                        + '<div class="qavatar" style="' + avatarStyle(m.color) + '">' + avatarContent(m) + '</div>'
                        + '<span class="qname">' + escapeHtml(m.name) + '</span>'
                        + '<span class="date-range">' + range + '</span>' + editHtml
                        + '</div>' + reviewHtml;
                }).join('')
                + '</div>'
            : '';

        var commentsHtml = '<div class="section-label"><span class="num mono">C</span><h2>댓글</h2><span class="line"></span></div>'
            + '<div class="assign-select-row" style="margin-bottom:12px;">'
            + '<input type="text" id="quickCommentInput" class="input-plain" placeholder="이거 재밌어? 짧은 한마디..." maxlength="300" style="flex:1;">'
            + '<button class="heart-btn" id="quickCommentBtn" style="flex-shrink:0;">남기기</button>'
            + '</div>'
            + '<div class="entry-list" style="margin-bottom:20px;">'
            + ((b.photos || []).filter(function (p) { return p.type === 'comment'; }).length
                ? (b.photos || []).filter(function (p) { return p.type === 'comment'; }).map(function (p) {
                    var author = getMember(p.authorId);
                    return '<div class="entry-item text-only">'
                        + '<div class="entry-body">'
                        + '<div class="entry-caption">' + escapeHtml(p.caption) + '</div>'
                        + '<div class="entry-meta">'
                        + (author ? '<span class="entry-author"><span class="entry-avatar-dot" style="' + avatarStyle(author.color) + '"></span>' + escapeHtml(author.name) + '</span>' : '')
                        + '<span class="entry-date">' + fmtDateFull((p.createdAt || '').slice(0, 10)) + '</span>'
                        + recordHeartBtnHtml_('book', b.id, p.id, null, p.hearts)
                        + '<button class="btn-text" style="color:var(--stamp);margin-left:auto;" data-delete-entry="' + p.id + '">삭제</button>'
                        + '</div></div></div>';
                }).join('')
                : '<p style="color:var(--pencil);font-size:13px;">아직 댓글이 없어요.</p>')
            + '</div>';

        var photosHtml = '<div class="section-label"><span class="num mono">P</span><h2>기록 사진</h2><span class="line"></span></div>'
            + '<button class="btn-secondary" id="addEntryBtn" style="margin-bottom:14px;">＋ 사진 남기기</button>'
            + '<div class="entry-list">'
            + ((b.photos || []).filter(function (p) { return p.type === 'photo'; }).length
                ? (b.photos || []).filter(function (p) { return p.type === 'photo'; }).map(function (p) {
                    var author = getMember(p.authorId);
                    var idx = (b.photos || []).indexOf(p);
                    return '<div class="entry-item">'
                        + '<div class="entry-photo" data-lightbox="' + idx + '"><img src="' + p.url + '"></div>'
                        + '<div class="entry-body">'
                        + (p.caption ? '<div class="entry-caption">' + escapeHtml(p.caption) + '</div>' : '')
                        + '<div class="entry-meta">'
                        + (author ? '<span class="entry-author"><span class="entry-avatar-dot" style="' + avatarStyle(author.color) + '"></span>' + escapeHtml(author.name) + '</span>' : '')
                        + '<span class="entry-date">' + fmtDateFull((p.createdAt || '').slice(0, 10)) + '</span>'
                        + recordHeartBtnHtml_('book', b.id, p.id, null, p.hearts)
                        + '<button class="btn-text" style="color:var(--stamp);margin-left:auto;" data-delete-entry="' + p.id + '">삭제</button>'
                        + '</div></div></div>';
                }).join('')
                : '<p style="color:var(--pencil);font-size:13px;">아직 사진이 없어요. 밑줄 친 페이지 사진을 남겨보세요.</p>')
            + '</div>'
            + '<input type="file" id="photoFileInput" accept="image/*" style="display:none;">';

        var infoCardHtml = '<div class="section-label"><span class="num mono">I</span><h2>정보</h2><span class="line"></span></div>'
            + '<div style="display:flex;gap:8px;margin-bottom:16px;">'
            + '<a class="btn-secondary" style="margin-top:0;text-align:center;text-decoration:none;flex:1;" target="_blank" rel="noopener" href="https://www.google.com/search?q=' + encodeURIComponent(b.title + ' ' + (b.author || '')) + '">🔍 구글에서 보기</a>'
            + '<a class="btn-secondary" style="margin-top:0;text-align:center;text-decoration:none;flex:1;" target="_blank" rel="noopener" href="https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=Book&SearchWord=' + encodeURIComponent(b.title) + '">📗 알라딘에서 보기</a>'
            + '</div>'
            + '<div class="info-grid">'
            + '<div class="info-box"><div class="ib-label">시작일</div><div class="ib-value">' + (b.startDate ? fmtDateFull(b.startDate) : '—') + startDateEditBtnHtml + '</div></div>'
            + '<div class="info-box"><div class="ib-label">이 책의 교환일</div><div class="ib-value">' + (b.nextExchangeDate ? fmtDateFull(b.nextExchangeDate) : '미정') + '</div></div>'
            + (b.publisher ? '<div class="info-box"><div class="ib-label">출판사</div><div class="ib-value">' + escapeHtml(b.publisher) + '</div></div>' : '')
            + (b.isbn13 ? '<div class="info-box"><div class="ib-label">ISBN</div><div class="ib-value mono" style="font-size:11px;">' + escapeHtml(b.isbn13) + '</div></div>' : '')
            + '</div>'
            + (b.status !== 'finished'
                ? '<div class="field">'
                    + '<label>이 책의 교환일</label>'
                    + '<div class="assign-select-row">'
                    + '<div class="info-box" style="flex:1;"><div class="ib-value">' + (b.nextExchangeDate ? fmtDateFull(b.nextExchangeDate) : '아직 안 정함') + '</div></div>'
                    + '<button class="heart-btn" id="openExchangeVoteBtn">제안·참석</button>'
                    + '</div>'
                    + pickExchangeDateBtnHtml
                    + '</div>'
                : '');

        return headerHtml
            + '\n\n    ' + nudgeBannerHtml
            + '\n\n    ' + mainActionHtml
            + '\n\n    ' + queueSectionHtml
            + '\n\n    ' + (b.status === 'reading' ? progressDetailHtml(b) : '')
            + '\n\n    ' + historyHtml
            + '\n\n    ' + commentsHtml
            + '\n\n    ' + photosHtml
            + '\n\n    ' + infoCardHtml;
    }
    // ---------- MODALS ----------
    function openModal(html) {
        document.getElementById('modalSheet').innerHTML = html + "<button class=\"close-x\" id=\"modalCloseX\">\u2715</button>";
        document.getElementById('modalBackdrop').classList.add('open');
        document.getElementById('modalCloseX').onclick = closeModal;
        document.getElementById('modalBackdrop').onclick = function (e) { if (e.target.id === 'modalBackdrop')
            closeModal(); };
    }
    function closeModal() { document.getElementById('modalBackdrop').classList.remove('open'); }
    function setBtnLoading(btn, loadingText) {
        btn.dataset.originalText = btn.textContent;
        btn.textContent = loadingText || '처리 중...';
        btn.disabled = true;
    }
    function resetBtn(btn) {
        if (btn.dataset.originalText)
            btn.textContent = btn.dataset.originalText;
        btn.disabled = false;
    }
    var DAY_LABELS = [['mon', '월'], ['tue', '화'], ['wed', '수'], ['thu', '목'], ['fri', '금'], ['sat', '토'], ['sun', '일']];
    function dayCheckboxesHtml(idPrefix, selectedDays) {
        var selected = Array.isArray(selectedDays) ? selectedDays : [];
        return "\n    <div style=\"display:flex;gap:6px;flex-wrap:wrap;\">\n      ".concat(DAY_LABELS.map(function (_a) {
            var _b = __read(_a, 2), key = _b[0], label = _b[1];
            return "\n        <label style=\"display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;\">\n          <input type=\"checkbox\" class=\"".concat(idPrefix, "-day-checkbox\" value=\"").concat(key, "\" ").concat(selected.includes(key) ? 'checked' : '', " style=\"width:18px;height:18px;\">\n          <span style=\"font-size:11px;color:var(--ink-soft);\">").concat(label, "</span>\n        </label>\n      ");
        }).join(''), "\n    </div>\n    <p style=\"font-size:11px;color:var(--pencil);margin-top:6px;\">\uC544\uBB34 \uC694\uC77C\uB3C4 \uC120\uD0DD \uC548 \uD558\uBA74 \uB9E4\uC77C \uC54C\uB9BC\uC774 \uAC00\uC694.</p>\n  ");
    }
    function getCheckedDays(idPrefix) {
        return Array.from(document.querySelectorAll('.' + idPrefix + '-day-checkbox:checked')).map(function (el) { return el.value; });
    }
    function getReadingBooksForMember(memberId) {
        return state.books.filter(function (b) { return b.status === 'reading' && b.currentReaderId === memberId; });
    }
    function readingBookCheckboxesHtml(memberId, prefix) {
        var books = getReadingBooksForMember(memberId);
        if (!memberId)
            return '<p style="font-size:12px;color:var(--pencil);line-height:1.6;">로그인하면 지금 읽는 책을 골라 교환일에 참여할 수 있어요.</p>';
        var html = '';
        if (books.length) {
            html += '<div class="card-stack" style="gap:8px;">' + books.map(function (b) {
                return '<label class="due-card" style="cursor:pointer;box-shadow:none;padding:0;">'
                    + '<div class="due-card-top" style="align-items:center;">'
                    + '<input type="checkbox" class="' + prefix + '-book-checkbox" value="' + escapeHtml(b.id) + '" checked style="width:18px;height:18px;">'
                    + '<div class="book-thumb" style="width:38px;height:54px;">' + bookThumbHtml(b) + '</div>'
                    + '<div class="due-card-info"><div class="title" style="font-size:14px;">' + escapeHtml(b.title) + '</div>'
                    + '<div class="author">' + escapeHtml(b.author || '저자 미상') + '</div></div>'
                    + '</div></label>';
            }).join('') + '</div>';
        } else {
            html += '<p style="font-size:12px;color:var(--pencil);line-height:1.6;margin-bottom:8px;">지금 읽고 있는 책이 없어요.</p>';
        }
        html += '<label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;">'
            + '<input type="checkbox" class="' + prefix + '-receive-only-checkbox" style="width:18px;height:18px;"' + (books.length ? '' : ' checked disabled') + '>'
            + '<span style="font-size:13px;color:var(--ink);">이번엔 받기만 할게요 (가져갈 책 없이 참석)</span></label>';
        return html;
    }
    function selectedReadingBookIds(prefix) {
        return Array.prototype.slice.call(document.querySelectorAll('.' + prefix + '-book-checkbox:checked')).map(function (el) { return el.value; });
    }
    function isReceiveOnly_(prefix) {
        var el = document.querySelector('.' + prefix + '-receive-only-checkbox');
        return !!(el && el.checked);
    }
    function openReadingBookPicker(title, submitText, onSubmit) {
        requireLogin(function (myId) {
            openModal('<h3>' + escapeHtml(title) + '</h3>'
                + '<p style="font-size:12.5px;color:var(--pencil);margin-bottom:12px;line-height:1.6;">동시에 여러 권을 읽고 있다면, 이 교환일에 가져갈 책만 골라주세요. 가져갈 책이 없으면 "받기만 할게요"를 선택해주세요.</p>'
                + readingBookCheckboxesHtml(myId, 'modalReadingPick')
                + '<button class="btn-primary" id="submitReadingBookPickBtn" style="margin-top:14px;">' + escapeHtml(submitText) + '</button>');
            var btn = document.getElementById('submitReadingBookPickBtn');
            btn.onclick = function () {
                var bookIds = selectedReadingBookIds('modalReadingPick');
                if (!bookIds.length && !isReceiveOnly_('modalReadingPick')) {
                    showToast('가져갈 책을 선택하거나 "받기만 할게요"를 선택해주세요', true);
                    return;
                }
                closeModal();
                onSubmit(myId, bookIds);
            };
        });
    }
    function renderProposalListHtml() {
        var proposals = visibleProposals_();
        if (proposals.length === 0) {
            return "<p style=\"font-size:12.5px;color:var(--pencil);padding:6px 0 14px;\">아직 제안된 날짜가 없어요.</p>";
        }
        var sorted = proposals.slice().sort(function (a, b) { return (b.votes || []).length - (a.votes || []).length; });
        return '<div class="card-stack" style="gap:10px;margin-bottom:14px;">' + sorted.map(function (p) {
            var votes = p.votes || [];
            var names = memberNamesText(votes);
            var bookCount = 0;
            var byMember = p.bookIdsByMember || {};
            Object.keys(byMember).forEach(function (mid) { bookCount += (byMember[mid] || []).length; });
            return '<div class="due-card" style="cursor:default;">' +
                '<div class="due-card-top" style="align-items:center;"><div class="due-card-info">' +
                '<div class="title" style="font-size:15px;">' + fmtDateFull(p.date) + '</div>' +
                '<div class="title" style="font-size:18px;color:var(--stamp);margin-top:6px;">👥 ' + votes.length + '명 참석' + (bookCount ? ' · 📚 ' + bookCount + '권' : '') + '</div>' +
                '<div class="author">' + (names ? '참석: ' + escapeHtml(names) : '아직 참석자가 없어요') + '</div>' +
                '</div></div>' +
                '<div class="due-card-bottom" style="flex-wrap:wrap;gap:8px;">' +
                '<button class="heart-btn vote-toggle-btn" data-proposal="' + p.id + '">🙋 참석할래요</button>' +
                '<button class="btn-text" style="color:var(--stamp);margin-left:auto;" data-delete-proposal="' + p.id + '">삭제</button>' +
                '</div>' +
                '<p style="font-size:10.5px;color:var(--pencil);padding:0 12px 10px;margin-top:-4px;">참석하면 선택한 책에 바로 교환일이 표시돼요.</p>' +
                '</div>';
        }).join('') + '</div>';
    }

    function openSetExchangeDateModal() {
        var _this = this;
        var confirmedDates = state.confirmedExchangeDates || [];
        openModal("\n    <h3>\uB2E4\uC74C \uAD50\uD658\uC77C</h3>\n    <p style=\"font-size:12.5px;color:var(--pencil);margin-bottom:10px;\">\uCC38\uC11D \uAC00\uB2A5\uD55C \uC0AC\uB78C\uC774 \uBAA8\uC5EC \uB2E4\uC74C \uAD50\uD658\uC77C\uC744 \uC815\uD574\uC694. \uCC38\uC11D\uD560 \uC0AC\uB78C\uB9CC \uB20C\uB7EC\uC8FC\uC138\uC694.</p>\n    ".concat(confirmedDates.length ? "\n      <div class=\"section-label\" style=\"margin:0 0 8px;\"><span class=\"num mono\">D</span><h2>\uD655\uC815\uB41C \uAD50\uD658\uC77C</h2><span class=\"line\"></span></div>\n      <div class=\"card-stack\" style=\"gap:8px;margin-bottom:16px;\">\n        ".concat(confirmedDates.map(function (d) { return "\n          <div class=\"due-card\" style=\"cursor:default;\">\n            <div class=\"due-card-top\" style=\"padding-bottom:8px;\">\n              <div class=\"due-card-info\">\n                <div class=\"title\" style=\"font-size:15px;\">".concat(fmtDateFull(d.date), "</div>\n                <div class=\"author\">").concat(escapeHtml(memberNamesText(d.memberIds)) || '아직 아무도 없음', "</div>\n              </div>\n            </div>\n            <div class=\"due-card-bottom\" style=\"padding-top:0;gap:8px;\">\n              <button class=\"heart-btn modal-join-date-btn\" data-date=\"").concat(d.date, "\">\uD83D\uDE4B \uC800\uB3C4 \uAC08\uB798\uC694</button>\n              <button class=\"btn-text\" style=\"color:var(--stamp);margin-left:auto;\" data-cancel-date-modal=\"").concat(d.date, "\">\uC800\uB294 \uBE60\uC9C8\uAC8C\uC694</button>\n            </div>\n          </div>\n        "); }).join(''), "\n      </div>\n    ") : '', "\n\n    <div class=\"section-label\" style=\"margin:0 0 8px;\"><span class=\"num mono\">V</span><h2>\uC81C\uC548\uB41C \uB0A0\uC9DC</h2><span class=\"line\"></span></div>\n    <div id=\"proposalListBox\">").concat(renderProposalListHtml(), "</div>\n\n    <div class=\"field\">\n      <label>새 날짜 제안에 올릴 책</label>\n      ").concat(readingBookCheckboxesHtml(getLoggedInMemberId(), 'proposalBook'), "\n    </div>\n\n    <div class=\"field\">\n      <label>\uC0C8 \uB0A0\uC9DC \uC81C\uC548\uD558\uAE30</label>\n      <div class=\"assign-select-row\">\n        <input type=\"date\" id=\"newProposalDateInput\" style=\"flex:1;\">\n        <button class=\"btn-primary\" id=\"submitProposalBtn\" style=\"flex-shrink:0;width:auto;\">\uC81C\uC548\uD558\uAE30</button>\n      </div>\n    </div>\n  "));
        wireProposalListEvents();
        document.querySelectorAll('.modal-join-date-btn').forEach(function (btn) {
            btn.onclick = function () {
                closeModal();
                openJoinExchangeDateMemberPicker(btn.dataset.date);
            };
        });
        document.querySelectorAll('[data-cancel-date-modal]').forEach(function (btn) {
            btn.onclick = function () {
                closeModal();
                openLeaveExchangeDateMemberPicker(btn.dataset.cancelDateModal);
            };
        });
        document.getElementById('submitProposalBtn').onclick = function (e) {
            var date = document.getElementById('newProposalDateInput').value;
            if (!date) {
                showToast('날짜를 선택해주세요', true);
                return;
            }
            requireLogin(function (myId) { return __awaiter(_this, void 0, void 0, function () {
                var err_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            setBtnLoading(e.target, '제안하는 중...');
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, callServer('proposeExchangeDate', myId, date, selectedReadingBookIds('proposalBook'))];
                        case 2:
                            applyState(_a.sent());
                            return [4 /*yield*/, Promise.resolve()];
                        case 3:
                            _a.sent();
                            resetBtn(e.target);
                            document.getElementById('newProposalDateInput').value = '';
                            refreshProposalListInModal();
                            showToast('날짜를 제안했어요');
                            return [3 /*break*/, 5];
                        case 4:
                            err_1 = _a.sent();
                            showToast(err_1.message || '제안에 실패했어요', true);
                            resetBtn(e.target);
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            }); });
        };
    }
    function refreshProposalListInModal() {
        var box = document.getElementById('proposalListBox');
        if (!box)
            return;
        box.innerHTML = renderProposalListHtml();
        wireProposalListEvents();
    }
    function wireProposalListEvents() {
        var _this = this;
        document.querySelectorAll('.vote-toggle-btn').forEach(function (btn) {
            btn.onclick = function () { return toggleMyVote(btn.dataset.proposal, function () { return refreshProposalListInModal(); }); };
        });
        document.querySelectorAll('[data-delete-proposal]').forEach(function (btn) {
            btn.onclick = function () { return __awaiter(_this, void 0, void 0, function () {
                var err_3;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 3, , 4]);
                            return [4 /*yield*/, callServer('deleteExchangeProposal', btn.dataset.deleteProposal)];
                        case 1:
                            applyState(_a.sent());
                            return [4 /*yield*/, Promise.resolve()];
                        case 2:
                            _a.sent();
                            refreshProposalListInModal();
                            showToast('제안을 삭제했어요');
                            return [3 /*break*/, 4];
                        case 3:
                            err_3 = _a.sent();
                            showToast(err_3.message || '삭제 실패', true);
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            }); };
        });
    }
    function openVoteMemberPickerHome(proposalId) {
        toggleMyVote(proposalId, function () { return render(); });
    }
    function toggleMyVote(proposalId, onDone) {
        var proposal = (state.exchangeProposals || []).find(function (p) { return p.id === proposalId; });
        if (!proposal)
            return;
        var myIdNow = getLoggedInMemberId();
        var alreadyVoted = myIdNow && (proposal.votes || []).includes(myIdNow);
        if (alreadyVoted) {
            requireLogin(function (myId) {
                callServer('voteExchangeProposal', proposalId, myId, false, [])
                    .then(applyState)
                    .then(function () {
                    if (onDone)
                        onDone();
                    else
                        render();
                    showToast('참석을 취소했어요');
                })
                    .catch(function (err) { return showToast(err.message || '실패', true); });
            });
            return;
        }
        openReadingBookPicker('어떤 책을 가져갈까요?', '🙋 참석할래요', function (myId, bookIds) {
            callServer('voteExchangeProposal', proposalId, myId, true, bookIds)
                .then(applyState)
                .then(function () {
                if (onDone)
                    onDone();
                else
                    render();
                showToast('참석할게요!');
            })
                .catch(function (err) { return showToast(err.message || '실패', true); });
        });
    }
    function openLeaveExchangeDateMemberPicker(dateStr) {
        var _this = this;
        requireLogin(function (myId) { return __awaiter(_this, void 0, void 0, function () {
            var group, memberIds, err_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        group = (state.confirmedExchangeDates || []).find(function (d) { return d.date === dateStr; });
                        memberIds = group ? group.memberIds : [];
                        if (!memberIds.includes(myId)) {
                            showToast('이 교환일에 속해있지 않아요', true);
                            return [2 /*return*/];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, callServer('leaveExchangeDate', dateStr, myId)];
                    case 2:
                        applyState(_a.sent());
                        return [4 /*yield*/, Promise.resolve()];
                    case 3:
                        _a.sent();
                        render();
                        showToast('교환일에서 빠졌어요');
                        return [3 /*break*/, 5];
                    case 4:
                        err_5 = _a.sent();
                        showToast(err_5.message || '실패', true);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        }); });
    }
    function openJoinExchangeDateMemberPicker(dateStr) {
        var myIdNow = getLoggedInMemberId();
        var group = (state.confirmedExchangeDates || []).find(function (d) { return d.date === dateStr; });
        var already = group ? group.memberIds : [];
        if (myIdNow && already.includes(myIdNow)) {
            showToast('이미 이 교환일에 참여하고 있어요', true);
            return;
        }
        openReadingBookPicker(fmtDateFull(dateStr) + '에 가져갈 책', '🙋 저도 갈래요', function (myId, bookIds) {
            callServer('joinExchangeDate', dateStr, myId, bookIds)
                .then(applyState)
                .then(function () {
                render();
                showToast('이 교환일에 참여했어요');
            })
                .catch(function (err) { return showToast(err.message || '실패', true); });
        });
    }
    function renderLoginStatusUI() {
        var box = document.getElementById('loginStatusBox');
        if (!box) return;
        var m = getLoggedInMember();
        if (m) {
            box.innerHTML = '<div class="login-pill" id="loginPill"><div class="avatar-circle" style="' + avatarStyle(m.color) + '">' + avatarContent(m) + '</div><span>' + escapeHtml(m.name) + '</span></div>';
            document.getElementById('loginPill').onclick = function () {
                currentView = 'myPage';
                render();
            };
        } else {
            box.innerHTML = '';
        }
    }
    function openAccountSwitchModal() {
        var groups = (window.__MY_MEMBERSHIPS__ || []);
        var current = window.__CURRENT_GROUP_ID__;
        var switchHtml = groups.length > 1
            ? '<div class="card-stack" style="margin-bottom:14px;">' + groups.map(function (g) {
                return '<button class="due-card" style="cursor:pointer;text-align:left;' + (g.group_id === current ? 'border-color:var(--stamp);' : '') + '" data-switch-group="' + g.group_id + '">'
                    + '<div class="due-card-top"><div class="due-card-info"><div class="title" style="font-size:15px;">' + escapeHtml(g.group_name) + '</div>'
                    + '<div class="author">' + escapeHtml(g.display_name) + (g.group_id === current ? ' · 지금 보는 중' : '') + '</div></div></div></button>';
            }).join('') + '</div>'
            : '';
        openModal('<h3>그룹 전환</h3>'
            + '<p style="font-size:13px;color:var(--ink-soft);margin-bottom:16px;">지금 <strong>' + escapeHtml((getLoggedInMember() || {}).name || '') + '</strong>(으)로 로그인돼 있어요.</p>'
            + switchHtml
            + '<button class="btn-secondary" id="joinAnotherGroupBtn">다른 그룹 참가하기</button>'
            + '<button class="btn-text" id="logoutBtn" style="width:100%;margin-top:10px;color:var(--stamp);">로그아웃</button>');
        document.querySelectorAll('[data-switch-group]').forEach(function (btn) {
            btn.onclick = function () {
                closeModal();
                if (window.__switchGroup__) window.__switchGroup__(btn.dataset.switchGroup);
            };
        });
        document.getElementById('joinAnotherGroupBtn').onclick = function () {
            closeModal();
            if (window.__promptJoinGroup__) window.__promptJoinGroup__();
        };
        document.getElementById('logoutBtn').onclick = function () {
            closeModal();
            if (window.__signOut__) window.__signOut__();
        };
    }
    /**
     * 멤버 초대는 이제 "가입"이 아니라 초대 코드 공유로 이뤄진다 — 예전 openAddMemberModal
     * 자리를 대신한다. 실제 코드 표시는 app.js의 __showInviteCode__가 담당.
     */
    function openAddMemberModal() {
        if (window.__showInviteCode__) {
            window.__showInviteCode__();
        } else {
            showToast('초대 코드를 불러올 수 없어요', true);
        }
    }
    function openEditMemberProfileModal(memberId) {
        var m = getMember(memberId);
        if (!m) return;
        var colorSwatches = COLORS.map(function (c) { return '<div class="color-swatch" style="background:' + c + ';" data-color="' + c + '"></div>'; }).join('');
        var pendingPhotoUrl = m.photoUrl || null;
        openModal('<h3>프로필 수정</h3>'
            + '<div class="field" style="text-align:center;">'
            + '<div class="avatar-circle" id="editProfilePhotoPreview" style="width:76px;height:76px;font-size:28px;margin:0 auto 10px;' + avatarStyle(m.color) + '">' + avatarContent(m) + '</div>'
            + '<input type="file" accept="image/*" id="editMemberPhotoInput" style="display:none;">'
            + '<button type="button" class="btn-text" id="choosePhotoBtn" style="text-decoration:underline;">사진 바꾸기</button>'
            + (m.photoUrl ? '<button type="button" class="btn-text" id="removePhotoBtn" style="color:var(--stamp);text-decoration:underline;margin-left:10px;">사진 지우기</button>' : '')
            + '</div>'
            + '<div class="field"><label>이름</label><input type="text" id="editMemberName" value="' + escapeHtml(m.name) + '" maxlength="12"></div>'
            + '<div class="field"><label>이모지 (선택, 사진 없을 때만 보여요)</label><input type="text" id="editMemberEmoji" value="' + escapeHtml(m.emoji || '') + '" maxlength="4" style="font-size:20px;"></div>'
            + '<div class="field"><label>색상 (사진·이모지 없을 때 배경색)</label><div class="color-picker" id="editColorPicker">' + colorSwatches + '</div></div>'
            + '<div class="field"><label>관심 장르 · 한 줄 소개 (선택)</label><textarea id="editMemberBio" maxlength="200">' + escapeHtml(m.bio || '') + '</textarea></div>'
            + '<button class="btn-primary" id="saveMemberProfileBtn">저장하기</button>');

        var selectedColor = m.color;
        var swatches = document.querySelectorAll('#editColorPicker .color-swatch');
        swatches.forEach(function (sw) {
            if (sw.dataset.color === selectedColor) sw.classList.add('selected');
            sw.onclick = function () {
                swatches.forEach(function (s) { return s.classList.remove('selected'); });
                sw.classList.add('selected');
                selectedColor = sw.dataset.color;
            };
        });

        var photoInput = document.getElementById('editMemberPhotoInput');
        document.getElementById('choosePhotoBtn').onclick = function () { photoInput.click(); };
        photoInput.onchange = async function () {
            var file = photoInput.files && photoInput.files[0];
            if (!file) return;
            var preview = document.getElementById('editProfilePhotoPreview');
            var localUrl = URL.createObjectURL(file);
            preview.innerHTML = '<img src="' + localUrl + '" style="width:100%;height:100%;object-fit:cover;display:block;">';
            try {
                pendingPhotoUrl = await window.__uploadAvatarPhoto__(file);
            } catch (err) {
                showToast(err.message || '사진 업로드에 실패했어요', true);
            }
        };
        var removePhotoBtn = document.getElementById('removePhotoBtn');
        if (removePhotoBtn) {
            removePhotoBtn.onclick = function () {
                pendingPhotoUrl = '';
                document.getElementById('editProfilePhotoPreview').innerHTML = avatarContent({ emoji: document.getElementById('editMemberEmoji').value.trim(), name: m.name });
            };
        }

        document.getElementById('saveMemberProfileBtn').onclick = async function (e) {
            var name = document.getElementById('editMemberName').value.trim();
            if (!name) { showToast('이름을 입력해주세요', true); return; }
            var emoji = document.getElementById('editMemberEmoji').value.trim();
            var bio = document.getElementById('editMemberBio').value.trim();
            setBtnLoading(e.target, '저장하는 중...');
            try {
                applyState(await callServer('updateMemberProfile', memberId, name, selectedColor, emoji, bio, pendingPhotoUrl));
                closeModal();
                render();
                showToast('프로필을 수정했어요');
            } catch (err) {
                showToast(err.message || '수정에 실패했어요', true);
                resetBtn(e.target);
            }
        };
    }
    var selectedKakaoBook = null;
    var kakaoSearchDebounce = null;
    /**
     * 홈 화면 "+"과 서고 "책 추가"가 쓰는 공용 책 추가 모달.
     * opts.ownerId: 있으면 그 프로필로 바로 등록(서고 쪽 — 항상 로그인한 본인), 없으면 requireLogin으로 물어봄(홈 FAB).
     * opts.title: 모달 제목. opts.withPageCount/opts.withExchangeProposal: 홈 FAB 전용 필드 노출 여부(기본 true).
     */
    function openAddBookModal(opts) {
        opts = opts || {};
        var withPageCount = opts.withPageCount !== false;
        var withExchangeProposal = opts.withExchangeProposal !== false;
        var _this = this;
        selectedKakaoBook = null;
        openModal('<h3>' + escapeHtml(opts.title || '책 추가') + '</h3>'
            + '<div class="field"><label>책 제목으로 검색</label>'
            + '<input type="text" id="newBookTitle" placeholder="예: 강아지똥" maxlength="60" autocomplete="off">'
            + '<div id="kakaoResults" style="margin-top:8px;"></div></div>'
            + '<div id="manualEntryToggle" style="margin-bottom:14px;">'
            + '<button class="btn-text" id="manualEntryBtn" style="text-decoration:underline;padding:0;">검색 결과 없이 직접 입력할래요</button></div>'
            + '<div id="selectedBookPreview"></div>'
            + '<div class="field" id="manualFields" style="display:none;"><label>저자 (선택)</label>'
            + '<input type="text" id="newBookAuthor" placeholder="예: 권정생" maxlength="40"></div>'
            + '<div class="field"><label>상태</label><div class="entry-type-choice">'
            + '<button type="button" class="entry-type-btn status-choice-btn active" data-status="shelved"><span class="icon">📚</span><span>안 읽음</span></button>'
            + '<button type="button" class="entry-type-btn status-choice-btn" data-status="reading"><span class="icon">📖</span><span>읽는 중</span></button>'
            + '<button type="button" class="entry-type-btn status-choice-btn" data-status="finished"><span class="icon">✅</span><span>완독</span></button>'
            + '</div></div>'
            + (withPageCount ? '<div class="field"><label>쪽수 (선택)</label><input type="number" id="newBookPageCount" min="0" placeholder="예: 320"></div>' : '')
            + '<div class="field" id="newBookStartDateField" style="display:none;"><label>읽기 시작일</label>'
            + '<input type="date" id="newBookStartDate" value="' + todayIso() + '"></div>'
            + '<div class="field" id="newBookEndDateField" style="display:none;"><label>완독일</label>'
            + '<input type="date" id="newBookEndDate" value="' + todayIso() + '"></div>'
            + '<div class="field" id="newBookExternalBorrowField" style="display:none;">'
            + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="newBookExternalBorrow" style="width:18px;height:18px;"><span>도서관·모임 밖에서 빌려 읽었어요 (제 소장 도서 아님)</span></label>'
            + '<p style="font-size:11px;color:var(--pencil);margin-top:4px;">체크하면 완독 기록에는 남지만 \'소장도서\'로 등록되지 않고, 다른 멤버가 빌려달라고 신청할 수 없어요.</p></div>'
            + (withExchangeProposal
                ? '<div class="field" id="newBookExchangeDateField" style="display:none;"><label>목표 교환일 제안 (선택)</label>'
                    + '<input type="date" id="newBookExchangeDate">'
                    + '<p style="font-size:11px;color:var(--pencil);margin-top:4px;">새 날짜를 넣으면 로그인한 내 이름으로 교환일 제안이 올라가요.</p>'
                    + '<div id="joinExistingProposalOnAddBox" style="margin-top:12px;"></div></div>'
                : '')
            + '<button class="btn-primary" id="saveBookBtn">추가하기</button>');
        if (withExchangeProposal) {
            var joinProposalBox = document.getElementById('joinExistingProposalOnAddBox');
            if (joinProposalBox) {
                joinProposalBox.innerHTML = (state.exchangeProposals || []).length
                    ? '<label style="margin-bottom:8px;">현재 모집 중인 교환일에 참여</label>' + (state.exchangeProposals || []).map(function (p) {
                        return '<label class="due-card" style="display:block;cursor:pointer;box-shadow:none;padding:10px 12px;margin-bottom:8px;"><input type="radio" name="joinProposalOnAdd" value="' + escapeHtml(p.id) + '" style="width:16px;height:16px;margin-right:8px;">' + fmtDateFull(p.date) + ' · 👥 ' + ((p.votes || []).length) + '명 참석 예정</label>';
                    }).join('')
                    : '<p style="font-size:11px;color:var(--pencil);">현재 모집 중인 교환일이 없어요.</p>';
            }
        }
        var selectedStatus = 'shelved';
        var statusBtns = document.querySelectorAll('.status-choice-btn');
        statusBtns.forEach(function (btn) {
            btn.onclick = function () {
                statusBtns.forEach(function (b) { return b.classList.remove('active'); });
                btn.classList.add('active');
                selectedStatus = btn.dataset.status;
                if (withExchangeProposal) document.getElementById('newBookExchangeDateField').style.display = selectedStatus === 'reading' ? 'block' : 'none';
                document.getElementById('newBookExternalBorrowField').style.display = selectedStatus === 'finished' ? 'block' : 'none';
                document.getElementById('newBookStartDateField').style.display = (selectedStatus === 'reading' || selectedStatus === 'finished') ? 'block' : 'none';
                document.getElementById('newBookEndDateField').style.display = selectedStatus === 'finished' ? 'block' : 'none';
            };
        });
        var titleInput = document.getElementById('newBookTitle');
        var resultsBox = document.getElementById('kakaoResults');
        titleInput.oninput = function () {
            selectedKakaoBook = null;
            document.getElementById('selectedBookPreview').innerHTML = '';
            var q = titleInput.value.trim();
            clearTimeout(kakaoSearchDebounce);
            if (q.length < 2) {
                resultsBox.innerHTML = '';
                return;
            }
            kakaoSearchDebounce = setTimeout(function () { return runKakaoSearch(q, resultsBox); }, 450);
        };
        document.getElementById('manualEntryBtn').onclick = function () {
            document.getElementById('manualFields').style.display = 'block';
            document.getElementById('manualEntryToggle').style.display = 'none';
            resultsBox.innerHTML = '';
            selectedKakaoBook = null;
        };
        var doSaveBook = async function (e, ownerId) {
            var proposedDate = withExchangeProposal ? (document.getElementById('newBookExchangeDate').value || null) : null;
            var selectedExistingProposalEl = withExchangeProposal ? document.querySelector('input[name="joinProposalOnAdd"]:checked') : null;
            var selectedExistingProposalId = selectedExistingProposalEl ? selectedExistingProposalEl.value : '';
            var title, author, coverUrl = '', publisher = '', isbn13 = '';
            var authorInput;
            if (selectedKakaoBook) {
                title = selectedKakaoBook.title;
                author = selectedKakaoBook.author;
                coverUrl = selectedKakaoBook.cover;
                publisher = selectedKakaoBook.publisher;
                isbn13 = selectedKakaoBook.isbn13;
            }
            else {
                title = titleInput.value.trim();
                authorInput = document.getElementById('newBookAuthor');
                author = authorInput && authorInput.value ? authorInput.value.trim() : '';
            }
            if (!title) {
                showToast('책 제목을 입력해주세요', true);
                return;
            }
            var pageCountInput = document.getElementById('newBookPageCount');
            var pageCount = pageCountInput && pageCountInput.value ? parseInt(pageCountInput.value, 10) || 0 : 0;
            var externalBorrowInput = document.getElementById('newBookExternalBorrow');
            var externalBorrow = selectedStatus === 'finished' && !!(externalBorrowInput && externalBorrowInput.checked);
            var startDateInput = document.getElementById('newBookStartDate');
            var endDateInput = document.getElementById('newBookEndDate');
            var bookStartDate = (startDateInput && startDateInput.value) || todayIso();
            var bookEndDate = (endDateInput && endDateInput.value) || todayIso();
            setBtnLoading(e.target, '추가하는 중...');
            try {
                applyState(await callServer('addBook', { title: title, author: author, ownerId: ownerId, status: selectedStatus, startDate: bookStartDate, endDate: bookEndDate, coverUrl: coverUrl, publisher: publisher, isbn13: isbn13, pageCount: pageCount, currentPage: selectedStatus === 'finished' ? pageCount : 0, externalBorrow: externalBorrow }));
                if (withExchangeProposal && selectedStatus === 'reading' && selectedExistingProposalId) {
                    var newAddedBook = state.books.filter(function (b) { return b.ownerId === ownerId && b.title === title; }).sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); })[0];
                    if (newAddedBook) {
                        applyState(await callServer('voteExchangeProposal', selectedExistingProposalId, ownerId, true, [newAddedBook.id]));
                    }
                }
                if (withExchangeProposal && selectedStatus === 'reading' && proposedDate) {
                    var proposalBook = state.books.filter(function (b) { return b.ownerId === ownerId && b.title === title; }).sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); })[0];
                    applyState(await callServer('proposeExchangeDate', ownerId, proposedDate, proposalBook ? [proposalBook.id] : []));
                }
                closeModal();
                render();
                showToast(selectedExistingProposalId ? '책을 추가하고 교환일에도 참여했어요' : (proposedDate ? '책을 추가하고 교환일도 제안했어요' : '책을 추가했어요'));
            }
            catch (err_12) {
                showToast(err_12.message || '추가에 실패했어요', true);
                resetBtn(e.target);
            }
        };
        document.getElementById('saveBookBtn').onclick = function (e) {
            if (opts.ownerId) {
                doSaveBook(e, opts.ownerId);
            } else {
                requireLogin(function (myId) { return doSaveBook(e, myId); });
            }
        };
    }
    function runKakaoSearch(query, resultsBox) {
        return __awaiter(this, void 0, void 0, function () {
            var raw, results_1, err_13;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        resultsBox.innerHTML = "<p style=\"font-size:12px;color:var(--pencil);\">\uAC80\uC0C9 \uC911...</p>";
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, callServer('searchKakaoBooks', query)];
                    case 2:
                        raw = _a.sent();
                        results_1 = raw ? JSON.parse(raw) : [];
                        if (!results_1 || results_1.length === 0) {
                            resultsBox.innerHTML = "<p style=\"font-size:12px;color:var(--pencil);\">\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC5B4\uC694. \uC9C1\uC811 \uC785\uB825\uD574\uC8FC\uC138\uC694.</p>";
                            return [2 /*return*/];
                        }
                        resultsBox.innerHTML = "\n      <div style=\"display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;border:1px solid var(--ink);border-radius:8px;padding:6px;background:var(--card-bg);\">\n        ".concat(results_1.map(function (r, i) { return "\n          <button class=\"aladin-result-item\" data-idx=\"".concat(i, "\" style=\"display:flex;gap:10px;text-align:left;background:transparent;border:none;padding:6px;border-radius:var(--radius-card);cursor:pointer;align-items:center;\">\n            <div style=\"width:34px;height:48px;flex-shrink:0;border-radius:2px;overflow:hidden;background:var(--paper-dark);\">\n              ").concat(r.cover ? "<img src=\"".concat(r.cover, "\" style=\"width:100%;height:100%;object-fit:cover;\">") : '', "\n            </div>\n            <div style=\"min-width:0;\">\n              <div style=\"font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">").concat(escapeHtml(r.title), "</div>\n              <div style=\"font-size:11px;color:var(--pencil);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">").concat(escapeHtml(r.author), " ").concat(r.publisher ? '· ' + escapeHtml(r.publisher) : '', "</div>\n            </div>\n          </button>\n        "); }).join(''), "\n      </div>\n    ");
                        resultsBox.querySelectorAll('.aladin-result-item').forEach(function (btn) {
                            btn.onclick = function () {
                                var r = results_1[parseInt(btn.dataset.idx)];
                                selectedKakaoBook = r;
                                document.getElementById('newBookTitle').value = r.title;
                                resultsBox.innerHTML = '';
                                document.getElementById('manualFields').style.display = 'none';
                                document.getElementById('manualEntryToggle').style.display = 'none';
                                document.getElementById('selectedBookPreview').innerHTML = "\n          <div style=\"display:flex;gap:12px;align-items:center;background:var(--card-bg);border:1.5px solid var(--ink);border-radius:8px;padding:10px;margin-bottom:14px;\">\n            <div style=\"width:44px;height:62px;flex-shrink:0;border-radius:2px;overflow:hidden;background:var(--paper-dark);\">\n              ".concat(r.cover ? "<img src=\"".concat(r.cover, "\" style=\"width:100%;height:100%;object-fit:cover;\">") : '', "\n            </div>\n            <div style=\"flex:1;min-width:0;\">\n              <div style=\"font-family:'Gowun Batang',serif;font-weight:700;font-size:14px;\">").concat(escapeHtml(r.title), "</div>\n              <div style=\"font-size:12px;color:var(--pencil);\">").concat(escapeHtml(r.author), "</div>\n            </div>\n            <button class=\"btn-text\" id=\"clearSelectedBook\" style=\"color:var(--stamp);\">\uBCC0\uACBD</button>\n          </div>\n        ");
                                document.getElementById('clearSelectedBook').onclick = function () {
                                    selectedKakaoBook = null;
                                    document.getElementById('selectedBookPreview').innerHTML = '';
                                    document.getElementById('manualEntryToggle').style.display = 'block';
                                };
                            };
                        });
                        return [3 /*break*/, 4];
                    case 3:
                        err_13 = _a.sent();
                        resultsBox.innerHTML = "<p style=\"font-size:12px;color:var(--stamp);\">".concat(escapeHtml(err_13.message || '검색에 실패했어요'), "</p>");
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    }
    function openEditBookModal(bookId) {
        var _this = this;
        var b = getBook(bookId);
        openModal("\n    <h3>\uCC45 \uC815\uBCF4 \uC218\uC815</h3>\n    <div class=\"field\">\n      <label>\uCC45 \uC81C\uBAA9</label>\n      <input type=\"text\" id=\"editBookTitle\" value=\"".concat(escapeHtml(b.title), "\" maxlength=\"60\">\n    </div>\n    <div class=\"field\">\n      <label>\uC800\uC790</label>\n      <input type=\"text\" id=\"editBookAuthor\" value=\"").concat(escapeHtml(b.author || ''), "\" maxlength=\"40\">\n    </div>\n    <button class=\"btn-primary\" id=\"saveEditBookBtn\">\uC800\uC7A5\uD558\uAE30</button>\n    <button class=\"btn-secondary\" id=\"researchCoverBtn\">\uD45C\uC9C0\u00B7\uCD9C\uD310\uC0AC \uC815\uBCF4 \uB2E4\uC2DC \uAC80\uC0C9</button>\n    <div id=\"editKakaoResults\" style=\"margin-top:8px;\"></div>\n  "));
        document.getElementById('saveEditBookBtn').onclick = function (e) { return __awaiter(_this, void 0, void 0, function () {
            var title, author, err_14;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        title = document.getElementById('editBookTitle').value.trim();
                        author = document.getElementById('editBookAuthor').value.trim();
                        if (!title) {
                            showToast('책 제목을 입력해주세요', true);
                            return [2 /*return*/];
                        }
                        setBtnLoading(e.target, '저장하는 중...');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, callServer('updateBookInfo', bookId, title, author)];
                    case 2:
                        applyState(_a.sent());
                        return [4 /*yield*/, Promise.resolve()];
                    case 3:
                        _a.sent();
                        closeModal();
                        render();
                        showToast('책 정보를 수정했어요');
                        return [3 /*break*/, 5];
                    case 4:
                        err_14 = _a.sent();
                        showToast(err_14.message || '수정에 실패했어요', true);
                        resetBtn(e.target);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        }); };
        document.getElementById('researchCoverBtn').onclick = function () { return __awaiter(_this, void 0, void 0, function () {
            var box, raw, results_2, err_15;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        box = document.getElementById('editKakaoResults');
                        box.innerHTML = "<p style=\"font-size:12px;color:var(--pencil);margin-top:8px;\">\uAC80\uC0C9 \uC911...</p>";
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, callServer('searchKakaoBooks', b.title)];
                    case 2:
                        raw = _a.sent();
                        results_2 = raw ? JSON.parse(raw) : [];
                        if (!results_2 || results_2.length === 0) {
                            box.innerHTML = "<p style=\"font-size:12px;color:var(--pencil);margin-top:8px;\">\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC5B4\uC694.</p>";
                            return [2 /*return*/];
                        }
                        box.innerHTML = "\n        <div style=\"display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;border:1px solid var(--ink);border-radius:8px;padding:6px;background:var(--card-bg);margin-top:8px;\">\n          ".concat(results_2.map(function (r, i) { return "\n            <button class=\"edit-aladin-item\" data-idx=\"".concat(i, "\" style=\"display:flex;gap:10px;text-align:left;background:transparent;border:none;padding:6px;border-radius:var(--radius-card);cursor:pointer;align-items:center;\">\n              <div style=\"width:34px;height:48px;flex-shrink:0;border-radius:2px;overflow:hidden;background:var(--paper-dark);\">\n                ").concat(r.cover ? "<img src=\"".concat(r.cover, "\" style=\"width:100%;height:100%;object-fit:cover;\">") : '', "\n              </div>\n              <div style=\"min-width:0;\">\n                <div style=\"font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">").concat(escapeHtml(r.title), "</div>\n                <div style=\"font-size:11px;color:var(--pencil);\">").concat(escapeHtml(r.author), "</div>\n              </div>\n            </button>\n          "); }).join(''), "\n        </div>\n      ");
                        box.querySelectorAll('.edit-aladin-item').forEach(function (btn) {
                            btn.onclick = function () { return __awaiter(_this, void 0, void 0, function () {
                                var r, err_16;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            r = results_2[parseInt(btn.dataset.idx)];
                                            _a.label = 1;
                                        case 1:
                                            _a.trys.push([1, 4, , 5]);
                                            return [4 /*yield*/, callServer('updateBookCoverInfo', bookId, r.cover, r.publisher, r.isbn13)];
                                        case 2:
                                            applyState(_a.sent());
                                            return [4 /*yield*/, Promise.resolve()];
                                        case 3:
                                            _a.sent();
                                            closeModal();
                                            render();
                                            showToast('표지 정보를 업데이트했어요');
                                            return [3 /*break*/, 5];
                                        case 4:
                                            err_16 = _a.sent();
                                            showToast(err_16.message || '실패', true);
                                            return [3 /*break*/, 5];
                                        case 5: return [2 /*return*/];
                                    }
                                });
                            }); };
                        });
                        return [3 /*break*/, 4];
                    case 3:
                        err_15 = _a.sent();
                        box.innerHTML = "<p style=\"font-size:12px;color:var(--stamp);margin-top:8px;\">".concat(escapeHtml(err_15.message || '검색 실패'), "</p>");
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); };
    }
    var selectedWishBook = null;
    var wishSearchDebounce = null;
    function openWishOwnerPicker(wishId) {
        var _this = this;
        requireLogin(function (myId) { return __awaiter(_this, void 0, void 0, function () {
            var w, owners, hasIt, err_17;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        w = state.wishlist.find(function (x) { return x.id === wishId; });
                        if (!w)
                            return [2 /*return*/];
                        owners = w.owners || [];
                        hasIt = !owners.includes(myId);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, callServer('toggleWishlistOwner', wishId, myId, hasIt)];
                    case 2:
                        applyState(_a.sent());
                        return [4 /*yield*/, Promise.resolve()];
                    case 3:
                        _a.sent();
                        render();
                        showToast(hasIt ? '내 서고에 등록하고 요청자를 찜에 추가했어요' : '표시를 해제했어요');
                        return [3 /*break*/, 5];
                    case 4:
                        err_17 = _a.sent();
                        showToast(err_17.message || '실패', true);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        }); });
    }
    function openAddWishModal() {
        var _this = this;
        selectedWishBook = null;
        openModal("\n    <h3>\uC77D\uACE0 \uC2F6\uC740 \uCC45 \uB4F1\uB85D</h3>\n    <div class=\"field\">\n      <label>\uCC45 \uC81C\uBAA9\uC73C\uB85C \uAC80\uC0C9</label>\n      <input type=\"text\" id=\"wishTitle\" placeholder=\"\uCC45 \uC81C\uBAA9\" maxlength=\"60\" autocomplete=\"off\">\n      <div id=\"wishKakaoResults\" style=\"margin-top:8px;\"></div>\n    </div>\n\n    <div id=\"wishManualEntryToggle\" style=\"margin-bottom:14px;\">\n      <button class=\"btn-text\" id=\"wishManualEntryBtn\" style=\"text-decoration:underline;padding:0;\">\uAC80\uC0C9 \uACB0\uACFC \uC5C6\uC774 \uC9C1\uC811 \uC785\uB825\uD560\uB798\uC694</button>\n    </div>\n\n    <div id=\"selectedWishBookPreview\"></div>\n\n    <div class=\"field\" id=\"wishManualFields\" style=\"display:none;\">\n      <label>\uC800\uC790 (\uC120\uD0DD)</label>\n      <input type=\"text\" id=\"wishAuthor\" placeholder=\"\uC800\uC790\" maxlength=\"40\">\n    </div>\n    <div class=\"field\">\n      <label>\uBA54\uBAA8 (\uC120\uD0DD)</label>\n      <textarea id=\"wishNote\" placeholder=\"\uC65C \uC77D\uACE0 \uC2F6\uC740\uC9C0, \uB204\uAC00 \uAC16\uACE0 \uC788\uC744 \uAC83 \uAC19\uC740\uC9C0 \uB4F1\"></textarea>\n    </div>\n    <label style=\"display:flex;align-items:center;gap:8px;margin-bottom:14px;cursor:pointer;\"><input type=\"checkbox\" id=\"wishAlreadyOwned\" style=\"width:18px;height:18px;\"><span style=\"font-size:13px;color:var(--ink);\">\uC774\uBBF8 \uAC16\uACE0 \uC788\uC5B4\uC694</span></label>\n    <button class=\"btn-primary\" id=\"saveWishBtn\">\uB4F1\uB85D\uD558\uAE30</button>\n  ");
        var titleInput = document.getElementById('wishTitle');
        var resultsBox = document.getElementById('wishKakaoResults');
        titleInput.oninput = function () {
            selectedWishBook = null;
            document.getElementById('selectedWishBookPreview').innerHTML = '';
            var q = titleInput.value.trim();
            clearTimeout(wishSearchDebounce);
            if (q.length < 2) {
                resultsBox.innerHTML = '';
                return;
            }
            wishSearchDebounce = setTimeout(function () { return runWishBookSearch(q, resultsBox); }, 450);
        };
        document.getElementById('wishManualEntryBtn').onclick = function () {
            document.getElementById('wishManualFields').style.display = 'block';
            document.getElementById('wishManualEntryToggle').style.display = 'none';
            resultsBox.innerHTML = '';
            selectedWishBook = null;
        };
        // payload를 미리 다 읽어서 값으로 들고 있는다 — 이미 서고에 있는 책 확인 프롬프트가
        // 뜨면 openModal()이 이 폼의 DOM을 통째로 갈아치우기 때문에, 나중에 다시
        // document.getElementById로 값을 읽으려고 하면 안 된다(값이 사라져 있음).
        function buildWishPayload_() {
            var requestedById = getLoggedInMemberId();
            var note = document.getElementById('wishNote').value.trim();
            var alreadyOwned = !!document.getElementById('wishAlreadyOwned').checked;
            var coverUrl = '', publisher = '', isbn13 = '', title, author;
            if (selectedWishBook) {
                title = selectedWishBook.title;
                author = selectedWishBook.author;
                coverUrl = selectedWishBook.cover;
                publisher = selectedWishBook.publisher;
                isbn13 = selectedWishBook.isbn13;
            }
            else {
                title = titleInput.value.trim();
                author = ((document.getElementById('wishAuthor') || {}).value || '').trim();
            }
            return { requestedById: requestedById, note: note, alreadyOwned: alreadyOwned, coverUrl: coverUrl, publisher: publisher, isbn13: isbn13, title: title, author: author };
        }
        function submitWishPayload_(payload, btn) {
            return __awaiter(_this, void 0, void 0, function () {
                var err_20;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            setBtnLoading(btn, '등록하는 중...');
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, callServer('addWishlistItem', payload)];
                        case 2:
                            applyState(_a.sent());
                            closeModal();
                            render();
                            showToast(payload.alreadyOwned ? '읽고 싶은 책으로 등록하고 내 서고에도 추가했어요' : '읽고 싶은 책을 등록했어요');
                            return [3 /*break*/, 4];
                        case 3:
                            err_20 = _a.sent();
                            showToast(err_20.message || '등록에 실패했어요', true);
                            resetBtn(btn);
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            });
        }
        document.getElementById('saveWishBtn').onclick = function (e) {
            if (!getLoggedInMemberId()) {
                requireLogin(function () { openAddWishModal(); });
                return;
            }
            var payload = buildWishPayload_();
            if (!payload.title) {
                showToast('책 제목을 입력해주세요', true);
                return;
            }
            var existingBook = !payload.alreadyOwned ? findExistingLibraryBookByTitle_(payload.title) : null;
            if (existingBook && existingBook.ownerId && existingBook.ownerId !== payload.requestedById) {
                openExistingLibraryBookPrompt_(existingBook, function (proceedBtn) { submitWishPayload_(payload, proceedBtn); });
                return;
            }
            submitWishPayload_(payload, e.target);
        };
    }
    // "이 책 찾아요"에 등록하려는 책이 이미 우리 서고(그룹 멤버 소장)에 있으면,
    // 위시리스트에 새로 등록하는 대신 바로 읽기 신청하러 갈 수 있게 안내한다.
    function findExistingLibraryBookByTitle_(title) {
        var normalized = (title || '').trim().toLowerCase().replace(/\s+/g, '');
        if (!normalized) return null;
        return (state.books || []).find(function (b) {
            return b.title && b.title.trim().toLowerCase().replace(/\s+/g, '') === normalized;
        }) || null;
    }
    function openExistingLibraryBookPrompt_(book, onProceedAnyway) {
        var owner = getMember(book.ownerId);
        openModal('<h3>이미 서고에 있는 책이에요</h3>'
            + '<p style="font-size:13px;color:var(--ink);margin-bottom:16px;">' + escapeHtml(owner ? owner.name : '다른 멤버') + '님이 가지고 있는 책이에요. 읽기 신청하러 갈까요?</p>'
            + '<button class="btn-primary" id="goRequestExistingBookBtn" style="margin-bottom:8px;">📖 읽기 신청하러 가기</button>'
            + '<button class="btn-text" id="proceedWishAnywayBtn">그래도 찾아요에 등록할래요</button>');
        document.getElementById('goRequestExistingBookBtn').onclick = function () {
            closeModal();
            detailBookId = book.id;
            currentView = 'bookDetail';
            render();
        };
        document.getElementById('proceedWishAnywayBtn').onclick = function (e) {
            onProceedAnyway(e.target);
        };
    }
    function runWishBookSearch(query, resultsBox) {
        return __awaiter(this, void 0, void 0, function () {
            var raw, results_4, err_21;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        resultsBox.innerHTML = "<p style=\"font-size:12px;color:var(--pencil);\">\uAC80\uC0C9 \uC911...</p>";
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, callServer('searchKakaoBooks', query)];
                    case 2:
                        raw = _a.sent();
                        results_4 = raw ? JSON.parse(raw) : [];
                        if (!results_4 || results_4.length === 0) {
                            resultsBox.innerHTML = "<p style=\"font-size:12px;color:var(--pencil);\">\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC5B4\uC694. \uC9C1\uC811 \uC785\uB825\uD574\uC8FC\uC138\uC694.</p>";
                            return [2 /*return*/];
                        }
                        resultsBox.innerHTML = "\n      <div style=\"display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;border:1px solid var(--ink);border-radius:8px;padding:6px;background:var(--card-bg);\">\n        ".concat(results_4.map(function (r, i) { return "\n          <button class=\"wish-result-item\" data-idx=\"".concat(i, "\" style=\"display:flex;gap:10px;text-align:left;background:transparent;border:none;padding:6px;border-radius:var(--radius-card);cursor:pointer;align-items:center;\">\n            <div style=\"width:34px;height:48px;flex-shrink:0;border-radius:2px;overflow:hidden;background:var(--paper-dark);\">\n              ").concat(r.cover ? "<img src=\"".concat(r.cover, "\" style=\"width:100%;height:100%;object-fit:cover;\">") : '', "\n            </div>\n            <div style=\"min-width:0;\">\n              <div style=\"font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">").concat(escapeHtml(r.title), "</div>\n              <div style=\"font-size:11px;color:var(--pencil);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">").concat(escapeHtml(r.author), " ").concat(r.publisher ? '· ' + escapeHtml(r.publisher) : '', "</div>\n            </div>\n          </button>\n        "); }).join(''), "\n      </div>\n    ");
                        resultsBox.querySelectorAll('.wish-result-item').forEach(function (btn) {
                            btn.onclick = function () {
                                var r = results_4[parseInt(btn.dataset.idx)];
                                selectedWishBook = r;
                                document.getElementById('wishTitle').value = r.title;
                                resultsBox.innerHTML = '';
                                document.getElementById('wishManualFields').style.display = 'none';
                                document.getElementById('wishManualEntryToggle').style.display = 'none';
                                document.getElementById('selectedWishBookPreview').innerHTML = "\n          <div style=\"display:flex;gap:12px;align-items:center;background:var(--card-bg);border:1.5px solid var(--ink);border-radius:8px;padding:10px;margin-bottom:14px;\">\n            <div style=\"width:44px;height:62px;flex-shrink:0;border-radius:2px;overflow:hidden;background:var(--paper-dark);\">\n              ".concat(r.cover ? "<img src=\"".concat(r.cover, "\" style=\"width:100%;height:100%;object-fit:cover;\">") : '', "\n            </div>\n            <div style=\"flex:1;min-width:0;\">\n              <div style=\"font-family:'Gowun Batang',serif;font-weight:700;font-size:14px;\">").concat(escapeHtml(r.title), "</div>\n              <div style=\"font-size:12px;color:var(--pencil);\">").concat(escapeHtml(r.author), "</div>\n            </div>\n            <button class=\"btn-text\" id=\"clearSelectedWishBook\" style=\"color:var(--stamp);\">\uBCC0\uACBD</button>\n          </div>\n        ");
                                document.getElementById('clearSelectedWishBook').onclick = function () {
                                    selectedWishBook = null;
                                    document.getElementById('selectedWishBookPreview').innerHTML = '';
                                    document.getElementById('wishManualEntryToggle').style.display = 'block';
                                };
                            };
                        });
                        return [3 /*break*/, 4];
                    case 3:
                        err_21 = _a.sent();
                        resultsBox.innerHTML = "<p style=\"font-size:12px;color:var(--stamp);\">".concat(escapeHtml(err_21.message || '검색에 실패했어요'), "</p>");
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    }
    function memberPickerFieldHtml(selectedId) {
        var mid = getLoggedInMemberId() || selectedId || '';
        var m = mid ? getMember(mid) : null;
        return '<input type="hidden" id="entryAuthorSelect" value="' + escapeHtml(mid) + '">' +
            '<p style="font-size:12px;color:var(--pencil);margin:-2px 0 12px;">작성자: ' + escapeHtml(m ? m.name : '로그인한 사람') + '</p>';
    }
    /**
     * entityType: 'book' | 'exchange'. entityId는 book이면 bookId, exchange면 dateStr.
     */
    function openPhotoCaptionModal(entityType, entityId, dataUrl) {
        openModal('<h3>사진 추가</h3>'
            + '<canvas id="photoDrawCanvas" style="width:100%;max-height:320px;display:block;border-radius:8px;border:1.5px solid var(--ink);touch-action:none;cursor:crosshair;margin-bottom:6px;"></canvas>'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
            + '<p style="font-size:11px;color:var(--pencil);">손가락으로 형광펜처럼 밑줄을 그어보세요</p>'
            + '<button type="button" class="btn-text" id="clearDrawBtn">지우기</button>'
            + '</div>'
            + '<div class="field"><label>메모 (선택)</label><textarea id="photoCaption" placeholder="예: 132페이지, 밑줄 친 문장"></textarea></div>'
            + memberPickerFieldHtml(getLoggedInMemberId())
            + '<button class="btn-primary" id="savePhotoBtn">저장하기</button>');

        var canvas = document.getElementById('photoDrawCanvas');
        var ctx = canvas.getContext('2d');
        // 진행 중인 한 획을 불투명하게 그려두는 임시 캔버스. 획이 끝나면 이걸 통째로
        // 목표 투명도로 메인 캔버스에 합성한다 — 그래야 한 획 안에서 겹치는 부분이
        // 두 번 칠해져 진해지는 문제 없이, 형광펜처럼 고르게 반투명해진다.
        var strokeCanvas = document.createElement('canvas');
        var strokeCtx = strokeCanvas.getContext('2d');
        var img = new Image();
        var drawing = false;
        var lastX = 0, lastY = 0;
        var penColor = '#FFD54A';
        var penAlpha = 0.4;

        function pointFromEvent(e) {
            var rect = canvas.getBoundingClientRect();
            var scaleX = canvas.width / rect.width;
            var scaleY = canvas.height / rect.height;
            return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
        }
        canvas.addEventListener('pointerdown', function (e) {
            if (!canvas.width) return;
            drawing = true;
            strokeCtx.clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
            var p = pointFromEvent(e);
            lastX = p.x; lastY = p.y;
            canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener('pointermove', function (e) {
            if (!drawing) return;
            var p = pointFromEvent(e);
            strokeCtx.strokeStyle = penColor;
            strokeCtx.lineWidth = Math.max(14, canvas.width * 0.025);
            strokeCtx.lineCap = 'round';
            strokeCtx.lineJoin = 'round';
            strokeCtx.beginPath();
            strokeCtx.moveTo(lastX, lastY);
            strokeCtx.lineTo(p.x, p.y);
            strokeCtx.stroke();
            lastX = p.x; lastY = p.y;
        });
        function stopDrawing() {
            if (!drawing) return;
            drawing = false;
            ctx.globalAlpha = penAlpha;
            ctx.drawImage(strokeCanvas, 0, 0);
            ctx.globalAlpha = 1;
            strokeCtx.clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
        }
        canvas.addEventListener('pointerup', stopDrawing);
        canvas.addEventListener('pointercancel', stopDrawing);
        canvas.addEventListener('pointerleave', stopDrawing);

        img.onload = function () {
            var maxSide = 1000;
            var w = img.naturalWidth, h = img.naturalHeight;
            var scale = Math.min(1, maxSide / Math.max(w, h));
            canvas.width = Math.round(w * scale);
            canvas.height = Math.round(h * scale);
            strokeCanvas.width = canvas.width;
            strokeCanvas.height = canvas.height;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = dataUrl;

        document.getElementById('clearDrawBtn').onclick = function () {
            if (canvas.width) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }
        };

        document.getElementById('savePhotoBtn').onclick = async function (e) {
            if (!canvas.width) {
                showToast('사진을 불러오는 중이에요. 잠시 후 다시 눌러주세요', true);
                return;
            }
            var caption = document.getElementById('photoCaption').value.trim();
            var authorId = document.getElementById('entryAuthorSelect').value || null;
            setBtnLoading(e.target, '업로드하는 중...');
            try {
                var finalDataUrl = canvas.toDataURL('image/jpeg', 0.9);
                var uploadFn = entityType === 'exchange' ? 'uploadExchangePhoto' : 'uploadPhoto';
                applyState(await callServer(uploadFn, entityId, finalDataUrl, caption, authorId));
                render();
                if (entityType === 'exchange') {
                    openExchangeDateDetailModal(entityId);
                } else {
                    closeModal();
                }
                showToast('사진을 추가했어요');
            } catch (err) {
                showToast(err.message || '업로드에 실패했어요', true);
                resetBtn(e.target);
            }
        };
    }
    // ---------- EVENT WIRING ----------
    function attachRootEvents() {
        var _this = this;
        document.querySelectorAll('[data-member]').forEach(function (el) {
            el.onclick = function () {
                detailMemberId = el.dataset.member;
                currentView = 'memberDetail';
                render();
                window.scrollTo(0, 0);
            };
        });
        document.querySelectorAll('[data-book]').forEach(function (el) {
            if (el.classList.contains('heart-toggle'))
                return;
            el.onclick = function (e) {
                if (e.target.closest('.heart-toggle'))
                    return;
                if (e.target.closest('.card-heart-toggle'))
                    return;
                if (e.target.closest('.library-status-select'))
                    return;
                if (e.target.closest('[data-delete-library]'))
                    return;
                if (e.target.closest('.want-to-read-checkbox'))
                    return;
                if (e.target.tagName === 'SELECT')
                    return;
                detailBookId = el.dataset.book;
                currentView = 'bookDetail';
                render();
                window.scrollTo(0, 0);
            };
        });
        document.querySelectorAll('.heart-toggle').forEach(function (btn) {
            btn.onclick = function (e) {
                e.stopPropagation();
                openMemberPickerForQueue(btn.dataset.book);
            };
        });
        document.querySelectorAll('.card-heart-toggle').forEach(function (btn) {
            btn.onclick = function (e) {
                e.stopPropagation();
                requireLogin(async function (myId) {
                    var wasHearted = btn.dataset.hearted === '1';
                    try {
                        applyState(await callServer('toggleBookHeart', btn.dataset.heartBook, myId, !wasHearted));
                        render();
                        showToast(wasHearted ? '찜을 취소했어요' : '찜했어요');
                    } catch (err) {
                        showToast(err.message || '실패했어요', true);
                    }
                });
            };
        });
        document.querySelectorAll('#main .record-heart-btn').forEach(function (btn) {
            btn.onclick = function (e) {
                e.stopPropagation();
                requireLogin(function (myId) {
                    var wasLiked = btn.dataset.heartLiked === '1';
                    callServer('toggleRecordItemHeart', btn.dataset.heartEntityType, btn.dataset.heartEntityId, btn.dataset.heartItemId, btn.dataset.heartParentPhotoId || null, myId, !wasLiked)
                        .then(function (result) { applyState(result); render(); })
                        .catch(function (err) { showToast(err.message || '실패', true); });
                });
            };
        });
        document.querySelectorAll('[data-goto-book]').forEach(function (btn) {
            btn.onclick = function () {
                detailBookId = btn.dataset.gotoBook;
                currentView = 'bookDetail';
                render();
                window.scrollTo(0, 0);
            };
        });
        document.querySelectorAll('[data-delete-wish]').forEach(function (btn) {
            btn.onclick = function () { return __awaiter(_this, void 0, void 0, function () {
                var err_23;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 3, , 4]);
                            return [4 /*yield*/, callServer('deleteWishlistItem', btn.dataset.deleteWish)];
                        case 1:
                            applyState(_a.sent());
                            return [4 /*yield*/, Promise.resolve()];
                        case 2:
                            _a.sent();
                            render();
                            showToast('삭제했어요');
                            return [3 /*break*/, 4];
                        case 3:
                            err_23 = _a.sent();
                            showToast(err_23.message || '삭제 실패', true);
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            }); };
        });
        document.querySelectorAll('.has-book-btn').forEach(function (btn) {
            btn.onclick = function () { return openWishOwnerPicker(btn.dataset.wishId); };
        });
        var emptyAdd = document.getElementById('emptyAddMemberBtn');
        if (emptyAdd)
            emptyAdd.onclick = openAddMemberModal;
        var emptyAdd2 = document.getElementById('emptyAddMemberBtn2');
        if (emptyAdd2)
            emptyAdd2.onclick = openAddMemberModal;
        var inviteMemberBtn = document.getElementById('inviteMemberBtn');
        if (inviteMemberBtn)
            inviteMemberBtn.onclick = openAddMemberModal;
        var backHome = document.getElementById('backToHome');
        if (backHome)
            backHome.onclick = function () { currentView = 'home'; render(); };
        var backMembers = document.getElementById('backToMembers');
        if (backMembers)
            backMembers.onclick = function () { currentView = 'members'; render(); };
        var myPageLoginBtn = document.getElementById('myPageLoginBtn');
        if (myPageLoginBtn)
            myPageLoginBtn.onclick = function () { requireLogin(function () { render(); }); };
        var editMemberProfileBtn = document.getElementById('editMemberProfileBtn');
        if (editMemberProfileBtn)
            editMemberProfileBtn.onclick = function () { return openEditMemberProfileModal(detailMemberId); };
        var editMyProfileBtn = document.getElementById('editMyProfileBtn');
        if (editMyProfileBtn)
            editMyProfileBtn.onclick = function () { return openEditMemberProfileModal(getLoggedInMemberId()); };
        var openAccountModalBtn = document.getElementById('openAccountModalBtn');
        if (openAccountModalBtn)
            openAccountModalBtn.onclick = function () { return openAccountSwitchModal(); };
        var myPageInviteCodeBtn = document.getElementById('myPageInviteCodeBtn');
        if (myPageInviteCodeBtn)
            myPageInviteCodeBtn.onclick = function () { if (window.__showInviteCode__) window.__showInviteCode__(); };
        var addLibraryBookBtn = document.getElementById('addLibraryBookBtn');
        if (addLibraryBookBtn)
            addLibraryBookBtn.onclick = function () {
                requireLogin(function (myId) {
                    if (myId !== addLibraryBookBtn.dataset.owner) {
                        showToast('본인 서고에만 책을 추가할 수 있어요', true);
                        return;
                    }
                    openAddBookModal({ ownerId: myId, title: '서고에 책 추가', withPageCount: false, withExchangeProposal: false });
                });
            };
        var addWishFromLibraryBtn = document.getElementById('addWishFromLibraryBtn');
        if (addWishFromLibraryBtn)
            addWishFromLibraryBtn.onclick = function () { requireLogin(function () { openAddWishModal(); }); };
        var addWishBtn = document.getElementById('addWishBtn');
        if (addWishBtn)
            addWishBtn.onclick = function () { requireLogin(function () { openAddWishModal(); }); };
        document.querySelectorAll('.want-to-read-checkbox').forEach(function (cb) {
            cb.onclick = function (e) { e.stopPropagation(); };
            cb.onchange = async function () {
                var checked = cb.checked;
                try {
                    applyState(await callServer('setBookWantToRead', cb.dataset.wantBook, getLoggedInMemberId(), checked));
                    render();
                } catch (err) {
                    showToast(err.message || '실패', true);
                    cb.checked = !checked;
                }
            };
        });
        document.querySelectorAll('.library-status-select').forEach(function (sel) {
            sel.onclick = function (e) { return e.stopPropagation(); };
            sel.onchange = function (e) {
                e.stopPropagation();
                var bookId = sel.dataset.statusBook;
                var newStatus = sel.value;
                var b = getBook(bookId);
                if (!b) return;

                // 완독은 날짜/후기 모달(openMarkFinishedReviewModal)을 그대로 재사용한다 — 어차피
                // 그 모달이 markFinished 호출부터 렌더까지 전부 처리해준다.
                if (newStatus === 'finished') {
                    openMarkFinishedReviewModal(bookId);
                    return;
                }

                function commit(startDate) {
                    sel.disabled = true;
                    callServer('assignReader', bookId, newStatus === 'reading' ? b.ownerId : null, startDate, null)
                        .then(function (stateJson) {
                        applyState(stateJson);
                        render();
                        showToast('상태를 업데이트했어요');
                    })
                        .catch(function (err) {
                        showToast(err.message || '실패', true);
                        sel.disabled = false;
                    });
                }

                if (newStatus === 'reading') {
                    openStartDateModal(commit);
                } else {
                    commit(todayIso());
                }
            };
        });
        document.querySelectorAll('[data-delete-library]').forEach(function (btn) {
            btn.onclick = function (e) {
                e.stopPropagation();
                requireLogin(function (myId) { return __awaiter(_this, void 0, void 0, function () {
                    var err_25;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 3, , 4]);
                                return [4 /*yield*/, callServer('deleteBook', btn.dataset.deleteLibrary, myId)];
                            case 1:
                                applyState(_a.sent());
                                return [4 /*yield*/, Promise.resolve()];
                            case 2:
                                _a.sent();
                                render();
                                showToast('삭제했어요');
                                return [3 /*break*/, 4];
                            case 3:
                                err_25 = _a.sent();
                                showToast(err_25.message || '삭제 실패', true);
                                return [3 /*break*/, 4];
                            case 4: return [2 /*return*/];
                        }
                    });
                }); });
            };
        });
        var saveNotifyBtn = document.getElementById('saveNotifyBtn');
        if (saveNotifyBtn)
            saveNotifyBtn.onclick = function () { return __awaiter(_this, void 0, void 0, function () {
                var email, time, days, enabled, onComment, onHeart, onRecommend, err_26;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            email = document.getElementById('notifyEmail').value.trim();
                            time = document.getElementById('notifyTime').value;
                            days = getCheckedDays('memberDetail');
                            enabled = document.getElementById('notifyEnabled').checked;
                            onComment = document.getElementById('notifyOnComment').checked;
                            onHeart = document.getElementById('notifyOnHeart').checked;
                            onRecommend = document.getElementById('notifyOnRecommend').checked;
                            if (enabled && !email) {
                                showToast('알림을 받으려면 이메일을 입력해주세요', true);
                                return [2 /*return*/];
                            }
                            setBtnLoading(saveNotifyBtn, '저장하는 중...');
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, callServer('updateMemberNotify', getLoggedInMemberId(), email, time, days, enabled, onComment, onHeart, onRecommend)];
                        case 2:
                            applyState(_a.sent());
                            return [4 /*yield*/, Promise.resolve()];
                        case 3:
                            _a.sent();
                            render();
                            showToast(enabled ? '알림을 설정했어요' : '알림을 껐어요');
                            return [3 /*break*/, 5];
                        case 4:
                            err_26 = _a.sent();
                            showToast(err_26.message || '저장에 실패했어요', true);
                            resetBtn(saveNotifyBtn);
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            }); };
        var editBookBtn = document.getElementById('editBookInfoBtn');
        if (editBookBtn)
            editBookBtn.onclick = function () { return openEditBookModal(detailBookId); };
        var deleteBookBtn = document.getElementById('deleteBookBtn');
        if (deleteBookBtn)
            deleteBookBtn.onclick = function () {
                var b = getBook(detailBookId);
                if (!confirm('"' + (b ? b.title : '이 책') + '"을(를) 정말 삭제할까요? 되돌릴 수 없어요.')) return;
                requireLogin(async function (myId) {
                    try {
                        applyState(await callServer('deleteBook', detailBookId, myId));
                        currentView = 'shelf';
                        render();
                        showToast('삭제했어요');
                    } catch (err) {
                        showToast(err.message || '삭제 실패', true);
                    }
                });
            };
        var toggleHeartBtn = document.getElementById('toggleHeartBtn');
        if (toggleHeartBtn)
            toggleHeartBtn.onclick = function () {
                requireLogin(async function (myId) {
                    var b = getBook(detailBookId);
                    var wasHearted = !!(b && (b.hearts || []).indexOf(myId) > -1);
                    try {
                        applyState(await callServer('toggleBookHeart', detailBookId, myId, !wasHearted));
                        render();
                        showToast(wasHearted ? '찜을 취소했어요' : '찜했어요');
                    } catch (err) {
                        showToast(err.message || '실패했어요', true);
                    }
                });
            };
        var claimBookCopyBtn = document.getElementById('claimBookCopyBtn');
        if (claimBookCopyBtn)
            claimBookCopyBtn.onclick = function () {
                requireLogin(async function (myId) {
                    setBtnLoading(claimBookCopyBtn, '등록하는 중...');
                    try {
                        applyState(await callServer('claimBookCopy', detailBookId, myId));
                        render();
                        showToast('내 서고에도 등록했어요');
                    } catch (err) {
                        showToast(err.message || '실패했어요', true);
                        resetBtn(claimBookCopyBtn);
                    }
                });
            };
        var cancelReadingBtn = document.getElementById('cancelReadingBtn');
        if (cancelReadingBtn)
            cancelReadingBtn.onclick = function () {
                if (!confirm('읽는 중 상태를 취소할까요? 오늘 시작한 기록이 사라져요.')) return;
                requireLogin(async function (myId) {
                    setBtnLoading(cancelReadingBtn, '취소하는 중...');
                    try {
                        applyState(await callServer('cancelReading', detailBookId, myId));
                        render();
                        showToast('읽는 중을 취소했어요');
                    } catch (err) {
                        showToast(err.message || '실패했어요', true);
                        resetBtn(cancelReadingBtn);
                    }
                });
            };
        var proposeLendBtn = document.getElementById('proposeLendBtn');
        if (proposeLendBtn)
            proposeLendBtn.onclick = function () { openProposeLendModal(detailBookId); };
        document.querySelectorAll('[data-accept-lend-offer]').forEach(function (btn) {
            btn.onclick = function () {
                requireLogin(async function (myId) {
                    setBtnLoading(btn, '수락하는 중...');
                    try {
                        applyState(await callServer('acceptLendOffer', btn.dataset.lendBook, btn.dataset.acceptLendOffer, myId));
                        render();
                        showToast('수락했어요. 실제로 책을 건넬 때 대기열에서 "넘기기"를 눌러주세요.');
                    } catch (err) {
                        showToast(err.message || '실패했어요', true);
                        resetBtn(btn);
                    }
                });
            };
        });
        document.querySelectorAll('[data-decline-lend-offer]').forEach(function (btn) {
            btn.onclick = function () {
                requireLogin(async function (myId) {
                    setBtnLoading(btn, '...');
                    try {
                        applyState(await callServer('declineLendOffer', btn.dataset.lendBook, btn.dataset.declineLendOffer, myId));
                        render();
                        showToast('제안을 취소했어요');
                    } catch (err) {
                        showToast(err.message || '실패했어요', true);
                        resetBtn(btn);
                    }
                });
            };
        });
        var toggleRecommendBtn = document.getElementById('toggleRecommendBtn');
        if (toggleRecommendBtn)
            toggleRecommendBtn.onclick = function () {
                requireLogin(function (myId) {
                    var b = getBook(detailBookId);
                    var already = !!(b && (b.recommendations || []).find(function (r) { return r.memberId === myId; }));
                    if (already) {
                        callServer('toggleBookRecommend', detailBookId, myId, false).then(function (stateJson) {
                            applyState(stateJson);
                            render();
                            showToast('추천을 취소했어요');
                        }).catch(function (err) { showToast(err.message || '실패했어요', true); });
                    } else {
                        openRecommendCommentModal(detailBookId);
                    }
                });
            };
        var setMyQueueDateBtn = document.getElementById('setMyQueueDateBtn');
        if (setMyQueueDateBtn)
            setMyQueueDateBtn.onclick = function () { openSetMyQueueDateModal(detailBookId); };
        var giveUpMyQueueBtn = document.getElementById('giveUpMyQueueBtn');
        if (giveUpMyQueueBtn)
            giveUpMyQueueBtn.onclick = function () {
                requireLogin(async function (myId) {
                    setBtnLoading(giveUpMyQueueBtn, '...');
                    try {
                        applyState(await callServer('removeFromQueue', detailBookId, myId, myId));
                        render();
                        showToast('대기를 포기했어요');
                    } catch (err) {
                        showToast(err.message || '실패했어요', true);
                        resetBtn(giveUpMyQueueBtn);
                    }
                });
            };
        var openExchangeVoteBtn = document.getElementById('openExchangeVoteBtn');
        if (openExchangeVoteBtn)
            openExchangeVoteBtn.onclick = function () { return openSetExchangeDateModal(); };
        var pickBookExchangeDateBtn = document.getElementById('pickBookExchangeDateBtn');
        if (pickBookExchangeDateBtn)
            pickBookExchangeDateBtn.onclick = function () {
                var bookId = detailBookId;
                openPickExchangeDateModal('어떤 교환일에 가져갈까요?', function (dateStr) {
                    if (!dateStr) return;
                    requireLogin(async function (myId) {
                        try {
                            var mergedIds = myExistingBookIdsForDate_(dateStr, myId);
                            if (mergedIds.indexOf(bookId) === -1) mergedIds.push(bookId);
                            applyState(await callServer('joinExchangeDate', dateStr, myId, mergedIds));
                            render();
                            showToast('이 책을 ' + fmtDate(dateStr) + ' 교환일에 추가했어요');
                        } catch (err) {
                            showToast(err.message || '실패', true);
                        }
                    });
                });
            };
        var exchangeBanner = document.getElementById('exchangeBanner');
        if (exchangeBanner)
            exchangeBanner.onclick = function () { return openSetExchangeDateModal(); };
        document.querySelectorAll('[data-detail-date]').forEach(function (el) {
            el.onclick = function (e) { e.stopPropagation(); openExchangeDateDetailModal(el.dataset.detailDate); };
        });
        document.querySelectorAll('.home-attend-btn').forEach(function (btn) {
            btn.onclick = function () { return openVoteMemberPickerHome(btn.dataset.proposal); };
        });
        var homeProposeOtherBtn = document.getElementById('homeProposeOtherBtn');
        if (homeProposeOtherBtn)
            homeProposeOtherBtn.onclick = function () { return openSetExchangeDateModal(); };
        document.querySelectorAll('.home-join-date-btn').forEach(function (btn) {
            btn.onclick = function () { return openJoinExchangeDateMemberPicker(btn.dataset.date); };
        });
        document.querySelectorAll('[data-cancel-date]').forEach(function (btn) {
            btn.onclick = function () { return openLeaveExchangeDateMemberPicker(btn.dataset.cancelDate); };
        });
        document.querySelectorAll('[data-resolve-date]').forEach(function (btn) {
            btn.onclick = function () {
                var dateStr = btn.dataset.resolveDate;
                var status = btn.dataset.resolveStatus;
                if (status === 'cancelled' && !confirm(fmtDateFull(dateStr) + ' 모임을 취소할까요? 잡혀있던 교환일이 풀려요.')) return;
                requireLogin(async function (myId) {
                    setBtnLoading(btn, '처리 중...');
                    try {
                        applyState(await callServer('resolveExchangeDate', dateStr, status, myId));
                        render();
                        showToast(status === 'completed' ? '모임을 완료 처리했어요' : '모임을 취소했어요');
                    } catch (err) {
                        showToast(err.message || '실패', true);
                        resetBtn(btn);
                    }
                });
            };
        });
        document.querySelectorAll('[data-switch-group]').forEach(function (btn) {
            btn.onclick = function () {
                if (window.__switchGroup__) window.__switchGroup__(btn.dataset.switchGroup);
            };
        });
        var editStartDateBtn = document.getElementById('editStartDateBtn');
        if (editStartDateBtn) {
            editStartDateBtn.onclick = function () {
                var b = getBook(detailBookId);
                if (b) openEditStartDateModal(detailBookId, b.startDate);
            };
        }
        document.querySelectorAll('[data-edit-last-history]').forEach(function (btn) {
            btn.onclick = function () {
                var b = getBook(detailBookId);
                if (!b) return;
                var entry = (b.history || [])[(b.history || []).length - 1];
                openEditLastHistoryModal(detailBookId, entry);
            };
        });
        var startReadingBtn = document.getElementById('startReadingBtn');
        if (startReadingBtn) {
            startReadingBtn.onclick = function () {
                requireLogin(function (myId) {
                    openStartDateModal(function (startDate) {
                        openPickExchangeDateModal('목표 교환일을 골라주세요', function (exchangeDate) {
                            setBtnLoading(startReadingBtn, '시작하는 중...');
                            callServer('assignReader', detailBookId, myId, startDate, exchangeDate)
                                .then(applyState)
                                .then(function () {
                                render();
                                showToast('읽기 시작했어요');
                            })
                                .catch(function (err) {
                                showToast(err.message || '읽기 시작 실패', true);
                                resetBtn(startReadingBtn);
                            });
                        });
                    });
                });
            };
        }
        var markFinishedBtn = document.getElementById('markFinishedBtn');
        if (markFinishedBtn)
            markFinishedBtn.onclick = function () { openMarkFinishedReviewModal(detailBookId); };
        var requestReadBtn = document.getElementById('requestReadBtn');
        if (requestReadBtn)
            requestReadBtn.onclick = function () { openRequestReadModal(detailBookId); };
        var confirmReturnBtn = document.getElementById('confirmReturnBtn');
        if (confirmReturnBtn)
            confirmReturnBtn.onclick = async function () {
                setBtnLoading(confirmReturnBtn, '확인하는 중...');
                try {
                    applyState(await callServer('confirmReturn', detailBookId, getLoggedInMemberId()));
                    render();
                    showToast('반납을 확인했어요');
                } catch (err) {
                    showToast(err.message || '처리 실패', true);
                    resetBtn(confirmReturnBtn);
                }
            };
        var confirmPickupBtn = document.getElementById('confirmPickupBtn');
        if (confirmPickupBtn)
            confirmPickupBtn.onclick = async function () {
                setBtnLoading(confirmPickupBtn, '확인하는 중...');
                try {
                    applyState(await callServer('confirmPickup', detailBookId, getLoggedInMemberId()));
                    render();
                    showToast('읽기 시작했어요');
                } catch (err) {
                    showToast(err.message || '처리 실패', true);
                    resetBtn(confirmPickupBtn);
                }
            };
        document.querySelectorAll('[data-counter-read-request]').forEach(function (btn) {
            btn.onclick = function () {
                var bookId = btn.dataset.requestBook;
                var requestId = btn.dataset.counterReadRequest;
                openPickCounterDateModal(async function (counterDate) {
                    try {
                        applyState(await callServer('counterReadRequestDate', bookId, requestId, getLoggedInMemberId(), counterDate));
                        render();
                        var target = (getBook(bookId).readRequests || []).find(function (r) { return r.id === requestId; });
                        var emailOk = target ? memberHasEmail_(target.memberId) : true;
                        showToast('다른 날짜를 제안했어요' + (emailOk ? '' : NO_EMAIL_SUFFIX), !emailOk);
                    } catch (err) {
                        showToast(err.message || '실패', true);
                    }
                });
            };
        });
        document.querySelectorAll('[data-cancel-request]').forEach(function (btn) {
            btn.onclick = function () { return __awaiter(_this, void 0, void 0, function () {
                var err_33;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 3, , 4]);
                            return [4 /*yield*/, callServer('rejectReadRequest', btn.dataset.requestBook, btn.dataset.cancelRequest, getLoggedInMemberId())];
                        case 1:
                            applyState(_a.sent());
                            return [4 /*yield*/, Promise.resolve()];
                        case 2:
                            _a.sent();
                            render();
                            showToast('신청을 취소했어요');
                            return [3 /*break*/, 4];
                        case 3:
                            err_33 = _a.sent();
                            showToast(err_33.message || '취소 실패', true);
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            }); };
        });
        document.querySelectorAll('[data-approve-request]').forEach(function (btn) {
            btn.onclick = function () { return __awaiter(_this, void 0, void 0, function () {
                var err_34;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            setBtnLoading(btn, '승인 중...');
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, callServer('approveReadRequest', btn.dataset.requestBook, btn.dataset.approveRequest, getLoggedInMemberId())];
                        case 2:
                            applyState(_a.sent());
                            return [4 /*yield*/, Promise.resolve()];
                        case 3:
                            _a.sent();
                            render();
                            // 승인은 대기열에 넣을 뿐, 실제로 "읽는 중"이 되는 건 나중에 대기열의
                            // "넘기기"를 눌러야 한다 — 예전엔 승인=즉시 전달이었어서 헷갈리기 쉽다.
                            showToast('승인했어요. 실제로 책을 건넬 때 대기열에서 "넘기기"를 눌러주세요.');
                            return [3 /*break*/, 5];
                        case 4:
                            err_34 = _a.sent();
                            showToast(err_34.message || '승인 실패', true);
                            resetBtn(btn);
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            }); };
        });
        document.querySelectorAll('[data-reject-request]').forEach(function (btn) {
            btn.onclick = function () { return __awaiter(_this, void 0, void 0, function () {
                var err_35;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 3, , 4]);
                            return [4 /*yield*/, callServer('rejectReadRequest', btn.dataset.requestBook, btn.dataset.rejectRequest, getLoggedInMemberId())];
                        case 1:
                            applyState(_a.sent());
                            return [4 /*yield*/, Promise.resolve()];
                        case 2:
                            _a.sent();
                            render();
                            showToast('거절했어요');
                            return [3 /*break*/, 4];
                        case 3:
                            err_35 = _a.sent();
                            showToast(err_35.message || '거절 실패', true);
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            }); };
        });
        document.querySelectorAll('[data-pass-to]').forEach(function (btn) {
            btn.onclick = function () { return __awaiter(_this, void 0, void 0, function () {
                var err_32;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            // 승인/수락 때 합의한 날짜가 아직 안 됐는데 "넘기기"부터 눌러버리는
                            // 실수를 막는 확인창 — 승인은 대기열에만 넣고, 실제 전달은 이 버튼이
                            // 하기 때문에 미리 눌러버리면 교환 예정일 전에 "읽는 중"이 돼버린다.
                            if (btn.dataset.passDesiredDate && btn.dataset.passDesiredDate > new Date().toISOString().slice(0, 10)) {
                                if (!confirm(fmtDate(btn.dataset.passDesiredDate) + '에 만나서 넘기기로 했어요. 아직 그 전인데 지금 바로 넘길까요?')) {
                                    return [2 /*return*/];
                                }
                            }
                            setBtnLoading(btn, '넘기는 중...');
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, callServer('passToNext', btn.dataset.passBook, btn.dataset.passTo, getLoggedInMemberId())];
                        case 2:
                            applyState(_a.sent());
                            return [4 /*yield*/, Promise.resolve()];
                        case 3:
                            _a.sent();
                            render();
                            showToast('다음 사람에게 넘겼어요');
                            return [3 /*break*/, 5];
                        case 4:
                            err_32 = _a.sent();
                            showToast(err_32.message || '실패', true);
                            resetBtn(btn);
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            }); };
        });
        document.querySelectorAll('[data-suggest-date]').forEach(function (btn) {
            btn.onclick = async function () {
                setBtnLoading(btn, '제안하는 중...');
                try {
                    applyState(await callServer('proposeDateForQueueMember', btn.dataset.suggestBook, btn.dataset.suggestMember, getLoggedInMemberId(), btn.dataset.suggestDate));
                    render();
                    showToast('날짜를 제안했어요');
                } catch (err) {
                    showToast(err.message || '실패', true);
                    resetBtn(btn);
                }
            };
        });
        document.querySelectorAll('[data-remove-queue]').forEach(function (btn) {
            btn.onclick = function () { return __awaiter(_this, void 0, void 0, function () {
                var err_33;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 3, , 4]);
                            return [4 /*yield*/, callServer('removeFromQueue', btn.dataset.removeQueue, btn.dataset.removeMember, getLoggedInMemberId())];
                        case 1:
                            applyState(_a.sent());
                            return [4 /*yield*/, Promise.resolve()];
                        case 2:
                            _a.sent();
                            render();
                            return [3 /*break*/, 4];
                        case 3:
                            err_33 = _a.sent();
                            showToast(err_33.message || '실패', true);
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            }); };
        });
        document.querySelectorAll('[data-accept-queue-request]').forEach(function (btn) {
            btn.onclick = async function () {
                var myId = getLoggedInMemberId();
                var beforeCount = countIncomingQueueRequestsFor_(myId);
                setBtnLoading(btn, '수락 중...');
                try {
                    applyState(await callServer('acceptQueueRequest', btn.dataset.queueBook, btn.dataset.acceptQueueRequest, myId));
                    render();
                    var afterCount = countIncomingQueueRequestsFor_(myId);
                    var msg = '수락했어요';
                    if (afterCount > beforeCount) msg += ' · 맞교환 가능한 다른 책도 같은 날짜로 자동 신청해놨어요. 확인해보세요!';
                    showToast(msg);
                } catch (err) {
                    showToast(err.message || '실패', true);
                    resetBtn(btn);
                }
            };
        });
        document.querySelectorAll('[data-reject-queue-request]').forEach(function (btn) {
            btn.onclick = function () { return __awaiter(_this, void 0, void 0, function () {
                var err_37;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 3, , 4]);
                            return [4 /*yield*/, callServer('rejectQueueRequest', btn.dataset.queueBook, btn.dataset.rejectQueueRequest, getLoggedInMemberId())];
                        case 1:
                            applyState(_a.sent());
                            return [4 /*yield*/, Promise.resolve()];
                        case 2:
                            _a.sent();
                            render();
                            return [3 /*break*/, 4];
                        case 3:
                            err_37 = _a.sent();
                            showToast(err_37.message || '실패', true);
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            }); };
        });
        document.querySelectorAll('[data-counter-queue-request]').forEach(function (btn) {
            btn.onclick = function () {
                var bookId = btn.dataset.queueBook;
                var requestId = btn.dataset.counterQueueRequest;
                openPickCounterDateModal(async function (counterDate) {
                    try {
                        applyState(await callServer('counterQueueRequestDate', bookId, requestId, getLoggedInMemberId(), counterDate));
                        render();
                        var target = (getBook(bookId).queueRequests || []).find(function (r) { return r.id === requestId; });
                        var emailOk = target ? memberHasEmail_(target.memberId) : true;
                        showToast('다른 날짜를 제안했어요' + (emailOk ? '' : NO_EMAIL_SUFFIX), !emailOk);
                    } catch (err) {
                        showToast(err.message || '실패', true);
                    }
                });
            };
        });
        var loginForQueueBtn = document.getElementById('loginForQueueBtn');
        if (loginForQueueBtn)
            loginForQueueBtn.onclick = function () { return requireLogin(function () { return render(); }); };
        var addMyQueueBtn = document.getElementById('addMyQueueBtn');
        if (addMyQueueBtn)
            addMyQueueBtn.onclick = function () {
                requireLogin(function (myId) { return openRequestQueueModal(detailBookId); });
            };
        var removeMyQueueBtn = document.getElementById('removeMyQueueBtn');
        if (removeMyQueueBtn)
            removeMyQueueBtn.onclick = function () { return __awaiter(_this, void 0, void 0, function () {
                var err_35, myId;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            myId = getLoggedInMemberId();
                            if (!myId) { requireLogin(function () { return render(); }); return [2 /*return*/]; }
                            setBtnLoading(removeMyQueueBtn, '...');
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, callServer('removeFromQueue', detailBookId, myId, myId)];
                        case 2:
                            applyState(_a.sent());
                            return [4 /*yield*/, Promise.resolve()];
                        case 3:
                            _a.sent();
                            render();
                            showToast('찜을 취소했어요');
                            return [3 /*break*/, 5];
                        case 4:
                            err_35 = _a.sent();
                            showToast(err_35.message || '실패', true);
                            resetBtn(removeMyQueueBtn);
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            }); };
        var addEntryBtn = document.getElementById('addEntryBtn');
        var photoInput = document.getElementById('photoFileInput');
        if (addEntryBtn && photoInput) {
            addEntryBtn.onclick = function () { return requireLogin(function(){ photoInput.click(); }); };
            photoInput.onchange = function (e) {
                var file = e.target.files[0];
                if (!file)
                    return;
                if (file.size > 4 * 1024 * 1024) {
                    showToast('사진 용량이 너무 커요 (4MB 이하)', true);
                    return;
                }
                var reader = new FileReader();
                reader.onload = function () { openPhotoCaptionModal('book', detailBookId, reader.result); };
                reader.readAsDataURL(file);
                photoInput.value = '';
            };
        }
        var quickCommentBtn = document.getElementById('quickCommentBtn');
        var quickCommentInput = document.getElementById('quickCommentInput');
        if (quickCommentBtn && quickCommentInput) {
            var submitComment_1 = function () {
                var text = quickCommentInput.value.trim();
                if (!text) {
                    showToast('댓글 내용을 입력해주세요', true);
                    return;
                }
                requireLogin(function (myId) { return __awaiter(_this, void 0, void 0, function () {
                    var err_35;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                setBtnLoading(quickCommentBtn, '...');
                                _a.label = 1;
                            case 1:
                                _a.trys.push([1, 4, , 5]);
                                return [4 /*yield*/, callServer('addTextMemo', detailBookId, myId, text)];
                            case 2:
                                applyState(_a.sent());
                                return [4 /*yield*/, Promise.resolve()];
                            case 3:
                                _a.sent();
                                render();
                                showToast('댓글을 남겼어요');
                                return [3 /*break*/, 5];
                            case 4:
                                err_35 = _a.sent();
                                showToast(err_35.message || '실패했어요', true);
                                resetBtn(quickCommentBtn);
                                return [3 /*break*/, 5];
                            case 5: return [2 /*return*/];
                        }
                    });
                }); });
            };
            quickCommentBtn.onclick = submitComment_1;
            quickCommentInput.onkeydown = function (e) { if (e.key === 'Enter')
                submitComment_1(); };
        }

        var pageRange = document.getElementById('pageProgressRange');
        var currentPageInput = document.getElementById('currentPageInput');
        var pageCountInput = document.getElementById('pageCountInput');
        if (pageRange && currentPageInput && pageCountInput) {
            pageRange.oninput = function () { currentPageInput.value = pageRange.value; };
            currentPageInput.oninput = function () {
                var total = parseInt(pageCountInput.value || '0', 10) || 0;
                var current = parseInt(currentPageInput.value || '0', 10) || 0;
                if (total && current > total) current = total;
                pageRange.max = total || Math.max(current, 100);
                pageRange.value = current;
            };
            pageCountInput.oninput = function () {
                var total = parseInt(pageCountInput.value || '0', 10) || 0;
                var current = parseInt(currentPageInput.value || '0', 10) || 0;
                pageRange.max = total || Math.max(current, 100);
                if (total && current > total) {
                    currentPageInput.value = total;
                    pageRange.value = total;
                }
            };
        }
        var saveProgressBtn = document.getElementById('saveProgressBtn');
        if (saveProgressBtn) {
            saveProgressBtn.onclick = function () {
                requireLogin(function (myId) {
                    var current = parseInt((document.getElementById('currentPageInput') || {}).value || '0', 10) || 0;
                    var total = parseInt((document.getElementById('pageCountInput') || {}).value || '0', 10) || 0;
                    setBtnLoading(saveProgressBtn, '저장 중...');
                    callServer('updateBookProgress', detailBookId, myId, current, total)
                        .then(applyState)
                        .then(function () { render(); showToast('진행률을 저장했어요'); })
                        .catch(function (err) { showToast(err.message || '저장 실패', true); resetBtn(saveProgressBtn); });
                });
            };
        }
        document.querySelectorAll('[data-record-photo]').forEach(function (el) {
            el.onclick = function () {
                var kind = el.dataset.recordKind || 'book';
                var entityId = el.dataset.recordEntity;
                var groupIds = (el.dataset.recordGroup || el.dataset.recordPhoto).split(',');
                var p = findRecordPhoto_(kind, entityId, groupIds[0]);
                if (p) openLightbox(p, kind, entityId, groupIds, 0);
            };
        });
        document.querySelectorAll('[data-records-category]').forEach(function (el) {
            el.onclick = function () {
                recordsCategory = el.dataset.recordsCategory;
                render();
            };
        });
        document.querySelectorAll('[data-records-scope]').forEach(function (el) {
            el.onclick = function () {
                var scope = el.dataset.recordsScope;
                if (scope === 'mine') {
                    requireLogin(function () { recordsScope = 'mine'; render(); });
                } else {
                    recordsScope = 'ours';
                    render();
                }
            };
        });
        var addRecordBtn = document.getElementById('addRecordBtn');
        if (addRecordBtn)
            addRecordBtn.onclick = function () { requireLogin(function () { openRecordBookPickerModal_(); }); };
        var addExchangeRecordBtn = document.getElementById('addExchangeRecordBtn');
        if (addExchangeRecordBtn)
            addExchangeRecordBtn.onclick = function () { requireLogin(function () { openExchangeRecordPickerModal_(); }); };
        var addReviewBtn = document.getElementById('addReviewBtn');
        if (addReviewBtn)
            addReviewBtn.onclick = function () { openReviewBookPickerModal_(); };
        document.querySelectorAll('[data-wish-detail]').forEach(function (el) {
            el.onclick = function (e) {
                if (e.target.closest('.has-book-btn')) return;
                if (e.target.closest('[data-delete-wish]')) return;
                openWishDetailModal(el.dataset.wishDetail);
            };
        });
        var addShelfBookBtn = document.getElementById('addShelfBookBtn');
        if (addShelfBookBtn)
            addShelfBookBtn.onclick = function () {
                requireLogin(function (myId) {
                    openAddBookModal({ ownerId: myId, title: '서고에 책 추가', withPageCount: false, withExchangeProposal: false });
                });
            };
        document.querySelectorAll('[data-shelf-scope]').forEach(function (el) {
            el.onclick = function () {
                var scope = el.dataset.shelfScope;
                if (scope === 'mine') {
                    requireLogin(function () { shelfScope = 'mine'; render(); });
                } else {
                    shelfScope = 'ours';
                    // "다음에 읽을 책"/"찜한 책" 탭은 내 서고 전용이라, 우리 서고로 돌아가면
                    // 탭이 사라지니 거기 머물러 있던 상태면 기본 탭으로 되돌린다.
                    if (shelfCategory === 'nextToRead' || shelfCategory === 'wanted') shelfCategory = 'finished';
                    render();
                }
            };
        });
        document.querySelectorAll('[data-shelf-category]').forEach(function (el) {
            el.onclick = function () {
                shelfCategory = el.dataset.shelfCategory;
                render();
            };
        });
        var shelfSearchInput = document.getElementById('shelfSearchInput');
        if (shelfSearchInput) {
            shelfSearchInput.oninput = function () {
                var scopeMine = shelfScope === 'mine';
                var myId = getLoggedInMemberId();
                var reading = state.books.filter(function (b) { return b.status === 'reading' && (!scopeMine || b.ownerId === myId); });
                var finished = state.books.filter(function (b) { return b.status === 'finished' && (!scopeMine || b.ownerId === myId); });
                var unread = state.books.filter(function (b) { return b.status === 'shelved' && (!scopeMine || b.ownerId === myId); });
                var nextToRead = state.books.filter(function (b) { return b.status === 'shelved' && b.wantToRead && b.ownerId === myId; });
                var wanted = scopeMine && myId ? (function () {
                    var groups = libraryGroupsForMember_(myId);
                    return groups.hearted.concat(groups.wishItems);
                })() : [];
                var list = shelfCategoryList_(shelfCategory, reading, finished, unread, nextToRead, wanted);
                var filtered = shelfSearchFilter_(list, shelfSearchInput.value);
                var emptyText = shelfSearchInput.value.trim() ? '검색 결과가 없어요.' : SHELF_EMPTY_TEXT_[shelfCategory];
                document.getElementById('shelfCardsBox').innerHTML = shelfCardsHtml_(shelfCategory, filtered, emptyText);
                attachRootEvents();
            };
        }
        var wishSearchInput = document.getElementById('wishSearchInput');
        if (wishSearchInput) {
            wishSearchInput.oninput = function () {
                var wishes = state.wishlist || [];
                var filtered = shelfSearchFilter_(wishes, wishSearchInput.value);
                var emptyText = wishSearchInput.value.trim() ? '검색 결과가 없어요.' : SHELF_EMPTY_TEXT_.wish;
                document.getElementById('wishCardsBox').innerHTML = shelfCardsHtml_('wish', filtered, emptyText);
                attachRootEvents();
            };
        }
        document.querySelectorAll('[data-exchange-view]').forEach(function (el) {
            el.onclick = function () {
                exchangeViewMode = el.dataset.exchangeView;
                exchangeCalendarMonthOffset = 0;
                render();
            };
        });
        var calPrevMonthBtn = document.getElementById('calPrevMonthBtn');
        if (calPrevMonthBtn) calPrevMonthBtn.onclick = function () { exchangeCalendarMonthOffset -= 1; render(); };
        var calNextMonthBtn = document.getElementById('calNextMonthBtn');
        if (calNextMonthBtn) calNextMonthBtn.onclick = function () { exchangeCalendarMonthOffset += 1; render(); };

        document.querySelectorAll('[data-delete-entry]').forEach(function (el) {
            el.onclick = function () { return __awaiter(_this, void 0, void 0, function () {
                var err_36;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 3, , 4]);
                            return [4 /*yield*/, callServer('deletePhoto', detailBookId, el.dataset.deleteEntry)];
                        case 1:
                            applyState(_a.sent());
                            return [4 /*yield*/, Promise.resolve()];
                        case 2:
                            _a.sent();
                            render();
                            showToast('삭제했어요');
                            return [3 /*break*/, 4];
                        case 3:
                            err_36 = _a.sent();
                            showToast(err_36.message || '삭제 실패', true);
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            }); };
        });
        document.querySelectorAll('[data-lightbox]').forEach(function (el) {
            el.onclick = function () {
                var b = getBook(detailBookId);
                var p = b.photos[parseInt(el.dataset.lightbox)];
                openLightbox(p, 'book', b.id);
            };
        });
        var fab = document.getElementById('fabBtn');
        fab.onclick = function () {
            if (state.members.length === 0) {
                showToast('먼저 멤버를 추가해주세요', true);
                openAddMemberModal();
                return;
            }
            openAddBookModal();
        };
    }
    /**
     * 읽기 시작일을 고르는 모달 — 오늘이 아니라 예전부터 읽고 있었을 수도 있어서
     * 기본값은 오늘이지만 자유롭게 바꿀 수 있게 한다.
     */
    function openStartDateModal(onNext) {
        openModal('<h3>읽기 시작</h3>'
            + '<div class="field"><label>읽기 시작일</label><input type="date" id="startDateInput" value="' + todayIso() + '"></div>'
            + '<button class="btn-primary" id="submitStartDateBtn">다음</button>');
        document.getElementById('submitStartDateBtn').onclick = function () {
            var val = document.getElementById('startDateInput').value || todayIso();
            closeModal();
            onNext(val);
        };
    }
    /**
     * 이미 "읽는 중"으로 등록된 책의 시작일을 고치는 모달.
     */
    function openEditStartDateModal(bookId, currentStartDate) {
        openModal('<h3>시작일 수정</h3>'
            + '<div class="field"><label>읽기 시작일</label><input type="date" id="editStartDateInput" value="' + (currentStartDate || todayIso()) + '"></div>'
            + '<button class="btn-primary" id="submitEditStartDateBtn">저장</button>');
        document.getElementById('submitEditStartDateBtn').onclick = async function (e) {
            var val = document.getElementById('editStartDateInput').value;
            if (!val) { showToast('날짜를 선택해주세요', true); return; }
            setBtnLoading(e.target, '저장하는 중...');
            try {
                applyState(await callServer('updateReadingStartDate', bookId, getLoggedInMemberId(), val));
                closeModal();
                render();
                showToast('시작일을 수정했어요');
            } catch (err) {
                showToast(err.message || '실패했어요', true);
                resetBtn(e.target);
            }
        };
    }
    /**
     * 이미 "완독"으로 등록된 책의 가장 최근 기록(시작일·완독일)을 고치는 모달.
     */
    function openEditLastHistoryModal(bookId, entry) {
        openModal('<h3>날짜 수정</h3>'
            + '<div class="field"><label>읽기 시작일</label><input type="date" id="editHistoryStartInput" value="' + ((entry && entry.startDate) || todayIso()) + '"></div>'
            + '<div class="field"><label>완독일</label><input type="date" id="editHistoryEndInput" value="' + ((entry && entry.endDate) || todayIso()) + '"></div>'
            + '<button class="btn-primary" id="submitEditHistoryBtn">저장</button>');
        document.getElementById('submitEditHistoryBtn').onclick = async function (e) {
            var startVal = document.getElementById('editHistoryStartInput').value;
            var endVal = document.getElementById('editHistoryEndInput').value;
            if (!startVal || !endVal) { showToast('날짜를 선택해주세요', true); return; }
            setBtnLoading(e.target, '저장하는 중...');
            try {
                applyState(await callServer('updateLastHistoryDates', bookId, getLoggedInMemberId(), startVal, endVal));
                closeModal();
                render();
                showToast('날짜를 수정했어요');
            } catch (err) {
                showToast(err.message || '실패했어요', true);
                resetBtn(e.target);
            }
        };
    }
    /**
     * "이 책 추천해요"를 켤 때, 왜 추천하는지 짧은 코멘트를 남기는 모달 (선택 사항).
     */
    function openRecommendCommentModal(bookId) {
        openModal('<h3>이 책 추천해요</h3>'
            + '<div class="field"><label>왜 추천하나요? (선택)</label><textarea id="recommendCommentInput" placeholder="한마디로 이 책을 소개해주세요" maxlength="200"></textarea></div>'
            + '<button class="btn-primary" id="submitRecommendBtn">추천하기</button>');
        document.getElementById('submitRecommendBtn').onclick = async function (e) {
            var comment = document.getElementById('recommendCommentInput').value.trim();
            setBtnLoading(e.target, '등록하는 중...');
            try {
                applyState(await callServer('toggleBookRecommend', bookId, getLoggedInMemberId(), true, comment));
                closeModal();
                render();
                showToast('추천했어요 ⭐');
            } catch (err) {
                showToast(err.message || '실패했어요', true);
                resetBtn(e.target);
            }
        };
    }
    // 책주인이 특정 멤버에게 먼저 "이 책 빌려줄까요?" 제안하는 모달. 이미 대기열에
    // 있거나 이미 제안을 받은 사람은 후보에서 뺀다(중복 제안 방지, 서버도 같은 걸 막는다).
    function openProposeLendModal(bookId) {
        var b = getBook(bookId);
        if (!b) return;
        var myId = getLoggedInMemberId();
        var offeredIds = (b.lendOffers || []).map(function (o) { return o.memberId; });
        var eligible = state.members.filter(function (m) { return m.id !== myId && !queueHasMember(b.queue, m.id) && offeredIds.indexOf(m.id) === -1; });
        if (!eligible.length) {
            showToast('제안할 수 있는 멤버가 없어요', true);
            return;
        }
        openModal('<h3>교환 제안하기</h3>'
            + '<div class="field"><label>누구에게 빌려줄까요?</label>'
            + '<select id="lendTargetMember" class="input-plain">' + eligible.map(function (m) { return '<option value="' + m.id + '">' + escapeHtml(m.name) + '</option>'; }).join('') + '</select>'
            + '</div>'
            + '<div class="field"><label>원하는 날짜 (선택)</label><input type="date" id="lendDesiredDate"></div>'
            + '<button class="btn-primary" id="submitLendOfferBtn">제안하기</button>');
        document.getElementById('submitLendOfferBtn').onclick = async function (e) {
            var targetId = document.getElementById('lendTargetMember').value;
            var date = document.getElementById('lendDesiredDate').value || null;
            setBtnLoading(e.target, '제안하는 중...');
            try {
                applyState(await callServer('proposeBookToMember', bookId, myId, targetId, date));
                closeModal();
                render();
                showToast('제안했어요');
            } catch (err) {
                showToast(err.message || '실패했어요', true);
                resetBtn(e.target);
            }
        };
    }
    /**
     * 확정된 교환일 중 하나를 고르는 공통 모달.
     * title: 안내 문구, onPick(dateOrNull): 선택 완료 콜백 (건너뛰면 null)
     */
    function openPickExchangeDateModal(title, onPick) {
        var dates = state.confirmedExchangeDates || [];
        openModal("\n    <h3>".concat(escapeHtml(title), "</h3>\n    ").concat(dates.length ? "\n      <div class=\"card-stack\" style=\"margin-bottom:14px;\">\n        ".concat(dates.map(function (d) {
            var names = memberNamesText(d.memberIds);
            var dday = daysUntil(d.date);
            var ddayText = '';
            if (dday !== null) {
                if (dday === 0)
                    ddayText = 'D-DAY';
                else if (dday > 0)
                    ddayText = "D-".concat(dday);
                else
                    ddayText = "".concat(Math.abs(dday), "\uC77C \uC9C0\uB0A8");
            }
            return "\n          <button class=\"due-card\" style=\"cursor:pointer;text-align:left;\" data-pick-date=\"".concat(d.date, "\">\n            <div class=\"due-card-top\" style=\"align-items:center;justify-content:space-between;\">\n              <div class=\"due-card-info\">\n                <div class=\"title\" style=\"font-size:15px;\">").concat(fmtDateFull(d.date), "</div>\n                <div class=\"author\">").concat(names ? escapeHtml(names) : '아직 아무도 없음', "</div>\n              </div>\n              <span class=\"ex-dday\" style=\"background:var(--ink);\">").concat(ddayText, "</span>\n            </div>\n          </button>\n        ");
        }).join(''), "\n      </div>\n    ") : "\n      <p style=\"font-size:12.5px;color:var(--pencil);margin-bottom:14px;\">\uC544\uC9C1 \uD655\uC815\uB41C \uAD50\uD658\uC77C\uC774 \uC5C6\uC5B4\uC694.</p>\n    ", "\n    <button class=\"btn-secondary\" id=\"pickDateProposeBtn\">\uAD50\uD658\uC77C \uC81C\uC548\uD558\uB7EC \uAC00\uAE30</button>\n    <button class=\"btn-text\" id=\"pickDateSkipBtn\" style=\"width:100%;margin-top:10px;\">\uB0A0\uC9DC \uC5C6\uC774 \uC9C4\uD589\uD560\uB798\uC694</button>\n  "));
        document.querySelectorAll('[data-pick-date]').forEach(function (el) {
            el.onclick = function () { closeModal(); onPick(el.dataset.pickDate); };
        });
        document.getElementById('pickDateSkipBtn').onclick = function () { closeModal(); onPick(null); };
        document.getElementById('pickDateProposeBtn').onclick = function () {
            closeModal();
            openSetExchangeDateModal();
        };
    }
    function openMemberPickerForQueue(bookId) {
        requireLogin(function (myId) {
            var b = getBook(bookId);
            if (!b.currentReaderId) {
                if (b.status === 'finished') {
                    showToast('완독된 책이에요. 책 상세에서 "읽기 신청"을 해주세요.', true);
                } else {
                    showToast('지금 읽는 사람이 없는 책이에요. 책 상세에서 바로 읽기 시작할 수 있어요.', true);
                }
                return;
            }
            if (myId === b.currentReaderId) {
                showToast('이미 이 책을 읽고 있어요', true);
                return;
            }
            if (queueHasMember(b.queue, myId)) {
                showToast('이미 대기열에 있어요', true);
                return;
            }
            if ((b.queueRequests || []).some(function (r) { return r.memberId === myId; })) {
                showToast('이미 신청했어요', true);
                return;
            }
            openRequestQueueModal(bookId);
        });
    }
    /**
     * 지금 읽는 중인 책에 대기(찜)를 신청하는 모달. 날짜는 선택이며, 비워두면
     * "날짜는 나중에" 신청으로 처리된다. 신청은 즉시 등록되지 않고 지금 읽는
     * 사람의 승인을 거쳐야 대기열에 편입된다.
     */
    function memberHasEmail_(memberId) {
        var m = getMember(memberId);
        return !!(m && m.email);
    }
    function countIncomingQueueRequestsFor_(memberId) {
        return state.books.reduce(function (sum, b) {
            if (b.currentReaderId !== memberId) return sum;
            return sum + (b.queueRequests || []).filter(function (r) { return !r.counterDate; }).length;
        }, 0);
    }
    var NO_EMAIL_SUFFIX = ' (상대방에게 이메일이 없어서 알림은 못 갔어요)';
    /**
     * "모집 중인 교환일 선택 / 새 날짜 제안 / 날짜는 나중에" 3단 신청 모달의 공용 구현.
     * 찜 신청(requestToJoinQueue)과 읽기 신청(requestToReadBook)이 같이 쓴다.
     */
    function openDateRequestModal(config) {
        requireLogin(function (myId) {
            var dateMembers = {};
            (state.confirmedExchangeDates || []).forEach(function (d) {
                dateMembers[d.date] = (dateMembers[d.date] || []).concat(d.memberIds || []);
            });
            (state.exchangeProposals || []).forEach(function (p) {
                // 참석자가 0명이 된 제안(다들 불참으로 빠짐)은 교환일 달력에서도 안 보이니,
                // 여기서도 똑같이 빼야 한다 — 안 그러면 아무도 안 오는 날짜가 "모집 중"으로 남는다.
                if ((p.votes || []).length > 0) {
                    dateMembers[p.date] = (dateMembers[p.date] || []).concat(p.votes);
                }
            });
            var recruitingDates = Object.keys(dateMembers).sort();

            var listHtml = recruitingDates.length
                ? '<div class="section-label" style="margin:0 0 8px;"><span class="num mono">D</span><h2>모집 중인 교환일</h2><span class="line"></span></div>'
                    + '<div class="card-stack" style="gap:8px;margin-bottom:14px;">' + recruitingDates.map(function (d) {
                        var names = memberNamesText(dateMembers[d].filter(function (id, idx) { return dateMembers[d].indexOf(id) === idx; }));
                        return '<button class="due-card" style="cursor:pointer;text-align:left;padding:12px;" data-pick-existing-date="' + d + '">'
                            + '<div>' + fmtDateFull(d) + '</div>'
                            + '<div style="font-size:11.5px;color:var(--pencil);margin-top:2px;font-weight:400;">' + (names ? escapeHtml(names) : '아직 아무도 없음') + '</div>'
                            + '</button>';
                    }).join('') + '</div>'
                : '';

            openModal('<h3>' + escapeHtml(config.title) + '</h3>'
                + '<p style="font-size:12.5px;color:var(--pencil);margin-bottom:12px;">' + config.hint + '</p>'
                + listHtml
                + '<div class="field"><label>새로운 날짜 제안 (선택)</label><input type="date" id="requestDateInput"></div>'
                + '<button class="btn-primary" id="submitRequestDateBtn">이 날짜로 신청하기</button>'
                + '<button class="btn-text" id="skipRequestDateBtn" style="margin-top:8px;">날짜는 나중에 정할래요</button>');

            var submit = async function (desiredDate, btn) {
                setBtnLoading(btn, '신청하는 중...');
                try {
                    applyState(await callServer(config.serverFn, config.bookId, myId, desiredDate));
                    closeModal();
                    render();
                    var emailOk = config.hasEmail(getBook(config.bookId));
                    showToast(config.successMessage + (emailOk ? '' : NO_EMAIL_SUFFIX), !emailOk);
                } catch (err) {
                    showToast(err.message || '신청 실패', true);
                    resetBtn(btn);
                }
            };

            document.querySelectorAll('[data-pick-existing-date]').forEach(function (btn) {
                btn.onclick = function () { submit(btn.dataset.pickExistingDate, btn); };
            });
            document.getElementById('submitRequestDateBtn').onclick = function (e) {
                var val = document.getElementById('requestDateInput').value;
                if (!val) { showToast('날짜를 선택하거나, 날짜 없이 신청하려면 아래 버튼을 눌러주세요', true); return; }
                submit(val, e.target);
            };
            document.getElementById('skipRequestDateBtn').onclick = function (e) {
                submit(null, e.target);
            };
        });
    }
    // 대기열에 날짜 없이 들어간 사람이 스스로 날짜를 정하는 모달 (경쟁자 알림 배너에서 진입).
    function openSetMyQueueDateModal(bookId) {
        requireLogin(function (myId) {
            openModal('<h3>내 날짜 정하기</h3>'
                + '<p style="font-size:12.5px;color:var(--pencil);margin-bottom:12px;">이 날짜에 교환하고 읽을게요.</p>'
                + '<div class="field"><input type="date" id="myQueueDateInput"></div>'
                + '<button class="btn-primary" id="submitMyQueueDateBtn">이 날짜로 정하기</button>');
            document.getElementById('submitMyQueueDateBtn').onclick = async function (e) {
                var val = document.getElementById('myQueueDateInput').value;
                if (!val) { showToast('날짜를 선택해주세요', true); return; }
                setBtnLoading(e.target, '저장하는 중...');
                try {
                    applyState(await callServer('setMyQueueDate', bookId, myId, val));
                    closeModal();
                    render();
                    showToast('날짜를 정했어요');
                } catch (err) {
                    showToast(err.message || '실패했어요', true);
                    resetBtn(e.target);
                }
            };
        });
    }
    function openRequestQueueModal(bookId) {
        openDateRequestModal({
            title: '읽기 신청',
            hint: '모집 중인 교환일 중에서 고르거나, 새 날짜를 제안해주세요. 지금 읽는 사람이 확인 후 수락해요.',
            bookId: bookId,
            serverFn: 'requestToJoinQueue',
            successMessage: '읽기 신청했어요. 지금 읽는 사람이 승인하면 알려드릴게요.',
            hasEmail: function (b) { return memberHasEmail_(b.currentReaderId) || memberHasEmail_(b.ownerId); }
        });
    }
    function openRequestReadModal(bookId) {
        openDateRequestModal({
            title: '읽기 신청',
            hint: '모집 중인 교환일 중에서 고르거나, 새 날짜를 제안해주세요. 책주인이 확인 후 수락해요.',
            bookId: bookId,
            serverFn: 'requestToReadBook',
            successMessage: '읽기 신청했어요. 책주인이 승인하면 알려드릴게요.',
            hasEmail: function (b) { return memberHasEmail_(b.ownerId); }
        });
    }
    function myExistingBookIdsForDate_(dateStr, memberId) {
        var proposal = (state.exchangeProposals || []).find(function (p) { return p.date === dateStr; });
        return (proposal && proposal.bookIdsByMember && proposal.bookIdsByMember[memberId]) ? proposal.bookIdsByMember[memberId].slice() : [];
    }
    function exchangeDateFlowHtml_(dateStr) {
        var books = state.books.filter(function (b) { return b.status === 'reading' && b.nextExchangeDate === dateStr; });
        var myId = getLoggedInMemberId();
        var flowHtml = !books.length
            ? '<p style="font-size:12.5px;color:var(--pencil);margin-bottom:14px;">아직 이 날짜에 걸린 책이 없어요.</p>'
            : '<div class="card-stack" style="gap:8px;margin-bottom:10px;">' + books.map(function (b) {
                var reader = getMember(b.currentReaderId);
                var matched = (b.queue || []).find(function (q) { return q.desiredDate === dateStr; });
                var nextMember = matched ? getMember(matched.memberId) : null;
                var removeBtn = (myId && myId === b.currentReaderId)
                    ? '<button class="btn-text" style="color:var(--stamp);flex-shrink:0;" data-remove-flow-book="' + b.id + '">빼기</button>'
                    : '';
                return '<div class="due-card" style="padding:10px 12px;">'
                    + '<div style="display:flex;align-items:center;gap:10px;">'
                    + '<div class="book-thumb" style="width:34px;height:48px;flex-shrink:0;cursor:pointer;" data-goto-book="' + b.id + '">' + bookThumbHtml(b) + '</div>'
                    + '<div style="flex:1;min-width:0;cursor:pointer;" data-goto-book="' + b.id + '">'
                    + '<div class="title" style="font-size:13.5px;">' + escapeHtml(b.title) + '</div>'
                    + '<div class="author" style="font-size:11.5px;">' + escapeHtml((reader || {}).name || '?') + ' → ' + (nextMember ? escapeHtml(nextMember.name) : '미정') + '</div>'
                    + '</div>' + removeBtn + '</div></div>';
            }).join('') + '</div>';

        var isResolved = (state.resolvedExchangeDates || []).some(function (r) { return r.date === dateStr; });
        var addableBooks = (myId && !isResolved) ? state.books.filter(function (b) { return b.status === 'reading' && b.currentReaderId === myId && b.nextExchangeDate !== dateStr; }) : [];
        var addHtml = addableBooks.length
            ? '<button class="btn-secondary" id="addBookToDateBtn" style="margin-bottom:14px;">+ 내 책 가져가기</button>'
            : '';

        return flowHtml + addHtml;
    }
    function exchangeCommentsHtml_(dateStr) {
        var proposal = (state.exchangeProposals || []).find(function (p) { return p.date === dateStr; });
        var comments = (proposal && proposal.comments) || [];
        if (!comments.length) {
            return '<p style="font-size:12.5px;color:var(--pencil);">아직 댓글이 없어요.</p>';
        }
        return '<div class="entry-list">' + comments.map(function (c) {
            var author = getMember(c.memberId);
            return '<div class="entry-item text-only">'
                + '<div class="entry-body">'
                + '<div class="entry-caption">' + escapeHtml(c.text) + '</div>'
                + '<div class="entry-meta">'
                + (author ? '<span class="entry-author"><span class="entry-avatar-dot" style="' + avatarStyle(author.color) + '"></span>' + escapeHtml(author.name) + '</span>' : '')
                + '<span class="entry-date">' + fmtDateFull((c.createdAt || '').slice(0, 10)) + '</span>'
                + '</div></div></div>';
        }).join('') + '</div>';
    }
    function exchangePhotosHtml_(dateStr) {
        var proposal = (state.exchangeProposals || []).find(function (p) { return p.date === dateStr; });
        var photos = ((proposal && proposal.photos) || []).filter(function (p) { return p.type === 'photo'; });
        if (!photos.length) {
            return '<p style="font-size:12.5px;color:var(--pencil);">아직 모임 사진이 없어요.</p>';
        }
        return '<div class="entry-list">' + photos.map(function (p) {
            var author = getMember(p.authorId);
            return '<div class="entry-item">'
                + '<div class="entry-photo" data-exchange-lightbox="' + p.id + '"><img src="' + p.url + '"></div>'
                + '<div class="entry-body">'
                + (p.caption ? '<div class="entry-caption">' + escapeHtml(p.caption) + '</div>' : '')
                + '<div class="entry-meta">'
                + (author ? '<span class="entry-author"><span class="entry-avatar-dot" style="' + avatarStyle(author.color) + '"></span>' + escapeHtml(author.name) + '</span>' : '')
                + '<span class="entry-date">' + fmtDateFull((p.createdAt || '').slice(0, 10)) + '</span>'
                + '</div></div></div>';
        }).join('') + '</div>';
    }
    /**
     * 홈 화면의 특정 교환일 카드를 눌렀을 때: 그 날짜에 걸린 책들의 흐름(누가→누가),
     * 모임 사진, 댓글(시간·장소 조율용)을 보여준다.
     */
    function openExchangeDateDetailModal(dateStr) {
        var dateGroup = (state.confirmedExchangeDates || []).find(function (d) { return d.date === dateStr; });
        var proposal = (state.exchangeProposals || []).find(function (p) { return p.date === dateStr; });
        var resolved = (state.resolvedExchangeDates || []).find(function (r) { return r.date === dateStr; });
        var names = dateGroup ? memberNamesText(dateGroup.memberIds) : (proposal ? memberNamesText(proposal.votes) : '');

        var resolveHtml = resolved
            ? '<p style="font-size:12.5px;color:var(--pencil);margin-bottom:14px;">' + (resolved.status === 'completed' ? '✅ 완료된 모임이에요.' : '🚫 취소된 모임이에요.') + '</p>'
            : (dateGroup
                ? '<div class="exchange-actions" style="margin-bottom:14px;"><button class="heart-btn" data-resolve-date="' + dateStr + '" data-resolve-status="completed">✅ 모임 완료</button><button class="btn-text" style="color:var(--stamp);" data-resolve-date="' + dateStr + '" data-resolve-status="cancelled">모임 취소</button></div>'
                : '');
        openModal('<h3>' + fmtDateFull(dateStr) + '</h3>'
            + (names ? '<p style="font-size:12.5px;color:var(--pencil);margin-bottom:14px;">👥 ' + escapeHtml(names) + '</p>' : '')
            + resolveHtml
            + '<div class="section-label" style="margin:0 0 8px;"><span class="num mono">B</span><h2>책 흐름</h2><span class="line"></span></div>'
            + '<div id="exchangeDateFlowBox">' + exchangeDateFlowHtml_(dateStr) + '</div>'
            + '<div class="section-label" style="margin:0 0 8px;"><span class="num mono">P</span><h2>모임 사진</h2><span class="line"></span></div>'
            + '<button class="btn-secondary" id="addExchangePhotoBtn" style="margin-bottom:14px;">＋ 모임 사진 남기기</button>'
            + '<div id="exchangePhotosBox">' + exchangePhotosHtml_(dateStr) + '</div>'
            + '<input type="file" id="exchangePhotoFileInput" accept="image/*" style="display:none;">'
            + '<div class="section-label" style="margin:0 0 8px;"><span class="num mono">C</span><h2>댓글</h2><span class="line"></span></div>'
            + '<div class="assign-select-row" style="margin-bottom:12px;">'
            + '<input type="text" id="exchangeCommentInput" class="input-plain" placeholder="시간·장소 등 자유롭게 남겨주세요" maxlength="300" style="flex:1;">'
            + '<button class="heart-btn" id="exchangeCommentBtn" style="flex-shrink:0;">남기기</button>'
            + '</div>'
            + '<div id="exchangeCommentsBox">' + exchangeCommentsHtml_(dateStr) + '</div>');

        wireExchangeDateDetailEvents_(dateStr);
    }
    function wireExchangeDateDetailEvents_(dateStr) {
        document.querySelectorAll('[data-resolve-date]').forEach(function (btn) {
            btn.onclick = function () {
                var status = btn.dataset.resolveStatus;
                if (status === 'cancelled' && !confirm(fmtDateFull(dateStr) + ' 모임을 취소할까요? 잡혀있던 교환일이 풀려요.')) return;
                requireLogin(async function (myId) {
                    setBtnLoading(btn, '처리 중...');
                    try {
                        applyState(await callServer('resolveExchangeDate', dateStr, status, myId));
                        closeModal();
                        render();
                        showToast(status === 'completed' ? '모임을 완료 처리했어요' : '모임을 취소했어요');
                    } catch (err) {
                        showToast(err.message || '실패', true);
                        resetBtn(btn);
                    }
                });
            };
        });
        document.querySelectorAll('#exchangeDateFlowBox [data-goto-book]').forEach(function (btn) {
            btn.onclick = function () {
                closeModal();
                detailBookId = btn.dataset.gotoBook;
                currentView = 'bookDetail';
                render();
                window.scrollTo(0, 0);
            };
        });
        document.querySelectorAll('#exchangeDateFlowBox [data-remove-flow-book]').forEach(function (removeBtn) {
            removeBtn.onclick = function () {
                requireLogin(async function (myId) {
                    setBtnLoading(removeBtn, '...');
                    try {
                        applyState(await callServer('removeBookFromExchangeDate', dateStr, removeBtn.dataset.removeFlowBook, myId));
                        document.getElementById('exchangeDateFlowBox').innerHTML = exchangeDateFlowHtml_(dateStr);
                        wireExchangeDateDetailEvents_(dateStr);
                        showToast('이 날짜에서 뺐어요');
                    } catch (err) {
                        showToast(err.message || '실패', true);
                        resetBtn(removeBtn);
                    }
                });
            };
        });
        var addBookBtn = document.getElementById('addBookToDateBtn');
        if (addBookBtn) {
            addBookBtn.onclick = function () {
                requireLogin(function (myId) {
                    var addableBooks = state.books.filter(function (b) { return b.status === 'reading' && b.currentReaderId === myId && b.nextExchangeDate !== dateStr; });
                    if (!addableBooks.length) {
                        showToast('가져갈 다른 책이 없어요', true);
                        return;
                    }
                    openModal('<h3>' + fmtDateFull(dateStr) + '에 가져갈 책 고르기</h3>'
                        + '<div class="card-stack" style="gap:8px;">' + addableBooks.map(function (b) {
                            return '<button class="due-card" style="cursor:pointer;text-align:left;padding:10px 12px;" data-add-flow-book="' + b.id + '">'
                                + '<div style="display:flex;align-items:center;gap:10px;">'
                                + '<div class="book-thumb" style="width:34px;height:48px;flex-shrink:0;">' + bookThumbHtml(b) + '</div>'
                                + '<div class="title" style="font-size:13.5px;">' + escapeHtml(b.title) + '</div>'
                                + '</div></button>';
                        }).join('') + '</div>');
                    document.querySelectorAll('[data-add-flow-book]').forEach(function (pickBtn) {
                        pickBtn.onclick = async function () {
                            try {
                                var mergedIds = myExistingBookIdsForDate_(dateStr, myId);
                                if (mergedIds.indexOf(pickBtn.dataset.addFlowBook) === -1) mergedIds.push(pickBtn.dataset.addFlowBook);
                                applyState(await callServer('joinExchangeDate', dateStr, myId, mergedIds));
                                closeModal();
                                openExchangeDateDetailModal(dateStr);
                                showToast('책을 추가했어요');
                            } catch (err) {
                                showToast(err.message || '실패', true);
                            }
                        };
                    });
                });
            };
        }
        document.querySelectorAll('#exchangePhotosBox [data-exchange-lightbox]').forEach(function (el) {
            el.onclick = function () {
                var p = findRecordPhoto_('exchange', dateStr, el.dataset.exchangeLightbox);
                if (p) openLightbox(p, 'exchange', dateStr);
            };
        });
        var addExchangePhotoBtn = document.getElementById('addExchangePhotoBtn');
        var exchangePhotoInput = document.getElementById('exchangePhotoFileInput');
        if (addExchangePhotoBtn && exchangePhotoInput) {
            addExchangePhotoBtn.onclick = function () { return requireLogin(function () { exchangePhotoInput.click(); }); };
            exchangePhotoInput.onchange = function (e) {
                var file = e.target.files[0];
                if (!file) return;
                if (file.size > 4 * 1024 * 1024) {
                    showToast('사진 용량이 너무 커요 (4MB 이하)', true);
                    return;
                }
                var reader = new FileReader();
                reader.onload = function () { openPhotoCaptionModal('exchange', dateStr, reader.result); };
                reader.readAsDataURL(file);
                exchangePhotoInput.value = '';
            };
        }
        var btn = document.getElementById('exchangeCommentBtn');
        var input = document.getElementById('exchangeCommentInput');
        if (!btn || !input) return;
        var submit = function () {
            var text = input.value.trim();
            if (!text) return;
            requireLogin(async function (myId) {
                setBtnLoading(btn, '...');
                try {
                    applyState(await callServer('addExchangeDateComment', dateStr, myId, text));
                    document.getElementById('exchangeCommentsBox').innerHTML = exchangeCommentsHtml_(dateStr);
                    document.getElementById('exchangeDateFlowBox').innerHTML = exchangeDateFlowHtml_(dateStr);
                    wireExchangeDateDetailEvents_(dateStr);
                    input.value = '';
                } catch (err) {
                    showToast(err.message || '실패', true);
                } finally {
                    resetBtn(btn);
                }
            });
        };
        btn.onclick = submit;
        input.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    }
    /**
     * 완독 처리 전에 후기를 남길 수 있는 모달(선택 — 비워두고 넘어가도 됨).
     */
    function openMarkFinishedReviewModal(bookId) {
        openModal('<h3>완독하셨네요!</h3>'
            + '<div class="field"><label>완독일</label><input type="date" id="finishDateInput" value="' + todayIso() + '"></div>'
            + '<div class="field"><label>완독 후기 (선택)</label><textarea id="finishReviewInput" placeholder="어떤 책이었나요?" maxlength="500"></textarea></div>'
            + '<button class="btn-primary" id="submitFinishBtn">완독 처리</button>');
        document.getElementById('submitFinishBtn').onclick = async function (e) {
            var review = document.getElementById('finishReviewInput').value.trim();
            var endDate = document.getElementById('finishDateInput').value || todayIso();
            setBtnLoading(e.target, '처리 중...');
            try {
                applyState(await callServer('markFinished', bookId, getLoggedInMemberId(), review, endDate));
                closeModal();
                currentView = 'shelf';
                render();
                showToast('완독했어요 📚');
            } catch (err) {
                showToast(err.message || '처리 실패', true);
                resetBtn(e.target);
            }
        };
    }
    /**
     * 지금 읽는 사람이 찜 신청에 다른 날짜를 역제안할 때 쓰는 간단한 날짜 입력 모달.
     */
    function openPickCounterDateModal(onPick) {
        openModal('<h3>다른 날짜 제안</h3>'
            + '<div class="field"><label>제안할 날짜</label><input type="date" id="counterDateInput"></div>'
            + '<button class="btn-primary" id="submitCounterDateBtn">제안하기</button>');
        document.getElementById('submitCounterDateBtn').onclick = function () {
            var val = document.getElementById('counterDateInput').value;
            if (!val) { showToast('날짜를 선택해주세요', true); return; }
            closeModal();
            onPick(val);
        };
    }
    /**
     * entityType: 'book' | 'exchange'. entityId는 book이면 bookId, exchange면 dateStr.
     * 댓글은 addRecordComment로 사진 하나(p.id)에 달린다.
     */
    function findRecordPhoto_(entityType, entityId, photoId) {
        var list = entityType === 'exchange'
            ? ((state.exchangeProposals || []).find(function (pr) { return pr.date === entityId; }) || {}).photos
            : (getBook(entityId) || {}).photos;
        return (list || []).find(function (x) { return x.id === photoId; }) || null;
    }
    function openLightbox(p, entityType, entityId, groupIds, groupIndex) {
        groupIds = groupIds || [p.id];
        groupIndex = groupIndex || 0;
        var lb = document.createElement('div');
        lb.className = 'photo-lightbox';
        var lbBook = entityType === 'book' ? getBook(entityId) : null;
        var titleHtml = lbBook ? '<div class="lb-title">' + escapeHtml(lbBook.title) + '</div>' : '';
        var comments = p.comments || [];
        var commentsHtml = comments.length
            ? comments.map(function (c) {
                var author = getMember(c.memberId);
                return '<div class="entry-item text-only" style="margin-bottom:6px;">'
                    + '<div class="entry-body"><div class="entry-caption">' + escapeHtml(c.text) + '</div>'
                    + '<div class="entry-meta">' + (author ? '<span class="entry-author"><span class="entry-avatar-dot" style="' + avatarStyle(author.color) + '"></span>' + escapeHtml(author.name) + '</span>' : '')
                    + '<span class="entry-date">' + fmtDateFull((c.createdAt || '').slice(0, 10)) + '</span>'
                    + recordHeartBtnHtml_(entityType, entityId, c.id, p.id, c.hearts)
                    + '</div></div></div>';
            }).join('')
            : '<p style="font-size:12px;color:var(--pencil);">아직 댓글이 없어요.</p>';
        var photoHeartHtml = recordHeartBtnHtml_(entityType, entityId, p.id, null, p.hearts);
        var navHtml = groupIds.length > 1
            ? "\n    <button class=\"lb-nav lb-prev\"" + (groupIndex <= 0 ? ' disabled' : '') + ">‹</button>\n    <button class=\"lb-nav lb-next\"" + (groupIndex >= groupIds.length - 1 ? ' disabled' : '') + ">›</button>\n    <div class=\"lb-counter\">" + (groupIndex + 1) + " / " + groupIds.length + "</div>"
            : '';
        lb.innerHTML = "\n    <button class=\"lb-close\">✕</button>\n    " + navHtml + "\n    <img src=\"" + photoDisplayUrl(p) + "\">\n    " + titleHtml + (p.caption ? "<div class=\"lb-caption\">" + escapeHtml(p.caption) + "</div>" : '') + "\n    <div class=\"lb-heart-row\">" + photoHeartHtml + "</div>\n    <button class=\"lb-delete\">사진 삭제</button>\n    <div class=\"lb-comments\" style=\"background:var(--card-bg);border-radius:8px;padding:10px 12px;margin-top:10px;max-height:160px;overflow-y:auto;\">\n      " + commentsHtml + "\n    </div>\n    <div class=\"assign-select-row\" style=\"margin-top:8px;\">\n      <input type=\"text\" id=\"lbCommentInput\" class=\"input-plain\" placeholder=\"댓글 남기기\" maxlength=\"300\" style=\"flex:1;\">\n      <button class=\"heart-btn\" id=\"lbCommentBtn\" style=\"flex-shrink:0;\">남기기</button>\n    </div>\n  ";
        document.body.appendChild(lb);
        lb.querySelector('.lb-close').onclick = function () { return lb.remove(); };
        lb.onclick = function (e) { if (e.target === lb)
            lb.remove(); };
        function goToIndex_(newIndex) {
            if (newIndex < 0 || newIndex >= groupIds.length) return;
            var freshP = findRecordPhoto_(entityType, entityId, groupIds[newIndex]);
            if (!freshP) return;
            lb.remove();
            openLightbox(freshP, entityType, entityId, groupIds, newIndex);
        }
        if (groupIds.length > 1) {
            lb.querySelector('.lb-prev').onclick = function (e) { e.stopPropagation(); goToIndex_(groupIndex - 1); };
            lb.querySelector('.lb-next').onclick = function (e) { e.stopPropagation(); goToIndex_(groupIndex + 1); };
        }
        var lbTitleEl = lb.querySelector('.lb-title');
        if (lbTitleEl) {
            lbTitleEl.onclick = function (e) {
                e.stopPropagation();
                lb.remove();
                detailBookId = entityId;
                currentView = 'bookDetail';
                render();
                window.scrollTo(0, 0);
            };
        }
        lb.querySelector('.lb-delete').onclick = async function () {
            try {
                var deleteFn = entityType === 'exchange' ? 'deleteExchangePhoto' : 'deletePhoto';
                applyState(await callServer(deleteFn, entityId, p.id));
                lb.remove();
                render();
                showToast('사진을 삭제했어요');
                var remainingIds = groupIds.filter(function (id) { return id !== p.id; });
                if (remainingIds.length) {
                    var nextIndex = Math.min(groupIndex, remainingIds.length - 1);
                    var nextP = findRecordPhoto_(entityType, entityId, remainingIds[nextIndex]);
                    if (nextP) openLightbox(nextP, entityType, entityId, remainingIds, nextIndex);
                }
            } catch (err) {
                showToast(err.message || '삭제 실패', true);
            }
        };
        lb.querySelector('#lbCommentBtn').onclick = async function () {
            var input = lb.querySelector('#lbCommentInput');
            var text = input.value.trim();
            if (!text) { showToast('댓글 내용을 입력해주세요', true); return; }
            var myId = getLoggedInMemberId();
            if (!myId) { showToast('로그인이 필요해요', true); return; }
            try {
                applyState(await callServer('addRecordComment', entityType, entityId, p.id, myId, text));
                lb.remove();
                render();
                var freshP = findRecordPhoto_(entityType, entityId, p.id);
                if (freshP) openLightbox(freshP, entityType, entityId, groupIds, groupIndex);
            } catch (err) {
                showToast(err.message || '실패', true);
            }
        };
        lb.querySelectorAll('.record-heart-btn').forEach(function (btn) {
            btn.onclick = async function (e) {
                e.stopPropagation();
                var myId = getLoggedInMemberId();
                if (!myId) { showToast('로그인이 필요해요', true); return; }
                var wasLiked = btn.dataset.heartLiked === '1';
                try {
                    applyState(await callServer('toggleRecordItemHeart', entityType, entityId, btn.dataset.heartItemId, btn.dataset.heartParentPhotoId || null, myId, !wasLiked));
                    render();
                    lb.remove();
                    var freshP = findRecordPhoto_(entityType, entityId, p.id);
                    if (freshP) openLightbox(freshP, entityType, entityId, groupIds, groupIndex);
                } catch (err) {
                    showToast(err.message || '실패', true);
                }
            };
        });
    }
    // ---------- TAB NAV ----------
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
        btn.onclick = function () {
            currentView = btn.dataset.view;
            render();
            window.scrollTo(0, 0);
        };
    });
    // ---------- INIT ----------
    function showFatalErrorScreen() {
        var _this = this;
        document.getElementById('main').innerHTML = renderFatalError();
        var retryBtn = document.getElementById('retryLoadBtn');
        retryBtn.onclick = function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        retryBtn.textContent = '다시 불러오는 중...';
                        retryBtn.disabled = true;
                        return [4 /*yield*/, refreshState()];
                    case 1:
                        _a.sent();
                        if (lastLoadError) {
                            showFatalErrorScreen();
                        }
                        else {
                            render();
                        }
                        return [2 /*return*/];
                }
            });
        }); };
    }
    function init() {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, refreshState()];
                    case 1:
                        _a.sent();
                        loaded = true;
                        renderLoginStatusUI();
                        if (lastLoadError && state.members.length === 0 && state.books.length === 0) {
                            showFatalErrorScreen();
                            return [2 /*return*/];
                        }
                        render();
                        return [2 /*return*/];
                }
            });
        });
    }
    var refreshingOnResume = false;
    async function refreshOnResume() {
        if (!loaded || refreshingOnResume) return;
        refreshingOnResume = true;
        try {
            await refreshState();
            renderLoginStatusUI();
            render();
        } finally {
            refreshingOnResume = false;
        }
    }
    // 아이폰 홈화면에 추가한 웹앱(standalone)은 백그라운드에서 돌아와도 페이지가
    // 새로 로드되지 않아 데이터가 오래된 채로 남는다. 다시 보일 때 자동으로 갱신한다.
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') refreshOnResume();
    });
    window.addEventListener('pageshow', function () { refreshOnResume(); });
    var groupNameBtn = document.getElementById('currentGroupName');
    if (groupNameBtn) {
        groupNameBtn.onclick = function () {
            currentView = 'home';
            render();
        };
    }
    var refreshAppBtn = document.getElementById('refreshAppBtn');
    if (refreshAppBtn) {
        refreshAppBtn.onclick = function () {
            showToast('새로고침 중...');
            refreshOnResume();
        };
    }
    // app.js가 로그인+그룹 선택을 마치면 이 함수를 호출해서 화면을 띄운다
    // (예전엔 파일 맨 끝에서 바로 init()을 불렀지만, 이제는 인증/그룹 선택이 끝난 뒤에만 불러야 한다).
    window.__mountApp__ = init;
})();

