import { Component, ViewEncapsulation, computed, input } from '@angular/core';
import { Field, FormField } from '@angular/forms/signals';
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

// Reusable labelled text input for Signal Forms: label + validation feedback
// on one row, then the outlined Material field.
//
//   <app-text-field
//     id="customer-first-name"
//     label="First name"
//     placeholder="e.g. Amina"
//     autocomplete="given-name"
//     [field]="customerForm.firstName"
//     [attempted]="attempted()"
//   />
//
// Error display rule, same as the hand-written fields it replaces: show the
// first error when the field is invalid AND (touched OR a save was attempted).
// `externalError` covers business-rule errors the schema cannot express
// (e.g. the quote amount); a non-empty value forces the error to show.
//
// The error paragraph's id is always `<id>-error`, and `aria-describedby` /
// `aria-invalid` are only rendered while the error is visible (binding `null`
// removes the attribute, which is what assistive tech expects when valid).
//
// `(input)` listeners on <app-text-field> still work without an @output: the
// native input event bubbles up from the inner <input> to the host element.
@Component({
  selector: 'app-text-field',
  encapsulation: ViewEncapsulation.None,
  // `id` is an input (for the inner <input>), but it is also a global
  // attribute: without this the host element would carry the same id as the
  // inner input, and duplicate ids break label for/id association.
  host: { '[attr.id]': 'null' },
  imports: [FormField, MatFormField, MatInput],
  templateUrl: './text-field.html',
  styleUrl: './text-field.css',
})
export class TextField {
  /** Input id. The label points at it and the error paragraph is `<id>-error`. */
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  /** The Signal Forms field to bind, e.g. `customerForm.firstName`. */
  readonly field = input.required<Field<string>>();
  /** True after the first save attempt, so untouched invalid fields show errors. */
  readonly attempted = input.required<boolean>();
  readonly placeholder = input('');
  readonly type = input('text');
  readonly autocomplete = input<string>();
  readonly inputmode = input<string>();
  /** Business-rule error message from outside the schema; non-empty shows it. */
  readonly externalError = input('');

  protected readonly showError = computed(() => {
    const state = this.field()();
    return !!this.externalError() || ((this.attempted() || state.touched()) && state.invalid());
  });
  protected readonly errorText = computed(
    () => this.externalError() || this.field()().errors()[0]?.message,
  );
  protected readonly errorId = computed(() => `${this.id()}-error`);
}
