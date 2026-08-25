// Central registry of the 7 Hac-Kit features shown as sidebar tabs.
import type { ComponentType, SVGProps } from "react";
import {
  CursorClickIcon,
  BookIcon,
  RadarIcon,
  LockIcon,
  MailIcon,
  HashIcon,
  GlobeIcon,
} from "./components/icons";
import AutoClicker from "./features/AutoClicker/AutoClicker";
import HackersDictionary from "./features/HackersDictionary/HackersDictionary";
import Nmap from "./features/Nmap/Nmap";
import BruteForce from "./features/BruteForce/BruteForce";
import PhishingSimulator from "./features/PhishingSimulator/PhishingSimulator";
import HashCracker from "./features/HashCracker/HashCracker";
import TopHackingWebsites from "./features/TopHackingWebsites/TopHackingWebsites";

export type FeatureId =
  | "auto-clicker"
  | "hackers-dictionary"
  | "nmap"
  | "brute-force"
  | "phishing-simulator"
  | "hash-cracker"
  | "top-hacking-websites";

export interface Feature {
  id: FeatureId;
  label: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  component: ComponentType;
}

export const features: Feature[] = [
  {
    id: "auto-clicker",
    label: "Auto Clicker",
    description: "Automate repeated mouse clicks at a configurable speed.",
    icon: CursorClickIcon,
    component: AutoClicker,
  },
  {
    id: "hackers-dictionary",
    label: "Hacker's Dictionary",
    description: "Look up beginner-friendly cybersecurity terminology.",
    icon: BookIcon,
    component: HackersDictionary,
  },
  {
    id: "nmap",
    label: "Nmap Scanner",
    description: "Discover hosts, open ports and services on a network.",
    icon: RadarIcon,
    component: Nmap,
  },
  {
    id: "brute-force",
    label: "Brute Force",
    description: "Test login resilience using wordlist-based attempts.",
    icon: LockIcon,
    component: BruteForce,
  },
  {
    id: "phishing-simulator",
    label: "Phishing Simulator",
    description: "Run safe, simulated phishing awareness campaigns.",
    icon: MailIcon,
    component: PhishingSimulator,
  },
  {
    id: "hash-cracker",
    label: "Hash Cracker",
    description: "Identify and crack hashed passwords for recovery testing.",
    icon: HashIcon,
    component: HashCracker,
  },
  {
    id: "top-hacking-websites",
    label: "Top Hacking Websites",
    description: "Curated list of trusted cybersecurity learning resources.",
    icon: GlobeIcon,
    component: TopHackingWebsites,
  },
];
