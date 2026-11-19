import type { ButtonHTMLAttributes } from "react";

/** 최소 44x44px 터치 영역을 보장하는 공통 버튼 */
export function Button({ className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} className={`min-h-[44px] min-w-[44px] rounded-lg px-4 py-2 font-semibold ${className}`} />;
}
