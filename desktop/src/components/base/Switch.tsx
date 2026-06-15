interface SwitchProps {
  enabled: boolean;
  onToggle: () => void;
  title?: string;
  disabled?: boolean;
}

export function Switch({ enabled, onToggle, title, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="gm-switch"
      data-enabled={enabled ? "true" : "false"}
      title={title}
    >
      <span className="gm-switch-thumb" />
    </button>
  );
}
