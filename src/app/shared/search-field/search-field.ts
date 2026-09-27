import {
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  contentChild,
  effect,
  input,
  viewChild,
} from '@angular/core';
import { MatAutocomplete, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatFormField, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

// Reusable labelled autocomplete search field: label + validation feedback on
// one row, then the outlined Material field with an autocomplete panel.
//
// Unlike `TextField` this is NOT a Signal Forms field: the typed text is a
// search query, not a saved value, so it is wired the "manual v-model" way —
// `[value]` in, `(input)` out (the native input event bubbles to the host, so
// `(input)` listeners on <app-search-field> just work). The confirmed choice
// lands in the parent's model when an autocomplete option is selected.
//
//   <app-search-field
//     id="customer-country"
//     label="Nationality"
//     placeholder="Search countries"
//     [required]="true"
//     [value]="countryQuery()"
//     [error]="attempted() && !model().nationality ? 'Choose a country.' : ''"
//     (input)="onCountryInput($event)"
//   >
//     <div fieldFeedback class="field-feedback hint" id="...-warning">…</div>
//     <mat-autocomplete (optionSelected)="choose($event)">…</mat-autocomplete>
//     <button fieldSuffix …>×</button>
//   </app-search-field>
//
// Three projection slots:
//   [fieldFeedback]    extra status/warning block beside the label
//   mat-autocomplete   the options panel (linked to the input automatically)
//   [fieldSuffix]      buttons rendered inside the field's right edge. A plain
//                      attribute, not Material's `matIconSuffix`: see the note
//                      in search-field.html for why this component has to own
//                      the suffix wrapper itself.
//
// `extraDescribedby` is the id of the projected feedback block while visible;
// it is appended to aria-describedby after the error id, matching WCAG
// expectations that the input announces both.
//
// `matInput` binds `aria-invalid` itself from its own `errorState`, and that
// host binding wins over this template's. With no classic form control
// attached it would stay false forever, so the constructor's effect pushes
// `error` into it; that also gives the field Material's invalid styling.
// (Material still omits `aria-invalid` while a `required` input is empty,
// so consumers that need the attribute in that state, like <app-select-field>,
// leave `required` off and validate in their form schema instead.)
@Component({
  selector: 'app-search-field',
  encapsulation: ViewEncapsulation.None,
  // `id` is also a global attribute; without this the host element would
  // duplicate the inner input's id and break label for/id association.
  host: { '[attr.id]': 'null' },
  imports: [MatFormField, MatInput, MatSuffix, MatAutocompleteTrigger],
  templateUrl: './search-field.html',
  styleUrl: './search-field.css',
})
export class SearchField {
  /** Input id. The label points at it and the error paragraph is `<id>-error`. */
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  /** The current search text (one-way in; listen to `(input)` for changes). */
  readonly value = input('');
  readonly placeholder = input('');
  readonly disabled = input(false);
  /** Adds aria-required. Validation itself stays the parent's job. */
  readonly required = input(false);
  /** Non-empty shows the error beside the label and sets aria-invalid. */
  readonly error = input('');
  /** Id of a projected [fieldFeedback] block, while it is visible. */
  readonly extraDescribedby = input<string | null>(null);

  /** The projected <mat-autocomplete>, linked to the input's trigger. */
  protected readonly autocomplete = contentChild(MatAutocomplete);
  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('input');
  private readonly matInput = viewChild.required(MatInput);

  constructor() {
    effect(() => {
      this.matInput().errorState = !!this.error();
    });
  }

  protected readonly errorId = computed(() => `${this.id()}-error`);
  protected readonly describedby = computed(() => {
    const ids = [this.error() && this.errorId(), this.extraDescribedby()].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  });

  /** Lets the parent move keyboard focus back into the input (e.g. on Retry). */
  focus(): void {
    this.inputRef()?.nativeElement.focus();
  }
}
