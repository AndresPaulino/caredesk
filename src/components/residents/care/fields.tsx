"use client";

import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

/**
 * The fields the recording-care forms are built from: a label, the control, an optional
 * description, and the message from validation, shown right under the control it concerns.
 */

type BaseProps = {
  name: string;
  label: string;
  errors?: string[];
  description?: string;
  className?: string;
};

function toMessages(errors?: string[]) {
  return errors?.map((message) => ({ message }));
}

export function TextField({
  name,
  label,
  errors,
  description,
  className,
  ...props
}: BaseProps & Omit<React.ComponentProps<typeof Input>, "name">) {
  const id = useId();
  const invalid = Boolean(errors?.length);
  return (
    <Field className={className} data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} aria-invalid={invalid || undefined} {...props} />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={toMessages(errors)} />
    </Field>
  );
}

export function TextareaField({
  name,
  label,
  errors,
  description,
  className,
  ...props
}: BaseProps & Omit<React.ComponentProps<typeof Textarea>, "name">) {
  const id = useId();
  const invalid = Boolean(errors?.length);
  return (
    <Field className={className} data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea id={id} name={name} aria-invalid={invalid || undefined} {...props} />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={toMessages(errors)} />
    </Field>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectGroup = { label: string; options: SelectOption[] };

export function SelectField({
  name,
  label,
  errors,
  description,
  className,
  options,
  groups,
  placeholder,
  ...props
}: BaseProps & {
  options?: SelectOption[];
  groups?: SelectGroup[];
  /** Shown as the empty first choice. */
  placeholder?: string;
} & Omit<React.ComponentProps<"select">, "name" | "size">) {
  const id = useId();
  const invalid = Boolean(errors?.length);
  const renderOptions = (list: SelectOption[]) =>
    list.map((option) => (
      <NativeSelectOption key={option.value} value={option.value} disabled={option.disabled}>
        {option.label}
      </NativeSelectOption>
    ));
  return (
    <Field className={className} data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        name={name}
        aria-invalid={invalid || undefined}
        className="w-full"
        {...props}
      >
        {placeholder !== undefined && (
          <NativeSelectOption value="">{placeholder}</NativeSelectOption>
        )}
        {options && renderOptions(options)}
        {groups?.map((group) => (
          <NativeSelectOptGroup key={group.label} label={group.label}>
            {renderOptions(group.options)}
          </NativeSelectOptGroup>
        ))}
      </NativeSelect>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={toMessages(errors)} />
    </Field>
  );
}

export function CheckboxField({
  name,
  label,
  description,
  defaultChecked,
  className,
}: Omit<BaseProps, "errors"> & { defaultChecked?: boolean }) {
  const id = useId();
  return (
    <Field orientation="horizontal" className={className}>
      <Checkbox id={id} name={name} defaultChecked={defaultChecked} />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
    </Field>
  );
}

/** Options from a label map, in the map's order. */
export function optionsFrom(labels: Readonly<Record<string, string>>): SelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}
