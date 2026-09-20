interface SearchInputProps {
  id: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  label: string;
}

export default function SearchInput({ id, value, onChange, placeholder, label }: SearchInputProps) {
  return (
    <div className="ui-search-input">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  );
}
