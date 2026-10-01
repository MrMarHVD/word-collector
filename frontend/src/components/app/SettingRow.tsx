/**
 * Settings primitives: a titled section (`SettingSection`), its rows
 * (`SettingRow`) and the shared Select trigger (`SettingSelect`).
 */
import { Children, Fragment, type ComponentProps, type ReactNode } from "react";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SelectTrigger } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface SettingRowProps extends Omit<ComponentProps<"div">, "children"> {
  /** Row label; rendered as a `<label>` for the control with id `htmlFor`. */
  label: ReactNode;
  /** Optional one-line description under the label. */
  description?: ReactNode;
  /** Id of the control the label belongs to. */
  htmlFor?: string;
  /** Id for the label element, so a control without a native label (e.g. a slider thumb) can reference it. */
  labelId?: string;
  /** Wide control (Select, Slider): label above, control full width on mobile. */
  stacked?: boolean;
  /** The control, shown on the right. */
  children: ReactNode;
}

/**
 * One settings row: label and description on the left, control on the right
 * (min 44px high). Rows stay horizontal on mobile unless `stacked`.
 */
export function SettingRow({ label, description, htmlFor, labelId, stacked = false, className, children, ...props }: SettingRowProps) {
  return (
    <Field
      orientation="horizontal"
      className={cn(
        "min-h-11 px-4 py-3 has-[>[data-slot=field-content]]:items-center",
        stacked && "mobile:flex-col mobile:items-stretch mobile:has-[>[data-slot=field-content]]:items-stretch",
        className
      )}
      {...props}
    >
      <FieldContent className="gap-0.5">
        <FieldLabel id={labelId} htmlFor={htmlFor} className="text-sm font-semibold text-main">
          {label}
        </FieldLabel>
        {description ? <FieldDescription className="text-xs text-secondary">{description}</FieldDescription> : null}
      </FieldContent>
      <div className={cn("flex shrink-0 items-center justify-end", stacked && "w-56 mobile:w-full")}>{children}</div>
    </Field>
  );
}

export interface SettingSectionProps extends Omit<ComponentProps<"section">, "title"> {
  /** Small uppercase heading above the container. */
  title: ReactNode;
}

/**
 * A titled group of settings: one bordered container whose children (usually
 * `SettingRow`s) are divided by a `Separator`.
 */
export function SettingSection({ title, className, children, ...props }: SettingSectionProps) {
  return (
    <section className={cn("grid gap-2", className)} {...props}>
      <h3 className="px-1 text-xs font-bold tracking-wider text-secondary uppercase">{title}</h3>
      <div className="overflow-hidden rounded-lg border border-line bg-panel">
        {Children.toArray(children).map((child, index) => (
          <Fragment key={index}>
            {index > 0 ? <Separator /> : null}
            {child}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

/**
 * Kit `SelectTrigger` with the settings styling (tall, full width, panel
 * surface). Use inside `Select` in place of `SelectTrigger`.
 */
export function SettingSelect({ className, ...props }: ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      className={cn(
        "min-h-11 w-full rounded-md border-line bg-panel px-3 text-base font-normal text-main outline-none focus:border-brand focus:ring-2 focus:ring-focus data-[size=default]:h-auto",
        className
      )}
      {...props}
    />
  );
}
