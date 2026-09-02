"use client";

import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import FormSelect from "@/components/form-select";

type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

function enhance(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node;
  if (node.type === "select") {
    const props = node.props as NativeSelectProps;
    if (!props.multiple && !props.size) return <FormSelect {...props} />;
  }
  const props = node.props as { children?: ReactNode };
  if (!props.children) return node;
  return cloneElement(node as ReactElement<{ children?: ReactNode }>, {}, Children.map(props.children, enhance));
}

/** Converts ordinary single-value selects in an application subtree to AppSelect. */
export default function DropdownEnhancer({ children }: { children: ReactNode }) {
  return <>{enhance(children)}</>;
}
