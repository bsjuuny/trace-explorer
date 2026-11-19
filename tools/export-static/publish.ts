import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentBundle } from "@trace/schemas";
import { summarizeDiff, toPublicBundle, validateBundle } from "../validate-data/validate";

const MAX_BYTES = 5 * 1024 * 1024;
const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../../apps/explorer/public/content/content.json");
const backup = resolve(here, "../../apps/explorer/public/content/content.prev.json");

function fail(msg: string): never {
  console.error(`오류: ${msg}`);
  process.exit(1);
}

const arg = process.argv.slice(2).filter((a) => a !== "--")[0];
if (!arg) {
  console.error("사용법: pnpm data:publish -- <export-file.json>");
  process.exit(2);
}
const file = resolve(arg);
if (extname(file).toLowerCase() !== ".json") fail("확장자는 .json이어야 합니다");
if (!existsSync(file)) fail(`파일 없음: ${file}`);
if (statSync(file).size > MAX_BYTES) fail("파일이 5MB를 초과합니다");

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(file, "utf8"));
} catch {
  fail("JSON 파싱 실패");
}

// 1) 구조·참조 검증 → 2) 공개 필드 allowlist 적용(adminNote·verifiedBy 제거) → 3) 제거된 산출물 기준 공개 검증.
const structural = validateBundle(raw, { public: false });
for (const i of structural.issues) console.log(`[${i.level}] ${i.path}: ${i.message}`);
if (!structural.bundle || structural.issues.some((i) => i.level === "error")) {
  fail("검증 실패: 게시를 차단합니다. 기존 파일은 그대로입니다.");
}
const { issues, bundle } = validateBundle(toPublicBundle(structural.bundle), { public: true });
for (const i of issues) console.log(`[${i.level}] ${i.path}: ${i.message}`);
if (!bundle || issues.some((i) => i.level === "error")) {
  fail("검증 실패: 게시를 차단합니다. 기존 파일은 그대로입니다.");
}

let prev: ContentBundle | null = null;
if (existsSync(target)) {
  try {
    const p = ContentBundle.safeParse(JSON.parse(readFileSync(target, "utf8")));
    prev = p.success ? p.data : null;
  } catch {
    prev = null; // 손상된 기존 파일: 직전본으로 백업하지 않는다
  }
}
console.log("변경 요약:");
for (const l of summarizeDiff(prev, bundle)) console.log("  " + l);

// 임시 파일에 쓰고, 직전 정상본을 보존한 뒤 원자적으로 교체한다.
mkdirSync(dirname(target), { recursive: true });
const tmp = `${target}.tmp`;
writeFileSync(tmp, JSON.stringify(toPublicBundle(bundle), null, 2));
// 기존 파일이 검증을 통과하는 정상본일 때만 직전본으로 보존한다(손상·데모 파일로 롤백 경로를 덮어쓰지 않음).
if (prev && !prev.places.some((p) => p.publication.isDemo)) copyFileSync(target, backup);
renameSync(tmp, target);
console.log(`게시 완료: ${target}`);
