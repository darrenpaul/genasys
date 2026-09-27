// Tests for the country picker, driven through a small host component the
// way a parent form would use it. See search-field.spec.ts for the pattern;
// the one extra detail here is that Material renders autocomplete options in
// an overlay attached to <body>, so options are looked up on `document`.
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmedCountry } from '../../data-access/customer.model';
import { fallbackCountries, Prediction } from '../../data-access/enrichment-api';
import { CountrySelect } from './country-select';

const nigeria = fallbackCountries.find((country) => country.code === 'NG')!;

@Component({
  imports: [CountrySelect],
  template: `
    <app-country-select
      #field
      id="test-country"
      [countries]="countries"
      [predictions]="predictions()"
      [warning]="warning()"
      [error]="error()"
      [value]="value()"
      (valueChange)="value.set($event); changes.update((count) => count + 1)"
      (retry)="retries.update((count) => count + 1)"
    />
  `,
})
class TestHost {
  readonly field = viewChild.required(CountrySelect);
  readonly countries = fallbackCountries;
  readonly predictions = signal<Prediction[]>([]);
  readonly warning = signal(false);
  readonly error = signal('');
  readonly value = signal<ConfirmedCountry | null>(null);
  readonly changes = signal(0);
  readonly retries = signal(0);
}

function options(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('mat-option')];
}
function groups(): string[] {
  return [...document.querySelectorAll('.mat-mdc-optgroup-label')].map(
    (group) => group.textContent?.trim() ?? '',
  );
}

describe('CountrySelect', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestHost] }).compileComponents();
  });

  it('filters the list as the user types and emits the picked country once', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>('#test-country')!;
    expect(host.querySelectorAll('#test-country')).toHaveLength(1);
    expect(input.labels?.[0]?.textContent).toBe('Nationality');
    expect(input.getAttribute('aria-required')).toBe('true');

    input.focus();
    input.value = 'Niger';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(groups()).toEqual(['All countries']);
    const names = options().map((option) => option.textContent?.trim());
    expect(names).toContain('🇳🇬 Nigeria');
    expect(names).toContain('🇳🇪 Niger');
    expect(names).not.toContain('🇦🇫 Afghanistan');

    options()
      .find((option) => option.textContent?.includes('Nigeria'))!
      .click();
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toEqual({ code: 'NG', name: 'Nigeria' });
    expect(fixture.componentInstance.changes()).toBe(1);
    expect(input.value).toBe('Nigeria');

    // Re-opening the confirmed value shows the whole list again (capped at 50,
    // so it starts from the top). Material only reopens the panel on a fresh
    // focus, hence the blur first.
    input.blur();
    input.focus();
    fixture.detectChanges();
    expect(options()).toHaveLength(50);
    expect(options()[0].textContent?.trim()).toBe('🇦🇫 Afghanistan');

    // Picking the same country again does not emit a second change. (Typing
    // the exact confirmed name deliberately shows the full list, so narrow
    // with a partial name.)
    input.value = 'Niger';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    options()
      .find((option) => option.textContent?.includes('Nigeria'))!
      .click();
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toEqual({ code: 'NG', name: 'Nigeria' });
    expect(fixture.componentInstance.changes()).toBe(1);
    expect(input.value).toBe('Nigeria');
  });

  it('restores confirmed country when search ends without a new selection', () => {
    const fixture = TestBed.createComponent(TestHost);
    const state = fixture.componentInstance;
    state.value.set({ code: 'NG', name: 'Nigeria' });
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '#test-country',
    )!;

    input.focus();
    input.value = 'Australia';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(input.value).toBe('Australia');
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
    );
    fixture.detectChanges();
    expect(input.value).toBe('Nigeria');
    expect(state.value()?.code).toBe('NG');
    expect(state.changes()).toBe(0);

    input.blur();
    input.focus();
    input.value = 'Unknown country';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    input.blur();
    fixture.detectChanges();
    expect(input.value).toBe('Nigeria');
    expect(state.value()?.code).toBe('NG');
  });

  it('lists predictions first without duplicating them in the full list', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.componentInstance.predictions.set([{ country: nigeria, probability: 0.7 }]);
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '#test-country',
    )!;
    input.focus();
    fixture.detectChanges();
    expect(groups()).toEqual(['Suggested countries', 'All countries']);
    expect(options().filter((option) => option.textContent?.includes('Nigeria'))).toHaveLength(1);
    expect(options()[0].textContent?.trim()).toBe('🇳🇬 Nigeria');
  });

  it('follows the value from the parent, shows errors, and focuses on request', () => {
    const fixture = TestBed.createComponent(TestHost);
    const state = fixture.componentInstance;
    state.value.set({ code: 'NG', name: 'Nigeria' });
    state.error.set('Choose a country.');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>('#test-country')!;
    expect(input.value).toBe('Nigeria');
    expect(host.querySelector('#test-country-error')?.textContent?.trim()).toBe(
      'Choose a country.',
    );
    expect(input.getAttribute('aria-describedby')).toBe('test-country-error');

    // A reset from the parent clears the search text too.
    state.value.set(null);
    state.error.set('');
    fixture.detectChanges();
    expect(input.value).toBe('');
    expect(host.querySelector('#test-country-error')).toBeNull();
    expect(input.hasAttribute('aria-describedby')).toBe(false);

    state.field().focus();
    expect(document.activeElement).toBe(input);
  });

  it('shows the refresh warning beside the label and forwards Retry', () => {
    const fixture = TestBed.createComponent(TestHost);
    const state = fixture.componentInstance;
    state.warning.set(true);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>('#test-country')!;
    const warning = host.querySelector('.field-heading #test-country-warning')!;
    expect(warning.textContent).toContain('Country refresh unavailable');
    expect(input.getAttribute('aria-describedby')).toBe('test-country-warning');

    warning.querySelector('button')!.click();
    expect(state.retries()).toBe(1);

    state.warning.set(false);
    fixture.detectChanges();
    expect(host.querySelector('#test-country-warning')).toBeNull();
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });
});
