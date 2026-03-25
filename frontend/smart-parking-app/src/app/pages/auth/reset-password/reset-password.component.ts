import { AfterViewInit, Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
  standalone: false,
})
export class ResetPasswordComponent implements OnInit, AfterViewInit {
  resetPasswordForm: FormGroup;
  isLoading = false;
  isFormVisible = false;
  animateCar = false;
  token = '';

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private toastService: ToastService
  ) {
    this.resetPasswordForm = this.fb.group(
      {
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.animateCar = true;
    }, 100);
    setTimeout(() => {
      this.isFormVisible = true;
    }, 1350);
  }

  passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
    return group.get('password')?.value === group.get('confirmPassword')?.value ? null : { mismatch: true };
  }

  async onSubmit(): Promise<void> {
    if (!this.token) {
      this.toastService.show('Lien de réinitialisation invalide', 'error');
      return;
    }

    if (this.resetPasswordForm.invalid) {
      this.resetPasswordForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    try {
      const { password } = this.resetPasswordForm.value;
      const response = await firstValueFrom(this.authService.resetPassword(this.token, password));
      this.toastService.show(response?.msg || 'Mot de passe réinitialisé avec succès', 'success');
      await this.router.navigate(['/pages/auth/signin/form']);
    } catch (error: any) {
      this.toastService.show(
        error.error?.msg || error.error?.error || 'Erreur lors de la réinitialisation',
        'error'
      );
    } finally {
      this.isLoading = false;
    }
  }

  goToForgotPassword(): void {
    this.router.navigate(['/pages/auth/forgot-password']);
  }

  goToSignin(): void {
    this.router.navigate(['/pages/auth/signin/form']);
  }
}
