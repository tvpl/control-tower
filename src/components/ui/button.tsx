import { type ComponentProps } from "react";
import { clsx } from "clsx";
export function Button({
  variant = "secondary",
  size = "default",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "small" | "icon";
}) {
  return (
    <button
      type={type}
      className={clsx(
        size === "icon" ? "icon-button" : "button",
        variant === "primary" && "primary",
        variant === "ghost" && "ghost",
        size === "small" && "small",
        className,
      )}
      {...props}
    />
  );
}
