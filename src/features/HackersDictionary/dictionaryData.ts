export type DictionaryCategory =
  | "google-dorks"
  | "sql-injection"
  | "xss"
  | "terminology";

export interface DictionaryEntry {
  id: string;
  term: string;
  aliases: string[];
  category: DictionaryCategory;
  summary: string;
  explanation: string;
  example: string;
  riskOrUsage: string;
  safetyNotes: string;
}

export const dictionaryCategories: { label: string; value: DictionaryCategory | "all" }[] = [
  { label: "All categories", value: "all" },
  { label: "Google operators", value: "google-dorks" },
  { label: "SQL injection", value: "sql-injection" },
  { label: "Cross-site scripting", value: "xss" },
  { label: "Terminology", value: "terminology" },
];

export const dictionaryEntries: DictionaryEntry[] = [
  {
    id: "site-operator",
    term: "site:",
    aliases: ["Google operator", "Search filter"],
    category: "google-dorks",
    summary: "Limits Google results to one domain.",
    explanation:
      "The site: operator tells Google to only show results from a specific website. It is useful for security audits and content discovery.",
    example: "site:example.com login",
    riskOrUsage:
      "Can reveal exposed pages like old admin panels or backups that should not be indexed.",
    safetyNotes: "Use this only on systems you own or have permission to test.",
  },
  {
    id: "filetype-operator",
    term: "filetype:",
    aliases: ["ext:"],
    category: "google-dorks",
    summary: "Finds indexed files by extension.",
    explanation:
      "filetype: helps locate publicly indexed documents such as PDF, CSV, or config-like text files.",
    example: "site:example.com filetype:pdf security policy",
    riskOrUsage:
      "Can expose sensitive files if teams accidentally publish internal documents.",
    safetyNotes: "Report accidental exposure responsibly and avoid downloading private data.",
  },
  {
    id: "intitle-operator",
    term: "intitle:",
    aliases: ["allintitle:"],
    category: "google-dorks",
    summary: "Matches pages containing words in the title tag.",
    explanation:
      "intitle: filters results where the page title includes your keyword, useful when searching default admin pages.",
    example: "intitle:\"admin panel\" site:example.com",
    riskOrUsage: "Can identify exposed management interfaces and misconfigured dashboards.",
    safetyNotes: "Do not attempt login attacks. Use findings only for defensive remediation.",
  },
  {
    id: "union-injection",
    term: "UNION-based SQL injection",
    aliases: ["UNION SELECT"],
    category: "sql-injection",
    summary: "Injects SQL that combines query results.",
    explanation:
      "If an application inserts user input into SQL unsafely, attackers can append UNION SELECT to retrieve extra database data.",
    example:
      "Unsafe query: SELECT * FROM users WHERE id='" + "' + input + '" + "'; injected input: 1' UNION SELECT username,password FROM users --",
    riskOrUsage: "May expose credentials, PII, or financial records.",
    safetyNotes:
      "Prevent with parameterized queries, strict input validation, and least-privilege database accounts.",
  },
  {
    id: "boolean-blind-injection",
    term: "Boolean-based blind SQL injection",
    aliases: ["blind SQLi"],
    category: "sql-injection",
    summary: "Infers database behavior from true/false responses.",
    explanation:
      "When errors are hidden, attackers compare app responses to true/false payloads to learn database information bit by bit.",
    example: "' OR 1=1 -- (true) versus ' OR 1=2 -- (false)",
    riskOrUsage: "Can still leak sensitive data even with generic error pages.",
    safetyNotes: "Use prepared statements and monitor unusual query patterns in logs.",
  },
  {
    id: "time-based-blind",
    term: "Time-based blind SQL injection",
    aliases: ["sleep payload"],
    category: "sql-injection",
    summary: "Uses delayed server responses to confirm injection.",
    explanation:
      "Attackers inject SQL functions that delay execution. If response time changes, it suggests injected SQL was executed.",
    example: "' OR IF(1=1, SLEEP(5), 0) --",
    riskOrUsage: "Can extract data slowly while avoiding obvious error traces.",
    safetyNotes: "Set query timeouts, use ORM parameterization, and alert on repeated delay patterns.",
  },
  {
    id: "stored-xss",
    term: "Stored XSS",
    aliases: ["persistent XSS"],
    category: "xss",
    summary: "Malicious script is saved and delivered to later visitors.",
    explanation:
      "Stored XSS happens when user-generated content is saved without sanitization and rendered as active script in other sessions.",
    example: "Unescaped comment field stores <script>alert('xss')</script>",
    riskOrUsage: "Can hijack sessions, deface pages, or phish users.",
    safetyNotes: "Sanitize user content and encode output by context before rendering.",
  },
  {
    id: "reflected-xss",
    term: "Reflected XSS",
    aliases: ["non-persistent XSS"],
    category: "xss",
    summary: "Malicious input is reflected immediately in a response.",
    explanation:
      "Reflected XSS appears when request parameters are rendered directly in HTML without safe encoding.",
    example: "https://example.com/search?q=<script>...</script>",
    riskOrUsage: "Often used in phishing links to run script in a trusted domain context.",
    safetyNotes: "Apply output encoding and strict content security policies.",
  },
  {
    id: "dom-xss",
    term: "DOM-based XSS",
    aliases: ["client-side XSS"],
    category: "xss",
    summary: "JavaScript in the browser creates the vulnerability.",
    explanation:
      "DOM XSS occurs when front-end code writes untrusted values into the DOM using unsafe APIs such as innerHTML.",
    example: "element.innerHTML = location.hash.slice(1)",
    riskOrUsage: "Can execute script even if server-side rendering is safe.",
    safetyNotes: "Prefer safe DOM APIs like textContent and sanitize dynamic HTML.",
  },
  {
    id: "cve",
    term: "CVE",
    aliases: ["Common Vulnerabilities and Exposures"],
    category: "terminology",
    summary: "Standard identifier for publicly disclosed vulnerabilities.",
    explanation:
      "A CVE number is a shared reference so vendors and defenders can track the same vulnerability consistently.",
    example: "CVE-2026-12345",
    riskOrUsage: "Helps prioritize patching and communication.",
    safetyNotes: "Use official advisories before applying mitigations.",
  },
  {
    id: "zero-day",
    term: "Zero-day",
    aliases: ["0-day"],
    category: "terminology",
    summary: "A vulnerability exploited before a patch is available.",
    explanation:
      "Zero-day issues are high risk because defenders have little time and usually no official fix at first.",
    example: "An attacker weaponizes a browser flaw before vendor disclosure.",
    riskOrUsage: "Often targeted in espionage and high-impact campaigns.",
    safetyNotes: "Use defense-in-depth: segmentation, least privilege, and rapid detection.",
  },
  {
    id: "phishing",
    term: "Phishing",
    aliases: ["social engineering"],
    category: "terminology",
    summary: "Tricking people into revealing sensitive information.",
    explanation:
      "Phishing relies on trust and urgency to make people click malicious links or share credentials.",
    example: "Fake password reset email asking user to sign in quickly.",
    riskOrUsage: "Entry point for account takeover and ransomware infections.",
    safetyNotes: "Verify sender identity, inspect URLs, and use MFA.",
  },
];
