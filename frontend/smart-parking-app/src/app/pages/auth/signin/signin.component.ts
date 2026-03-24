import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-signin',
  templateUrl: './signin.component.html',
  styleUrls: ['./signin.component.scss'],
  standalone: false,
})
export class SigninComponent implements OnInit, AfterViewInit, OnDestroy {
  signinForm: FormGroup;
  isLoading = false;
  private animationFrame: number | null = null;
  private animationDone = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService
  ) {
    this.signinForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit() {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }
  }

  ngAfterViewInit() {
    if (!this.animationDone) {
      setTimeout(() => {
        this.startAnimation();
      }, 100);
    }
  }

  private startAnimation() {
    const revealLayer = document.getElementById('revealLayer');
    const carZipper = document.getElementById('carZipper');
    
    if (!revealLayer || !carZipper) return;
    carZipper.style.opacity = '1';
    const startX = window.innerWidth;
    const endX = -200;
    const duration = 4000;
    const startTime = performance.now();
    
    carZipper.style.transform = `translateX(${startX}px) translateY(-50%)`;
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      let progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentX = startX + (endX - startX) * easeProgress;
      
      carZipper.style.transform = `translateX(${currentX}px) translateY(-50%)`;
      
      const windowWidth = window.innerWidth;
      const carRightEdge = currentX + 140;
      let revealPercent = (carRightEdge / windowWidth) * 100;
      revealPercent = Math.min(Math.max(revealPercent, 0), 100);
      
      revealLayer.style.clipPath = `inset(0 ${100 - revealPercent}% 0 0)`;
      
      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        revealLayer.style.clipPath = 'inset(0 100% 0 0)'; 
        carZipper.style.opacity = '0';
        this.animationDone = true;
        if (this.animationFrame) {
          cancelAnimationFrame(this.animationFrame);
          this.animationFrame = null;
        }
      }
    };
    
    this.animationFrame = requestAnimationFrame(animate);
  }

  async onSubmit() {
    if (this.signinForm.valid) {
      this.isLoading = true;
      try {
        const { email, password } = this.signinForm.value;
        await this.authService.signin(email, password).toPromise();
        this.toastService.show('Connexion réussie ! Bienvenue sur PARKINI 🚗', 'success');
        this.router.navigate(['/dashboard']);
      } catch (error: any) {
        this.toastService.show(error.error?.error || 'Erreur de connexion', 'error');
      } finally {
        this.isLoading = false;
      }
    }
  }

  goToSignup() {
    this.router.navigate(['/pages/auth/signup']);
  }

  ngOnDestroy() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }
}