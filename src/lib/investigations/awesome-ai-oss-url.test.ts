import { describe, expect, it } from "vitest";
import {
  AWESOME_REPO_URL_ERROR,
  parseAwesomeRepoUrl,
} from "./awesome-ai-oss-url";

describe("parseAwesomeRepoUrl", () => {
  it("accepts live GitHub owner/repo URLs and normalizes them", () => {
    expect(
      parseAwesomeRepoUrl("https://github.com/openai/openai-agents-python"),
    ).toEqual({
      ok: true,
      value: {
        host: "github",
        path: "openai/openai-agents-python",
        normalized: "https://github.com/openai/openai-agents-python",
      },
    });
    expect(
      parseAwesomeRepoUrl("https://www.github.com/PrefectHQ/fastmcp.git/"),
    ).toEqual({
      ok: true,
      value: {
        host: "github",
        path: "PrefectHQ/fastmcp",
        normalized: "https://github.com/PrefectHQ/fastmcp",
      },
    });
  });

  it("accepts nested GitLab group paths and strips /- extras", () => {
    expect(
      parseAwesomeRepoUrl(
        "https://gitlab.com/gitlab-org/modelops/applied-ml/code-suggestions/ai-assist",
      ),
    ).toEqual({
      ok: true,
      value: {
        host: "gitlab",
        path: "gitlab-org/modelops/applied-ml/code-suggestions/ai-assist",
        normalized:
          "https://gitlab.com/gitlab-org/modelops/applied-ml/code-suggestions/ai-assist",
      },
    });
    expect(
      parseAwesomeRepoUrl(
        "https://gitlab.com/gitlab-org/ai/lazy-mcp/-/tree/main",
      ),
    ).toEqual({
      ok: true,
      value: {
        host: "gitlab",
        path: "gitlab-org/ai/lazy-mcp",
        normalized: "https://gitlab.com/gitlab-org/ai/lazy-mcp",
      },
    });
  });

  it("rejects missing repos, extra GitHub paths, and non-GitHub/GitLab hosts", () => {
    const rejected = [
      "https://github.com/openai",
      "https://github.com/openai/openai-agents-python/tree/main",
      "https://gist.github.com/someone/abc",
      "https://bitbucket.org/org/repo",
      "https://gitlab.com/users/sign_in",
      "not a url",
      "",
    ];
    for (const raw of rejected) {
      expect(parseAwesomeRepoUrl(raw)).toEqual({
        ok: false,
        error: AWESOME_REPO_URL_ERROR,
      });
    }
  });
});
