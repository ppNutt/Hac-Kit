interface FilterOption<T extends string> {
  label: string;
  value: T;
}

interface FilterChipsProps<T extends string> {
  options: FilterOption<T>[];
  value: T;
  onChange: (next: T) => void;
  groupLabel: string;
}

export default function FilterChips<T extends string>({
  options,
  value,
  onChange,
  groupLabel,
}: FilterChipsProps<T>) {
  return (
    <div className="ui-chip-group" role="radiogroup" aria-label={groupLabel}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={`ui-chip${isActive ? " ui-chip-active" : ""}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
