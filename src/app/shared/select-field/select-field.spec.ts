import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, required } from '@angular/forms/signals';
import { SelectField } from './select-field';

@Component({
  imports: [SelectField],
  template: `
    <app-select-field
      id="test-status"
      label="Status"
      placeholder="Search statuses"
      [options]="options"
      [field]="statusForm.status"
      [attempted]="attempted()"
      [externalError]="externalError()"
      (selectionChange)="selections.update((values) => [...values, $event])"
    />
  `,
})
class TestHost {
  readonly options = [
    { value: 'draft', label: 'Draft' },
    { value: 'approved', label: 'Approved' },
    { value: 'declined', label: 'Declined' },
  ];
  readonly model = signal({ status: '' });
  readonly statusForm = form(this.model, (path) => {
    required(path.status, { message: 'Select a status.' });
  });
  readonly attempted = signal(false);
  readonly externalError = signal('');
  readonly selections = signal<string[]>([]);
}

// The autocomplete panel renders in the CDK overlay, so options are looked up
// on `document`. The panel opens on typing only while the input is focused.
function type(input: HTMLInputElement, text: string): void {
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const optionLabels = () =>
  [...document.querySelectorAll<HTMLElement>('mat-option')].map((option) =>
    option.textContent?.trim(),
  );

describe('SelectField', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestHost] }).compileComponents();
  });

  it('labels one search input, filters options by text, and stores the picked value', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const host = root.querySelector('app-select-field')!;
    const input = host.querySelector('input')!;

    expect(host.id).toBe('');
    expect(root.querySelectorAll('#test-status')).toHaveLength(1);
    expect(input.labels?.[0]?.textContent).toBe('Status');
    expect(input.placeholder).toBe('Search statuses');
    expect(input.closest('mat-form-field')?.getAttribute('appearance')).toBe('outline');
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(host.querySelector('[role="alert"]')).toBeNull();

    type(input, 'd');
    fixture.detectChanges();
    expect(optionLabels()).toEqual(['Draft', 'Approved', 'Declined']);
    type(input, 'de');
    fixture.detectChanges();
    expect(optionLabels()).toEqual(['Declined']);
    type(input, 'zzz');
    fixture.detectChanges();
    expect(optionLabels()).toEqual(['No matches']);
    expect(fixture.componentInstance.model().status).toBe('');

    type(input, 'app');
    fixture.detectChanges();
    document.querySelector<HTMLElement>('mat-option')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.model().status).toBe('approved');
    expect(fixture.componentInstance.selections()).toEqual(['approved']);
    expect(input.value).toBe('Approved');
    // Refocusing a selected value reopens the panel with everything listed.
    input.blur();
    input.focus();
    fixture.detectChanges();
    expect(optionLabels()).toEqual(['Draft', 'Approved', 'Declined']);
  });

  it('reverts unpicked text to the selection when the panel closes', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.componentInstance.model.set({ status: 'draft' });
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    expect(input.value).toBe('Draft');

    type(input, 'Dec');
    fixture.detectChanges();
    // Material's trigger reads `keyCode`, which jsdom leaves at 0 unless given.
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
    );
    fixture.detectChanges();
    expect(input.value).toBe('Draft');
    expect(fixture.componentInstance.model().status).toBe('draft');

    // Leaving the field with the panel closed reverts too and marks it touched.
    // (The panel only opens for typing while the input is focused.)
    input.blur();
    input.value = 'nonsense';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    fixture.detectChanges();
    expect(input.value).toBe('Draft');
    expect(fixture.componentInstance.statusForm.status().touched()).toBe(true);
  });

  it('shows first schema error after leaving the field or a submit attempt and clears it when valid', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector('input')!;
    const error = () => host.querySelector('#test-status-error');

    fixture.componentInstance.attempted.set(true);
    fixture.detectChanges();
    expect(error()?.textContent?.trim()).toBe('Select a status.');
    expect(error()?.getAttribute('role')).toBe('alert');
    expect(input.getAttribute('aria-describedby')).toBe('test-status-error');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fixture.componentInstance.attempted.set(false);
    fixture.detectChanges();
    expect(error()).toBeNull();

    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    fixture.detectChanges();
    expect(error()?.textContent?.trim()).toBe('Select a status.');

    fixture.componentInstance.model.set({ status: 'draft' });
    fixture.detectChanges();
    expect(error()).toBeNull();
    expect(input.value).toBe('Draft');
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('shows external error immediately and prefers it over schema error', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.componentInstance.externalError.set('Select an existing status.');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector('input')!;
    expect(host.querySelector('#test-status-error')?.textContent?.trim()).toBe(
      'Select an existing status.',
    );
    expect(input.getAttribute('aria-describedby')).toBe('test-status-error');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fixture.componentInstance.externalError.set('');
    fixture.detectChanges();
    expect(host.querySelector('#test-status-error')).toBeNull();
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });
});
