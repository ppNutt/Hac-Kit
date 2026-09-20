import { useMemo, useState } from "react";
import { dictionaryEntries, type DictionaryCategory, type DictionaryEntry } from "./dictionaryData";

export type DictionaryFilter = DictionaryCategory | "all";

function getSearchText(entry: DictionaryEntry): string {
  return [entry.term, entry.aliases.join(" "), entry.summary, entry.explanation].join(" ").toLowerCase();
}

export function useDictionary() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DictionaryFilter>("all");
  const [selectedId, setSelectedId] = useState<string>(dictionaryEntries[0]?.id ?? "");

  const normalizedQuery = query.trim().toLowerCase();

  const filteredEntries = useMemo(() => {
    return dictionaryEntries.filter((entry) => {
      const matchesCategory = filter === "all" || entry.category === filter;
      if (!matchesCategory) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return getSearchText(entry).includes(normalizedQuery);
    });
  }, [filter, normalizedQuery]);

  const selectedEntry = useMemo(() => {
    const fromFiltered = filteredEntries.find((entry) => entry.id === selectedId);
    if (fromFiltered) {
      return fromFiltered;
    }
    return filteredEntries[0] ?? null;
  }, [filteredEntries, selectedId]);

  return {
    query,
    setQuery,
    filter,
    setFilter,
    filteredEntries,
    selectedEntry,
    selectedId,
    setSelectedId,
  };
}
