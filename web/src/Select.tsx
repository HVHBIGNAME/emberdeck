import { useId, type ReactNode } from "react";
import * as Dropdown from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "./i18n";

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  textValue?: string;
}

const emptyValue = "__emberdeck_empty_option__";

export function Select({
  value,
  onValueChange,
  options,
  label,
  placeholder,
  disabled,
  className = "",
  id,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  label: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const generatedId = useId();
  const { t } = useTranslation();
  const hasEmpty = options.some((option) => option.value === "");
  return (
    <Dropdown.Root
      value={value || (hasEmpty ? emptyValue : "")}
      disabled={disabled}
      onValueChange={(next) => onValueChange(next === emptyValue ? "" : next)}
    >
      <Dropdown.Trigger
        id={id || generatedId}
        aria-label={label}
        className={`select-trigger ${className}`}
      >
        <Dropdown.Value placeholder={placeholder || t("Choose an option")} />
        <Dropdown.Icon className="select-chevron">
          <ChevronDown size={16} />
        </Dropdown.Icon>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          className="select-content"
          position="popper"
          sideOffset={8}
          collisionPadding={12}
        >
          <Dropdown.ScrollUpButton className="select-scroll">
            <ChevronUp size={16} />
          </Dropdown.ScrollUpButton>
          <Dropdown.Viewport className="select-viewport">
            {options.map((option) => (
              <Dropdown.Item
                key={option.value || emptyValue}
                value={option.value || emptyValue}
                disabled={option.disabled}
                textValue={
                  option.textValue ??
                  (typeof option.label === "string"
                    ? option.label
                    : option.value)
                }
                className="select-option"
              >
                <Dropdown.ItemText>{option.label}</Dropdown.ItemText>
                <Dropdown.ItemIndicator className="select-check">
                  <Check size={16} />
                </Dropdown.ItemIndicator>
              </Dropdown.Item>
            ))}
          </Dropdown.Viewport>
          <Dropdown.ScrollDownButton className="select-scroll">
            <ChevronDown size={16} />
          </Dropdown.ScrollDownButton>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
