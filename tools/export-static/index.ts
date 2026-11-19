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

// data:publish로 게시한 실콘텐츠(데모가 아닌 장소 포함)는 --force 없이 덮어쓰지 않는다.
if (existsSync(out) && !process.argv.includes("--force")) {
  try {
    const cur = JSON.parse(readFileSync(out, "utf8")) as { places?: { publication?: { isDemo?: boolean } }[] };
    if (cur.places?.some((p) => p.publication?.isDemo === false)) {
      // 보존하는 파일도 공개 기준을 통과해야 한다(변조·미검수 콘텐츠가 그대로 빌드되는 것을 막는다).
      const chk = validateBundle(cur, { public: true });
      const errs = chk.issues.filter((i) => i.level === "error");
      if (errs.length > 0) {
        for (const i of errs) console.error(`[error] ${i.path}: ${i.message}`);
        console.error("오류: content.json이 공개 기준을 통과하지 못해 빌드를 중단합니다. 수정 후 data:publish로 다시 게시하거나 --force 로 데모로 교체하세요.");
        process.exit(1);
      }
      console.log(`건너뜀: ${out} 에 게시된 실콘텐츠가 있어 데모로 덮어쓰지 않습니다. (--force 로 강제)`);
      process.exit(0);
    }
  } catch {
    /* 손상된 파일은 데모로 교체한다 */
  }
}
const bundle = toPublicBundle(ContentBundle.parse(demoContent));
writeFileSync(out, JSON.stringify(bundle, null, 2));
console.log(`내보냄: ${out}`);
