import { ContentBundle } from "@trace/schemas";
import { demoContent } from "./demo-content";

/** 검증을 통과한 데모 번들. 실제 콘텐츠가 아님. */
export const demoBundle: ContentBundle = ContentBundle.parse(demoContent);
export { demoContent };
