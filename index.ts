import { randomBytes } from "crypto";

// Types
interface User {
  id: string;
  githubId: number;
  username: string;
  avatarUrl: string;
}

interface Problem {
  id: string;
  title: string;
  description: string;
  inputFile?: string;
  inputFileName?: string;
  correctAnswer: string;
  authorId: string;
  createdAt: number;
}

interface Submission {
  id: string;
  problemId: string;
  userId: string;
  answer: string;
  isCorrect: boolean;
  submittedAt: number;
}

interface Session {
  userId: string;
  expiresAt: number;
}

interface GitHubTokenResponse {
  access_token: string;
}

interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
}

// In-memory storage
const appState = {
  users: new Map<string, User>(),
  problems: new Map<string, Problem>(),
  submissions: new Map<string, Submission>(),
  sessions: new Map<string, Session>(),
};

// Config
if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
  console.error("ERROR: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set");
  console.error(
    "Create a GitHub OAuth App at https://github.com/settings/developers",
  );
  process.exit(1);
}

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || ".";
const DATA_FILE = `${DATA_DIR}/data.json`;
const ADMIN_USERS = new Set(
  (process.env.ADMIN_USERS || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean),
);

// Persistence
async function saveState() {
  // Convert Maps to arrays for JSON serialization
  const data = {
    users: Array.from(appState.users.entries()),
    problems: Array.from(appState.problems.entries()),
    submissions: Array.from(appState.submissions.entries()),
    sessions: Array.from(appState.sessions.entries()),
  };

  // Write to temporary file first, then atomically rename
  const tempFile = `${DATA_FILE}.tmp`;
  await Bun.write(tempFile, JSON.stringify(data, null, 2));

  // Atomic rename (if power loss happens before this, old file is intact)
  await Bun.$`mv ${tempFile} ${DATA_FILE}`;
}

async function loadState() {
  try {
    const file = Bun.file(DATA_FILE);
    if (await file.exists()) {
      const data = JSON.parse(await file.text());

      // Revive Maps from JSON
      appState.users = new Map(data.users || []);
      appState.problems = new Map(data.problems || []);
      appState.submissions = new Map(data.submissions || []);
      appState.sessions = new Map(data.sessions || []);

      console.log(`Loaded state from ${DATA_FILE}`);
    }
  } catch (e) {
    console.log("No existing state found, starting fresh");
  }
}

// Save state every 30 seconds
setInterval(saveState, 30000);

// Helper functions
function generateId() {
  return randomBytes(16).toString("hex");
}

function getCookie(req: Request, name: string): string | null {
  const cookies = req.headers.get("cookie");
  if (!cookies) return null;
  const match = cookies.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] ?? null;
}

function getSessionUser(req: Request): User | null {
  const sessionId = getCookie(req, "session");
  if (!sessionId) return null;
  const session = appState.sessions.get(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    if (session) appState.sessions.delete(sessionId);
    return null;
  }
  return appState.users.get(session.userId) || null;
}

function getProblemStats(problemId: string) {
  const attempts = new Set<string>();
  const solves = new Set<string>();

  for (const sub of appState.submissions.values()) {
    if (sub.problemId === problemId) {
      attempts.add(sub.userId);
      if (sub.isCorrect) solves.add(sub.userId);
    }
  }

  return { attempts: attempts.size, solves: solves.size };
}

function hasSolved(userId: string, problemId: string): boolean {
  for (const sub of appState.submissions.values()) {
    if (sub.problemId === problemId && sub.userId === userId && sub.isCorrect) {
      return true;
    }
  }
  return false;
}

function isAdmin(user: User | null): boolean {
  return user ? ADMIN_USERS.has(user.username) : false;
}

