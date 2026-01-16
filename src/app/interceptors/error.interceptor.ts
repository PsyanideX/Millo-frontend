import { HttpErrorResponse, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from '../services/notification.service';

export function errorInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  const notificationService = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'Ha ocurrido un error inesperado';

      if (error.error instanceof ErrorEvent) {
        // Client-side error
        errorMessage = error.error.message;
      } else {
        // Server-side error
        if (error.status === 401) {
          errorMessage = 'Sesión expirada o no autorizada';
        } else if (error.status === 404) {
          errorMessage = 'Recurso no encontrado';
        } else if (error.error && error.error.message) {
          errorMessage = error.error.message;
        } else if (typeof error.error === 'string') {
          errorMessage = error.error;
        }
      }

      notificationService.error(errorMessage);
      return throwError(() => error);
    })
  );
}
