import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatAutocomplete, MatOption } from '@angular/material/autocomplete';
import { SearchField } from './search-field';

@Component({
  imports: [SearchField, MatAutocomplete, MatOption],
  template: `
    <app-search-field
      id="test-search"
      label="Search"
      placeholder="Find item"
      [value]="value()"
      [required]="true"
      [disabled]="disabled()"
      [error]="error()"
      [extraDescribedby]="hintVisible() ? 'test-hint' : null"
      (input)="inputCount.update((count) => count + 1)"
    >
      @if (hintVisible()) {
        <span fieldFeedback id="test-hint">Start typing</span>
      }
      <mat-autocomplete><mat-option value="one">One</mat-option></mat-autocomplete>
      <button fieldSuffix type="button">Clear</button>
    </app-search-field>
  `,
})
class TestHost {
  readonly search = viewChild.required(SearchField);
  readonly value = signal('Initial');
  readonly disabled = signal(false);
  readonly error = signal('');
  readonly hintVisible = signal(false);
  readonly inputCount = signal(0);
}

describe('SearchField', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestHost] }).compileComponents();
  });

  it('associates label, forwards inputs, and projects autocomplete and suffix', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const host = (fixture.nativeElement as HTMLElement).querySelector('app-search-field')!;
    const input = host.querySelector('input')!;

    expect(host.id).toBe('');
    expect(host.querySelectorAll('#test-search')).toHaveLength(1);
    expect(input.labels?.[0]?.textContent).toBe('Search');
    expect(input.placeholder).toBe('Find item');
    expect(input.value).toBe('Initial');
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
    expect(input.closest('mat-form-field')?.getAttribute('appearance')).toBe('outline');
    expect(getComputedStyle(input.closest('mat-form-field')!).display).toBe('flex');
    const autocomplete = fixture.debugElement.query(By.directive(MatAutocomplete))
      .componentInstance as MatAutocomplete;
    expect(autocomplete.options.length).toBe(1);
    // The button must land in Material's suffix slot, not merely exist somewhere
    // inside the field. That is what keeps it on the input's row.
    expect(host.querySelector('.mat-mdc-form-field-icon-suffix [fieldSuffix]')?.textContent).toBe(
      'Clear',
    );

    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(fixture.componentInstance.inputCount()).toBe(1);
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    expect(input.disabled).toBe(true);
  });

  it('combines visible error and projected hint in accessible description', () => {
    const fixture = TestBed.createComponent(TestHost);
    const state = fixture.componentInstance;
    state.error.set('Choose an item.');
    state.hintVisible.set(true);
    fixture.detectChanges();
    const host = (fixture.nativeElement as HTMLElement).querySelector('app-search-field')!;
    const input = host.querySelector('input')!;

    expect(host.querySelector('#test-search-error')?.textContent?.trim()).toBe('Choose an item.');
    expect(host.querySelector('#test-search-error')?.getAttribute('role')).toBe('alert');
    expect(host.querySelector('.field-heading #test-hint')?.textContent).toBe('Start typing');
    expect(input.getAttribute('aria-describedby')).toBe('test-search-error test-hint');
    // `matInput` owns aria-invalid; the error must reach its errorState too.
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.closest('mat-form-field')?.classList.contains('mat-form-field-invalid')).toBe(
      true,
    );

    state.error.set('');
    fixture.detectChanges();
    expect(host.querySelector('#test-search-error')).toBeNull();
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('test-hint');
    state.hintVisible.set(false);
    fixture.detectChanges();
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('focuses the native input on request', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    fixture.componentInstance.search().focus();
    expect(document.activeElement).toBe(
      (fixture.nativeElement as HTMLElement).querySelector('input'),
    );
  });
});