function html(content: string, user: User | null = null) {
  const nav = user
    ? `<nav>
        <span>@${user.username}</span>
        <span class="nav-sep">|</span>
        <a href="/">home</a>
        <span class="nav-sep">|</span>
        <a href="/new-problem">new</a>
        ${isAdmin(user) ? '<span class="nav-sep">|</span><a href="/admin">admin</a>' : ""}
        <span class="nav-sep">|</span>
        <form action="/logout" method="post" style="display: inline;">
          <button type="submit" class="link-button">logout</button>
        </form>
      </nav>`
    : `<nav>
        <a href="/">home</a>
        <span class="nav-sep">|</span>
        <a href="/auth/github">login</a>
      </nav>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>coding problems</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💻</text></svg>">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-size: 14px;
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #0d1117;
      color: #c9d1d9;
    }

    a {
      color: #58a6ff;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    nav {
      border-bottom: 1px solid #30363d;
      padding-bottom: 15px;
      margin-bottom: 25px;
      font-size: 13px;
    }

    .nav-sep {
      color: #30363d;
      margin: 0 8px;
    }

    h1 {
      font-size: 24px;
      margin-bottom: 20px;
      color: #58a6ff;
      font-weight: normal;
    }

    h2 {
      font-size: 18px;
      margin: 25px 0 15px;
      color: #8b949e;
      font-weight: normal;
    }

    h3 {
      font-size: 16px;
      margin-bottom: 8px;
      font-weight: normal;
    }

    p {
      margin-bottom: 12px;
    }

    form {
      margin: 20px 0;
    }

    label {
      display: block;
      margin: 15px 0 5px;
      color: #8b949e;
    }

    input[type="text"],
    input[type="file"],
    textarea {
      width: 100%;
      padding: 8px 12px;
      background: #0d1117;
      border: 1px solid #30363d;
      color: #c9d1d9;
      font-family: inherit;
      font-size: 13px;
      margin-bottom: 5px;
    }

    input[type="text"]:focus,
    textarea:focus {
      outline: none;
      border-color: #58a6ff;
    }

    textarea {
      min-height: 200px;
      resize: vertical;
    }

    button {
      padding: 8px 16px;
      background: #21262d;
      color: #c9d1d9;
      border: 1px solid #30363d;
      cursor: pointer;
      font-family: inherit;
      font-size: 13px;
      margin-top: 5px;
    }

    button:hover {
      background: #30363d;
      border-color: #8b949e;
    }

    button:active {
      background: #0d1117;
    }

    .link-button {
      background: none;
      border: none;
      color: #58a6ff;
      padding: 0;
      margin: 0;
      cursor: pointer;
    }

    .link-button:hover {
      text-decoration: underline;
      background: none;
      border: none;
    }

    .problem {
      border: 1px solid #30363d;
      padding: 15px;
      margin: 12px 0;
      background: #161b22;
    }

    .problem h3 {
      margin-top: 0;
    }

    .problem-meta {
      font-size: 12px;
      color: #8b949e;
      margin-top: 8px;
    }

    .submission {
      border-left: 2px solid #30363d;
      padding: 10px 12px;
      margin: 8px 0;
      background: #161b22;
      font-size: 13px;
    }

    .submission.correct {
      border-left-color: #238636;
    }

    .submission.incorrect {
      border-left-color: #da3633;
    }

    .submission-actions {
      margin-top: 8px;
    }

    pre {
      background: #161b22;
      border: 1px solid #30363d;
      padding: 15px;
      overflow-x: auto;
      margin: 12px 0;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    code {
      background: #161b22;
      padding: 2px 6px;
      border: 1px solid #30363d;
      font-size: 12px;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 11px;
      border: 1px solid #30363d;
      margin-left: 8px;
    }

    .badge.solved {
      border-color: #238636;
      color: #238636;
    }

    .stats {
      font-size: 12px;
      color: #8b949e;
      margin: 8px 0;
    }

    .alert {
      background: #161b22;
      border: 1px solid #f85149;
      padding: 12px;
      margin: 15px 0;
      color: #f85149;
    }

    .success {
      background: #161b22;
      border: 1px solid #238636;
      padding: 12px;
      margin: 15px 0;
      color: #238636;
    }

    .small-button {
      padding: 4px 8px;
      font-size: 11px;
      margin-left: 8px;
    }
  </style>
</head>
<body>
  ${nav}
  ${content}
</body>
</html>`;
}

