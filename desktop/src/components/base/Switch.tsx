interface SwitchProps {
  enabled: boolean;
  onToggle: () => void;
  title?: string;
  /** 无障碍名称：没给 title 时用它，读屏和 Tab 都能读到「这是哪个开关」。 */
  label?: string;
  disabled?: boolean;
}

export function Switch({ enabled, onToggle, title, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="gm-switch"
      data-enabled={enabled ? "true" : "false"}
      role="switch"
      aria-checked={Boolean(enabled)}
      aria-label={label ?? title}
      title={title}
    >
      <span className="gm-switch-thumb" />
    </button>
  );
}
