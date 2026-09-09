"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";

/** Styled by globals.css; preserve real form submission, validation and mobile pickers. */
const FormSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function FormSelect({ children, ...props }, ref) {
    return <select ref={ref} {...props}>{children}</select>;
  },
);

export default FormSelect;
