import type { CompositionEvent, KeyboardEvent, Ref } from "react";
import { Search } from "lucide-react";
import { AppIcon } from "../../base/AppIcon";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputRef?: Ref<HTMLInputElement>;
  mobile?: boolean;
  onCompositionStart?: (event: CompositionEvent<HTMLInputElement>) => void;
  onCompositionEnd?: (event: CompositionEvent<HTMLInputElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  inputRef,
  mobile = false,
  onCompositionStart,
  onCompositionEnd,
  onKeyDown,
}: SearchInputProps) {
  return (
    <header className="gm-search-header" data-mobile={mobile ? "true" : "false"}>
      <div className="gm-search-input-wrap">
        <AppIcon icon={Search} size="sm" tone="secondary" className="gm-search-input-icon" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          onKeyDown={onKeyDown}
          enterKeyHint="search"
          placeholder={placeholder}
          className="gm-search-input"
        />
      </div>
    </header>
  );
}
