import { Component, computed, input, linkedSignal, model, output, viewChild } from '@angular/core';
import {
  MatAutocomplete,
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButton } from '@angular/material/button';
import { SearchField } from '@app/shared/search-field/search-field';
import { ConfirmedCountry } from '@app/pages/customers/data-access/customer.model';
import { Country, Prediction } from '@app/pages/customers/data-access/enrichment-api';

// A searchable country picker: <app-search-field> plus an autocomplete panel
// with two groups, surname-based "Suggested countries" first and then "All
// countries". Also renders the "country refresh failed" warning with a Retry.
//
//   <app-country-select
//     #countryField
//     id="customer-country"
//     [countries]="countries()"
//     [predictions]="predictions()"
//     [warning]="countryWarning()"
//     [error]="attempted() && !model().nationality ? 'Choose a country.' : ''"
//     [value]="model().nationality"
//     (valueChange)="confirmCountry($event)"
//     (retry)="retryCountries()"
//   />
//
// This is a *presentational* component, what Vue people call a dumb component:
// props in, events out, no HTTP. The country list, the surname predictions and
// the warning flag are inputs, because the parent form needs the same list
// for its own work (resolving prediction codes, validating before save). All
// the component owns is the search text and the filtering of the two groups.
//
// `value` is a `model()`, Angular's two-way binding primitive. The parent can
// use `[(value)]`, or as the form does, `[value]` in and `(valueChange)` out,
// which is `:modelValue` + `@update:modelValue` in Vue. It only ever emits a
// country the user picked from the list, never free text.
@Component({
  selector: 'app-country-select',
  // `id` is forwarded to the inner input. Null it on the host so the page has
  // exactly one element with that id and label for/id association works.
  host: {
    '[attr.id]': 'null',
    '(focusout)': 'onFocusOut()',
  },
  imports: [SearchField, MatButton, MatAutocompleteModule],
  templateUrl: './country-select.html',
})
export class CountrySelect {
  /** Inner input id. Also used for the `<id>-warning` feedback block. */
  readonly id = input.required<string>();
  readonly label = input('Nationality');
  readonly placeholder = input('Search countries');
  readonly required = input(true);
  /** Every country that can be picked. */
  readonly countries = input.required<Country[]>();
  /** Surname-based suggestions, best match first. Shown above the full list. */
  readonly predictions = input<Prediction[]>([]);
  /** Non-empty shows the error beside the label and marks the input invalid. */
  readonly error = input('');
  /** True when the live country refresh failed. Shows the warning and Retry. */
  readonly warning = input(false);
  /** The confirmed country. Emits on selection; never emits null. */
  readonly value = model<ConfirmedCountry | null>(null);
  /** The Retry button inside the warning was clicked. */
  readonly retry = output<void>();

  private readonly field = viewChild.required(SearchField);
  private readonly panel = viewChild.required(MatAutocomplete);

  protected readonly warningId = computed(() => `${this.id()}-warning`);

  // What the user has typed. `linkedSignal` is a writable signal with a
  // default derived from another signal: it re-derives from `value` whenever
  // the confirmed country changes (the parent loads a customer, or resets the
  // form), and typing overwrites it in between. Vue has no exact equivalent;
  // it replaces the "watch the prop, copy it into local state" pattern.
  protected readonly query = linkedSignal(() => this.value()?.name ?? '');

  // Opening an already confirmed value still shows everything; typing a new
  // search narrows both groups without changing the confirmed country.
  private readonly searchText = computed(() => {
    const text = this.query().trim().toLocaleLowerCase();
    return text === this.value()?.name.toLocaleLowerCase() ? '' : text;
  });
  /** Predictions that match the search text. Rendered as "Suggested countries". */
  protected readonly matchingPredictions = computed(() => {
    const text = this.searchText();
    return this.predictions().filter((item) =>
      item.country.name.toLocaleLowerCase().includes(text),
    );
  });
  // Every other matching country, rendered as "All countries". Countries that
  // already appear as a suggestion are excluded so nothing is listed twice.
  // Capped at 50 so the dropdown stays fast to render.
  protected readonly matchingCountries = computed(() => {
    const text = this.searchText();
    const suggested = new Set(this.matchingPredictions().map((item) => item.country.code));
    return this.countries()
      .filter((item) => item.name.toLocaleLowerCase().includes(text) && !suggested.has(item.code))
      .slice(0, 50);
  });

  /** `(input)` on the search box. Updates the search text only, never the confirmed country. */
  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onPanelClosed(): void {
    this.revertQuery();
  }

  protected onFocusOut(): void {
    // Wait for the panel's closed event when clicking an option, so filtering
    // does not replace options under the pointer before selection completes.
    if (!this.panel().isOpen) this.revertQuery();
  }

  private revertQuery(): void {
    const name = this.value()?.name ?? '';
    if (this.query() !== name) this.query.set(name);
  }

  /**
   * `(optionSelected)` from the autocomplete. The option's `[value]` is the
   * country name (so the input shows readable text), mapped back to the full
   * country here. Re-picking the current country only restores the text.
   */
  protected choose(event: MatAutocompleteSelectedEvent): void {
    const country = this.countries().find((item) => item.name === event.option.value);
    if (!country) return;
    if (this.value()?.code !== country.code) {
      this.value.set({ code: country.code, name: country.name });
    }
    this.query.set(country.name);
  }

  /** Lets the parent move keyboard focus into the search input (e.g. on Retry). */
  focus(): void {
    this.field().focus();
  }
}
