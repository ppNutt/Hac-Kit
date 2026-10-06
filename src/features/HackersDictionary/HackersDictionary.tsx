import { useState } from "react";
import FeatureLayout from "../../components/ui/FeatureLayout";
import SearchInput from "../../components/ui/SearchInput";
import FilterChips from "../../components/ui/FilterChips";
import StateBlock from "../../components/ui/StateBlock";
import { dictionaryCategories } from "./dictionaryData";
import { useDictionary } from "./useDictionary";
import "./HackersDictionary.css";

function getCategoryLabel(value: string): string {
  return dictionaryCategories.find((category) => category.value === value)?.label ?? "Unknown";
}

export default function HackersDictionary() {
  const [copyFeedback, setCopyFeedback] = useState<{ entryId: string; message: string } | null>(null);
  const {
    query,
    setQuery,
    filter,
    setFilter,
    filteredEntries,
    selectedEntry,
    selectedId,
    setSelectedId,
  } = useDictionary();

  const handleCopyExample = async (entryId: string, example: string) => {
    try {
      await navigator.clipboard.writeText(example);
      setCopyFeedback({ entryId, message: "Example copied to clipboard." });
    } catch {
      setCopyFeedback({ entryId, message: "Could not copy example. Check clipboard permissions." });
    }
  };

  return (
    <FeatureLayout
      title="Hacker's Dictionary"
      description="Search beginner-friendly cybersecurity definitions, examples, and safety guidance."
      actions={
        <button type="button" className="link-button" onClick={() => setQuery("")} disabled={!query}>
          Clear search
        </button>
      }
    >
      <div className="dictionary-layout">
        <section className="panel" aria-label="Dictionary term search and results">
          <div className="dictionary-controls">
            <SearchInput
              id="dictionary-query"
              label="Search term"
              value={query}
              onChange={setQuery}
              placeholder="Try: SQL injection, XSS, site:"
            />
            <FilterChips
              options={dictionaryCategories}
              value={filter}
              onChange={setFilter}
              groupLabel="Dictionary category filter"
            />
          </div>

          <p className="dictionary-count">
            Showing {filteredEntries.length} term{filteredEntries.length === 1 ? "" : "s"}
          </p>

          {filteredEntries.length === 0 ? (
            <StateBlock
              title="No matching terms"
              description="Try a broader keyword or switch back to All categories."
              action={
                <button type="button" className="link-button" onClick={() => setFilter("all")}>
                  Reset category
                </button>
              }
            />
          ) : (
            <ul className="dictionary-list" role="listbox" aria-label="Dictionary terms">
              {filteredEntries.map((entry) => {
                const active = entry.id === selectedId || (!selectedId && entry.id === filteredEntries[0].id);
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`dictionary-entry-button${active ? " dictionary-entry-button-active" : ""}`}
                      onClick={() => setSelectedId(entry.id)}
                    >
                      <h2 className="dictionary-entry-term">{entry.term}</h2>
                      <p className="dictionary-entry-summary">{entry.summary}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel" aria-live="polite" aria-label="Selected term details">
          {!selectedEntry ? (
            <StateBlock
              title="Select a term"
              description="Pick a definition from the list to see explanation, example, and safety notes."
            />
          ) : (
            <>
              <h2 className="panel-title">{selectedEntry.term}</h2>
              <p className="dictionary-aliases">
                Also known as: {selectedEntry.aliases.length > 0 ? selectedEntry.aliases.join(", ") : "No aliases"}
              </p>

              <div className="dictionary-meta">
                <span className="dictionary-badge">{getCategoryLabel(selectedEntry.category)}</span>
                <span className="dictionary-badge dictionary-badge-safety">Authorized-use learning reference</span>
              </div>

              <div className="dictionary-detail-grid">
                <article className="dictionary-detail-card">
                  <h3>Simple explanation</h3>
                  <p>{selectedEntry.explanation}</p>
                </article>

                <article className="dictionary-detail-card">
                  <div className="dictionary-example-heading">
                    <h3>Example</h3>
                    <button
                      type="button"
                      className="dictionary-copy-button"
                      onClick={() => void handleCopyExample(selectedEntry.id, selectedEntry.example)}
                    >
                      Copy example
                    </button>
                  </div>
                  <p className="dictionary-example">{selectedEntry.example}</p>
                  {copyFeedback?.entryId === selectedEntry.id && (
                    <p className="dictionary-copy-feedback" role="status">
                      {copyFeedback.message}
                    </p>
                  )}
                </article>

                <article className="dictionary-detail-card">
                  <h3>Risk and usage</h3>
                  <p>{selectedEntry.riskOrUsage}</p>
                </article>

                <article className="dictionary-detail-card">
                  <h3>Safety notes</h3>
                  <p>{selectedEntry.safetyNotes}</p>
                </article>
              </div>
            </>
          )}
        </section>
      </div>
    </FeatureLayout>
  );
}
