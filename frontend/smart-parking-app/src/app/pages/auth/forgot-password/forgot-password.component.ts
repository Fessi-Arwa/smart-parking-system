import { AfterViewInit, Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
  standalone: false,
})
export class ForgotPasswordComponent implements AfterViewInit {
  forgotPasswordForm: FormGroup;
  isLoading = false;
  isFormVisible = false;
  animateCar = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService
  ) {
    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
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
    if (this.forgotPasswordForm.invalid) {
      this.forgotPasswordForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    try {
      const { email } = this.forgotPasswordForm.value;
      const response = await firstValueFrom(this.authService.forgotPassword(email));
      if (response?.reset_token) {
        this.toastService.show('Lien de réinitialisation généré.', 'success');
        await this.router.navigate(['/pages/auth/reset-password'], {
          queryParams: { token: response.reset_token },
        });
      } else {
        this.toastService.show(
          response?.msg || 'Si un compte existe avec cet email, les instructions ont été envoyées.',
          'success'
        );
        await this.router.navigate(['/pages/auth/signin/form']);
      }
    } catch (error: any) {
      this.toastService.show(
        error.error?.msg || error.error?.error || 'Erreur lors de la demande de réinitialisation',
        'error'
      );
    } finally {
      this.isLoading = false;
    }
  }

  goToSignin(): void {
    this.router.navigate(['/pages/auth/signin/form']);
  }
}
