"use client";

import { Children, Fragment, isValidElement, type ChangeEvent, type ReactNode, useEffect, useState } from "react";
import AppSelect, { type AppSelectOption } from "@/components/app-select";

type FormSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

function optionsFrom(children: ReactNode): AppSelectOption[] {
  return Children.toArray(children).flatMap((item) => {
    if (!isValidElement(item)) return [];
    // A native select renders options nested in fragments; match that here,
    // otherwise an extracted options variable renders as an empty dropdown.
    if (item.type === Fragment) return optionsFrom((item.props as { children?: ReactNode }).children);
    if (item.type !== "option") return [];
    const props = item.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
    return [{ value: String(props.value ?? props.children ?? ""), label: String(props.children ?? ""), disabled: props.disabled }];
  });
}

/**
 * Drop-in replacement for ordinary single-value HTML selects. It retains the
 * native form/onChange contract while presenting the shared AppSelect UI.
 */
export default function FormSelect({ children, ...props }: FormSelectProps) {
  const options = optionsFrom(children);
  const isControlled = props.value !== undefined;
  const initialValue = props.defaultValue ?? options.find((option) => !option.disabled)?.value ?? "";
  const externalValue = String(props.value ?? initialValue);
  const [uncontrolledValue, setUncontrolledValue] = useState(externalValue);

  useEffect(() => { if (isControlled) setUncontrolledValue(externalValue); }, [externalValue, isControlled]);

  return <AppSelect
    value={isControlled ? externalValue : uncontrolledValue}
    name={props.name}
    id={props.id}
    required={Boolean(props.required)}
    disabled={Boolean(props.disabled)}
    className={props.className}
    options={options}
    aria-label={props["aria-label"]}
    aria-describedby={props["aria-describedby"]}
    aria-invalid={props["aria-invalid"]}
    onChange={(nextValue) => {
      if (!isControlled) setUncontrolledValue(nextValue);
      props.onChange?.({ target: { value: nextValue, name: props.name } } as ChangeEvent<HTMLSelectElement>);
    }}
  />;
}
