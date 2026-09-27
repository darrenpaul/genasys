import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, required } from '@angular/forms/signals';
import { TextField } from './text-field';

@Component({
  imports: [TextField],
  template: `
    <app-text-field
      id="test-name"
      label="Name"
      placeholder="Enter name"
      type="text"
      autocomplete="given-name"
      inputmode="text"
      [field]="nameForm.name"
      [attempted]="attempted()"
      [externalError]="externalError()"
      (input)="inputCount.update((count) => count + 1)"
    />
  `,
})
class TestHost {
  readonly model = signal({ name: '' });
  readonly nameForm = form(this.model, (path) => {
    required(path.name, { message: 'Name is required.' });
  });
  readonly attempted = signal(false);
  readonly externalError = signal('');
  readonly inputCount = signal(0);
}

describe('TextField', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestHost] }).compileComponents();
  });

  it('links label to one input and forwards input attributes', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const host = root.querySelector('app-text-field')!;
    const input = host.querySelector('input')!;

    expect(host.id).toBe('');
    expect(root.querySelectorAll('#test-name')).toHaveLength(1);
    expect(input.labels?.[0]?.textContent).toBe('Name');
    expect(input.placeholder).toBe('Enter name');
    expect(input.type).toBe('text');
    expect(input.autocomplete).toBe('given-name');
    expect(input.inputMode).toBe('text');
    expect(input.closest('mat-form-field')?.getAttribute('appearance')).toBe('outline');
    expect(getComputedStyle(input.closest('mat-form-field')!).display).toBe('flex');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows first schema error after touch or submit attempt and clears it when valid', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector('input')!;
    const error = () => host.querySelector('#test-name-error');

    fixture.componentInstance.attempted.set(true);
    fixture.detectChanges();
    expect(error()?.textContent?.trim()).toBe('Name is required.');
    fixture.componentInstance.attempted.set(false);
    fixture.detectChanges();
    expect(error()).toBeNull();

    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(error()?.textContent?.trim()).toBe('Name is required.');
    expect(error()?.getAttribute('role')).toBe('alert');
    expect(input.getAttribute('aria-describedby')).toBe('test-name-error');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    input.value = 'Amina';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.model().name).toBe('Amina');
    expect(fixture.componentInstance.inputCount()).toBe(1);
    expect(error()).toBeNull();
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('shows external error immediately and prefers it over schema error', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.componentInstance.externalError.set('Name already taken.');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector('input')!;
    expect(host.querySelector('#test-name-error')?.textContent?.trim()).toBe('Name already taken.');
    expect(input.getAttribute('aria-describedby')).toBe('test-name-error');

    fixture.componentInstance.externalError.set('');
    fixture.detectChanges();
    expect(host.querySelector('#test-name-error')).toBeNull();
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });
});
