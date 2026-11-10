/**
 * Form fields with one height, radius, focus ring, hint and error style.
 * Use inside modals, settings and auth forms.
 */
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertCircle, ChevronDown, Eye, EyeOff } from "lucide-react";
import "./kit.css";

export function Field({
  label,
  hint,
  error,
  required,
  optional,
  children,
  id,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optional?: boolean;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
  id?: string;
  className?: string;
}) {
  const generated = useId();
  const fieldId = id ?? children.props.id ?? generated;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id: fieldId, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })
    : children;
  return (
    <div className={`ui-field${error ? " ui-field--error" : ""}${className ? ` ${className}` : ""}`}>
      <label htmlFor={fieldId} className="ui-label">
        {label}
        {required && (
          <span className="ui-label__required" aria-hidden="true">
            *
          </span>
        )}
        {optional && <span className="ui-label__optional">(optional)</span>}
      </label>
      {control}
      {error ? (
        <p id={errorId} className="ui-field__error" role="alert">
          <AlertCircle aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="ui-field__hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { leading?: ReactNode }>(
  function TextInput({ className, leading, ...props }, ref) {
    if (!leading) return <input ref={ref} className={`ui-input${className ? ` ${className}` : ""}`} {...props} />;
    return (
      <span className="ui-input-wrap">
        <span className="ui-input-wrap__leading" aria-hidden="true">
          {leading}
        </span>
        <input ref={ref} className={`ui-input ui-input--leading${className ? ` ${className}` : ""}`} {...props} />
      </span>
    );
  },
);

/** Password input with a show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { leading?: ReactNode }>(
  function PasswordInput({ className, leading, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <span className="ui-input-wrap">
        {leading && (
          <span className="ui-input-wrap__leading" aria-hidden="true">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          className={`ui-input ui-input--trailing${leading ? " ui-input--leading" : ""}${className ? ` ${className}` : ""}`}
          {...props}
        />
        <button
          type="button"
          className="ui-input-wrap__toggle"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </span>
    );
  },
);

export const SelectInput = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function SelectInput(
  { className, children, ...props },
  ref,
) {
  return (
    <span className="ui-select-wrap">
      <select ref={ref} className={`ui-input ui-select${className ? ` ${className}` : ""}`} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" />
    </span>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={`ui-input ui-textarea${className ? ` ${className}` : ""}`} {...props} />;
});

/** A two-column grid of fields that stacks on small screens. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="ui-field-row">{children}</div>;
}
