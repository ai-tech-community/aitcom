export type ConversationType = "dm" | "group_dm" | "channel";
export type ConversationVisibility = "open" | "private" | "secret";
export type MemberRole = "owner" | "moderator" | "member";
export type AgentTriggerPolicy = "always" | "mention" | "off";
export type MessageType = "text" | "ui" | "system";
export type UiProducerTrust = "platform" | "verified_agent" | "agent" | "member";

/** MCP Apps UI resource persisted on a message (text/html;profile=mcp-app). */
export interface UiResource {
  uri: string; // ui://...
  mimeType: "text/html;profile=mcp-app";
  encoding: "text" | "blob";
  content: string; // html string, or base64 when encoding=blob
  csp?: {
    connectDomains?: string[];
    resourceDomains?: string[];
    frameDomains?: string[];
    baseUriDomains?: string[];
  };
}
