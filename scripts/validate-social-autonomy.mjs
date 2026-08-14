import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const checks = [];
const check = (name, pass) => checks.push({ name, pass: !!pass });

const worker = read('workers/publish-scheduler/index.mjs');
const config = read('workers/publish-scheduler/wrangler.jsonc');
const autopost = read('functions/api/autopost.ts');
const replies = read('functions/api/ops/threads-replies.ts');
const editorial = read('functions/api/_byeoli-editorial.ts');
const agent = read('functions/api/_byeoli-social-agent.ts');
const wake = read('functions/api/_byeoli-social-wake.ts');
const auth = read('functions/api/threads-auth.ts');
const ops = read('public/ops/index.html');

check('자유 판단과 분리된 예약 미디어 scheduled 핸들러가 있다',
  /async\s+scheduled\s*\(/.test(worker)
    && /runScheduledMedia/.test(worker)
    && /MEDIA_ENDPOINT/.test(worker));
check('Worker Cron은 08·18·22 KST 미디어 슬롯만 깨운다',
  /"triggers"\s*:/.test(config) && /5,20,50 23,9,13/.test(config));
check('autopost는 예약 스크린샷만 발행하고 자유 판단기를 호출하지 않는다',
  /scheduled_screenshot_media/.test(autopost)
    && /validateSlotIso/.test(autopost)
    && /dispatchToThreads/.test(autopost)
    && !/social-agent/.test(autopost));
check('사람 답글 조작 POST는 410이다', /operator_reply_controls_retired/.test(replies) && /onRequestPost[\s\S]*json\(410/.test(replies));
check('별이가 글 댓글 침묵을 직접 고른다', /'post'\s*\|\s*'comment'\s*\|\s*'silence'/.test(editorial));
check('외부 사건은 별이에게 Threads 임무를 배정하지 않는다',
  /방송·관찰·사연은 별이에게 Threads 임무를 배정하지 않는다/.test(wake)
    && !/waitUntil\(task\)/.test(wake));
check('백로그 이어달리기는 새 글 판단을 열지 않는다',
  /if \(isAgencyWake\(trigger\.kind\)\)/.test(agent));
check('고장 난 v1 알람을 승계하지 않고 명시적 첫 시작을 기다린다',
  /STATE_KEY = 'social-director-v2'/.test(worker)
    && /await ctx\.storage\.deleteAlarm\(\)/.test(worker));
check('최근 자기 활동의 시각과 내용을 판단 앞에 둔다',
  /최근 네 Threads 활동/.test(editorial) && /recentActivity/.test(editorial));
check('댓글 답글 발행은 사람 승인 없이 즉시 실행된다', /processCollectedReplies/.test(replies) && /publishReply\(env, rec\.sourceCommentId/.test(replies));
check('OAuth에는 읽기 답글 관리와 공개글 확인 권한이 있다',
  /threads_read_replies/.test(auth) && /threads_manage_replies/.test(auth)
    && /threads_profile_discovery/.test(auth));
check('운영 화면에 승인 거절 초안 조작 버튼이 없다', !/data-action=["'](?:approve|reject|draft)/.test(ops));

for (const result of checks) {
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}`);
}
const failed = checks.filter((result) => !result.pass);
if (failed.length) process.exit(1);
console.log(`social autonomy validation: ${checks.length}/${checks.length}`);
