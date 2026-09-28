import {
  Component,
  ViewEncapsulation,
  computed,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import { Field } from '@angular/forms/signals';
import {
  MatAutocomplete,
  MatAutocompleteSelectedEvent,
  MatOption,
} from '@angular/material/autocomplete';
import { SearchField } from '@app/shared/search-field/search-field';

/** One choice in an <app-select-field>. */
export interface SelectOption {
  value: string;
  label: string;
}

// Reusable searchable select for Signal Forms: label + validation feedback on
// one row, then an outlined search box whose autocomplete panel lists the
// options. Typing narrows the list; picking an option stores its `value` in
// the bound field while the box shows its `label`. The select-flavoured twin
// of <app-text-field>, with the same error rules and ids.
//
//   <app-select-field
//     id="quote-customer"
//     label="Customer"
//     placeholder="Search customers"
//     [options]="customerOptions()"
//     [field]="quoteForm.customerId"
//     [attempted]="attempted()"
//     [externalError]="customerError()"
//   />
//
// The field only ever holds an option's `value`, never free text. Text that
// does not match a pick is reverted to the current selection's label when the
// panel closes (Escape, Tab, click elsewhere), the same way a native select
// behaves, so the model can never end up with a half-typed name.
//
// Error display rule: show the first schema error when the field is invalid
// AND (touched OR a save was attempted). The field counts as touched once
// focus leaves it. `externalError` is for business-rule errors the schema
// cannot express (e.g. "the customer no longer exists"); a non-empty value
// forces the error to show and wins over schema errors.
//
// <app-search-field> owns the label/input association and the `<id>-error`
// paragraph, so `aria-invalid` and `aria-describedby` land on the input.
@Component({
  selector: 'app-select-field',
  encapsulation: ViewEncapsulation.None,
  host: {
    // `id` is forwarded to the inner input. Null it on the host so the page
    // has exactly one element with that id.
    '[attr.id]': 'null',
    // `focusout` bubbles (unlike `blur`), so the host hears the inner input.
    '(focusout)': 'onFocusOut()',
  },
  imports: [SearchField, MatAutocomplete, MatOption],
  templateUrl: './select-field.html',
})
export class SelectField {
  /** Input id. The label points at it and the error paragraph is `<id>-error`. */
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  /** The choices, in display order. */
  readonly options = input.required<readonly SelectOption[]>();
  /** The Signal Forms field to bind, e.g. `quoteForm.customerId`. */
  readonly field = input.required<Field<string>>();
  /** True after the first save attempt, so untouched invalid fields show errors. */
  readonly attempted = input.required<boolean>();
  readonly placeholder = input('');
  /** Business-rule error message from outside the schema; non-empty shows it. */
  readonly externalError = input('');
  /** Emitted after an option is chosen, including when no search text was typed. */
  readonly selectionChange = output<string>();

  private readonly panel = viewChild.required(MatAutocomplete);
  private readonly searchField = viewChild.required(SearchField);

  /** The option whose value the field currently holds, if any. */
  private readonly selected = computed(
    () => this.options().find((option) => option.value === this.field()().value()) ?? null,
  );

  // What the user has typed. Re-derived from the selection whenever the field
  // value changes (the parent loads a quote or resets the form); typing
  // overwrites it in between.
  protected readonly query = linkedSignal(() => this.selected()?.label ?? '');

  // Opening an already selected value still shows everything; typing a new
  // search narrows the list without changing the selection.
  private readonly searchText = computed(() => {
    const text = this.query().trim().toLocaleLowerCase();
    return text === this.selected()?.label.toLocaleLowerCase() ? '' : text;
  });
  protected readonly matching = computed(() => {
    const text = this.searchText();
    return this.options().filter((option) => option.label.toLocaleLowerCase().includes(text));
  });

  protected readonly showError = computed(() => {
    const state = this.field()();
    return !!this.externalError() || ((this.attempted() || state.touched()) && state.invalid());
  });
  protected readonly errorText = computed(
    () => this.externalError() || this.field()().errors()[0]?.message || '',
  );

  /** `displayWith` for the autocomplete: the input shows the label, not the id. */
  protected readonly displayLabel = (value: string | null): string =>
    this.options().find((option) => option.value === value)?.label ?? '';

  /** `(input)` on the search box. Updates the search text only, never the field. */
  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  /** `(optionSelected)`: store the option's value; the label follows via `query`. */
  protected choose(event: MatAutocompleteSelectedEvent): void {
    const state = this.field()();
    if (state.value() !== event.option.value) state.value.set(event.option.value);
    this.query.set(this.displayLabel(event.option.value));
    state.markAsTouched();
    this.selectionChange.emit(event.option.value);
  }

  // The panel closed without a pick (Escape, Tab, click elsewhere): drop any
  // half-typed text and show the current selection again.
  protected onPanelClosed(): void {
    this.revertQuery();
  }

  protected onFocusOut(): void {
    this.field()().markAsTouched();
    // While the panel is open the user may be about to click an option; the
    // `closed` event handles that case. Reverting now would re-render the
    // list under the pointer between mousedown and click.
    if (!this.panel().isOpen) this.revertQuery();
  }

  private revertQuery(): void {
    const label = this.selected()?.label ?? '';
    if (this.query() !== label) this.query.set(label);
  }

  /** Lets the parent move keyboard focus into the search input. */
  focus(): void {
    this.searchField().focus();
  }
}
