import { AfterViewInit, Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { OwnerWorkflowService } from '../../../services/owner-workflow.service';
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
    private ownerWorkflowService: OwnerWorkflowService,
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
      void this.redirectAuthenticatedUser();
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
      this.toastService.show(this.getAuthErrorMessage(error, "Erreur d'inscription"), 'error');
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

  private async redirectAuthenticatedUser(): Promise<void> {
    const user = this.authService.getCurrentUser();

    if (user?.role === 'owner') {
      const route = await this.ownerWorkflowService.resolveEntryRoute();
      await this.router.navigateByUrl(route);
      return;
    }

    if (user?.role === 'admin') {
      await this.router.navigate(['/admin']);
      return;
    }

    await this.router.navigate(['/dashboard']);
  }

  private getAuthErrorMessage(error: any, fallback: string): string {
    if (error?.status === 0) {
      return "API indisponible. Verifie que le backend Flask tourne et que DATABASE_URL est configuree.";
    }

    if (typeof error?.error === 'string' && error.error.includes('<!doctype html>')) {
      return "Erreur serveur backend. Verifie le demarrage du serveur et la configuration Supabase.";
    }

    return error?.error?.msg || error?.error?.error || fallback;
  }
}
