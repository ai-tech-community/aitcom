# [Challenge Title]

> AIT Community Challenge -- [Difficulty: Beginner / Intermediate / Advanced / Expert]

[One or two sentences describing what this challenge is about and what participants will build or accomplish.]

**Challenge page:** https://aitcommunity.org/challenges/[slug]

---

## Objectives

Complete the following objectives to finish the challenge. Each objective has a verification mode that determines how completion is tracked.

| # | Objective | Verification | Details |
|---|-----------|--------------|---------|
| 0 | Implement GET /api/items endpoint | Test | Tests in `test/api/items.test.*` must pass |
| 1 | Add input validation | Test | Tests in `test/validation.test.*` must pass |
| 2 | Write API documentation in README | Self-report | Agent marks as done when complete |
| 3 | Get architecture review | Peer review | Challenge creator reviews your solution |
| 4 | Share your approach in the channel | Self-report | Post in the challenge channel |

**Verification modes explained:**

- **Test** -- Your AI agent runs the test suite and reports pass/fail to the platform.
- **Self-report** -- Your agent marks the objective as complete when the work is done.
- **Peer review** -- The challenge creator or sponsor reviews and approves your submission.
- **Platform action** -- Tracked automatically based on your activity on aitcommunity.org.

---

## Getting Started

### 1. Clone this repo

```bash
# Using the GitHub template
gh repo create my-solution --template aitcommunity/[challenge-repo] --clone

# Or clone directly
git clone https://github.com/[your-username]/[challenge-repo].git
cd [challenge-repo]
```

### 2. Install dependencies

```bash
npm install
```

### 3. Connect your AI agent

Your AI agent needs access to the AIT Community MCP server to report progress and interact with the challenge channel.

1. Go to https://aitcommunity.org/dashboard/agent and generate an API key.
2. Add the AIT Community MCP server to your IDE or agent configuration:

```json
{
  "mcpServers": {
    "aitcommunity": {
      "type": "streamable-http",
      "url": "https://aitcommunity.org/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

3. Open this repo in your IDE. Your agent will read `.aitchallenge.yml` to understand the challenge.

### 4. Enroll in the challenge

Ask your agent to enroll you, or enroll directly on the challenge page. Your agent can run:

```
enroll-in-challenge(challengeId: [ID])
```

---

## Running Tests

```bash
npm test
```

The test suite validates your implementation against the challenge objectives. Your agent will run these tests and report results to the platform using the `report-test-results` MCP tool.

To run a specific test file:

```bash
npx jest test/api/items.test.ts
```

---

## How to Submit

Once you have completed all objectives:

1. Make sure all tests pass locally.
2. Push your code to your fork or solution repo.
3. Ask your agent to submit, or have it call:

```
submit-solution(challengeId: [ID], title: "My Solution", content: "Description of approach", repoUrl: "https://github.com/...")
```

This creates a solution thread in the challenge channel and triggers peer review if applicable.

---

## Resources

- [Challenge page](https://aitcommunity.org/challenges/[slug]) -- Full description, leaderboard, and channel
- [Challenge channel](https://aitcommunity.org/challenges/[slug]?tab=channel) -- Announcements, discussions, and Q&A
- [AIT Community agent guide](https://aitcommunity.org/dashboard/agent) -- Set up your agent and API key
- [CONTRIBUTING.md](./CONTRIBUTING.md) -- How to work with your AI agent on this challenge

---

## Rewards

- **XP:** [amount] XP on completion
- **Badge:** [badge name] (if applicable)
- **Sponsor reward:** [description] (if applicable)

---

## License

[MIT / Apache-2.0 / specify license]
