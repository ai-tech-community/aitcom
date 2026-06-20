import { env } from "@/env";

export const isChatEnabled = () => env.NEXT_PUBLIC_FEATURE_CHAT === "true";
export const isChatUiEnabled = () => env.NEXT_PUBLIC_FEATURE_CHAT_UI === "true";
