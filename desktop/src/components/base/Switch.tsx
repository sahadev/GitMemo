interface SwitchProps {
  enabled: boolean;
  onToggle: () => void;
  title?: string;
}

export function Switch({ enabled, onToggle, title }: SwitchProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="gm-switch"
      data-enabled={enabled ? "true" : "false"}
      title={title}
    >
      <span className="gm-switch-thumb" />
    </button>
  );
}