// Load state on startup
await loadState();

// Start server
Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const user = getSessionUser(req);

    // Home page
    if (url.pathname === "/" && req.method === "GET") {
      const problems = Array.from(appState.problems.values()).sort(
        (a, b) => b.createdAt - a.createdAt,
      );

      let content = "<h1>$ coding problems</h1>";

      if (!user) {
        content +=
          '<p>> <a href="/auth/github">login with github</a> to create and submit problems</p>';
      }

      if (problems.length === 0) {
        content += "<p>> no problems yet</p>";
      } else {
        for (const problem of problems) {
          const author = appState.users.get(problem.authorId);
          const solved = user ? hasSolved(user.id, problem.id) : false;
          const stats = getProblemStats(problem.id);

          content += `
            <div class="problem">
              <h3>
                <a href="/problem/${problem.id}">${problem.title}</a>
                ${solved ? '<span class="badge solved">✓</span>' : ""}
              </h3>
              <div class="problem-meta">
                by @${author?.username || "unknown"} • ${new Date(problem.createdAt).toLocaleDateString()}
                ${problem.inputFile ? " • has input file" : ""}
              </div>
              <div class="stats">
                ${stats.attempts} ${stats.attempts === 1 ? "attempt" : "attempts"} • ${stats.solves} ${stats.solves === 1 ? "solve" : "solves"}
              </div>
            </div>
          `;
        }
      }

      return new Response(html(content, user), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // GitHub OAuth
    if (url.pathname === "/auth/github" && req.method === "GET") {
      const returnTo = url.searchParams.get("return") || "/";
      const redirectUri = `${BASE_URL}/auth/github/callback`;
      const state = encodeURIComponent(returnTo);
      const githubUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${redirectUri}&scope=read:user&state=${state}`;
      return Response.redirect(githubUrl);
    }

    // GitHub OAuth callback
    if (url.pathname === "/auth/github/callback" && req.method === "GET") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const returnTo = state ? decodeURIComponent(state) : "/";

      if (!code) {
        return new Response("Missing code", { status: 400 });
      }

      // Exchange code for access token
      const tokenResponse = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code,
          }),
        },
      );

      const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        return new Response("Failed to get access token", { status: 500 });
      }

      // Get user info
      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      const githubUser = (await userResponse.json()) as GitHubUser;

      // Create or update user
      let user = Array.from(appState.users.values()).find(
        (u) => u.githubId === githubUser.id,
      );

      if (!user) {
        user = {
          id: generateId(),
          githubId: githubUser.id,
          username: githubUser.login,
          avatarUrl: githubUser.avatar_url,
        };
        appState.users.set(user.id, user);
        await saveState();
      }

      // Create session
      const sessionId = generateId();
      appState.sessions.set(sessionId, {
        userId: user.id,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      return new Response(null, {
        status: 302,
        headers: {
          Location: returnTo,
          "Set-Cookie": `session=${sessionId}; Path=/; HttpOnly; Max-Age=${30 * 24 * 60 * 60}`,
        },
      });
    }

    // Logout
    if (url.pathname === "/logout" && req.method === "POST") {
      const sessionId = getCookie(req, "session");
      if (sessionId) {
        appState.sessions.delete(sessionId);
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": "session=; Path=/; HttpOnly; Max-Age=0",
        },
      });
    }

    // Admin page
    if (url.pathname === "/admin" && req.method === "GET") {
      if (!user || !isAdmin(user)) {
        return new Response("Unauthorized", { status: 403 });
      }

      let content = "<h1>$ admin</h1>";

      // Users
      content += "<h2>users</h2>";
      content += `<p>${appState.users.size} total</p>`;
      content +=
        "<div style='max-height: 300px; overflow-y: auto; background: #161b22; padding: 10px; margin: 10px 0;'>";
      for (const [id, u] of appState.users) {
        content += `<div style='margin: 5px 0;'>
          <code>${u.username}</code> (id: ${id.slice(0, 8)}...)
          <form action="/admin/delete-user/${id}" method="post" style="display: inline; margin-left: 10px;">
            <button type="submit" class="small-button" onclick="return confirm('Delete user and all their data?')">delete</button>
          </form>
        </div>`;
      }
      content += "</div>";

      // Problems
      content += "<h2>problems</h2>";
      content += `<p>${appState.problems.size} total</p>`;
      content +=
        "<div style='max-height: 300px; overflow-y: auto; background: #161b22; padding: 10px; margin: 10px 0;'>";
      for (const [id, p] of appState.problems) {
        const author = appState.users.get(p.authorId);
        const stats = getProblemStats(p.id);
        content += `<div style='margin: 5px 0;'>
          <strong>${p.title}</strong> by @${author?.username || "unknown"} • ${stats.attempts} attempts, ${stats.solves} solves
          <form action="/admin/delete-problem/${id}" method="post" style="display: inline; margin-left: 10px;">
            <button type="submit" class="small-button" onclick="return confirm('Delete problem and all submissions?')">delete</button>
          </form>
        </div>`;
      }
      content += "</div>";

      // Submissions
      content += "<h2>submissions</h2>";
      content += `<p>${appState.submissions.size} total</p>`;
      const recentSubs = Array.from(appState.submissions.values())
        .sort((a, b) => b.submittedAt - a.submittedAt)
        .slice(0, 20);
      content +=
        "<div style='max-height: 300px; overflow-y: auto; background: #161b22; padding: 10px; margin: 10px 0;'>";
      for (const sub of recentSubs) {
        const u = appState.users.get(sub.userId);
        const p = appState.problems.get(sub.problemId);
        content += `<div style='margin: 5px 0;'>
          @${u?.username || "unknown"} → "${p?.title || "unknown"}" • <code>${sub.answer}</code> ${sub.isCorrect ? "✓" : "✗"}
          <form action="/admin/delete-submission/${sub.id}" method="post" style="display: inline; margin-left: 10px;">
            <button type="submit" class="small-button">delete</button>
          </form>
        </div>`;
      }
      content += "</div>";

      // Sessions
      content += "<h2>sessions</h2>";
      content += `<p>${appState.sessions.size} total</p>`;

      return new Response(html(content, user), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // New problem page
    if (url.pathname === "/new-problem" && req.method === "GET") {
      if (!user) {
        return Response.redirect(
          "/auth/github?return=" + encodeURIComponent(url.pathname),
        );
      }

      const content = `
        <h1>$ new problem</h1>
        <form action="/new-problem" method="post" enctype="multipart/form-data">
          <label>title:</label>
          <input type="text" name="title" required autofocus>

          <label>description:</label>
          <textarea name="description" required placeholder="explain the problem..."></textarea>

          <label>correct answer:</label>
          <input type="text" name="correctAnswer" required placeholder="the exact answer string">

          <label>input file (optional):</label>
          <input type="file" name="inputFile">

          <button type="submit">create problem</button>
        </form>
      `;

      return new Response(html(content, user), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Create problem
    if (url.pathname === "/new-problem" && req.method === "POST") {
      if (!user) {
        return Response.redirect(
          "/auth/github?return=" + encodeURIComponent("/new-problem"),
        );
      }

      const formData = await req.formData();
      const title = formData.get("title") as string;
      const description = formData.get("description") as string;
      const correctAnswer = formData.get("correctAnswer") as string;
      const inputFile = formData.get("inputFile") as File;

      let inputFileContent: string | undefined;
      let inputFileName: string | undefined;
      if (inputFile && inputFile.size > 0) {
        inputFileContent = await inputFile.text();
        inputFileName = inputFile.name;
      }

      const problem: Problem = {
        id: generateId(),
        title,
        description,
        correctAnswer,
        inputFile: inputFileContent,
        inputFileName,
        authorId: user.id,
        createdAt: Date.now(),
      };

      appState.problems.set(problem.id, problem);
      await saveState();

      return new Response(null, {
        status: 302,
        headers: { Location: `/problem/${problem.id}` },
      });
    }

    // Download input file (must come before general problem route)
    if (
      url.pathname.match(/^\/problem\/[^\/]+\/download$/) &&
      req.method === "GET"
    ) {
      const problemId = url.pathname.split("/")[2]!;
      const problem = appState.problems.get(problemId);

      if (!problem || !problem.inputFile) {
        return new Response("Input file not found", { status: 404 });
      }

      const filename =
        problem.inputFileName ||
        `${problem.title.replace(/[^a-z0-9]/gi, "_")}_input.txt`;

      return new Response(problem.inputFile, {
        headers: {
          "Content-Type": "text/plain",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // View problem
    if (url.pathname.startsWith("/problem/") && req.method === "GET") {
      const problemId = url.pathname.split("/")[2]!;
      const problem = appState.problems.get(problemId);

      if (!problem) {
        return new Response("Problem not found", { status: 404 });
      }

      const author = appState.users.get(problem.authorId);
      const stats = getProblemStats(problem.id);
      const submissions = user
        ? Array.from(appState.submissions.values())
            .filter((s) => s.problemId === problem.id && s.userId === user.id)
            .sort((a, b) => b.submittedAt - a.submittedAt)
        : [];
      const solved = user ? hasSolved(user.id, problem.id) : false;

      let content = `
        <h1>${problem.title}</h1>
        <div class="problem-meta">
          by @${author?.username || "unknown"} • ${new Date(problem.createdAt).toLocaleDateString()}
          ${
            user && problem.authorId === user.id
              ? `
            <form action="/problem/${problem.id}/delete" method="post" style="display: inline; margin-left: 15px;">
              <button type="submit" class="small-button" onclick="return confirm('Delete this problem? This will also delete all submissions.')">delete problem</button>
            </form>
          `
              : ""
          }
        </div>
        <div class="stats">
          ${stats.attempts} ${stats.attempts === 1 ? "attempt" : "attempts"} • ${stats.solves} ${stats.solves === 1 ? "solve" : "solves"}
        </div>

        <h2>description</h2>
        <pre>${problem.description}</pre>
      `;

      if (problem.inputFile) {
        content += `
          <h2>input file</h2>
          <p>> <a href="/problem/${problem.id}/download">${problem.inputFileName || "download"}</a></p>
        `;
      }

      if (user) {
        if (solved) {
          content += `
            <div class="success">
              ✓ you've solved this problem
            </div>
          `;
        } else {
          content += `
            <h2>submit answer</h2>
            <form action="/problem/${problem.id}/submit" method="post">
              <input type="text" name="answer" required autofocus placeholder="your answer...">
              <button type="submit">submit</button>
            </form>
          `;
        }

        if (submissions.length > 0) {
          content += "<h2>your submissions</h2>";
          for (const sub of submissions) {
            content += `
              <div class="submission ${sub.isCorrect ? "correct" : "incorrect"}">
                ${sub.isCorrect ? "✓ correct" : "✗ incorrect"} • <code>${sub.answer}</code> • ${new Date(sub.submittedAt).toLocaleString()}
              </div>
            `;
          }
        }
      } else {
        content += `<p>> <a href="/auth/github?return=${encodeURIComponent(url.pathname)}">login</a> to submit answers</p>`;
      }

      return new Response(html(content, user), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Submit answer
    if (
      url.pathname.match(/^\/problem\/[^\/]+\/submit$/) &&
      req.method === "POST"
    ) {
      const problemId = url.pathname.split("/")[2]!;

      if (!user) {
        return Response.redirect(
          "/auth/github?return=" + encodeURIComponent(`/problem/${problemId}`),
        );
      }
      const problem = appState.problems.get(problemId);

      if (!problem) {
        return new Response("Problem not found", { status: 404 });
      }

      // Check if already solved
      if (hasSolved(user.id, problem.id)) {
        return new Response(null, {
          status: 302,
          headers: { Location: `/problem/${problem.id}` },
        });
      }

      const formData = await req.formData();
      const answer = formData.get("answer") as string;

      const submission: Submission = {
        id: generateId(),
        problemId: problem.id,
        userId: user.id,
        answer,
        isCorrect: answer.trim() === problem.correctAnswer.trim(),
        submittedAt: Date.now(),
      };

      appState.submissions.set(submission.id, submission);
      await saveState();

      return new Response(null, {
        status: 302,
        headers: { Location: `/problem/${problem.id}` },
      });
    }

    // Delete problem
    if (
      url.pathname.match(/^\/problem\/[^\/]+\/delete$/) &&
      req.method === "POST"
    ) {
      if (!user) {
        return Response.redirect(
          "/auth/github?return=" + encodeURIComponent("/"),
        );
      }

      const problemId = url.pathname.split("/")[2]!;
      const problem = appState.problems.get(problemId);

      if (!problem) {
        return new Response("Problem not found", { status: 404 });
      }

      // Only allow deleting your own problems
      if (problem.authorId !== user.id) {
        return new Response("Unauthorized", { status: 403 });
      }

      // Delete the problem and all its submissions
      appState.problems.delete(problemId || "");

      // Delete all submissions for this problem
      for (const [subId, sub] of appState.submissions.entries()) {
        if (sub.problemId === problemId) {
          appState.submissions.delete(subId);
        }
      }

      await saveState();

      return new Response(null, {
        status: 302,
        headers: { Location: "/" },
      });
    }

    // Admin: Delete user
    if (
      url.pathname.match(/^\/admin\/delete-user\/[^\/]+$/) &&
      req.method === "POST"
    ) {
      if (!user || !isAdmin(user)) {
        return new Response("Unauthorized", { status: 403 });
      }

      const userId = url.pathname.split("/")[3]!;

      // Delete user's problems
      for (const [problemId, problem] of appState.problems) {
        if (problem.authorId === userId) {
          appState.problems.delete(problemId);
          // Delete submissions for those problems
          for (const [subId, sub] of appState.submissions) {
            if (sub.problemId === problemId) {
              appState.submissions.delete(subId);
            }
          }
        }
      }

      // Delete user's submissions
      for (const [subId, sub] of appState.submissions) {
        if (sub.userId === userId) {
          appState.submissions.delete(subId);
        }
      }

      // Delete user's sessions
      for (const [sessionId, session] of appState.sessions) {
        if (session.userId === userId) {
          appState.sessions.delete(sessionId);
        }
      }

      // Delete user
      appState.users.delete(userId);
      await saveState();

      return new Response(null, {
        status: 302,
        headers: { Location: "/admin" },
      });
    }

    // Admin: Delete problem
    if (
      url.pathname.match(/^\/admin\/delete-problem\/[^\/]+$/) &&
      req.method === "POST"
    ) {
      if (!user || !isAdmin(user)) {
        return new Response("Unauthorized", { status: 403 });
      }

      const problemId = url.pathname.split("/")[3]!;

      appState.problems.delete(problemId);

      // Delete all submissions for this problem
      for (const [subId, sub] of appState.submissions) {
        if (sub.problemId === problemId) {
          appState.submissions.delete(subId);
        }
      }

      await saveState();

      return new Response(null, {
        status: 302,
        headers: { Location: "/admin" },
      });
    }

    // Admin: Delete submission
    if (
      url.pathname.match(/^\/admin\/delete-submission\/[^\/]+$/) &&
      req.method === "POST"
    ) {
      if (!user || !isAdmin(user)) {
        return new Response("Unauthorized", { status: 403 });
      }

      const submissionId = url.pathname.split("/")[3]!;
      appState.submissions.delete(submissionId);
      await saveState();

      return new Response(null, {
        status: 302,
        headers: { Location: "/admin" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`
🚀 Server running on ${BASE_URL}
📁 Data: ${DATA_FILE}
🔄 Auto-save: every 30 seconds
`);
