import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { demoContent } from "@trace/data";
import { ContentBundle } from "@trace/schemas";
import { toPublicBundle, validateBundle } from "../validate-data/validate";

/** 데모 번들을 앱 public 경로에 내보낸다(공개 필드 allowlist 적용). 실제 콘텐츠는 data:publish로 교체한다. */
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../apps/explorer/public/content/content.json");
mkdirSync(dirname(out), { recursive: true });

function fail(msg: string): never {
  console.error(`오류: ${msg}`);
  process.exit(1);
}

// 기존 content.json이 있으면 fail-closed: 정상 데모임을 확인한 경우에만 교체하고, 게시된 실콘텐츠는 보존한다.
// 파싱·구조 검증에 실패한 파일을 데모로 조용히 덮어쓰면 손상된 실콘텐츠 대신 데모가 배포될 수 있으므로 중단한다(--force로 강제).
if (existsSync(out) && !process.argv.includes("--force")) {
  let cur: unknown;
  try {
    cur = JSON.parse(readFileSync(out, "utf8"));
  } catch {
    fail(`${out} 을(를) 읽을 수 없습니다(손상된 JSON). 확인 후 data:publish로 다시 게시하거나 --force 로 데모로 교체하세요.`);
  }
  const parsed = ContentBundle.safeParse(cur);
  // 스키마가 바뀌어 예전 데모 파일이 더 이상 파싱되지 않는 경우: 모든 장소가 데모로 표시되어 있으면 새 데모로 교체한다.
  const rawPlaces = (cur as { places?: { publication?: { isDemo?: unknown } }[] } | null)?.places;
  const looksLikeDemoOnly = Array.isArray(rawPlaces) && rawPlaces.length > 0 && rawPlaces.every((p) => p?.publication?.isDemo === true);
  if (!parsed.success && !looksLikeDemoOnly) {
    fail(`${out} 의 구조가 올바르지 않습니다(${parsed.success ? "" : (parsed.error.issues[0]?.path.join(".") ?? "")}). 확인 후 data:publish로 다시 게시하거나 --force 로 데모로 교체하세요.`);
  }
  if (parsed.success && parsed.data.places.some((p) => !p.publication.isDemo)) {
    // 보존하는 파일도 공개 기준을 통과해야 한다(변조·미검수 콘텐츠가 그대로 빌드되는 것을 막는다).
    const errs = validateBundle(parsed.data, { public: true }).issues.filter((i) => i.level === "error");
    if (errs.length > 0) {
      for (const i of errs) console.error(`[error] ${i.path}: ${i.message}`);
      fail("content.json이 공개 기준을 통과하지 못해 빌드를 중단합니다. 수정 후 data:publish로 다시 게시하거나 --force 로 데모로 교체하세요.");
    }
    console.log(`건너뜀: ${out} 에 게시된 실콘텐츠가 있어 데모로 덮어쓰지 않습니다. (--force 로 강제)`);
    process.exit(0);
  }
}
const bundle = toPublicBundle(ContentBundle.parse(demoContent));
writeFileSync(out, JSON.stringify(bundle, null, 2));
console.log(`내보냄: ${out}`);
