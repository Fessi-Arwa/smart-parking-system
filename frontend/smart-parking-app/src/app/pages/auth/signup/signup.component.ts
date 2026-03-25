import { AfterViewInit, Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss'],
  standalone: false,
})
export class SignupComponent implements OnInit, AfterViewInit {
  signupForm: FormGroup;
  isLoading = false;
  isFormVisible = false;
  animateCar = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService
  ) {
    this.signupForm = this.fb.group(
      {
        username: ['', [Validators.required, Validators.minLength(3)]],
        phone: ['', [Validators.pattern(/^\+?[0-9\s-]{8,20}$/)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
        role: ['conducteur', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  passwordMatchValidator(g: AbstractControl): ValidationErrors | null {
    return g.get('password')?.value === g.get('confirmPassword')?.value ? null : { mismatch: true };
  }

  ngOnInit() {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/owner/dashboard']);
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.animateCar = true;
    }, 100);
    setTimeout(() => {
      this.isFormVisible = true;
    }, 1350);
  }

  async onSubmit(): Promise<void> {
    if (this.signupForm.invalid) {
      this.signupForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    try {
      const { username, phone, email, password, role } = this.signupForm.value;
      await firstValueFrom(this.authService.signup(username, email, password, phone, role));
      this.toastService.show("Inscription reussie ! Bienvenue sur PARKINI", 'success');
      await this.router.navigate([
        role === 'owner' ? '/pages/auth/onboarding/owner' : '/pages/auth/onboarding/driver',
      ]);
    } catch (error: any) {
      this.toastService.show(error.error?.msg || error.error?.error || "Erreur d'inscription", 'error');
    } finally {
      this.isLoading = false;
    }
  }

  selectRole(role: 'conducteur' | 'owner'): void {
    this.signupForm.get('role')?.setValue(role);
    this.signupForm.get('role')?.markAsTouched();
  }

  goToSignin(): void {
    this.router.navigate(['/pages/auth/signin/form']);
  }
}
