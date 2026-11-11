import { cx } from "./classNames";

interface UnreadDotProps {
  /** 读屏文案；给定时圆点会被读出来，省略则视为纯装饰。 */
  label?: string;
  className?: string;
}

/** 未读小红点：尺寸与颜色全部取自设计 token，纯展示，不携带任何状态。 */
export function UnreadDot({ label, className }: UnreadDotProps) {
  return (
    <span
      className={cx("gm-unread-dot", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
