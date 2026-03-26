import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick, waitForAsync } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { throwError, of } from 'rxjs';

import { SigninComponent } from './signin.component';
import { AuthService, User } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

describe('SigninComponent', () => {
  let component: SigninComponent;
  let fixture: ComponentFixture<SigninComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let toastService: jasmine.SpyObj<ToastService>;
  let router: Router;

  beforeEach(waitForAsync(() => {
    authService = jasmine.createSpyObj<AuthService>('AuthService', [
      'isAuthenticated',
      'signin',
      'getCurrentUser',
    ]);
    toastService = jasmine.createSpyObj<ToastService>('ToastService', ['show']);

    authService.isAuthenticated.and.returnValue(false);
    authService.signin.and.returnValue(of({}));
    authService.getCurrentUser.and.returnValue(null);

    TestBed.configureTestingModule({
      declarations: [SigninComponent],
      imports: [ReactiveFormsModule, RouterTestingModule],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ToastService, useValue: toastService },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);

    fixture = TestBed.createComponent(SigninComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should mark all controls as touched when submitting an invalid form', fakeAsync(() => {
    component.onSubmit();
    tick();

    expect(component.signinForm.get('email')?.touched).toBeTrue();
    expect(component.signinForm.get('password')?.touched).toBeTrue();
    expect(authService.signin).not.toHaveBeenCalled();
  }));

  it('should render validation messages for email and password', () => {
    component.signinForm.get('email')?.setValue('bad-email');
    component.signinForm.get('email')?.markAsTouched();
    component.signinForm.get('password')?.setValue('123');
    component.signinForm.get('password')?.markAsTouched();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Email valide requis');
    expect(text).toContain('Minimum 6 caracteres');
  });

  it('should sign in and redirect owners to /owner/dashboard', fakeAsync(() => {
    const owner: User = { id: 1, nom: 'Owner', email: 'owner@test.com', role: 'owner' };
    authService.signin.and.returnValue(of({}));
    authService.getCurrentUser.and.returnValue(owner);
    component.signinForm.setValue({ email: 'owner@test.com', password: 'secret1' });

    component.onSubmit();
    tick();

    expect(authService.signin).toHaveBeenCalledWith('owner@test.com', 'secret1');
    expect(toastService.show).toHaveBeenCalledWith('Connexion reussie ! Bienvenue sur PARKINI', 'success');
    expect(router.navigate).toHaveBeenCalledWith(['/owner/dashboard']);
    expect(component.isLoading).toBeFalse();
  }));

  it('should sign in and redirect drivers to /dashboard', fakeAsync(() => {
    const driver: User = { id: 2, nom: 'Driver', email: 'driver@test.com', role: 'conducteur' };
    authService.getCurrentUser.and.returnValue(driver);
    component.signinForm.setValue({ email: 'driver@test.com', password: 'secret1' });

    component.onSubmit();
    tick();

    expect(authService.signin).toHaveBeenCalledWith('driver@test.com', 'secret1');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  }));

  it('should show an error toast when sign in fails', fakeAsync(() => {
    authService.signin.and.returnValue(
      throwError(() => ({
        error: { msg: 'Identifiants invalides' },
      }))
    );
    component.signinForm.setValue({ email: 'user@test.com', password: 'secret1' });

    component.onSubmit();
    tick();

    expect(toastService.show).toHaveBeenCalledWith('Identifiants invalides', 'error');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.isLoading).toBeFalse();
  }));

  it('should redirect authenticated users on init based on role', () => {
    const owner: User = { id: 3, nom: 'Owner', email: 'owner@test.com', role: 'owner' };
    authService.isAuthenticated.and.returnValue(true);
    authService.getCurrentUser.and.returnValue(owner);

    component.ngOnInit();

    expect(router.navigate).toHaveBeenCalledWith(['/owner/dashboard']);
  });
});
