// src/app/api/mcp/commission-tools.ts
//
// Registers the commission + work-grid MCP tools on the McpServer instance.
//
// These are the agent-facing surface of the claimable pull queue (ADR-0023) and
// the commission primitive (ADR-0022). The MCP layer is plumbing only: every
// tool delegates straight to the tRPC caller and holds no business logic. The
// claim/submit tools fail fast when the agent lacks the relevant commission
// scope, mirroring the propose-challenge `contribute`-scope gate in route.ts —
// the scope is suspended until the owner accepts the manifest version that
// introduces commissioned execution, so there is no silent capability gain.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import type { createCaller } from "@/server/api/root";

type Caller = ReturnType<typeof createCaller>;

export function registerCommissionTools(
  server: McpServer,
  caller: Caller,
  keyData: { ownerId: string | null; agentId: string; scopes: string[] },
): void {
  // ── Claim queue read ──────────────────────────────────────────────────────

  server.registerTool(
    "list-claimable-cells",
    {
      description:
        "List work-cells your owner's agent may claim right now. Only pending/requeued cells whose task type is inside your commission's allowlist and that live in a collaborative grid are returned — cells outside your commission envelope are never shown. Requires the `commission:claim-cell` scope.",
      inputSchema: {
        gridId: z
          .string()
          .optional()
          .describe("Optional work-grid ID to scope the claim queue to."),
      },
    },
    async ({ gridId }) => {
      const result = await caller.workGrid.listClaimable({ gridId });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "claim-work-cell",
    {
      description:
        "Claim a single work-cell from the pull queue so no other agent works it. Atomic — fails if the cell was already claimed, or if its task type is outside your commission allowlist. Requires the `commission:claim-cell` scope.",
      inputSchema: {
        cellId: z.string().describe("The work-cell ID to claim."),
      },
    },
    async ({ cellId }) => {
      if (!keyData.scopes.includes("commission:claim-cell")) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error:
                    "This agent lacks the `commission:claim-cell` scope. Its owner must accept the current agent manifest (commissioned execution) before it can claim work-cells.",
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      const result = await caller.workGrid.claimCell({ cellId });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "submit-cell-result",
    {
      description:
        "Return your result for a work-cell you have claimed — the outbound return path (never a webhook). Records the result for verification and marks the cell completed. Requires the `commission:submit-result` scope.",
      inputSchema: {
        cellId: z.string().describe("The claimed work-cell ID."),
        output: z.string().describe("The result output for this cell."),
      },
    },
    async ({ cellId, output }) => {
      if (!keyData.scopes.includes("commission:submit-result")) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error:
                    "This agent lacks the `commission:submit-result` scope. Its owner must accept the current agent manifest (commissioned execution) before it can submit cell results.",
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      const result = await caller.workGrid.submitCellResult({ cellId, output });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  // ── Commission grant / revoke (run as the owner) ──────────────────────────

  server.registerTool(
    "create-commission",
    {
      description:
        "Grant a standing, scoped, revocable commission for your owner's agent (one agent per human). Pre-authorises the agent to claim and execute commissioned work-cells whose task type is in the allowlist, from the named source scope. Idempotent for a given owner/agent pair.",
      inputSchema: {
        taskTypeAllowlist: z
          .array(z.string().min(1))
          .min(1)
          .describe(
            "Non-empty list of task types the commission permits (e.g. polish-text, solve-code-cell).",
          ),
        sourceScope: z
          .enum(["enrolled-challenges"])
          .default("enrolled-challenges")
          .describe("Which source may trigger the agent under this commission."),
      },
    },
    async ({ taskTypeAllowlist, sourceScope }) => {
      const result = await caller.commissions.grant({
        taskTypeAllowlist,
        sourceScope,
      });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "revoke-commission",
    {
      description:
        "Revoke a commission, closing the channel at once (instant revocation). Owner-scoped — only your own commission can be revoked.",
      inputSchema: {
        commissionId: z.string().describe("The commission ID to revoke."),
      },
    },
    async ({ commissionId }) => {
      const result = await caller.commissions.revoke({ commissionId });
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
