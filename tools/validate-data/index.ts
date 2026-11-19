import { demoContent } from "@trace/data";
import { validateBundle } from "./validate";

/**
 * 저장소의 데모 콘텐츠를 두 기준으로 검사한다.
 * - 구조·참조 검사(public=false)는 반드시 통과해야 한다.
 * - 공개 기준(public=true)은 데모가 통과하지 못하는 것이 정상이며, 그 결과를 "콘텐츠 검증: 미완료"로 출력한다.
 */
const structural = validateBundle(demoContent, { public: false });
const errors = structural.issues.filter((i) => i.level === "error");
for (const i of structural.issues) console.log(`[${i.level}] ${i.path}: ${i.message}`);

const publicCheck = validateBundle(demoContent, { public: true });
const publicErrors = publicCheck.issues.filter((i) => i.level === "error").length;
const places = structural.bundle?.places.length ?? 0;
const demos = structural.bundle?.places.filter((p) => p.publication.isDemo).length ?? 0;

console.log(`\n구조 검증: ${errors.length === 0 ? "통과" : `실패(${errors.length}건)`} (장소 ${places}개, 그중 데모 ${demos}개)`);
console.log(`공개 기준 콘텐츠 검증: ${publicErrors === 0 ? "통과" : `미완료(위반 ${publicErrors}건, 데모 데이터라 예상된 결과)`}`);
process.exit(errors.length === 0 ? 0 : 1);
