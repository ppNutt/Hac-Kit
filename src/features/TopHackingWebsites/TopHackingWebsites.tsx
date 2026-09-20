import { useMemo, useState } from "react";
import FeatureLayout from "../../components/ui/FeatureLayout";
import StateBlock from "../../components/ui/StateBlock";
import {
  categoryLabels,
  resources,
  type CyberToolResource,
  type ToolCategory,
  type ToolDifficulty,
  type ToolLocation,
  type ToolPricing,
} from "./toolCatalog";
import "./TopHackingWebsites.css";

type CategoryFilter = ToolCategory | "all";
type DifficultyFilter = ToolDifficulty | "all";
type PricingFilter = ToolPricing | "all";
type LocationFilter = ToolLocation | "all";

function matchesSearch(resource: CyberToolResource, query: string): boolean {
  if (!query) {
    return true;
  }
  const haystack = [resource.name, resource.description, categoryLabels[resource.category]]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function openResource(resource: CyberToolResource) {
  window.open(resource.href, "_blank", "noopener,noreferrer");
}

export default function TopHackingWebsites() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [pricing, setPricing] = useState<PricingFilter>("all");
  const [location, setLocation] = useState<LocationFilter>("all");

  const normalizedQuery = query.trim().toLowerCase();

  const filteredResources = useMemo(() => {
    return resources.filter((resource) => {
      if (category !== "all" && resource.category !== category) {
        return false;
      }
      if (difficulty !== "all" && resource.difficulty !== difficulty) {
        return false;
      }
      if (pricing !== "all" && resource.pricing !== pricing) {
        return false;
      }
      if (location !== "all" && resource.location !== location) {
        return false;
      }
      return matchesSearch(resource, normalizedQuery);
    });
  }, [category, difficulty, location, normalizedQuery, pricing]);

  return (
    <FeatureLayout
      title="Cybersecurity Tool Explorer"
      description="Explore beginner-friendly tools and learning resources by category, difficulty, and access model."
      actions={
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setQuery("");
            setCategory("all");
            setDifficulty("all");
            setPricing("all");
            setLocation("all");
          }}
        >
          Reset filters
        </button>
      }
    >
      <div className="tool-explorer-layout">
        <section className="panel tool-toolbar" aria-label="Tool explorer filters">
          <div className="tool-search-row">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tools, categories, or purpose"
              aria-label="Search tools"
            />

            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as CategoryFilter)}
              aria-label="Filter by category"
            >
              <option value="all">All categories</option>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as DifficultyFilter)}
              aria-label="Filter by difficulty"
            >
              <option value="all">All difficulty</option>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>

            <select
              value={pricing}
              onChange={(event) => setPricing(event.target.value as PricingFilter)}
              aria-label="Filter by pricing"
            >
              <option value="all">All pricing</option>
              <option value="Free">Free</option>
              <option value="Freemium">Freemium</option>
              <option value="Paid">Paid</option>
            </select>

            <select
              value={location}
              onChange={(event) => setLocation(event.target.value as LocationFilter)}
              aria-label="Filter by location"
            >
              <option value="all">Local + Web</option>
              <option value="Web">Web</option>
              <option value="Local">Local</option>
            </select>
          </div>

          <p className="tool-results-meta">
            Showing {filteredResources.length} resource{filteredResources.length === 1 ? "" : "s"}
          </p>
        </section>

        {filteredResources.length === 0 ? (
          <section className="panel">
            <StateBlock
              title="No tools matched your filters"
              description="Broaden your search or reset filters to discover more resources."
              action={
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setQuery("");
                    setCategory("all");
                    setDifficulty("all");
                    setPricing("all");
                    setLocation("all");
                  }}
                >
                  Clear filters
                </button>
              }
            />
          </section>
        ) : (
          <section className="tool-grid" aria-label="Tool resource cards">
            {filteredResources.map((resource) => (
              <article key={resource.id} className="tool-card">
                <header className="tool-card-head">
                  <span className="tool-card-icon" aria-hidden="true">
                    {resource.icon}
                  </span>
                  <div>
                    <h2 className="tool-card-title">{resource.name}</h2>
                    <p className="tool-card-category">{categoryLabels[resource.category]}</p>
                  </div>
                </header>

                <p className="tool-card-description">{resource.description}</p>

                <div className="tool-card-badges">
                  <span className="tool-badge">{resource.difficulty}</span>
                  <span
                    className={`tool-badge${resource.pricing === "Free" ? " tool-badge-free" : ""}${
                      resource.pricing === "Paid" ? " tool-badge-paid" : ""
                    }`}
                  >
                    {resource.pricing}
                  </span>
                  <span className="tool-badge">{resource.location}</span>
                </div>

                <div className="tool-card-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => openResource(resource)}
                  >
                    {resource.location === "Local" ? "Open Tool" : "Learn More"}
                  </button>
                  <p className="tool-action-note">
                    Opens external resource in a new tab.
                  </p>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </FeatureLayout>
  );
}
