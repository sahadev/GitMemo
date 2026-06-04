interface LoadMoreRowProps {
  loading: boolean;
  loadingLabel: string;
  label: string;
  onClick: () => void;
}

export function LoadMoreRow({ loading, loadingLabel, label, onClick }: LoadMoreRowProps) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="gm-load-more-row"
    >
      {loading ? loadingLabel : label}
    </button>
  );
}
