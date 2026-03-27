import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isHandlingUnauthorized = false;

  constructor(
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 && !this.isAuthRoute(req.url) && !this.isHandlingUnauthorized) {
          this.isHandlingUnauthorized = true;
          this.toastService.show('Session expiree. Reconnectez-vous pour continuer.', 'error');
          this.authService.logout();
          setTimeout(() => {
            this.isHandlingUnauthorized = false;
          }, 0);
        }

        return throwError(() => error);
      })
    );
  }

  private isAuthRoute(url: string): boolean {
    return url.includes('/api/auth/login') || url.includes('/api/auth/register');
  }
}
