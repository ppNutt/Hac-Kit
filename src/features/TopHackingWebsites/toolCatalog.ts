export type ToolCategory =
  | "reconnaissance"
  | "web-security"
  | "osint"
  | "malware-analysis"
  | "password-security"
  | "digital-forensics"
  | "training-labs";

export type ToolDifficulty = "Beginner" | "Intermediate" | "Advanced";
export type ToolPricing = "Free" | "Paid" | "Freemium";
export type ToolLocation = "Web" | "Local";

export interface CyberToolResource {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  difficulty: ToolDifficulty;
  pricing: ToolPricing;
  location: ToolLocation;
  href: string;
}

export const categoryLabels: Record<ToolCategory, string> = {
  reconnaissance: "Reconnaissance",
  "web-security": "Web Security",
  osint: "OSINT",
  "malware-analysis": "Malware Analysis",
  "password-security": "Password Security",
  "digital-forensics": "Digital Forensics",
  "training-labs": "Training/Labs",
};

export const resources: CyberToolResource[] = [
  {
    id: "shodan",
    name: "Shodan",
    description: "Search internet-facing systems and exposed service banners.",
    category: "reconnaissance",
    difficulty: "Beginner",
    pricing: "Freemium",
    location: "Web",
    href: "https://www.shodan.io",
  },
  {
    id: "amass",
    name: "OWASP Amass",
    description: "Map attack surfaces through DNS and infrastructure discovery.",
    category: "reconnaissance",
    difficulty: "Intermediate",
    pricing: "Free",
    location: "Local",
    href: "https://github.com/owasp-amass/amass",
  },
  {
    id: "burp-suite",
    name: "Burp Suite",
    description: "Intercept, test, and assess web application security behavior.",
    category: "web-security",
    difficulty: "Intermediate",
    pricing: "Freemium",
    location: "Local",
    href: "https://portswigger.net/burp",
  },
  {
    id: "zap",
    name: "OWASP ZAP",
    description: "Free open-source web scanner for beginners and teams.",
    category: "web-security",
    difficulty: "Beginner",
    pricing: "Free",
    location: "Local",
    href: "https://www.zaproxy.org",
  },
  {
    id: "crt-sh",
    name: "crt.sh",
    description: "Explore certificate transparency logs for domain intelligence.",
    category: "osint",
    difficulty: "Beginner",
    pricing: "Free",
    location: "Web",
    href: "https://crt.sh",
  },
  {
    id: "maltego",
    name: "Maltego",
    description: "Visual link analysis for infrastructure and identity investigations.",
    category: "osint",
    difficulty: "Intermediate",
    pricing: "Freemium",
    location: "Local",
    href: "https://www.maltego.com",
  },
  {
    id: "any-run",
    name: "ANY.RUN",
    description: "Interactive malware sandbox with behavior timelines.",
    category: "malware-analysis",
    difficulty: "Intermediate",
    pricing: "Freemium",
    location: "Web",
    href: "https://app.any.run",
  },
  {
    id: "ghidra",
    name: "Ghidra",
    description: "Reverse engineering suite for static binary analysis.",
    category: "malware-analysis",
    difficulty: "Advanced",
    pricing: "Free",
    location: "Local",
    href: "https://ghidra-sre.org",
  },
  {
    id: "hashcat",
    name: "Hashcat",
    description: "High-performance password recovery utility for authorized testing.",
    category: "password-security",
    difficulty: "Advanced",
    pricing: "Free",
    location: "Local",
    href: "https://hashcat.net/hashcat",
  },
  {
    id: "have-i-been-pwned",
    name: "Have I Been Pwned",
    description: "Check if accounts appeared in known public breach datasets.",
    category: "password-security",
    difficulty: "Beginner",
    pricing: "Free",
    location: "Web",
    href: "https://haveibeenpwned.com",
  },
  {
    id: "autopsy",
    name: "Autopsy",
    description: "Digital forensics platform for disk and artifact analysis.",
    category: "digital-forensics",
    difficulty: "Intermediate",
    pricing: "Free",
    location: "Local",
    href: "https://www.autopsy.com",
  },
  {
    id: "volatility",
    name: "Volatility",
    description: "Memory forensics framework for incident response workflows.",
    category: "digital-forensics",
    difficulty: "Advanced",
    pricing: "Free",
    location: "Local",
    href: "https://volatilityfoundation.org",
  },
  {
    id: "tryhackme",
    name: "TryHackMe",
    description: "Guided learning paths and practical defensive/offensive labs.",
    category: "training-labs",
    difficulty: "Beginner",
    pricing: "Freemium",
    location: "Web",
    href: "https://tryhackme.com",
  },
  {
    id: "hack-the-box",
    name: "Hack The Box",
    description: "Hands-on labs and challenges for skill progression.",
    category: "training-labs",
    difficulty: "Intermediate",
    pricing: "Freemium",
    location: "Web",
    href: "https://www.hackthebox.com",
  },
];
