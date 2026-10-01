# Canvas MCP Server

[![npm version](https://img.shields.io/npm/v/@r-huijts/canvas-mcp)](https://www.npmjs.com/package/@r-huijts/canvas-mcp)
[![license](https://img.shields.io/npm/l/@r-huijts/canvas-mcp)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-stdio-blue)](https://modelcontextprotocol.io)

> Connect AI assistants to Canvas LMS — manage courses, grade submissions, edit pages, and analyze rubrics through natural conversation.

> **Fork notice:** this is a fork of [r-huijts/canvas-mcp](https://github.com/r-huijts/canvas-mcp) (MIT licensed; full credit to the original author). It adds appointment-group (office hours) tools, announcement editing, syllabus read/write, unlock/lock dates on assignments, a `published` option on `update-page-content`, and a fix for `bulk-update-assignment-dates`. See [Tool Reference](#tool-reference) — new tools are marked **(fork)** in [docs/TOOLS.md](docs/TOOLS.md).

## Quick Start

1. **Get a Canvas API token** — Canvas → Account → Settings → Approved Integrations → [New Access Token](https://community.canvaslms.com/t5/Student-Guide/How-do-I-manage-API-access-tokens-as-a-student/ta-p/273)
2. **Install** by adding the server to your Claude config with `npx` (see [Claude Desktop Integration](#claude-desktop-integration))
3. **Try a prompt** — *"List all my active Canvas courses"*

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Claude Desktop Integration](#claude-desktop-integration)
- [Other MCP Clients](#other-mcp-clients)
- [Usage Examples](#usage-examples)
- [Student Data Privacy](#student-data-privacy)
- [Tool Reference](#tool-reference)
- [Available Prompts](#available-prompts)
- [Troubleshooting](#troubleshooting)
- [Performance & Caching](#performance--caching)
- [Development](#development)
- [Staying in Sync with Upstream](#staying-in-sync-with-upstream)
- [Contributing](#contributing)
- [Security Notes](#security-notes)
- [Related Documentation](#related-documentation)
- [License](#license)

## Features

- **Courses** — list active courses, post/list/read/edit announcements, read and update the course syllabus
- **Appointment groups** — create and manage office-hour sign-up slots (create, publish, list, get, delete, reschedule slots)
- **Assignments** — create, update, delete assignments (including unlock/lock dates) and assignment groups; bulk date updates
- **Submissions** — grade work, post feedback, download submission files
- **Rubrics** — view rubrics, analyze statistics, attach rubrics to assignments
- **Students** — enrollment lists with privacy-first anonymization
- **Sections** — list sections and section-filtered submissions
- **Modules** — full module and module-item CRUD
- **Files** — browse the course Files section: folder trees, file lists, and per-folder contents
- **Pages** — edit content, publish/unpublish, manage revisions, and use the styleguide system (`generate-styleguide`, `patch-page-content`)
- **Quizzes** — full quiz, question, and question-group CRUD
- **Quiz results** — per-student answers, item analysis, report generation, and regrading
- **ePortfolios** — list and read student ePortfolios
- **Prompts** — `analyze-rubric-statistics` for multi-assignment rubric visualizations
- **Performance** — ETag-based response caching to reduce API load and token use

**80 tools** and **1 prompt** in total. See [docs/TOOLS.md](docs/TOOLS.md) for the full parameter reference.

## Prerequisites

- Node.js v18 or higher (needed for the npx and source installs)
- A Canvas API token with access to the courses you intend to manage
- Your Canvas instance URL (e.g. `https://yourschool.instructure.com`)

> **Note:** The server defaults to `https://fhict.instructure.com` if `CANVAS_BASE_URL` is not set. Set this variable to your own institution's Canvas URL.

## Installation

### Option 1: npx from GitHub (Recommended)

Run directly from this repository — no clone or global install needed:

```bash
npx -y --allow-git=all github:mdweaver/canvas-mcp
```

The first run downloads the repo and compiles it (about a minute); later runs are fast. `--allow-git=all` is required on recent npm versions, which block git-hosted packages by default. In practice you won't run this by hand — you put it in your MCP client config (see [Claude Desktop Integration](#claude-desktop-integration)).

> The original project's Desktop Extension and npm package (`@r-huijts/canvas-mcp`) do **not** include this fork's additional tools.

### Option 2: From Source

```bash
git clone https://github.com/mdweaver/canvas-mcp
cd canvas-mcp
npm install
cp .env.example .env   # then edit with your credentials
npm run build
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Configuration

Set these environment variables (via `.env` file, MCP client config, or shell):

| Variable | Required | Description |
|----------|----------|-------------|
| `CANVAS_API_TOKEN` | Yes | Personal access token from Canvas |
| `CANVAS_BASE_URL` | No | Your Canvas instance URL (default: `https://fhict.instructure.com`) |

See [.env.example](.env.example) for a template.

### Getting a Canvas API Token

1. Log in to your Canvas instance
2. Go to **Account → Settings → Approved Integrations**
3. Click **+ New Access Token**
4. Copy the token — you won't be able to see it again

Your token must belong to a user with teacher (or equivalent) access to the courses you want to manage. Canvas personal access tokens inherit the permissions of the account that created them.

## Claude Desktop Integration

1. Open Claude Desktop's configuration file:

   **macOS:**
   ```bash
   code ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

   **Windows:**
   ```bash
   code %AppData%\Claude\claude_desktop_config.json
   ```

2. Add the Canvas MCP server:

   **npx from GitHub (recommended):**
   ```json
   {
     "mcpServers": {
       "canvas": {
         "command": "npx",
         "args": ["-y", "--allow-git=all", "github:mdweaver/canvas-mcp"],
         "env": {
           "CANVAS_API_TOKEN": "your_token_here",
           "CANVAS_BASE_URL": "https://your-canvas-instance.com"
         }
       }
     }
   }
   ```

   **From source:**
   ```json
   {
     "mcpServers": {
       "canvas": {
         "command": "node",
         "args": ["/absolute/path/to/canvas-mcp/dist/index.js"],
         "env": {
           "CANVAS_API_TOKEN": "your_token_here",
           "CANVAS_BASE_URL": "https://your-canvas-instance.com"
         }
       }
     }
   }
   ```

3. Restart Claude Desktop

The `-y` flag tells npx to accept the package installation prompt automatically. `--allow-git=all` permits npm to install from a GitHub repository, which recent npm versions disable by default (without it you'll see `Fetching packages of type 'git' have been disabled`). The first launch compiles the project and may take a minute, so if the server shows as failed once, restart Claude Desktop after a short wait.

## Other MCP Clients

Any MCP client that supports stdio transport can use the same configuration pattern. Replace the config file path with your client's equivalent:

```json
{
  "mcpServers": {
    "canvas": {
      "command": "npx",
      "args": ["-y", "--allow-git=all", "github:mdweaver/canvas-mcp"],
      "env": {
        "CANVAS_API_TOKEN": "your_token_here",
        "CANVAS_BASE_URL": "https://your-canvas-instance.com"
      }
    }
  }
}
```

This works with [Cursor](https://docs.cursor.com/context/mcp), VS Code MCP extensions, and other stdio-based clients. Consult your client's MCP documentation for where to place the config file.

## Usage Examples

Copy-paste these prompts into your AI assistant after connecting the server:

```
List all my active Canvas courses
```

```
Post an announcement to course 12345 titled "Week 3 Update" with a summary of this week's topics
```

```
Show rubric statistics for assignment 67890 in course 12345
```

```
List all folders and files in the Files section of course 12345
```

```
Generate a styleguide for course 12345, then patch the syllabus page to match it
```

```
List all students in course 12345 with their actual names and emails
```

```
Create 8 half-hour office-hour slots for course 12345 starting October 14 at 2pm
```

```
Show me the current syllabus for course 12345
```

```
Edit announcement 678 in course 12345 to fix the due date in the message
```

## Student Data Privacy

This server includes **privacy-first anonymization** for student data. By default, student names and emails are pseudonymized; you can request real identities using natural language.

**Default behavior:**
- Names become `Student 1`, `Student 2`, etc.
- Emails become `student1@example.com`, `student2@example.com`
- The same student always gets the same pseudonym across calls
- Teacher and admin names are never anonymized

**Requesting real data:**
```
List all students in course 123, but show their actual names and emails
```

**Affected tools:** `list-students`, `list-assignments` (with submission data), `list-assignment-submissions`, `list-section-submissions`, `list-rubric-assessments`, `get-submission-documents`

Each affected tool accepts an `anonymous` parameter (default: `true`). Your AI assistant sets `anonymous: false` when you ask for real names.

<details>
<summary>Why teachers and admins are not anonymized</summary>

The anonymization system targets **student privacy** while preserving educational context:

- Students are the protected population whose privacy needs safeguarding
- Knowing which instructor provided feedback is pedagogically valuable
- Comments include an `author.role` field — only `role === 'student'` authors are anonymized

Example with anonymization enabled:
```
✅ "Excellent analysis! - Prof. Johnson"
❌ "I found this confusing - Student 1"
```

If you need full anonymization including staff, you can modify the logic in [`src/anonymizer.ts`](src/anonymizer.ts).
</details>

## Tool Reference

| Category | Count | Tools |
|----------|-------|-------|
| Courses | 7 | `list-courses`, `post-announcement`, `list-announcements`\*, `get-announcement`\*, `update-announcement`\*, `get-syllabus`\*, `update-syllabus`\* |
| Appointment Groups | 6 | `list-appointment-groups`\*, `get-appointment-group`\*, `create-appointment-group`\*, `publish-appointment-group`\*, `delete-appointment-group`\*, `update-appointment-group-times`\* |
| Students | 1 | `list-students` |
| Assignments | 5 | `list-assignments`, `get-assignment`, `create-assignment`, `update-assignment`, `delete-assignment` |
| Assignment Groups | 3 | `list-assignment-groups`, `create-assignment-group`, `bulk-update-assignment-dates` |
| Submissions | 6 | `list-assignment-submissions`, `grade-submission`, `post-submission-comment`, `get-submission-documents`, `get-submission-file-info`, `download-submission-file` |
| Sections | 2 | `list-sections`, `list-section-submissions` |
| Rubrics | 4 | `list-rubrics`, `get-rubric-statistics`, `list-rubric-assessments`, `attach-rubric-to-assignment` |
| Modules | 10 | `list-modules`, `list-module-items`, `toggle-module-publish`, `create-module`, `update-module`, `delete-module`, `get-module-item`, `create-module-item`, `update-module-item`, `delete-module-item` |
| Files | 3 | `list-folders`, `list-files`, `list-folder-contents` |
| Pages | 9 | `list-pages`, `get-page-content`, `update-page-content`, `list-page-revisions`, `revert-page-revision`, `patch-page-content`, `apply-page-changes`, `generate-styleguide`, `get-styleguide` |
| Quizzes | 15 | `list-quizzes`, `get-quiz`, `create-quiz`, `update-quiz`, `delete-quiz`, `list-quiz-questions`, `get-quiz-question`, `create-quiz-question`, `update-quiz-question`, `delete-quiz-question`, `list-quiz-question-groups`, `get-quiz-question-group`, `create-quiz-question-group`, `update-quiz-question-group`, `delete-quiz-question-group` |
| Quiz Results | 6 | `list-quiz-submissions`, `get-quiz-statistics`, `get-quiz-submission-answers`, `get-quiz-report`, `get-quiz-submission-events`, `update-quiz-submission-score` |
| ePortfolios | 3 | `list-eportfolios`, `get-eportfolio`, `get-eportfolio-pages` |

\* Added in this fork. Also changed in this fork: `create-assignment` / `update-assignment` accept `unlock_at` and `lock_at`, `update-page-content` accepts `published`, and `bulk-update-assignment-dates` now sends the request format Canvas expects and reports whether the background job completed.

**Full parameter reference:** [docs/TOOLS.md](docs/TOOLS.md)

## Available Prompts

### analyze-rubric-statistics

Analyzes rubric statistics for formative assignments in a course and creates visualizations.

- Required: `courseName` (string)
- Creates grouped stacked bar and grouped bar charts across assignments and criteria
- Includes progression analysis and trend identification

## Troubleshooting

### Server not appearing in Claude Desktop

- Verify JSON syntax in your config file
- Use absolute paths for source installs (`dist/index.js`, not `build/index.js`)
- Ensure your Canvas API token is valid
- Restart Claude Desktop

### Connection errors

- Confirm your token has access to the target courses
- Verify `CANVAS_BASE_URL` points to your institution's Canvas instance
- Check MCP logs:
  ```bash
  # macOS
  tail -f ~/Library/Logs/Claude/mcp*.log
  # Windows
  type %AppData%\Claude\Logs\mcp*.log
  ```

### NPX issues

- On Windows, ensure npm/npx are on your PATH
- For permission errors, try running Claude Desktop as administrator (Windows)
- Corporate networks may require npm proxy configuration

### Debug logging

The server logs errors to stderr. Redirect when running manually:

```bash
node dist/index.js 2> debug.log
```

## Performance & Caching

The server caches stable Canvas API responses to avoid redundant fetches and reduce token consumption.

**How it works:**

- First request stores the response body and any `ETag` or `Last-Modified` header
- Subsequent requests send conditional GETs (`If-None-Match` / `If-Modified-Since`); Canvas returns `304 Not Modified` when data is unchanged
- If Canvas omits validator headers, a 30-minute TTL is used as fallback
- Write operations (`POST`, `PUT`, `DELETE`) evict affected cache entries

**What is never cached:**

- Submission and grade data (`/submissions` endpoints) — always fetched live
- Paginated `fetchAllPages()` calls (students, submissions, ePortfolios) bypass the ETag cache and always hit the network — relevant for large courses

## Development

### Architecture

```
MCP Client → stdio → src/index.ts → src/tools/* → CanvasClient → Canvas REST API
```

Key modules:
- [`src/index.ts`](src/index.ts) — server bootstrap and tool registration
- [`src/canvasClient.ts`](src/canvasClient.ts) — HTTP client, ETag caching, pagination
- [`src/anonymizer.ts`](src/anonymizer.ts) — student data pseudonymization
- [`src/tools/`](src/tools/) — one file per domain, each exports `register*Tools()`

### Tool registration

This server uses the MCP TypeScript SDK (v1.29.0). Each tool is registered with `server.tool()` using a five-argument form:

1. Tool name (string)
2. Tool description (string)
3. Input schema (Zod schema)
4. Tool annotations (`{ readOnlyHint?, destructiveHint?, idempotentHint? }`)
5. Execute function

```typescript
server.tool(
  "list-courses",
  "List all active courses for the authenticated user. Returns course name, ID, course code, and term.",
  {},
  { readOnlyHint: true },
  async () => {
    return {
      content: [{ type: "text", text: "..." }]
    };
  }
);
```

### Local development

```bash
npm install
npm run build    # compile TypeScript to dist/
npm start        # run compiled server
npm run dev      # run from source with tsx (hot reload)
```

## Staying in Sync with Upstream

To pull in fixes and new tools from the original project:

```bash
git remote add upstream https://github.com/r-huijts/canvas-mcp   # once
git fetch upstream
git merge upstream/main     # resolve any conflicts, then:
npm run build
git push
```

Conflicts are most likely in `src/index.ts`, `src/canvasClient.ts`, `src/tools/courses.ts`, and `docs/TOOLS.md`, where this fork adds code next to upstream's.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Install dependencies: `npm install`
4. Build: `npm run build`
5. Submit a pull request

There is currently no automated test suite — manual verification via an MCP client is the primary testing approach.

## Security Notes

1. **API token security**
   - Never commit your Canvas API token to version control
   - Use environment variables or secure configuration
   - Rotate tokens periodically

2. **Permissions**
   - Use tokens with the minimum access needed for your use case
   - Review Canvas API access logs periodically

3. **Tools that change or delete data**
   - Many tools write to Canvas, and some are hard to reverse. Notably: `delete-appointment-group` (students lose their reservations), `publish-appointment-group` (cannot be unpublished via the API), `update-syllabus` (replaces the whole syllabus), `update-announcement`, `delete-assignment`, `delete-module`, `delete-quiz`, and `bulk-update-assignment-dates`
   - Your token acts with your Canvas permissions, so the assistant can change anything you can. Consider a token from an account limited to the courses you want edited, and ask the assistant to show you what it will change before confirming
   - Keep a copy of important content (for example, run `get-syllabus` before `update-syllabus`)

## Related Documentation

- [docs/TOOLS.md](docs/TOOLS.md) — full tool parameter reference
- [DESKTOP_EXTENSION.md](DESKTOP_EXTENSION.md) — building and packaging the Claude Desktop Extension
- [.env.example](.env.example) — environment variable template

## License

MIT — see [LICENSE](LICENSE).
